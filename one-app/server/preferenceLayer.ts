/**
 * preferenceLayer.ts — Phase 2D
 * 
 * Two types of preferences, strictly separated:
 * 
 * 1. GENERATION PREFERENCES (not governed)
 *    - Affect how proposals are shaped, not whether they execute
 *    - Examples: tone, format, style, templates
 *    - Stored in a simple key-value config (in-memory with DB persistence)
 *    - Changing them does NOT require governance
 * 
 * 2. POLICY PREFERENCES (governed)
 *    - Affect decisions and require explicit approval to change
 *    - Examples: "auto-approve outreach under $50", delegation rules
 *    - Stored as trust_policies (governed artifacts with receipts)
 *    - Changing them IS a governed action (goes through Gateway, generates receipt)
 * 
 * Invariant: The boundary between these two types must never blur.
 * If a preference affects whether something executes, it's a POLICY preference.
 */

import { getDb, appendLedger } from "./db";
import { trustPolicies } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────

export interface GenerationPreference {
  key: string;
  value: string;
  category: string;
  description: string;
}

export interface PolicyPreference {
  id: number;
  key: string;
  value: string;
  category: string;
  description: string;
  receiptId: string | null;
  approvedAt: number | null;
  updatedAt: number;
}

// ─── Generation Preferences (NOT governed) ────────────────────────

/**
 * Default generation preferences.
 * These shape HOW proposals are generated, not WHETHER they execute.
 */
export const DEFAULT_GENERATION_PREFS: Record<string, { value: string; category: string; description: string }> = {
  tone: {
    value: "professional",
    category: "style",
    description: "Communication tone for outreach proposals (professional, warm, direct, concise)",
  },
  format: {
    value: "email",
    category: "style",
    description: "Default format for outreach proposals (email, calendar_invite, message)",
  },
  proposal_detail: {
    value: "detailed",
    category: "style",
    description: "Level of detail in proposals (brief, detailed, comprehensive)",
  },
  follow_up_delay_days: {
    value: "5",
    category: "timing",
    description: "Days to wait before generating follow-up proposals",
  },
  max_proposals_per_batch: {
    value: "10",
    category: "limits",
    description: "Maximum proposals generated per nightly batch",
  },
  outreach_template: {
    value: "standard",
    category: "templates",
    description: "Template style for outreach emails (standard, brief, detailed)",
  },
};

/**
 * In-memory generation preferences store.
 * Initialized from defaults, can be overridden at runtime.
 * These are NOT governed — they affect proposal shaping, not execution.
 */
const generationPrefsStore = new Map<string, string>();

// Initialize from defaults
for (const [key, def] of Object.entries(DEFAULT_GENERATION_PREFS)) {
  generationPrefsStore.set(key, def.value);
}

/**
 * Get a generation preference value.
 */
export function getGenerationPref(key: string): string {
  return generationPrefsStore.get(key) ?? DEFAULT_GENERATION_PREFS[key]?.value ?? "";
}

/**
 * Set a generation preference value.
 * NOT governed — no receipt needed.
 */
export function setGenerationPref(key: string, value: string): void {
  generationPrefsStore.set(key, value);
}

/**
 * Get all generation preferences.
 */
export function getAllGenerationPrefs(): GenerationPreference[] {
  const result: GenerationPreference[] = [];
  for (const [key, def] of Object.entries(DEFAULT_GENERATION_PREFS)) {
    result.push({
      key,
      value: generationPrefsStore.get(key) ?? def.value,
      category: def.category,
      description: def.description,
    });
  }
  return result;
}

// ─── Policy Preferences (GOVERNED) ────────────────────────────────

/**
 * Get all policy preferences.
 * These are stored in the trust_policies table (they ARE trust policies).
 */
export async function getAllPolicyPrefs(): Promise<PolicyPreference[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(trustPolicies)
    .where(eq(trustPolicies.active, true))
    .orderBy(desc(trustPolicies.updatedAt));

  return rows.map(r => ({
    id: r.id,
    key: `${r.category}_${r.riskTier}_trust${r.trustLevel}`,
    value: JSON.stringify(r.conditions),
    category: r.category,
    description: `Trust level ${r.trustLevel} for ${r.category} at ${r.riskTier} risk`,
    receiptId: r.governanceReceiptId ?? null,
    approvedAt: r.createdAt?.getTime() ?? null,
    updatedAt: r.updatedAt?.getTime() ?? Date.now(),
  }));
}

/**
 * Validate that a preference change is correctly categorized.
 * Returns true if the key is a generation preference (not governed).
 * Returns false if it's a policy preference (requires governance).
 */
export function isGenerationPreference(key: string): boolean {
  const generationKeys = new Set(Object.keys(DEFAULT_GENERATION_PREFS));
  return generationKeys.has(key);
}

/**
 * Classify a preference change request.
 * This is the enforcement boundary — ensures policy prefs can't be changed
 * without governance.
 */
export function classifyPreferenceChange(key: string): {
  type: "generation" | "policy";
  requiresGovernance: boolean;
  reason: string;
} {
  if (isGenerationPreference(key)) {
    return {
      type: "generation",
      requiresGovernance: false,
      reason: `"${key}" is a generation preference (affects proposal shaping, not execution decisions)`,
    };
  }

  return {
    type: "policy",
    requiresGovernance: true,
    reason: `"${key}" is a policy preference (affects execution decisions, requires governance approval + receipt)`,
  };
}

/**
 * Get the generation preferences as a context object for the LLM proposer.
 * This is what gets injected into proposal generation prompts.
 */
export function getProposerContext(): Record<string, string> {
  const context: Record<string, string> = {};
  for (const [key] of Object.entries(DEFAULT_GENERATION_PREFS)) {
    context[key] = getGenerationPref(key);
  }
  return context;
}
