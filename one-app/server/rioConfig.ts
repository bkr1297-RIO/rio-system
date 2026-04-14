/**
 * RIO Configuration — CBS Section 17
 * ───────────────────────────────────
 * System-wide configuration loaded on startup.
 * Provides cooldown defaults, policy version, and rate limits.
 *
 * config.json lives at project root. Editable by owner.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────

export interface RIOConfig {
  /** Default cooldown in ms for same-identity approval (CBS Section 10) */
  cooldown_default: number;
  /** Active policy version string */
  policy_version: string;
  /** Max actions per minute (rate limit) */
  rate_limit: number;
  /** Max duplicate check window size */
  dedup_window_size: number;
  /** Approval expiry in ms */
  approval_expiry_ms: number;
}

// ─── Defaults ─────────────────────────────────────────────────

const DEFAULT_CONFIG: RIOConfig = {
  cooldown_default: 120000,
  policy_version: "v1",
  rate_limit: 10,
  dedup_window_size: 10000,
  approval_expiry_ms: 300000, // 5 minutes
};

// ─── Storage ──────────────────────────────────────────────────

const CONFIG_FILE = path.join(process.cwd(), "config.json");
let cachedConfig: RIOConfig | null = null;

/**
 * Load config from config.json.
 * Creates default file if it doesn't exist.
 * Caches in memory after first load.
 */
export function loadConfig(): RIOConfig {
  if (cachedConfig) return cachedConfig;

  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<RIOConfig>;
    cachedConfig = { ...DEFAULT_CONFIG, ...parsed };
    return cachedConfig;
  } catch {
    // Corrupt config — use defaults
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }
}

/**
 * Get a specific config value.
 */
export function getConfig<K extends keyof RIOConfig>(key: K): RIOConfig[K] {
  return loadConfig()[key];
}

/**
 * Reload config from disk (clears cache).
 */
export function reloadConfig(): RIOConfig {
  cachedConfig = null;
  return loadConfig();
}

/**
 * Get the config file path (for testing/inspection).
 */
export function getConfigFilePath(): string {
  return CONFIG_FILE;
}

/**
 * Reset config to defaults (for testing).
 */
export function _resetConfig(): void {
  cachedConfig = null;
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
}
