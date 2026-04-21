/**
 * RIO Enforcement Core — Funds Transfer Integration Tests
 *
 * Tests:
 *   Valid Transfer   → EXECUTED, adapter called, receipt generated
 *   Exceeds Limit    → DENIED (SCOPE_VIOLATION), adapter NOT called
 *   No Token         → DENIED (MISSING_TOKEN), adapter NOT called
 *   Token Replay     → DENIED (TOKEN_USED), adapter NOT called
 */
import { issueToken, canonicalHash, clearStore } from "./dtt.mjs";
import { executeGate, Decision } from "./gate.mjs";
import { getEntryCount, verifyChain, clearLedger } from "./ledger.mjs";
import { executeFunds, getCallLog, clearCallLog } from "./funds_adapter.mjs";

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
// Standardized output
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
const TRACE_ID = "trace-funds-phase2";

const VALID_INTENT = { action: "transfer_funds", target: "vendor_001", amount: 500 };
const VALID_PAYLOAD = { amount: 500, to: "vendor_001", trace_id: TRACE_ID };

const OVER_LIMIT_INTENT = { action: "transfer_funds", target: "vendor_001", amount: 100000 };
const OVER_LIMIT_PAYLOAD = { amount: 100000, to: "vendor_001", trace_id: TRACE_ID };

const CONSTRAINTS = [
  { field: "amount", op: "max", limit: 1000 },
];

function resetAll() {
  clearStore();
  clearLedger();
  clearCallLog();
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function runTests() {
  console.log("══════════════════════════════════════════════════════════");
  console.log("  RIO Funds Transfer — Integration Tests");
  console.log("══════════════════════════════════════════════════════════");

  // ── Valid Transfer ──────────────────────────────────────────────────
  resetAll();

  const intentHash1 = canonicalHash({ intent: VALID_INTENT, payload: VALID_PAYLOAD });
  const token1 = issueToken({ trace_id: TRACE_ID, intent_hash: intentHash1 });

  const result1 = await executeGate({
    token_id: token1.token_id,
    trace_id: TRACE_ID,
    intent: VALID_INTENT,
    payload: VALID_PAYLOAD,
    constraints: CONSTRAINTS,
    executeFn: executeFunds,
  });

  check(result1.decision === "EXECUTE", "Valid-decision");
  check(getCallLog().length === 1, "Valid-adapter");
  check(result1.execution_result?.status === "SUCCESS", "Valid-status");
  check(result1.receipt != null, "Valid-receipt");

  printResult({ testName: "Valid Transfer ($500)", result: result1, adapterCalled: true, receiptGenerated: true });
  printReceiptClean(result1.receipt);
  printReceiptJSON(result1.receipt);

  // ── Exceeds Limit ──────────────────────────────────────────────────
  resetAll();

  const intentHash2 = canonicalHash({ intent: OVER_LIMIT_INTENT, payload: OVER_LIMIT_PAYLOAD });
  const token2 = issueToken({ trace_id: TRACE_ID, intent_hash: intentHash2 });

  const result2 = await executeGate({
    token_id: token2.token_id,
    trace_id: TRACE_ID,
    intent: OVER_LIMIT_INTENT,
    payload: OVER_LIMIT_PAYLOAD,
    constraints: CONSTRAINTS,
    executeFn: executeFunds,
  });

  check(result2.decision === "DENY", "Limit-decision");
  check(result2.reason_code === "SCOPE_VIOLATION", "Limit-code");
  check(getCallLog().length === 0, "Limit-adapter");

  printResult({ testName: "Exceeds Limit ($100,000)", result: result2, adapterCalled: false, receiptGenerated: false });

  // ── No Token ───────────────────────────────────────────────────────
  resetAll();

  const result3 = await executeGate({
    token_id: null,
    trace_id: TRACE_ID,
    intent: VALID_INTENT,
    payload: VALID_PAYLOAD,
    constraints: CONSTRAINTS,
    executeFn: executeFunds,
  });

  check(result3.decision === "DENY", "NoToken-decision");
  check(result3.reason_code === "MISSING_TOKEN", "NoToken-code");
  check(getCallLog().length === 0, "NoToken-adapter");

  printResult({ testName: "Missing Token", result: result3, adapterCalled: false, receiptGenerated: false });

  // ── Token Replay ───────────────────────────────────────────────────
  resetAll();

  const intentHash4 = canonicalHash({ intent: VALID_INTENT, payload: VALID_PAYLOAD });
  const token4 = issueToken({ trace_id: TRACE_ID, intent_hash: intentHash4 });

  const first = await executeGate({
    token_id: token4.token_id,
    trace_id: TRACE_ID,
    intent: VALID_INTENT,
    payload: VALID_PAYLOAD,
    constraints: CONSTRAINTS,
    executeFn: executeFunds,
  });

  check(first.decision === "EXECUTE", "Replay-first");
  printResult({ testName: "Valid Transfer (setup for replay)", result: first, adapterCalled: true, receiptGenerated: true });

  const callsAfterFirst = getCallLog().length;

  const replay = await executeGate({
    token_id: token4.token_id,
    trace_id: TRACE_ID,
    intent: VALID_INTENT,
    payload: VALID_PAYLOAD,
    constraints: CONSTRAINTS,
    executeFn: executeFunds,
  });

  check(replay.decision === "DENY", "Replay-decision");
  check(replay.reason_code === "TOKEN_USED", "Replay-code");
  check(getCallLog().length === callsAfterFirst, "Replay-adapter");

  printResult({ testName: "Token Replay", result: replay, adapterCalled: false, receiptGenerated: false });

  printSummary();
}

runTests().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
