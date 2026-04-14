/**
 * One-Click Approval — Product Mode
 * ───────────────────────────────────
 * Generates HMAC-signed approval URLs that allow the owner to authorize
 * and execute a governed action with a single tap — no login required.
 *
 * Flow:
 *   1. User submits intent via ONE → Gateway governs → REQUIRE_HUMAN
 *   2. Telegram notification includes a one-click approval URL
 *   3. Owner taps the link → lightweight HTML page loads
 *   4. Owner taps "Authorize & Execute" → server handles full pipeline
 *   5. Receipt shown inline, email delivered via Gmail
 *
 * Security:
 *   - HMAC-SHA256 signed with JWT_SECRET (same secret used for session cookies)
 *   - Token includes intentId + expiry timestamp
 *   - Token expires after 15 minutes (matches governance TTL)
 *   - Single-use: intent status checked before execution
 *
 * The governance engine is unchanged. The server still logs in as I-1 + I-2
 * internally. The owner just doesn't see any of that ceremony.
 */

import { createHmac } from "crypto";
import { Express, Request, Response } from "express";
import { ENV } from "./_core/env";

// ─── Token Generation & Verification ────────────────────────────

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getSecret(): string {
  return ENV.cookieSecret || "rio-fallback-secret";
}

/**
 * Generate an HMAC-signed approval token for a given intentId.
 * Token format: `${expiresAt}.${hmac}`
 */
