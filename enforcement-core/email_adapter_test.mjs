/**
 * RIO Enforcement Core — Phase 2: Email Adapter Integration Tests
 *
 * Tests:
 *   T-EA-01: Valid Email   — gate passes → adapter called → receipt + ledger
 *   T-EA-02: Payload Drift — modified after approval → DENY → adapter NOT called
 *   T-EA-03: No Token      — DENY → adapter NOT called
 *   T-EA-04: Replay        — DENY → adapter NOT called
 *
 * Final rule: If adapter executes without passing through Execution Gate → invalid
 */
import { issueToken, canonicalHash, clearStore } from "./dtt.mjs";
import { executeGate } from "./gate.mjs";
import { getEntries, verifyChain, clearLedger, getEntryCount } from "./ledger.mjs";
import { executeEmail, getCallLog, clearCallLog } from "./email_adapter.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const results = [];

function assert(testId, description, condition, detail = "") {
  const status = condition ? "PASS" : "FAIL";
  if (condition) passed++;
  else failed++;
  const icon = condition ? "✅" : "❌";
  console.log(`  ${icon} ${testId}: ${description}`);
  if (detail) console.log(`     ${detail}`);
  results.push({ test: testId, status, description, detail });
}

function resetAll() {
  clearStore();
  clearLedger();
  clearCallLog();
}

// ---------------------------------------------------------------------------
// Common test data builders
// ---------------------------------------------------------------------------
const TRACE_ID = "trace-email-phase2";

function makeEmailIntent() {
  return {
    action: "send_email",
    target: "brian@example.com",
    subject: "RIO Governed Email",
  };
}

