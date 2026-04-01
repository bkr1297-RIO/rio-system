/**
 * CLI Executor Utility
 *
 * Provides a safe way for connectors to execute sandbox CLI tools
 * (manus-mcp-cli, gws, gh) from the Express server process.
 *
 * This is the bridge between the RIO connector layer and the
 * sandbox-only CLI tools. Each connector calls executeCliCommand()
 * to perform real-world actions after RIO authorization.
 *
 * SECURITY: Only called after receipt + ledger entry exist.
 * The connector layer enforces this — see base.ts.
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface CliResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a CLI command in the sandbox shell.
 * Returns structured result with stdout, stderr, and exit code.
 *
 * @param command - The full CLI command to execute
 * @param timeoutMs - Timeout in milliseconds (default: 30s)
 */
export async function executeCliCommand(
  command: string,
  timeoutMs: number = 30_000
): Promise<CliResult> {
  try {
    console.log(`[RIO CLI Executor] Running: ${command.substring(0, 200)}...`);

    const { stdout, stderr } = await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024, // 1MB
      env: { ...process.env, HOME: "/home/ubuntu" },
    });

    console.log(`[RIO CLI Executor] Success. stdout length: ${stdout.length}`);

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
    };
  } catch (err: unknown) {
    const error = err as {
      stdout?: string;
      stderr?: string;
      code?: number;
      message?: string;
    };

    console.error(`[RIO CLI Executor] Failed: ${error.message ?? "Unknown"}`);

    return {
      success: false,
      stdout: error.stdout?.trim() ?? "",
      stderr: error.stderr?.trim() ?? error.message ?? "Unknown error",
      exitCode: error.code ?? 1,
    };
  }
}

/**
 * Execute an MCP tool call via manus-mcp-cli.
 *
 * @param server - MCP server name (e.g., "gmail")
 * @param tool - Tool name (e.g., "gmail_send_messages")
 * @param input - JSON input for the tool
 */
export async function executeMcpTool(
  server: string,
  tool: string,
  input: Record<string, unknown>
): Promise<CliResult> {
  const jsonInput = JSON.stringify(input).replace(/'/g, "'\\''");
  const command = `manus-mcp-cli tool call ${tool} --server ${server} --input '${jsonInput}'`;
  return executeCliCommand(command, 60_000); // 60s timeout for MCP tools
}

/**
 * Execute a gws (Google Workspace) CLI command.
 *
 * @param service - Service name (e.g., "drive", "calendar")
 * @param resource - Resource name (e.g., "files", "events")
 * @param method - Method name (e.g., "create", "insert", "list")
 * @param params - URL/query parameters
 * @param json - Request body
 * @param upload - Optional file path to upload
 */
export async function executeGwsCommand(
  service: string,
  resource: string,
  method: string,
  params?: Record<string, unknown>,
  json?: Record<string, unknown>,
  upload?: string,
  uploadContentType?: string
): Promise<CliResult> {
  let command = `gws ${service} ${resource} ${method}`;

  if (params) {
    const paramsStr = JSON.stringify(params).replace(/'/g, "'\\''");
    command += ` --params '${paramsStr}'`;
  }

  if (json) {
    const jsonStr = JSON.stringify(json).replace(/'/g, "'\\''");
    command += ` --json '${jsonStr}'`;
  }

  if (upload) {
    command += ` --upload '${upload}'`;
    if (uploadContentType) {
      command += ` --upload-content-type '${uploadContentType}'`;
    }
  }

  return executeCliCommand(command, 30_000);
}

/**
 * Execute a GitHub CLI command.
 *
 * @param args - Arguments to pass to gh (e.g., "issue create --title ...")
 */
export async function executeGhCommand(args: string): Promise<CliResult> {
  const command = `gh ${args}`;
  return executeCliCommand(command, 30_000);
}
