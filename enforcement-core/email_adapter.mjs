/**
 * RIO Enforcement Core — Email Adapter (Phase 2)
 *
 * This adapter executes ONLY what the Execution Gate passes.
 *
 * Contract:
 *   - Receives: intent + payload from gate (gate already verified binding)
 *   - Returns:  { status: "SUCCESS", timestamp, echo_payload_hash }
 *
 * Prohibitions:
 *   - MUST NOT modify payload
 *   - MUST NOT generate new data
 *   - MUST NOT call gate
 *   - MUST NOT authorize anything
 *   - MUST NOT cache tokens
 *
 * If this adapter executes without passing through Execution Gate:
 *   → system is invalid
 */
import { canonicalHash } from "./dtt.mjs";

// ---------------------------------------------------------------------------
// Call log (for test verification — proves adapter was/was not called)
// ---------------------------------------------------------------------------
const callLog = [];

export function getCallLog() {
  return [...callLog];
}

export function clearCallLog() {
  callLog.length = 0;
}

// ---------------------------------------------------------------------------
// executeEmail — the adapter function
// ---------------------------------------------------------------------------
/**
 * Execute an email send action.
 * This function is passed as `executeFn` to the Execution Gate.
 * It ONLY runs if the gate passes all 6 checks.
 *
 * @param {object} intent  — the intent object (from gate)
 * @param {object} payload — the execution payload (from gate)
 * @returns {{ status: string, timestamp: string, echo_payload_hash: string, detail: string }}
 */
export async function executeEmail(intent, payload) {
  const { to, subject, body, trace_id } = payload;

  // Validate required fields (defensive — gate should have bound these)
  if (!to || !subject || !body) {
    throw new Error("Email adapter: missing required fields (to, subject, body)");
  }

  // Compute payload hash from the actual intent+payload the gate verified
  const computedHash = canonicalHash({ intent, payload });

  // Record the call (proves adapter was invoked)
  const timestamp = new Date().toISOString();
  const record = {
    adapter: "email",
    action: "send",
    to,
    subject,
    body,
    trace_id: trace_id || null,
    payload_hash: computedHash,
    timestamp,
  };
  callLog.push(record);

  // Simulate email send (no actual SMTP — this is the adapter boundary)
  // In production, this would call nodemailer, SendGrid, etc.
  const result = {
    status: "SUCCESS",
    timestamp,
    echo_payload_hash: computedHash,
    detail: `Email sent to ${to}: "${subject}"`,
  };

  return result;
}
