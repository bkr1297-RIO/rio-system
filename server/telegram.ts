/**
 * RIO Telegram Control Channel
 *
 * Sends intent notifications to the Governor (Brian) via Telegram
 * with inline APPROVE/REJECT buttons. Processes callback queries
 * to complete the governance loop.
 *
 * SETUP:
 * 1. Brian creates a bot via @BotFather on Telegram → gets TELEGRAM_BOT_TOKEN
 * 2. Brian messages @userinfobot → gets TELEGRAM_CHAT_ID
 * 3. Set both as secrets in the project
 *
 * This module is self-contained and does not start polling unless
 * credentials are present. Safe to import even without Telegram configured.
 */

import { ENV } from "./_core/env";
import { appendLedger } from "./db";

// ─── Types ──────────────────────────────────────────────────────

export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  from?: { id: number; first_name: string; username?: string };
}

export interface TelegramCallbackQuery {
  id: string;
  from: { id: number; first_name: string; username?: string };
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

interface SendMessagePayload {
  chat_id: string;
  text: string;
  parse_mode?: "Markdown" | "HTML";
  reply_markup?: {
    inline_keyboard: InlineKeyboardButton[][];
  };
}

// ─── Configuration ──────────────────────────────────────────────

const TELEGRAM_API = "https://api.telegram.org/bot";

function getToken(): string {
  return ENV.telegramBotToken;
}

function getChatId(): string {
  return ENV.telegramChatId;
}

export function isTelegramConfigured(): boolean {
  return !!(getToken() && getChatId());
}

// ─── API Helpers ────────────────────────────────────────────────

async function telegramRequest(method: string, body: Record<string, unknown>): Promise<unknown> {
  const token = getToken();
  if (!token) throw new Error("Telegram bot token not configured");

  const response = await fetch(`${TELEGRAM_API}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${text}`);
  }

  return response.json();
}

// ─── Send Messages ──────────────────────────────────────────────

/**
 * Send a plain text message to the Governor's chat.
 */
export async function sendMessage(text: string, parseMode: "Markdown" | "HTML" = "Markdown"): Promise<unknown> {
  return telegramRequest("sendMessage", {
    chat_id: getChatId(),
    text,
    parse_mode: parseMode,
  });
}

/**
 * Send an intent notification with APPROVE/REJECT inline buttons.
 */
export async function sendIntentNotification(intent: {
  intentId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  riskTier: string;
  blastRadius?: { score: number; affectedSystems: string[]; reversible: boolean };
  reflection?: string;
}): Promise<unknown> {
  const riskEmoji = intent.riskTier === "HIGH" ? "🔴" : intent.riskTier === "MEDIUM" ? "🟡" : "🟢";
  const reversible = intent.blastRadius?.reversible ? "✅ Reversible" : "⛔ Irreversible";

  const argsPreview = Object.entries(intent.toolArgs)
    .map(([k, v]) => `  • ${k}: ${typeof v === "string" ? v.substring(0, 80) : JSON.stringify(v).substring(0, 80)}`)
    .join("\n");

  const text = [
    `${riskEmoji} *RIO INTENT — ${intent.riskTier} RISK*`,
    ``,
    `*ID:* \`${intent.intentId}\``,
    `*Tool:* \`${intent.toolName}\``,
    `*Blast Radius:* ${intent.blastRadius?.score ?? "?"}/10 — ${reversible}`,
    intent.blastRadius?.affectedSystems?.length
      ? `*Affected:* ${intent.blastRadius.affectedSystems.join(", ")}`
      : null,
    ``,
    `*Parameters:*`,
    argsPreview,
    intent.reflection ? `\n*Reflection:* ${intent.reflection}` : null,
    ``,
    `_Silence equals refusal. Respond within 15 minutes._`,
  ]
    .filter(Boolean)
    .join("\n");

  const payload: SendMessagePayload = {
    chat_id: getChatId(),
    text,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ APPROVE", callback_data: `approve:${intent.intentId}` },
          { text: "❌ REJECT", callback_data: `reject:${intent.intentId}` },
        ],
        [
          { text: "📋 View Details", callback_data: `details:${intent.intentId}` },
        ],
      ],
    },
  };

  return telegramRequest("sendMessage", payload as unknown as Record<string, unknown>);
}

/**
 * Send a receipt notification after execution.
 */
export async function sendReceiptNotification(receipt: {
  intentId: string;
  executionId: string;
  toolName: string;
  success: boolean;
  receiptHash: string;
}): Promise<unknown> {
  const statusEmoji = receipt.success ? "✅" : "❌";
  const text = [
    `${statusEmoji} *EXECUTION ${receipt.success ? "COMPLETE" : "FAILED"}*`,
    ``,
    `*Intent:* \`${receipt.intentId}\``,
    `*Execution:* \`${receipt.executionId}\``,
    `*Tool:* \`${receipt.toolName}\``,
    `*Receipt Hash:* \`${receipt.receiptHash.substring(0, 16)}...\``,
    ``,
    `_Logged to immutable ledger._`,
  ].join("\n");

  return telegramRequest("sendMessage", {
    chat_id: getChatId(),
    text,
    parse_mode: "Markdown",
  });
}

