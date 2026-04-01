/**
 * GitHub Connector
 *
 * Executes GitHub actions after RIO authorization.
 * Live mode calls the GitHub CLI (gh) which is authenticated as bkr1297-RIO.
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

    // ── Live Mode — Real GitHub Execution via gh CLI ──
    try {
      console.log(`[RIO GitHub Connector] LIVE execution starting`);
      console.log(`  Intent: ${request.intentId}`);
      console.log(`  Receipt: ${request.receiptId}`);
      console.log(`  Action: ${request.action}`);

      switch (request.action) {
        case "create_issue":
          return await this.createIssue(request, base);
        case "create_pr":
          return await this.createPullRequest(request, base);
        case "commit_file":
          return await this.commitFile(request, base);
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

  private async createIssue(
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
      // gh issue create returns the issue URL
      const issueUrl = result.stdout.trim();
      console.log(`[RIO GitHub Connector] Issue created: ${issueUrl}`);
      return {
        ...base,
        success: true,
        detail: `Issue created in ${repo}: "${title}". URL: ${issueUrl}`,
        externalId: issueUrl,
      };
    } else {
      return {
        ...base,
        success: false,
        detail: `Failed to create issue in ${repo}.`,
        error: result.stderr,
      };
    }
  }

  private async createPullRequest(
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
      console.log(`[RIO GitHub Connector] PR created: ${prUrl}`);
      return {
        ...base,
        success: true,
        detail: `Pull request created in ${repo}: "${title}". URL: ${prUrl}`,
        externalId: prUrl,
      };
    } else {
      return {
        ...base,
        success: false,
        detail: `Failed to create pull request in ${repo}.`,
        error: result.stderr,
      };
    }
  }

  private async commitFile(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    const repo = request.parameters.repo || "bkr1297-RIO/rio-system";
    const path = request.parameters.path || request.parameters.filename || "untitled.txt";
    const content = request.parameters.content || "";
    const message = request.parameters.message || `RIO governed commit: ${path}`;

    // gh api to create/update file content via GitHub API
    const contentBase64 = Buffer.from(content).toString("base64");
    const args = `api repos/${repo}/contents/${path} -X PUT -f message="${message.replace(/"/g, '\\"')}" -f content="${contentBase64}"`;

    const result = await executeGhCommand(args);

    if (result.success) {
      console.log(`[RIO GitHub Connector] File committed: ${path}`);
      return {
        ...base,
        success: true,
        detail: `File "${path}" committed to ${repo}. Message: "${message}"`,
        externalId: `https://github.com/${repo}/blob/main/${path}`,
      };
    } else {
      return {
        ...base,
        success: false,
        detail: `Failed to commit file "${path}" to ${repo}.`,
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
        "Create issues, pull requests, and commit files to GitHub repositories. Authenticated as bkr1297-RIO.",
    };
  }
}
