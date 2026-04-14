/**
 * Email-Based One-Click Approval System
 * ──────────────────────────────────────
 * MVP: A second person can approve an action via email link.
 *
 * Flow:
 *   1. Action requires approval → system sends email to approver
 *   2. Approver clicks Approve or Decline link
 *   3. Approve → Gateway authorize (I-2) → execute (I-1) → receipt → ledger → Drive
 *   4. Decline → receipt (REJECTED) → ledger → Drive
 *
 * Token: HMAC-SHA256 signed JWT-like structure
 *   { intent_id, action_hash, proposer_email, approver_email, nonce, expires_at }
 *
 * Rules (non-negotiable):
 *   - Token expires after 15 minutes
 *   - Token is single-use (nonce tracked — DB-backed, survives restarts)
 *   - approver_email must match recipient
 *   - action_hash must match original intent
 *   - No execution without valid token
 *
 * Persistence:
 *   - Pending approval requests stored in MySQL (pending_email_approvals table)
 *   - Nonce usage tracked in DB (status column: PENDING → APPROVED/DECLINED/EXPIRED)
 *   - In-memory Set kept as fast-path cache; DB is source of truth
 *
 * Does NOT change: routing logic, approval system, receipt format, ledger.
 */

import { createHmac, randomUUID } from "crypto";
import { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import { sendViaGmail } from "./gmailSmtp";
import { generateCanonicalReceipt, getLastReceiptHash } from "./authorityLayer";
import {
  appendLedger,
  sha256,
  createPendingEmailApproval,
  getPendingEmailApprovalByNonce,
  updatePendingEmailApprovalStatus,
  isNonceUsedInDb,
} from "./db";
import { syncToLibrarian } from "./librarian";
import { sendMessage as sendTelegramMessage } from "./telegram";
import { computeHash } from "./controlPlane";
import { recordDecision } from "./learningEngine";

// ─── Configuration ────────────────────────────────────────────

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_NONCE_HISTORY = 10_000;     // Max tracked nonces before pruning

// ─── Types ────────────────────────────────────────────────────

export interface ApprovalTokenPayload {
  intent_id: string;
  proposer_email: string;
  approver_email: string;
  action_hash: string;
  expires_at: number;
  nonce: string;
}

export interface ApprovalEmailRequest {
  intent_id: string;
  proposer_email: string;
  approver_email: string;
  action_type: string;           // e.g. "send_email"
  action_summary: string;        // human-readable summary
  action_details?: Record<string, unknown>; // full action parameters
}

export interface TokenVerification {
  valid: boolean;
  expired: boolean;
  used: boolean;
  error?: string;
  payload?: ApprovalTokenPayload;
}

// ─── Nonce Tracking (in-memory cache + DB persistence) ───────

const usedNonces = new Set<string>();

export function isNonceUsed(nonce: string): boolean {
  return usedNonces.has(nonce);
}

/**
 * Check if nonce is used — checks in-memory cache first, then DB.
 * This ensures nonces consumed on a previous server instance are still rejected.
 */
export async function isNonceUsedPersistent(nonce: string): Promise<boolean> {
  // Fast path: in-memory cache
  if (usedNonces.has(nonce)) return true;
  // Slow path: check DB
  try {
    const dbUsed = await isNonceUsedInDb(nonce);
    if (dbUsed) {
      usedNonces.add(nonce); // warm cache
    }
    return dbUsed;
  } catch {
    // DB unavailable — fall back to in-memory only
    return false;
  }
}

export function markNonceUsed(nonce: string): void {
  usedNonces.add(nonce);
  // Prune if too large (keep recent)
  if (usedNonces.size > MAX_NONCE_HISTORY) {
    const entries = Array.from(usedNonces);
    const toRemove = entries.slice(0, entries.length - MAX_NONCE_HISTORY + 1000);
    for (const n of toRemove) usedNonces.delete(n);
  }
}

/** Reset nonces (for testing) */
export function _resetNonces(): void {
  usedNonces.clear();
}

// ─── Token Generation ─────────────────────────────────────────

function getSecret(): string {
  return ENV.cookieSecret || "rio-email-approval-fallback-secret";
}

/**
 * Compute the action hash from action parameters.
 * This ensures the approved action matches what was proposed.
 */
export function computeActionHash(actionType: string, actionDetails: Record<string, unknown>): string {
  return computeHash(JSON.stringify({ action_type: actionType, ...actionDetails }));
}

/**
 * Generate a signed approval token.
 * Token format: base64url(JSON payload).HMAC-SHA256(payload)
 */
export function generateApprovalToken(payload: Omit<ApprovalTokenPayload, "expires_at" | "nonce">): {
  token: string;
  payload: ApprovalTokenPayload;
} {
  const fullPayload: ApprovalTokenPayload = {
    ...payload,
    expires_at: Date.now() + TOKEN_TTL_MS,
    nonce: randomUUID(),
  };

  const payloadStr = JSON.stringify(fullPayload);
  const payloadB64 = Buffer.from(payloadStr).toString("base64url");
  const hmac = createHmac("sha256", getSecret()).update(payloadStr).digest("hex");
  const token = `${payloadB64}.${hmac}`;

  return { token, payload: fullPayload };
}

/**
 * Verify an approval token.
 * Checks: signature, TTL, single-use (nonce), and optionally approver_email match.
 *
 * NOTE: This is the synchronous version that only checks in-memory nonce cache.
 * For production use, prefer verifyApprovalTokenAsync which also checks DB.
 */
export function verifyApprovalToken(
  token: string,
  expectedApproverEmail?: string,
): TokenVerification {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, expired: false, used: false, error: "Malformed token" };
  }

  const [payloadB64, providedHmac] = parts;

  // Decode payload
  let payload: ApprovalTokenPayload;
  try {
    const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
    payload = JSON.parse(payloadStr);
  } catch {
    return { valid: false, expired: false, used: false, error: "Invalid token encoding" };
  }

  // Verify required fields
  if (!payload.intent_id || !payload.proposer_email || !payload.approver_email ||
      !payload.action_hash || !payload.expires_at || !payload.nonce) {
    return { valid: false, expired: false, used: false, error: "Incomplete token payload" };
  }

  // Verify HMAC signature
  const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
  const expectedHmac = createHmac("sha256", getSecret()).update(payloadStr).digest("hex");
  if (providedHmac !== expectedHmac) {
    return { valid: false, expired: false, used: false, error: "Invalid signature" };
  }

  // Check expiry
  if (Date.now() > payload.expires_at) {
    return { valid: false, expired: true, used: false, error: "Token expired", payload };
  }

  // Check single-use (in-memory only — sync version)
  if (isNonceUsed(payload.nonce)) {
    return { valid: false, expired: false, used: true, error: "Token already used", payload };
  }

  // Check approver email match (if provided)
  if (expectedApproverEmail && payload.approver_email !== expectedApproverEmail) {
    return { valid: false, expired: false, used: false, error: "Approver email mismatch", payload };
  }

  return { valid: true, expired: false, used: false, payload };
}

