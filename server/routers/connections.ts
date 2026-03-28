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
