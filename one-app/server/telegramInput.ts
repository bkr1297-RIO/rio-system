/**
 * RIO Telegram Input Handler
 * ──────────────────────────
 * Flips the Telegram bot from output-only to input + output.
 *
 * Flow:
 *   1. User sends a message to the Telegram bot
 *   2. Message enters the action store (source: "human", action: "classify_message")
 *   3. Pipeline claims → routes to scanEmail → completes
 *   4. Bot replies with decision + receipt summary
 *
 * Callback flow (Approve/Reject buttons):
 *   1. User presses inline Approve/Reject button
 *   2. Telegram sends callback_query to webhook
 *   3. Handler processes approval/rejection with full ledger receipt
 *   4. Both outcomes (approve AND reject) produce audit trail entries
 *
 * No new features. No UI. Just real messages flowing through the system.
 */

import { Express } from "express";
import { sendMessage, isTelegramConfigured, handleWebhookUpdate } from "./telegram";
import { handleStatusCommand } from "./telegramStatusCommand";
import type { TelegramUpdate, TelegramCallbackHandler } from "./telegram";
import { ENV } from "./_core/env";
import { sendApprovalEmail } from "./emailApproval";
import { writeState } from "./continuity";
import { processIntent, buildInboundIntent } from "./intentPipeline";
import { getIntent, updateIntentStatus, createApproval, appendLedger, sha256 } from "./db";
import { evaluateIdentityAtGatewayBoundary } from "./gatewayProxy";
import type { AuthorityModel } from "./gatewayProxy";
import type { RoleSeparation } from "./constrainedDelegation";

// ─── Response Formatting ─────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDecisionReply(
  decision: string,
  confidence: string,
  confidenceScore: number,
  matchedRules: Array<{ rule_id: string; category: string; reason: string; action: string }>,
  receiptId: string | null,
  reasonDisplay: string | null,
  suggestedEdit: string | null,
): string {
  const emoji =
    decision === "BLOCK" ? "🛑" :
    decision === "FLAG" ? "🟡" :
    decision === "WARN" ? "⚠️" :
    "✅";

  const lines: string[] = [
    `${emoji} <b>${decision}</b> — confidence: ${confidence} (${confidenceScore})`,
    "",
  ];

  if (matchedRules.length > 0) {
    lines.push("<b>Rules triggered:</b>");
    for (const rule of matchedRules) {
      lines.push(`  • [${rule.action}] ${rule.category}: ${escapeHtml(rule.reason)}`);
    }
    lines.push("");
  }

  if (reasonDisplay) {
    lines.push(`<b>Reason:</b> ${escapeHtml(reasonDisplay)}`);
    lines.push("");
  }

  if (suggestedEdit) {
    lines.push(`<b>Suggested edit:</b> ${escapeHtml(suggestedEdit)}`);
    lines.push("");
  }

  if (receiptId) {
    lines.push(`<b>Receipt:</b> <code>${receiptId}</code>`);
  }

  return lines.join("\n");
}

// ─── Pipeline ────────────────────────────────────────────────

/**
 * Process a single incoming Telegram message through the unified intent pipeline.
 * Returns the formatted reply string.
 */
