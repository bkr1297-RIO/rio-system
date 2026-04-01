/**
 * Connector Per-User OAuth Token Tests
 *
 * Tests that the Gmail, Drive, and Calendar connectors:
 *   1. Accept an optional userId in ExecutionRequest
 *   2. Attempt per-user token lookup when userId is provided
 *   3. Fall back to CLI/MCP when no user token exists
 *   4. Return simulated results in simulated mode
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock getValidGoogleToken ──────────────────────────────────────────────
const mockGetValidGoogleToken = vi.fn();
vi.mock("./oauth/google", () => ({
  getValidGoogleToken: (...args: unknown[]) => mockGetValidGoogleToken(...args),
  refreshGoogleToken: vi.fn(),
}));

// ── Mock google-api helpers ───────────────────────────────────────────────
const mockGmailSendMessage = vi.fn();
const mockGmailSearchMessages = vi.fn();
const mockDriveCreateFile = vi.fn();
const mockDriveListFiles = vi.fn();
const mockDriveGetFile = vi.fn();
const mockDriveUpdateFile = vi.fn();
const mockCalendarCreateEvent = vi.fn();
const mockCalendarUpdateEvent = vi.fn();
const mockCalendarDeleteEvent = vi.fn();

vi.mock("./connectors/google-api", () => ({
  gmailSendMessage: (...args: unknown[]) => mockGmailSendMessage(...args),
  gmailSearchMessages: (...args: unknown[]) => mockGmailSearchMessages(...args),
  driveCreateFile: (...args: unknown[]) => mockDriveCreateFile(...args),
  driveListFiles: (...args: unknown[]) => mockDriveListFiles(...args),
  driveGetFile: (...args: unknown[]) => mockDriveGetFile(...args),
  driveUpdateFile: (...args: unknown[]) => mockDriveUpdateFile(...args),
  calendarCreateEvent: (...args: unknown[]) => mockCalendarCreateEvent(...args),
  calendarUpdateEvent: (...args: unknown[]) => mockCalendarUpdateEvent(...args),
  calendarDeleteEvent: (...args: unknown[]) => mockCalendarDeleteEvent(...args),
}));

// ── Mock CLI executor ─────────────────────────────────────────────────────
const mockExecuteMcpTool = vi.fn();
const mockExecuteGwsCommand = vi.fn();
vi.mock("./connectors/cli-executor", () => ({
  executeMcpTool: (...args: unknown[]) => mockExecuteMcpTool(...args),
  executeGwsCommand: (...args: unknown[]) => mockExecuteGwsCommand(...args),
  executeCliCommand: vi.fn(),
  executeGhCommand: vi.fn(),
}));

import { GmailConnector } from "./connectors/gmail";
import { GoogleDriveConnector } from "./connectors/drive";
import { GoogleCalendarConnector } from "./connectors/calendar";
import type { ExecutionRequest } from "./connectors/base";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    intentId: "intent-test-001",
    receiptId: "receipt-test-001",
    action: "send_email",
    parameters: {
      to: "test@example.com",
      subject: "Test Subject",
      body: "Test Body",
    },
    mode: "live",
    ...overrides,
  };
}

// ── Gmail Connector Tests ─────────────────────────────────────────────────

describe("GmailConnector — per-user OAuth", () => {
  let connector: GmailConnector;

  beforeEach(() => {
    connector = new GmailConnector();
    vi.clearAllMocks();
  });

  it("uses per-user OAuth token when userId is provided and token exists", async () => {
    mockGetValidGoogleToken.mockResolvedValue("user-access-token-123");
    mockGmailSendMessage.mockResolvedValue({
      success: true,
      data: { id: "msg-abc" },
      status: 200,
    });

    const result = await connector.execute(makeRequest({ userId: 42 }));

    expect(mockGetValidGoogleToken).toHaveBeenCalledWith(42, "gmail");
    expect(mockGmailSendMessage).toHaveBeenCalledWith(
      "user-access-token-123",
      "test@example.com",
      "Test Subject",
      "Test Body"
    );
    expect(result.success).toBe(true);
    expect(result.detail).toContain("Delivered via your connected Gmail account");
    expect(result.externalId).toBe("msg-abc");
  });

  it("falls back to MCP CLI when no user token exists", async () => {
    mockGetValidGoogleToken.mockResolvedValue(null);
    mockExecuteMcpTool.mockResolvedValue({
      success: true,
      stdout: "sent",
      stderr: "",
      exitCode: 0,
    });

    const result = await connector.execute(makeRequest({ userId: 42 }));

    expect(mockGetValidGoogleToken).toHaveBeenCalledWith(42, "gmail");
    expect(mockGmailSendMessage).not.toHaveBeenCalled();
    expect(mockExecuteMcpTool).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.detail).toContain("MCP");
  });

  it("falls back to MCP CLI when no userId is provided", async () => {
    mockExecuteMcpTool.mockResolvedValue({
      success: true,
      stdout: "sent",
      stderr: "",
      exitCode: 0,
    });

    const result = await connector.execute(makeRequest({ userId: undefined }));

    expect(mockGetValidGoogleToken).not.toHaveBeenCalled();
    expect(mockExecuteMcpTool).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("returns simulated result in simulated mode", async () => {
    const result = await connector.execute(makeRequest({ mode: "simulated" }));

    expect(result.success).toBe(true);
    expect(result.detail).toContain("[Simulated]");
    expect(mockGetValidGoogleToken).not.toHaveBeenCalled();
    expect(mockGmailSendMessage).not.toHaveBeenCalled();
    expect(mockExecuteMcpTool).not.toHaveBeenCalled();
  });

  it("handles API failure gracefully", async () => {
    mockGetValidGoogleToken.mockResolvedValue("user-token");
    mockGmailSendMessage.mockResolvedValue({
      success: false,
      data: null,
      status: 403,
      error: "Insufficient permissions",
    });

    const result = await connector.execute(makeRequest({ userId: 42 }));

    expect(result.success).toBe(false);
    expect(result.error).toContain("Insufficient permissions");
  });

  it("search_email action works with user token", async () => {
    mockGetValidGoogleToken.mockResolvedValue("user-token");
    mockGmailSearchMessages.mockResolvedValue({
      success: true,
      data: { messages: [] },
      status: 200,
    });

    const result = await connector.execute(
      makeRequest({
        userId: 42,
        action: "search_email",
        parameters: { query: "from:boss@company.com" },
      })
    );

    expect(result.success).toBe(true);
    expect(mockGmailSearchMessages).toHaveBeenCalledWith("user-token", "from:boss@company.com", 10);
  });
});

// ── Google Drive Connector Tests ──────────────────────────────────────────

describe("GoogleDriveConnector — per-user OAuth", () => {
  let connector: GoogleDriveConnector;

  beforeEach(() => {
    connector = new GoogleDriveConnector();
    vi.clearAllMocks();
  });

  it("uses per-user OAuth token for write_file when userId is provided", async () => {
    mockGetValidGoogleToken.mockResolvedValue("drive-token-123");
    mockDriveCreateFile.mockResolvedValue({
      success: true,
      data: { id: "file-xyz" },
      status: 200,
    });

    const result = await connector.execute(
      makeRequest({
        userId: 42,
        action: "write_file",
        parameters: { filename: "report.txt", content: "Hello World", mimeType: "text/plain" },
      })
    );

    expect(mockGetValidGoogleToken).toHaveBeenCalledWith(42, "google_drive");
    expect(mockDriveCreateFile).toHaveBeenCalledWith("drive-token-123", "report.txt", "Hello World", "text/plain");
    expect(result.success).toBe(true);
    expect(result.detail).toContain("your Google Drive");
    expect(result.externalId).toBe("file-xyz");
  });

  it("falls back to gws CLI when no user token exists", async () => {
    mockGetValidGoogleToken.mockResolvedValue(null);
    mockExecuteGwsCommand.mockResolvedValue({
      success: true,
      stdout: '{"id":"cli-file-id"}',
      stderr: "",
      exitCode: 0,
    });

    const result = await connector.execute(
      makeRequest({
        userId: 42,
        action: "write_file",
        parameters: { filename: "report.txt", content: "Hello", mimeType: "text/plain" },
      })
    );

    expect(mockGetValidGoogleToken).toHaveBeenCalledWith(42, "google_drive");
    expect(mockDriveCreateFile).not.toHaveBeenCalled();
    expect(mockExecuteGwsCommand).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("returns simulated result in simulated mode", async () => {
    const result = await connector.execute(
      makeRequest({
        mode: "simulated",
        action: "write_file",
        parameters: { filename: "doc.txt" },
      })
    );

    expect(result.success).toBe(true);
    expect(result.detail).toContain("[Simulated]");
    expect(mockGetValidGoogleToken).not.toHaveBeenCalled();
  });

  it("delete_file with user token trashes the file", async () => {
    mockGetValidGoogleToken.mockResolvedValue("drive-token");
    mockDriveUpdateFile.mockResolvedValue({
      success: true,
      data: { id: "file-123", trashed: true },
      status: 200,
    });

    const result = await connector.execute(
      makeRequest({
        userId: 42,
        action: "delete_file",
        parameters: { fileId: "file-123", filename: "old-doc.txt" },
      })
    );

    expect(result.success).toBe(true);
    expect(result.detail).toContain("trash");
    expect(mockDriveUpdateFile).toHaveBeenCalledWith("drive-token", "file-123", { trashed: true });
  });
});

// ── Google Calendar Connector Tests ───────────────────────────────────────

describe("GoogleCalendarConnector — per-user OAuth", () => {
  let connector: GoogleCalendarConnector;

  beforeEach(() => {
    connector = new GoogleCalendarConnector();
    vi.clearAllMocks();
  });

  it("uses per-user OAuth token for create_event when userId is provided", async () => {
    mockGetValidGoogleToken.mockResolvedValue("cal-token-123");
    mockCalendarCreateEvent.mockResolvedValue({
      success: true,
      data: { id: "event-abc" },
      status: 200,
    });

    const result = await connector.execute(
      makeRequest({
        userId: 42,
        action: "create_event",
        parameters: {
          title: "Team Standup",
          date: "2026-04-01",
          time: "10:00",
          duration: "30",
        },
      })
    );

    expect(mockGetValidGoogleToken).toHaveBeenCalledWith(42, "google_calendar");
    expect(mockCalendarCreateEvent).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.detail).toContain("your Google Calendar");
    expect(result.externalId).toBe("event-abc");
  });

  it("falls back to gws CLI when no user token exists", async () => {
    mockGetValidGoogleToken.mockResolvedValue(null);
    mockExecuteGwsCommand.mockResolvedValue({
      success: true,
      stdout: '{"id":"cli-event-id"}',
      stderr: "",
      exitCode: 0,
    });

    const result = await connector.execute(
      makeRequest({
        userId: 42,
        action: "create_event",
        parameters: { title: "Meeting", date: "2026-04-01", time: "09:00" },
      })
    );

    expect(mockGetValidGoogleToken).toHaveBeenCalledWith(42, "google_calendar");
    expect(mockCalendarCreateEvent).not.toHaveBeenCalled();
    expect(mockExecuteGwsCommand).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("returns simulated result in simulated mode", async () => {
    const result = await connector.execute(
      makeRequest({
        mode: "simulated",
        action: "create_event",
        parameters: { title: "Demo", date: "2026-04-01", time: "14:00" },
      })
    );

    expect(result.success).toBe(true);
    expect(result.detail).toContain("[Simulated]");
    expect(mockGetValidGoogleToken).not.toHaveBeenCalled();
  });

  it("delete_event with user token calls Calendar API", async () => {
    mockGetValidGoogleToken.mockResolvedValue("cal-token");
    mockCalendarDeleteEvent.mockResolvedValue({
      success: true,
      data: null,
      status: 204,
    });

    const result = await connector.execute(
      makeRequest({
        userId: 42,
        action: "delete_event",
        parameters: { eventId: "event-xyz" },
      })
    );

    expect(result.success).toBe(true);
    expect(mockCalendarDeleteEvent).toHaveBeenCalledWith("cal-token", "event-xyz");
  });

  it("returns error when delete_event has no eventId", async () => {
    mockGetValidGoogleToken.mockResolvedValue("cal-token");

    const result = await connector.execute(
      makeRequest({
        userId: 42,
        action: "delete_event",
        parameters: {},
      })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing eventId");
  });
});

// ── ExecutionRequest userId field ─────────────────────────────────────────

describe("ExecutionRequest — userId field", () => {
  it("userId is optional in the interface", () => {
    const request: ExecutionRequest = {
      intentId: "i1",
      receiptId: "r1",
      action: "send_email",
      parameters: {},
      mode: "live",
      // userId intentionally omitted
    };
    expect(request.userId).toBeUndefined();
  });

  it("userId can be set to a number", () => {
    const request: ExecutionRequest = {
      intentId: "i1",
      receiptId: "r1",
      action: "send_email",
      parameters: {},
      mode: "live",
      userId: 42,
    };
    expect(request.userId).toBe(42);
  });
});
