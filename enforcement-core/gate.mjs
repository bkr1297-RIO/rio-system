/**
 * RIO Enforcement Core — Execution Gate
 *
 * Six checks, in order. If any fails → DENY or BLOCK (fail-closed).
 *
 *   1. TOKEN_PRESENT     → MISSING_TOKEN
 *   2. TOKEN_VALID        → INVALID_TOKEN | TOKEN_USED
 *   3. TRACE_MATCH        → TRACE_MISMATCH
 *   4. INTENT_BINDING     → ACT_BINDING_MISMATCH
 *   5. LINEAGE_RESOLVED   → LINEAGE_UNRESOLVED
 *   6. SCOPE_VALID         → SCOPE_VIOLATION
 *
 * If all pass → EXECUTE
 *
 * No execution path may bypass this gate.
 * No component may execute directly.
 * No implicit approvals.
 * No fallback behavior.
 */
import { validateToken, consumeToken, canonicalHash } from "./dtt.mjs";
import { writeReceipt } from "./ledger.mjs";

// ---------------------------------------------------------------------------
// Decision enum
// ---------------------------------------------------------------------------
export const Decision = Object.freeze({
  EXECUTE: "EXECUTE",
  DENY:    "DENY",
  BLOCK:   "BLOCK",
});

// ---------------------------------------------------------------------------
// Lineage resolver
// ---------------------------------------------------------------------------
/**
 * Check that all dependencies are resolved (not PENDING or FAILURE).
 * @param {Array<{id: string, status: string}>} dependencies
 * @returns {{ resolved: boolean, blocking: Array<{id: string, status: string}> }}
 */
function checkLineage(dependencies) {
  if (!dependencies || dependencies.length === 0) {
    return { resolved: true, blocking: [] };
  }
  const blocking = dependencies.filter(
    (d) => d.status === "PENDING" || d.status === "FAILURE"
  );
  return { resolved: blocking.length === 0, blocking };
}

// ---------------------------------------------------------------------------
// Scope / constraint checker
// ---------------------------------------------------------------------------
/**
 * Check that the payload satisfies all scope constraints.
 * @param {object} payload
 * @param {Array<{field: string, op: string, limit: *}>} constraints
 * @returns {string|null} violation description, or null if all pass
 */
