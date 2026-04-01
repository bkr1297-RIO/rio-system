import { z } from "zod";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { recordDemoEvent, getDemoStats, saveDemoWish } from "../db";

export const demoRouter = router({
  // Public: record a demo step event (no auth required — demo is public)
  trackStep: publicProcedure
    .input(
      z.object({
        sessionId: z.string().min(1).max(64),
        step: z.number().int().min(0).max(10),
        stepLabel: z.string().min(1).max(32),
        action: z.enum(["view", "approve", "deny", "complete"]),
      })
    )
    .mutation(async ({ input }) => {
      await recordDemoEvent({
        sessionId: input.sessionId,
        step: input.step,
        stepLabel: input.stepLabel,
        action: input.action,
      });
      return { success: true };
    }),

  // Public: submit a wish/idea from the demo bridge screen
  submitWish: publicProcedure
    .input(
      z.object({
        sessionId: z.string().min(1).max(64),
        text: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ input }) => {
      await saveDemoWish({ sessionId: input.sessionId, text: input.text });
      return { success: true };
    }),

  // Admin: get demo funnel stats
  stats: adminProcedure.query(async () => {
    return getDemoStats();
  }),
});
