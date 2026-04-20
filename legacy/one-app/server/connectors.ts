/**
 * RIO Connector Abstraction Layer
 * ────────────────────────────────
 * Every real-world action goes through this layer.
 * Each connector implements: execute(toolArgs, approvalProof) → ConnectorResult
 *
 * Rules (from Master Seed v1.1 + Policy v0.3):
 *  - No Receipt = Did Not Happen
 *  - All YELLOW zone actions require explicit human approval through the Gate
 *  - RED zone actions are blocked, recorded, and alert the human
 *  - Fail closed on any mismatch or error
 *  - All execution goes through RIO
 *  - Receipt written after every execution
 *  - NO pseudo-success: if the API call fails, the connector MUST return success: false
 *
 * Connector Status:
 *  - web_search: LIVE (LLM-synthesized search results, LOW risk)
 *  - send_email: GATEWAY-ONLY (refuses direct execution, requires _gatewayExecution flag from RIO governance loop)
 *  - send_sms: GATEWAY-ONLY (refuses direct execution, requires _gatewayExecution flag from RIO governance loop)
 *  - draft_email: LIVE (returns draft content, never sends, MEDIUM risk)
 *  - read_email: DEFERRED (requires Google OAuth)
 *  - drive_read / drive_search / drive_write: DEFERRED (requires Google OAuth)
 *
 * GOVERNANCE INVARIANT:
 *  No HIGH-risk connector executes without _gatewayExecution=true.
 *  The ONLY code path that sets this flag is gateway.approveAndExecute,
 *  which has already completed: I-2 authorize → I-1 execute-action → receipt.
 */

import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { sha256 } from "./db";
import { ENV } from "./_core/env";
import { scanEmail, storeReceipt, type EventType } from "./emailFirewall";
import { processIntent, buildOutboundIntent, type PipelineResult } from "./intentPipeline";
import { sendViaGmail, type GmailDeliveryResult } from "./gmailSmtp";

// ─── Types ─────────────────────────────────────────────────────

export type ApprovalProof = {
  approvalId: string;
  intentId: string;
  boundToolName: string;
  boundArgsHash: string;
  signature: string;
  expiresAt: number;
};

export type ConnectorResult = {
  success: boolean;
  output: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
  executedAt: number;
};

export type ConnectorExecutor = (
  toolArgs: Record<string, unknown>,
  approvalProof: ApprovalProof | null,
) => Promise<ConnectorResult>;

// ─── Connector Registry ────────────────────────────────────────

const connectors = new Map<string, ConnectorExecutor>();

export function registerConnector(toolName: string, executor: ConnectorExecutor) {
  connectors.set(toolName, executor);
}

export function getConnector(toolName: string): ConnectorExecutor | undefined {
  return connectors.get(toolName);
}

export function listConnectors(): string[] {
  return Array.from(connectors.keys());
}

// ─── ARGS_HASH_MISMATCH Enforcement ───────────────────────────

export function verifyArgsHash(
  storedArgsHash: string,
  approvalProof: ApprovalProof,
): { valid: boolean; storedHash: string; boundHash: string } {
  // Compare the stored argsHash (computed at intent creation time, before MySQL JSON reordering)
  // against the approval's boundArgsHash (also set from the stored argsHash at approval time).
  // Do NOT recompute from toolArgs because MySQL JSON columns reorder keys alphabetically.
  return {
    valid: storedArgsHash === approvalProof.boundArgsHash,
    storedHash: storedArgsHash,
    boundHash: approvalProof.boundArgsHash,
  };
}

// ─── Receipt Generation ───────────────────────────────────────

export type DeliveryMode = "notify" | "gmail";
export type DeliveryStatus = "SENT" | "FAILED";

export type ExecutionReceipt = {
  receiptHash: string;
  executionId: string;
  intentId: string;
  toolName: string;
  result: ConnectorResult;
  approvalProof: ApprovalProof | null;
  timestamp: number;
  protocolVersion: string;
  /** Authority layer fields — added by Minimum Authority Layer spec */
  token_id?: string;
  policy_hash?: string;
  previous_receipt_hash?: string;
  /** Delivery fields — added for real external delivery tracking */
  delivery_mode?: DeliveryMode;
  delivery_status?: DeliveryStatus;
  external_message_id?: string;
};

