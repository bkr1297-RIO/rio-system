/**
 * Slack Connector
 *
 * Executes messaging actions through Slack Incoming Webhooks after RIO authorization.
 *
 * Execution priority:
 *   1. Per-user webhook URL (stored in user_connections) → POST to Slack webhook
 *   2. Simulated mode → returns a simulated success
 *
 * The connector NEVER executes without a valid receipt and ledger entry.
 *
 * Slack Incoming Webhooks are simple: POST a JSON payload to a URL.
 * No OAuth dance required — the user just pastes their webhook URL.
 */

import type {
  RIOConnector,
  ConnectorCapability,
  ConnectorInfo,
  ConnectorStatus,
  ExecutionRequest,
  ExecutionResult,
} from "./base";
import { getSlackWebhookUrl } from "./slack-helpers";

const SLACK_CAPABILITIES: ConnectorCapability[] = [
  {
    action: "send_slack_message",
    label: "Send Slack Message",
    description: "Send a message to a Slack channel via webhook",
    riskLevel: "Medium",
  },
  {
    action: "send_slack_alert",
    label: "Send Slack Alert",
    description: "Send a formatted alert/notification to a Slack channel",
    riskLevel: "Medium",
  },
];

export class SlackConnector implements RIOConnector {
  id = "slack";
  name = "Slack";
  platform = "slack";
  icon = "message-square";
  status: ConnectorStatus = "connected";

  capabilities = SLACK_CAPABILITIES;

  canHandle(action: string): boolean {
    return this.capabilities.some((c) => c.action === action);
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const base = {
      connector: this.id,
      action: request.action,
      mode: request.mode,
      executedAt: new Date().toISOString(),
    };

    // ── Simulated Mode ──
    if (request.mode === "simulated") {
      const channel = request.parameters.channel || "#general";
      const message = request.parameters.message || request.parameters.text || "(no message)";
      return {
        ...base,
        success: true,
        detail: `[Simulated] Slack message to ${channel}: "${message.substring(0, 80)}${message.length > 80 ? "..." : ""}". No message was actually sent.`,
      };
    }

    // ── Live Mode ──
    return this.executeWithWebhook(request, base);
  }

  private async executeWithWebhook(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    try {
      // Look up the user's Slack webhook URL
      const webhookUrl = request.userId
        ? await getSlackWebhookUrl(request.userId)
        : null;

      if (!webhookUrl) {
        return {
          ...base,
          success: false,
          detail: "Slack webhook not configured. Please connect Slack in your app settings.",
          error: "NO_WEBHOOK_URL",
        };
      }

      console.log(`[RIO Slack Connector] LIVE execution via webhook`);
      console.log(`  Intent: ${request.intentId}`);
      console.log(`  Receipt: ${request.receiptId}`);
      console.log(`  User: ${request.userId}`);

      const channel = request.parameters.channel || undefined;
      const message = request.parameters.message || request.parameters.text || "";
      const username = request.parameters.username || "Bondi (RIO)";
      const iconEmoji = request.parameters.icon_emoji || ":robot_face:";

      // Build the Slack webhook payload
      const payload: Record<string, unknown> = {
        text: message,
        username,
        icon_emoji: iconEmoji,
      };

      if (channel) {
        payload.channel = channel;
      }

      // For alerts, use Slack Block Kit for richer formatting
      if (request.action === "send_slack_alert") {
        payload.blocks = [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: request.parameters.title || "RIO Alert",
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: message,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `*Intent:* ${request.intentId} | *Receipt:* ${request.receiptId} | *Via:* RIO Governance`,
              },
            ],
          },
        ];
      }

      // POST to the Slack webhook
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(`[RIO Slack Connector] Message sent successfully`);
        return {
          ...base,
          success: true,
          detail: `Slack message sent${channel ? ` to ${channel}` : ""}: "${message.substring(0, 80)}${message.length > 80 ? "..." : ""}". Receipt: ${request.receiptId}`,
          externalId: `slack-${Date.now()}`,
        };
      } else {
        const errorText = await response.text();
        console.error(`[RIO Slack Connector] Webhook failed: ${response.status} ${errorText}`);
        return {
          ...base,
          success: false,
          detail: `Slack webhook returned ${response.status}. The receipt and ledger entry still exist as proof of authorization.`,
          error: `Webhook error: ${response.status} ${errorText}`,
        };
      }
    } catch (err) {
      console.error(`[RIO Slack Connector] Execution error:`, err);
      return {
        ...base,
        success: false,
        detail: `Slack execution failed unexpectedly. Receipt and ledger entry preserved.`,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  getInfo(): ConnectorInfo {
    return {
      id: this.id,
      name: this.name,
      platform: this.platform,
      icon: this.icon,
      status: this.status,
      capabilities: this.capabilities,
      description:
        "Send messages and alerts to Slack channels via Incoming Webhooks. Configure your webhook URL in the Connect page.",
    };
  }
}
