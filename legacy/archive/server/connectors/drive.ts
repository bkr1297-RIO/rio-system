/**
 * Google Drive Connector
 *
 * Executes file actions through Google Drive after RIO authorization.
 *
 * Execution priority:
 *   1. Per-user OAuth token → calls Drive REST API directly
 *   2. Sandbox gws CLI fallback → calls gws drive commands (developer credentials)
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
  driveCreateFile,
  driveListFiles,
  driveGetFile,
  driveUpdateFile,
} from "./google-api";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";

const DRIVE_CAPABILITIES: ConnectorCapability[] = [
  {
    action: "write_file",
    label: "Write File",
    description: "Create or update a file in Google Drive",
    riskLevel: "Medium",
  },
  {
    action: "read_file",
    label: "Read File",
    description: "Read a file from Google Drive",
    riskLevel: "Low",
  },
  {
    action: "move_file",
    label: "Move File",
    description: "Move a file to a different folder in Google Drive",
    riskLevel: "Medium",
  },
  {
    action: "delete_file",
    label: "Delete File",
    description: "Move a file to trash in Google Drive",
    riskLevel: "High",
  },
];

export class GoogleDriveConnector implements RIOConnector {
  id = "google_drive";
  name = "Google Drive";
  platform = "google";
  icon = "hard-drive";
  status: ConnectorStatus = "connected";

  capabilities = DRIVE_CAPABILITIES;

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
      ? await getValidGoogleToken(request.userId, "google_drive")
      : null;

    if (userToken) {
      return this.executeWithUserToken(request, base, userToken);
    }

    // Fallback to gws CLI (developer credentials)
    console.log(`[RIO Drive Connector] No user token — falling back to gws CLI`);
    return this.executeWithGwsCli(request, base);
  }

  // ── Per-User OAuth Token Execution ──────────────────────────────────────

  private async executeWithUserToken(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">,
    accessToken: string
  ): Promise<ExecutionResult> {
    try {
      console.log(`[RIO Drive Connector] LIVE execution with user OAuth token`);
      console.log(`  Intent: ${request.intentId}`);
      console.log(`  Receipt: ${request.receiptId}`);
      console.log(`  User: ${request.userId}`);
      console.log(`  Action: ${request.action}`);

      switch (request.action) {
        case "write_file": {
          const filename = request.parameters.filename || "rio-document.txt";
          const content = request.parameters.content || "";
          const mimeType = request.parameters.mimeType || "text/plain";

          const result = await driveCreateFile(accessToken, filename, content, mimeType);

          if (result.success) {
            const fileId = (result.data as any)?.id || "";
            console.log(`[RIO Drive Connector] File created via user token: ${filename} (${fileId})`);
            return {
              ...base,
              success: true,
              detail: `File "${filename}" created in your Google Drive. File ID: ${fileId}. Governed by RIO receipt: ${request.receiptId}`,
              externalId: fileId,
            };
          } else {
            return {
              ...base,
              success: false,
              detail: `Failed to create file "${filename}" in your Google Drive.`,
              error: result.error,
            };
          }
        }

        case "read_file": {
          const fileId = request.parameters.fileId || request.parameters.file_id || "";
          const filename = request.parameters.filename || "unknown";

          if (!fileId) {
            // Search by filename
            const searchResult = await driveListFiles(accessToken, `name='${filename}'`, 1);
            return {
              ...base,
              success: searchResult.success,
              detail: searchResult.success
                ? `File search for "${filename}" completed in your Drive.`
                : `Failed to search for file "${filename}".`,
              error: searchResult.success ? undefined : searchResult.error,
            };
          }

          const result = await driveGetFile(accessToken, fileId);
          return {
            ...base,
            success: result.success,
            detail: result.success
              ? `File metadata retrieved for "${filename}" from your Drive.`
              : `Failed to read file "${filename}".`,
            externalId: fileId,
            error: result.success ? undefined : result.error,
          };
        }

        case "move_file": {
          const fileId = request.parameters.fileId || request.parameters.file_id || "";
          const destination = request.parameters.destination || request.parameters.folderId || "";
          const filename = request.parameters.filename || "unknown";

          if (!fileId) {
            return {
              ...base,
              success: false,
              detail: `Cannot move file: no file ID provided.`,
              error: "Missing fileId parameter",
            };
          }

          const result = await driveUpdateFile(accessToken, fileId, {}, destination);
          return {
            ...base,
            success: result.success,
            detail: result.success
              ? `File "${filename}" moved to folder ${destination} in your Drive.`
              : `Failed to move file "${filename}".`,
            externalId: fileId,
            error: result.success ? undefined : result.error,
          };
        }

        case "delete_file": {
          const fileId = request.parameters.fileId || request.parameters.file_id || "";
          const filename = request.parameters.filename || "unknown";

          if (!fileId) {
            return {
              ...base,
              success: false,
              detail: `Cannot delete file: no file ID provided.`,
              error: "Missing fileId parameter",
            };
          }

          const result = await driveUpdateFile(accessToken, fileId, { trashed: true });
          return {
            ...base,
            success: result.success,
            detail: result.success
              ? `File "${filename}" moved to trash in your Google Drive. File ID: ${fileId}`
              : `Failed to delete file "${filename}".`,
            externalId: fileId,
            error: result.success ? undefined : result.error,
          };
        }

        default:
          return {
            ...base,
            success: false,
            detail: `Unknown Drive action: ${request.action}`,
            error: "Unsupported action",
          };
      }
    } catch (err) {
      console.error(`[RIO Drive Connector] User token execution error:`, err);
      return {
        ...base,
        success: false,
        detail: `Drive execution failed unexpectedly. Receipt and ledger entry preserved.`,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  // ── gws CLI Fallback Execution ──────────────────────────────────────────

  private async executeWithGwsCli(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    try {
      console.log(`[RIO Drive Connector] LIVE execution via gws CLI`);
      console.log(`  Intent: ${request.intentId}`);
      console.log(`  Receipt: ${request.receiptId}`);
      console.log(`  Action: ${request.action}`);

      switch (request.action) {
        case "write_file":
          return await this.writeFileViaCli(request, base);
        case "read_file":
          return await this.readFileViaCli(request, base);
        case "move_file":
          return await this.moveFileViaCli(request, base);
        case "delete_file":
          return await this.deleteFileViaCli(request, base);
        default:
          return {
            ...base,
            success: false,
            detail: `Unknown Drive action: ${request.action}`,
            error: "Unsupported action",
          };
      }
    } catch (err) {
      console.error(`[RIO Drive Connector] CLI execution error:`, err);
      return {
        ...base,
        success: false,
        detail: `Drive execution failed unexpectedly. Receipt and ledger entry preserved.`,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  private async writeFileViaCli(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    const filename = request.parameters.filename || "rio-document.txt";
    const content = request.parameters.content || "";
    const mimeType = request.parameters.mimeType || "text/plain";

    const tmpPath = join("/tmp", `rio-upload-${Date.now()}-${filename}`);
    try {
      writeFileSync(tmpPath, content, "utf-8");

      const result = await executeGwsCommand(
        "drive", "files", "create",
        undefined,
        { name: filename, mimeType },
        tmpPath, mimeType
      );

      try { unlinkSync(tmpPath); } catch { /* ignore */ }

      if (result.success) {
        let fileId = "";
        try { const parsed = JSON.parse(result.stdout); fileId = parsed.id || ""; } catch { /* ignore */ }
        console.log(`[RIO Drive Connector] File created via CLI: ${filename} (${fileId})`);
        return {
          ...base,
          success: true,
          detail: `File "${filename}" created in Google Drive (CLI). File ID: ${fileId}. Governed by RIO receipt: ${request.receiptId}`,
          externalId: fileId,
        };
      } else {
        return { ...base, success: false, detail: `Failed to create file "${filename}" in Google Drive.`, error: result.stderr };
      }
    } catch (err) {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
      throw err;
    }
  }

  private async readFileViaCli(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    const fileId = request.parameters.fileId || request.parameters.file_id || "";
    const filename = request.parameters.filename || "unknown";

    if (!fileId) {
      const searchResult = await executeGwsCommand("drive", "files", "list", { q: `name='${filename}'`, pageSize: 1 });
      return {
        ...base,
        success: searchResult.success,
        detail: searchResult.success
          ? `File search for "${filename}" completed. Results: ${searchResult.stdout.substring(0, 200)}`
          : `Failed to search for file "${filename}".`,
        error: searchResult.success ? undefined : searchResult.stderr,
      };
    }

    const result = await executeGwsCommand("drive", "files", "get", { fileId, fields: "id,name,mimeType,size,modifiedTime" });
    return {
      ...base,
      success: result.success,
      detail: result.success
        ? `File metadata retrieved for "${filename}". ${result.stdout.substring(0, 200)}`
        : `Failed to read file "${filename}".`,
      externalId: fileId,
      error: result.success ? undefined : result.stderr,
    };
  }

  private async moveFileViaCli(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    const fileId = request.parameters.fileId || request.parameters.file_id || "";
    const destination = request.parameters.destination || request.parameters.folderId || "";
    const filename = request.parameters.filename || "unknown";

    if (!fileId) {
      return { ...base, success: false, detail: `Cannot move file: no file ID provided.`, error: "Missing fileId parameter" };
    }

    const result = await executeGwsCommand("drive", "files", "update", { fileId, addParents: destination, fields: "id,name,parents" });
    return {
      ...base,
      success: result.success,
      detail: result.success ? `File "${filename}" moved to folder ${destination}.` : `Failed to move file "${filename}".`,
      externalId: fileId,
      error: result.success ? undefined : result.stderr,
    };
  }

  private async deleteFileViaCli(
    request: ExecutionRequest,
    base: Omit<ExecutionResult, "success" | "detail">
  ): Promise<ExecutionResult> {
    const fileId = request.parameters.fileId || request.parameters.file_id || "";
    const filename = request.parameters.filename || "unknown";

    if (!fileId) {
      return { ...base, success: false, detail: `Cannot delete file: no file ID provided.`, error: "Missing fileId parameter" };
    }

    const result = await executeGwsCommand("drive", "files", "update", { fileId }, { trashed: true });
    return {
      ...base,
      success: result.success,
      detail: result.success
        ? `File "${filename}" moved to trash in Google Drive. File ID: ${fileId}`
        : `Failed to delete file "${filename}".`,
      externalId: fileId,
      error: result.success ? undefined : result.stderr,
    };
  }

  private getSimulatedDetail(request: ExecutionRequest): string {
    switch (request.action) {
      case "write_file":
        return `[Simulated] File "${request.parameters.filename || "document.txt"}" written to Drive. No file was actually created.`;
      case "read_file":
        return `[Simulated] File "${request.parameters.filename || "document.txt"}" read from Drive.`;
      case "move_file":
        return `[Simulated] File moved to "${request.parameters.destination || "/"}". No file was actually moved.`;
      case "delete_file":
        return `[Simulated] File "${request.parameters.filename || "document.txt"}" moved to trash. No file was actually deleted.`;
      default:
        return `[Simulated] Drive action "${request.action}" completed.`;
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
        "Create, read, move, and delete files in Google Drive. Uses your connected Google account when available, with CLI fallback.",
    };
  }
}