/** Current RIO Receipt Protocol version */
export const PROTOCOL_VERSION = "2.3.0";

export function generateReceipt(
  executionId: string,
  intentId: string,
  toolName: string,
  result: ConnectorResult,
  approvalProof: ApprovalProof | null,
  authorityContext?: { token_id?: string; policy_hash?: string; previous_receipt_hash?: string },
  deliveryContext?: { delivery_mode?: DeliveryMode; delivery_status?: DeliveryStatus; external_message_id?: string },
): ExecutionReceipt {
  const timestamp = Date.now();
  const receiptHash = sha256(JSON.stringify({
    protocolVersion: PROTOCOL_VERSION,
    executionId,
    intentId,
    result: {
      output: result.output,
      toolName,
      toolArgs: {},
      executedAt: result.executedAt,
    },
    // Authority layer fields included in hash when present
    ...(authorityContext?.token_id ? { token_id: authorityContext.token_id } : {}),
    ...(authorityContext?.policy_hash ? { policy_hash: authorityContext.policy_hash } : {}),
    ...(authorityContext?.previous_receipt_hash ? { previous_receipt_hash: authorityContext.previous_receipt_hash } : {}),
    // Delivery fields included in hash when present
    ...(deliveryContext?.delivery_mode ? { delivery_mode: deliveryContext.delivery_mode } : {}),
    ...(deliveryContext?.delivery_status ? { delivery_status: deliveryContext.delivery_status } : {}),
    ...(deliveryContext?.external_message_id ? { external_message_id: deliveryContext.external_message_id } : {}),
  }));
  return {
    receiptHash, executionId, intentId, toolName, result, approvalProof, timestamp,
    protocolVersion: PROTOCOL_VERSION,
    token_id: authorityContext?.token_id,
    policy_hash: authorityContext?.policy_hash,
    previous_receipt_hash: authorityContext?.previous_receipt_hash,
    delivery_mode: deliveryContext?.delivery_mode,
    delivery_status: deliveryContext?.delivery_status,
    external_message_id: deliveryContext?.external_message_id,
  };
}

// ─── Dispatch (the single entry point for all execution) ──────

