/**
 * RIO Enforcement Core — Funds Transfer Adapter
 *
 * This adapter executes ONLY what the Execution Gate passes.
 *
 * Contract:
 *   - Receives: intent + payload from gate (gate already verified binding)
 *   - Returns:  { status: "SUCCESS", timestamp, echo_payload_hash, detail }
 *
 * Prohibitions:
 *   - MUST NOT modify payload
 *   - MUST NOT generate new data
 *   - MUST NOT call gate
 *   - MUST NOT authorize anything
 *   - MUST NOT cache tokens
 */
import { canonicalHash } from "./dtt.mjs";

// ---------------------------------------------------------------------------
// Call log (for test verification)
// ---------------------------------------------------------------------------
const callLog = [];

export function getCallLog() {
  return [...callLog];
}

export function clearCallLog() {
  callLog.length = 0;
}

// ---------------------------------------------------------------------------
// executeFunds — the adapter function
// ---------------------------------------------------------------------------
export async function executeFunds(intent, payload) {
  const { amount, to, trace_id } = payload;

  if (amount == null || !to) {
    throw new Error("Funds adapter: missing required fields (amount, to)");
  }

  const computedHash = canonicalHash({ intent, payload });

  const timestamp = new Date().toISOString();
  callLog.push({
    adapter: "funds_transfer",
    action: "transfer",
    amount,
    to,
    trace_id: trace_id || null,
    payload_hash: computedHash,
    timestamp,
  });

  return {
    status: "SUCCESS",
    timestamp,
    echo_payload_hash: computedHash,
    detail: `Transferred ${amount} to ${to}`,
  };
}
