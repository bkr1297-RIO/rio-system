/**
 * RIO tRPC Router
 * Exposes all RIO enforcement endpoints as public procedures for the demo.
 * Includes policy persistence, governance engine checks, and auto-approve/deny.
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
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

export const rioRouter = router({
  // Create a new intent
  createIntent: publicProcedure
    .input(z.object({
      action: z.string(),
      description: z.string(),
      requestedBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      return createIntent(input.action, input.description, input.requestedBy);
    }),

  // Check if a policy applies to this action (governance engine pre-check)
  checkPolicy: publicProcedure
    .input(z.object({
      action: z.string(),
    }))
    .query(async ({ input }) => {
      return checkPolicies(input.action);
    }),

  // Auto-approve by policy (generates receipt + ledger, records decision_source: policy_auto)
  autoApprove: publicProcedure
    .input(z.object({
      intentId: z.string(),
      policyId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return autoApproveByPolicy(input.intentId, input.policyId);
    }),

  // Auto-deny by policy
  autoDeny: publicProcedure
    .input(z.object({
      intentId: z.string(),
      policyId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return autoDenyByPolicy(input.intentId, input.policyId);
    }),

  // Approve an intent (generates cryptographic signature)
  approve: publicProcedure
    .input(z.object({
      intentId: z.string(),
      decidedBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      return approveIntent(input.intentId, input.decidedBy);
    }),

  // Deny an intent
  deny: publicProcedure
    .input(z.object({
      intentId: z.string(),
      decidedBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      return denyIntent(input.intentId, input.decidedBy);
    }),

  // Execute an intent (ENFORCED — returns 403 if not approved)
  execute: publicProcedure
    .input(z.object({
      intentId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return executeIntent(input.intentId);
    }),

  // Get full audit log for an intent
  auditLog: publicProcedure
    .input(z.object({
      intentId: z.string(),
    }))
    .query(async ({ input }) => {
      return getAuditLog(input.intentId);
    }),

  // Get ledger chain for explorer
  ledgerChain: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
    }).optional())
    .query(async ({ input }) => {
      return getLedgerChain(input?.limit ?? 50);
    }),

  // Verify a receipt by ID (server-side signature + hash verification)
  verifyReceipt: publicProcedure
    .input(z.object({
      receiptId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return verifyReceiptById(input.receiptId);
    }),

  // Learning analytics — decision patterns and policy suggestions
  learningAnalytics: publicProcedure
    .query(async () => {
      return getLearningAnalytics();
    }),

  // ── Policy Management ──────────────────────────────────────────────

  // Accept a policy suggestion (persists to DB)
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

  // Dismiss a policy suggestion
  dismissPolicySuggestion: publicProcedure
    .input(z.object({
      suggestionId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return dismissPolicy(input.suggestionId);
    }),

  // Get all active policies
  activePolicies: publicProcedure
    .query(async () => {
      return getActivePolicies();
    }),

  // Deactivate a policy
  deactivatePolicy: publicProcedure
    .input(z.object({
      policyId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return deactivatePolicy(input.policyId);
    }),

  // ── Gmail Execution ──────────────────────────────────────────────

  // Send email via Gmail (live mode only, after receipt + ledger)
  sendGmail: publicProcedure
    .input(z.object({
      to: z.string(),
      subject: z.string(),
      body: z.string(),
      intentId: z.string(),
    }))
    .mutation(async ({ input }) => {
      // This is the real execution step.
      // In production, this would call Gmail API.
      // For now, we log the intent and return success.
      // The receipt and ledger entry already exist at this point.
      console.log(`[RIO Gmail] Sending email to ${input.to} — Intent: ${input.intentId}`);
      console.log(`[RIO Gmail] Subject: ${input.subject}`);
      console.log(`[RIO Gmail] Body: ${input.body}`);

      // TODO: Wire actual Gmail MCP/API call here
      // For now, return simulated success
      return {
        sent: true,
        to: input.to,
        subject: input.subject,
        intentId: input.intentId,
        executedAt: new Date().toISOString(),
        note: "Gmail execution placeholder — wire MCP tools for real send",
      };
    }),

  // ── Notifications ──────────────────────────────────────────────

  // Notify owner when an intent is pending approval
  notifyPendingApproval: publicProcedure
    .input(z.object({
      intentId: z.string(),
      action: z.string(),
      requester: z.string(),
      description: z.string(),
    }))
    .mutation(async ({ input }) => {
      const success = await notifyOwner({
        title: `RIO: Approval Required — ${input.action.replace(/_/g, " ")}`,
        content: `${input.requester} wants to ${input.description}. Intent ID: ${input.intentId}. Go to /go to approve or deny.`,
      });
      return { notified: success, intentId: input.intentId };
    }),
});
