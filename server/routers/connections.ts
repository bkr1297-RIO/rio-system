/**
 * RIO Connections tRPC Router
 *
 * Manages user OAuth connections to external services.
 * Provides procedures to:
 *   - List all connections for the current user
 *   - Get connection status per provider
 *   - Disconnect a provider
 */

import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { userConnections, users } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const connectionsRouter = router({
  /**
   * Get all connections for the current authenticated user.
   * Returns an array of connection records with provider, status, and account info.
   */
  myConnections: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const connections = await db.select({
        id: userConnections.id,
        provider: userConnections.provider,
        status: userConnections.status,
        providerAccountId: userConnections.providerAccountId,
        providerAccountName: userConnections.providerAccountName,
        connectedAt: userConnections.connectedAt,
        updatedAt: userConnections.updatedAt,
      })
        .from(userConnections)
        .where(eq(userConnections.userId, ctx.user.id));

      return connections;
    }),

  /**
   * Get connection status for a specific provider.
   * Returns whether the provider is connected, the account email/name, and when it was connected.
   */
  providerStatus: protectedProcedure
    .input(z.object({
      provider: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { connected: false, provider: input.provider };

      const connections = await db.select({
        status: userConnections.status,
        providerAccountId: userConnections.providerAccountId,
        providerAccountName: userConnections.providerAccountName,
        connectedAt: userConnections.connectedAt,
      })
        .from(userConnections)
        .where(and(
          eq(userConnections.userId, ctx.user.id),
          eq(userConnections.provider, input.provider),
        ))
        .limit(1);

      if (connections.length === 0) {
        return { connected: false, provider: input.provider };
      }

      const conn = connections[0];
      return {
        connected: conn.status === "connected",
        provider: input.provider,
        status: conn.status,
        email: conn.providerAccountId,
        name: conn.providerAccountName,
        connectedAt: conn.connectedAt,
      };
    }),

  /**
   * Get a summary of Google connection status (all 3 providers at once).
   * This is the main endpoint the /connect page uses.
   */
  googleStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { connected: false, email: null, name: null, providers: [] };

      const connections = await db.select({
        provider: userConnections.provider,
        status: userConnections.status,
        providerAccountId: userConnections.providerAccountId,
        providerAccountName: userConnections.providerAccountName,
        connectedAt: userConnections.connectedAt,
      })
        .from(userConnections)
        .where(eq(userConnections.userId, ctx.user.id));

      const googleProviders = ["gmail", "google_drive", "google_calendar"];
      const googleConnections = connections.filter(c => googleProviders.includes(c.provider));

      const anyConnected = googleConnections.some(c => c.status === "connected");
      const firstConn = googleConnections[0];

      return {
        connected: anyConnected,
        email: firstConn?.providerAccountId || null,
        name: firstConn?.providerAccountName || null,
        providers: googleConnections.map(c => ({
          provider: c.provider,
          status: c.status,
          connectedAt: c.connectedAt,
        })),
      };
    }),

  /**
   * Get GitHub connection status for the current user.
   */
  githubStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { connected: false, username: null, email: null };

      const connections = await db.select({
        status: userConnections.status,
        providerAccountId: userConnections.providerAccountId,
        providerAccountName: userConnections.providerAccountName,
        connectedAt: userConnections.connectedAt,
      })
        .from(userConnections)
        .where(and(
          eq(userConnections.userId, ctx.user.id),
          eq(userConnections.provider, "github"),
        ))
        .limit(1);

      if (connections.length === 0) {
        return { connected: false, username: null, email: null };
      }

      const conn = connections[0];
      return {
        connected: conn.status === "connected",
        username: conn.providerAccountName,
        email: conn.providerAccountId,
        status: conn.status,
        connectedAt: conn.connectedAt,
      };
    }),

  /**
   * Get Slack connection status for the current user.
   */
  slackStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { connected: false, channelName: null };

      const connections = await db.select({
        status: userConnections.status,
        providerAccountName: userConnections.providerAccountName,
        connectedAt: userConnections.connectedAt,
      })
        .from(userConnections)
        .where(and(
          eq(userConnections.userId, ctx.user.id),
          eq(userConnections.provider, "slack"),
        ))
        .limit(1);

      if (connections.length === 0) {
        return { connected: false, channelName: null };
      }

      const conn = connections[0];
      return {
        connected: conn.status === "connected",
        channelName: conn.providerAccountName,
        status: conn.status,
        connectedAt: conn.connectedAt,
      };
    }),

  /**
   * Connect Slack by saving a webhook URL.
   * No OAuth required — user just provides their Incoming Webhook URL.
   */
  connectSlack: protectedProcedure
    .input(z.object({
      webhookUrl: z.string().url().startsWith("https://hooks.slack.com/"),
      channelName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { saveSlackWebhookUrl } = await import("../connectors/slack-helpers");
      const success = await saveSlackWebhookUrl(
        ctx.user.id,
        input.webhookUrl,
        input.channelName
      );

      if (!success) {
        throw new Error("Failed to save Slack webhook URL");
      }

      return { success: true, channelName: input.channelName || "Slack Webhook" };
    }),

  /**
   * Disconnect Slack for the current user.
   */
  disconnectSlack: protectedProcedure
    .mutation(async ({ ctx }) => {
      const { disconnectSlack } = await import("../connectors/slack-helpers");
      const success = await disconnectSlack(ctx.user.id);
      return { success };
    }),

  /**
   * Test the Slack webhook by sending a test message.
   */
  testSlack: protectedProcedure
    .mutation(async ({ ctx }) => {
      const { getSlackWebhookUrl } = await import("../connectors/slack-helpers");
      const webhookUrl = await getSlackWebhookUrl(ctx.user.id);

      if (!webhookUrl) {
        return { success: false, error: "No Slack webhook configured" };
      }

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: ":white_check_mark: *Bondi (RIO)* — Slack connection verified! Your webhook is working.",
            username: "Bondi (RIO)",
            icon_emoji: ":robot_face:",
          }),
        });

        if (response.ok) {
          return { success: true };
        } else {
          const errorText = await response.text();
          return { success: false, error: `Webhook returned ${response.status}: ${errorText}` };
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }),

  /**
   * Public endpoint: Get connector status enriched with user connection data.
   * Used by the /connect page to show real connection status.
   * If user is not authenticated, returns base connector info without user-specific data.
   */
  enrichedConnectors: publicProcedure
    .query(async ({ ctx }) => {
      // Import connector registry
      const { connectorRegistry } = await import("../connectors");
      const baseConnectors = connectorRegistry.listConnectors();

      // If user is not authenticated, return base info
      if (!ctx.user) {
        return baseConnectors.map(c => ({
          ...c,
          userConnected: false,
          userEmail: null,
          userName: null,
          connectionStatus: "not_connected" as const,
        }));
      }

      const db = await getDb();
      if (!db) {
        return baseConnectors.map(c => ({
          ...c,
          userConnected: false,
          userEmail: null,
          userName: null,
          connectionStatus: "not_connected" as const,
        }));
      }

      // Get all user connections
      const connections = await db.select({
        provider: userConnections.provider,
        status: userConnections.status,
        providerAccountId: userConnections.providerAccountId,
        providerAccountName: userConnections.providerAccountName,
      })
        .from(userConnections)
        .where(eq(userConnections.userId, ctx.user.id));

      // Map connector IDs to user connection data
      const connectionMap = new Map(connections.map(c => [c.provider, c]));

      return baseConnectors.map(c => {
        const userConn = connectionMap.get(c.id);
        return {
          ...c,
          userConnected: userConn?.status === "connected",
          userEmail: userConn?.providerAccountId || null,
          userName: userConn?.providerAccountName || null,
          connectionStatus: userConn?.status || "not_connected",
        };
      });
    }),
});