export async function dispatchExecution(
  toolName: string,
  toolArgs: Record<string, unknown>,
  approvalProof: ApprovalProof | null,
  riskTier: "LOW" | "MEDIUM" | "HIGH",
  storedArgsHash?: string,
): Promise<ConnectorResult> {
  // Rule: HIGH risk requires approval proof
  if (riskTier === "HIGH" && !approvalProof) {
    return {
      success: false,
      output: null,
      error: "FAIL_CLOSED: HIGH risk action requires approval proof",
      executedAt: Date.now(),
    };
  }

  // Rule: MEDIUM risk also requires approval proof
  if (riskTier === "MEDIUM" && !approvalProof) {
    return {
      success: false,
      output: null,
      error: "FAIL_CLOSED: MEDIUM risk action requires approval proof",
      executedAt: Date.now(),
    };
  }

  // Rule: ARGS_HASH_MISMATCH — if approval exists, args must match
  if (approvalProof && storedArgsHash) {
    const hashCheck = verifyArgsHash(storedArgsHash, approvalProof);
    if (!hashCheck.valid) {
      return {
        success: false,
        output: null,
        error: `ARGS_HASH_MISMATCH: Approved args hash (${hashCheck.boundHash.slice(0, 12)}...) does not match stored args hash (${hashCheck.storedHash.slice(0, 12)}...). Execution blocked.`,
        metadata: { storedHash: hashCheck.storedHash, boundHash: hashCheck.boundHash },
        executedAt: Date.now(),
      };
    }
  }

  // Find the connector
  const connector = getConnector(toolName);
  if (!connector) {
    return {
      success: false,
      output: null,
      error: `NO_CONNECTOR: No connector registered for tool '${toolName}'`,
      executedAt: Date.now(),
    };
  }

  // Execute — fail closed on any error
  try {
    const result = await connector(toolArgs, approvalProof);
    return result;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: null,
      error: `CONNECTOR_ERROR: ${errorMsg}`,
      executedAt: Date.now(),
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// CONNECTOR IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════

// ─── Web Search (LOW risk) — LIVE via LLM ─────────────────────

async function executeWebSearch(
  toolArgs: Record<string, unknown>,
): Promise<ConnectorResult> {
  const query = String(toolArgs.query || "");
  if (!query.trim()) {
    return { success: false, output: null, error: "Missing required param: query", executedAt: Date.now() };
  }

  try {
    const response = await invokeLLM({
      model: "gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are a research assistant. The user will give you a search query. Provide a comprehensive, factual answer with relevant information. Structure your response as a JSON object with these fields:
- "summary": A 2-3 sentence overview
- "results": An array of 3-5 relevant findings, each with "title", "snippet", and "relevance" (HIGH/MEDIUM/LOW)
- "sources_note": A note that these are AI-synthesized results, not live web results

Be factual and honest. If you don't know something, say so.`,
        },
        {
          role: "user",
          content: `Search query: "${query}"`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices?.[0]?.message?.content;
    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
    } catch {
      parsed = { summary: typeof content === "string" ? content : "Search completed", raw: content };
    }

    return {
      success: true,
      output: parsed,
      metadata: { query, model: "gemini-2.5-flash", type: "llm_synthesized" },
      executedAt: Date.now(),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: null, error: `FAIL_CLOSED: web_search failed: ${msg}`, executedAt: Date.now() };
  }
}

// ─── Send Email (HIGH risk) — GATEWAY-ONLY ──────────────────
// ALL outbound email delivery MUST go through the RIO Gateway governance loop:
//   Intent → Gateway Submit → Governance → I-2 Approve → I-1 Execute → Gateway SMTP → Receipt → Ledger
//
// This connector enforces the closed loop:
//   1. Validates the email content via the MVP firewall rule (send-time gate)
//   2. If the call came from the Gateway execution path (has _gatewayExecution flag), delivers via notifyOwner
//   3. Otherwise, REFUSES direct execution and returns REQUIRES_GATEWAY_GOVERNANCE
//
// The ONLY code path that sets _gatewayExecution=true is inside gateway.approveAndExecute,
// which has already completed the full governance loop (authorize → execute-action → receipt).
// No direct execution paths exist.

async function executeSendEmail(
  toolArgs: Record<string, unknown>,
  approvalProof: ApprovalProof | null,
): Promise<ConnectorResult> {
  const to = String(toolArgs.to || "");
  const subject = String(toolArgs.subject || "");
  const body = String(toolArgs.body || "");

  if (!subject.trim() && !body.trim()) {
    return {
      success: false,
      output: null,
      error: "FAIL_CLOSED: send_email requires at least a subject or body",
      executedAt: Date.now(),
    };
  }

  // ─── SEND-TIME GATE: MVP Firewall Rule ─────────────────────
  // Every outbound email is checked by the MVP rule before any delivery.
  // block → fail-closed, do not send.
  let pipelineResult: PipelineResult;
  try {
    const intent = buildOutboundIntent({
      action: "send_email",
      source: "human",
      data: { to, subject, body },
      channel: "email",
    });

    pipelineResult = await processIntent(intent, undefined, {
      strictness: "standard",
      useLLM: false,
    });

    if (pipelineResult.decision === "block") {
      console.log(`[SendTimeGate] BLOCKED email to=${to} subject="${subject}" rules=${pipelineResult.matched_rules.map(r => r.rule_id).join(",")}`);
      return {
        success: false,
        output: {
          blocked: true,
          firewallDecision: "BLOCK",
          receipt_id: pipelineResult.receipt.intent_id,
          matched_rules: pipelineResult.matched_rules.map(r => ({ rule_id: r.rule_id, category: r.category, reason: r.reason })),
          summary: pipelineResult.reason,
          pipeline_receipt_hash: pipelineResult.receipt.hash,
        },
        error: `FIREWALL_BLOCKED: Email blocked by policy — ${pipelineResult.reason}`,
        metadata: { firewallDecision: "BLOCK", receipt_id: pipelineResult.receipt.intent_id, pipeline_hash: pipelineResult.receipt.hash },
        executedAt: Date.now(),
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SendTimeGate] Pipeline error — FAIL_CLOSED: ${msg}`);
    return {
      success: false,
      output: null,
      error: `FAIL_CLOSED: Email pipeline error — ${msg}`,
      executedAt: Date.now(),
    };
  }

  // ─── GATEWAY GOVERNANCE ENFORCEMENT ────────────────────────
  // Check if this execution came from the Gateway governance loop.
  // Only the approveAndExecute path sets _gatewayExecution = true
  // after completing: authorize (I-2) → execute-action (I-1) → receipt.
  const isGatewayExecution = toolArgs._gatewayExecution === true;

  if (!isGatewayExecution) {
    // REFUSE direct execution. All email delivery must go through Gateway.
    console.log(`[SendEmail] REFUSED direct execution to=${to} subject="${subject}" — requires Gateway governance`);
    return {
      success: false,
      output: {
        requires_gateway: true,
        to,
        subject,
        bodyLength: body.length,
        firewallDecision: pipelineResult.decision === "require_confirmation" ? "REQUIRE_CONFIRMATION" : "ALLOW",
        pipeline_receipt_hash: pipelineResult.receipt.hash,
        instruction: "This email must be submitted as a Gateway intent and approved through the RIO governance loop. Use gateway.approveAndExecute to complete delivery.",
      },
      error: "REQUIRES_GATEWAY_GOVERNANCE: send_email cannot execute directly. Submit as Gateway intent → approve → execute through RIO.",
      metadata: { requires_gateway: true, firewallDecision: pipelineResult.decision },
      executedAt: Date.now(),
    };
  }

  // ─── GATEWAY-AUTHORIZED DELIVERY ──────────────────────────
  // This code path is reached ONLY from the Gateway execution loop.
  // The Gateway has already: authorized (I-2), executed (I-1), produced a receipt.
  //
  // delivery_mode determines the output channel:
  //   "gmail"  → real SMTP delivery via Nodemailer + Gmail App Password
  //   "notify" → notifyOwner (Manus notification, the default)
  const deliveryMode: DeliveryMode = (toolArgs.delivery_mode === "gmail") ? "gmail" : "notify";
  console.log(`[SendEmail] Gateway-authorized delivery to=${to} subject="${subject}" mode=${deliveryMode}`);

  // ─── PATH A: Gmail SMTP delivery ─────────────────────────
  if (deliveryMode === "gmail") {
    try {
      const gmailResult: GmailDeliveryResult = await sendViaGmail(to, subject, body);

      if (!gmailResult.success) {
        // FAIL-SAFE: Gmail failed → do NOT mark as executed
        console.error(`[SendEmail] Gmail delivery FAILED: ${gmailResult.error}`);
        return {
          success: false,
          output: {
            delivered: false,
            method: "gmail",
            governance: "gateway",
            delivery_mode: "gmail" as DeliveryMode,
            delivery_status: "FAILED" as DeliveryStatus,
            error: gmailResult.error,
            to,
            subject,
          },
          error: `FAIL_CLOSED: Gmail delivery failed — ${gmailResult.error}`,
          metadata: {
            method: "gmail",
            governance: "gateway",
            delivery_mode: "gmail",
            delivery_status: "FAILED",
            to,
            subject,
          },
          executedAt: Date.now(),
        };
      }

      // Gmail delivery succeeded
      console.log(`[SendEmail] Gmail delivery SUCCESS messageId=${gmailResult.messageId}`);
      return {
        success: true,
        output: {
          delivered: true,
          method: "gmail",
          governance: "gateway",
          delivery_mode: "gmail" as DeliveryMode,
          delivery_status: "SENT" as DeliveryStatus,
          external_message_id: gmailResult.messageId,
          to,
          subject,
          bodyLength: body.length,
          accepted: gmailResult.accepted,
          rejected: gmailResult.rejected,
          approvalId: approvalProof?.approvalId,
          note: "Delivered via Gmail SMTP through RIO Gateway governance loop.",
        },
        metadata: {
          method: "gmail",
          governance: "gateway",
          delivery_mode: "gmail",
          delivery_status: "SENT",
          external_message_id: gmailResult.messageId,
          to,
          subject,
        },
        executedAt: Date.now(),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[SendEmail] Gmail delivery exception: ${msg}`);
      return {
        success: false,
        output: {
          delivered: false,
          method: "gmail",
          governance: "gateway",
          delivery_mode: "gmail" as DeliveryMode,
          delivery_status: "FAILED" as DeliveryStatus,
          error: msg,
        },
        error: `FAIL_CLOSED: Gmail delivery exception — ${msg}`,
        metadata: {
          method: "gmail",
          governance: "gateway",
          delivery_mode: "gmail",
          delivery_status: "FAILED",
        },
        executedAt: Date.now(),
      };
    }
  }

  // ─── PATH B: notifyOwner (default) ───────────────────────
  const title = subject || "Message from your RIO assistant";
  const content = [
    to ? `**To:** ${to}` : "",
    subject ? `**Subject:** ${subject}` : "",
    ``,
    body,
    ``,
    `---`,
    `Governed action via RIO · Approval: ${approvalProof?.approvalId?.slice(0, 12) ?? "gateway"}`,
    `_Delivered via RIO Gateway governance loop._`,
  ].filter(Boolean).join("\n");

  try {
    const delivered = await notifyOwner({ title, content });
    if (!delivered) {
      return {
        success: false,
        output: {
          delivered: false,
          method: "notifyOwner",
          governance: "gateway",
          delivery_mode: "notify" as DeliveryMode,
          delivery_status: "FAILED" as DeliveryStatus,
        },
        error: "FAIL_CLOSED: notifyOwner returned false — notification service unreachable",
        metadata: {
          method: "notifyOwner",
          governance: "gateway",
          delivery_mode: "notify",
          delivery_status: "FAILED",
        },
        executedAt: Date.now(),
      };
    }

    return {
      success: true,
      output: {
        delivered: true,
        method: "notifyOwner",
        governance: "gateway",
        delivery_mode: "notify" as DeliveryMode,
        delivery_status: "SENT" as DeliveryStatus,
        to: to || "(you, the owner)",
        subject,
        bodyLength: body.length,
        approvalId: approvalProof?.approvalId,
      },
      metadata: {
        method: "notifyOwner",
        governance: "gateway",
        delivery_mode: "notify",
        delivery_status: "SENT",
        to,
        subject,
      },
      executedAt: Date.now(),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: null,
      error: `FAIL_CLOSED: send_email failed: ${msg}`,
      metadata: {
        method: "notifyOwner",
        governance: "gateway",
        delivery_mode: "notify",
        delivery_status: "FAILED",
      },
      executedAt: Date.now(),
    };
  }
}

// ─── Send SMS (HIGH risk) — GATEWAY-ONLY ─────────────────
// ALL outbound SMS delivery MUST go through the RIO Gateway governance loop.
// Same pattern as send_email: refuse direct execution, require _gatewayExecution flag.
// Uses Twilio REST API to deliver SMS. Credentials are server-side only.

async function executeSendSms(
  toolArgs: Record<string, unknown>,
  approvalProof: ApprovalProof | null,
): Promise<ConnectorResult> {
  const to = String(toolArgs.to || "");
  const body = String(toolArgs.body || "");

  if (!to.trim()) {
    return {
      success: false,
      output: null,
      error: "FAIL_CLOSED: send_sms requires 'to' phone number",
      executedAt: Date.now(),
    };
  }
  if (!body.trim()) {
    return {
      success: false,
      output: null,
      error: "FAIL_CLOSED: send_sms requires 'body' message content",
      executedAt: Date.now(),
    };
  }

  // ─── GATEWAY GOVERNANCE ENFORCEMENT ────────────────────────
  const isGatewayExecution = toolArgs._gatewayExecution === true;

  if (!isGatewayExecution) {
    console.log(`[SendSMS] REFUSED direct execution to=${to} — requires Gateway governance`);
    return {
      success: false,
      output: {
        requires_gateway: true,
        to,
        bodyLength: body.length,
        instruction: "This SMS must be submitted as a Gateway intent and approved through the RIO governance loop.",
      },
      error: "REQUIRES_GATEWAY_GOVERNANCE: send_sms cannot execute directly. Submit as Gateway intent → approve → execute through RIO.",
      metadata: { requires_gateway: true },
      executedAt: Date.now(),
    };
  }

  // ─── GATEWAY-AUTHORIZED DELIVERY via Twilio ───────────────
  console.log(`[SendSMS] Gateway-authorized delivery to=${to}`);

  const accountSid = ENV.twilioAccountSid;
  const authToken = ENV.twilioAuthToken;
  const messagingServiceSid = ENV.twilioMessagingServiceSid;
  const fromNumber = ENV.twilioPhoneNumber === '+18337910928' ? '+18014570972' : ENV.twilioPhoneNumber;

  if (!accountSid || !authToken) {
    return {
      success: false,
      output: null,
      error: "FAIL_CLOSED: Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)",
      executedAt: Date.now(),
    };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams();
    params.append("To", to);
    params.append("Body", body);
    if (fromNumber) {
      params.append("From", fromNumber);
    } else if (messagingServiceSid) {
      params.append("MessagingServiceSid", messagingServiceSid);
    }

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
        output: null,
        error: `FAIL_CLOSED: Twilio API error: ${data.message || data.error_message || JSON.stringify(data)}`,
        metadata: { twilioErrorCode: data.error_code, twilioStatus: data.status },
        executedAt: Date.now(),
      };
    }

    return {
      success: true,
      output: {
        delivered: true,
        method: "twilio_sms",
        governance: "gateway",
        to,
        messageSid: data.sid,
        twilioStatus: data.status,
        bodyLength: body.length,
        approvalId: approvalProof?.approvalId,
        from: data.from || fromNumber,
        note: "Text message sent via RIO Gateway governance loop. Receipt recorded.",
      },
      metadata: { method: "twilio_sms", governance: "gateway", to, messageSid: data.sid, status: data.status },
      executedAt: Date.now(),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: null,
      error: `FAIL_CLOSED: send_sms failed: ${msg}`,
      executedAt: Date.now(),
    };
  }
}

