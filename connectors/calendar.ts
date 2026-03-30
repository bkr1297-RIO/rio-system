/**
 * Google Calendar Connector
 *
 * Executes calendar actions through Google Calendar after RIO authorization.
 * Live mode attempts to call the gws CLI (Google Workspace CLI).
 * Falls back to simulated if Calendar API scopes are not available.
 *
 * Note: Calendar API requires additional OAuth scopes that may not be
 * granted in all environments. The connector handles this gracefully.
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
import { executeGwsCommand } from "./cli-executor";

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
  // Start as "simulated" — will upgrade to "connected" if API scopes are available
  status: ConnectorStatus = "simulated";

  capabilities = CALENDAR_CAPABILITIES;

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
        detail: this.getSimulatedDetail(request),
      };
    }

    // ── Live Mode — Attempt via gws CLI ──
    try {
      console.log(`[RIO Calendar Connector] LIVE execution starting`);
      console.log(`  Intent: ${request.intentId}`);
      console.log(`  Receipt: ${request.receiptId}`);
      console.log(`  Action: ${request.action}`);

      switch (request.action) {
        case "create_event":
          return await this.createEvent(request, base);
        case "update_event":
          return await this.updateEvent(request, base);
        case "delete_event":
          return await this.deleteEvent(request, base);
        default:
          return {
            ...base,
            success: false,
            detail: `Unknown Calendar action: ${request.action}`,
            error: "Unsupported action",
          };
      }
    } catch (err) {
      console.error(`[RIO Calendar Connector] Execution error:`, err);
      // Gracefully fall back to simulated if API scopes are insufficient
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      if (errorMsg.includes("insufficient") || errorMsg.includes("403")) {
        return {
          ...base,
          mode: "simulated",
          success: true,
          detail: `[Scope Unavailable] Calendar API requires additional OAuth scopes. ${this.getSimulatedDetail(request)} Connect Calendar in Settings to enable live execution.`,
        };
      }
      return {
        ...base,
        success: false,
        detail: `Calendar execution failed unexpectedly. Receipt and ledger entry preserved.`,
        error: errorMsg,
      };
    }
  }

  private async createEvent(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    const title = request.parameters.title || "Untitled Event";
    const date = request.parameters.date || new Date().toISOString().split("T")[0];
    const time = request.parameters.time || "09:00";
    const duration = request.parameters.duration || "60"; // minutes
    const attendees = request.parameters.attendees || "";

    // Build ISO datetime
    const startDateTime = `${date}T${time}:00`;
    const endMinutes = parseInt(duration, 10) || 60;
    const startDate = new Date(startDateTime);
    const endDate = new Date(startDate.getTime() + endMinutes * 60 * 1000);

    const eventBody: Record<string, unknown> = {
      summary: title,
      start: {
        dateTime: startDate.toISOString(),
        timeZone: "America/Denver",
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: "America/Denver",
      },
    };

    if (attendees) {
      eventBody.attendees = attendees.split(",").map((email: string) => ({
        email: email.trim(),
      }));
    }

    if (request.parameters.description) {
      eventBody.description = request.parameters.description;
    }

    const result = await executeGwsCommand(
      "calendar",
      "events",
      "insert",
      { calendarId: "primary" },
      eventBody
    );

    if (result.success) {
      let eventId = "";
      try {
        const parsed = JSON.parse(result.stdout);
        eventId = parsed.id || "";
      } catch { /* ignore */ }

      console.log(`[RIO Calendar Connector] Event created: ${title} (${eventId})`);
      return {
        ...base,
        success: true,
        detail: `Event "${title}" created on ${date} at ${time}. Event ID: ${eventId}. Governed by RIO receipt: ${request.receiptId}`,
        externalId: eventId,
      };
    } else {
      // Check if it's a scope issue
      if (result.stderr.includes("insufficient") || result.stderr.includes("403")) {
        this.status = "simulated";
        return {
          ...base,
          mode: "simulated",
          success: true,
          detail: `[Scope Unavailable] Calendar API requires additional OAuth scopes. Event "${title}" on ${date} at ${time} would be created. Connect Calendar in Settings to enable live execution.`,
        };
      }
      return {
        ...base,
        success: false,
        detail: `Failed to create event "${title}".`,
        error: result.stderr,
      };
    }
  }

  private async updateEvent(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    const eventId = request.parameters.eventId || request.parameters.event_id || "";
    const title = request.parameters.title || "";

    if (!eventId) {
      return {
        ...base,
        success: false,
        detail: `Cannot update event: no event ID provided.`,
        error: "Missing eventId parameter",
      };
    }

    const updateBody: Record<string, unknown> = {};
    if (title) updateBody.summary = title;
    if (request.parameters.description) updateBody.description = request.parameters.description;

    const result = await executeGwsCommand(
      "calendar",
      "events",
      "patch",
      { calendarId: "primary", eventId },
      updateBody
    );

    if (result.success) {
      return {
        ...base,
        success: true,
        detail: `Event ${eventId} updated successfully.`,
        externalId: eventId,
      };
    } else if (result.stderr.includes("insufficient") || result.stderr.includes("403")) {
      return {
        ...base,
        mode: "simulated",
        success: true,
        detail: `[Scope Unavailable] Event update simulated. Connect Calendar to enable live updates.`,
      };
    } else {
      return {
        ...base,
        success: false,
        detail: `Failed to update event.`,
        error: result.stderr,
      };
    }
  }

  private async deleteEvent(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    const eventId = request.parameters.eventId || request.parameters.event_id || "";

    if (!eventId) {
      return {
        ...base,
        success: false,
        detail: `Cannot delete event: no event ID provided.`,
        error: "Missing eventId parameter",
      };
    }

    const result = await executeGwsCommand(
      "calendar",
      "events",
      "delete",
      { calendarId: "primary", eventId }
    );

    if (result.success) {
      return {
        ...base,
        success: true,
        detail: `Event ${eventId} deleted from Google Calendar.`,
        externalId: eventId,
      };
    } else if (result.stderr.includes("insufficient") || result.stderr.includes("403")) {
      return {
        ...base,
        mode: "simulated",
        success: true,
        detail: `[Scope Unavailable] Event deletion simulated. Connect Calendar to enable live deletion.`,
      };
    } else {
      return {
        ...base,
        success: false,
        detail: `Failed to delete event.`,
        error: result.stderr,
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
      description:
        "Create, update, and delete events in Google Calendar. Requires Calendar API scopes — falls back to simulated if unavailable.",
    };
  }
}
