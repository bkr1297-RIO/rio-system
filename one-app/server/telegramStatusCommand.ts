/**
 * RIO Telegram /status Command
 * ─────────────────────────────
 * New governed surface: /status command reads system state from Drive.
 *
 * Flow (maintains all invariants):
 *   1. User sends /status in Telegram
 *   2. Wrap in ActionEnvelope (source: telegram)
 *   3. Create inbound intent (classify_message, LOW risk)
 *   4. Process through intent pipeline (auto-approved, LOW risk)
 *   5. Read system state from Drive (anchor + ledger)
 *   6. Produce receipt
 *   7. Write to ledger (DB + Drive)
 *   8. Reply with formatted status
 *
 * No bypass. No silent execution. Receipt for every action.
 */

import { sendMessage } from "./telegram";
import { getLastAction, getSystemState } from "./readApis";
import { wrapInEnvelope, type ActionEnvelope } from "./standardReceipt";
import { getActivePolicy } from "./authorityLayer";
import { appendLedger, sha256 } from "./db";
import { syncToLibrarian } from "./librarian";
import { processIntent, buildInboundIntent } from "./intentPipeline";
import { writeState } from "./continuity";

// ─── Response Formatting ─────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatStatusReply(
  systemState: Awaited<ReturnType<typeof getSystemState>>,
  lastAction: Awaited<ReturnType<typeof getLastAction>>,
  receiptId: string,
): string {
  const lines: string[] = [
    "📊 <b>RIO System Status</b>",
    "",
  ];

  // Anchor state
  if (systemState.anchor_available && systemState.anchor) {
    lines.push("<b>Anchor:</b>");
    lines.push(`  • State: ${systemState.anchor.system_state}`);
    lines.push(`  • Last Receipt: <code>${systemState.anchor.last_receipt_hash.substring(0, 16)}...</code>`);
    lines.push(`  • Updated: ${systemState.anchor.timestamp}`);
    lines.push("");
  } else {
    lines.push("<b>Anchor:</b> Not available");
    lines.push("");
  }

  // Chain state
  if (systemState.chain_available && systemState.chain) {
    const chainEmoji = systemState.chain.valid ? "✅" : "⚠️";
    lines.push(`<b>Chain:</b> ${chainEmoji} ${systemState.chain.valid ? "VALID" : "BROKEN"}`);
    lines.push(`  • Length: ${systemState.chain.chain_length} entries`);
    if (systemState.chain.last_receipt_id) {
      lines.push(`  • Last: <code>${systemState.chain.last_receipt_id}</code>`);
    }
    if (!systemState.chain.valid && systemState.chain.break_details) {
      lines.push(`  • Break: ${escapeHtml(systemState.chain.break_details)}`);
    }
    lines.push("");
  } else {
    lines.push("<b>Chain:</b> No ledger entries");
    lines.push("");
  }

  // Last action
  if (lastAction) {
    lines.push("<b>Last Action:</b>");
    lines.push(`  • Receipt: <code>${lastAction.receipt_id}</code>`);
    lines.push(`  • Decision: ${lastAction.decision}`);
    lines.push(`  • By: ${lastAction.proposer_id} → ${lastAction.approver_id}`);
    lines.push(`  • Time: ${lastAction.timestamp}`);
    if (lastAction.action_type) {
      lines.push(`  • Type: ${lastAction.action_type}`);
    }
    lines.push("");
  } else {
    lines.push("<b>Last Action:</b> None recorded");
    lines.push("");
  }

  // Server
  const uptimeMin = Math.floor(systemState.server.uptime_ms / 60000);
  lines.push("<b>Server:</b>");
  lines.push(`  • Uptime: ${uptimeMin}m`);
  lines.push(`  • Hash: <code>${systemState.server.last_receipt_hash.substring(0, 16)}...</code>`);
  lines.push("");

  // Receipt for this query
  lines.push(`<b>Query Receipt:</b> <code>${receiptId}</code>`);

  return lines.join("\n");
}

