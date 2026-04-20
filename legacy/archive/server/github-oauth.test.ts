/**
 * GitHub OAuth Tests
 *
 * Tests:
 *   1. GitHub OAuth env vars are accessible
 *   2. GitHub connector uses per-user token when available
 *   3. GitHub connector falls back to CLI when no user token
 *   4. GitHub connector simulated mode works
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock getValidGitHubToken ──────────────────────────────────────────────
const mockGetValidGitHubToken = vi.fn();
vi.mock("./oauth/github", () => ({
  getValidGitHubToken: (...args: unknown[]) => mockGetValidGitHubToken(...args),
  registerGitHubOAuthRoutes: vi.fn(),
}));

// ── Mock gh CLI executor ──────────────────────────────────────────────────
const mockExecuteGhCommand = vi.fn();
vi.mock("./connectors/cli-executor", () => ({
  executeMcpTool: vi.fn(),
  executeGwsCommand: vi.fn(),
  executeCliCommand: vi.fn(),
  executeGhCommand: (...args: unknown[]) => mockExecuteGhCommand(...args),
}));

// ── Mock global fetch for GitHub API calls ────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { GitHubConnector } from "./connectors/github";
import type { ExecutionRequest } from "./connectors/base";

function makeRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    intentId: "intent-gh-001",
    receiptId: "receipt-gh-001",
    action: "create_issue",
    parameters: {
      repo: "bkr1297-RIO/rio-system",
      title: "Test Issue",
      body: "Test body",
    },
    mode: "live",
    ...overrides,
  };
}

describe("GitHub OAuth — Environment", () => {
  it("GITHUB_OAUTH_CLIENT_ID is set in environment", () => {
    // The secret was stored via webdev_request_secrets
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    expect(clientId).toBeTruthy();
    expect(clientId!.length).toBeGreaterThan(5);
  });

  it("GITHUB_OAUTH_CLIENT_SECRET is set in environment", () => {
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
    expect(clientSecret).toBeTruthy();
    expect(clientSecret!.length).toBeGreaterThan(10);
  });
});

describe("GitHubConnector — per-user OAuth", () => {
  let connector: GitHubConnector;

  beforeEach(() => {
    connector = new GitHubConnector();
    vi.clearAllMocks();
  });

  it("uses per-user OAuth token for create_issue when userId is provided", async () => {
    mockGetValidGitHubToken.mockResolvedValue("gh-user-token-123");

    // Mock the GitHub API POST for issue creation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 42,
        number: 7,
        html_url: "https://github.com/bkr1297-RIO/rio-system/issues/7",
        title: "Test Issue",
      }),
    });

    const result = await connector.execute(makeRequest({ userId: 10 }));

    expect(mockGetValidGitHubToken).toHaveBeenCalledWith(10);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/bkr1297-RIO/rio-system/issues",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer gh-user-token-123",
        }),
      })
    );
    expect(result.success).toBe(true);
    expect(result.detail).toContain("your connected GitHub account");
    expect(result.externalId).toContain("issues/7");
  });

  it("falls back to gh CLI when no user token exists", async () => {
    mockGetValidGitHubToken.mockResolvedValue(null);
    mockExecuteGhCommand.mockResolvedValue({
      success: true,
      stdout: "https://github.com/bkr1297-RIO/rio-system/issues/8",
      stderr: "",
      exitCode: 0,
    });

    const result = await connector.execute(makeRequest({ userId: 10 }));

    expect(mockGetValidGitHubToken).toHaveBeenCalledWith(10);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockExecuteGhCommand).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.detail).toContain("CLI");
  });

  it("falls back to gh CLI when no userId is provided", async () => {
    mockExecuteGhCommand.mockResolvedValue({
      success: true,
      stdout: "https://github.com/bkr1297-RIO/rio-system/issues/9",
      stderr: "",
      exitCode: 0,
    });

    const result = await connector.execute(makeRequest({ userId: undefined }));

    expect(mockGetValidGitHubToken).not.toHaveBeenCalled();
    expect(mockExecuteGhCommand).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("returns simulated result in simulated mode", async () => {
    const result = await connector.execute(makeRequest({ mode: "simulated" }));

    expect(result.success).toBe(true);
    expect(result.detail).toContain("[Simulated]");
    expect(result.detail).toContain("Test Issue");
    expect(mockGetValidGitHubToken).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockExecuteGhCommand).not.toHaveBeenCalled();
  });

  it("create_pr with user token calls GitHub API", async () => {
    mockGetValidGitHubToken.mockResolvedValue("gh-user-token");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 100,
        number: 5,
        html_url: "https://github.com/bkr1297-RIO/rio-system/pull/5",
        title: "Test PR",
      }),
    });

    const result = await connector.execute(
      makeRequest({
        userId: 10,
        action: "create_pr",
        parameters: {
          repo: "bkr1297-RIO/rio-system",
          title: "Test PR",
          body: "PR body",
          head: "feature/test",
          base: "main",
        },
      })
    );

    expect(result.success).toBe(true);
    expect(result.detail).toContain("your connected GitHub account");
    expect(result.externalId).toContain("pull/5");
  });

  it("commit_file with user token calls GitHub Contents API", async () => {
    mockGetValidGitHubToken.mockResolvedValue("gh-user-token");

    // First call: GET to check if file exists (404 = new file)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    });

    // Second call: PUT to create the file
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: {
          html_url: "https://github.com/bkr1297-RIO/rio-system/blob/main/test.txt",
        },
      }),
    });

    const result = await connector.execute(
      makeRequest({
        userId: 10,
        action: "commit_file",
        parameters: {
          repo: "bkr1297-RIO/rio-system",
          filename: "test.txt",
          content: "Hello world",
          message: "Add test file",
        },
      })
    );

    expect(result.success).toBe(true);
    expect(result.detail).toContain("your connected GitHub account");
    // Two API calls: GET (check existing) + PUT (create)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("handles API failure gracefully", async () => {
    mockGetValidGitHubToken.mockResolvedValue("gh-user-token");

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => "Forbidden: insufficient permissions",
      json: async () => null,
    });

    const result = await connector.execute(makeRequest({ userId: 10 }));

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("GitHubConnector — metadata", () => {
  it("reports correct connector info", () => {
    const connector = new GitHubConnector();
    const info = connector.getInfo();

    expect(info.id).toBe("github");
    expect(info.name).toBe("GitHub");
    expect(info.platform).toBe("github");
    expect(info.status).toBe("connected");
    expect(info.capabilities.length).toBe(3);
    expect(info.description).toContain("per-user OAuth");
  });

  it("can handle all GitHub actions", () => {
    const connector = new GitHubConnector();
    expect(connector.canHandle("create_issue")).toBe(true);
    expect(connector.canHandle("create_pr")).toBe(true);
    expect(connector.canHandle("commit_file")).toBe(true);
    expect(connector.canHandle("send_email")).toBe(false);
  });
});
