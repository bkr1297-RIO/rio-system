/**
 * Google API HTTP Client for Per-User OAuth Execution
 *
 * Instead of using the sandbox CLI tools (gws, manus-mcp-cli) which use
 * developer credentials, this module calls Google APIs directly using
 * the user's own OAuth access token from the user_connections table.
 *
 * This is the bridge between RIO connectors and per-user Google APIs.
 */

export interface GoogleApiResult {
  success: boolean;
  data: unknown;
  status: number;
  error?: string;
}

/**
 * Call a Google REST API endpoint using the user's OAuth access token.
 */
export async function callGoogleApi(
  url: string,
  accessToken: string,
  options: {
    method?: string;
    body?: unknown;
    contentType?: string;
  } = {}
): Promise<GoogleApiResult> {
  const { method = "GET", body, contentType = "application/json" } = options;

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
    };

    if (body && method !== "GET") {
      headers["Content-Type"] = contentType;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body && method !== "GET") {
      fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    const responseText = await response.text();

    let data: unknown;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }

    if (!response.ok) {
      console.error(`[Google API] ${method} ${url} → ${response.status}:`, responseText.substring(0, 500));
      return {
        success: false,
        data,
        status: response.status,
        error: `Google API returned ${response.status}: ${responseText.substring(0, 200)}`,
      };
    }

    return {
      success: true,
      data,
      status: response.status,
    };
  } catch (err) {
    console.error(`[Google API] Request failed:`, err);
    return {
      success: false,
      data: null,
      status: 0,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Gmail API Helpers ──────────────────────────────────────────────────────

/**
 * Send an email via Gmail REST API using the user's OAuth token.
 */
export async function gmailSendMessage(
  accessToken: string,
  to: string,
  subject: string,
  body: string
): Promise<GoogleApiResult> {
  // Build RFC 2822 message
  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    "",
    body,
  ];
  const rawMessage = messageParts.join("\r\n");

  // Base64url encode the message
  const encoded = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return callGoogleApi(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    accessToken,
    {
      method: "POST",
      body: { raw: encoded },
    }
  );
}

/**
 * Search Gmail messages using the user's OAuth token.
 */
export async function gmailSearchMessages(
  accessToken: string,
  query: string,
  maxResults: number = 10
): Promise<GoogleApiResult> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });

  return callGoogleApi(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    accessToken
  );
}

// ── Google Drive API Helpers ───────────────────────────────────────────────

/**
 * Create a file in Google Drive using the user's OAuth token.
 * Uses multipart upload for files with content.
 */
export async function driveCreateFile(
  accessToken: string,
  filename: string,
  content: string,
  mimeType: string = "text/plain"
): Promise<GoogleApiResult> {
  // Use multipart upload
  const boundary = "rio_boundary_" + Date.now();

  const metadata = JSON.stringify({
    name: filename,
    mimeType,
  });

  const multipartBody = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    "",
    content,
    `--${boundary}--`,
  ].join("\r\n");

  return callGoogleApi(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    accessToken,
    {
      method: "POST",
      body: multipartBody,
      contentType: `multipart/related; boundary=${boundary}`,
    }
  );
}

/**
 * List/search files in Google Drive.
 */
export async function driveListFiles(
  accessToken: string,
  query?: string,
  pageSize: number = 10
): Promise<GoogleApiResult> {
  const params = new URLSearchParams({
    pageSize: String(pageSize),
    fields: "files(id,name,mimeType,size,modifiedTime)",
  });
  if (query) params.set("q", query);

  return callGoogleApi(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    accessToken
  );
}

/**
 * Get file metadata from Google Drive.
 */
export async function driveGetFile(
  accessToken: string,
  fileId: string
): Promise<GoogleApiResult> {
  return callGoogleApi(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,modifiedTime,parents`,
    accessToken
  );
}

/**
 * Update file metadata in Google Drive (move, rename, trash).
 */
export async function driveUpdateFile(
  accessToken: string,
  fileId: string,
  updates: Record<string, unknown>,
  addParents?: string,
  removeParents?: string
): Promise<GoogleApiResult> {
  const params = new URLSearchParams();
  if (addParents) params.set("addParents", addParents);
  if (removeParents) params.set("removeParents", removeParents);

  const queryString = params.toString() ? `?${params}` : "";

  return callGoogleApi(
    `https://www.googleapis.com/drive/v3/files/${fileId}${queryString}`,
    accessToken,
    {
      method: "PATCH",
      body: updates,
    }
  );
}

// ── Google Calendar API Helpers ────────────────────────────────────────────

/**
 * Create a calendar event using the user's OAuth token.
 */
export async function calendarCreateEvent(
  accessToken: string,
  event: {
    summary: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    description?: string;
    attendees?: Array<{ email: string }>;
  }
): Promise<GoogleApiResult> {
  return callGoogleApi(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    accessToken,
    {
      method: "POST",
      body: event,
    }
  );
}

/**
 * Update a calendar event using the user's OAuth token.
 */
export async function calendarUpdateEvent(
  accessToken: string,
  eventId: string,
  updates: Record<string, unknown>
): Promise<GoogleApiResult> {
  return callGoogleApi(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    accessToken,
    {
      method: "PATCH",
      body: updates,
    }
  );
}

/**
 * Delete a calendar event using the user's OAuth token.
 */
export async function calendarDeleteEvent(
  accessToken: string,
  eventId: string
): Promise<GoogleApiResult> {
  return callGoogleApi(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    accessToken,
    {
      method: "DELETE",
    }
  );
}