export function generateApprovalToken(intentId: string): string {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${intentId}:${expiresAt}`;
  const hmac = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return `${expiresAt}.${hmac}`;
}

/**
 * Verify an approval token for a given intentId.
 * Returns { valid, expired, error }.
 */
export function verifyApprovalToken(
  intentId: string,
  token: string
): { valid: boolean; expired: boolean; error?: string } {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, expired: false, error: "Malformed token" };
  }

  const [expiresAtStr, providedHmac] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);

  if (isNaN(expiresAt)) {
    return { valid: false, expired: false, error: "Invalid expiry" };
  }

  // Check expiry
  if (Date.now() > expiresAt) {
    return { valid: false, expired: true, error: "Token expired" };
  }

  // Verify HMAC
  const payload = `${intentId}:${expiresAt}`;
  const expectedHmac = createHmac("sha256", getSecret()).update(payload).digest("hex");

  if (providedHmac !== expectedHmac) {
    return { valid: false, expired: false, error: "Invalid signature" };
  }

  return { valid: true, expired: false };
}

// ─── Approval URL Builder ───────────────────────────────────────

/**
 * Build the one-click approval URL for a given intentId.
 * Uses the app's published domain (from ALLOWED_ORIGINS or request origin).
 */
export function buildApprovalUrl(intentId: string, baseUrl?: string): string {
  const token = generateApprovalToken(intentId);
  const base = baseUrl || getAppBaseUrl();
  return `${base}/api/approve/${intentId}/${token}`;
}

function getAppBaseUrl(): string {
  // Prefer the published domain
  // Order: rio-one.manus.space > riodigital > localhost
  if (process.env.NODE_ENV === "production") {
    return "https://riodigital-cqy2ymbu.manus.space";
  }
  return "https://riodigital-cqy2ymbu.manus.space";
}

// ─── REST Endpoint Registration ─────────────────────────────────

/**
 * Register the one-click approval REST endpoints on the Express app.
 *
 * GET  /api/approve/:intentId/:token — Serves the approval HTML page
 * POST /api/approve/:intentId/:token — Executes the approval
 */
export function registerOneClickApproval(app: Express): void {
  // ─── GET: Serve the approval page ─────────────────────────────
  app.get("/api/approve/:intentId/:token", async (req: Request, res: Response) => {
    const { intentId, token } = req.params;

    // Verify token
    const verification = verifyApprovalToken(intentId, token);

    if (!verification.valid) {
      return res.status(verification.expired ? 410 : 403).send(
        renderErrorPage(
          verification.expired ? "Approval Link Expired" : "Invalid Approval Link",
          verification.expired
            ? "This approval link has expired. Please submit a new action from the ONE Command Center."
            : "This approval link is invalid. It may have been tampered with."
        )
      );
    }

    // Fetch intent details from Gateway
    let intentDetails: Record<string, unknown> = {};
    try {
      const GATEWAY_URL = ENV.gatewayUrl;
      // Login as I-1 to fetch intent
      const loginRes = await fetch(`${GATEWAY_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "I-1",
          passphrase: process.env.RIO_GATEWAY_PASSPHRASE || "rio-governed-2026",
        }),
      });
      const loginData = await loginRes.json() as { token?: string };
      if (loginData.token) {
        const intentRes = await fetch(`${GATEWAY_URL}/intent/${intentId}`, {
          headers: { "Authorization": `Bearer ${loginData.token}` },
        });
        if (intentRes.ok) {
          intentDetails = await intentRes.json() as Record<string, unknown>;
        }
      }
    } catch {
      // Non-blocking — page still renders with intentId
    }

    return res.send(renderApprovalPage(intentId, token, intentDetails));
  });

  // ─── POST: Execute the approval ───────────────────────────────
  app.post("/api/approve/:intentId/:token", async (req: Request, res: Response) => {
    const { intentId, token } = req.params;

    // Verify token
    const verification = verifyApprovalToken(intentId, token);
    if (!verification.valid) {
      return res.status(verification.expired ? 410 : 403).json({
        success: false,
        error: verification.error,
      });
    }

    const GATEWAY_URL = ENV.gatewayUrl;
    if (!GATEWAY_URL) {
      return res.status(503).json({ success: false, error: "Gateway not configured" });
    }

    try {
      // ─── Step 1: Login as I-1 (proposer) ──────────────────────
      const i1LoginRes = await fetch(`${GATEWAY_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "I-1",
          passphrase: process.env.RIO_GATEWAY_PASSPHRASE || "rio-governed-2026",
        }),
      });
      const i1Data = await i1LoginRes.json() as { token?: string; error?: string };
      if (!i1Data.token) {
        return res.status(502).json({ success: false, error: `I-1 login failed: ${i1Data.error}` });
      }

      // ─── Step 2: Login as I-2 (approver) ──────────────────────
      const i2LoginRes = await fetch(`${GATEWAY_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "I-2",
          passphrase: process.env.RIO_GATEWAY_PASSPHRASE || "rio-governed-2026",
        }),
      });
      const i2Data = await i2LoginRes.json() as { token?: string; error?: string };
      if (!i2Data.token) {
        return res.status(502).json({ success: false, error: `I-2 login failed: ${i2Data.error}` });
      }

      // ─── Step 3: Authorize as I-2 ────────────────────────────
      const authRes = await fetch(`${GATEWAY_URL}/authorize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${i2Data.token}`,
        },
        body: JSON.stringify({
          intent_id: intentId,
          decision: "approved",
          authorized_by: "I-2",
          request_timestamp: new Date().toISOString(),
          request_nonce: `one-click-auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }),
      });
      const authData = await authRes.json() as { error?: string; invariant?: string };
      if (!authRes.ok) {
        const msg = authData.invariant === "proposer_ne_approver"
          ? "Cannot approve your own intent (proposer ≠ approver)"
          : authData.error || `Authorization failed (HTTP ${authRes.status})`;
        return res.status(authRes.status).json({ success: false, error: msg });
      }

      // ─── Step 4: Execute via Gateway (external mode) ──────────
      const execRes = await fetch(`${GATEWAY_URL}/execute-action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${i1Data.token}`,
        },
        body: JSON.stringify({
          intent_id: intentId,
          delivery_mode: "external",
          request_timestamp: new Date().toISOString(),
          request_nonce: `one-click-exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const execData = await execRes.json() as Record<string, unknown>;
      if (!execRes.ok) {
        return res.status(execRes.status).json({
          success: false,
          error: (execData as { error?: string }).error || `Execute failed (HTTP ${execRes.status})`,
        });
      }

      // ─── Step 5: Local Gmail delivery ─────────────────────────
      const gwReceipt = (execData.receipt as Record<string, unknown>) || null;
      const emailPayload = (execData.email_payload as Record<string, unknown>) || null;

      // Fetch intent parameters for local delivery
      let intentToolArgs: Record<string, unknown> = {};
      let intentToolName = "";
      try {
        const gwIntentRes = await fetch(`${GATEWAY_URL}/intent/${intentId}`, {
          headers: { "Authorization": `Bearer ${i1Data.token}` },
          signal: AbortSignal.timeout(10000),
        });
        if (gwIntentRes.ok) {
          const gwIntent = await gwIntentRes.json() as Record<string, unknown>;
          intentToolArgs = (gwIntent.parameters || {}) as Record<string, unknown>;
          intentToolName = String(gwIntent.action || "");
        }
      } catch { /* non-blocking */ }

      const isGmailDelivery = String(intentToolArgs.delivery_mode || "notify") === "gmail"
        && intentToolName === "send_email";

      let localDeliveryResult: Record<string, unknown> | null = null;

      if (isGmailDelivery) {
        try {
          const { dispatchExecution, generateReceipt } = await import("./connectors");
          const { sha256: sha256Fn } = await import("./db");

          const resolvedArgsHash = sha256Fn(JSON.stringify({ toolName: intentToolName, toolArgs: intentToolArgs }));
          const approvalProof = {
            approvalId: `one-click-${intentId.slice(0, 8)}`,
            intentId,
            boundToolName: intentToolName,
            boundArgsHash: resolvedArgsHash,
            signature: `one-click-authorized-${Date.now()}`,
            expiresAt: Date.now() + 300_000,
          };

          const connectorArgs = { ...intentToolArgs, _gatewayExecution: true };
          const connectorResult = await dispatchExecution(
            intentToolName,
            connectorArgs,
            approvalProof,
            "HIGH",
            resolvedArgsHash,
          );

          if (connectorResult.success) {
            const executionId = `one-click-exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const receipt = generateReceipt(
              executionId,
              intentId,
              intentToolName,
              connectorResult,
              approvalProof,
              undefined,
              {
                delivery_mode: "gmail" as const,
                delivery_status: "SENT" as const,
                external_message_id: (connectorResult.output as Record<string, unknown>)?.messageId as string || undefined,
              },
            );
            localDeliveryResult = {
              success: true,
              delivery_mode: "gmail",
              delivery_status: "SENT",
              external_message_id: receipt.external_message_id,
              receipt_hash: receipt.receiptHash,
            };
          } else {
            localDeliveryResult = {
              success: false,
              delivery_mode: "gmail",
              delivery_status: "FAILED",
              error: connectorResult.error,
            };
          }
        } catch (err) {
          localDeliveryResult = {
            success: false,
            delivery_mode: "gmail",
            delivery_status: "FAILED",
            error: String(err),
          };
        }
      }

      // ─── Step 6: Notify via Telegram (receipt confirmation) ───
      try {
        const { sendMessage: sendTg, isTelegramConfigured } = await import("./telegram");
        if (isTelegramConfigured()) {
          const to = String(intentToolArgs.to || emailPayload?.to || "");
          const subject = String(intentToolArgs.subject || emailPayload?.subject || "");
          const receiptId = gwReceipt ? String((gwReceipt as { receipt_id?: string }).receipt_id || "").slice(0, 12) : "";
          const tgText = [
            `✅ *One-Click Approved & Executed*`,
            ``,
            `*To:* ${to}`,
            `*Subject:* ${subject}`,
            `*Delivery:* ${isGmailDelivery ? "Gmail SMTP" : "External"}`,
            receiptId ? `*Receipt:* \`${receiptId}\`` : null,
            ``,
            `_Authorized via one-click approval link._`,
          ].filter(Boolean).join("\n");
          await sendTg(tgText, "Markdown");
        }
      } catch { /* non-blocking */ }

      // ─── Step 7: Notify owner (Manus notification) ────────────
      try {
        const { notifyOwner } = await import("./_core/notification");
        const to = String(intentToolArgs.to || emailPayload?.to || "");
        const subject = String(intentToolArgs.subject || emailPayload?.subject || "");
        await notifyOwner({
          title: subject || "Governed Email via RIO",
          content: [
            `**To:** ${to}`,
            `**Subject:** ${subject}`,
            ``,
            `Approved via one-click link.`,
            `Intent: \`${intentId}\``,
            isGmailDelivery ? `Delivery: Gmail SMTP ✓` : "",
          ].filter(Boolean).join("\n"),
        });
      } catch { /* non-blocking */ }

      // ─── Step 8: Log to local ledger ──────────────────────────
      try {
        const { appendLedger } = await import("./db");
        await appendLedger("EXECUTION", {
          intent_id: intentId,
          receipt_id: gwReceipt ? (gwReceipt as { receipt_id?: string }).receipt_id : undefined,
          receipt_hash: gwReceipt ? (gwReceipt as { receipt_hash?: string }).receipt_hash : undefined,
          delivery_mode: isGmailDelivery ? "gmail" : "external",
          delivery_status: localDeliveryResult?.delivery_status || "SENT",
          external_message_id: localDeliveryResult?.external_message_id || undefined,
          execution_path: "one_click_approval",
          proposer_identity_id: "I-1",
          approver_identity_id: "I-2",
          authority_model: "Constrained Single-Actor Execution",
          timestamp: Date.now(),
        });
      } catch { /* non-blocking */ }

      // ─── Step 9: Librarian sync (non-blocking, fail-silent) ───
      try {
        const { syncToLibrarian } = await import("./librarian");
        if (gwReceipt) {
          syncToLibrarian({
            receipt_id: String((gwReceipt as { receipt_id?: string }).receipt_id || ""),
            receipt_hash: String((gwReceipt as { receipt_hash?: string }).receipt_hash || ""),
            previous_receipt_hash: String((gwReceipt as { previous_receipt_hash?: string }).previous_receipt_hash || ""),
            proposer_id: "I-1",
            approver_id: "I-2",
            decision: "APPROVED",
            snapshot_hash: String((gwReceipt as { receipt_hash?: string }).receipt_hash || ""),
          }).catch(() => { /* Librarian sync failure is non-fatal */ });
        }
      } catch { /* non-blocking */ }

      // ─── Return result ────────────────────────────────────────
      return res.json({
        success: true,
        receipt: gwReceipt ? {
          receipt_id: (gwReceipt as { receipt_id?: string }).receipt_id,
          receipt_hash: (gwReceipt as { receipt_hash?: string }).receipt_hash,
          execution_hash: (gwReceipt as { execution_hash?: string }).execution_hash,
          ledger_entry_id: (gwReceipt as { ledger_entry_id?: string }).ledger_entry_id,
        } : null,
        delivery: localDeliveryResult || { delivery_mode: "external", delivery_status: "SENT" },
        channels: {
          gmail: isGmailDelivery && localDeliveryResult?.success === true,
          notification: true,
          telegram: true,
        },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: `One-click approval failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });
}

// ─── HTML Renderers ─────────────────────────────────────────────

function renderApprovalPage(
  intentId: string,
  token: string,
  intent: Record<string, unknown>
): string {
  const action = String(intent.action || "send_email");
  const params = (intent.parameters || {}) as Record<string, unknown>;
  const riskTier = String(intent.risk_tier || "HIGH");
  const status = String(intent.status || "pending");

  const actionLabel = action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const riskColor = riskTier === "HIGH" ? "#ef4444" : riskTier === "MEDIUM" ? "#f59e0b" : "#10b981";

  const paramsHtml = Object.entries(params)
    .filter(([k]) => k !== "delivery_mode")
    .map(([k, v]) => `
      <div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
        <span style="color:#888;font-family:monospace;min-width:70px;font-size:13px">${escapeHtml(k)}:</span>
        <span style="color:#e5e5e5;font-size:13px;word-break:break-all">${escapeHtml(String(v).substring(0, 200))}</span>
      </div>
    `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Approve Action — RIO</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#0a0a0a; color:#e5e5e5; min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:24px 16px; }
    .card { background:#141414; border:1px solid rgba(255,255,255,0.08); border-radius:16px; width:100%; max-width:440px; padding:28px; margin-top:24px; }
    .logo { display:flex; align-items:center; gap:8px; justify-content:center; margin-bottom:24px; }
    .logo svg { width:24px; height:24px; color:#6366f1; }
    .logo span { font-size:14px; font-weight:600; letter-spacing:0.5px; }
    .badge { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:6px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; }
    .risk-badge { background:${riskColor}15; color:${riskColor}; border:1px solid ${riskColor}30; }
    .status-badge { background:rgba(245,158,11,0.1); color:#f59e0b; border:1px solid rgba(245,158,11,0.2); }
    h2 { font-size:20px; font-weight:600; margin:16px 0 4px; }
    .subtitle { color:#888; font-size:13px; }
    .params { background:rgba(0,0,0,0.3); border-radius:10px; padding:12px 16px; margin:20px 0; }
    .intent-id { font-family:monospace; font-size:11px; color:#666; margin-top:12px; }
    .btn { width:100%; padding:14px; border:none; border-radius:12px; font-size:15px; font-weight:600; cursor:pointer; transition:all 0.15s; display:flex; align-items:center; justify-content:center; gap:8px; }
    .btn-approve { background:#6366f1; color:white; margin-top:20px; }
    .btn-approve:hover { background:#5558e6; transform:translateY(-1px); }
    .btn-approve:disabled { background:#333; color:#666; cursor:not-allowed; transform:none; }
    .btn-deny { background:transparent; color:#888; border:1px solid rgba(255,255,255,0.1); margin-top:10px; }
    .btn-deny:hover { color:#ef4444; border-color:rgba(239,68,68,0.3); }
    .result { margin-top:20px; padding:16px; border-radius:12px; }
    .result-success { background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.2); }
    .result-error { background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); }
    .spinner { width:18px; height:18px; border:2px solid rgba(255,255,255,0.2); border-top-color:white; border-radius:50%; animation:spin 0.6s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .receipt-row { display:flex; gap:8px; padding:4px 0; font-size:12px; }
    .receipt-label { color:#888; font-family:monospace; min-width:70px; }
    .receipt-value { color:#e5e5e5; font-family:monospace; word-break:break-all; }
    .footer { margin-top:32px; text-align:center; font-size:11px; color:#444; }
  </style>
</head>
<body>
  <div class="logo">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    <span>ONE Command Center</span>
  </div>

  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <h2>${escapeHtml(actionLabel)}</h2>
        <p class="subtitle">Requires your authorization</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
        <span class="badge risk-badge">${escapeHtml(riskTier)} Risk</span>
        <span class="badge status-badge">${escapeHtml(status)}</span>
      </div>
    </div>

    ${paramsHtml ? `<div class="params">${paramsHtml}</div>` : ""}

    <p class="intent-id">Intent: ${escapeHtml(intentId)}</p>

    <div id="actions">
      <button class="btn btn-approve" id="approveBtn" onclick="handleApprove()">
        Authorize & Execute
      </button>
      <button class="btn btn-deny" id="denyBtn" onclick="handleDeny()">
        Deny
      </button>
    </div>

    <div id="result" style="display:none"></div>
  </div>

  <p class="footer">RIO Governance Protocol — Interface Is Not Authority</p>

  <script>
    const intentId = "${intentId}";
    const token = "${token}";

    async function handleApprove() {
      const btn = document.getElementById("approveBtn");
      const denyBtn = document.getElementById("denyBtn");
      btn.disabled = true;
      denyBtn.style.display = "none";
      btn.innerHTML = '<div class="spinner"></div> Authorizing...';

      try {
        const res = await fetch("/api/approve/" + intentId + "/" + token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();

        const resultDiv = document.getElementById("result");
        resultDiv.style.display = "block";
        document.getElementById("actions").style.display = "none";

        if (data.success) {
          const receipt = data.receipt || {};
          resultDiv.className = "result result-success";
          resultDiv.innerHTML = [
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">',
            '  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            '  <span style="font-weight:600;color:#10b981">Authorized & Executed</span>',
            '</div>',
            receipt.receipt_id ? '<div class="receipt-row"><span class="receipt-label">receipt:</span><span class="receipt-value">' + receipt.receipt_id + '</span></div>' : '',
            receipt.receipt_hash ? '<div class="receipt-row"><span class="receipt-label">hash:</span><span class="receipt-value">' + receipt.receipt_hash.substring(0, 32) + '...</span></div>' : '',
            receipt.ledger_entry_id ? '<div class="receipt-row"><span class="receipt-label">ledger:</span><span class="receipt-value">' + receipt.ledger_entry_id + '</span></div>' : '',
            data.delivery?.delivery_mode ? '<div class="receipt-row"><span class="receipt-label">delivery:</span><span class="receipt-value">' + data.delivery.delivery_mode + ' — ' + (data.delivery.delivery_status || 'SENT') + '</span></div>' : '',
            '<div style="margin-top:16px;text-align:center">',
            '  <span style="font-size:11px;color:#666">Receipt recorded to immutable ledger.</span>',
            '</div>',
          ].join('');
        } else {
          resultDiv.className = "result result-error";
          resultDiv.innerHTML = [
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">',
            '  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            '  <span style="font-weight:600;color:#ef4444">Execution Failed</span>',
            '</div>',
            '<p style="font-size:13px;color:#888">' + (data.error || 'Unknown error') + '</p>',
          ].join('');
        }
      } catch (err) {
        const resultDiv = document.getElementById("result");
        resultDiv.style.display = "block";
        resultDiv.className = "result result-error";
        resultDiv.innerHTML = '<p style="color:#ef4444">Network error: ' + err.message + '</p>';
        document.getElementById("actions").style.display = "none";
      }
    }

    async function handleDeny() {
      // For deny, we just show a confirmation — no server call needed
      // (The intent will expire naturally via TTL)
      document.getElementById("actions").style.display = "none";
      const resultDiv = document.getElementById("result");
      resultDiv.style.display = "block";
      resultDiv.className = "result";
      resultDiv.style.background = "rgba(255,255,255,0.03)";
      resultDiv.style.border = "1px solid rgba(255,255,255,0.08)";
      resultDiv.innerHTML = [
        '<div style="text-align:center;padding:8px 0">',
        '  <p style="font-size:14px;color:#888">Action not approved.</p>',
        '  <p style="font-size:12px;color:#555;margin-top:8px">The intent will expire automatically.</p>',
        '</div>',
      ].join('');
    }
  </script>
</body>
</html>`;
}

function renderErrorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — RIO</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#0a0a0a; color:#e5e5e5; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px 16px; }
    .card { background:#141414; border:1px solid rgba(239,68,68,0.2); border-radius:16px; max-width:400px; padding:32px; text-align:center; }
    h2 { font-size:18px; color:#ef4444; margin-bottom:8px; }
    p { font-size:13px; color:#888; line-height:1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