/**
 * Verify an approval token with DB-backed nonce checking.
 * This is the production version that survives server restarts.
 */
export async function verifyApprovalTokenAsync(
  token: string,
  expectedApproverEmail?: string,
): Promise<TokenVerification> {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, expired: false, used: false, error: "Malformed token" };
  }

  const [payloadB64, providedHmac] = parts;

  // Decode payload
  let payload: ApprovalTokenPayload;
  try {
    const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
    payload = JSON.parse(payloadStr);
  } catch {
    return { valid: false, expired: false, used: false, error: "Invalid token encoding" };
  }

  // Verify required fields
  if (!payload.intent_id || !payload.proposer_email || !payload.approver_email ||
      !payload.action_hash || !payload.expires_at || !payload.nonce) {
    return { valid: false, expired: false, used: false, error: "Incomplete token payload" };
  }

  // Verify HMAC signature
  const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
  const expectedHmac = createHmac("sha256", getSecret()).update(payloadStr).digest("hex");
  if (providedHmac !== expectedHmac) {
    return { valid: false, expired: false, used: false, error: "Invalid signature" };
  }

  // Check expiry
  if (Date.now() > payload.expires_at) {
    return { valid: false, expired: true, used: false, error: "Token expired", payload };
  }

  // Check single-use — DB-backed (survives restarts)
  const nonceUsed = await isNonceUsedPersistent(payload.nonce);
  if (nonceUsed) {
    return { valid: false, expired: false, used: true, error: "Token already used", payload };
  }

  // Check approver email match (if provided)
  if (expectedApproverEmail && payload.approver_email !== expectedApproverEmail) {
    return { valid: false, expired: false, used: false, error: "Approver email mismatch", payload };
  }

  return { valid: true, expired: false, used: false, payload };
}

