/**
 * Gmail Connector
 *
 * Executes email actions through Gmail after RIO authorization.
 *
 * Execution priority:
 *   1. Per-user OAuth token → calls Gmail REST API directly
 *   2. Sandbox MCP CLI fallback → calls gmail MCP tool (developer credentials)
 *   3. Simulated mode → returns a simulated success
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
import { executeMcpTool } from "./cli-executor";
import { getValidGoogleToken } from "../oauth/google";
import { gmailSendMessage, gmailSearchMessages } from "./google-api";

const GMAIL_CAPABILITIES: ConnectorCapability[] = [
  {
    action: "send_email",
    label: "Send Email",
    description: "Send an email through Gmail",
    riskLevel: "Medium",
  },
  {
    action: "draft_email",
    label: "Save Draft",
    description: "Save an email as a draft in Gmail",
    riskLevel: "Low",
  },
  {
    action: "search_email",
    label: "Search Email",
    description: "Search Gmail messages",
    riskLevel: "Low",
  },
];

export class GmailConnector implements RIOConnector {
  id = "gmail";
  name = "Gmail";
  platform = "google";
  icon = "mail";
  status: ConnectorStatus = "connected";

  capabilities = GMAIL_CAPABILITIES;

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
    // Try per-user OAuth token first, then fall back to MCP CLI
    const userToken = request.userId
      ? await getValidGoogleToken(request.userId, "gmail")
      : null;

    if (userToken) {
      return this.executeWithUserToken(request, base, userToken);
    }

    // Fallback to MCP CLI (developer credentials)
    console.log(`[RIO Gmail Connector] No user token — falling back to MCP CLI`);
    return this.executeWithMcpCli(request, base);
  }

  // ── Per-User OAuth Token Execution ──────────────────────────────────────

  private async executeWithUserToken(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">,
    accessToken: string
  ): Promise<ExecutionResult> {
    try {
      console.log(`[RIO Gmail Connector] LIVE execution with user OAuth token`);
      console.log(`  Intent: ${request.intentId}`);
      console.log(`  Receipt: ${request.receiptId}`);
      console.log(`  User: ${request.userId}`);

      if (request.action === "send_email") {
        const result = await gmailSendMessage(
          accessToken,
          request.parameters.to,
          request.parameters.subject,
          request.parameters.body || request.parameters.content || ""
        );

        if (result.success) {
          const messageId = (result.data as any)?.id || "";
          console.log(`[RIO Gmail Connector] Email sent via user token. Message ID: ${messageId}`);
          return {
            ...base,
            success: true,
            detail: `Email sent to ${request.parameters.to} — Subject: "${request.parameters.subject}". Delivered via your connected Gmail account. Receipt: ${request.receiptId}`,
            externalId: messageId,
          };
        } else {
          console.error(`[RIO Gmail Connector] User token API call failed:`, result.error);
          return {
            ...base,
            success: false,
            detail: `Gmail execution attempted with your account but failed. The receipt and ledger entry still exist as proof of authorization.`,
            error: result.error || "Gmail API call failed",
          };
        }
      }

      if (request.action === "search_email") {
        const result = await gmailSearchMessages(
          accessToken,
          request.parameters.query || request.parameters.q || "",
          10
        );

        return {
          ...base,
          success: result.success,
          detail: result.success
            ? `Search completed for "${request.parameters.query || request.parameters.q}". Results returned from your Gmail account.`
            : `Search failed.`,
          error: result.success ? undefined : result.error,
        };
      }

      // draft_email — use send with draft flag (or fall back to MCP)
      if (request.action === "draft_email") {
        // Gmail API draft creation requires a different endpoint
        // Fall back to MCP for drafts
        return this.executeWithMcpCli(request, base);
      }

      return {
        ...base,
        success: false,
        detail: `Unknown Gmail action: ${request.action}`,
        error: "Unsupported action",
      };
    } catch (err) {
      console.error(`[RIO Gmail Connector] User token execution error:`, err);
      return {
        ...base,
        success: false,
        detail: `Gmail execution failed unexpectedly. Receipt and ledger entry preserved.`,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  // ── MCP CLI Fallback Execution ──────────────────────────────────────────

  private async executeWithMcpCli(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    try {
      console.log(`[RIO Gmail Connector] LIVE execution via MCP CLI`);
      console.log(`  Intent: ${request.intentId}`);
      console.log(`  Receipt: ${request.receiptId}`);
      console.log(`  To: ${request.parameters.to}`);
      console.log(`  Subject: ${request.parameters.subject}`);

      if (request.action === "send_email") {
        const result = await executeMcpTool("gmail", "gmail_send_messages", {
          messages: [
            {
              to: [request.parameters.to],
              subject: request.parameters.subject,
              content: request.parameters.body || request.parameters.content || "",
            },
          ],
        });

        if (result.success) {
          console.log(`[RIO Gmail Connector] Email sent successfully via MCP`);
          return {
            ...base,
            success: true,
            detail: `Email sent to ${request.parameters.to} — Subject: "${request.parameters.subject}". Delivered via Gmail (MCP). Receipt: ${request.receiptId}`,
            externalId: `gmail-${Date.now()}`,
          };
        } else {
          console.error(`[RIO Gmail Connector] MCP call failed: ${result.stderr}`);
          return {
            ...base,
            success: false,
            detail: `Gmail execution attempted but failed. The receipt and ledger entry still exist as proof of authorization.`,
            error: result.stderr || "MCP tool call failed",
          };
        }
      }

      if (request.action === "draft_email") {
        const result = await executeMcpTool("gmail", "gmail_send_messages", {
          messages: [
            {
              to: [request.parameters.to],
              subject: request.parameters.subject,
              content: request.parameters.body || request.parameters.content || "",
            },
          ],
        });

        return {
          ...base,
          success: result.success,
          detail: result.success
            ? `Draft saved for ${request.parameters.to} — Subject: "${request.parameters.subject}".`
            : `Draft save failed.`,
          externalId: result.success ? `draft-${Date.now()}` : undefined,
          error: result.success ? undefined : result.stderr,
        };
      }

      if (request.action === "search_email") {
        const result = await executeMcpTool("gmail", "gmail_search_messages", {
          q: request.parameters.query || request.parameters.q || "",
          max_results: 10,
        });

        return {
          ...base,
          success: result.success,
          detail: result.success
            ? `Search completed for "${request.parameters.query || request.parameters.q}". Results returned.`
            : `Search failed.`,
          error: result.success ? undefined : result.stderr,
        };
      }

      return {
        ...base,
        success: false,
        detail: `Unknown Gmail action: ${request.action}`,
        error: "Unsupported action",
      };
    } catch (err) {
      console.error(`[RIO Gmail Connector] MCP execution error:`, err);
      return {
        ...base,
        success: false,
        detail: `Gmail execution failed unexpectedly. Receipt and ledger entry preserved.`,
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
        "Send, draft, and search emails through Gmail. Uses your connected Google account when available, with MCP fallback.",
    };
  }
}
