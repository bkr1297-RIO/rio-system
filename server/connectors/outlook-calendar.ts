/**
 * Outlook Calendar Connector
 *
 * Executes calendar actions through Microsoft Outlook / Microsoft 365
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
import { outlookCreateEvent, outlookListEvents } from "./microsoft-api";

const OUTLOOK_CALENDAR_CAPABILITIES: ConnectorCapability[] = [
  {
    action: "create_event",
    label: "Create Event",
    description: "Create a calendar event in Outlook",
    riskLevel: "Medium",
  },
  {
    action: "list_events",
    label: "List Events",
    description: "List upcoming events from Outlook Calendar",
    riskLevel: "Low",
  },
];

export class OutlookCalendarConnector implements RIOConnector {
  id = "outlook_calendar";
  name = "Outlook Calendar";
  platform = "microsoft";
  icon = "calendar";
  status: ConnectorStatus = "connected";

  capabilities = OUTLOOK_CALENDAR_CAPABILITIES;

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
      if (request.action === "create_event") {
        return {
          ...base,
          success: true,
          detail: `[Simulated] Calendar event "${request.parameters.title || request.parameters.summary}" created. No event was actually added.`,
        };
      }
      return {
        ...base,
        success: true,
        detail: `[Simulated] Calendar action "${request.action}" completed.`,
      };
    }

    // ── Live Mode ──
    const userToken = request.userId
      ? await getValidMicrosoftToken(request.userId, "outlook_calendar")
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
      console.log(`[RIO Outlook Calendar] LIVE execution with user OAuth token`);
      console.log(`  Intent: ${request.intentId}`);
      console.log(`  Receipt: ${request.receiptId}`);
      console.log(`  User: ${request.userId}`);

      if (request.action === "create_event") {
        const title = request.parameters.title || request.parameters.summary || "Untitled Event";
        const start = request.parameters.startDateTime || request.parameters.start;
        const end = request.parameters.endDateTime || request.parameters.end;
        const location = request.parameters.location;
        const body = request.parameters.description || request.parameters.body;
        const attendees = request.parameters.attendees
          ? (Array.isArray(request.parameters.attendees)
            ? request.parameters.attendees
            : [request.parameters.attendees])
          : undefined;

        const result = await outlookCreateEvent(
          accessToken,
          title,
          start,
          end,
          location,
          body,
          attendees
        );

        if (result.success) {
          const eventId = (result.data as any)?.id || "";
          console.log(`[RIO Outlook Calendar] Event created. ID: ${eventId}`);
          return {
            ...base,
            success: true,
            detail: `Calendar event "${title}" created in your Outlook Calendar. Receipt: ${request.receiptId}`,
            externalId: eventId,
          };
        } else {
          console.error(`[RIO Outlook Calendar] API call failed:`, result.error);
          return {
            ...base,
            success: false,
            detail: `Outlook Calendar execution attempted but failed. Receipt and ledger entry preserved.`,
            error: result.error || "Microsoft Graph API call failed",
          };
        }
      }

      if (request.action === "list_events") {
        const result = await outlookListEvents(accessToken, 10);

        return {
          ...base,
          success: result.success,
          detail: result.success
            ? `Listed upcoming events from your Outlook Calendar.`
            : `Failed to list events.`,
          error: result.success ? undefined : result.error,
        };
      }

      return {
        ...base,
        success: false,
        detail: `Unknown Outlook Calendar action: ${request.action}`,
        error: "Unsupported action",
      };
    } catch (err) {
      console.error(`[RIO Outlook Calendar] Execution error:`, err);
      return {
        ...base,
        success: false,
        detail: `Outlook Calendar execution failed unexpectedly. Receipt and ledger entry preserved.`,
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
        "Create events and list upcoming calendar entries through Microsoft Outlook. Uses your connected Microsoft account.",
    };
  }
}
