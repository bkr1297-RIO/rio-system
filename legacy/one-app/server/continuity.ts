/**
 * RIO Continuity Layer
 * ────────────────────
 * Shared state file that every agent reads before acting and writes after acting.
 * No drift. Every interaction starts with latest context, ends by updating it.
 *
 * state.json lives at project root. Any agent that can read/write JSON participates.
 *
 * Flow:
 *   1. Agent reads state.json (readState)
 *   2. Agent performs action
 *   3. Agent writes updated state back (writeState)
 *
 * Or use the atomic wrapper:
 *   withContinuity("manny", async (state) => { ... return updates; })
 */

import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────

/** Decision summary — what the last scan/action decided */
export interface LastDecision {
  action_id: string;
  decision: string;       // BLOCK | FLAG | WARN | PASS
  channel: string;        // email | sms | slack | linkedin | telegram
  confidence: string;     // high | medium | low
  timestamp: string;
}

/** The shared system state — the continuity contract */
export interface RIOState {
  /** Monotonically increasing version number */
  version: number;
  /** ISO timestamp of last update */
  last_updated: string;
  /** Which agent last wrote to state */
  last_agent: string;
  /** Overall system status */
  system_status: "operational" | "degraded" | "offline";
  /** Which channels are active */
  active_channels: string[];
  /** Hash of the frozen rule kernel (for drift detection) */
  rule_kernel_hash: string;
  /** Current count of pending actions in the store */
  pending_actions: number;
  /** Total completed actions since system start */
  completed_actions_count: number;
  /** Total failed actions since system start */
  failed_actions_count: number;
  /** Summary of the most recent decision */
  last_decision: LastDecision | null;
  /** Which agents have ever interacted with the system */
  agents_seen: string[];
  /** Free-form notes from the last agent (optional context) */
  last_note: string;
}

// ─── Storage ──────────────────────────────────────────────────

const STATE_FILE = path.join(process.cwd(), "state.json");

/** Default state when no state.json exists */
function defaultState(): RIOState {
  return {
    version: 0,
    last_updated: new Date().toISOString(),
    last_agent: "system",
    system_status: "operational",
    active_channels: ["email", "sms", "slack", "linkedin"],
    rule_kernel_hash: "",
    pending_actions: 0,
    completed_actions_count: 0,
    failed_actions_count: 0,
    last_decision: null,
    agents_seen: [],
    last_note: "System initialized",
  };
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Read the current system state.
 * Creates default state.json if it doesn't exist.
 */
export function readState(): RIOState {
  if (!fs.existsSync(STATE_FILE)) {
    const initial = defaultState();
    fs.writeFileSync(STATE_FILE, JSON.stringify(initial, null, 2), "utf-8");
    return initial;
  }

  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(raw) as RIOState;
  } catch {
    // Corrupt file — reset to default
    const initial = defaultState();
    fs.writeFileSync(STATE_FILE, JSON.stringify(initial, null, 2), "utf-8");
    return initial;
  }
}

/**
 * Write updates to the system state.
 * Merges partial updates into existing state.
 * Automatically bumps version, sets last_updated, and tracks agent.
 */
export function writeState(
  agentId: string,
  updates: Partial<Omit<RIOState, "version" | "last_updated" | "last_agent">>,
): RIOState {
  const current = readState();

  // Merge updates
  const merged: RIOState = {
    ...current,
    ...updates,
    // Always auto-set these
    version: current.version + 1,
    last_updated: new Date().toISOString(),
    last_agent: agentId,
    // Merge agents_seen (add new agent if not already tracked)
    agents_seen: Array.from(new Set([...current.agents_seen, agentId])),
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

/**
 * Atomic continuity wrapper.
 * Reads state → runs your function with it → writes the returned updates.
 *
 * Usage:
 *   const newState = await withContinuity("manny", async (state) => {
 *     // do work using state for context
 *     return { pending_actions: state.pending_actions + 1 };
 *   });
 */
export async function withContinuity<T extends Partial<Omit<RIOState, "version" | "last_updated" | "last_agent">>>(
  agentId: string,
  fn: (state: RIOState) => T | Promise<T>,
): Promise<RIOState> {
  const state = readState();
  const updates = await fn(state);
  return writeState(agentId, updates);
}

/**
 * Get the state file path (for testing/inspection).
 */
export function getStateFilePath(): string {
  return STATE_FILE;
}

/**
 * Reset state to default (for testing only).
 */
export function _resetState(): void {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
}