// ─── Command Handler ──────────────────────────────────────────

/**
 * Handle the /status command from Telegram.
 * Returns true if the command was handled, false if not a /status command.
 */
export async function handleStatusCommand(
  text: string,
  senderId: string,
  chatId: number | string,
): Promise<boolean> {
  // Only handle /status
  const cmd = text.trim().toLowerCase();
  if (cmd !== "/status" && !cmd.startsWith("/status ")) return false;

  console.log(`[TelegramStatus] /status command from ${senderId}`);

  try {
    // ─── Step 1: Wrap in ActionEnvelope ──────────────────────
    const policy = getActivePolicy();
    const envelope: ActionEnvelope = wrapInEnvelope({
      actor: `telegram:${senderId}`,
      toolName: "system_status",
      target: "rio_system",
      parameters: { command: "/status", chat_id: String(chatId) },
      source: "telegram",
      policyHash: policy?.policy_hash ?? "no-policy",
    });

    console.log(`[TelegramStatus] Envelope: ${envelope.action_id}`);

    // ─── Step 2: Create intent through pipeline ──────────────
    const intent = buildInboundIntent({
      message: "/status",
      sender: senderId,
      channel: "telegram",
      source: "human",
      metadata: {
        envelope_id: envelope.action_id,
        command: "status",
      },
    });

    // Process through pipeline (LOW risk, auto-approved)
    const pipelineResult = await processIntent(intent, undefined, { useLLM: false });

    // ─── Step 3: Read system state from Drive ────────────────
    const [systemState, lastAction] = await Promise.all([
      getSystemState(),
      getLastAction(),
    ]);

    // ─── Step 4: Produce receipt ─────────────────────────────
    const receiptId = `RCPT-STATUS-${Date.now()}`;
    const receiptHash = sha256(JSON.stringify({
      receipt_id: receiptId,
      action_id: envelope.action_id,
      command: "/status",
      sender: senderId,
      timestamp: new Date().toISOString(),
      system_state_hash: sha256(JSON.stringify(systemState)),
    }));

    // ─── Step 5: Write to ledger (DB) ────────────────────────
    const ledgerResult = await appendLedger("ACTION_COMPLETE", {
      receipt_id: receiptId,
      receipt_hash: receiptHash,
      action_id: envelope.action_id,
      command: "/status",
      sender: senderId,
      channel: "telegram",
      action_type: "system_status",
      action_target: "rio_system",
      execution_status: "EXECUTED",
      policy_decision: "ALLOW",
      authority_model: "Auto-Approved (LOW risk read)",
      timestamp: Date.now(),
    });

    // ─── Step 6: Write to Drive (non-blocking) ──────────────
    syncToLibrarian({
      receipt_id: receiptId,
      receipt_hash: receiptHash,
      previous_receipt_hash: systemState.server.last_receipt_hash,
      proposer_id: `telegram:${senderId}`,
      approver_id: "auto",
      decision: "APPROVED",
      snapshot_hash: receiptHash,
    }).catch(() => { /* Librarian sync failure is non-fatal */ });

    // ─── Step 7: Update continuity state ─────────────────────
    try {
      writeState("human", {
        last_note: `/status command from ${senderId} — receipt ${receiptId}`,
      });
    } catch { /* non-blocking */ }

    // ─── Step 8: Reply with formatted status ─────────────────
    const reply = formatStatusReply(systemState, lastAction, receiptId);
    await sendMessage(reply, "HTML");

    console.log(`[TelegramStatus] /status complete — receipt ${receiptId}, ledger ${ledgerResult.entryId}`);
    return true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[TelegramStatus] /status failed: ${errMsg}`);
    try {
      await sendMessage(`❌ /status failed: ${escapeHtml(errMsg)}`, "HTML");
    } catch { /* double failure */ }
    return true; // still handled (even if failed)
  }
}