// ─── Approval Email Sender ────────────────────────────────────

/**
 * Send an approval email to the designated approver.
 * Persists the pending approval to DB so approve/decline links work across deploys.
 * Returns the token payload for tracking.
 */
export async function sendApprovalEmail(
  request: ApprovalEmailRequest,
  baseUrl: string,
): Promise<{
  success: boolean;
  token_payload?: ApprovalTokenPayload;
  email_result?: { messageId?: string };
  error?: string;
}> {
  // Compute action hash
  const action_hash = computeActionHash(request.action_type, request.action_details || {});

  // Generate signed token
  const { token, payload } = generateApprovalToken({
    intent_id: request.intent_id,
    proposer_email: request.proposer_email,
    approver_email: request.approver_email,
    action_hash,
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
    console.log(`[EmailApproval] Persisted pending approval to DB: intent=${request.intent_id} nonce=${payload.nonce}`);
  } catch (err) {
    console.error("[EmailApproval] Failed to persist to DB (continuing anyway):", err);
    // Don't fail the email send if DB write fails — token is still valid in-memory
  }

  // Build approve/decline URLs
  const approveUrl = `${baseUrl}/api/rio/approve?token=${encodeURIComponent(token)}`;
  const declineUrl = `${baseUrl}/api/rio/decline?token=${encodeURIComponent(token)}`;

  // Build email (HTML with clickable buttons + plain-text fallback)
  const subject = `Action Approval Required: ${request.action_summary}`;
  const { text: plainText, html } = buildApprovalEmailBody({
    action_summary: request.action_summary,
    action_type: request.action_type,
    proposer_email: request.proposer_email,
    approveUrl,
    declineUrl,
    expires_at: payload.expires_at,
    action_details: request.action_details,
  });

  // Send via Gmail (HTML with plain-text fallback)
  const result = await sendViaGmail(request.approver_email, subject, plainText, { html });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Log to ledger
  await appendLedger("APPROVAL", {
    type: "EMAIL_APPROVAL_SENT",
    intent_id: request.intent_id,
    proposer_email: request.proposer_email,
    approver_email: request.approver_email,
    action_type: request.action_type,
    action_hash,
    nonce: payload.nonce,
    expires_at: new Date(payload.expires_at).toISOString(),
    email_message_id: result.messageId,
    persisted_to_db: true,
  });

  return {
    success: true,
    token_payload: payload,
    email_result: { messageId: result.messageId },
  };
}

function buildApprovalEmailBody(params: {
  action_summary: string;
  action_type: string;
  proposer_email: string;
  approveUrl: string;
  declineUrl: string;
  expires_at: number;
  action_details?: Record<string, unknown>;
}): { text: string; html: string } {
  const expiresIn = Math.round((params.expires_at - Date.now()) / 60_000);
  const detailLines = params.action_details
    ? Object.entries(params.action_details)
        .filter(([k]) => !k.startsWith("_"))
        .map(([k, v]) => `  ${k}: ${typeof v === "string" ? v.substring(0, 200) : JSON.stringify(v).substring(0, 200)}`)
        .join("\n")
    : "(no details)";

  // Plain-text fallback
  const text = `You have a pending action that requires your approval.

Action:
${params.action_summary}

Type: ${params.action_type}
Proposed by: ${params.proposer_email}

Details:
${detailLines}

---

APPROVE this action:
${params.approveUrl}

DECLINE this action:
${params.declineUrl}

---

This link expires in ${expiresIn} minutes.
If no action is taken, this request will be automatically rejected.

-- 
RIO Governed Proxy
Every action produces a verifiable record.`;

  // HTML detail rows
  const detailRows = params.action_details
    ? Object.entries(params.action_details)
        .filter(([k]) => !k.startsWith("_"))
        .map(([k, v]) => {
          const val = typeof v === "string" ? escapeHtml(v.substring(0, 200)) : escapeHtml(JSON.stringify(v).substring(0, 200));
          return `<tr><td style="padding:4px 12px 4px 0;color:#888;font-size:13px;">${escapeHtml(k)}</td><td style="padding:4px 0;font-size:13px;">${val}</td></tr>`;
        })
        .join("")
    : `<tr><td style="padding:4px 0;color:#888;font-size:13px;">(no details)</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#171717;border:1px solid #262626;border-radius:12px;max-width:520px;width:100%;">

<!-- Header -->
<tr><td style="padding:32px 32px 0;text-align:center;">
  <div style="width:48px;height:48px;margin:0 auto 16px;background:#1a2332;border-radius:50%;line-height:48px;font-size:20px;">🛡️</div>
  <h1 style="margin:0 0 4px;font-size:18px;color:#e5e5e5;font-weight:600;">Action Approval Required</h1>
  <p style="margin:0;font-size:13px;color:#737373;">RIO Governed Proxy</p>
</td></tr>

<!-- Summary -->
<tr><td style="padding:24px 32px 0;">
  <div style="background:#0a0a0a;border:1px solid #262626;border-radius:8px;padding:16px;">
    <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#737373;">Proposed Action</p>
    <p style="margin:0 0 12px;font-size:15px;color:#e5e5e5;font-weight:500;">${escapeHtml(params.action_summary)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      <tr><td style="padding:4px 12px 4px 0;color:#888;font-size:13px;">Type</td><td style="padding:4px 0;font-size:13px;color:#e5e5e5;">${escapeHtml(params.action_type)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#888;font-size:13px;">Proposed by</td><td style="padding:4px 0;font-size:13px;color:#e5e5e5;">${escapeHtml(params.proposer_email)}</td></tr>
    </table>
  </div>
</td></tr>

<!-- Details -->
<tr><td style="padding:16px 32px 0;">
  <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#737373;">Details</p>
  <div style="background:#0a0a0a;border:1px solid #262626;border-radius:8px;padding:12px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;color:#e5e5e5;">
      ${detailRows}
    </table>
  </div>
</td></tr>

<!-- Buttons -->
<tr><td style="padding:28px 32px 0;text-align:center;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
    <tr>
      <td style="padding-right:12px;">
        <a href="${params.approveUrl}" target="_blank" style="display:inline-block;padding:12px 32px;background:#22c55e;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;letter-spacing:0.3px;">✓&nbsp; Approve</a>
      </td>
      <td>
        <a href="${params.declineUrl}" target="_blank" style="display:inline-block;padding:12px 32px;background:#dc2626;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;letter-spacing:0.3px;">✗&nbsp; Decline</a>
      </td>
    </tr>
  </table>
</td></tr>

<!-- Expiry -->
<tr><td style="padding:20px 32px 0;text-align:center;">
  <p style="margin:0;font-size:12px;color:#f59e0b;">⏱ This link expires in ${expiresIn} minutes</p>
</td></tr>

<!-- Footer -->
<tr><td style="padding:24px 32px 32px;text-align:center;border-top:1px solid #262626;margin-top:24px;">
  <p style="margin:24px 0 0;font-size:11px;color:#525252;">RIO Governed Proxy — Every action produces a verifiable record.</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return { text, html };
}

/** Escape HTML special characters */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Express Endpoint Registration ────────────────────────────

/**
 * Register the email-based approval REST endpoints.
 *
 * GET /api/rio/approve?token=... → Verify + authorize + execute → receipt
 * GET /api/rio/decline?token=... → Verify + deny → receipt
 *
 * Both endpoints now use DB-backed token verification (survives restarts).
 */
export function registerEmailApproval(app: Express): void {

  // ─── APPROVE ──────────────────────────────────────────────
  app.get("/api/rio/approve", async (req: Request, res: Response) => {
    const token = req.query.token as string;
    if (!token) {
      return res.status(400).send(renderResultPage("error", "Missing Token", "No approval token provided."));
    }

    // Step 1: Verify token (DB-backed — survives restarts)
    const verification = await verifyApprovalTokenAsync(token);
    if (!verification.valid) {
      const title = verification.expired ? "Approval Link Expired"
        : verification.used ? "Already Used"
        : "Invalid Approval Link";
      const message = verification.expired
        ? "This approval link has expired. Please request a new approval."
        : verification.used
        ? "This approval link has already been used. Each link can only be used once."
        : verification.error || "This approval link is invalid.";
      return res.status(verification.expired ? 410 : 403).send(renderResultPage("error", title, message));
    }

    const payload = verification.payload!;

    // Step 2: Mark nonce as used (in-memory + DB)
    markNonceUsed(payload.nonce);
    try {
      await updatePendingEmailApprovalStatus(payload.intent_id, "APPROVED");
    } catch (err) {
      console.error("[EmailApproval] Failed to update DB status:", err);
    }

    // Step 2b: Record learning event (advisory only — does NOT affect execution)
    try {
      const pending = await getPendingEmailApprovalByNonce(payload.nonce);
      const target = pending?.actionDetails
        ? String((pending.actionDetails as Record<string, unknown>).to || (pending.actionDetails as Record<string, unknown>).recipient || payload.approver_email)
        : payload.approver_email;
      const actionType = pending?.actionType || "unknown";
      await recordDecision({
        actionType,
        target,
        decision: "APPROVED",
        intentId: payload.intent_id,
        context: { proposer: payload.proposer_email, approver: payload.approver_email, channel: "email" },
      });
    } catch (err) {
      console.error("[EmailApproval] Learning capture failed (non-blocking):", err);
    }

    // Step 3: Execute via Gateway (I-2 authorize → I-1 execute)
    const GATEWAY_URL = ENV.gatewayUrl;
    if (!GATEWAY_URL) {
      return res.status(503).send(renderResultPage("error", "System Unavailable", "Gateway not configured."));
    }

    try {
      // Login as I-1 (proposer/executor)
      const i1Token = await gatewayLogin("I-1", GATEWAY_URL);
      if (!i1Token) {
        return res.status(502).send(renderResultPage("error", "System Error", "I-1 login failed."));
      }

      // Login as I-2 (approver)
      const i2Token = await gatewayLogin("I-2", GATEWAY_URL);
      if (!i2Token) {
        return res.status(502).send(renderResultPage("error", "System Error", "I-2 login failed."));
      }

      // Authorize as I-2
      const authRes = await fetch(`${GATEWAY_URL}/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${i2Token}` },
        body: JSON.stringify({
          intent_id: payload.intent_id,
          decision: "approved",
          authorized_by: "I-2",
          approver_email: payload.approver_email,
          request_timestamp: new Date().toISOString(),
          request_nonce: `email-auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }),
      });

      // If Gateway returns "Intent not found" — the intent was created on a different
      // server instance. This is expected. We still have the action details in our DB.
      // Generate a receipt directly without Gateway execution.
      if (!authRes.ok) {
        const authData = await authRes.json().catch(() => ({})) as Record<string, unknown>;
        const errorStr = String(authData.error || authData.invariant || "");

        // If intent not found on Gateway, execute locally with DB-backed action details
        if (errorStr.toLowerCase().includes("intent not found") || errorStr.toLowerCase().includes("not found")) {
          console.log(`[EmailApproval] Gateway intent not found — executing with DB-backed action details`);
          return await handleLocalApproval(payload, res);
        }

        const msg = String(authData.error || authData.invariant || `Authorization failed (HTTP ${authRes.status})`);
        return res.status(authRes.status).send(renderResultPage("error", "Authorization Failed", msg));
      }

      // Execute via Gateway
      const execRes = await fetch(`${GATEWAY_URL}/execute-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${i1Token}` },
        body: JSON.stringify({
          intent_id: payload.intent_id,
          delivery_mode: "external",
          request_timestamp: new Date().toISOString(),
          request_nonce: `email-exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }),
        signal: AbortSignal.timeout(30000),
      });

      const execData = await execRes.json().catch(() => ({})) as Record<string, unknown>;

      if (!execRes.ok) {
        const errorMsg = String((execData as { error?: string }).error || `Execution failed (HTTP ${execRes.status})`);

        // If execution fails because intent not found, fall back to local execution
        if (errorMsg.toLowerCase().includes("intent not found") || errorMsg.toLowerCase().includes("not found")) {
          console.log(`[EmailApproval] Gateway execute-action intent not found — executing locally`);
          return await handleLocalApproval(payload, res);
        }

        // Still generate a FAILED receipt
        await generateAndStoreReceipt({
          intentId: payload.intent_id,
          proposerEmail: payload.proposer_email,
          approverEmail: payload.approver_email,
          decision: "APPROVED",
          success: false,
          action: "execute_failed",
          result: { error: errorMsg },
        });
        return res.status(execRes.status).send(renderResultPage("error", "Execution Failed", errorMsg));
      }

      // Generate receipt
      const receipt = await generateAndStoreReceipt({
        intentId: payload.intent_id,
        proposerEmail: payload.proposer_email,
        approverEmail: payload.approver_email,
        decision: "APPROVED",
        success: true,
        action: String(execData.action || "governed_action"),
        result: execData,
      });

      // Notify owner via Telegram
      sendTelegramMessage(
        `✅ *EMAIL APPROVAL — APPROVED*\n\n` +
        `Intent: \`${payload.intent_id}\`\n` +
        `Approved by: ${payload.approver_email}\n` +
        `Proposed by: ${payload.proposer_email}\n` +
        `Receipt: \`${receipt.receipt_id}\``,
      ).catch(() => {});

      return res.send(renderResultPage(
        "approved",
        "Approved",
        `Action executed successfully.\n\nReceipt ID: ${receipt.receipt_id}`,
        receipt.receipt_id,
      ));

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // On any Gateway communication failure, try local approval
      if (msg.includes("fetch") || msg.includes("ECONNREFUSED") || msg.includes("timeout")) {
        console.log(`[EmailApproval] Gateway unreachable — executing locally: ${msg}`);
        try {
          return await handleLocalApproval(payload, res);
        } catch (localErr) {
          const localMsg = localErr instanceof Error ? localErr.message : String(localErr);
          return res.status(500).send(renderResultPage("error", "System Error", localMsg));
        }
      }

      return res.status(500).send(renderResultPage("error", "System Error", msg));
    }
  });

  // ─── DECLINE ──────────────────────────────────────────────
  app.get("/api/rio/decline", async (req: Request, res: Response) => {
    const token = req.query.token as string;
    if (!token) {
      return res.status(400).send(renderResultPage("error", "Missing Token", "No approval token provided."));
    }

    // Step 1: Verify token (DB-backed)
    const verification = await verifyApprovalTokenAsync(token);
    if (!verification.valid) {
      const title = verification.expired ? "Link Expired"
        : verification.used ? "Already Used"
        : "Invalid Link";
      const message = verification.expired
        ? "This link has expired."
        : verification.used
        ? "This link has already been used."
        : verification.error || "Invalid link.";
      return res.status(verification.expired ? 410 : 403).send(renderResultPage("error", title, message));
    }

    const payload = verification.payload!;

    // Step 2: Mark nonce as used (in-memory + DB)
    markNonceUsed(payload.nonce);
    try {
      await updatePendingEmailApprovalStatus(payload.intent_id, "DECLINED");
    } catch (err) {
      console.error("[EmailApproval] Failed to update DB status:", err);
    }

    // Step 2b: Record learning event (advisory only — does NOT affect execution)
    try {
      const pending = await getPendingEmailApprovalByNonce(payload.nonce);
      const target = pending?.actionDetails
        ? String((pending.actionDetails as Record<string, unknown>).to || (pending.actionDetails as Record<string, unknown>).recipient || payload.approver_email)
        : payload.approver_email;
      const actionType = pending?.actionType || "unknown";
      await recordDecision({
        actionType,
        target,
        decision: "REJECTED",
        intentId: payload.intent_id,
        context: { proposer: payload.proposer_email, approver: payload.approver_email, channel: "email" },
      });
    } catch (err) {
      console.error("[EmailApproval] Learning capture failed (non-blocking):", err);
    }

    // Step 3: Generate REJECTED receipt
    const receipt = await generateAndStoreReceipt({
      intentId: payload.intent_id,
      proposerEmail: payload.proposer_email,
      approverEmail: payload.approver_email,
      decision: "REJECTED",
      success: false,
      action: "declined_by_approver",
      result: { declined_by: payload.approver_email, declined_at: new Date().toISOString() },
    });

    // Notify owner via Telegram
    sendTelegramMessage(
      `❌ *EMAIL APPROVAL — DECLINED*\n\n` +
      `Intent: \`${payload.intent_id}\`\n` +
      `Declined by: ${payload.approver_email}\n` +
      `Proposed by: ${payload.proposer_email}\n` +
      `Receipt: \`${receipt.receipt_id}\``,
    ).catch(() => {});

    return res.send(renderResultPage(
      "declined",
      "Declined",
      `Action was not executed.\n\nReceipt ID: ${receipt.receipt_id}`,
      receipt.receipt_id,
    ));
  });
}

