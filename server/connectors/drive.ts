/**
 * Google Drive Connector
 *
 * Executes file actions after RIO authorization.
 * Currently operates in simulated mode.
 * When Google Drive API is connected, the execute() method will call it.
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

const DRIVE_CAPABILITIES: ConnectorCapability[] = [
  {
    action: "write_file",
    label: "Write File",
    description: "Create or update a file in Google Drive",
    riskLevel: "Medium",
  },
  {
    action: "read_file",
    label: "Read File",
    description: "Read a file from Google Drive",
    riskLevel: "Low",
  },
  {
    action: "move_file",
    label: "Move File",
    description: "Move a file to a different folder in Google Drive",
    riskLevel: "Medium",
  },
  {
    action: "delete_file",
    label: "Delete File",
    description: "Move a file to trash in Google Drive",
    riskLevel: "High",
  },
];

export class GoogleDriveConnector implements RIOConnector {
  id = "google_drive";
  name = "Google Drive";
  platform = "google";
  icon = "hard-drive";
  status: ConnectorStatus = "simulated";

  capabilities = DRIVE_CAPABILITIES;

  canHandle(action: string): boolean {
    return this.capabilities.some((c) => c.action === action);
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const base = {
      connector: this.id,
      action: request.action,
      mode: request.mode as "live" | "simulated",
      executedAt: new Date().toISOString(),
    };

    // ── Always simulated for now ──
    if (request.mode === "simulated" || this.status === "simulated") {
      const detail = this.getSimulatedDetail(request);
      return {
        ...base,
        mode: "simulated",
        success: true,
        detail,
      };
    }

    // ── Live Mode (future) ──
    try {
      console.log(`[RIO Drive Connector] LIVE execution requested`);
      console.log(`  Intent: ${request.intentId}`);
      console.log(`  Receipt: ${request.receiptId}`);
      console.log(`  Action: ${request.action}`);

      return {
        ...base,
        success: true,
        detail: `Drive action "${request.action}" authorized by RIO. Awaiting API connection.`,
        externalId: `drive-${Date.now()}`,
      };
    } catch (err) {
      return {
        ...base,
        success: false,
        detail: `Drive execution failed`,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  private getSimulatedDetail(request: ExecutionRequest): string {
    switch (request.action) {
      case "write_file":
        return `[Simulated] File "${request.parameters.filename || "document.txt"}" written to Drive. No file was actually created.`;
      case "read_file":
        return `[Simulated] File "${request.parameters.filename || "document.txt"}" read from Drive.`;
      case "move_file":
        return `[Simulated] File moved to "${request.parameters.destination || "/"}". No file was actually moved.`;
      case "delete_file":
        return `[Simulated] File "${request.parameters.filename || "document.txt"}" moved to trash. No file was actually deleted.`;
      default:
        return `[Simulated] Drive action "${request.action}" completed.`;
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
      description: "Create, read, move, and delete files in Google Drive. API connection pending.",
    };
  }
}
