/**
 * RIO Intent Store
 *
 * Tracks intents as they move through the governance pipeline:
 *   submitted → governed → authorized/denied → executed → receipted
 *
 * In production, this would be backed by a database.
 * For the MVP, it uses an in-memory Map.
 */
import { randomUUID } from "node:crypto";

const intents = new Map();

/**
 * Create a new intent.
 */
export function createIntent(data) {
  const intentId = randomUUID();
  const timestamp = new Date().toISOString();

  const intent = {
    intent_id: intentId,
    action: data.action,
    agent_id: data.agent_id,
    target_environment: data.target_environment || "local",
    parameters: data.parameters || {},
    confidence: data.confidence ?? 0,
    description: data.description || "",
    timestamp,
    status: "submitted",
    governance: null,
    authorization: null,
    execution: null,
    receipt: null,
    // Area 1: Principal attribution
    principal_id: data.principal_id || null,
    principal_role: data.principal_role || null,
    // Preserve intake and auth metadata
    _intake: data._intake || null,
    _auth_method: data._auth_method || null,
    _api_key_id: data._api_key_id || null,
  };

  intents.set(intentId, intent);
  return intent;
}

/**
 * Get an intent by ID.
 */
export function getIntent(intentId) {
  return intents.get(intentId) || null;
}

/**
 * Update an intent's status and attach pipeline artifacts.
 */
export function updateIntent(intentId, updates) {
  const intent = intents.get(intentId);
  if (!intent) return null;

  Object.assign(intent, updates);
  intents.set(intentId, intent);
  return intent;
}

/**
 * List all intents, optionally filtered by status.
 */
export function listIntents(status, limit = 50) {
  let results = Array.from(intents.values());
  if (status) {
    results = results.filter((i) => i.status === status);
  }
  // Most recent first
  results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return results.slice(0, limit);
}

/**
 * Get pipeline status counts.
 */
export function getStats() {
  const stats = {
    total: intents.size,
    submitted: 0,
    governed: 0,
    authorized: 0,
    denied: 0,
    executed: 0,
    receipted: 0,
    blocked: 0,
  };
  for (const intent of intents.values()) {
    if (stats[intent.status] !== undefined) {
      stats[intent.status]++;
    }
  }
  return stats;
}
