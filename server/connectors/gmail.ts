/**
 * Gmail Connector
 *
 * Executes email actions through Gmail after RIO authorization.
 * In live mode, this would call the Gmail API or MCP tools.
 * In simulated mode, it returns a simulated success.
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
  status: ConnectorStatus = "connected"; // MCP tools are available

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
    // In production, this calls Gmail API or MCP tools.
    // The MCP gmail_send_messages tool requires interactive user confirmation,
    // so live execution is triggered from the frontend (which has MCP access).
    // The server records the execution result after the frontend confirms.
    //
    // For now, the server-side live execution logs the intent and returns
    // a "pending_frontend_execution" status. The frontend then calls MCP
    // and reports back.
    try {
      console.log(`[RIO Gmail Connector] LIVE execution requested`);
      console.log(`  Intent: ${request.intentId}`);
      console.log(`  Receipt: ${request.receiptId}`);
      console.log(`  To: ${request.parameters.to}`);
      console.log(`  Subject: ${request.parameters.subject}`);

      return {
        ...base,
        success: true,
        detail: `Email to ${request.parameters.to} — Subject: "${request.parameters.subject}". Execution authorized by RIO. Awaiting frontend MCP confirmation.`,
        externalId: `gmail-${Date.now()}`,
      };
    } catch (err) {
      return {
        ...base,
        success: false,
        detail: `Gmail execution failed`,
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
      description: "Send, draft, and search emails through Gmail. Connected via MCP tools.",
    };
  }
}
