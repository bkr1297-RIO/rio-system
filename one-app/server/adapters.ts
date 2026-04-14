/**
 * RIO Adapters — CBS Section 7
 * ─────────────────────────────
 * Concrete implementations of the RIOAdapter interface.
 * Each surface gets one adapter that translates native events
 * into ActionEnvelopes and GatewayDecisions back into responses.
 *
 * Adapters do NOT:
 *   - evaluate policy
 *   - make decisions
 *
 * They only translate + enforce.
 */

import { createHash } from "crypto";
import { readState } from "./continuity";
import { getActivePolicy } from "./authorityLayer";
import {
  type ActionEnvelope,
  type GatewayDecision,
  type RIOAdapter,
  wrapInEnvelope,
} from "./standardReceipt";

// ─── Helpers ──────────────────────────────────────────────────

function stateHash(): string {
  try {
    const state = readState();
    return createHash("sha256").update(JSON.stringify(state)).digest("hex").substring(0, 16);
  } catch {
    return "no-state";
  }
}

function policyHash(): string {
  return getActivePolicy()?.policy_hash ?? "no-policy";
}

function policyVersion(): string {
  return "v1";
}

// ═══════════════════════════════════════════════════════════════
// TELEGRAM ADAPTER
// ═══════════════════════════════════════════════════════════════

export interface TelegramEvent {
  message: string;
  senderId: string;
  chatId: number;
  command?: string;
}

export interface TelegramContext {
  chatId: number;
  senderId: string;
}

export const TelegramAdapter: RIOAdapter<TelegramEvent, TelegramContext> = {
  name: "telegram",

  toActionEnvelope(event: TelegramEvent): ActionEnvelope {
    const toolName = event.command ?? "telegram_message";
    return wrapInEnvelope({
      actor: event.senderId,
      toolName,
      target: String(event.chatId),
      parameters: {
        message: event.message,
        chat_id: String(event.chatId),
        command: event.command,
      },
      source: "telegram",
      policyHash: policyHash(),
      actorType: "human",
      actorRole: "owner",
      description: event.command
        ? `Telegram command: ${event.command}`
        : `Telegram message from ${event.senderId}`,
      resourceType: "telegram",
      content: event.message,
      riskLevel: "low",
      stateHash: stateHash(),
      policyVersion: policyVersion(),
    });
  },

  fromDecision(decision: GatewayDecision, context: TelegramContext): { chatId: number; text: string } {
    const statusEmoji = {
      ALLOW: "✅",
      WARN: "⚠️",
      REQUIRE_CONFIRMATION: "🔒",
      BLOCK: "🚫",
    }[decision.result];

    return {
      chatId: context.chatId,
      text: `${statusEmoji} <b>Gateway Decision</b>\n\nAction: ${decision.action_id.substring(0, 8)}...\nResult: ${decision.result}\nMessage: ${decision.message}${decision.cooldown_ms > 0 ? `\nCooldown: ${decision.cooldown_ms / 1000}s` : ""}`,
    };
  },
};

// ═══════════════════════════════════════════════════════════════
// GMAIL ADAPTER
// ═══════════════════════════════════════════════════════════════

export interface GmailEvent {
  action: "send_email" | "read_email" | "search_email";
  to?: string;
  subject?: string;
  body?: string;
  query?: string;
  messageId?: string;
  from?: string;
}

export interface GmailContext {
  action: string;
  messageId?: string;
}

export const GmailAdapter: RIOAdapter<GmailEvent, GmailContext> = {
  name: "gmail",

  toActionEnvelope(event: GmailEvent): ActionEnvelope {
    const target = event.to ?? event.from ?? event.query ?? "unknown";
    const riskLevel = event.action === "send_email" ? "high" : "low";

    return wrapInEnvelope({
      actor: "rio-system",
      toolName: event.action,
      target,
      parameters: {
        to: event.to,
        subject: event.subject,
        body: event.body,
        query: event.query,
        messageId: event.messageId,
      },
      source: "gmail",
      policyHash: policyHash(),
      actorType: "system",
      actorRole: "operator",
      description: `Gmail ${event.action}: ${target}`,
      resourceType: "email",
      content: event.body ?? event.query ?? "",
      riskLevel,
      stateHash: stateHash(),
      policyVersion: policyVersion(),
    });
  },

  fromDecision(decision: GatewayDecision, _context: GmailContext): { allowed: boolean; message: string } {
    return {
      allowed: decision.result === "ALLOW" || decision.result === "WARN",
      message: decision.message,
    };
  },
};

// ═══════════════════════════════════════════════════════════════
// GEMINI ADAPTER (AI agent output)
// ═══════════════════════════════════════════════════════════════

