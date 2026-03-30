/**
 * Push Notifications Router (Scaffolding)
 *
 * Server-side scaffolding for push notification subscriptions.
 * When the VAPID keys and push backend are ready, this router
 * will store and manage PushSubscription objects per user.
 *
 * Current state: endpoints exist but return placeholder responses.
 * Wire to a real push service (web-push npm) when backend is ready.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

// Push subscription schema matching the W3C PushSubscription interface
const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export const pushRouter = router({
  /**
   * Register a push subscription for the current user.
   * Stores the subscription so the server can send push notifications later.
   */
  subscribe: protectedProcedure
    .input(pushSubscriptionSchema)
    .mutation(async ({ input, ctx }) => {
      // TODO: Store subscription in database when push table is created
      // const db = await getDb();
      // await db.insert(pushSubscriptions).values({
      //   userId: ctx.user.id,
      //   endpoint: input.endpoint,
      //   p256dh: input.keys.p256dh,
      //   auth: input.keys.auth,
      //   expirationTime: input.expirationTime ?? null,
      // });
      console.log(
        `[Push] Subscription registered for user ${ctx.user.id} (endpoint: ${input.endpoint.slice(0, 50)}...)`
      );
      return { success: true, message: "Subscription registered (scaffolding — not persisted yet)" };
    }),

  /**
   * Unsubscribe the current user from push notifications.
   */
  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string().url() }))
    .mutation(async ({ input, ctx }) => {
      // TODO: Remove subscription from database
      // const db = await getDb();
      // await db.delete(pushSubscriptions).where(
      //   and(eq(pushSubscriptions.userId, ctx.user.id), eq(pushSubscriptions.endpoint, input.endpoint))
      // );
      console.log(
        `[Push] Subscription removed for user ${ctx.user.id} (endpoint: ${input.endpoint.slice(0, 50)}...)`
      );
      return { success: true, message: "Subscription removed (scaffolding)" };
    }),

  /**
   * Check if the current user has an active push subscription.
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    // TODO: Query database for active subscriptions
    return {
      subscribed: false,
      message: "Push notification backend not yet wired",
    };
  }),
});
