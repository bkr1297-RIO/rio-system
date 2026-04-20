/**
 * Microsoft Graph API Helpers
 *
 * Low-level functions that call the Microsoft Graph REST API
 * using a per-user OAuth access token.
 *
 * These are consumed by the Outlook Mail, Outlook Calendar,
 * and OneDrive connectors.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

interface GraphResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ── Outlook Mail ────────────────────────────────────────────────────────────

/**
 * Send an email via Microsoft Graph.
 */
export async function outlookSendMessage(
  accessToken: string,
  to: string,
  subject: string,
  body: string
): Promise<GraphResult> {
  try {
    const response = await fetch(`${GRAPH_BASE}/me/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: "Text",
            content: body,
          },
          toRecipients: to.split(",").map((email) => ({
            emailAddress: { address: email.trim() },
          })),
        },
      }),
    });

    // sendMail returns 202 Accepted with no body on success
    if (response.status === 202 || response.ok) {
      return { success: true, data: { status: "sent" } };
    }

    const error = await response.text();
    return { success: false, error: `Graph API error ${response.status}: ${error}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Search Outlook messages.
 */
export async function outlookSearchMessages(
  accessToken: string,
  query: string,
  maxResults: number = 10
): Promise<GraphResult> {
  try {
    const url = new URL(`${GRAPH_BASE}/me/messages`);
    url.searchParams.set("$search", `"${query}"`);
    url.searchParams.set("$top", String(maxResults));
    url.searchParams.set("$select", "subject,from,receivedDateTime,bodyPreview");

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Graph API error ${response.status}: ${error}` };
    }

    const data = await response.json();
    return { success: true, data: data.value };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── Outlook Calendar ────────────────────────────────────────────────────────

/**
 * Create a calendar event via Microsoft Graph.
 */
export async function outlookCreateEvent(
  accessToken: string,
  subject: string,
  startDateTime: string,
  endDateTime: string,
  location?: string,
  body?: string,
  attendees?: string[]
): Promise<GraphResult> {
  try {
    const eventBody: Record<string, unknown> = {
      subject,
      start: {
        dateTime: startDateTime,
        timeZone: "UTC",
      },
      end: {
        dateTime: endDateTime,
        timeZone: "UTC",
      },
    };

    if (location) {
      eventBody.location = { displayName: location };
    }

    if (body) {
      eventBody.body = { contentType: "Text", content: body };
    }

    if (attendees && attendees.length > 0) {
      eventBody.attendees = attendees.map((email) => ({
        emailAddress: { address: email.trim() },
        type: "required",
      }));
    }

    const response = await fetch(`${GRAPH_BASE}/me/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Graph API error ${response.status}: ${error}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * List upcoming calendar events.
 */
export async function outlookListEvents(
  accessToken: string,
  maxResults: number = 10
): Promise<GraphResult> {
  try {
    const now = new Date().toISOString();
    const url = new URL(`${GRAPH_BASE}/me/calendarView`);
    url.searchParams.set("startDateTime", now);
    url.searchParams.set("endDateTime", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());
    url.searchParams.set("$top", String(maxResults));
    url.searchParams.set("$select", "subject,start,end,location,organizer");
    url.searchParams.set("$orderby", "start/dateTime");

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Graph API error ${response.status}: ${error}` };
    }

    const data = await response.json();
    return { success: true, data: data.value };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── OneDrive ────────────────────────────────────────────────────────────────

/**
 * Upload a file to OneDrive.
 */
export async function onedriveUploadFile(
  accessToken: string,
  filePath: string,
  content: Buffer | string,
  contentType: string = "application/octet-stream"
): Promise<GraphResult> {
  try {
    // Simple upload for files < 4MB
    const response = await fetch(
      `${GRAPH_BASE}/me/drive/root:/${filePath}:/content`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": contentType,
        },
        body: (typeof content === 'string' ? content : new Uint8Array(content)) as BodyInit,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Graph API error ${response.status}: ${error}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * List files in a OneDrive folder.
 */
export async function onedriveListFiles(
  accessToken: string,
  folderPath: string = "root"
): Promise<GraphResult> {
  try {
    const endpoint =
      folderPath === "root"
        ? `${GRAPH_BASE}/me/drive/root/children`
        : `${GRAPH_BASE}/me/drive/root:/${folderPath}:/children`;

    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Graph API error ${response.status}: ${error}` };
    }

    const data = await response.json();
    return { success: true, data: data.value };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Get a file from OneDrive.
 */
export async function onedriveGetFile(
  accessToken: string,
  filePath: string
): Promise<GraphResult> {
  try {
    const response = await fetch(
      `${GRAPH_BASE}/me/drive/root:/${filePath}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Graph API error ${response.status}: ${error}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