export interface GeminiEvent {
  toolName: string;
  toolArgs: Record<string, unknown>;
  riskTier: string;
  agentId?: string;
}

export interface GeminiContext {
  agentId: string;
  toolName: string;
}

export const GeminiAdapter: RIOAdapter<GeminiEvent, GeminiContext> = {
  name: "gemini",

  toActionEnvelope(event: GeminiEvent): ActionEnvelope {
    const target =
      (event.toolArgs.to as string) ??
      (event.toolArgs.recipient as string) ??
      (event.toolArgs.query as string) ??
      (event.toolArgs.target as string) ??
      "unknown";

    const riskLevel =
      event.riskTier === "HIGH" ? "high" :
      event.riskTier === "MEDIUM" ? "medium" : "low";

    return wrapInEnvelope({
      actor: event.agentId ?? "gemini",
      toolName: event.toolName,
      target,
      parameters: event.toolArgs,
      source: "gemini",
      policyHash: policyHash(),
      actorType: "ai",
      actorRole: "agent",
      description: `AI tool call: ${event.toolName}`,
      resourceType: inferResourceType(event.toolName),
      content: JSON.stringify(event.toolArgs),
      riskLevel,
      stateHash: stateHash(),
      policyVersion: policyVersion(),
    });
  },

  fromDecision(decision: GatewayDecision, _context: GeminiContext): {
    proceed: boolean;
    decision: string;
    message: string;
  } {
    return {
      proceed: decision.result === "ALLOW",
      decision: decision.result,
      message: decision.message,
    };
  },
};

// ═══════════════════════════════════════════════════════════════
// OUTLOOK ADAPTER
// ═══════════════════════════════════════════════════════════════

export interface OutlookEvent {
  action: "send_email" | "read_email" | "search_email";
  to?: string;
  subject?: string;
  body?: string;
  query?: string;
  messageId?: string;
  from?: string;
}

export interface OutlookContext {
  action: string;
  messageId?: string;
}

export const OutlookAdapter: RIOAdapter<OutlookEvent, OutlookContext> = {
  name: "outlook",

  toActionEnvelope(event: OutlookEvent): ActionEnvelope {
    const target = event.to ?? event.from ?? event.query ?? "unknown";
    const riskLevel = event.action === "send_email" ? "high" : "low";

    return wrapInEnvelope({
      actor: "rio-system",
      toolName: `outlook_${event.action}`,
      target,
      parameters: {
        to: event.to,
        subject: event.subject,
        body: event.body,
        query: event.query,
        messageId: event.messageId,
      },
      source: "outlook",
      policyHash: policyHash(),
      actorType: "system",
      actorRole: "operator",
      description: `Outlook ${event.action}: ${target}`,
      resourceType: "email",
      content: event.body ?? event.query ?? "",
      riskLevel,
      stateHash: stateHash(),
      policyVersion: policyVersion(),
    });
  },

  fromDecision(decision: GatewayDecision, _context: OutlookContext): { allowed: boolean; message: string } {
    return {
      allowed: decision.result === "ALLOW" || decision.result === "WARN",
      message: decision.message,
    };
  },
};

// ═══════════════════════════════════════════════════════════════
// SMS ADAPTER
// ═══════════════════════════════════════════════════════════════

export interface SMSEvent {
  to: string;
  body: string;
  from?: string;
}

export interface SMSContext {
  to: string;
}

export const SMSAdapter: RIOAdapter<SMSEvent, SMSContext> = {
  name: "sms",

  toActionEnvelope(event: SMSEvent): ActionEnvelope {
    return wrapInEnvelope({
      actor: "rio-system",
      toolName: "send_sms",
      target: event.to,
      parameters: {
        to: event.to,
        body: event.body,
        from: event.from,
      },
      source: "sms",
      policyHash: policyHash(),
      actorType: "system",
      actorRole: "operator",
      description: `SMS to ${event.to}`,
      resourceType: "sms",
      content: event.body,
      riskLevel: "medium",
      stateHash: stateHash(),
      policyVersion: policyVersion(),
    });
  },

  fromDecision(decision: GatewayDecision, _context: SMSContext): { allowed: boolean; message: string } {
    return {
      allowed: decision.result === "ALLOW" || decision.result === "WARN",
      message: decision.message,
    };
  },
};

// ─── Helper ───────────────────────────────────────────────────

function inferResourceType(toolName: string): string {
  if (toolName.includes("email") || toolName.includes("mail")) return "email";
  if (toolName.includes("sms")) return "sms";
  if (toolName.includes("search")) return "web";
  if (toolName.includes("drive")) return "file";
  if (toolName.includes("status") || toolName.includes("health")) return "system";
  return "unknown";
}
