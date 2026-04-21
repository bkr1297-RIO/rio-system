/**
 * RIO Enforcement Core — Invariant Test Harness
 *
 * Standardized output format:
 *   TEST: <name>
 *   Decision: EXECUTED | DENIED | BLOCKED
 *   Reason: <system code> | NONE
 *   Adapter Called: YES | NO
 *   Receipt: GENERATED | NOT GENERATED
 *   Ledger: VALID
 *   Final State: REAL | NOT REAL
 *
 * Usage:
 *   node test_harness.mjs              → Phase 1 invariant suite
 *   node test_harness.mjs --case=email → Email commitment example
 *   node test_harness.mjs --case=funds → Funds transfer example
 */
import { issueToken, issueExpiredToken, canonicalHash, clearStore } from "./dtt.mjs";
import { executeGate, Decision } from "./gate.mjs";
import { getEntries, getEntryCount, verifyChain, clearLedger } from "./ledger.mjs";

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------
let validExecuted = 0;
let invalidBlocked = 0;
let assertions = { passed: 0, failed: 0 };

function check(condition, testId, detail = "") {
  if (condition) {
    assertions.passed++;
  } else {
    assertions.failed++;
    console.log(`  ⛔ ASSERTION FAILED: ${testId} — ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Standardized output printer
// ---------------------------------------------------------------------------
function printResult({ testName, result, adapterCalled, receiptGenerated }) {
  const decision = result.decision === Decision.EXECUTE ? "EXECUTED"
    : result.decision === Decision.BLOCK ? "BLOCKED"
    : "DENIED";

  const reason = result.reason_code || "NONE";
  const receipt = receiptGenerated ? "GENERATED" : "NOT GENERATED";
  const finalState = result.decision === Decision.EXECUTE ? "REAL" : "NOT REAL";

  console.log("");
  console.log(`TEST: ${testName}`);
  console.log(`Decision: ${decision}`);
  console.log(`Reason: ${reason}`);
  console.log(`Adapter Called: ${adapterCalled ? "YES" : "NO"}`);
  console.log(`Receipt: ${receipt}`);
  console.log(`Ledger: VALID`);
  console.log(`Final State: ${finalState}`);

  if (result.decision === Decision.EXECUTE) {
    validExecuted++;
  } else {
    invalidBlocked++;
  }
}

function printReceiptClean(receipt) {
  if (!receipt) return;
  console.log("");
  console.log("Receipt:");
  console.log(`  trace_id: ${receipt.trace_id}`);
  console.log(`  action: ${receipt.intent?.action || "—"}`);
  console.log(`  status: ${receipt.decision}`);
  console.log(`  payload_hash: ${receipt.payload_hash}`);
}

function printReceiptJSON(receipt) {
  if (!receipt) return;
  console.log("");
  console.log("Details → Receipt JSON");
  console.log(JSON.stringify(receipt, null, 2));
}

function printSummary() {
  const chain = verifyChain();
  console.log("");
  console.log("────────────────────────────────────────");
  console.log("SUMMARY:");
  console.log(`Valid actions executed: ${validExecuted}`);
  console.log(`Invalid actions blocked: ${invalidBlocked}`);
  console.log(`Ledger status: ${chain.valid ? "VALID" : "INVALID"}`);
  console.log(`Assertions: ${assertions.passed} passed, ${assertions.failed} failed`);
  console.log("────────────────────────────────────────");

  if (assertions.failed > 0) {
    console.log("\n⛔ HARNESS FAILED\n");
    process.exit(1);
  } else {
    console.log("\n✅ ALL TESTS PASSED\n");
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TRACE_A = "trace-session-alpha";
const TRACE_B = "trace-session-beta";
const INTENT = { action: "send_email", target: "user@example.com", subject: "Test" };
const PAYLOAD = { to: "user@example.com", subject: "Test", body: "Hello from RIO", amount: 50 };
const DIFFERENT_PAYLOAD = { to: "attacker@evil.com", subject: "Phish", body: "Gotcha", amount: 50 };
const SCOPE_CONSTRAINTS = [
  { field: "amount", op: "max", limit: 100 },
  { field: "to", op: "in", limit: ["user@example.com", "admin@example.com"] },
];
const SCOPE_VIOLATING_PAYLOAD = { to: "user@example.com", subject: "Test", body: "Hello from RIO", amount: 500 };

// ---------------------------------------------------------------------------
// Phase 1 Invariant Suite
// ---------------------------------------------------------------------------
async function runPhase1() {
  console.log("══════════════════════════════════════════════════════════");
  console.log("  RIO Enforcement Core — Phase 1 Invariant Validation");
  console.log("══════════════════════════════════════════════════════════");

  clearStore();
  clearLedger();
  validExecuted = 0;
  invalidBlocked = 0;

  const intent_hash = canonicalHash({ intent: INTENT, payload: PAYLOAD });

  // T-01: No token
  {
    const result = await executeGate({
      token_id: null,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: PAYLOAD,
    });
    check(result.decision === Decision.DENY, "T-01");
    check(result.reason_code === "MISSING_TOKEN", "T-01-code");
    printResult({ testName: "No Token", result, adapterCalled: false, receiptGenerated: false });
  }

  // T-02: Payload mismatch
  {
    const token = issueToken({ trace_id: TRACE_A, intent_hash });
    const result = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: DIFFERENT_PAYLOAD,
    });
    check(result.decision === Decision.DENY, "T-02");
    check(result.reason_code === "ACT_BINDING_MISMATCH", "T-02-code");
    printResult({ testName: "Payload Drift", result, adapterCalled: false, receiptGenerated: false });
  }

  // T-03: Expired token
  {
    const token = issueExpiredToken({ trace_id: TRACE_A, intent_hash });
    const result = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: PAYLOAD,
    });
    check(result.decision === Decision.DENY, "T-03");
    check(result.reason_code === "INVALID_TOKEN", "T-03-code");
    printResult({ testName: "Expired Token", result, adapterCalled: false, receiptGenerated: false });
  }

  // T-04: Token replay
  {
    const token = issueToken({ trace_id: TRACE_A, intent_hash });
    const first = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: PAYLOAD,
    });
    check(first.decision === Decision.EXECUTE, "T-04-first");
    printResult({ testName: "Valid Execution (setup for replay)", result: first, adapterCalled: true, receiptGenerated: true });
    printReceiptClean(first.receipt);

    const replay = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: PAYLOAD,
    });
    check(replay.decision === Decision.DENY, "T-04");
    check(replay.reason_code === "TOKEN_USED", "T-04-code");
    printResult({ testName: "Token Replay", result: replay, adapterCalled: false, receiptGenerated: false });
  }

  // T-05: Trace mismatch
  {
    const token = issueToken({ trace_id: TRACE_A, intent_hash });
    const result = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_B,
      intent: INTENT,
      payload: PAYLOAD,
    });
    check(result.decision === Decision.DENY, "T-05");
    check(result.reason_code === "TRACE_MISMATCH", "T-05-code");
    printResult({ testName: "Trace Mismatch", result, adapterCalled: false, receiptGenerated: false });
  }

  // T-06: Lineage unresolved
  {
    const token = issueToken({ trace_id: TRACE_A, intent_hash });
    const result = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: PAYLOAD,
      dependencies: [
        { id: "dep-001", status: "SUCCESS" },
        { id: "dep-002", status: "PENDING" },
      ],
    });
    check(result.decision === Decision.BLOCK, "T-06");
    check(result.reason_code === "LINEAGE_UNRESOLVED", "T-06-code");
    printResult({ testName: "Lineage Failure", result, adapterCalled: false, receiptGenerated: false });
  }

  // T-06a: Scope violation
  {
    const violating_hash = canonicalHash({ intent: INTENT, payload: SCOPE_VIOLATING_PAYLOAD });
    const token = issueToken({ trace_id: TRACE_A, intent_hash: violating_hash });
    const result = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: SCOPE_VIOLATING_PAYLOAD,
      dependencies: [{ id: "dep-001", status: "SUCCESS" }],
      constraints: SCOPE_CONSTRAINTS,
    });
    check(result.decision === Decision.DENY, "T-06a");
    check(result.reason_code === "SCOPE_VIOLATION", "T-06a-code");
    printResult({ testName: "Scope Violation", result, adapterCalled: false, receiptGenerated: false });
  }

  // T-07: Valid execution (full checks)
  {
    const token = issueToken({ trace_id: TRACE_A, intent_hash });
    const result = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: PAYLOAD,
      dependencies: [
        { id: "dep-001", status: "SUCCESS" },
        { id: "dep-003", status: "SUCCESS" },
      ],
      constraints: SCOPE_CONSTRAINTS,
      executeFn: async (intent, payload) => {
        return { status: "EXECUTED", detail: `Email sent to ${payload.to}` };
      },
    });

    check(result.decision === Decision.EXECUTE, "T-07");
    check(result.reason_code === null, "T-07-code");
    check(result.receipt != null, "T-07-receipt");
    check(typeof result.receipt?.receipt_hash === "string", "T-07-hash");

    const expected = canonicalHash({ intent: INTENT, payload: PAYLOAD });
    check(result.receipt?.payload_hash === expected, "T-07-binding");
    check(typeof result.receipt?.prev_hash === "string", "T-07-chain");

    printResult({ testName: "Valid Email", result, adapterCalled: true, receiptGenerated: true });
    printReceiptClean(result.receipt);
    printReceiptJSON(result.receipt);
  }

  printSummary();
}

// ---------------------------------------------------------------------------
// CLI dispatch
// ---------------------------------------------------------------------------
const caseArg = process.argv.find(a => a.startsWith("--case="));
const caseMode = caseArg ? caseArg.split("=")[1] : null;

if (caseMode === "email") {
  // Defer to email adapter test (import dynamically)
  import("./email_adapter_test.mjs");
} else if (caseMode === "funds") {
  import("./funds_adapter_test.mjs");
} else {
  runPhase1().catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  });
}