function checkScope(payload, constraints) {
  if (!constraints || constraints.length === 0) return null;

  for (const c of constraints) {
    const value = payload[c.field];
    if (value === undefined) {
      return `Constraint field "${c.field}" not found in payload`;
    }

    switch (c.op) {
      case "max":
        if (typeof value === "number" && value > c.limit) {
          return `${c.field} = ${value} exceeds max ${c.limit}`;
        }
        break;
      case "min":
        if (typeof value === "number" && value < c.limit) {
          return `${c.field} = ${value} below min ${c.limit}`;
        }
        break;
      case "in":
        if (Array.isArray(c.limit) && !c.limit.includes(value)) {
          return `${c.field} = "${value}" not in allowed list [${c.limit.join(", ")}]`;
        }
        break;
      case "eq":
        if (value !== c.limit) {
          return `${c.field} = "${value}" does not equal required "${c.limit}"`;
        }
        break;
      default:
        return `Unknown constraint operator: ${c.op}`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Execution Gate
// ---------------------------------------------------------------------------
/**
 * @param {object} request
 * @param {string}  request.token_id      — DTT token
 * @param {string}  request.trace_id      — trace/session ID
 * @param {object}  request.intent        — the intent object
 * @param {object}  request.payload       — the execution payload
 * @param {Array}   [request.dependencies] — [{id, status}] lineage deps
 * @param {Array}   [request.constraints]  — [{field, op, limit}] scope constraints
 * @param {function} [request.executeFn]  — the function to run if authorized
 * @returns {object} gate result with decision, reason_code, receipt
 */
export async function executeGate(request) {
  const {
    token_id,
    trace_id,
    intent,
    payload,
    dependencies = [],
    constraints = [],
    executeFn = null,
  } = request;

  const timestamp = new Date().toISOString();

  // Compute the intent_hash the same way the token was issued
  const intent_hash = canonicalHash({ intent, payload });

  // -----------------------------------------------------------------------
  // CHECK 1: TOKEN_PRESENT
  // -----------------------------------------------------------------------
  if (!token_id) {
    const result = {
      decision: Decision.DENY,
      reason_code: "MISSING_TOKEN",
      detail: "No execution token provided",
      trace_id: trace_id || null,
      timestamp,
    };
    writeReceipt({ ...result, intent, payload_hash: intent_hash });
    return result;
  }

  // -----------------------------------------------------------------------
  // CHECKS 2–4: TOKEN_VALID, TRACE_MATCH, INTENT_BINDING
  // (delegated to DTT module — returns first failure)
  // -----------------------------------------------------------------------
  const tokenCheck = validateToken(token_id, trace_id, intent_hash);
  if (!tokenCheck.valid) {
    const result = {
      decision: Decision.DENY,
      reason_code: tokenCheck.reason_code,
      detail: tokenCheck.detail,
      trace_id,
      timestamp,
    };
    writeReceipt({ ...result, intent, payload_hash: intent_hash });
    return result;
  }

  // -----------------------------------------------------------------------
  // CHECK 5: LINEAGE_RESOLVED
  // -----------------------------------------------------------------------
  const lineage = checkLineage(dependencies);
  if (!lineage.resolved) {
    const result = {
      decision: Decision.BLOCK,
      reason_code: "LINEAGE_UNRESOLVED",
      detail: `Blocking dependencies: ${lineage.blocking.map((d) => `${d.id}(${d.status})`).join(", ")}`,
      trace_id,
      timestamp,
    };
    writeReceipt({ ...result, intent, payload_hash: intent_hash });
    return result;
  }

  // -----------------------------------------------------------------------
  // CHECK 6: SCOPE_VALID (constraint enforcement)
  // -----------------------------------------------------------------------
  const scopeViolation = checkScope(payload, constraints);
  if (scopeViolation) {
    const result = {
      decision: Decision.DENY,
      reason_code: "SCOPE_VIOLATION",
      detail: scopeViolation,
      trace_id,
      timestamp,
    };
    writeReceipt({ ...result, intent, payload_hash: intent_hash });
    return result;
  }

  // -----------------------------------------------------------------------
  // ALL CHECKS PASSED — CONSUME TOKEN AND EXECUTE
  // -----------------------------------------------------------------------
  const consumed = consumeToken(token_id);
  if (!consumed) {
    // Race condition safety — token was consumed between validate and consume
    const result = {
      decision: Decision.DENY,
      reason_code: "TOKEN_USED",
      detail: "Token was consumed between validation and execution (race)",
      trace_id,
      timestamp,
    };
    writeReceipt({ ...result, intent, payload_hash: intent_hash });
    return result;
  }

  // Write PENDING record before execution
  const pendingEntry = writeReceipt({
    decision: "PENDING",
    reason_code: null,
    detail: "Execution in progress",
    trace_id,
    intent,
    payload_hash: intent_hash,
    timestamp,
  });

  // Execute
  let execution_result = null;
  let execution_error = null;
  try {
    if (executeFn) {
      execution_result = await executeFn(intent, payload);
    } else {
      execution_result = { status: "EXECUTED", detail: "No-op executor (test mode)" };
    }
  } catch (err) {
    execution_error = err.message || String(err);
  }

  // Write final record
  const finalDecision = execution_error ? "FAILURE" : Decision.EXECUTE;
  const finalResult = {
    decision: finalDecision,
    reason_code: execution_error ? "EXECUTION_FAILURE" : null,
    detail: execution_error || (execution_result?.detail ?? "Executed successfully"),
    trace_id,
    intent,
    payload_hash: intent_hash,
    execution_result: execution_error ? null : execution_result,
    timestamp: new Date().toISOString(),
  };

  const receipt = writeReceipt(finalResult);

  return {
    decision: finalResult.decision,
    reason_code: finalResult.reason_code,
    detail: finalResult.detail,
    trace_id,
    timestamp: finalResult.timestamp,
    execution_result: finalResult.execution_result,
    receipt,
  };
}