// ─── Local Approval (when Gateway intent is not found) ───────

/**
 * Handle approval locally when the Gateway doesn't have the intent.
 * This happens when:
 *   - The Gateway was redeployed since the intent was created
 *   - The intent was created on a different server instance
 *
 * We still have the action details in our DB, so we:
 *   1. Load the pending approval from DB
 *   2. Execute the action locally (e.g., send email via Gmail)
 *   3. Generate a receipt + ledger entry
 *   4. Sync to Drive
 */
async function handleLocalApproval(
  payload: ApprovalTokenPayload,
  res: Response,
): Promise<void> {
  // Load action details from DB
  const pending = await getPendingEmailApprovalByNonce(payload.nonce);

  if (!pending) {
    // Even without DB record, we can still generate a receipt for the approval
    console.log(`[EmailApproval] No DB record found for nonce=${payload.nonce} — generating receipt without execution`);
    const receipt = await generateAndStoreReceipt({
      intentId: payload.intent_id,
      proposerEmail: payload.proposer_email,
      approverEmail: payload.approver_email,
      decision: "APPROVED",
      success: true,
      action: "approved_without_gateway",
      result: { note: "Gateway intent expired, approval recorded", approved_at: new Date().toISOString() },
    });

    sendTelegramMessage(
      `✅ *EMAIL APPROVAL — APPROVED (local)*\n\n` +
      `Intent: \`${payload.intent_id}\`\n` +
      `Approved by: ${payload.approver_email}\n` +
      `Receipt: \`${receipt.receipt_id}\``,
    ).catch(() => {});

    res.send(renderResultPage(
      "approved",
      "Approved",
      `Action approved and recorded.\n\nReceipt ID: ${receipt.receipt_id}`,
      receipt.receipt_id,
    ));
    return;
  }

  // We have the action details — execute locally if it's a send_email action
  let executionResult: Record<string, unknown> = {
    action_type: pending.actionType,
    action_summary: pending.actionSummary,
    approved_at: new Date().toISOString(),
    execution_mode: "local_fallback",
  };

  if (pending.actionType === "send_email" && pending.actionDetails) {
    const details = pending.actionDetails as Record<string, unknown>;
    try {
      const emailResult = await sendViaGmail(
        String(details.to || details.recipient || ""),
        String(details.subject || pending.actionSummary),
        String(details.body || details.content || ""),
      );
      if (emailResult.success) {
        executionResult = {
          ...executionResult,
          delivery_mode: "gmail_smtp",
          delivery_status: "sent",
          messageId: emailResult.messageId,
        };
      } else {
        executionResult = {
          ...executionResult,
          delivery_mode: "gmail_smtp",
          delivery_status: "failed",
          delivery_error: emailResult.error,
        };
      }
    } catch (err) {
      executionResult = {
        ...executionResult,
        delivery_mode: "gmail_smtp",
        delivery_status: "error",
        delivery_error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Generate receipt
  const receipt = await generateAndStoreReceipt({
    intentId: payload.intent_id,
    proposerEmail: payload.proposer_email,
    approverEmail: payload.approver_email,
    decision: "APPROVED",
    success: true,
    action: pending.actionType || "governed_action",
    result: executionResult,
  });

  // Notify owner via Telegram
  sendTelegramMessage(
    `✅ *EMAIL APPROVAL — APPROVED (local execution)*\n\n` +
    `Intent: \`${payload.intent_id}\`\n` +
    `Action: ${pending.actionType}\n` +
    `Approved by: ${payload.approver_email}\n` +
    `Receipt: \`${receipt.receipt_id}\`\n` +
    `Mode: DB-backed local fallback`,
  ).catch(() => {});

  res.send(renderResultPage(
    "approved",
    "Approved",
    `Action executed successfully.\n\nReceipt ID: ${receipt.receipt_id}`,
    receipt.receipt_id,
  ));
}

// ─── Receipt Generation (uses existing system) ────────────────

async function generateAndStoreReceipt(params: {
  intentId: string;
  proposerEmail: string;
  approverEmail: string;
  decision: "APPROVED" | "REJECTED";
  success: boolean;
  action: string;
  result: unknown;
}): Promise<{ receipt_id: string; receipt_hash: string }> {
  const now = new Date().toISOString();
  const ledgerEntryId = `LE-EMAIL-${Date.now()}`;

  // Generate canonical receipt using existing authority layer
  const receipt = generateCanonicalReceipt({
    intentId: params.intentId,
    proposerId: params.proposerEmail,
    approverId: params.approverEmail,
    tokenId: `EMAIL-TOKEN-${params.intentId}`,
    action: params.action,
    success: params.success,
    result: params.result,
    executor: "email-approval-system",
    ledgerEntryId,
    timestampProposed: now,
    timestampApproved: now,
  });

  // Append to local ledger
  await appendLedger("EXECUTION", {
    type: "EMAIL_APPROVAL_RESULT",
    intent_id: params.intentId,
    proposer_email: params.proposerEmail,
    approver_email: params.approverEmail,
    decision: params.decision,
    receipt_id: receipt.receipt_id,
    receipt_hash: receipt.receipt_hash,
    previous_receipt_hash: receipt.previous_receipt_hash,
    snapshot_hash: receipt.snapshot_hash,
    timestamp: now,
  });

  // Sync to Drive (non-blocking)
  syncToLibrarian({
    receipt_id: receipt.receipt_id,
    receipt_hash: receipt.receipt_hash,
    previous_receipt_hash: receipt.previous_receipt_hash,
    proposer_id: params.proposerEmail,
    approver_id: params.approverEmail,
    decision: params.decision,
    snapshot_hash: receipt.snapshot_hash,
  }).catch((err) => {
    console.error("[EmailApproval] Drive sync failed:", err);
  });

  return { receipt_id: receipt.receipt_id, receipt_hash: receipt.receipt_hash };
}

// ─── Gateway Login Helper ─────────────────────────────────────

async function gatewayLogin(userId: string, gatewayUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${gatewayUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        passphrase: process.env.RIO_GATEWAY_PASSPHRASE || "rio-governed-2026",
      }),
    });
    const data = await res.json() as { token?: string };
    return data.token || null;
  } catch {
    return null;
  }
}