/**
 * Send a kill switch notification.
 */
export async function sendKillNotification(reason: string): Promise<unknown> {
  const text = [
    `🛑 *KILL SWITCH ACTIVATED*`,
    ``,
    `*Reason:* ${reason}`,
    ``,
    `_All pending intents terminated. System halted._`,
  ].join("\n");

  return telegramRequest("sendMessage", {
    chat_id: getChatId(),
    text,
    parse_mode: "Markdown",
  });
}

/**
 * Answer a callback query (required by Telegram to dismiss the loading state).
 */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<unknown> {
  return telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text ?? "Received",
  });
}

/**
 * Edit the original message to show the decision (removes inline buttons).
 */
export async function editMessageAfterDecision(
  chatId: number | string,
  messageId: number,
  decision: "APPROVED" | "REJECTED",
  intentId: string,
): Promise<unknown> {
  const emoji = decision === "APPROVED" ? "✅" : "❌";
  const text = `${emoji} *${decision}* — \`${intentId}\`\n\n_Decision recorded and logged to ledger._`;

  return telegramRequest("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "Markdown",
  });
}

// ─── Callback Processing ────────────────────────────────────────

export type TelegramCallbackHandler = (
  action: "approve" | "reject" | "details",
  intentId: string,
  callbackQuery: TelegramCallbackQuery,
) => Promise<void>;

/**
 * Parse a callback_data string from an inline button press.
 * Format: "action:intentId"
 */
export function parseCallbackData(data: string): { action: "approve" | "reject" | "details"; intentId: string } | null {
  const [action, intentId] = data.split(":");
  if (!action || !intentId) return null;
  if (!["approve", "reject", "details"].includes(action)) return null;
  return { action: action as "approve" | "reject" | "details", intentId };
}

// ─── Webhook Handler ────────────────────────────────────────────

/**
 * Process a Telegram webhook update.
 * Call this from an Express route handler for /api/telegram/webhook.
 *
 * @param update - The Telegram update object
 * @param onCallback - Handler for approval/rejection callbacks
 */
export async function handleWebhookUpdate(
  update: TelegramUpdate,
  onCallback: TelegramCallbackHandler,
): Promise<void> {
  // Handle callback queries (inline button presses)
  if (update.callback_query) {
    const cq = update.callback_query;
    const parsed = cq.data ? parseCallbackData(cq.data) : null;

    if (parsed) {
      try {
        await onCallback(parsed.action, parsed.intentId, cq);

        // Answer the callback to dismiss loading state
        await answerCallbackQuery(cq.id, `${parsed.action.toUpperCase()} recorded`);

        // Edit the original message to show the decision
        if (cq.message && parsed.action !== "details") {
          await editMessageAfterDecision(
            cq.message.chat.id,
            cq.message.message_id,
            parsed.action === "approve" ? "APPROVED" : "REJECTED",
            parsed.intentId,
          );
        }

        // Log to ledger
        await appendLedger("TELEGRAM_NOTIFY", {
          type: "callback_processed",
          action: parsed.action,
          intentId: parsed.intentId,
          from: cq.from,
          timestamp: Date.now(),
        });
      } catch (err) {
        await answerCallbackQuery(cq.id, `Error: ${(err as Error).message}`);
      }
    } else {
      await answerCallbackQuery(cq.id, "Unknown action");
    }
  }

  // Handle direct messages (e.g., /status command)
  if (update.message?.text) {
    const text = update.message.text.trim();

    if (text === "/status" || text === "/start") {
      await sendMessage(
        [
          "🔷 *RIO Digital Proxy — Telegram Control Channel*",
          "",
          "Commands:",
          "  /status — Check system status",
          "  /pending — List pending intents",
          "",
          "Intent notifications will appear here with APPROVE/REJECT buttons.",
          "_Silence equals refusal._",
        ].join("\n"),
      );
    }
  }
}

// ─── Polling Mode (Development) ─────────────────────────────────

let pollingActive = false;
let lastUpdateId = 0;

/**
 * Start long-polling for updates (development mode).
 * In production, use webhook mode instead.
 */
export async function startPolling(onCallback: TelegramCallbackHandler): Promise<void> {
  if (!isTelegramConfigured()) {
    console.log("[Telegram] Not configured — skipping polling");
    return;
  }

  if (pollingActive) {
    console.log("[Telegram] Polling already active");
    return;
  }

  pollingActive = true;
  console.log("[Telegram] Starting long-polling...");

  while (pollingActive) {
    try {
      const result = (await telegramRequest("getUpdates", {
        offset: lastUpdateId + 1,
        timeout: 30,
      })) as { ok: boolean; result: TelegramUpdate[] };

      if (result.ok && result.result.length > 0) {
        for (const update of result.result) {
          lastUpdateId = update.update_id;
          await handleWebhookUpdate(update, onCallback);
        }
      }
    } catch (err) {
      console.error("[Telegram] Polling error:", err);
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

export function stopPolling(): void {
  pollingActive = false;
}
