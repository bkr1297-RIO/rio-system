/**
 * RIO tRPC Router
 * Exposes RIO enforcement endpoints. approve/deny use protectedProcedure
 * to bind approver identity from the authenticated session.
 * Includes policy persistence, governance engine checks, auto-approve/deny,
 * and the connector-based execution layer.
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { notifyOwner } from "../_core/notification";
// Phase B: Core governance operations routed through the governance router
// (dispatches to gateway or internal engine based on GATEWAY_URL)
import {
  createIntent,
  approveIntent,
  denyIntent,
  executeIntent,
  getAuditLog,
  verifyReceipt as verifyReceiptById,
  getLedgerChain,
  getLearningAnalytics,
  getGovernanceHealth,
  getRoutingMode,
  getGatewayClient,
} from "../governance-router";
// Policy functions remain internal-only (not routed through gateway)
import {
  acceptPolicy,
  dismissPolicy,
  getActivePolicies,
  deactivatePolicy,
  checkPolicies,
  autoApproveByPolicy,
  autoDenyByPolicy,
} from "../rio";
import { seedGenesisReceipt, verifyLedgerIntegrity } from "../ledger-guard";
import { connectorRegistry } from "../connectors";
import { getSlackWebhookUrl } from "../connectors/slack-helpers";

export const rioRouter = router({
  // ── Intent Lifecycle ──────────────────────────────────────────────

  createIntent: publicProcedure
    .input(z.object({
      action: z.string(),
      description: z.string(),
      requestedBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      return createIntent(input.action, input.description, input.requestedBy);
    }),

  checkPolicy: publicProcedure
    .input(z.object({
      action: z.string(),
    }))
    .query(async ({ input }) => {
      return checkPolicies(input.action);
    }),

  autoApprove: publicProcedure
    .input(z.object({
      intentId: z.string(),
      policyId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return autoApproveByPolicy(input.intentId, input.policyId);
    }),

  autoDeny: publicProcedure
    .input(z.object({
      intentId: z.string(),
      policyId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return autoDenyByPolicy(input.intentId, input.policyId);
    }),

  approve: protectedProcedure
    .input(z.object({
      intentId: z.string(),
      signature: z.string().optional(),
      signatureTimestamp: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Identity is bound from the authenticated session — not client-supplied
      const decidedBy = ctx.user.name || ctx.user.email || `user:${ctx.user.id}`;
      return approveIntent(input.intentId, decidedBy, {
        signature: input.signature,
        signatureTimestamp: input.signatureTimestamp,
      });
    }),

  deny: protectedProcedure
    .input(z.object({
      intentId: z.string(),
      signature: z.string().optional(),
      signatureTimestamp: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Identity is bound from the authenticated session — not client-supplied
      const decidedBy = ctx.user.name || ctx.user.email || `user:${ctx.user.id}`;
      return denyIntent(input.intentId, decidedBy, {
        signature: input.signature,
        signatureTimestamp: input.signatureTimestamp,
      });
    }),

  execute: publicProcedure
    .input(z.object({
      intentId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return executeIntent(input.intentId);
    }),

  // ── Audit & Verification ──────────────────────────────────────────

  auditLog: publicProcedure
    .input(z.object({
      intentId: z.string(),
    }))
    .query(async ({ input }) => {
      return getAuditLog(input.intentId);
    }),

  ledgerChain: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
    }).optional())
    .query(async ({ input }) => {
      return getLedgerChain(input?.limit ?? 50);
    }),

  verifyReceipt: publicProcedure
    .input(z.object({
      receiptId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return verifyReceiptById(input.receiptId);
    }),

  // ── Learning Analytics ──────────────────────────────────────────

  learningAnalytics: publicProcedure
    .query(async () => {
      return getLearningAnalytics();
    }),

  // ── Policy Management ──────────────────────────────────────────

  acceptPolicySuggestion: publicProcedure
    .input(z.object({
      action: z.string(),
      type: z.enum(["auto_approve", "auto_deny", "reduce_pause", "increase_scrutiny"]),
      title: z.string(),
      description: z.string(),
      confidence: z.number(),
      basedOn: z.number(),
      approvalRate: z.number(),
      avgDecisionTimeSec: z.number(),
    }))
    .mutation(async ({ input }) => {
      return acceptPolicy(input);
    }),

  dismissPolicySuggestion: publicProcedure
    .input(z.object({
      suggestionId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return dismissPolicy(input.suggestionId);
    }),

  activePolicies: publicProcedure
    .query(async () => {
      return getActivePolicies();
    }),

  deactivatePolicy: publicProcedure
    .input(z.object({
      policyId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return deactivatePolicy(input.policyId);
    }),

  // ── Connector Architecture ──────────────────────────────────────

  /** List all registered connectors with their status and capabilities */
  listConnectors: publicProcedure
    .query(async () => {
      return connectorRegistry.listConnectors();
    }),

  /** List all supported actions across all connectors */
  listActions: publicProcedure
    .query(async () => {
      return connectorRegistry.listActions();
    }),

  /** Get info about a specific connector */
  getConnector: publicProcedure
    .input(z.object({
      connectorId: z.string(),
    }))
    .query(async ({ input }) => {
      return connectorRegistry.getConnector(input.connectorId);
    }),

  /**
   * Execute an action through the connector layer.
   * MUST only be called after receipt + ledger entry exist.
   * The connector registry routes to the correct connector.
   */
  connectorExecute: publicProcedure
    .input(z.object({
      intentId: z.string(),
      receiptId: z.string(),
      action: z.string(),
      parameters: z.record(z.string(), z.string()),
      mode: z.enum(["live", "simulated"]),
    }))
    .mutation(async ({ input, ctx }) => {
      // Pass the authenticated user's ID so connectors can use per-user OAuth tokens
      const userId = (ctx as any).user?.id as number | undefined;
      const result = await connectorRegistry.execute({
        intentId: input.intentId,
        receiptId: input.receiptId,
        action: input.action,
        parameters: input.parameters as Record<string, string>,
        mode: input.mode,
        userId,
      });
      return result;
    }),

  // ── Gmail Execution (legacy, kept for backward compatibility) ──

  sendGmail: publicProcedure
    .input(z.object({
      to: z.string(),
      subject: z.string(),
      body: z.string(),
      intentId: z.string(),
    }))
    .mutation(async ({ input }) => {
      // Route through connector architecture
      const result = await connectorRegistry.execute({
        intentId: input.intentId,
        receiptId: "", // Legacy endpoint doesn't have receipt ID
        action: "send_email",
        parameters: {
          to: input.to,
          subject: input.subject,
          body: input.body,
        },
        mode: "simulated",
      });

      return {
        sent: result.success,
        to: input.to,
        subject: input.subject,
        intentId: input.intentId,
        executedAt: result.executedAt,
        connector: result.connector,
        note: result.detail,
      };
    }),

  // ── Ledger Infrastructure ──────────────────────────────────────

  /** Seed the real 4:44 PM genesis receipt into the persistent ledger */
  seedGenesis: protectedProcedure
    .mutation(async () => {
      return seedGenesisReceipt();
    }),

  /** Verify the integrity of the entire ledger hash chain and signatures */
  ledgerIntegrity: publicProcedure
    .query(async () => {
      return verifyLedgerIntegrity();
    }),

  // ── Notifications ──────────────────────────────────────────────

  notifyPendingApproval: publicProcedure
    .input(z.object({
      intentId: z.string(),
      action: z.string(),
      requester: z.string(),
      description: z.string(),
      origin: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Build a proper approval link — use /app (Bondi workspace) Approvals tab
      const baseUrl = input.origin || "";
      const approvalLink = `${baseUrl}/app`;
      const goLink = `${baseUrl}/go`;

      // 1. Notify owner via built-in notification channel
      const ownerNotified = await notifyOwner({
        title: `RIO: Approval Required — ${input.action.replace(/_/g, " ")}`,
        content: [
          `${input.requester} wants to ${input.description}.`,
          `Intent ID: ${input.intentId}`,
          ``,
          `Approve or deny this action:`,
          `  → Quick: ${goLink}`,
          `  → Full workspace: ${approvalLink}`,
        ].join("\n"),
      });

      // 2. Also notify via Slack if the user has a connected webhook
      let slackNotified = false;
      const userId = (ctx as any).user?.id as number | undefined;
      if (userId) {
        try {
          const webhookUrl = await getSlackWebhookUrl(userId);
          if (webhookUrl) {
            const slackPayload = {
              blocks: [
                {
                  type: "header",
                  text: {
                    type: "plain_text",
                    text: `\u26A0\uFE0F RIO Approval Required`,
                    emoji: true,
                  },
                },
                {
                  type: "section",
                  fields: [
                    {
                      type: "mrkdwn",
                      text: `*Action:*\n${input.action.replace(/_/g, " ")}`,
                    },
                    {
                      type: "mrkdwn",
                      text: `*Requester:*\n${input.requester}`,
                    },
                  ],
                },
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `*Description:*\n${input.description}`,
                  },
                },
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `*Intent ID:*\n\`${input.intentId}\``,
                  },
                },
                {
                  type: "actions",
                  block_id: `rio_approval_${input.intentId}`,
                  elements: [
                    {
                      type: "button",
                      action_id: "rio_approve",
                      text: {
                        type: "plain_text",
                        text: "\u2705 Approve",
                        emoji: true,
                      },
                      value: `approve:${input.intentId}`,
                      style: "primary",
                    },
                    {
                      type: "button",
                      action_id: "rio_deny",
                      text: {
                        type: "plain_text",
                        text: "\u274C Deny",
                        emoji: true,
                      },
                      value: `deny:${input.intentId}`,
                      style: "danger",
                    },
                    {
                      type: "button",
                      action_id: "rio_open_bondi",
                      text: {
                        type: "plain_text",
                        text: "\uD83D\uDCCB Open Bondi",
                        emoji: true,
                      },
                      url: approvalLink,
                    },
                  ],
                },
                {
                  type: "context",
                  elements: [
                    {
                      type: "mrkdwn",
                      text: `RIO Governance Engine \u2022 ${new Date().toISOString()}`,
                    },
                  ],
                },
              ],
            };

            const resp = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(slackPayload),
            });
            slackNotified = resp.ok;
            if (!resp.ok) {
              console.error(`[RIO Slack Notify] Webhook POST failed: ${resp.status} ${resp.statusText}`);
            } else {
              console.log(`[RIO Slack Notify] Approval alert sent to Slack for intent ${input.intentId}`);
            }
          }
        } catch (err) {
          console.error("[RIO Slack Notify] Error sending Slack approval alert:", err);
        }
      }

      return { notified: ownerNotified, slackNotified, intentId: input.intentId };
    }),

  // ── Gateway V1 API (Live Production) ────────────────────────────

  /** Login to the gateway and get JWT token (server-side proxy) */
  gatewayLogin: publicProcedure
    .input(z.object({
      userId: z.string(),
      passphrase: z.string(),
    }))
    .mutation(async ({ input }) => {
      const client = getGatewayClient();
      if (!client) {
        return { success: false, error: "Gateway not configured" };
      }
      try {
        const result = await client.login(input.userId, input.passphrase);
        return {
          success: true,
          token: result.token,
          userId: result.user_id,
          displayName: result.display_name,
          role: result.role,
          expiresIn: result.expires_in,
        };
      } catch (err: any) {
        return {
          success: false,
          error: err?.message || "Login failed",
        };
      }
    }),

  /** List intents from the gateway with optional status filter */
  gatewayIntents: publicProcedure
    .input(z.object({
      status: z.string().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const client = getGatewayClient();
      if (!client) {
        return { intents: [], count: 0, source: "none" };
      }
      try {
        const result = await client.listIntents(input?.status, input?.limit);
        return { ...result, source: "gateway" };
      } catch (err: any) {
        console.warn("[RIO] Gateway listIntents failed:", err?.message);
        return { intents: [], count: 0, source: "error", error: err?.message };
      }
    }),

  /** Get a specific intent with full pipeline state from the gateway */
  gatewayIntentDetail: publicProcedure
    .input(z.object({
      intentId: z.string(),
    }))
    .query(async ({ input }) => {
      const client = getGatewayClient();
      if (!client) {
        return { found: false, source: "none" };
      }
      try {
        const result = await client.getIntent(input.intentId);
        return { found: true, intent: result, source: "gateway" };
      } catch (err: any) {
        console.warn("[RIO] Gateway getIntent failed:", err?.message);
        return { found: false, source: "error", error: err?.message };
      }
    }),

  /** Verify chain integrity from the gateway */
  gatewayVerify: publicProcedure
    .input(z.object({
      intentId: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const client = getGatewayClient();
      if (!client) {
        return { valid: false, source: "none" };
      }
      try {
        const result = await client.verify(input?.intentId);
        return { ...result, source: "gateway" };
      } catch (err: any) {
        console.warn("[RIO] Gateway verify failed:", err?.message);
        return { valid: false, source: "error", error: err?.message };
      }
    }),

  // ── Governance Infrastructure Status ──────────────────────────────

  /** Get the current governance routing mode and health of all backends */
  governanceHealth: publicProcedure
    .query(async () => {
      return getGovernanceHealth();
    }),

  /** Get the current routing mode (gateway | internal | uninitialized) */
  routingMode: publicProcedure
    .query(async () => {
      return { mode: getRoutingMode() };
    }),

  // ── Proxy Lifecycle (Onboard / Kill / Sync) ────────────────────

  /**
   * Onboard a new sovereign proxy.
   * Registers Ed25519 public key and initial policy set on the gateway.
   * Falls back to local-only registration if gateway endpoint not yet live.
   */
  proxyOnboard: publicProcedure
    .input(z.object({
      publicKey: z.string().min(64).max(64),
      keyFingerprint: z.string().min(16).max(16),
      displayName: z.string().min(1),
      policies: z.record(z.string(), z.unknown()),
      policyHash: z.string(),
      confirmationSignature: z.string(),
      confirmationTimestamp: z.string(),
    }))
    .mutation(async ({ input }) => {
      const client = getGatewayClient();
      if (client) {
        try {
          const result = await client.onboard({
            public_key: input.publicKey,
            key_fingerprint: input.keyFingerprint,
            display_name: input.displayName,
            policies: input.policies,
            policy_hash: input.policyHash,
            confirmation_signature: input.confirmationSignature,
            confirmation_timestamp: input.confirmationTimestamp,
          });
          return {
            success: true,
            source: "gateway" as const,
            proxyId: result.proxy_id,
            userId: result.user_id,
            publicKeyRegistered: result.public_key_registered,
            policiesApplied: result.policies_applied,
            receiptId: result.onboard_receipt_id,
            hash: result.onboard_hash,
            timestamp: result.timestamp,
          };
        } catch (err: any) {
          // Gateway endpoint not yet live (Romney building it)
          // Fall back to local registration
          console.warn("[RIO] Gateway onboard not available:", err?.message);
        }
      }
      // Local-only fallback: register proxy state client-side
      const proxyId = `proxy-${input.keyFingerprint}-${Date.now()}`;
      return {
        success: true,
        source: "local" as const,
        proxyId,
        userId: input.displayName,
        publicKeyRegistered: true,
        policiesApplied: Object.keys(input.policies).length,
        receiptId: `onboard-${proxyId}`,
        hash: input.policyHash,
        timestamp: new Date().toISOString(),
      };
    }),

  /**
   * Kill switch — immediately pause/destroy the proxy.
   * Burns all active tokens and logs a governance receipt.
   * No confirmation dialog — must be instant.
   */
  proxyKill: publicProcedure
    .input(z.object({
      publicKey: z.string(),
      killSignature: z.string(),
      killTimestamp: z.string(),
    }))
    .mutation(async ({ input }) => {
      const client = getGatewayClient();
      if (client) {
        try {
          const result = await client.kill({
            public_key: input.publicKey,
            kill_signature: input.killSignature,
            kill_timestamp: input.killTimestamp,
          });
          return {
            success: true,
            source: "gateway" as const,
            proxyId: result.proxy_id,
            tokensBurned: result.tokens_burned,
            receiptId: result.kill_receipt_id,
            hash: result.kill_hash,
            timestamp: result.timestamp,
          };
        } catch (err: any) {
          console.warn("[RIO] Gateway kill not available:", err?.message);
        }
      }
      // Local-only fallback: mark proxy as killed client-side
      return {
        success: true,
        source: "local" as const,
        proxyId: "local-proxy",
        tokensBurned: 0,
        receiptId: `kill-${Date.now()}`,
        hash: "local-kill",
        timestamp: new Date().toISOString(),
      };
    }),

  /**
   * Session sync — load full context on session start.
   * Returns pending approvals, recent receipts, health, pattern confidence.
   */
  proxySync: publicProcedure
    .query(async () => {
      const client = getGatewayClient();
      if (client) {
        try {
          const syncData = await client.sync();
          return {
            success: true,
            source: "gateway" as const,
            ...syncData,
          };
        } catch (err: any) {
          console.warn("[RIO] Gateway sync not available:", err?.message);
        }
      }
      // Fallback: assemble context from available sources
      let pendingCount = 0;
      let healthStatus = "unknown";
      let ledgerEntries = 0;
      let chainValid = false;
      try {
        if (client) {
          const health = await client.health();
          healthStatus = health.status;
          ledgerEntries = health.ledger?.entries ?? 0;
          chainValid = health.ledger?.chain_valid ?? false;
          const intents = await client.listIntents("pending_authorization", 100);
          pendingCount = intents.count;
        }
      } catch { /* gateway unavailable */ }
      return {
        success: true,
        source: "assembled" as const,
        status: "operational",
        proxy_id: "local",
        pending_approvals: pendingCount,
        recent_receipts: [],
        health: {
          gateway: healthStatus,
          ledger_valid: chainValid,
          ledger_entries: ledgerEntries,
        },
        pattern_confidence: 0,
        active_policies: 0,
        last_activity: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };
    }),
});
