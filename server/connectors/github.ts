/**
 * GitHub Connector
 *
 * Executes GitHub actions after RIO authorization.
 *
 * Execution priority:
 *   1. Per-user OAuth token (if userId provided and user has connected GitHub)
 *   2. Fallback to gh CLI (authenticated as bkr1297-RIO)
 *
 * Supports: create issue, create PR, commit file.
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
import { executeGhCommand } from "./cli-executor";
import { getValidGitHubToken } from "../oauth/github";

const GITHUB_CAPABILITIES: ConnectorCapability[] = [
  {
    action: "create_issue",
    label: "Create Issue",
    description: "Create an issue in a GitHub repository",
    riskLevel: "Low",
  },
  {
    action: "create_pr",
    label: "Create Pull Request",
    description: "Create a pull request in a GitHub repository",
    riskLevel: "Medium",
  },
  {
    action: "commit_file",
    label: "Commit File",
    description: "Commit a file to a GitHub repository",
    riskLevel: "High",
  },
];

// ── GitHub REST API helpers (per-user token) ──────────────────────────────

async function githubApiRequest(
  token: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<{ success: boolean; data: any; status: number; error?: string }> {
  try {
    const response = await fetch(`https://api.github.com${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = response.ok ? await response.json().catch(() => null) : null;

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return { success: false, data: null, status: response.status, error: errorText };
    }

    return { success: true, data, status: response.status };
  } catch (err) {
    return {
      success: false,
      data: null,
      status: 0,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export class GitHubConnector implements RIOConnector {
  id = "github";
  name = "GitHub";
  platform = "github";
  icon = "github";
  status: ConnectorStatus = "connected"; // gh CLI is authenticated

  capabilities = GITHUB_CAPABILITIES;

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
      return this.simulateExecution(request, base);
    }

    // ── Live Mode — Try per-user token first, then CLI fallback ──
    try {
      console.log(`[RIO GitHub Connector] LIVE execution starting`);
      console.log(`  Intent: ${request.intentId}`);
      console.log(`  Receipt: ${request.receiptId}`);
      console.log(`  Action: ${request.action}`);
      console.log(`  UserId: ${request.userId ?? "none (CLI fallback)"}`);

      // Try per-user OAuth token
      let userToken: string | null = null;
      if (request.userId) {
        userToken = await getValidGitHubToken(request.userId);
        if (userToken) {
          console.log(`[RIO GitHub Connector] Using per-user OAuth token for user ${request.userId}`);
        } else {
          console.log(`[RIO GitHub Connector] No user token found, falling back to gh CLI`);
        }
      }

      switch (request.action) {
        case "create_issue":
          return userToken
            ? await this.createIssueApi(request, base, userToken)
            : await this.createIssueCli(request, base);
        case "create_pr":
          return userToken
            ? await this.createPullRequestApi(request, base, userToken)
            : await this.createPullRequestCli(request, base);
        case "commit_file":
          return userToken
            ? await this.commitFileApi(request, base, userToken)
            : await this.commitFileCli(request, base);
        default:
          return {
            ...base,
            success: false,
            detail: `Unknown GitHub action: ${request.action}`,
            error: "Unsupported action",
          };
      }
    } catch (err) {
      console.error(`[RIO GitHub Connector] Execution error:`, err);
      return {
        ...base,
        success: false,
        detail: `GitHub execution failed unexpectedly. Receipt and ledger entry preserved.`,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  // ── Per-User API Methods ──────────────────────────────────────────────

  private async createIssueApi(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">,
    token: string
  ): Promise<ExecutionResult> {
    const repo = request.parameters.repo || "bkr1297-RIO/rio-system";
    const title = request.parameters.title || "Untitled Issue";
    const body = request.parameters.body || "";
    const labels = request.parameters.labels
      ? request.parameters.labels.split(",").map((l: string) => l.trim())
      : undefined;

    const result = await githubApiRequest(token, "POST", `/repos/${repo}/issues`, {
      title,
      body,
      ...(labels ? { labels } : {}),
    });

    if (result.success) {
      const issueUrl = result.data.html_url;
      console.log(`[RIO GitHub Connector] Issue created via user token: ${issueUrl}`);
      return {
        ...base,
        success: true,
        detail: `Issue created in ${repo} via your connected GitHub account: "${title}". URL: ${issueUrl}`,
        externalId: issueUrl,
      };
    } else {
      return {
        ...base,
        success: false,
        detail: `Failed to create issue in ${repo} via GitHub API.`,
        error: result.error || `HTTP ${result.status}`,
      };
    }
  }

  private async createPullRequestApi(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">,
    token: string
  ): Promise<ExecutionResult> {
    const repo = request.parameters.repo || "bkr1297-RIO/rio-system";
    const title = request.parameters.title || "Untitled PR";
    const body = request.parameters.body || "";
    const head = request.parameters.head || "main";
    const baseBranch = request.parameters.base || "main";

    const result = await githubApiRequest(token, "POST", `/repos/${repo}/pulls`, {
      title,
      body,
      head,
      base: baseBranch,
    });

    if (result.success) {
      const prUrl = result.data.html_url;
      console.log(`[RIO GitHub Connector] PR created via user token: ${prUrl}`);
      return {
        ...base,
        success: true,
        detail: `Pull request created in ${repo} via your connected GitHub account: "${title}". URL: ${prUrl}`,
        externalId: prUrl,
      };
    } else {
      return {
        ...base,
        success: false,
        detail: `Failed to create pull request in ${repo} via GitHub API.`,
        error: result.error || `HTTP ${result.status}`,
      };
    }
  }

  private async commitFileApi(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">,
    token: string
  ): Promise<ExecutionResult> {
    const repo = request.parameters.repo || "bkr1297-RIO/rio-system";
    const filePath = request.parameters.path || request.parameters.filename || "untitled.txt";
    const content = request.parameters.content || "";
    const message = request.parameters.message || `RIO governed commit: ${filePath}`;
    const contentBase64 = Buffer.from(content).toString("base64");

    // Check if file exists first (need sha for updates)
    const existing = await githubApiRequest(token, "GET", `/repos/${repo}/contents/${filePath}`);
    const sha = existing.success ? existing.data.sha : undefined;

    const result = await githubApiRequest(token, "PUT", `/repos/${repo}/contents/${filePath}`, {
      message,
      content: contentBase64,
      ...(sha ? { sha } : {}),
    });

    if (result.success) {
      console.log(`[RIO GitHub Connector] File committed via user token: ${filePath}`);
      return {
        ...base,
        success: true,
        detail: `File "${filePath}" committed to ${repo} via your connected GitHub account. Message: "${message}"`,
        externalId: result.data?.content?.html_url || `https://github.com/${repo}/blob/main/${filePath}`,
      };
    } else {
      return {
        ...base,
        success: false,
        detail: `Failed to commit file "${filePath}" to ${repo} via GitHub API.`,
        error: result.error || `HTTP ${result.status}`,
      };
    }
  }

  // ── CLI Fallback Methods ──────────────────────────────────────────────

  private async createIssueCli(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    const repo = request.parameters.repo || "bkr1297-RIO/rio-system";
    const title = request.parameters.title || "Untitled Issue";
    const body = request.parameters.body || "";
    const labels = request.parameters.labels || "";

    let args = `issue create --repo "${repo}" --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}"`;
    if (labels) {
      args += ` --label "${labels.replace(/"/g, '\\"')}"`;
    }

    const result = await executeGhCommand(args);

    if (result.success) {
      const issueUrl = result.stdout.trim();
      console.log(`[RIO GitHub Connector] Issue created via CLI: ${issueUrl}`);
      return {
        ...base,
        success: true,
        detail: `Issue created in ${repo} via CLI: "${title}". URL: ${issueUrl}`,
        externalId: issueUrl,
      };
    } else {
      return {
        ...base,
        success: false,
        detail: `Failed to create issue in ${repo} via CLI.`,
        error: result.stderr,
      };
    }
  }

  private async createPullRequestCli(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    const repo = request.parameters.repo || "bkr1297-RIO/rio-system";
    const title = request.parameters.title || "Untitled PR";
    const body = request.parameters.body || "";
    const head = request.parameters.head || "main";
    const baseBranch = request.parameters.base || "main";

    const args = `pr create --repo "${repo}" --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" --head "${head}" --base "${baseBranch}"`;

    const result = await executeGhCommand(args);

    if (result.success) {
      const prUrl = result.stdout.trim();
      console.log(`[RIO GitHub Connector] PR created via CLI: ${prUrl}`);
      return {
        ...base,
        success: true,
        detail: `Pull request created in ${repo} via CLI: "${title}". URL: ${prUrl}`,
        externalId: prUrl,
      };
    } else {
      return {
        ...base,
        success: false,
        detail: `Failed to create pull request in ${repo} via CLI.`,
        error: result.stderr,
      };
    }
  }

  private async commitFileCli(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    const repo = request.parameters.repo || "bkr1297-RIO/rio-system";
    const path = request.parameters.path || request.parameters.filename || "untitled.txt";
    const content = request.parameters.content || "";
    const message = request.parameters.message || `RIO governed commit: ${path}`;

    const contentBase64 = Buffer.from(content).toString("base64");
    const args = `api repos/${repo}/contents/${path} -X PUT -f message="${message.replace(/"/g, '\\"')}" -f content="${contentBase64}"`;

    const result = await executeGhCommand(args);

    if (result.success) {
      console.log(`[RIO GitHub Connector] File committed via CLI: ${path}`);
      return {
        ...base,
        success: true,
        detail: `File "${path}" committed to ${repo} via CLI. Message: "${message}"`,
        externalId: `https://github.com/${repo}/blob/main/${path}`,
      };
    } else {
      return {
        ...base,
        success: false,
        detail: `Failed to commit file "${path}" to ${repo} via CLI.`,
        error: result.stderr,
      };
    }
  }

  private simulateExecution(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): ExecutionResult {
    const repo = request.parameters.repo || "bkr1297-RIO/rio-system";

    switch (request.action) {
      case "create_issue":
        return {
          ...base,
          success: true,
          detail: `[Simulated] Issue "${request.parameters.title}" would be created in ${repo}. No issue was actually created.`,
        };
      case "create_pr":
        return {
          ...base,
          success: true,
          detail: `[Simulated] PR "${request.parameters.title}" would be created in ${repo}. No PR was actually created.`,
        };
      case "commit_file":
        return {
          ...base,
          success: true,
          detail: `[Simulated] File "${request.parameters.path || request.parameters.filename}" would be committed to ${repo}. No file was actually committed.`,
        };
      default:
        return {
          ...base,
          success: false,
          detail: `Unknown GitHub action: ${request.action}`,
          error: "Unsupported action",
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
        "Create issues, pull requests, and commit files to GitHub repositories. Supports per-user OAuth tokens with CLI fallback.",
    };
  }
}
