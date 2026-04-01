/**
 * OneDrive Connector
 *
 * Executes file actions through Microsoft OneDrive after RIO authorization.
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
import { onedriveUploadFile, onedriveListFiles, onedriveGetFile } from "./microsoft-api";

const ONEDRIVE_CAPABILITIES: ConnectorCapability[] = [
  {
    action: "upload_file",
    label: "Upload File",
    description: "Upload a file to OneDrive",
    riskLevel: "Medium",
  },
  {
    action: "list_files",
    label: "List Files",
    description: "List files in a OneDrive folder",
    riskLevel: "Low",
  },
  {
    action: "get_file",
    label: "Get File",
    description: "Get file metadata from OneDrive",
    riskLevel: "Low",
  },
];

export class OneDriveConnector implements RIOConnector {
  id = "onedrive";
  name = "OneDrive";
  platform = "microsoft";
  icon = "hard-drive";
  status: ConnectorStatus = "connected";

  capabilities = ONEDRIVE_CAPABILITIES;

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
      if (request.action === "upload_file") {
        return {
          ...base,
          success: true,
          detail: `[Simulated] File "${request.parameters.fileName || request.parameters.path}" uploaded to OneDrive. No file was actually uploaded.`,
        };
      }
      return {
        ...base,
        success: true,
        detail: `[Simulated] OneDrive action "${request.action}" completed.`,
      };
    }

    // ── Live Mode ──
    const userToken = request.userId
      ? await getValidMicrosoftToken(request.userId, "onedrive")
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
      console.log(`[RIO OneDrive] LIVE execution with user OAuth token`);
      console.log(`  Intent: ${request.intentId}`);
      console.log(`  Receipt: ${request.receiptId}`);
      console.log(`  User: ${request.userId}`);

      if (request.action === "upload_file") {
        const filePath = request.parameters.path || request.parameters.fileName || "untitled.txt";
        const content = request.parameters.content || "";
        const contentType = request.parameters.contentType || "text/plain";

        const result = await onedriveUploadFile(
          accessToken,
          filePath,
          content,
          contentType
        );

        if (result.success) {
          const fileId = (result.data as any)?.id || "";
          console.log(`[RIO OneDrive] File uploaded. ID: ${fileId}`);
          return {
            ...base,
            success: true,
            detail: `File "${filePath}" uploaded to your OneDrive. Receipt: ${request.receiptId}`,
            externalId: fileId,
          };
        } else {
          console.error(`[RIO OneDrive] Upload failed:`, result.error);
          return {
            ...base,
            success: false,
            detail: `OneDrive upload attempted but failed. Receipt and ledger entry preserved.`,
            error: result.error || "Microsoft Graph API call failed",
          };
        }
      }

      if (request.action === "list_files") {
        const folderPath = request.parameters.folder || request.parameters.path || "root";
        const result = await onedriveListFiles(accessToken, folderPath);

        return {
          ...base,
          success: result.success,
          detail: result.success
            ? `Listed files from your OneDrive folder.`
            : `Failed to list files.`,
          error: result.success ? undefined : result.error,
        };
      }

      if (request.action === "get_file") {
        const filePath = request.parameters.path || request.parameters.fileName;
        if (!filePath) {
          return {
            ...base,
            success: false,
            detail: `No file path specified.`,
            error: "Missing file path parameter",
          };
        }

        const result = await onedriveGetFile(accessToken, filePath);

        return {
          ...base,
          success: result.success,
          detail: result.success
            ? `File metadata retrieved from your OneDrive.`
            : `Failed to get file.`,
          error: result.success ? undefined : result.error,
        };
      }

      return {
        ...base,
        success: false,
        detail: `Unknown OneDrive action: ${request.action}`,
        error: "Unsupported action",
      };
    } catch (err) {
      console.error(`[RIO OneDrive] Execution error:`, err);
      return {
        ...base,
        success: false,
        detail: `OneDrive execution failed unexpectedly. Receipt and ledger entry preserved.`,
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
        "Upload, list, and manage files through Microsoft OneDrive. Uses your connected Microsoft account.",
    };
  }
}