export async function processIncomingTelegramMessage(
  messageText: string,
  senderId: string,
): Promise<string> {
  try {
    // Build inbound intent packet
    const intent = buildInboundIntent({
      message: messageText,
      sender: senderId,
      channel: "telegram",
      source: "human",
    });

    // Route through unified pipeline (inbound = classify only, no execution)
    const result = await processIntent(intent, undefined, { useLLM: true });

    // Format reply from pipeline result
    return formatDecisionReply(
      result.event_type,
      result.confidence,
      result.confidence_score,
      result.matched_rules,
      result.action_receipt_id || result.receipt.intent_id,
      result.reason,
      result.suggested_edit,
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return `❌ Pipeline error: ${errMsg}`;
  }
}

// ─── Telegram Approval Callback ────────────────────────────────────────

/**
 * Handle Approve/Reject button presses from Telegram inline keyboards.
 * Both outcomes produce a receipt in the ledger. Rejection is not silent.
 *
 * This is the critical wiring that connects Telegram buttons to the
 * governance system. Without this, callback_query events are dropped.
 */
export const telegramApprovalCallback: TelegramCallbackHandler = async (action, intentId, callbackQuery) => {
  const fromUser = callbackQuery.from?.username || callbackQuery.from?.first_name || "telegram-user";
  console.log(`[TelegramCallback] ${action.toUpperCase()} for intent ${intentId} from ${fromUser}`);

  // "details" action is informational only
  if (action === "details") {
    const intent = await getIntent(intentId);
    if (!intent) throw new Error(`Intent ${intentId} not found`);
    // Details are logged by handleWebhookUpdate's TELEGRAM_NOTIFY entry
    return;
  }

  // Look up the intent
  const intent = await getIntent(intentId);
  if (!intent) throw new Error(`Intent ${intentId} not found`);

  // Check if already processed
  if (intent.status !== "PENDING_APPROVAL") {
    throw new Error(`Intent ${intentId} is ${intent.status} — cannot ${action}`);
  }

  // Check expiry
  if (intent.expiresAt && Number(intent.expiresAt) <= Date.now()) {
    await updateIntentStatus(intentId, "EXPIRED");
    // Log expired attempt — even failed attempts leave a trace
    await appendLedger("APPROVAL", {
      intentId,
      decision: "EXPIRED",
      channel: "telegram",
      attempted_action: action,
      attempted_by: fromUser,
      reason: "Intent expired before Telegram callback processed",
      timestamp: Date.now(),
    });
    throw new Error(`Intent ${intentId} has expired (TTL exceeded)`);
  }

  // Resolve identities for constrained delegation check
  const proposerIdentity = intent.principalId ?? `user-${intent.userId}`;
  const approverIdentity = `telegram-${fromUser}`;
  const intentCreatedAt = intent.createdAt ? new Date(intent.createdAt).getTime() : Date.now();

  const decision = action === "approve" ? "APPROVED" : "REJECTED";

  // For approvals, check constrained delegation (self-approval prevention)
  if (decision === "APPROVED") {
    const identityEval = evaluateIdentityAtGatewayBoundary(
      proposerIdentity,
      approverIdentity,
      intentCreatedAt,
    );
    if (!identityEval.allowed) {
      await appendLedger("DELEGATION_BLOCKED", {
        intentId,
        proposer_identity_id: proposerIdentity,
        approver_identity_id: approverIdentity,
        authority_model: identityEval.authority_model,
        role_separation: identityEval.role_separation,
        cooldown_remaining_ms: identityEval.cooldown_remaining_ms,
        channel: "telegram",
        path: "telegram.callback",
        timestamp: Date.now(),
      });
      throw new Error(`Self-approval blocked: ${identityEval.reason}`);
    }
  }

  // Create the approval/rejection record
  const signature = sha256(`telegram-${action}-${intentId}-${fromUser}-${Date.now()}`);
  const expiresAt = Date.now() + 300_000; // 5 minutes for Telegram approvals
  const approval = await createApproval(
    intentId,
    intent.userId, // attribute to the intent owner
    decision,
    signature,
    intent.toolName,
    intent.argsHash,
    expiresAt,
    1, // single execution
    approverIdentity,
  );

  // Update intent status
  await updateIntentStatus(intentId, decision);

  // Determine authority model for the receipt
  const roleSeparation: RoleSeparation = proposerIdentity === approverIdentity ? "self" : "separated";
  const authorityModel: AuthorityModel = decision === "REJECTED"
    ? (proposerIdentity === approverIdentity
        ? "BLOCKED \u2014 Self-Authorization Sub-Policy Not Met"
        : "Separated Authority")
    : (proposerIdentity === approverIdentity
        ? "Constrained Single-Actor Execution"
        : "Separated Authority");

  // ─── RECEIPT: Both approval AND rejection produce a ledger entry ───
  await appendLedger("APPROVAL", {
    approvalId: approval!.approvalId,
    intentId,
    decision,
    channel: "telegram",
    approved_by: fromUser,
    boundToolName: intent.toolName,
    boundArgsHash: intent.argsHash,
    expiresAt,
    maxExecutions: 1,
    proposer_identity_id: proposerIdentity,
    approver_identity_id: approverIdentity,
    authority_model: authorityModel,
    role_separation: roleSeparation,
    timestamp: Date.now(),
  });

  console.log(`[TelegramCallback] ${decision} recorded for ${intentId} — ledger entry created (${authorityModel})`);
};

// ─── Webhook Route ───────────────────────────────────────────

/**
 * Register the Telegram webhook route on the Express app.
 * This is the input side — receives messages, runs pipeline, replies.
 *
 * Handles TWO types of Telegram updates:
 *   1. callback_query — Approve/Reject button presses → telegramApprovalCallback
 *   2. message.text — Free-text messages → processIncomingTelegramMessage
 */
export function registerTelegramWebhook(app: Express): void {
  app.post("/api/telegram/webhook", async (req, res) => {
    // Respond immediately to Telegram (they retry on timeout)
    res.status(200).json({ ok: true });

    const update: TelegramUpdate = req.body;

    // ─── CALLBACK QUERIES (Approve/Reject button presses) ──────
    if (update.callback_query) {
      try {
        await handleWebhookUpdate(update, telegramApprovalCallback);
      } catch (err) {
        console.error("[TelegramInput] Callback handler error:", err);
      }
      return;
    }

    // ─── TEXT MESSAGES ──────────────────────────────────────────
    if (!update.message?.text) return;

    const text = update.message.text.trim();
    const chatId = update.message.chat.id;
    const from = update.message.from;
    const senderId = from?.username || from?.first_name || String(chatId);

    // ─── COMMAND HANDLING (governed surfaces) ─────────────────
    if (text.startsWith("/")) {
      // /status — governed read surface (envelope → pipeline → receipt → ledger)
      if (text.toLowerCase().startsWith("/status")) {
        try {
          await handleStatusCommand(text, senderId, chatId);
        } catch (err) {
          console.error("[TelegramInput] /status handler error:", err);
        }
      }
      // /send — trigger a governed action via Telegram
      if (text.toLowerCase().startsWith("/send")) {
        try {
          await handleTelegramSend(text, senderId, chatId);
        } catch (err) {
          console.error("[TelegramInput] /send handler error:", err);
          await sendMessage("❌ Error processing /send command. Try: /send email to user@example.com subject Hello body Hi there", "HTML");
        }
        return;
      }
      // Other commands: skip (let existing handlers deal with them)
      return;
    }

    // Security: only process messages from the configured chat
    const configuredChatId = ENV.telegramChatId;
    if (configuredChatId && String(chatId) !== String(configuredChatId)) {
      console.log(`[TelegramInput] Ignoring message from unauthorized chat: ${chatId}`);
      return;
    }

    console.log(`[TelegramInput] Processing message from ${senderId}: "${text.substring(0, 50)}..."`);  

    // Update continuity — record incoming interaction
    try {
      writeState("human", {
        last_note: `Telegram message from ${senderId}: "${text.substring(0, 80)}"`,
      });
    } catch { /* non-blocking */ }

    try {
      const reply = await processIncomingTelegramMessage(text, senderId);
      console.log(`[TelegramInput] Pipeline complete. Sending reply (${reply.length} chars)...`);

      // Send reply back to the same chat
      const sendResult = await sendMessage(reply, "HTML");
      console.log(`[TelegramInput] Reply sent successfully.`);
    } catch (err) {
      console.error("[TelegramInput] Failed to process/reply:", err);
      try {
        await sendMessage("❌ Internal error processing your message.");
      } catch (err2) {
        console.error("[TelegramInput] Double failure:", err2);
      }
    }
  });
}

// ─── Webhook Setup ───────────────────────────────────────────

/**
 * Set the Telegram webhook URL so Telegram sends updates to our server.
 * Call this once on server startup.
 */
export async function setTelegramWebhook(baseUrl: string): Promise<boolean> {
  if (!isTelegramConfigured()) {
    console.log("[TelegramInput] Telegram not configured — skipping webhook setup");
    return false;
  }

  const webhookUrl = `${baseUrl}/api/telegram/webhook`;
  const token = ENV.telegramBotToken;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message", "callback_query"],
      }),
    });

    const data = await response.json() as { ok: boolean; description?: string };
    if (data.ok) {
      console.log(`[TelegramInput] Webhook set: ${webhookUrl}`);
      return true;
    } else {
      console.error(`[TelegramInput] Webhook setup failed: ${data.description}`);
      return false;
    }
  } catch (err) {
    console.error("[TelegramInput] Webhook setup error:", err);
    return false;
  }
}


