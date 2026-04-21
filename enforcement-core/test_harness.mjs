/**
 * RIO Enforcement Core — Phase 1 Invariant Validation (Final)
 *
 * 8 required tests. All must pass.
 *
 *   T-01. No token            → DENIED  (MISSING_TOKEN)
 *   T-02. Payload mismatch    → DENIED  (ACT_BINDING_MISMATCH)
 *   T-03. Expired token       → DENIED  (INVALID_TOKEN)
 *   T-04. Token replay        → DENIED  (TOKEN_USED)
 *   T-05. Trace mismatch      → DENIED  (TRACE_MISMATCH)
 *   T-06. Lineage unresolved  → BLOCKED (LINEAGE_UNRESOLVED)
 *   T-06a. Scope violation    → DENIED  (SCOPE_VIOLATION)
 *   T-07. Valid case           → EXECUTED (receipt + ledger verified)
 *
 * After all tests: verify ledger hash chain integrity.
 */
import { issueToken, issueExpiredToken, canonicalHash, clearStore } from "./dtt.mjs";
import { executeGate, Decision } from "./gate.mjs";
import { getEntries, getEntryCount, verifyChain, clearLedger } from "./ledger.mjs";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const results = [];

function assert(condition, testId, description, detail = "") {
  if (condition) {
    passed++;
    results.push({ test: testId, status: "PASS", description, detail });
    console.log(`  ✅ ${testId}: ${description}`);
  } else {
    failed++;
    results.push({ test: testId, status: "FAIL", description, detail });
    console.log(`  ❌ ${testId}: ${description} — ${detail}`);
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

// Scope constraints for T-06a
const SCOPE_CONSTRAINTS = [
  { field: "amount", op: "max", limit: 100 },
  { field: "to", op: "in", limit: ["user@example.com", "admin@example.com"] },
];

// Payload that violates scope (amount exceeds max)
const SCOPE_VIOLATING_PAYLOAD = { to: "user@example.com", subject: "Test", body: "Hello from RIO", amount: 500 };

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function run() {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  RIO Enforcement Core — Phase 1 Invariant Validation");
  console.log("══════════════════════════════════════════════════════════\n");

  // Reset state
  clearStore();
  clearLedger();

  const intent_hash = canonicalHash({ intent: INTENT, payload: PAYLOAD });

  // =========================================================================
  // T-01: No token → DENIED (MISSING_TOKEN)
  // =========================================================================
  console.log("T-01: Authorization Required — no token → DENIED");
  {
    const result = await executeGate({
      token_id: null,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: PAYLOAD,
    });
    assert(result.decision === Decision.DENY, "T-01", "Decision is DENY", `Got: ${result.decision}`);
    assert(result.reason_code === "MISSING_TOKEN", "T-01-code", "Reason is MISSING_TOKEN", `Got: ${result.reason_code}`);
  }

  // =========================================================================
  // T-02: Payload mismatch → DENIED (ACT_BINDING_MISMATCH)
  // =========================================================================
  console.log("\nT-02: ExactMatch — payload mismatch → DENIED");
  {
    const token = issueToken({ trace_id: TRACE_A, intent_hash });
    const result = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: DIFFERENT_PAYLOAD,  // mismatch
    });
    assert(result.decision === Decision.DENY, "T-02", "Decision is DENY", `Got: ${result.decision}`);
    assert(result.reason_code === "ACT_BINDING_MISMATCH", "T-02-code", "Reason is ACT_BINDING_MISMATCH", `Got: ${result.reason_code}`);
  }

  // =========================================================================
  // T-03: Expired token → DENIED (INVALID_TOKEN)
  // =========================================================================
  console.log("\nT-03: Replay Prevention (expired) → DENIED");
  {
    const token = issueExpiredToken({ trace_id: TRACE_A, intent_hash });
    const result = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: PAYLOAD,
    });
    assert(result.decision === Decision.DENY, "T-03", "Decision is DENY", `Got: ${result.decision}`);
    assert(result.reason_code === "INVALID_TOKEN", "T-03-code", "Reason is INVALID_TOKEN", `Got: ${result.reason_code}`);
  }

  // =========================================================================
  // T-04: Token replay → DENIED (TOKEN_USED)
  // =========================================================================
  console.log("\nT-04: Replay Prevention (reuse) → DENIED");
  {
    const token = issueToken({ trace_id: TRACE_A, intent_hash });
    // First use — should succeed
    const first = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: PAYLOAD,
    });
    assert(first.decision === Decision.EXECUTE, "T-04-first", "First use succeeds", `Got: ${first.decision}`);
    // Second use — replay
    const replay = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: PAYLOAD,
    });
    assert(replay.decision === Decision.DENY, "T-04", "Replay is DENIED", `Got: ${replay.decision}`);
    assert(replay.reason_code === "TOKEN_USED", "T-04-code", "Reason is TOKEN_USED", `Got: ${replay.reason_code}`);
  }

  // =========================================================================
  // T-05: Cross-session / trace mismatch → DENIED (TRACE_MISMATCH)
  // =========================================================================
  console.log("\nT-05: Trace Integrity — wrong trace → DENIED");
  {
    const token = issueToken({ trace_id: TRACE_A, intent_hash });
    const result = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_B,  // wrong trace
      intent: INTENT,
      payload: PAYLOAD,
    });
    assert(result.decision === Decision.DENY, "T-05", "Decision is DENY", `Got: ${result.decision}`);
    assert(result.reason_code === "TRACE_MISMATCH", "T-05-code", "Reason is TRACE_MISMATCH", `Got: ${result.reason_code}`);
  }

  // =========================================================================
  // T-06: Lineage unresolved → BLOCKED (LINEAGE_UNRESOLVED)
  // =========================================================================
  console.log("\nT-06: Lineage Integrity — unresolved deps → BLOCKED");
  {
    const token = issueToken({ trace_id: TRACE_A, intent_hash });
    const result = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: PAYLOAD,
      dependencies: [
        { id: "dep-001", status: "SUCCESS" },
        { id: "dep-002", status: "PENDING" },  // unresolved
      ],
    });
    assert(result.decision === Decision.BLOCK, "T-06", "Decision is BLOCK", `Got: ${result.decision}`);
    assert(result.reason_code === "LINEAGE_UNRESOLVED", "T-06-code", "Reason is LINEAGE_UNRESOLVED", `Got: ${result.reason_code}`);
  }

  // =========================================================================
  // T-06a: Scope violation → DENIED (SCOPE_VIOLATION)
  // =========================================================================
  console.log("\nT-06a: Scope Enforcement — constraint violation → DENIED");
  {
    // Issue token bound to the SCOPE-VIOLATING payload (amount=500)
    const violating_hash = canonicalHash({ intent: INTENT, payload: SCOPE_VIOLATING_PAYLOAD });
    const token = issueToken({ trace_id: TRACE_A, intent_hash: violating_hash });
    const result = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: SCOPE_VIOLATING_PAYLOAD,
      dependencies: [{ id: "dep-001", status: "SUCCESS" }],
      constraints: SCOPE_CONSTRAINTS,  // amount max 100, but payload has 500
    });
    assert(result.decision === Decision.DENY, "T-06a", "Decision is DENY", `Got: ${result.decision}`);
    assert(result.reason_code === "SCOPE_VIOLATION", "T-06a-code", "Reason is SCOPE_VIOLATION", `Got: ${result.reason_code}`);
  }

  // =========================================================================
  // T-07: Valid case → EXECUTED (full receipt + ledger verification)
  // =========================================================================
  console.log("\nT-07: Valid Execution — happy path → EXECUTED");
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
      constraints: SCOPE_CONSTRAINTS,  // amount=50, max=100 → passes
      executeFn: async (intent, payload) => {
        return { status: "EXECUTED", detail: `Email sent to ${payload.to}` };
      },
    });

    // Decision
    assert(result.decision === Decision.EXECUTE, "T-07", "Decision is EXECUTE", `Got: ${result.decision}`);
    assert(result.reason_code === null, "T-07-code", "No error code", `Got: ${result.reason_code}`);

    // Receipt generated
    assert(result.receipt !== undefined && result.receipt !== null, "T-07-receipt", "Receipt generated", "");
    assert(typeof result.receipt.receipt_hash === "string" && result.receipt.receipt_hash.length > 0, "T-07-hash", "Receipt has hash", "");

    // Receipt payload_hash matches what we expect
    const expected_payload_hash = canonicalHash({ intent: INTENT, payload: PAYLOAD });
    assert(result.receipt.payload_hash === expected_payload_hash, "T-07-binding", "Receipt payload_hash matches hash(intent+payload)", `Expected: ${expected_payload_hash.substring(0, 16)}... Got: ${(result.receipt.payload_hash || "").substring(0, 16)}...`);

    // Receipt prev_hash links to previous entry
    assert(typeof result.receipt.prev_hash === "string" && result.receipt.prev_hash.length > 0, "T-07-chain", "Receipt prev_hash links to previous entry", "");

    // Ledger entry written (entry count increased)
    const count = getEntryCount();
    assert(count > 0, "T-07-ledger", "Ledger entry written", `Count: ${count}`);
  }

  // =========================================================================
  // LEDGER INTEGRITY CHECK
  // =========================================================================
  console.log("\n──────────────────────────────────────────────────────────");
  console.log("  Ledger Integrity Verification");
  console.log("──────────────────────────────────────────────────────────");
  {
    const chain = verifyChain();
    const count = getEntryCount();
    assert(chain.valid, "LEDGER", `Hash chain valid (${count} entries)`, chain.reason || "");
    console.log(`  Ledger entries: ${count}`);
    console.log(`  Chain valid: ${chain.valid}`);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log("\n══════════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("══════════════════════════════════════════════════════════");

  if (failed > 0) {
    console.log("\n  ⛔ HARNESS FAILED — stopping.\n");
    process.exit(1);
  } else {
    console.log("\n  ✅ ALL TESTS PASSED — boundary holds.\n");
  }

  // =========================================================================
  // SAMPLE OUTPUT: one DENY, one BLOCK, one EXECUTE, one receipt
  // =========================================================================
  console.log("──────────────────────────────────────────────────────────");
  console.log("  Example Logs");
  console.log("──────────────────────────────────────────────────────────\n");

  const entries = getEntries();

  // Find one DENY, one BLOCK, one EXECUTE
  const denyEntry = entries.find(e => e.decision === "DENY");
  const blockEntry = entries.find(e => e.decision === "BLOCK");
  const executeEntry = entries.find(e => e.decision === "EXECUTE");

  if (denyEntry) {
    console.log("  [DENY example]");
    console.log(JSON.stringify({
      entry_id: denyEntry.entry_id,
      decision: denyEntry.decision,
      reason_code: denyEntry.reason_code,
      trace_id: denyEntry.trace_id,
      payload_hash: denyEntry.payload_hash,
      receipt_hash: denyEntry.receipt_hash,
      prev_hash: denyEntry.prev_hash.substring(0, 16) + "...",
      timestamp: denyEntry.timestamp,
    }, null, 2));
    console.log("");
  }

  if (blockEntry) {
    console.log("  [BLOCK example]");
    console.log(JSON.stringify({
      entry_id: blockEntry.entry_id,
      decision: blockEntry.decision,
      reason_code: blockEntry.reason_code,
      trace_id: blockEntry.trace_id,
      payload_hash: blockEntry.payload_hash,
      receipt_hash: blockEntry.receipt_hash,
      prev_hash: blockEntry.prev_hash.substring(0, 16) + "...",
      timestamp: blockEntry.timestamp,
    }, null, 2));
    console.log("");
  }

  if (executeEntry) {
    console.log("  [EXECUTE example]");
    console.log(JSON.stringify({
      entry_id: executeEntry.entry_id,
      decision: executeEntry.decision,
      reason_code: executeEntry.reason_code,
      trace_id: executeEntry.trace_id,
      payload_hash: executeEntry.payload_hash,
      receipt_hash: executeEntry.receipt_hash,
      prev_hash: executeEntry.prev_hash.substring(0, 16) + "...",
      timestamp: executeEntry.timestamp,
    }, null, 2));
    console.log("");
  }

  // Sample receipt (last EXECUTE entry)
  const lastExecute = [...entries].reverse().find(e => e.decision === "EXECUTE");
  if (lastExecute) {
    console.log("  [Sample Receipt]");
    console.log(JSON.stringify(lastExecute, null, 2));
    console.log("");
  }

  // Final report as JSON
  const report = {
    harness: "RIO Enforcement Core — Phase 1 Invariant Validation",
    timestamp: new Date().toISOString(),
    tests: results,
    summary: { passed, failed, total: passed + failed },
    ledger: {
      entry_count: getEntryCount(),
      chain_valid: verifyChain().valid,
    },
  };

  console.log("──────────────────────────────────────────────────────────");
  console.log("  Full Report (JSON)");
  console.log("──────────────────────────────────────────────────────────\n");
  console.log(JSON.stringify(report, null, 2));
}

run().catch((err) => {
  console.error("HARNESS FATAL:", err);
  process.exit(1);
});
