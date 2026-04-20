/**
 * Unified Multi-Channel Message Check API
 * ─────────────────────────────────────────
 * POST /api/v1/check-message
 *
 * Single entry point for ALL channels (email, sms, slack, linkedin).
 * Wraps the existing scanEmail() engine — governance is channel-agnostic.
 *
 * Spec: RIO Multi-Channel Implementation Spec v1.0 (B-Rass + Claude)
 */

import type { Express, Request, Response } from "express";
import {
  scanEmail,
  storeReceipt,
  confidenceToScore,
  type ChannelType,
  type StrictnessLevel,
  type EventType,
  type EmailReceipt,
} from "./emailFirewall";
import { storeGovernedReceipt } from "./firewallGovernance";
import { processIntent, buildInboundIntent, type PipelineDecision } from "./intentPipeline";

// ─── Request / Response Types ─────────────────────────────────

export interface CheckMessageRequest {
  /** Channel: email, sms, slack, linkedin */
  channel: ChannelType;
  /** The message content to scan */
  message_text: string;
  /** Sender identifier (email, phone, slack user ID, etc.) */
  sender_id?: string;
  /** Recipient identifier */
  recipient?: string;
  /** ISO timestamp of the message */
  timestamp?: string;
  /** Channel-specific metadata (JSON blob) */
  metadata?: Record<string, unknown>;
  /** Optional: email subject (only relevant for email channel) */
  subject?: string;
  /** Optional: strictness override */
  strictness?: StrictnessLevel;
}

export interface CheckMessageResponse {
  /** The action taken: block, allow, flag */
  action: "block" | "allow" | "flag";
  /** Receipt ID for audit trail */
  receipt_id: string;
  /** ISO timestamp */
  timestamp: string;
  /** Reason for the decision (present on block/flag) */
  reason?: string;
  /** Human-readable reason for display */
  reason_display?: string;
  /** Numeric confidence (0.0-1.0) */
  confidence?: number;
  /** Legal/regulatory citation */
  regulation_cite?: string;
  /** Suggested edit for blocked/flagged content */
  suggested_edit?: string;
  /** Whether the message can still be sent (flag only) */
  allow_send?: boolean;
  /** Whether human review is required (flag only) */
  review_required?: boolean;
}

export interface CheckMessageError {
  error: string;
  error_type: "validation_error" | "internal_error";
  detail?: string;
}

// ─── Helpers ──────────────────────────────────────────────────

const VALID_CHANNELS: ChannelType[] = ["email", "sms", "slack", "linkedin"];
const VALID_STRICTNESS: StrictnessLevel[] = ["strict", "standard", "permissive"];

/** Map internal EventType to spec action */
function mapAction(event_type: EventType): "block" | "allow" | "flag" {
  switch (event_type) {
    case "BLOCK": return "block";
    case "FLAG": return "flag";
    case "WARN": return "flag"; // WARN maps to flag in the unified API
    case "PASS": return "allow";
    case "OVERRIDE": return "allow";
    default: return "allow";
  }
}

/** Build spec-compliant response from receipt */
function buildResponse(receipt: EmailReceipt): CheckMessageResponse {
  const action = mapAction(receipt.event_type);

  const response: CheckMessageResponse = {
    action,
    receipt_id: receipt.receipt_id,
    timestamp: receipt.timestamp,
  };

  if (action === "block" || action === "flag") {
    response.reason = receipt.decision.reason;
    response.reason_display = receipt.reason_display || receipt.decision.reason;
    response.confidence = receipt.confidence_score ?? confidenceToScore(receipt.policy.confidence);
    response.regulation_cite = receipt.regulation_cite || undefined;
    response.suggested_edit = receipt.suggested_edit || undefined;
  }

  if (action === "flag") {
    response.allow_send = true;
    response.review_required = true;
  }

  return response;
}

// ─── Route Registration ───────────────────────────────────────

export function registerCheckMessageRoutes(app: Express): void {
  // CORS preflight
  app.options("/api/v1/check-message", (_req: Request, res: Response) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Max-Age", "86400");
    res.status(204).end();
  });

  // Main endpoint
  app.post("/api/v1/check-message", async (req: Request, res: Response) => {
    res.set("Access-Control-Allow-Origin", "*");

    try {
      const body = req.body as Partial<CheckMessageRequest>;

      // ─── Validation ───────────────────────────────────────
      if (!body.channel || !VALID_CHANNELS.includes(body.channel)) {
        return res.status(400).json({
          error: `Invalid channel. Must be one of: ${VALID_CHANNELS.join(", ")}`,
          error_type: "validation_error",
        } satisfies CheckMessageError);
      }

      if (!body.message_text || typeof body.message_text !== "string" || body.message_text.length < 1) {
        return res.status(400).json({
          error: "message_text is required and must be a non-empty string",
          error_type: "validation_error",
        } satisfies CheckMessageError);
      }

      if (body.message_text.length > 50000) {
        return res.status(400).json({
          error: "message_text exceeds maximum length of 50,000 characters",
          error_type: "validation_error",
        } satisfies CheckMessageError);
      }

      const strictness: StrictnessLevel = (body.strictness && VALID_STRICTNESS.includes(body.strictness))
        ? body.strictness
        : "standard";

      // ─── Route through unified intent pipeline ─────────
      const intent = buildInboundIntent({
        message: body.message_text,
        sender: body.sender_id || "unknown",
        channel: body.channel,
        source: "external",
        metadata: {
          ...(body.subject ? { subject: body.subject } : {}),
          ...(body.recipient ? { recipient: body.recipient } : {}),
          ...(body.metadata || {}),
        },
      });

      // Inbound = classify only, no execution
      const pipelineResult = await processIntent(intent, undefined, {
        strictness,
        useLLM: false, // keep API fast, rule-based only
      });

      // ─── Map pipeline result to spec-compliant response ───
      const action = pipelineResult.decision === "block" ? "block" as const
        : pipelineResult.decision === "require_confirmation" ? "flag" as const
        : pipelineResult.event_type === "FLAG" ? "flag" as const
        : pipelineResult.event_type === "WARN" ? "flag" as const
        : "allow" as const;

      const response: CheckMessageResponse = {
        action,
        receipt_id: pipelineResult.receipt.intent_id,
        timestamp: pipelineResult.receipt.timestamp,
      };

      if (action === "block" || action === "flag") {
        response.reason = pipelineResult.reason;
        response.reason_display = pipelineResult.reason;
        response.confidence = pipelineResult.confidence_score;
        response.suggested_edit = pipelineResult.suggested_edit || undefined;
      }

      if (action === "flag") {
        response.allow_send = true;
        response.review_required = true;
      }

      return res.status(200).json(response);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[check-message] Internal error: ${msg}`);
      return res.status(500).json({
        error: "Internal server error",
        error_type: "internal_error",
        detail: process.env.NODE_ENV === "development" ? msg : undefined,
      } satisfies CheckMessageError);
    }
  });
}
