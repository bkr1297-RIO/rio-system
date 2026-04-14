/**
 * RIO State Expansion — CBS Section 8 + 11
 * ──────────────────────────────────────────
 * Adds cooldowns, sessions, and userBehavior tracking to state.json.
 * Works alongside existing continuity.ts — reads/writes the same file.
 *
 * Does NOT replace continuity.ts. Extends it with additional fields.
 */

import { readState, writeState } from "./continuity";
import { loadConfig } from "./rioConfig";

// ─── Types ────────────────────────────────────────────────────

export interface CooldownEntry {
  actor_id: string;
  action_type: string;
  expires_at: number;   // Unix ms
  reason: string;
}

export interface SessionEntry {
  session_id: string;
  actor_id: string;
  started_at: number;   // Unix ms
  last_activity: number; // Unix ms
  action_count: number;
}

export interface UserBehaviorEntry {
  actor_id: string;
  total_actions: number;
  last_action_at: number;  // Unix ms
  risk_profile: "low" | "normal" | "elevated";
  consecutive_high_risk: number;
}

// ─── Extended State (stored as JSON alongside RIOState) ───────

interface ExtendedState {
  cooldowns: CooldownEntry[];
  sessions: Record<string, SessionEntry>;
  userBehavior: Record<string, UserBehaviorEntry>;
}

// In-memory extended state (synced to state.json via last_note)
let extendedState: ExtendedState = {
  cooldowns: [],
  sessions: {},
  userBehavior: {},
};

/**
 * Initialize extended state from state.json last_note (if encoded there).
 */
export function initExtendedState(): void {
  try {
    const state = readState();
    if (state.last_note && state.last_note.startsWith("{\"cooldowns\":")) {
      extendedState = JSON.parse(state.last_note);
    }
  } catch {
    // Start fresh
  }
}

/**
 * Persist extended state to state.json.
 * Uses a dedicated field approach — writes to a separate file.
 */
function persistExtendedState(): void {
  try {
    const fs = require("fs");
    const path = require("path");
    const filePath = path.join(process.cwd(), "state_extended.json");
    fs.writeFileSync(filePath, JSON.stringify(extendedState, null, 2), "utf-8");
  } catch {
    // Non-blocking
  }
}

/**
 * Load extended state from disk.
 */
export function loadExtendedState(): ExtendedState {
  try {
    const fs = require("fs");
    const path = require("path");
    const filePath = path.join(process.cwd(), "state_extended.json");
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      extendedState = JSON.parse(raw);
    }
  } catch {
    // Use in-memory defaults
  }
  return extendedState;
}

// ═══════════════════════════════════════════════════════════════
// COOLDOWNS (CBS Section 8 + 10)
// ═══════════════════════════════════════════════════════════════

/**
 * Check if an actor is in cooldown for a given action type.
 */
export function isInCooldown(actorId: string, actionType?: string): boolean {
  const now = Date.now();
  // Clean expired cooldowns
  extendedState.cooldowns = extendedState.cooldowns.filter(c => c.expires_at > now);

  return extendedState.cooldowns.some(c =>
    c.actor_id === actorId &&
    (actionType ? c.action_type === actionType : true),
  );
}

/**
 * Add a cooldown for an actor.
 */
export function addCooldown(
  actorId: string,
  actionType: string,
  reason: string,
  durationMs?: number,
): CooldownEntry {
  const config = loadConfig();
  const duration = durationMs ?? config.cooldown_default;

  const entry: CooldownEntry = {
    actor_id: actorId,
    action_type: actionType,
    expires_at: Date.now() + duration,
    reason,
  };

  extendedState.cooldowns.push(entry);
  persistExtendedState();
  return entry;
}

/**
 * Get active cooldowns for an actor.
 */
export function getActiveCooldowns(actorId?: string): CooldownEntry[] {
  const now = Date.now();
  extendedState.cooldowns = extendedState.cooldowns.filter(c => c.expires_at > now);
  if (actorId) {
    return extendedState.cooldowns.filter(c => c.actor_id === actorId);
  }
  return [...extendedState.cooldowns];
}

// ═══════════════════════════════════════════════════════════════
// SESSIONS (CBS Section 8)
// ═══════════════════════════════════════════════════════════════

/**
 * Record activity for an actor's session.
 */
