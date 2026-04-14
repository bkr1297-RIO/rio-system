/**
 * SMS-Based One-Click Approval System
 * ────────────────────────────────────
 * Clone of emailApproval pattern for SMS delivery via Twilio.
 *
 * Flow:
 *   1. Action requires approval → system sends SMS to approver's phone
 *   2. Approver taps Approve or Decline link in SMS
 *   3. Same /api/rio/approve and /api/rio/decline endpoints handle the click
 *   4. Approve → Gateway authorize → execute → receipt → ledger → Drive
 *   5. Decline → receipt (REJECTED) → ledger → Drive
 *
 * Reuses from emailApproval.ts:
 *   - generateApprovalToken (same signed HMAC token)
 *   - verifyApprovalToken (same verification)
 *   - /api/rio/approve and /api/rio/decline (same Express endpoints)
 *   - Same nonce tracking (single-use enforcement)
 *
 * Does NOT:
 *   - Build reply-based SMS parsing
 *   - Create new approval endpoints
 *   - Change receipt/ledger flow
 */

import { ENV } from "./_core/env";
import {
  generateApprovalToken,
  computeActionHash,
  type ApprovalTokenPayload,
  type ApprovalEmailRequest,
} from "./emailApproval";
import { createPendingEmailApproval } from "./db";

// ─── Types ────────────────────────────────────────────────────

export interface ApprovalSMSRequest {
  intent_id: string;
  proposer_email: string;       // who proposed the action
  approver_phone: string;       // phone number to send SMS to
  approver_email: string;       // email identity for token (must match token verification)
  action_type: string;          // e.g. "send_email"
  action_summary: string;       // human-readable summary
  action_details?: Record<string, unknown>;
}

export interface SMSSendResult {
  success: boolean;
  token_payload?: ApprovalTokenPayload;
  sms_result?: {
    messageSid?: string;
    twilioStatus?: string;
    to?: string;
  };
  sms_body?: string;            // the actual SMS text sent (for verification)
  error?: string;
}

// ─── SMS Body Builder ─────────────────────────────────────────

/**
 * Build a short SMS message with approve/decline links.
 * SMS has 160-char segments — keep it concise but include both links.
 */
export function buildApprovalSMSBody(opts: {
  action_summary: string;
  action_type: string;
  proposer_email: string;
  approveUrl: string;
  declineUrl: string;
  expires_at: number;
}): string {
  const expiresMin = Math.round((opts.expires_at - Date.now()) / 60_000);
  const expiresLabel = expiresMin > 0 ? `${expiresMin}min` : "soon";

  return [
    `RIO APPROVAL REQUEST`,
    ``,
    `Action: ${opts.action_type}`,
    `Summary: ${opts.action_summary}`,
    `From: ${opts.proposer_email}`,
    `Expires: ${expiresLabel}`,
    ``,
    `APPROVE: ${opts.approveUrl}`,
    ``,
    `DECLINE: ${opts.declineUrl}`,
  ].join("\n");
}

// ─── Twilio SMS Sender (direct, not through Gateway) ──────────
// This is the governance system itself sending the approval request,
// NOT a governed action. The approval SMS is infrastructure, not a user action.

async function sendViaTwilio(
  to: string,
  body: string,
): Promise<{ success: boolean; messageSid?: string; twilioStatus?: string; error?: string }> {
  const accountSid = ENV.twilioAccountSid;
  const authToken = ENV.twilioAuthToken;
  // Use local number directly — toll-free and messaging service are blocked (unverified)
  // Hardcode the working local number to avoid routing through blocked toll-free
  const LOCAL_SMS_NUMBER = "+16413819721";

  if (!accountSid || !authToken) {
    return {
      success: false,
      error: "Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)",
    };
  }

  if (!to.trim()) {
    return { success: false, error: "Phone number is required" };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams();
    params.append("To", to);
    params.append("Body", body);
    params.append("From", LOCAL_SMS_NUMBER);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok || data.status === "failed" || data.error_code) {
      return {
        success: false,
        error: `Twilio API error: ${data.message || data.error_message || JSON.stringify(data)}`,
      };
    }

    return {
      success: true,
      messageSid: data.sid,
      twilioStatus: data.status,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `SMS send failed: ${msg}` };
  }
}

// ─── Main: Send Approval SMS ──────────────────────────────────

/**
 * Send an approval SMS to the designated approver's phone.
 * Uses the same signed token as email approval.
 * Links point to the same /api/rio/approve and /api/rio/decline endpoints.
 */
export async function sendApprovalSMS(
  request: ApprovalSMSRequest,
  baseUrl: string,
): Promise<SMSSendResult> {
  // Compute action hash (same as email flow)
  const action_hash = computeActionHash(
    request.action_type,
    request.action_details || {},
  );

  // Generate signed token (same as email flow)
  const { token, payload } = generateApprovalToken({
    intent_id: request.intent_id,
    proposer_email: request.proposer_email,
    approver_email: request.approver_email,
    action_hash,
  });

  // Build approve/decline URLs (same endpoints as email)
  const approveUrl = `${baseUrl}/api/rio/approve?token=${encodeURIComponent(token)}`;
  const declineUrl = `${baseUrl}/api/rio/decline?token=${encodeURIComponent(token)}`;

  // Build SMS body
  const smsBody = buildApprovalSMSBody({
    action_summary: request.action_summary,
    action_type: request.action_type,
    proposer_email: request.proposer_email,
    approveUrl,
    declineUrl,
    expires_at: payload.expires_at,
  });

  // ── PERSIST to DB (survives restarts + available on published site) ──
  try {
    await createPendingEmailApproval({
      intentId: request.intent_id,
      actionType: request.action_type,
      actionSummary: request.action_summary,
      actionDetails: request.action_details,
      proposerEmail: request.proposer_email,
      approverEmail: request.approver_email,
      tokenNonce: payload.nonce,
      expiresAt: new Date(payload.expires_at),
    });
    console.log(`[SMSApproval] Persisted pending approval to DB: intent=${request.intent_id} nonce=${payload.nonce}`);
  } catch (err) {
    console.error("[SMSApproval] Failed to persist to DB (continuing anyway):", err);
  }

  // Send via Twilio
  const result = await sendViaTwilio(request.approver_phone, smsBody);

  if (!result.success) {
    console.log(`[SMSApproval] FAILED to send to ${request.approver_phone}: ${result.error}`);
    return { success: false, error: result.error };
  }

  console.log(
    `[SMSApproval] Sent to ${request.approver_phone} for intent=${request.intent_id} ` +
    `sid=${result.messageSid} expires=${new Date(payload.expires_at).toISOString()}`,
  );

  return {
    success: true,
    token_payload: payload,
    sms_result: {
      messageSid: result.messageSid,
      twilioStatus: result.twilioStatus,
      to: request.approver_phone,
    },
    sms_body: smsBody,
  };
}
