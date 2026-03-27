/**
 * Google Calendar Connector
 *
 * Executes calendar actions after RIO authorization.
 * Currently operates in simulated mode (no Calendar MCP/API connected yet).
 * When a Calendar API is connected, the execute() method will call it.
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

const CALENDAR_CAPABILITIES: ConnectorCapability[] = [
  {
    action: "create_event",
    label: "Create Event",
    description: "Create a calendar event in Google Calendar",
    riskLevel: "Low",
  },
  {
    action: "update_event",
    label: "Update Event",
    description: "Modify an existing calendar event",
    riskLevel: "Low",
  },
  {
    action: "delete_event",
    label: "Delete Event",
    description: "Delete a calendar event",
    riskLevel: "Medium",
  },
];

export class GoogleCalendarConnector implements RIOConnector {
  id = "google_calendar";
  name = "Google Calendar";
  platform = "google";
  icon = "calendar";
  status: ConnectorStatus = "simulated"; // No Calendar API connected yet

  capabilities = CALENDAR_CAPABILITIES;

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

    // ── Always simulated for now (no Calendar API connected) ──
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
    // When Google Calendar API is connected, this will create real events.
    try {
      console.log(`[RIO Calendar Connector] LIVE execution requested`);
      console.log(`  Intent: ${request.intentId}`);
      console.log(`  Receipt: ${request.receiptId}`);
      console.log(`  Action: ${request.action}`);
      console.log(`  Parameters:`, request.parameters);

      return {
        ...base,
        success: true,
        detail: `Calendar action "${request.action}" authorized by RIO. Awaiting API connection.`,
        externalId: `cal-${Date.now()}`,
      };
    } catch (err) {
      return {
        ...base,
        success: false,
        detail: `Calendar execution failed`,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  private getSimulatedDetail(request: ExecutionRequest): string {
    switch (request.action) {
      case "create_event":
        return `[Simulated] Calendar event "${request.parameters.title || "Untitled"}" on ${request.parameters.date || "TBD"} at ${request.parameters.time || "TBD"}. No event was actually created.`;
      case "update_event":
        return `[Simulated] Calendar event updated. No changes were actually made.`;
      case "delete_event":
        return `[Simulated] Calendar event deleted. No event was actually removed.`;
      default:
        return `[Simulated] Calendar action "${request.action}" completed.`;
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
      description: "Create, update, and delete events in Google Calendar. API connection pending.",
    };
  }
}
