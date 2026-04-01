/**
 * Outlook Mail Connector
 *
 * Executes email actions through Microsoft Outlook / Microsoft 365
 * after RIO authorization.
 *
 * Execution priority:
 *   1. Per-user OAuth token → calls Microsoft Graph API directly
 *   2. Simulated mode → returns a simulated success
 *
 * The connector NEVER executes without a valid receipt and ledger entry.
 */

import type {
  RIOConnector,
  ConnectorCapability,
  ConnectorInfo,
  ConnectorStatus,
  ExecutionRequest,
  ExecutionResult,
} from "./base";
import { getValidMicrosoftToken } from "../oauth/microsoft";
import { outlookSendMessage, outlookSearchMessages } from "./microsoft-api";

const OUTLOOK_MAIL_CAPABILITIES: ConnectorCapability[] = [
  {
    action: "send_email",
    label: "Send Email",
    description: "Send an email through Outlook",
    riskLevel: "Medium",
  },
  {
    action: "search_email",
    label: "Search Email",
    description: "Search Outlook messages",
    riskLevel: "Low",
  },
];

export class OutlookMailConnector implements RIOConnector {
  id = "outlook_mail";
  name = "Outlook Mail";
  platform = "microsoft";
  icon = "mail";
  status: ConnectorStatus = "connected";

  capabilities = OUTLOOK_MAIL_CAPABILITIES;

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
      return {
        ...base,
        success: true,
        detail: `[Simulated] Email to ${request.parameters.to} — Subject: "${request.parameters.subject}". No email was actually sent.`,
      };
    }

    // ── Live Mode ──
    const userToken = request.userId
      ? await getValidMicrosoftToken(request.userId, "outlook_mail")
      : null;

    if (!userToken) {
      return {
        ...base,
        success: false,
        detail: `No Microsoft account connected. Please connect your Microsoft account first.`,
        error: "No Microsoft OAuth token available",
      };
    }

    return this.executeWithUserToken(request, base, userToken);
  }

  private async executeWithUserToken(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">,
    accessToken: string
  ): Promise<ExecutionResult> {
    try {
      console.log(`[RIO Outlook Mail] LIVE execution with user OAuth token`);
      console.log(`  Intent: ${request.intentId}`);
      console.log(`  Receipt: ${request.receiptId}`);
      console.log(`  User: ${request.userId}`);

      if (request.action === "send_email") {
        const result = await outlookSendMessage(
          accessToken,
          request.parameters.to,
          request.parameters.subject,
          request.parameters.body || request.parameters.content || ""
        );

        if (result.success) {
          console.log(`[RIO Outlook Mail] Email sent via user token`);
          return {
            ...base,
            success: true,
            detail: `Email sent to ${request.parameters.to} — Subject: "${request.parameters.subject}". Delivered via your connected Outlook account. Receipt: ${request.receiptId}`,
            externalId: `outlook-${Date.now()}`,
          };
        } else {
          console.error(`[RIO Outlook Mail] API call failed:`, result.error);
          return {
            ...base,
            success: false,
            detail: `Outlook execution attempted with your account but failed. The receipt and ledger entry still exist as proof of authorization.`,
            error: result.error || "Microsoft Graph API call failed",
          };
        }
      }

      if (request.action === "search_email") {
        const result = await outlookSearchMessages(
          accessToken,
          request.parameters.query || request.parameters.q || "",
          10
        );

        return {
          ...base,
          success: result.success,
          detail: result.success
            ? `Search completed for "${request.parameters.query || request.parameters.q}". Results returned from your Outlook account.`
            : `Search failed.`,
          error: result.success ? undefined : result.error,
        };
      }

      return {
        ...base,
        success: false,
        detail: `Unknown Outlook Mail action: ${request.action}`,
        error: "Unsupported action",
      };
    } catch (err) {
      console.error(`[RIO Outlook Mail] Execution error:`, err);
      return {
        ...base,
        success: false,
        detail: `Outlook execution failed unexpectedly. Receipt and ledger entry preserved.`,
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
        "Send and search emails through Microsoft Outlook. Uses your connected Microsoft account.",
    };
  }
}
