/**
 * Slack Interactive Approval Endpoint
 *
 * POST /api/slack/interactions
 *
 * Handles Slack interactive button clicks (approve/deny) from Block Kit messages.
 * Security:
 *   1. Verifies Slack request signature (HMAC-SHA256 with signing secret)
 *   2. Rejects replay attacks (timestamp > 5 minutes old)
 *   3. Fail-closed: any verification failure → 403 rejection
 *
 * Governance flow after verification:
 *   Slack Button Click →
 *   Verify Slack Signature →
 *   Match intent_id →
 *   Record Human Authorization →
 *   Generate Authorization Receipt →
 *   Allow Execution →
 *   Generate Execution Receipt →
 *   Append Ledger Entry →
 *   Trigger Verification
 */

import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { ENV } from "../_core/env";
import {
  approveIntent,
  denyIntent,
  executeIntent,
} from "../rio";

// ── Constants ───────────────────────────────────────────────────────────────

/** Maximum age of a Slack request timestamp before it's considered a replay */
const MAX_TIMESTAMP_AGE_SECONDS = 300; // 5 minutes

// ── Slack Signature Verification ────────────────────────────────────────────

/**
 * Verifies the Slack request signature using HMAC-SHA256.
 * See: https://api.slack.com/authentication/verifying-requests-from-slack
 *
 * @param signingSecret - The Slack app signing secret
 * @param timestamp - The X-Slack-Request-Timestamp header value
 * @param rawBody - The raw request body string
 * @param signature - The X-Slack-Signature header value
 * @returns true if signature is valid
 */
export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string
): boolean {
  if (!signingSecret || !timestamp || !rawBody || !signature) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac("sha256", signingSecret);
  hmac.update(sigBasestring);
  const computedSignature = `v0=${hmac.digest("hex")}`;

  // Use timingSafeEqual to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedSignature),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

/**
 * Checks if the Slack request timestamp is within the acceptable window.
 * Rejects requests older than MAX_TIMESTAMP_AGE_SECONDS to prevent replay attacks.
 */
export function isTimestampValid(timestamp: string): boolean {
  const requestTime = parseInt(timestamp, 10);
  if (isNaN(requestTime)) return false;

  const currentTime = Math.floor(Date.now() / 1000);
  const age = Math.abs(currentTime - requestTime);
  return age <= MAX_TIMESTAMP_AGE_SECONDS;
}

// ── Slack Interaction Payload Parser ────────────────────────────────────────

export interface SlackInteractionPayload {
  type: string;
  trigger_id: string;
  user: {
    id: string;
    username: string;
    name: string;
  };
  actions: Array<{
    action_id: string;
    block_id: string;
    value: string;
    type: string;
  }>;
  message?: {
    ts: string;
    text: string;
  };
  channel?: {
    id: string;
    name: string;
  };
  response_url: string;
}

/**
 * Parses the Slack interaction payload from the request body.
 * Slack sends the payload as a URL-encoded `payload` field containing JSON.
 */
function parseSlackPayload(body: string): SlackInteractionPayload | null {
  try {
    // Slack sends: payload=<url-encoded JSON>
    const params = new URLSearchParams(body);
    const payloadStr = params.get("payload");
    if (!payloadStr) return null;
    return JSON.parse(payloadStr);
  } catch {
    return null;
  }
}

/**
 * Extracts the intent_id and decision from the Slack button action.
 * Button value format: "approve:INT-XXXXXXXX" or "deny:INT-XXXXXXXX"
 */
function extractDecision(payload: SlackInteractionPayload): {
  intentId: string;
  decision: "approved" | "denied";
  approverId: string;
  approverName: string;
} | null {
  if (!payload.actions || payload.actions.length === 0) return null;

  const action = payload.actions[0];
  const value = action.value;
  if (!value) return null;

  const [decisionStr, intentId] = value.split(":");
  if (!intentId) return null;

  if (decisionStr === "approve") {
    return {
      intentId,
      decision: "approved",
      approverId: payload.user.id,
      approverName: payload.user.name || payload.user.username,
    };
  } else if (decisionStr === "deny") {
    return {
      intentId,
      decision: "denied",
      approverId: payload.user.id,
      approverName: payload.user.name || payload.user.username,
    };
  }

  return null;
}

// ── Slack Response Message Builder ──────────────────────────────────────────

function buildApprovalResponseMessage(
  intentId: string,
  decision: "approved" | "denied",
  approverName: string,
  receiptId?: string,
  ledgerBlockId?: string
): object {
  const isApproved = decision === "approved";
  const emoji = isApproved ? ":white_check_mark:" : ":x:";
  const statusText = isApproved ? "APPROVED" : "DENIED";
  const color = isApproved ? "#2eb886" : "#e01e5a";

  const blocks: object[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} RIO Decision: ${statusText}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Intent ID:*\n\`${intentId}\``,
        },
        {
          type: "mrkdwn",
          text: `*Decided By:*\n${approverName} (via Slack)`,
        },
      ],
    },
  ];

  if (isApproved && receiptId) {
    blocks.push({
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Receipt ID:*\n\`${receiptId}\``,
        },
        {
          type: "mrkdwn",
          text: `*Ledger Block:*\n\`${ledgerBlockId || "N/A"}\``,
        },
      ],
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `RIO Governance Engine • ${new Date().toISOString()} • Decision recorded with cryptographic receipt`,
      },
    ],
  });

  return {
    replace_original: true,
    blocks,
  };
}