export function recordSessionActivity(actorId: string, sessionId?: string): SessionEntry {
  const sid = sessionId ?? actorId;
  const now = Date.now();

  if (!extendedState.sessions[sid]) {
    extendedState.sessions[sid] = {
      session_id: sid,
      actor_id: actorId,
      started_at: now,
      last_activity: now,
      action_count: 0,
    };
  }

  extendedState.sessions[sid].last_activity = now;
  extendedState.sessions[sid].action_count += 1;
  persistExtendedState();
  return extendedState.sessions[sid];
}

/**
 * Get session for an actor.
 */
export function getSession(actorId: string): SessionEntry | null {
  return extendedState.sessions[actorId] ?? null;
}

// ═══════════════════════════════════════════════════════════════
// USER BEHAVIOR (CBS Section 8 + 11)
// ═══════════════════════════════════════════════════════════════

/**
 * Record an action for user behavior tracking.
 */
export function recordUserAction(
  actorId: string,
  riskLevel: "low" | "medium" | "high",
): UserBehaviorEntry {
  if (!extendedState.userBehavior[actorId]) {
    extendedState.userBehavior[actorId] = {
      actor_id: actorId,
      total_actions: 0,
      last_action_at: 0,
      risk_profile: "low",
      consecutive_high_risk: 0,
    };
  }

  const behavior = extendedState.userBehavior[actorId];
  behavior.total_actions += 1;
  behavior.last_action_at = Date.now();

  if (riskLevel === "high") {
    behavior.consecutive_high_risk += 1;
  } else {
    behavior.consecutive_high_risk = 0;
  }

  // Update risk profile
  if (behavior.consecutive_high_risk >= 3) {
    behavior.risk_profile = "elevated";
  } else if (behavior.consecutive_high_risk >= 1) {
    behavior.risk_profile = "normal";
  } else {
    behavior.risk_profile = "low";
  }

  persistExtendedState();
  return behavior;
}

/**
 * Get behavior profile for an actor.
 */
export function getUserBehavior(actorId: string): UserBehaviorEntry | null {
  return extendedState.userBehavior[actorId] ?? null;
}

/**
 * Get all behavior profiles.
 */
export function getAllUserBehavior(): Record<string, UserBehaviorEntry> {
  return { ...extendedState.userBehavior };
}

// ═══════════════════════════════════════════════════════════════
// SYSTEM HEALTH (CBS Section 13)
// ═══════════════════════════════════════════════════════════════

export interface SystemHealth {
  system_status: "ACTIVE" | "DEGRADED" | "BLOCKED";
  chain_integrity: boolean;
  last_action_timestamp: string | null;
  last_error: string | null;
  active_cooldowns: number;
  active_sessions: number;
  uptime_ms: number;
}

const startTime = Date.now();
let lastError: string | null = null;
let lastActionTimestamp: string | null = null;
let chainIntegrity = true;

export function setChainIntegrity(valid: boolean): void {
  chainIntegrity = valid;
}

export function setLastError(error: string | null): void {
  lastError = error;
}

export function setLastActionTimestamp(timestamp: string): void {
  lastActionTimestamp = timestamp;
}

/**
 * Get structured system health.
 * CBS Section 13: { system_status, chain_integrity, last_action_timestamp, last_error }
 */
export function getSystemHealth(): SystemHealth {
  const state = readState();
  const activeCooldowns = getActiveCooldowns().length;
  const activeSessions = Object.keys(extendedState.sessions).length;

  let systemStatus: SystemHealth["system_status"] = "ACTIVE";
  if (!chainIntegrity) systemStatus = "BLOCKED";
  else if (state.system_status === "degraded") systemStatus = "DEGRADED";
  else if (lastError) systemStatus = "DEGRADED";

  return {
    system_status: systemStatus,
    chain_integrity: chainIntegrity,
    last_action_timestamp: lastActionTimestamp,
    last_error: lastError,
    active_cooldowns: activeCooldowns,
    active_sessions: activeSessions,
    uptime_ms: Date.now() - startTime,
  };
}

/**
 * Reset extended state (for testing).
 */
export function _resetExtendedState(): void {
  extendedState = {
    cooldowns: [],
    sessions: {},
    userBehavior: {},
  };
  lastError = null;
  lastActionTimestamp = null;
  chainIntegrity = true;
}
