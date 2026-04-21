/**
 * RIO Enforcement Core — Phase 1 Test Harness
 *
 * 7 required tests. All must pass.
 *
 *   T1. No token            → DENIED  (MISSING_TOKEN)
 *   T2. Payload mismatch    → DENIED  (ACT_BINDING_MISMATCH)
 *   T3. Expired token       → DENIED  (INVALID_TOKEN)
 *   T4. Token replay        → DENIED  (TOKEN_USED)
 *   T5. Trace mismatch      → DENIED  (TRACE_MISMATCH)
 *   T6. Lineage unresolved  → BLOCKED (LINEAGE_UNRESOLVED)
 *   T7. Valid case           → EXECUTED
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
const PAYLOAD = { to: "user@example.com", subject: "Test", body: "Hello from RIO" };
const DIFFERENT_PAYLOAD = { to: "attacker@evil.com", subject: "Phish", body: "Gotcha" };

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function run() {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  RIO Enforcement Core — Phase 1 Test Harness");
  console.log("══════════════════════════════════════════════════════════\n");

  // Reset state
  clearStore();
  clearLedger();

  const intent_hash = canonicalHash({ intent: INTENT, payload: PAYLOAD });

  // =========================================================================
  // T1: No token → DENIED (MISSING_TOKEN)
  // =========================================================================
  console.log("T1: No token → DENIED");
  {
    const result = await executeGate({
      token_id: null,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: PAYLOAD,
    });
    assert(result.decision === Decision.DENY, "T1", "Decision is DENY", `Got: ${result.decision}`);
    assert(result.reason_code === "MISSING_TOKEN", "T1-code", "Reason is MISSING_TOKEN", `Got: ${result.reason_code}`);
  }

  // =========================================================================
  // T2: Payload mismatch → DENIED (ACT_BINDING_MISMATCH)
  // =========================================================================
  console.log("\nT2: Payload mismatch → DENIED");
  {
    // Issue token bound to the correct payload
    const token = issueToken({ trace_id: TRACE_A, intent_hash });
    // But submit with a DIFFERENT payload
    const result = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: DIFFERENT_PAYLOAD,  // mismatch
    });
    assert(result.decision === Decision.DENY, "T2", "Decision is DENY", `Got: ${result.decision}`);
    assert(result.reason_code === "ACT_BINDING_MISMATCH", "T2-code", "Reason is ACT_BINDING_MISMATCH", `Got: ${result.reason_code}`);
  }

  // =========================================================================
  // T3: Expired token → DENIED (INVALID_TOKEN)
  // =========================================================================
  console.log("\nT3: Expired token → DENIED");
  {
    const token = issueExpiredToken({ trace_id: TRACE_A, intent_hash });
    const result = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: PAYLOAD,
    });
    assert(result.decision === Decision.DENY, "T3", "Decision is DENY", `Got: ${result.decision}`);
    assert(result.reason_code === "INVALID_TOKEN", "T3-code", "Reason is INVALID_TOKEN", `Got: ${result.reason_code}`);
  }

  // =========================================================================
  // T4: Token replay → DENIED (TOKEN_USED)
  // =========================================================================
  console.log("\nT4: Token replay → DENIED");
  {
    const token = issueToken({ trace_id: TRACE_A, intent_hash });
    // First use — should succeed
    const first = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: PAYLOAD,
    });
    assert(first.decision === Decision.EXECUTE, "T4-first", "First use succeeds", `Got: ${first.decision}`);
    // Second use — replay
    const replay = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_A,
      intent: INTENT,
      payload: PAYLOAD,
    });
    assert(replay.decision === Decision.DENY, "T4", "Replay is DENIED", `Got: ${replay.decision}`);
    assert(replay.reason_code === "TOKEN_USED", "T4-code", "Reason is TOKEN_USED", `Got: ${replay.reason_code}`);
  }

  // =========================================================================
  // T5: Cross-session / trace mismatch → DENIED (TRACE_MISMATCH)
  // =========================================================================
  console.log("\nT5: Trace mismatch → DENIED");
  {
    const token = issueToken({ trace_id: TRACE_A, intent_hash });
    // Submit with TRACE_B instead of TRACE_A
    const result = await executeGate({
      token_id: token.token_id,
      trace_id: TRACE_B,  // wrong trace
      intent: INTENT,
      payload: PAYLOAD,
    });
    assert(result.decision === Decision.DENY, "T5", "Decision is DENY", `Got: ${result.decision}`);
    assert(result.reason_code === "TRACE_MISMATCH", "T5-code", "Reason is TRACE_MISMATCH", `Got: ${result.reason_code}`);
  }

  // =========================================================================
  // T6: Lineage unresolved → BLOCKED (LINEAGE_UNRESOLVED)
  // =========================================================================
  console.log("\nT6: Lineage unresolved → BLOCKED");
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
    assert(result.decision === Decision.BLOCK, "T6", "Decision is BLOCK", `Got: ${result.decision}`);
    assert(result.reason_code === "LINEAGE_UNRESOLVED", "T6-code", "Reason is LINEAGE_UNRESOLVED", `Got: ${result.reason_code}`);
  }

  // =========================================================================
  // T7: Valid case → EXECUTED
  // =========================================================================
  console.log("\nT7: Valid case → EXECUTED");
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
      executeFn: async (intent, payload) => {
        return { status: "EXECUTED", detail: `Email sent to ${payload.to}` };
      },
    });
    assert(result.decision === Decision.EXECUTE, "T7", "Decision is EXECUTE", `Got: ${result.decision}`);
    assert(result.reason_code === null, "T7-code", "No error code", `Got: ${result.reason_code}`);
    assert(result.receipt !== undefined, "T7-receipt", "Receipt generated", "");
    assert(result.receipt.receipt_hash !== undefined, "T7-hash", "Receipt has hash", "");
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
  // SAMPLE OUTPUT: denial logs, execution logs, receipts
  // =========================================================================
  console.log("──────────────────────────────────────────────────────────");
  console.log("  Sample Ledger Entries (receipts)");
  console.log("──────────────────────────────────────────────────────────\n");

  const entries = getEntries();
  for (const e of entries) {
    console.log(JSON.stringify({
      entry_id: e.entry_id,
      decision: e.decision,
      reason_code: e.reason_code,
      trace_id: e.trace_id,
      payload_hash: e.payload_hash,
      receipt_hash: e.receipt_hash,
      prev_hash: e.prev_hash.substring(0, 16) + "...",
      timestamp: e.timestamp,
    }, null, 2));
    console.log("");
  }

  // Final report as JSON
  const report = {
    harness: "RIO Enforcement Core — Phase 1",
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