function buildErrorResponseMessage(error: string): object {
  return {
    replace_original: false,
    response_type: "ephemeral",
    text: `:warning: RIO Governance Error: ${error}`,
  };
}

// ── Express Route Registration ──────────────────────────────────────────────

export function registerSlackInteractionsRoute(app: Express) {
  // We need the raw body for signature verification, so we use a text parser
  // on this specific route before the global JSON parser processes it.
  app.post(
    "/api/slack/interactions",
    // Use text parser to get raw body for signature verification
    (req: Request, res: Response, next) => {
      // If body is already parsed as string, continue
      if (typeof req.body === "string") {
        return next();
      }
      // If body is a Buffer, convert to string
      if (Buffer.isBuffer(req.body)) {
        req.body = req.body.toString("utf-8");
        return next();
      }
      // If body is an object (already parsed by express.urlencoded), we need raw body
      // We'll reconstruct it — but ideally this route should be registered before body parsers
      // For safety, we handle both cases
      if (typeof req.body === "object" && req.body !== null) {
        // Try to reconstruct the raw body from the parsed payload
        const payload = req.body.payload;
        if (payload) {
          req.body = `payload=${encodeURIComponent(payload)}`;
          return next();
        }
      }
      next();
    },
    async (req: Request, res: Response) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [Slack Interactions] Incoming request`);

      // ── Step 1: Extract headers ──
      const slackTimestamp = req.headers["x-slack-request-timestamp"] as string;
      const slackSignature = req.headers["x-slack-signature"] as string;
      const rawBody = typeof req.body === "string" ? req.body : "";

      // ── Step 2: Verify timestamp (replay attack prevention) ──
      if (!slackTimestamp || !isTimestampValid(slackTimestamp)) {
        console.error(`[${timestamp}] [Slack Interactions] REJECTED: Invalid or expired timestamp`);
        res.status(403).json({
          error: "REPLAY_ATTACK_REJECTED",
          message: "Request timestamp is invalid or too old. Possible replay attack.",
          failClosed: true,
        });
        return;
      }

      // ── Step 3: Verify Slack signature (HMAC-SHA256) ──
      const signingSecret = ENV.slackSigningSecret;
      if (!signingSecret) {
        console.error(`[${timestamp}] [Slack Interactions] REJECTED: No signing secret configured`);
        res.status(500).json({
          error: "CONFIGURATION_ERROR",
          message: "Slack signing secret not configured. Fail-closed.",
          failClosed: true,
        });
        return;
      }

      if (!verifySlackSignature(signingSecret, slackTimestamp, rawBody, slackSignature)) {
        console.error(`[${timestamp}] [Slack Interactions] REJECTED: Invalid Slack signature`);
        res.status(403).json({
          error: "INVALID_SIGNATURE",
          message: "Slack request signature verification failed. Fail-closed.",
          failClosed: true,
        });
        return;
      }

      console.log(`[${timestamp}] [Slack Interactions] Signature verified ✓`);

      // ── Step 4: Parse payload ──
      const payload = parseSlackPayload(rawBody);
      if (!payload) {
        console.error(`[${timestamp}] [Slack Interactions] REJECTED: Invalid payload`);
        res.status(400).json({
          error: "INVALID_PAYLOAD",
          message: "Could not parse Slack interaction payload.",
        });
        return;
      }

      // ── Step 5: Extract decision ──
      const decision = extractDecision(payload);
      if (!decision) {
        console.error(`[${timestamp}] [Slack Interactions] REJECTED: Could not extract decision from payload`);
        res.status(400).json({
          error: "INVALID_ACTION",
          message: "Could not extract intent_id or decision from Slack action.",
        });
        return;
      }

      console.log(`[${timestamp}] [Slack Interactions] Decision: ${decision.decision} for ${decision.intentId} by ${decision.approverName} (${decision.approverId})`);

      // ── Step 6: Record decision in RIO governance system ──
      try {
        const decidedBy = `${decision.approverName} (Slack:${decision.approverId})`;

        if (decision.decision === "approved") {
          // Approve → Execute → Receipt → Ledger → Verify
          const approvalResult = await approveIntent(decision.intentId, decidedBy);
          console.log(`[${timestamp}] [Slack Interactions] Intent ${decision.intentId} approved. Signature: ${approvalResult.signature}`);

          // Execute the approved intent (generates receipt + ledger entry)
          const execResult = await executeIntent(decision.intentId);

          if (execResult.allowed) {
            const receipt = execResult.receipt as Record<string, unknown>;
            const ledgerEntry = execResult.ledger_entry as Record<string, unknown>;

            console.log(`[${timestamp}] [Slack Interactions] Execution complete. Receipt: ${receipt.receipt_id}, Ledger: ${ledgerEntry.block_id}`);

            // Send updated message back to Slack
            if (payload.response_url) {
              try {
                await fetch(payload.response_url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(
                    buildApprovalResponseMessage(
                      decision.intentId,
                      "approved",
                      decision.approverName,
                      receipt.receipt_id as string,
                      ledgerEntry.block_id as string
                    )
                  ),
                });
              } catch (err) {
                console.error(`[${timestamp}] [Slack Interactions] Failed to update Slack message:`, err);
              }
            }

            res.status(200).json({
              decision: "approved",
              intentId: decision.intentId,
              approverId: decision.approverId,
              approverName: decision.approverName,
              receiptId: receipt.receipt_id,
              intentHash: receipt.intent_hash,
              actionHash: receipt.action_hash,
              verificationHash: receipt.verification_hash,
              ledgerBlockId: ledgerEntry.block_id,
              ledgerHash: ledgerEntry.current_hash,
              previousHash: ledgerEntry.previous_hash,
              timestamp: new Date().toISOString(),
              protocolVersion: "v2",
              source: "slack_interactive",
            });
          } else {
            // Execution was blocked even after approval (shouldn't happen, but fail-closed)
            console.error(`[${timestamp}] [Slack Interactions] Execution blocked after approval: ${execResult.message}`);
            if (payload.response_url) {
              try {
                await fetch(payload.response_url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(buildErrorResponseMessage("Execution blocked after approval. Check RIO logs.")),
                });
              } catch {}
            }
            res.status(403).json({
              error: "EXECUTION_BLOCKED",
              message: execResult.message,
              failClosed: true,
            });
          }
        } else {
          // Deny flow
          const denyResult = await denyIntent(decision.intentId, decidedBy);
          console.log(`[${timestamp}] [Slack Interactions] Intent ${decision.intentId} denied by ${decidedBy}`);

          // Send updated message back to Slack
          if (payload.response_url) {
            try {
              await fetch(payload.response_url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                  buildApprovalResponseMessage(
                    decision.intentId,
                    "denied",
                    decision.approverName
                  )
                ),
              });
            } catch (err) {
              console.error(`[${timestamp}] [Slack Interactions] Failed to update Slack message:`, err);
            }
          }

          res.status(200).json({
            decision: "denied",
            intentId: decision.intentId,
            approverId: decision.approverId,
            approverName: decision.approverName,
            timestamp: new Date().toISOString(),
            source: "slack_interactive",
          });
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[${timestamp}] [Slack Interactions] Governance error:`, errorMessage);

        // Send error back to Slack
        if (payload.response_url) {
          try {
            await fetch(payload.response_url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(buildErrorResponseMessage(errorMessage)),
            });
          } catch {}
        }

        // Check for specific error types
        if (errorMessage.includes("not found")) {
          res.status(404).json({
            error: "INTENT_NOT_FOUND",
            message: errorMessage,
            failClosed: true,
          });
        } else if (errorMessage.includes("already")) {
          res.status(409).json({
            error: "INTENT_ALREADY_DECIDED",
            message: errorMessage,
          });
        } else {
          res.status(500).json({
            error: "GOVERNANCE_ERROR",
            message: errorMessage,
            failClosed: true,
          });
        }
      }
    }
  );

  console.log("[Slack Interactions] Route registered: POST /api/slack/interactions");
}
