/**
 * Slack Connector Helpers
 *
 * Utility functions for the Slack connector, primarily for
 * looking up per-user webhook URLs from the user_connections table.
 *
 * Slack uses Incoming Webhooks (not OAuth), so the "accessToken" field
 * in user_connections stores the webhook URL instead.
 * Status uses "revoked" to represent disconnected state (schema enum:
 * connected | expired | revoked | error).
 */

import { getDb } from "../db";
import { userConnections } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * Get the Slack webhook URL for a given user.
 * Returns null if the user hasn't configured Slack.
 */
export async function getSlackWebhookUrl(userId: number): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const [connection] = await db
      .select()
      .from(userConnections)
      .where(
        and(
          eq(userConnections.userId, userId),
          eq(userConnections.provider, "slack"),
          eq(userConnections.status, "connected")
        )
      )
      .limit(1);

    if (!connection || !connection.accessToken) {
      return null;
    }

    return connection.accessToken;
  } catch (err) {
    console.error("[Slack Helpers] Error looking up webhook URL:", err);
    return null;
  }
}

/**
 * Save or update a Slack webhook URL for a user.
 * Stores the webhook URL in the accessToken field.
 */
export async function saveSlackWebhookUrl(
  userId: number,
  webhookUrl: string,
  channelName?: string
): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    // Check if a Slack connection already exists
    const [existing] = await db
      .select()
      .from(userConnections)
      .where(
        and(
          eq(userConnections.userId, userId),
          eq(userConnections.provider, "slack")
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(userConnections)
        .set({
          accessToken: webhookUrl,
          providerAccountName: channelName || "Slack Webhook",
          status: "connected",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userConnections.userId, userId),
            eq(userConnections.provider, "slack")
          )
        );
    } else {
      await db.insert(userConnections).values({
        userId,
        provider: "slack",
        providerAccountId: `webhook-${userId}`,
        providerAccountName: channelName || "Slack Webhook",
        accessToken: webhookUrl,
        status: "connected",
        connectedAt: new Date(),
        updatedAt: new Date(),
      });
    }

    console.log(`[Slack Helpers] Webhook URL saved for user ${userId}`);
    return true;
  } catch (err) {
    console.error("[Slack Helpers] Error saving webhook URL:", err);
    return false;
  }
}

/**
 * Disconnect Slack for a user.
 * Uses "revoked" status since the schema enum doesn't include "disconnected".
 */
export async function disconnectSlack(userId: number): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    await db
      .update(userConnections)
      .set({
        status: "revoked",
        accessToken: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userConnections.userId, userId),
          eq(userConnections.provider, "slack")
        )
      );

    console.log(`[Slack Helpers] Disconnected Slack for user ${userId}`);
    return true;
  } catch (err) {
    console.error("[Slack Helpers] Error disconnecting Slack:", err);
    return false;
  }
}