function makeEmailPayload() {
  return {
    to: "brian@example.com",
    subject: "RIO Governed Email",
    body: "This email was sent through the RIO Execution Gate.",
    trace_id: TRACE_ID,
  };
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
async function runTests() {
  console.log("══════════════════════════════════════════════════════════");
  console.log("  RIO Phase 2 — Email Adapter Integration Tests");
  console.log("══════════════════════════════════════════════════════════");

  // =========================================================================
  // T-EA-01: Valid Email — full flow
  // =========================================================================
  console.log("\nT-EA-01: Valid Email — proposal → approval → gate → adapter");
  resetAll();

  const intent1 = makeEmailIntent();
  const payload1 = makeEmailPayload();

  // Issue token — hash is computed from the EXACT intent+payload the gate will see
  const intentHash1 = canonicalHash({ intent: intent1, payload: payload1 });
  const token1 = issueToken({ trace_id: TRACE_ID, intent_hash: intentHash1 });

  const ledgerBefore = getEntryCount();
  const callsBefore = getCallLog().length;

  const result1 = await executeGate({
    token_id: token1.token_id,
    trace_id: TRACE_ID,
    intent: intent1,
    payload: payload1,
    executeFn: executeEmail,
  });

  assert("T-EA-01", "Decision is EXECUTE", result1.decision === "EXECUTE", `Got: ${result1.decision}`);
  assert("T-EA-01-adapter", "Adapter was called", getCallLog().length === callsBefore + 1, `Calls: ${getCallLog().length}`);
  assert("T-EA-01-status", "Adapter returned SUCCESS", result1.execution_result?.status === "SUCCESS", `Got: ${result1.execution_result?.status}`);
  assert("T-EA-01-echo", "Adapter echoed payload_hash", result1.execution_result?.echo_payload_hash != null, `Echo: ${result1.execution_result?.echo_payload_hash?.substring(0, 16)}...`);
  assert("T-EA-01-receipt", "Receipt generated", result1.receipt != null, "");
  assert("T-EA-01-ledger", "Ledger updated", getEntryCount() > ledgerBefore, `Entries: ${getEntryCount()}`);

  // Log the adapter call record
  const adapterCall = getCallLog()[getCallLog().length - 1];
  console.log("\n  [Adapter Call Record]");
  console.log(JSON.stringify(adapterCall, null, 2));

  // Log the receipt
  console.log("\n  [Receipt]");
  console.log(JSON.stringify(result1.receipt, null, 2));

  // Log execution result
  console.log("\n  [Execution Log]");
  console.log(JSON.stringify({
    decision: result1.decision,
    reason_code: result1.reason_code,
    detail: result1.detail,
    trace_id: result1.trace_id,
    execution_result: result1.execution_result,
  }, null, 2));

  // =========================================================================
  // T-EA-02: Payload Drift — modify email after approval
  // =========================================================================
  console.log("\n──────────────────────────────────────────────────────────");
  console.log("T-EA-02: Payload Drift — modified email after approval → DENY");
  resetAll();

  const intent2 = { action: "send_email", target: "brian@example.com", subject: "Approved Subject" };
  const originalPayload = {
    to: "brian@example.com",
    subject: "Approved Subject",
    body: "Approved body text.",
    trace_id: TRACE_ID,
  };

  // Issue token for original payload
  const intentHash2 = canonicalHash({ intent: intent2, payload: originalPayload });
  const token2 = issueToken({ trace_id: TRACE_ID, intent_hash: intentHash2 });

  // Tamper: change the body after token was issued
  const tamperedPayload = {
    ...originalPayload,
    body: "TAMPERED body — this was changed after approval!",
  };

  const callsBefore2 = getCallLog().length;

  const result2 = await executeGate({
    token_id: token2.token_id,
    trace_id: TRACE_ID,
    intent: intent2,
    payload: tamperedPayload,
    executeFn: executeEmail,
  });

  assert("T-EA-02", "Decision is DENY", result2.decision === "DENY", `Got: ${result2.decision}`);
  assert("T-EA-02-code", "Reason is ACT_BINDING_MISMATCH", result2.reason_code === "ACT_BINDING_MISMATCH", `Got: ${result2.reason_code}`);
  assert("T-EA-02-adapter", "Adapter was NOT called", getCallLog().length === callsBefore2, `Calls: ${getCallLog().length} (expected ${callsBefore2})`);

  console.log("\n  [Denial Log]");
  console.log(JSON.stringify({
    decision: result2.decision,
    reason_code: result2.reason_code,
    detail: result2.detail,
    trace_id: result2.trace_id,
  }, null, 2));

  // =========================================================================
  // T-EA-03: No Token — DENY, adapter never called
  // =========================================================================
  console.log("\n──────────────────────────────────────────────────────────");
  console.log("T-EA-03: No Token → DENY, adapter never called");
  resetAll();

  const intent3 = makeEmailIntent();
  const payload3 = makeEmailPayload();
  const callsBefore3 = getCallLog().length;

  const result3 = await executeGate({
    token_id: null,
    trace_id: TRACE_ID,
    intent: intent3,
    payload: payload3,
    executeFn: executeEmail,
  });

  assert("T-EA-03", "Decision is DENY", result3.decision === "DENY", `Got: ${result3.decision}`);
  assert("T-EA-03-code", "Reason is MISSING_TOKEN", result3.reason_code === "MISSING_TOKEN", `Got: ${result3.reason_code}`);
  assert("T-EA-03-adapter", "Adapter was NOT called", getCallLog().length === callsBefore3, `Calls: ${getCallLog().length} (expected ${callsBefore3})`);

  // =========================================================================
  // T-EA-04: Replay — first use succeeds, second DENIED
  // =========================================================================
  console.log("\n──────────────────────────────────────────────────────────");
  console.log("T-EA-04: Replay — token reuse → DENY, adapter not called on replay");
  resetAll();

  const intent4 = makeEmailIntent();
  const payload4 = makeEmailPayload();
  const intentHash4 = canonicalHash({ intent: intent4, payload: payload4 });
  const token4 = issueToken({ trace_id: TRACE_ID, intent_hash: intentHash4 });

  // First use — should succeed
  const result4a = await executeGate({
    token_id: token4.token_id,
    trace_id: TRACE_ID,
    intent: intent4,
    payload: payload4,
    executeFn: executeEmail,
  });

  assert("T-EA-04-first", "First use → EXECUTE", result4a.decision === "EXECUTE", `Got: ${result4a.decision}`);
  const callsAfterFirst = getCallLog().length;

  // Replay — same token
  const result4b = await executeGate({
    token_id: token4.token_id,
    trace_id: TRACE_ID,
    intent: intent4,
    payload: payload4,
    executeFn: executeEmail,
  });

  assert("T-EA-04", "Replay → DENY", result4b.decision === "DENY", `Got: ${result4b.decision}`);
  assert("T-EA-04-code", "Reason is TOKEN_USED", result4b.reason_code === "TOKEN_USED", `Got: ${result4b.reason_code}`);
  assert("T-EA-04-adapter", "Adapter NOT called on replay", getCallLog().length === callsAfterFirst, `Calls: ${getCallLog().length} (expected ${callsAfterFirst})`);

  // =========================================================================
  // Ledger chain verification
  // =========================================================================
  console.log("\n──────────────────────────────────────────────────────────");
  console.log("  Ledger Integrity Verification");
  console.log("──────────────────────────────────────────────────────────");
  const chain = verifyChain();
  assert("LEDGER", `Hash chain valid (${chain.entries_checked} entries)`, chain.valid, chain.reason || "");

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n══════════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
  if (failed === 0) {
    console.log("  ✅ ALL TESTS PASSED — adapter integration validated.");
  } else {
    console.log("  ❌ HARNESS FAILED — see failures above.");
  }
  console.log("══════════════════════════════════════════════════════════");

  // Full JSON report
  console.log("\n──────────────────────────────────────────────────────────");
  console.log("  Full Report (JSON)");
  console.log("──────────────────────────────────────────────────────────");
  console.log(JSON.stringify({
    harness: "RIO Phase 2 — Email Adapter Integration Tests",
    timestamp: new Date().toISOString(),
    tests: results,
    summary: { passed, failed, total: passed + failed },
    adapter_call_log: getCallLog(),
    ledger: { entry_count: getEntryCount(), chain_valid: chain.valid },
  }, null, 2));

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