// ─── /send Command Handler ─────────────────────────────────────
// Parse: /send email to <recipient> subject <subject> body <body>
// Wire to sendApprovalEmail → approve → execute → receipt → ledger
// Does NOT change Sentinel, approval logic, receipts, or ledger.

async function handleTelegramSend(text: string, senderId: string, chatId: number): Promise<void> {
  // Parse the command
  const lower = text.toLowerCase();

  // Must start with /send email
  if (!lower.startsWith("/send email")) {
    await sendMessage(
      "📧 <b>Usage:</b>\n<code>/send email to user@example.com subject Hello body Hi there</code>\n\nAll parts after 'to' are required.",
      "HTML"
    );
    return;
  }

  // Extract: /send email to <recipient> subject <subject> body <body>
  const afterSendEmail = text.slice("/send email".length).trim();

  // Parse "to <email>"
  const toMatch = afterSendEmail.match(/^to\s+(\S+@\S+\.\S+)/i);
  if (!toMatch) {
    await sendMessage(
      "❌ Missing recipient. Usage:\n<code>/send email to user@example.com subject Hello body Hi there</code>",
      "HTML"
    );
    return;
  }
  const recipient = toMatch[1];
  const afterTo = afterSendEmail.slice(toMatch[0].length).trim();

  // Parse "subject <text>"
  let subject = "(no subject)";
  let bodyText = "";
  const subjectMatch = afterTo.match(/^subject\s+(.*?)(?:\s+body\s+|$)/i);
  if (subjectMatch) {
    subject = subjectMatch[1].trim() || "(no subject)";
    const bodyMatch = afterTo.match(/body\s+(.*)/i);
    if (bodyMatch) {
      bodyText = bodyMatch[1].trim();
    }
  } else {
    // No subject keyword — treat everything as body
    const bodyMatch = afterTo.match(/^body\s+(.*)/i);
    if (bodyMatch) {
      bodyText = bodyMatch[1].trim();
    }
  }

  // Owner is the proposer (Telegram user is the owner)
  const actualProposer = "bkr1297@gmail.com";

  // Approver defaults to recipient (they approve their own incoming email)
  const approverEmail = recipient;

  const intentId = `INT-TELEGRAM-${Date.now()}`;
  const baseUrl = "https://rio-one.manus.space";

  // Confirm to user
  await sendMessage(
    `🛡️ <b>Governed Action</b>\n\n` +
    `<b>Type:</b> send_email\n` +
    `<b>To:</b> ${escapeHtml(recipient)}\n` +
    `<b>Subject:</b> ${escapeHtml(subject)}\n` +
    `<b>Body:</b> ${escapeHtml(bodyText || "(empty)")}\n\n` +
    `Sending approval email to <b>${escapeHtml(approverEmail)}</b>...`,
    "HTML"
  );

  // Trigger the approval email
  const result = await sendApprovalEmail(
    {
      intent_id: intentId,
      proposer_email: actualProposer,
      approver_email: approverEmail,
      action_type: "send_email",
      action_summary: `Send governed email to ${recipient}`,
      action_details: {
        to: recipient,
        subject,
        body: bodyText,
      },
    },
    baseUrl,
  );

  if (result.success) {
    await sendMessage(
      `✅ <b>Approval email sent!</b>\n\n` +
      `Intent: <code>${intentId}</code>\n` +
      `Approver: ${escapeHtml(approverEmail)}\n` +
      `Waiting for approval via email link.`,
      "HTML"
    );
    console.log(`[TelegramInput] /send → approval email sent (${intentId})`);
  } else {
    await sendMessage(
      `❌ <b>Failed to send approval email</b>\n\nError: ${escapeHtml(result.error || "Unknown error")}`,
      "HTML"
    );
    console.error(`[TelegramInput] /send failed: ${result.error}`);
  }
}
