/**
 * RIO tRPC Router
 * Exposes all RIO enforcement endpoints as public procedures for the demo.
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { createIntent, approveIntent, denyIntent, executeIntent, getAuditLog } from "../rio";

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
});