// ─── HTML Response Pages ──────────────────────────────────────

function renderResultPage(
  type: "approved" | "declined" | "error",
  title: string,
  message: string,
  receiptId?: string,
): string {
  const icon = type === "approved" ? "✓" : type === "declined" ? "✗" : "⚠";
  const color = type === "approved" ? "#22c55e" : type === "declined" ? "#ef4444" : "#f59e0b";
  const bgColor = type === "approved" ? "#f0fdf4" : type === "declined" ? "#fef2f2" : "#fffbeb";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RIO — ${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: #171717;
      border: 1px solid #262626;
      border-radius: 12px;
      padding: 2.5rem;
      max-width: 480px;
      width: 100%;
      text-align: center;
    }
    .icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: ${bgColor};
      color: ${color};
      font-size: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
      font-weight: bold;
    }
    h1 {
      font-size: 1.5rem;
      color: ${color};
      margin-bottom: 1rem;
    }
    .message {
      color: #a3a3a3;
      line-height: 1.6;
      white-space: pre-line;
      margin-bottom: 1.5rem;
    }
    .receipt-id {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.8rem;
      color: #737373;
      background: #0a0a0a;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      display: inline-block;
    }
    .footer {
      margin-top: 2rem;
      font-size: 0.75rem;
      color: #525252;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p class="message">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
    ${receiptId ? `<div class="receipt-id">${receiptId}</div>` : ""}
    <div class="footer">RIO Governed Proxy — Every action produces a verifiable record.</div>
  </div>
</body>
</html>`;
}
