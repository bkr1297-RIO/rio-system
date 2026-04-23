/**
 * RIO — Single-Entry Demo
 *
 * Demonstrates the full enforcement loop in three cases:
 *   1. VALID  — approved action executes, receipt generated, chain verified
 *   2. DRIFT  — payload modified after approval → BLOCKED
 *   3. TAMPER — receipt altered after execution → chain verification FAILS
 *
 * Usage:
 *   node demo.js
 */

import { issueToken, canonicalHash, clearStore } from "./enforcement-core/dtt.mjs";
import { executeGate } from "./enforcement-core/gate.mjs";
import { getEntries, verifyChain, clearLedger } from "./enforcement-core/ledger.mjs";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function section(title) {
  console.log("");
  console.log("=".repeat(50));
  console.log(`  ${title}`);
  console.log("=".repeat(50));
}

async function run() {

  // ───────────────────────────────────────────────────────────────
  // Case 1: Valid execution
  // ───────────────────────────────────────────────────────────────

  section("VALID CASE");

  const intent = { action: "send_email", target: "brian@example.com", subject: "RIO Demo" };
  const payload = {
    action: "send_email",
    to: "brian@example.com",
    subject: "RIO Demo",
    body: "This action was approved and executed under governance.",
  };

  const traceId = "demo-trace-001";
  const intentHash = canonicalHash({ intent, payload });
  const token = issueToken({ trace_id: traceId, intent_hash: intentHash });

  const result = await executeGate({
    token_id: token.token_id,
    trace_id: traceId,
    intent,
    payload,
  });

  const chain1 = verifyChain();

  if (result.decision === "EXECUTE" && chain1.valid) {
    console.log("Decision: EXECUTED");
    console.log("Receipt:  GENERATED");
    console.log("Chain:    VALID");
    console.log("");
    console.log("PASS");
  } else {
    console.log("UNEXPECTED — decision:", result.decision, "chain:", chain1.valid);
  }

  // ───────────────────────────────────────────────────────────────
  // Case 2: Drift — payload modified after approval
  // ───────────────────────────────────────────────────────────────

  section("DRIFT CASE");

  const driftIntent = { action: "send_email", target: "brian@example.com", subject: "RIO Demo" };
  const driftPayload = {
    action: "send_email",
    to: "brian@example.com",
    subject: "RIO Demo",
    body: "This action was approved and executed under governance.",
  };

  const driftTraceId = "demo-trace-002";
  const driftIntentHash = canonicalHash({ intent: driftIntent, payload: driftPayload });
  const driftToken = issueToken({ trace_id: driftTraceId, intent_hash: driftIntentHash });

  // Modify payload AFTER token was issued (simulates drift)
  const modifiedPayload = { ...driftPayload, body: "MODIFIED — not what was approved" };

  const driftResult = await executeGate({
    token_id: driftToken.token_id,
    trace_id: driftTraceId,
    intent: driftIntent,
    payload: modifiedPayload,
  });

  if (driftResult.decision !== "EXECUTE") {
    console.log("Decision: " + driftResult.decision);
    console.log("Reason:   " + driftResult.reason_code);
    console.log("Adapter:  NOT CALLED");
    console.log("");
    console.log("BLOCKED");
  } else {
    console.log("UNEXPECTED — drift was not caught");
  }

  // ───────────────────────────────────────────────────────────────
  // Case 3: Tamper — receipt modified after execution
  // ───────────────────────────────────────────────────────────────

  section("TAMPER CASE");

  const entries = getEntries();
  if (entries.length > 0) {
    // Tamper: change the detail field of the first receipt
    entries[0].detail = "TAMPERED — this was changed after execution";

    const chain2 = verifyChain();

    if (!chain2.valid) {
      console.log("Chain:    INVALID");
      console.log("Entry:    " + chain2.first_invalid);
      console.log("Reason:   " + chain2.reason.split(".")[0]);
      console.log("");
      console.log("FAIL");
    } else {
      console.log("UNEXPECTED — tamper was not detected");
    }
  } else {
    console.log("ERROR — no entries in ledger");
  }

  // ─────────────────────────────────────────────────────────────
  console.log("");
  console.log("─".repeat(50));
  console.log("  Demo complete. Three cases demonstrated.");
  console.log("─".repeat(50));
}

run().catch(console.error);
