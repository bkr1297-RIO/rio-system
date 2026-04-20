/**
 * RIO Governance Config Loader
 *
 * Loads governance configuration JSON files from /config/rio/
 * These define the constitution, policies, and role assignments
 * that the gateway enforces at runtime.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, "..", "config", "rio");

const CONFIG_FILES = {
  constitution: "RIO_CONSTITUTION.json",
  policy: "RIO_POLICY.json",
  role_manus: "RIO_ROLE_MANUS.json",
  role_gemini: "RIO_ROLE_GEMINI.json",
};

const config = {};

/**
 * Load all governance config files.
 * Fails loudly if any required config is missing — fail closed.
 */
export function loadConfig() {
  for (const [key, filename] of Object.entries(CONFIG_FILES)) {
    const filepath = join(CONFIG_DIR, filename);
    if (!existsSync(filepath)) {
      throw new Error(
        `[RIO Config] FATAL: Missing required config file: ${filename}. ` +
        `Gateway cannot start without governance configuration.`
      );
    }
    try {
      const raw = readFileSync(filepath, "utf-8");
      config[key] = JSON.parse(raw);
      console.log(`[RIO Config] Loaded: ${filename}`);
    } catch (err) {
      throw new Error(
        `[RIO Config] FATAL: Failed to parse ${filename}: ${err.message}`
      );
    }
  }
  return config;
}

/**
 * Get the loaded constitution.
 */
export function getConstitution() {
  return config.constitution;
}

/**
 * Get the loaded policy.
 */
export function getPolicy() {
  return config.policy?.one_governance_policy;
}

/**
 * Get a role definition by agent ID.
 */
export function getRole(agentId) {
  const key = `role_${agentId.toLowerCase()}`;
  return config[key] || null;
}

/**
 * Check if an action is restricted (requires human approval).
 */
export function isRestricted(action) {
  const policy = getPolicy();
  if (!policy) return true; // No policy loaded → fail closed
  const restricted = policy.agent_permissions?.restricted_until_approved || [];
  const allowed = policy.agent_permissions?.allowed_by_default || [];

  // If explicitly restricted, return true
  if (restricted.includes(action)) return true;

  // If explicitly allowed, return false
  if (allowed.includes(action)) return false;

  // Unknown action → classify as restricted (fail closed per runtime rules)
  return true;
}

/**
 * Get all config for health/debug endpoints.
 */
export function getAllConfig() {
  return { ...config };
}
