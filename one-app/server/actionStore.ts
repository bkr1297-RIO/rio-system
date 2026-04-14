/**
 * RIO Shared Action Store
 * ───────────────────────
 * The universal contract between all agents: Gemini, Manny, Claude, OpenAI, Human.
 *
 * This is the foundation. Not temporary. Not a prototype.
 *
 * Structure:
 *   { id, source, action, data, status, result?, receipt_id?, created_at, updated_at }
 *
 * Flow:
 *   1. Any agent writes an action (status: pending)
 *   2. Executor reads + claims it (status: executing)
 *   3. Executor completes or fails it (status: completed | failed)
 *   4. System logs a receipt to the governance ledger
 *
 * Design rules:
 *   - File-based (no DB, no API, no over-engineering)
 *   - Any agent that can read/write JSON can participate
 *   - One file per action, stored in /actions/ directory
 *   - Idempotent claims (only pending → executing transition allowed)
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { appendLedger, sha256 } from "./db";
import { writeState, readState } from "./continuity";

// ─── Types ────────────────────────────────────────────────────

/** Who created the action */
export type ActionSource = "gemini" | "manny" | "claude" | "openai" | "human";

/** Current state of the action */
export type ActionStatus = "pending" | "executing" | "completed" | "failed" | "cancelled";

/** The shared action format — the universal contract */
export interface RIOAction {
  /** Unique action ID (UUID) */
  id: string;
  /** Who created this action */
  source: ActionSource;
  /** What to do (e.g. "send_email", "search_web", "draft_document") */
  action: string;
  /** Action-specific payload — any JSON-serializable data */
  data: Record<string, unknown>;
  /** Current status */
  status: ActionStatus;
  /** Result of execution (populated on completed/failed) */
  result?: Record<string, unknown> | string | null;
  /** Linked receipt ID (populated after ledger write) */
  receipt_id?: string | null;
  /** When the action was created */
  created_at: string;
  /** When the action was last updated */
  updated_at: string;
}

// ─── Storage ──────────────────────────────────────────────────

const ACTIONS_DIR = path.join(process.cwd(), "actions");

/** Ensure the actions directory exists */
function ensureDir(): void {
  if (!fs.existsSync(ACTIONS_DIR)) {
    fs.mkdirSync(ACTIONS_DIR, { recursive: true });
  }
}

/** Get the file path for an action by ID */
function actionPath(id: string): string {
  return path.join(ACTIONS_DIR, `${id}.json`);
}

/** Read a single action from disk */
function readAction(id: string): RIOAction | null {
  const filePath = actionPath(id);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as RIOAction;
  } catch {
    return null;
  }
}

