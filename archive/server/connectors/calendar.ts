/**
 * Google Calendar Connector
 *
 * Executes calendar actions through Google Calendar after RIO authorization.
 *
 * Execution priority:
 *   1. Per-user OAuth token → calls Calendar REST API directly
 *   2. Sandbox gws CLI fallback → calls gws calendar commands (developer credentials)
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
import { executeGwsCommand } from "./cli-executor";
import { getValidGoogleToken } from "../oauth/google";
import {
  calendarCreateEvent,
  calendarUpdateEvent,
  calendarDeleteEvent,
} from "./google-api";

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
  // Start as "simulated" — upgrades to "connected" when user has OAuth token
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

    // ── Live Mode ──
    // Try per-user OAuth token first, then fall back to gws CLI
    const userToken = request.userId
      ? await getValidGoogleToken(request.userId, "google_calendar")
      : null;

    if (userToken) {
      return this.executeWithUserToken(request, base, userToken);
    }

    // Fallback to gws CLI (developer credentials)
    console.log(`[RIO Calendar Connector] No user token — falling back to gws CLI`);
    return this.executeWithGwsCli(request, base);
  }

  // ── Per-User OAuth Token Execution ──────────────────────────────────────

  private async executeWithUserToken(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">,
    accessToken: string
  ): Promise<ExecutionResult> {
    try {
      console.log(`[RIO Calendar Connector] LIVE execution with user OAuth token`);
      console.log(`  Intent: ${request.intentId}`);
      console.log(`  Receipt: ${request.receiptId}`);
      console.log(`  User: ${request.userId}`);
      console.log(`  Action: ${request.action}`);

      switch (request.action) {
        case "create_event":
          return await this.createEventWithToken(request, base, accessToken);
        case "update_event":
          return await this.updateEventWithToken(request, base, accessToken);
        case "delete_event":
          return await this.deleteEventWithToken(request, base, accessToken);
        default:
          return {
            ...base,
            success: false,
            detail: `Unknown Calendar action: ${request.action}`,
            error: "Unsupported action",
          };
      }
    } catch (err) {
      console.error(`[RIO Calendar Connector] User token execution error:`, err);
      return {
        ...base,
        success: false,
        detail: `Calendar execution failed unexpectedly. Receipt and ledger entry preserved.`,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  private async createEventWithToken(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">,
    accessToken: string
  ): Promise<ExecutionResult> {
    const title = request.parameters.title || "Untitled Event";
    const date = request.parameters.date || new Date().toISOString().split("T")[0];
    const time = request.parameters.time || "09:00";
    const duration = request.parameters.duration || "60";
    const attendees = request.parameters.attendees || "";

    const startDateTime = `${date}T${time}:00`;
    const endMinutes = parseInt(duration, 10) || 60;
    const startDate = new Date(startDateTime);
    const endDate = new Date(startDate.getTime() + endMinutes * 60 * 1000);

    const event: any = {
      summary: title,
      start: { dateTime: startDate.toISOString(), timeZone: "America/Denver" },
      end: { dateTime: endDate.toISOString(), timeZone: "America/Denver" },
    };

    if (attendees) {
      event.attendees = attendees.split(",").map((email: string) => ({ email: email.trim() }));
    }
    if (request.parameters.description) {
      event.description = request.parameters.description;
    }

    const result = await calendarCreateEvent(accessToken, event);

    if (result.success) {
      const eventId = (result.data as any)?.id || "";
      console.log(`[RIO Calendar Connector] Event created via user token: ${title} (${eventId})`);
      return {
        ...base,
        success: true,
        detail: `Event "${title}" created on ${date} at ${time} in your Google Calendar. Event ID: ${eventId}. Governed by RIO receipt: ${request.receiptId}`,
        externalId: eventId,
      };
    } else {
      return {
        ...base,
        success: false,
        detail: `Failed to create event "${title}" in your Calendar.`,
        error: result.error,
      };
    }
  }

  private async updateEventWithToken(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">,
    accessToken: string
  ): Promise<ExecutionResult> {
    const eventId = request.parameters.eventId || request.parameters.event_id || "";
    if (!eventId) {
      return { ...base, success: false, detail: `Cannot update event: no event ID provided.`, error: "Missing eventId parameter" };
    }

    const updates: Record<string, unknown> = {};
    if (request.parameters.title) updates.summary = request.parameters.title;
    if (request.parameters.description) updates.description = request.parameters.description;

    const result = await calendarUpdateEvent(accessToken, eventId, updates);
    return {
      ...base,
      success: result.success,
      detail: result.success
        ? `Event ${eventId} updated successfully in your Calendar.`
        : `Failed to update event.`,
      externalId: eventId,
      error: result.success ? undefined : result.error,
    };
  }

  private async deleteEventWithToken(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">,
    accessToken: string
  ): Promise<ExecutionResult> {
    const eventId = request.parameters.eventId || request.parameters.event_id || "";
    if (!eventId) {
      return { ...base, success: false, detail: `Cannot delete event: no event ID provided.`, error: "Missing eventId parameter" };
    }

    const result = await calendarDeleteEvent(accessToken, eventId);
    return {
      ...base,
      success: result.success,
      detail: result.success
        ? `Event ${eventId} deleted from your Google Calendar.`
        : `Failed to delete event.`,
      externalId: eventId,
      error: result.success ? undefined : result.error,
    };
  }

  // ── gws CLI Fallback Execution ──────────────────────────────────────────

  private async executeWithGwsCli(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    try {
      console.log(`[RIO Calendar Connector] LIVE execution via gws CLI`);

      switch (request.action) {
        case "create_event":
          return await this.createEventViaCli(request, base);
        case "update_event":
          return await this.updateEventViaCli(request, base);
        case "delete_event":
          return await this.deleteEventViaCli(request, base);
        default:
          return { ...base, success: false, detail: `Unknown Calendar action: ${request.action}`, error: "Unsupported action" };
      }
    } catch (err) {
      console.error(`[RIO Calendar Connector] CLI execution error:`, err);
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      if (errorMsg.includes("insufficient") || errorMsg.includes("403")) {
        return {
          ...base,
          mode: "simulated",
          success: true,
          detail: `[Scope Unavailable] Calendar API requires additional OAuth scopes. ${this.getSimulatedDetail(request)} Connect Calendar in Settings to enable live execution.`,
        };
      }
      return { ...base, success: false, detail: `Calendar execution failed unexpectedly.`, error: errorMsg };
    }
  }

  private async createEventViaCli(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    const title = request.parameters.title || "Untitled Event";
    const date = request.parameters.date || new Date().toISOString().split("T")[0];
    const time = request.parameters.time || "09:00";
    const duration = request.parameters.duration || "60";
    const attendees = request.parameters.attendees || "";

    const startDateTime = `${date}T${time}:00`;
    const endMinutes = parseInt(duration, 10) || 60;
    const startDate = new Date(startDateTime);
    const endDate = new Date(startDate.getTime() + endMinutes * 60 * 1000);

    const eventBody: Record<string, unknown> = {
      summary: title,
      start: { dateTime: startDate.toISOString(), timeZone: "America/Denver" },
      end: { dateTime: endDate.toISOString(), timeZone: "America/Denver" },
    };

    if (attendees) {
      eventBody.attendees = attendees.split(",").map((email: string) => ({ email: email.trim() }));
    }
    if (request.parameters.description) {
      eventBody.description = request.parameters.description;
    }

    const result = await executeGwsCommand("calendar", "events", "insert", { calendarId: "primary" }, eventBody);

    if (result.success) {
      let eventId = "";
      try { const parsed = JSON.parse(result.stdout); eventId = parsed.id || ""; } catch { /* ignore */ }
      return { ...base, success: true, detail: `Event "${title}" created on ${date} at ${time}. Event ID: ${eventId}.`, externalId: eventId };
    } else if (result.stderr.includes("insufficient") || result.stderr.includes("403")) {
      this.status = "simulated";
      return { ...base, mode: "simulated", success: true, detail: `[Scope Unavailable] ${this.getSimulatedDetail(request)} Connect Calendar to enable live execution.` };
    } else {
      return { ...base, success: false, detail: `Failed to create event "${title}".`, error: result.stderr };
    }
  }

  private async updateEventViaCli(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    const eventId = request.parameters.eventId || request.parameters.event_id || "";
    if (!eventId) return { ...base, success: false, detail: `Cannot update event: no event ID.`, error: "Missing eventId" };

    const updateBody: Record<string, unknown> = {};
    if (request.parameters.title) updateBody.summary = request.parameters.title;
    if (request.parameters.description) updateBody.description = request.parameters.description;

    const result = await executeGwsCommand("calendar", "events", "patch", { calendarId: "primary", eventId }, updateBody);
    if (result.success) return { ...base, success: true, detail: `Event ${eventId} updated.`, externalId: eventId };
    if (result.stderr.includes("insufficient") || result.stderr.includes("403")) return { ...base, mode: "simulated", success: true, detail: `[Scope Unavailable] Event update simulated.` };
    return { ...base, success: false, detail: `Failed to update event.`, error: result.stderr };
  }

  private async deleteEventViaCli(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    const eventId = request.parameters.eventId || request.parameters.event_id || "";
    if (!eventId) return { ...base, success: false, detail: `Cannot delete event: no event ID.`, error: "Missing eventId" };

    const result = await executeGwsCommand("calendar", "events", "delete", { calendarId: "primary", eventId });
    if (result.success) return { ...base, success: true, detail: `Event ${eventId} deleted.`, externalId: eventId };
    if (result.stderr.includes("insufficient") || result.stderr.includes("403")) return { ...base, mode: "simulated", success: true, detail: `[Scope Unavailable] Event deletion simulated.` };
    return { ...base, success: false, detail: `Failed to delete event.`, error: result.stderr };
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
        "Create, update, and delete events in Google Calendar. Uses your connected Google account when available, with CLI fallback.",
    };
  }
}
