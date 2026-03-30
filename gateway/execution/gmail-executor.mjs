/**
 * RIO Gmail Executor — Real Connector
 *
 * Executes a real Gmail send via the manus-mcp-cli tool.
 * This module is called ONLY by the gateway execute route
 * AFTER the full governance pipeline has completed and
 * human authorization has been verified.
 *
 * Architecture rule: All external API calls go through
 * the gateway. No agent calls Gmail directly.
 *
 * Implementation note: manus-mcp-cli must be invoked via
 * shell, so we write a script file and execute it via bash.
 */
import { execSync, spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

/**
 * Send a real email via Gmail MCP.
 *
 * @param {object} params
 * @param {string|string[]} params.to - Recipient email(s)
 * @param {string[]} [params.cc] - CC recipients
 * @param {string} params.subject - Email subject
 * @param {string} params.body - Email body (plain text)
 * @param {string[]} [params.attachments] - File paths to attach
 * @returns {object} { status, connector, detail }
 */
export function sendEmail({ to, cc, subject, body, attachments }) {
  // Normalize 'to' to array
  const toList = Array.isArray(to) ? to : [to];

  const message = {
    to: toList,
    subject,
    content: body,
  };

  if (cc && cc.length > 0) {
    message.cc = cc;
  }

  if (attachments && attachments.length > 0) {
    message.attachments = attachments;
  }

  const mcpInput = JSON.stringify({ messages: [message] });

  console.log(`[RIO Gmail Executor] Sending email to: ${toList.join(", ")}`);
  if (cc) console.log(`[RIO Gmail Executor] CC: ${cc.join(", ")}`);
  console.log(`[RIO Gmail Executor] Subject: ${subject}`);

  // Write the MCP input to a temp JSON file
  const uid = randomUUID();
  const inputFile = `/tmp/rio-mcp-input-${uid}.json`;
  const scriptFile = `/tmp/rio-mcp-exec-${uid}.sh`;
  const resultFile = `/tmp/rio-mcp-result-${uid}.txt`;

  writeFileSync(inputFile, mcpInput);

  // Write a shell script that reads the JSON and calls manus-mcp-cli
  const script = `#!/bin/bash
INPUT=$(cat '${inputFile}')
manus-mcp-cli tool call gmail_send_messages --server gmail --input "$INPUT" > '${resultFile}' 2>&1
echo "EXIT_CODE=$?" >> '${resultFile}'
`;
  writeFileSync(scriptFile, script);

  try {
    const proc = spawnSync("bash", [scriptFile], {
      encoding: "utf-8",
      timeout: 60000,
      env: { ...process.env, HOME: "/home/ubuntu" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let resultText = "";
    if (existsSync(resultFile)) {
      resultText = readFileSync(resultFile, "utf-8");
    }

    // Also capture stdout/stderr from the process
    const fullOutput = [
      proc.stdout || "",
      proc.stderr || "",
      resultText,
    ].join("\n").trim();

    console.log(`[RIO Gmail Executor] Result: ${fullOutput.substring(0, 500)}`);

    // Check for success indicators
    if (fullOutput.includes("Message ID") || fullOutput.includes("mcp_result") || fullOutput.includes("Email Details")) {
      return {
        status: "sent",
        connector: "gmail_mcp",
        detail: fullOutput.substring(0, 1000),
      };
    }

    if (proc.status !== 0 || fullOutput.includes("Error:")) {
      throw new Error(fullOutput.substring(0, 500));
    }

    return {
      status: "sent",
      connector: "gmail_mcp",
      detail: fullOutput.substring(0, 1000),
    };
  } finally {
    // Clean up temp files
    try { unlinkSync(inputFile); } catch (_) {}
    try { unlinkSync(scriptFile); } catch (_) {}
    try { unlinkSync(resultFile); } catch (_) {}
  }
}