/** Write a single action to disk */
function writeAction(action: RIOAction): void {
  ensureDir();
  fs.writeFileSync(actionPath(action.id), JSON.stringify(action, null, 2), "utf-8");
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Create a new action. Any agent calls this.
 * Returns the action with status: pending.
 */
export function createAction(
  source: ActionSource,
  action: string,
  data: Record<string, unknown>,
): RIOAction {
  const now = new Date().toISOString();
  const rioAction: RIOAction = {
    id: crypto.randomUUID(),
    source,
    action,
    data,
    status: "pending",
    result: null,
    receipt_id: null,
    created_at: now,
    updated_at: now,
  };
  writeAction(rioAction);

  // Update continuity state
  try {
    const state = readState();
    writeState(source, {
      pending_actions: state.pending_actions + 1,
      last_note: `Action created: ${action} by ${source}`,
    });
  } catch { /* continuity failure is non-blocking */ }

  return rioAction;
}

/**
 * Claim an action for execution.
 * Only works on pending actions (prevents double-pickup).
 * Returns the claimed action or null if not claimable.
 */
export function claimAction(id: string): RIOAction | null {
  const action = readAction(id);
  if (!action || action.status !== "pending") return null;

  action.status = "executing";
  action.updated_at = new Date().toISOString();
  writeAction(action);
  return action;
}

/**
 * Mark an action as completed with a result.
 * Logs a receipt to the governance ledger.
 */
export async function completeAction(
  id: string,
  result: Record<string, unknown> | string,
): Promise<RIOAction | null> {
  const action = readAction(id);
  if (!action || action.status !== "executing") return null;

  action.status = "completed";
  action.result = typeof result === "string" ? { message: result } : result;
  action.updated_at = new Date().toISOString();

  // Log to governance ledger
  try {
    const entry = await appendLedger("ACTION_COMPLETE", {
      action_id: action.id,
      source: action.source,
      action: action.action,
      status: "completed",
      data_hash: sha256(JSON.stringify(action.data)),
      result_hash: sha256(JSON.stringify(action.result)),
      timestamp: action.updated_at,
    });
    action.receipt_id = entry.entryId;
  } catch (err) {
    // Ledger failure is non-blocking
    console.error("[ActionStore] Ledger write failed (non-blocking):", err);
  }

  writeAction(action);
  return action;
}

/**
 * Mark an action as failed with an error.
 * Logs a receipt to the governance ledger.
 */
export async function failAction(
  id: string,
  error: string,
): Promise<RIOAction | null> {
  const action = readAction(id);
  if (!action || action.status !== "executing") return null;

  action.status = "failed";
  action.result = { error };
  action.updated_at = new Date().toISOString();

  // Log to governance ledger
  try {
    const entry = await appendLedger("ACTION_COMPLETE", {
      action_id: action.id,
      source: action.source,
      action: action.action,
      status: "failed",
      data_hash: sha256(JSON.stringify(action.data)),
      error: error.slice(0, 500),
      timestamp: action.updated_at,
    });
    action.receipt_id = entry.entryId;
  } catch (err) {
    console.error("[ActionStore] Ledger write failed (non-blocking):", err);
  }

  writeAction(action);

  // Update continuity state
  try {
    const state = readState();
    writeState(action.source, {
      pending_actions: Math.max(0, state.pending_actions - 1),
      failed_actions_count: state.failed_actions_count + 1,
      last_note: `Action failed: ${action.action} (${action.source}) — ${error.slice(0, 100)}`,
    });
  } catch { /* continuity failure is non-blocking */ }

  return action;
}

/**
 * Cancel a pending action.
 * Only works on pending actions.
 */
export function cancelAction(id: string): RIOAction | null {
  const action = readAction(id);
  if (!action || action.status !== "pending") return null;

  action.status = "cancelled";
  action.updated_at = new Date().toISOString();
  writeAction(action);

  // Update continuity state
  try {
    const state = readState();
    writeState(action.source, {
      pending_actions: Math.max(0, state.pending_actions - 1),
      last_note: `Action cancelled: ${action.action} (${action.source})`,
    });
  } catch { /* continuity failure is non-blocking */ }

  return action;
}

/**
 * Get a single action by ID.
 */
export function getAction(id: string): RIOAction | null {
  return readAction(id);
}

/**
 * List actions, optionally filtered by status and/or source.
 * Returns newest first.
 */
export function listActions(filter?: {
  status?: ActionStatus;
  source?: ActionSource;
}): RIOAction[] {
  ensureDir();
  const files = fs.readdirSync(ACTIONS_DIR).filter(f => f.endsWith(".json"));
  const actions: RIOAction[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(ACTIONS_DIR, file), "utf-8");
      const action = JSON.parse(raw) as RIOAction;

      if (filter?.status && action.status !== filter.status) continue;
      if (filter?.source && action.source !== filter.source) continue;

      actions.push(action);
    } catch {
      // Skip corrupt files
    }
  }

  // Newest first
  actions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return actions;
}

/**
 * Get pending actions — what an executor polls for.
 */
export function getPendingActions(): RIOAction[] {
  return listActions({ status: "pending" });
}

/**
 * Clear all actions (for testing only).
 */
export function _clearActions(): void {
  ensureDir();
  const files = fs.readdirSync(ACTIONS_DIR).filter(f => f.endsWith(".json"));
  for (const file of files) {
    fs.unlinkSync(path.join(ACTIONS_DIR, file));
  }
}
