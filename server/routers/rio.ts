/**
 * RIO tRPC Router
 * Exposes all RIO enforcement endpoints as public procedures.
 * Includes policy persistence, governance engine checks, auto-approve/deny,
 * and the connector-based execution layer.
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { notifyOwner } from "../_core/notification";
import {
  createIntent,
  approveIntent,
  denyIntent,
  executeIntent,
  getAuditLog,
  verifyReceiptById,
  getLedgerChain,
  getLearningAnalytics,
  acceptPolicy,
  dismissPolicy,
  getActivePolicies,
  deactivatePolicy,
  checkPolicies,
  autoApproveByPolicy,
  autoDenyByPolicy,
} from "../rio";
import { connectorRegistry } from "../connectors";

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

  approve: publicProcedure
    .input(z.object({
      intentId: z.string(),
      decidedBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      return approveIntent(input.intentId, input.decidedBy);
    }),

  deny: publicProcedure
    .input(z.object({
      intentId: z.string(),
      decidedBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      return denyIntent(input.intentId, input.decidedBy);
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

  // ── Notifications ──────────────────────────────────────────────

  notifyPendingApproval: publicProcedure
    .input(z.object({
      intentId: z.string(),
      action: z.string(),
      requester: z.string(),
      description: z.string(),
      origin: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Build a proper approval link — use /app (Bondi workspace) Approvals tab
      const baseUrl = input.origin || "";
      const approvalLink = `${baseUrl}/app`;

      const success = await notifyOwner({
        title: `RIO: Approval Required — ${input.action.replace(/_/g, " ")}`,
        content: [
          `${input.requester} wants to ${input.description}.`,
          `Intent ID: ${input.intentId}`,
          ``,
          `Open Bondi to review and approve or deny: ${approvalLink}`,
        ].join("\n"),
      });
      return { notified: success, intentId: input.intentId };
    }),
});