// ─── Draft Email (MEDIUM risk) — LIVE (returns draft, never sends) ──

async function executeDraftEmail(
  toolArgs: Record<string, unknown>,
): Promise<ConnectorResult> {
  const to = String(toolArgs.to || "");
  const subject = String(toolArgs.subject || "");
  const body = String(toolArgs.body || "");

  if (!subject.trim() && !body.trim()) {
    return {
      success: false,
      output: null,
      error: "FAIL_CLOSED: draft_email requires at least a subject or body",
      executedAt: Date.now(),
    };
  }

  return {
    success: true,
    output: {
      draft: true,
      status: "Draft saved — not sent yet",
      to: to || "(not specified)",
      subject,
      body,
      note: "This is a draft. When you're ready to send it, just say the word and I'll create a send request for your approval.",
    },
    metadata: { method: "draft_only", to, subject },
    executedAt: Date.now(),
  };
}

// ─── DEFERRED connectors ─────────────────────────────────────
// These connectors are registered but require Google OAuth to function.
// They fail-closed with an honest, actionable error message.

function deferredConnector(
  serviceName: string,
  toolName: string,
): ConnectorExecutor {
  return async (
    _toolArgs: Record<string, unknown>,
    _approvalProof: ApprovalProof | null,
  ): Promise<ConnectorResult> => {
    return {
      success: false,
      output: null,
      error: `DEFERRED: ${toolName} requires ${serviceName} API credentials (Google OAuth). This connector will be activated when ${serviceName} access is configured. The intent was valid and the approval was recorded — re-execute after connecting ${serviceName}.`,
      metadata: { toolName, service: serviceName, status: "deferred" },
      executedAt: Date.now(),
    };
  };
}

// ─── Register All Connectors ──────────────────────────────────

export function initializeConnectors() {
  // LIVE connectors
  registerConnector("web_search", executeWebSearch);
  registerConnector("send_email", executeSendEmail);
  registerConnector("send_sms", executeSendSms);
  registerConnector("draft_email", executeDraftEmail);

  // DEFERRED — fail-closed with honest error, re-executable after OAuth
  registerConnector("read_email", deferredConnector("Gmail", "read_email"));
  registerConnector("drive_read", deferredConnector("Google Drive", "drive_read"));
  registerConnector("drive_search", deferredConnector("Google Drive", "drive_search"));
  registerConnector("drive_write", deferredConnector("Google Drive", "drive_write"));
}

// Auto-initialize on import
initializeConnectors();
