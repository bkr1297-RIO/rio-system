/**
 * Email Action Firewall — Policy Engine + Receipt System v1
 * ──────────────────────────────────────────────────────────
 * Scans email content against configurable policy rules.
 * Every decision (BLOCK, WARN, PASS, OVERRIDE) generates a JSON receipt.
 *
 * Canonical flow:
 *   Human writes email → Firewall scans → Policy evaluates → Decision → Receipt
 *
 * Rules:
 *  - Every scan produces a receipt (no silent passes)
 *  - Receipts include: what happened, what rule triggered, when, who approved
 *  - Email body is NEVER stored — only a SHA-256 hash
 *  - Runs locally — no data leaves the system
 */

import { sha256 } from "./db";
import { invokeLLM } from "./_core/llm";
import { runCoherenceCheck, buildSystemContext, type CoherenceStatus as GovCoherenceStatus } from "./coherence";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// ─── Types ─────────────────────────────────────────────────────

export type EventType = "BLOCK" | "WARN" | "FLAG" | "PASS" | "OVERRIDE";
export type RiskCategory = "INDUCEMENT" | "THREAT" | "PII" | "COMPLIANCE" | "CONFIDENTIAL" | "INAPPROPRIATE" | "NONE";
export type ChannelType = "email" | "sms" | "slack" | "linkedin";
export type Confidence = "high" | "medium" | "low";
export type StrictnessLevel = "strict" | "standard" | "permissive";
export type RecipientType = "internal" | "external";
export type RecipientFamiliarity = "first-time" | "established";

export interface RecipientProfile {
  email: string;
  type: RecipientType;
  familiarity: RecipientFamiliarity;
  sensitive: boolean;
  /** Why this recipient is flagged sensitive (empty if not) */
  sensitiveReason: string | null;
  /** Domain extracted from email */
  domain: string;
}

// ─── Known Domains & Contacts ─────────────────────────────────
// These lists define the recipient classification baseline.
// In v2, these will be loaded from DB (configurable policy layer).

/** Domains considered "internal" — emails within these domains get lower scrutiny */
const INTERNAL_DOMAINS: Set<string> = new Set([
  "riomethod.com",
  "riomethod5.gmail.com",
]);

/** Domains/patterns flagged as sensitive — investor, legal, enterprise, regulatory */
const SENSITIVE_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\.gov$/i, reason: "Government/regulatory recipient" },
  { pattern: /\.mil$/i, reason: "Military recipient" },
  { pattern: /law|legal|attorney|counsel/i, reason: "Legal entity" },
  { pattern: /invest|capital|venture|fund/i, reason: "Investor/financial entity" },
  { pattern: /sec\.gov|finra|fdic|occ\.gov/i, reason: "Financial regulator" },
  { pattern: /hipaa|hhs\.gov|cms\.gov/i, reason: "Healthcare regulator" },
  { pattern: /fda\.gov/i, reason: "FDA" },
];

/** Set of previously contacted email addresses (loaded from receipts on first access) */
let knownContacts: Set<string> | null = null;

function loadKnownContacts(): Set<string> {
  if (knownContacts !== null) return knownContacts;
  knownContacts = new Set<string>();
  // Load from existing receipts — any "to" address we've sent to before is "established"
  try {
    const receipts = getCache();
    for (const r of receipts) {
      if (r.email_context.to) {
        knownContacts.add(r.email_context.to.toLowerCase().trim());
      }
    }
  } catch {
    // Ignore — empty set is safe default
  }
  return knownContacts;
}

/** Reset known contacts cache (for testing) */
export function _resetKnownContacts(): void {
  knownContacts = null;
}

/**
 * Classify a recipient email address.
 * Returns: internal/external, first-time/established, sensitive flags.
 */
export function classifyRecipient(email: string, customInternalDomains?: string[]): RecipientProfile {
  const normalized = email.toLowerCase().trim();
  const atIndex = normalized.indexOf("@");
  const domain = atIndex >= 0 ? normalized.slice(atIndex + 1) : normalized;

  // Internal vs external — use custom domains from policy config if provided
  const internalSet = customInternalDomains && customInternalDomains.length > 0
    ? new Set(customInternalDomains.map(d => d.toLowerCase()))
    : INTERNAL_DOMAINS;
  const type: RecipientType = internalSet.has(domain) ? "internal" : "external";

  // First-time vs established
  const contacts = loadKnownContacts();
  const familiarity: RecipientFamiliarity = contacts.has(normalized) ? "established" : "first-time";

  // Sensitive check
  let sensitive = false;
  let sensitiveReason: string | null = null;
  for (const sp of SENSITIVE_PATTERNS) {
    if (sp.pattern.test(domain)) {
      sensitive = true;
      sensitiveReason = sp.reason;
      break;
    }
  }

  return { email: normalized, type, familiarity, sensitive, sensitiveReason, domain };
}

/** Add an email to the known contacts set (called after successful send) */
export function markContactEstablished(email: string): void {
  const contacts = loadKnownContacts();
  contacts.add(email.toLowerCase().trim());
}
/**
 * Coherence block embedded in every receipt.
 * Uses the unified coherence system from server/coherence.ts.
 * Maps GREEN → COHERENT, YELLOW/RED → DRIFT.
 */
export type CoherenceStatus = "COHERENT" | "DRIFT";

export interface CoherenceBlock {
  /** Whether the outcome matched the intended policy behavior */
  status: CoherenceStatus;
  /** List of mismatches detected (empty = COHERENT) */
  issues: string[];
  /** Whether coherence was actually checked */
  checked: boolean;
  /** Source system status (from unified coherence: GREEN/YELLOW/RED) */
  source_status?: string;
}

export interface PolicyRule {
  rule_id: string;
  category: RiskCategory;
  patterns: RegExp[];
  description: string;
  /** What action to take when matched */
  action: "BLOCK" | "WARN";
  /** Minimum confidence to trigger */
  minConfidence: Confidence;
}

export interface ScanResult {
  event_type: EventType;
  matched_rules: MatchedRule[];
  confidence: Confidence;
  summary: string;
  /** Recipient classification (null if no recipient provided) */
  recipient?: RecipientProfile;
}

export interface MatchedRule {
  rule_id: string;
  category: RiskCategory;
  confidence: Confidence;
  action: "BLOCK" | "WARN";
  reason: string;
}

export interface EmailReceipt {
  receipt_id: string;
  timestamp: string;
  event_type: EventType;
  /** Channel: email, sms, slack, or linkedin */
  channel: ChannelType;
  email_context: {
    subject: string | null;
    hash: string;
    to: string | null;
    /** Recipient classification (present when recipient was provided) */
    recipient?: RecipientProfile;
  };
  policy: {
    rule_id: string;
    category: RiskCategory;
    confidence: Confidence;
  };
  decision: {
    action: EventType;
    reason: string;
  };
  human: {
    approved: boolean;
    approved_by: string | null;
    approval_text: string | null;
  };
  system: {
    engine_version: string;
    policy_mode: StrictnessLevel;
    strictness: StrictnessLevel;
  };
  /** Coherence check — did the outcome match what was intended? */
  coherence: CoherenceBlock;
  /** Intent — what the action was supposed to accomplish */
  intent?: string;
  // ─── Multi-Channel Spec v1.0 Fields ─────────────────────────
  /** Channel-specific metadata (JSON blob, structure varies by channel) */
  channel_metadata?: Record<string, unknown>;
  /** Pattern library ID (maps to rule_id for cross-channel tracking) */
  pattern_id?: string;
  /** Numeric confidence score (0.0 - 1.0) for cross-channel comparison */
  confidence_score?: number;
  /** Legal/regulatory citation (e.g. '42 USC 1395nn') */
  regulation_cite?: string;
  /** Organization domain extracted from recipient */
  org_domain?: string;
  /** Policy version identifier */
  policy_version?: string;
  /** Human-readable reason for display */
  reason_display?: string;
  /** Suggested edit for blocked/flagged content */
  suggested_edit?: string;
}

// ─── Constants ─────────────────────────────────────────────────

export const ENGINE_VERSION = "v1";

// ─── Coherence Check (unified — delegates to server/coherence.ts) ───────

/**
 * Run a coherence check on an email firewall decision.
 * Delegates to the unified coherence system (server/coherence.ts).
 * Maps the governance status (GREEN/YELLOW/RED) to receipt format (COHERENT/DRIFT).
 *
 * This is LOGGING ONLY — it does NOT block execution or modify decisions.
 */
export async function checkCoherence(
  event_type: EventType,
  matched_rules: MatchedRule[],
  strictness: StrictnessLevel,
  humanApproval?: { approved_by: string; approval_text: string },
): Promise<CoherenceBlock> {
  try {
    const context = buildSystemContext({
      activeObjective: "Email compliance — ensure outbound email aligns with policy",
      systemHealth: "Email Firewall active",
    });

    const record = await runCoherenceCheck({
      actionType: "email_firewall_scan",
      actionParameters: {
        event_type,
        matched_rule_count: matched_rules.length,
        matched_rule_ids: matched_rules.map(r => r.rule_id),
        strictness,
        has_human_approval: !!humanApproval,
      },
      proposedBy: "email-firewall-engine",
      systemContext: context,
      statedObjective: `Email scan completed with decision: ${event_type}. Strictness: ${strictness}. Rules matched: ${matched_rules.length}.`,
    });

    // Map governance status to receipt format
    const issues: string[] = record.signals
      .filter(s => s.level !== "NONE")
      .map(s => `[${s.dimension}] ${s.description}`);

    return {
      status: record.status === "GREEN" ? "COHERENT" : "DRIFT",
      issues,
      checked: true,
      source_status: record.status,
    };
  } catch (err) {
    // Coherence failure is non-blocking — degrade gracefully
    console.error("[EmailFirewall] Coherence check failed (non-blocking):", err);
    return {
      status: "COHERENT",
      issues: [],
      checked: false,
      source_status: "UNKNOWN",
    };
  }
}

// ─── Built-in Policy Rules ─────────────────────────────────────

export const DEFAULT_RULES: PolicyRule[] = [
  // ═══════════════════════════════════════════════════════════════
  // INDUCEMENT — financial incentives tied to prescribing/purchasing
  // ═══════════════════════════════════════════════════════════════
  {
    rule_id: "INDUCEMENT_001",
    category: "INDUCEMENT",
    patterns: [
      /prescri(?:be|bing).*(?:support|fund|compensat|pay|reward)/i,
      /(?:support|fund|compensat|pay|reward).*(?:prescri(?:be|bing)|clinic|practice)/i,
    ],
    description: "Direct financial inducement tied to prescribing behavior",
    action: "BLOCK",
    minConfidence: "high",
  },
  {
    rule_id: "INDUCEMENT_002",
    category: "INDUCEMENT",
    patterns: [
      /(?:probably|maybe|might)\s+(?:support|help|fund).*(?:if|when).*(?:things go|it works)/i,
      /(?:wink|😉|nudge|between us)/i,
    ],
    description: "Implied or ambiguous inducement language",
    action: "WARN",
    minConfidence: "medium",
  },
  {
    rule_id: "INDUCEMENT_003",
    category: "INDUCEMENT",
    patterns: [
      /(?:kickback|bribe|under the table|off the books)/i,
      /(?:quid pro quo|pay.?to.?play|grease.*palm)/i,
    ],
    description: "Explicit corruption or bribery language",
    action: "BLOCK",
    minConfidence: "high",
  },
  {
    rule_id: "INDUCEMENT_004",
    category: "INDUCEMENT",
    patterns: [
      /(?:gift|bonus|incentive|rebate|discount).*(?:in exchange|in return|for your|if you)/i,
      /(?:in exchange|in return|for your|if you).*(?:gift|bonus|incentive|rebate|discount)/i,
    ],
    description: "Conditional gift or incentive language",
    action: "WARN",
    minConfidence: "medium",
  },
  {
    rule_id: "INDUCEMENT_005",
    category: "INDUCEMENT",
    patterns: [
      /(?:commission|referral fee|finder'?s fee|revenue share).*(?:per|each|every)/i,
      /(?:per|each|every).*(?:commission|referral fee|finder'?s fee|revenue share)/i,
    ],
    description: "Per-unit commission or referral fee structure",
    action: "WARN",
    minConfidence: "medium",
  },

  // ═══════════════════════════════════════════════════════════════
  // THREAT — intimidation or coercion
  // ═══════════════════════════════════════════════════════════════
  {
    rule_id: "THREAT_001",
    category: "THREAT",
    patterns: [
      /(?:or else|consequences|regret|sorry you did)/i,
      /(?:we will|I will).*(?:expose|report|destroy|ruin)/i,
    ],
    description: "Threatening or coercive language",
    action: "BLOCK",
    minConfidence: "high",
  },
  {
    rule_id: "THREAT_002",
    category: "THREAT",
    patterns: [
      /(?:you'?ll|you will).*(?:pay for|suffer|lose everything)/i,
      /(?:make you|force you|compel you).*(?:comply|agree|accept)/i,
    ],
    description: "Personal threat or coercion toward compliance",
    action: "BLOCK",
    minConfidence: "high",
  },
  {
    rule_id: "THREAT_003",
    category: "THREAT",
    patterns: [
      /(?:blackmail|extort|leverage against|hold over)/i,
      /(?:unless you|if you don'?t).*(?:we go public|media|press|lawyer)/i,
      /(?:pay|send|transfer).*(?:btc|bitcoin|crypto|wallet|ransom)/i,
      /(?:release|leak|publish|expose).*(?:files|data|information|documents)/i,
    ],
    description: "Blackmail or extortion language",
    action: "BLOCK",
    minConfidence: "high",
  },
  {
    rule_id: "THREAT_004",
    category: "THREAT",
    patterns: [
      /(?:final warning|last chance|last opportunity|ultimatum)/i,
      /(?:this is your|consider this).*(?:warning|notice)/i,
    ],
    description: "Ultimatum or final warning language",
    action: "WARN",
    minConfidence: "medium",
  },

  // ═══════════════════════════════════════════════════════════════
  // CREDENTIAL PHISHING — deterministic patterns for known phishing
  // ═══════════════════════════════════════════════════════════════
  {
    rule_id: "THREAT_005",
    category: "THREAT",
    patterns: [
      /(?:confirm your login|verify your account|reset your password).*(?:immediately|right now|ASAP|urgent|now)/i,
      /(?:immediately|right now|ASAP|urgent|now).*(?:confirm your login|verify your account|reset your password)/i,
      /(?:confirm your login|verify your account|reset your password)\s*$/i,
      // Account status threat + urgency ("your account is locked/suspended/compromised")
      /(?:account (?:is |has been )?(?:locked|suspended|compromised|disabled|restricted|frozen)).*(?:click|immediately|right now|ASAP|urgent|now|act|verify|confirm)/i,
      /(?:URGENT|immediately|right now|ASAP|act now).*(?:account (?:is |has been )?(?:locked|suspended|compromised|disabled|restricted|frozen))/i,
    ],
    description: "Credential phishing: login/account/password action combined with urgency, or account-status threat with call to action",
    action: "BLOCK",
    minConfidence: "high",
  },

  // ═══════════════════════════════════════════════════════════════
  // PII — personally identifiable information
  // ═══════════════════════════════════════════════════════════════
  {
    rule_id: "PII_001",
    category: "PII",
    patterns: [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card
    ],
    description: "Social Security Number or credit card number detected",
    action: "BLOCK",
    minConfidence: "high",
  },
  {
    rule_id: "PII_002",
    category: "PII",
    patterns: [
      /\b(?:patient|diagnosis|medical record|health record|HIPAA)\b.*\b(?:name|DOB|address|SSN)\b/i,
      /\b(?:name|DOB|address|SSN)\b.*\b(?:patient|diagnosis|medical record)\b/i,
    ],
    description: "Protected health information (PHI) in email",
    action: "WARN",
    minConfidence: "medium",
  },
  {
    rule_id: "PII_003",
    category: "PII",
    patterns: [
      /\b[A-Z]{1,2}\d{6,9}\b/, // Passport number pattern
      /(?:passport|driver'?s? licen[cs]e|national id)\s*(?:#|number|no\.?)\s*\w+/i,
    ],
    description: "Government ID number (passport, driver's license)",
    action: "BLOCK",
    minConfidence: "high",
  },
  {
    rule_id: "PII_004",
    category: "PII",
    patterns: [
      /\b(?:date of birth|DOB|born on)\s*:?\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/i,
      /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b.*\b(?:born|birth|DOB)\b/i,
    ],
    description: "Date of birth with identifying context",
    action: "WARN",
    minConfidence: "medium",
  },
  {
    rule_id: "PII_005",
    category: "PII",
    patterns: [
      /(?:bank account|routing number|IBAN|SWIFT|ABA)\s*:?\s*\d+/i,
      /\b\d{8,17}\b.*(?:bank|account|routing)/i,
    ],
    description: "Bank account or routing number detected",
    action: "BLOCK",
    minConfidence: "high",
  },

  // ═══════════════════════════════════════════════════════════════
  // COMPLIANCE — regulatory risk
  // ═══════════════════════════════════════════════════════════════
  {
    rule_id: "COMPLIANCE_001",
    category: "COMPLIANCE",
    patterns: [
      /(?:don'?t tell|keep this quiet|off the record|between you and me)/i,
      /(?:delete this|destroy.*evidence|shred.*document)/i,
    ],
    description: "Language suggesting concealment or evidence destruction",
    action: "BLOCK",
    minConfidence: "high",
  },
  {
    rule_id: "COMPLIANCE_002",
    category: "COMPLIANCE",
    patterns: [
      /(?:insider|non-?public|material.*information).*(?:trade|buy|sell|stock)/i,
      /(?:trade|buy|sell|stock).*(?:insider|non-?public|material.*information)/i,
    ],
    description: "Potential insider trading language",
    action: "BLOCK",
    minConfidence: "high",
  },
  {
    rule_id: "COMPLIANCE_003",
    category: "COMPLIANCE",
    patterns: [
      /(?:anti-?trust|price fix|collu(?:de|sion)|cartel|market allocation)/i,
      /(?:agree|let'?s).*(?:set prices|divide.*market|not compete)/i,
    ],
    description: "Antitrust or price-fixing language",
    action: "BLOCK",
    minConfidence: "high",
  },
  {
    rule_id: "COMPLIANCE_004",
    category: "COMPLIANCE",
    patterns: [
      /(?:backdate|pre-?date|falsif|fabricat|forge|alter).*(?:document|record|contract|report)/i,
      /(?:document|record|contract|report).*(?:backdate|pre-?date|falsif|fabricat)/i,
    ],
    description: "Document falsification or backdating",
    action: "BLOCK",
    minConfidence: "high",
  },
  {
    rule_id: "COMPLIANCE_005",
    category: "COMPLIANCE",
    patterns: [
      /(?:money launder|structur(?:e|ing).*(?:deposit|payment|transaction))/i,
      /(?:smurfi?ng|layering|placement).*(?:funds?|cash|money)/i,
    ],
    description: "Money laundering or structuring language",
    action: "BLOCK",
    minConfidence: "high",
  },
  {
    rule_id: "COMPLIANCE_006",
    category: "COMPLIANCE",
    patterns: [
      /(?:sanction(?:ed|s)?|embargo|OFAC|SDN list|blocked (?:person|entity))/i,
      /(?:export control|ITAR|EAR|dual.?use)/i,
    ],
    description: "Sanctions, embargo, or export control reference",
    action: "WARN",
    minConfidence: "medium",
  },

  // ═══════════════════════════════════════════════════════════════
  // CONFIDENTIAL — leaking sensitive info
  // ═══════════════════════════════════════════════════════════════
  {
    rule_id: "CONFIDENTIAL_001",
    category: "CONFIDENTIAL",
    patterns: [
      /(?:confidential|proprietary|trade secret|NDA).*(?:attach|forward|share|send)/i,
      /(?:attach|forward|share|send).*(?:confidential|proprietary|trade secret)/i,
    ],
    description: "Attempting to share confidential or NDA-protected information",
    action: "WARN",
    minConfidence: "medium",
  },
  {
    rule_id: "CONFIDENTIAL_002",
    category: "CONFIDENTIAL",
    patterns: [
      /(?:internal only|do not distribute|not for external|eyes only)/i,
      /(?:restricted|classified|secret).*(?:document|information|data|file)/i,
    ],
    description: "Internal-only or restricted information being shared externally",
    action: "WARN",
    minConfidence: "medium",
  },
  {
    rule_id: "CONFIDENTIAL_003",
    category: "CONFIDENTIAL",
    patterns: [
      /(?:source code|algorithm|architecture|schema|database).*(?:attach|share|send|forward)/i,
      /(?:API key|secret key|private key|password|credential|token).*(?:is|here|attached|below)/i,
    ],
    description: "Technical secrets or credentials being shared",
    action: "BLOCK",
    minConfidence: "high",
  },
  {
    rule_id: "CONFIDENTIAL_004",
    category: "CONFIDENTIAL",
    patterns: [
      /(?:board meeting|board minutes|executive session|M&A|acquisition|merger)/i,
      /(?:pre-?announcement|material non-?public|embargoed)/i,
    ],
    description: "Board-level or pre-announcement confidential information",
    action: "WARN",
    minConfidence: "medium",
  },

  // ═══════════════════════════════════════════════════════════════
  // INAPPROPRIATE — discriminatory, harassing, or offensive
  // ═══════════════════════════════════════════════════════════════
  {
    rule_id: "INAPPROPRIATE_001",
    category: "INAPPROPRIATE",
    patterns: [
      /(?:you people|those people|your kind|their kind)/i,
      /(?:don'?t belong|go back to|not welcome here)/i,
    ],
    description: "Discriminatory or exclusionary language",
    action: "BLOCK",
    minConfidence: "high",
  },
  {
    rule_id: "INAPPROPRIATE_002",
    category: "INAPPROPRIATE",
    patterns: [
      /(?:harass|bully|intimidat|humiliat|demean|degrad)/i,
      /(?:hostile work|toxic|abusive).*(?:environment|behavior|conduct)/i,
    ],
    description: "Harassment or hostile conduct language",
    action: "WARN",
    minConfidence: "medium",
  },
  {
    rule_id: "INAPPROPRIATE_003",
    category: "INAPPROPRIATE",
    patterns: [
      /(?:sexual|romantic|attractive|hot|sexy).*(?:colleague|coworker|employee|subordinate)/i,
      /(?:colleague|coworker|employee|subordinate).*(?:sexual|romantic|attractive|hot|sexy)/i,
    ],
    description: "Inappropriate sexual or romantic reference to colleague",
    action: "BLOCK",
    minConfidence: "high",
  },

  // ═══════════════════════════════════════════════════════════════
  // COMMITMENT — promises, guarantees, binding language
  // ═══════════════════════════════════════════════════════════════
  {
    rule_id: "COMMITMENT_001",
    category: "COMPLIANCE",
    patterns: [
      /(?:I|we)\s+(?:guarantee|promise|assure|warrant|certify)\s+(?:that|you|this|delivery)/i,
      /(?:guaranteed|promised|assured|warranted)\s+(?:delivery|results?|performance|outcome)/i,
    ],
    description: "Binding guarantee or warranty language",
    action: "WARN",
    minConfidence: "medium",
  },
  {
    rule_id: "COMMITMENT_002",
    category: "COMPLIANCE",
    patterns: [
      /(?:deliver(?:y|ed)?|complet(?:e|ed|ion))\s+(?:by|before|no later than)\s+\w+\s+\d/i,
      /(?:deadline|due date|target date)\s*(?:is|:)\s*\w+\s+\d/i,
    ],
    description: "Specific delivery date commitment",
    action: "WARN",
    minConfidence: "low",
  },
  {
    rule_id: "COMMITMENT_003",
    category: "COMPLIANCE",
    patterns: [
      /(?:price|cost|fee|rate)\s+(?:of|is|will be|quoted at)\s*\$[\d,.]+/i,
      /\$[\d,.]+\s*(?:per|each|total|flat|fixed)/i,
    ],
    description: "Pricing commitment or quote in email",
    action: "WARN",
    minConfidence: "low",
  },

  // ═══════════════════════════════════════════════════════════════
  // URGENCY — pressure language that may bypass review
  // ═══════════════════════════════════════════════════════════════
  {
    rule_id: "URGENCY_001",
    category: "COMPLIANCE",
    patterns: [
      /(?:immediately|right now|ASAP|urgent|time.?sensitive|act now)/i,
      /(?:don'?t delay|can'?t wait|must respond|respond immediately)/i,
    ],
    description: "High-pressure urgency language that may bypass review",
    action: "WARN",
    minConfidence: "low",
  },
  {
    rule_id: "URGENCY_002",
    category: "COMPLIANCE",
    patterns: [
      /(?:last chance|final offer|expires today|limited time|act before)/i,
      /(?:offer expires|window closing|once in a lifetime|now or never)/i,
    ],
    description: "Artificial scarcity or deadline pressure",
    action: "WARN",
    minConfidence: "medium",
  },

  // ═══════════════════════════════════════════════════════════════
  // FINANCIAL/LEGAL — dollar amounts, contracts, liability
  // ═══════════════════════════════════════════════════════════════
  {
    rule_id: "FINANCIAL_001",
    category: "COMPLIANCE",
    patterns: [
      /\$\s*(?:\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:million|billion|M|B|k|K)/i,
      /(?:million|billion)\s+dollars/i,
    ],
    description: "Large dollar amount mentioned — verify authorization",
    action: "WARN",
    minConfidence: "low",
  },
  {
    rule_id: "FINANCIAL_002",
    category: "COMPLIANCE",
    patterns: [
      /(?:sign(?:ed|ing)?|execut(?:e|ed|ing))\s+(?:the|this|a)\s+(?:contract|agreement|NDA|MOU|LOI)/i,
      /(?:contract|agreement|NDA|MOU|LOI)\s+(?:is )?(?:attached|enclosed|ready for signature)/i,
    ],
    description: "Contract or legal agreement reference",
    action: "WARN",
    minConfidence: "medium",
  },
  {
    rule_id: "FINANCIAL_003",
    category: "COMPLIANCE",
    patterns: [
      /(?:liabilit|indemnif|hold harmless|waiv(?:e|er)|disclaim)/i,
      /(?:limitation of|cap on|maximum)\s+(?:liability|damages|exposure)/i,
    ],
    description: "Liability, indemnification, or waiver language",
    action: "WARN",
    minConfidence: "medium",
  },
  {
    rule_id: "FINANCIAL_004",
    category: "COMPLIANCE",
    patterns: [
      /(?:wire transfer|ACH|bank transfer|remittance).*(?:to|into|account)/i,
      /(?:payment instructions|wiring instructions|bank details)/i,
    ],
    description: "Wire transfer or payment instructions — high fraud risk",
    action: "BLOCK",
    minConfidence: "high",
  },

  // ═══════════════════════════════════════════════════════════════
  // TIMING — unusual patterns that suggest bypass
  // ═══════════════════════════════════════════════════════════════
  {
    rule_id: "TIMING_001",
    category: "COMPLIANCE",
    patterns: [
      /(?:before (?:anyone|they|management|compliance) (?:finds out|notices|sees|knows))/i,
      /(?:while (?:they'?re|he'?s|she'?s) (?:away|out|on vacation|not looking))/i,
    ],
    description: "Timing language suggesting evasion of oversight",
    action: "BLOCK",
    minConfidence: "high",
  },
  {
    rule_id: "TIMING_002",
    category: "COMPLIANCE",
    patterns: [
      /(?:rush this through|skip (?:the )?review|bypass (?:the )?approval|fast.?track.*without)/i,
      /(?:no time for|don'?t bother with|skip)\s+(?:review|approval|compliance|legal)/i,
    ],
    description: "Language suggesting bypassing review or approval processes",
    action: "BLOCK",
    minConfidence: "high",
  },

  // ═══════════════════════════════════════════════════════════════
  // SCOPE CREEP — expanding beyond original intent
  // ═══════════════════════════════════════════════════════════════
  {
    rule_id: "SCOPE_001",
    category: "COMPLIANCE",
    patterns: [
      /(?:while we'?re at it|also|additionally|by the way|BTW).*(?:could you|can you|let'?s also|we should also)/i,
      /(?:one more thing|oh and|PS:?|P\.S\.?).*(?:send|forward|share|include|add)/i,
    ],
    description: "Scope expansion — additional requests appended to original intent",
    action: "WARN",
    minConfidence: "low",
  },
  {
    rule_id: "SCOPE_002",
    category: "COMPLIANCE",
    patterns: [
      /(?:CC|BCC|copy|loop in|add).*(?:everyone|all|the team|whole|entire|group)/i,
      /(?:forward this to|share with|distribute to).*(?:everyone|all|the team|whole)/i,
    ],
    description: "Broad distribution — adding many recipients beyond original scope",
    action: "WARN",
    minConfidence: "medium",
  },

  // ═══════════════════════════════════════════════════════════════
  // RELATIONSHIP CONTEXT — tone and formality mismatches
  // ═══════════════════════════════════════════════════════════════
  {
    rule_id: "RELATIONSHIP_001",
    category: "INAPPROPRIATE",
    patterns: [
      /(?:hey bro|dude|buddy|pal|mate|fam).*(?:deal|contract|agreement|proposal|offer)/i,
      /(?:deal|contract|agreement|proposal|offer).*(?:hey bro|dude|buddy|pal|mate)/i,
    ],
    description: "Overly informal language in business context",
    action: "WARN",
    minConfidence: "low",
  },
  {
    rule_id: "RELATIONSHIP_002",
    category: "INAPPROPRIATE",
    patterns: [
      /(?:love you|miss you|can'?t stop thinking|dinner tonight|drinks after)/i,
      /(?:personal|private).*(?:meeting|conversation|chat|call).*(?:just us|alone|private)/i,
    ],
    description: "Personal or romantic language in professional email",
    action: "WARN",
    minConfidence: "medium",
  },
];

// ─── Policy Engine ─────────────────────────────────────────────

/**
 * Scan email content against policy rules.
 * Returns matched rules sorted by severity (BLOCK before WARN).
 */
/**
 * Configurable policy config loaded from DB.
 * When provided, rules can be individually enabled/disabled
 * and categories can have per-category strictness overrides.
 */
export interface FirewallPolicyConfig {
  ruleOverrides?: Record<string, { enabled: boolean }>;
  categoryOverrides?: Record<string, string>;
  internalDomains?: string[];
  llmEnabled?: boolean;
  /** MVP mode: use only the three-condition rule from the April 12th Frozen Spec.
   *  When true, all other rules are bypassed. Default: true. */
  mvpMode?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// MVP RULE — April 12th Frozen Build Spec
// ═══════════════════════════════════════════════════════════════
//
// IF sender is unknown
// AND message contains urgency language
// AND message requests a consequential action
//     (money / identity / credentials / data / system access)
//
// THEN: Block. Log. Do not interrupt the user.
//
// Everything else passes through.
// ═══════════════════════════════════════════════════════════════

/** Urgency language patterns */
const MVP_URGENCY_PATTERNS: RegExp[] = [
  /\b(?:urgent|urgently|URGENT)\b/i,
  /\b(?:immediately|right now|right away|ASAP|act now|act fast)\b/i,
  /\b(?:last chance|final warning|final notice|last opportunity|ultimatum)\b/i,
  /\b(?:don'?t delay|time is running out|expires? (?:today|soon|now)|limited time)\b/i,
  /\b(?:must (?:act|respond|reply|confirm|verify) (?:now|immediately|today))\b/i,
  /\b(?:within \d+ (?:hour|minute|hr|min)s?)\b/i,
  /\b(?:before it'?s too late|or you will lose|or your account)\b/i,
];

/** Consequential action patterns — money, identity, credentials, data, system access */
const MVP_CONSEQUENTIAL_PATTERNS: RegExp[] = [
  // Money / financial
  /\b(?:send money|wire transfer|bank transfer|payment|pay (?:now|us|me)|transfer funds)\b/i,
  /\b(?:gift card|bitcoin|crypto|wallet address|routing number|bank account)\b/i,
  /\b(?:invoice|billing|outstanding balance|overdue payment)\b/i,
  // Identity / credentials
  /\b(?:confirm your (?:login|identity|account|password|email|phone))\b/i,
  /\b(?:verify your (?:account|identity|credentials|information|details))\b/i,
  /\b(?:reset your (?:password|credentials|PIN|security))\b/i,
  /\b(?:update your (?:payment|billing|account|security) (?:info|information|details))\b/i,
  /\b(?:enter your (?:SSN|social security|credit card|password|PIN))\b/i,
  // Data / access
  /\b(?:click (?:here|this link|below|the link))\b/i,
  /\b(?:download (?:the|this) (?:file|attachment|document))\b/i,
  /\b(?:provide (?:your|the) (?:credentials|login|access|password))\b/i,
  /\b(?:grant (?:access|permission|authorization))\b/i,
  /\b(?:account (?:is |has been )?(?:locked|suspended|compromised|disabled|restricted|frozen))\b/i,
  /\b(?:unauthorized (?:access|activity|transaction|login))\b/i,
  /\b(?:security (?:alert|breach|incident|warning))\b/i,
];

/**
 * MVP Rule — the single three-condition trigger from the April 12th Frozen Spec.
 *
 * Returns a MatchedRule if ALL THREE conditions are met, null otherwise.
 * Sender is classified as "unknown" if:
 *   - No recipient profile provided (inbound message with no known sender), OR
 *   - Recipient is external AND first-time contact
 *
 * For inbound messages (Telegram, API), sender is always treated as unknown
 * unless explicitly classified.
 */
export function mvpRule(
  text: string,
  senderKnown: boolean,
): MatchedRule | null {
  // Condition 1: Sender is unknown
  if (senderKnown) return null;

  // Condition 2: Urgency language
  const hasUrgency = MVP_URGENCY_PATTERNS.some(p => p.test(text));
  if (!hasUrgency) return null;

  // Condition 3: Consequential action request
  const consequentialMatch = MVP_CONSEQUENTIAL_PATTERNS.find(p => p.test(text));
  if (!consequentialMatch) return null;

  // All three conditions met → BLOCK
  return {
    rule_id: "MVP_001",
    category: "THREAT" as RiskCategory,
    confidence: "high" as Confidence,
    action: "BLOCK",
    reason: "Unknown sender + urgency language + consequential action request. Blocked per MVP policy.",
  };
}

export function scanWithRules(
  emailBody: string,
  subject: string | null,
  strictness: StrictnessLevel = "standard",
  policyConfig?: FirewallPolicyConfig,
): MatchedRule[] {
  const fullText = [subject || "", emailBody].join(" ");
  const matches: MatchedRule[] = [];

  for (const rule of DEFAULT_RULES) {
    // Check if rule is disabled by policy config
    if (policyConfig?.ruleOverrides?.[rule.rule_id]?.enabled === false) continue;

    // Determine effective strictness: category override > global
    const effectiveStrictness = (policyConfig?.categoryOverrides?.[rule.category] as StrictnessLevel) || strictness;

    // In permissive mode, skip WARN rules
    if (effectiveStrictness === "permissive" && rule.action === "WARN") continue;

    for (const pattern of rule.patterns) {
      if (pattern.test(fullText)) {
        matches.push({
          rule_id: rule.rule_id,
          category: rule.category,
          confidence: rule.minConfidence,
          action: rule.action,
          reason: rule.description,
        });
        break; // One match per rule is enough
      }
    }
  }

  // In strict mode, upgrade WARNs to BLOCKs
  if (strictness === "strict") {
    for (const m of matches) {
      if (m.action === "WARN") m.action = "BLOCK";
    }
  }

  // Sort: BLOCK first, then WARN
  matches.sort((a, b) => (a.action === "BLOCK" ? -1 : 1) - (b.action === "BLOCK" ? -1 : 1));

  return matches;
}

/**
 * Enhanced scan using LLM for nuanced detection.
 * Falls back to rule-based scan if LLM is unavailable.
 */
export async function scanWithLLM(
  emailBody: string,
  subject: string | null,
  strictness: StrictnessLevel = "standard",
  policyConfig?: FirewallPolicyConfig,
): Promise<{ matches: MatchedRule[]; llmUsed: boolean }> {
  // Always run rule-based first
  const ruleMatches = scanWithRules(emailBody, subject, strictness, policyConfig);

  // If LLM is disabled by policy config, skip LLM
  if (policyConfig?.llmEnabled === false) {
    return { matches: ruleMatches, llmUsed: false };
  }

  // Try LLM for additional nuance
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a compliance email scanner. Analyze the email for these risk categories:
- INDUCEMENT: Financial incentives tied to prescribing, purchasing, or business decisions
- THREAT: Intimidation, coercion, or threatening language
- PII: Personally identifiable information (SSN, credit cards, health records)
- COMPLIANCE: Regulatory violations, evidence destruction, insider trading
- CONFIDENTIAL: Leaking NDA-protected or proprietary information
- INAPPROPRIATE: Discriminatory, harassing, or offensive content

Strictness mode: ${strictness}
${strictness === "strict" ? "Flag anything remotely suspicious." : ""}
${strictness === "permissive" ? "Only flag clear, unambiguous violations." : ""}

Return JSON: { "findings": [{ "category": string, "confidence": "high"|"medium"|"low", "action": "BLOCK"|"WARN", "reason": string }] }
If no issues found, return: { "findings": [] }`,
        },
        {
          role: "user",
          content: `Subject: ${subject || "(none)"}\n\nBody:\n${emailBody}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices?.[0]?.message?.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}");
    const findings = Array.isArray(parsed.findings) ? parsed.findings : [];

    // Merge LLM findings with rule matches (deduplicate by category)
    const seenCategories = new Set(ruleMatches.map(m => m.category));
    let ruleCounter = 100;

    for (const f of findings) {
      if (!seenCategories.has(f.category)) {
        ruleMatches.push({
          rule_id: `LLM_${String(f.category || "UNKNOWN").toUpperCase()}_${ruleCounter++}`,
          category: f.category || "COMPLIANCE",
          confidence: f.confidence || "medium",
          action: strictness === "strict" ? "BLOCK" : (f.action || "WARN"),
          reason: f.reason || "LLM-detected risk",
        });
        seenCategories.add(f.category);
      }
    }

    return { matches: ruleMatches, llmUsed: true };
  } catch {
    // LLM unavailable — rule-based results are sufficient
    return { matches: ruleMatches, llmUsed: false };
  }
}

/**
 * Full scan pipeline: rules + optional LLM → decision → receipt
 */
export async function scanEmail(
  emailBody: string,
  subject: string | null,
  to: string | null,
  strictness: StrictnessLevel = "standard",
  useLLM: boolean = true,
  policyConfig?: FirewallPolicyConfig,
  channel: ChannelType = "email",
): Promise<{ result: ScanResult; receipt: EmailReceipt }> {
  // Use internal domains from policy config for recipient classification
  const recipientProfile = to ? classifyRecipient(to, policyConfig?.internalDomains) : undefined;

  // ═══════════════════════════════════════════════════════════════
  // MVP MODE (default: ON)
  // Only the three-condition AND rule runs. Everything else passes.
  // Set policyConfig.mvpMode = false to use the full v2 rule engine.
  // ═══════════════════════════════════════════════════════════════
  const isMvpMode = policyConfig?.mvpMode !== false; // default ON

  let matches: MatchedRule[];

  if (isMvpMode) {
    // In MVP mode, determine if sender is known.
    // For inbound (no recipient profile or external first-time) → unknown.
    // For outbound to internal domain → known.
    // For outbound to established external contact → known.
    const senderKnown = recipientProfile
      ? (recipientProfile.type === "internal" || recipientProfile.familiarity === "established")
      : false; // no sender info → treat as unknown

    const fullText = [subject || "", emailBody].join(" ");
    const mvpMatch = mvpRule(fullText, senderKnown);
    matches = mvpMatch ? [mvpMatch] : [];
  } else {
    // ─── V2 FULL RULE ENGINE (preserved, bypassed in MVP mode) ───
    const effectiveLLM = useLLM && policyConfig?.llmEnabled !== false;
    const scanResult = effectiveLLM
      ? await scanWithLLM(emailBody, subject, strictness, policyConfig)
      : { matches: scanWithRules(emailBody, subject, strictness, policyConfig), llmUsed: false };
    matches = scanResult.matches;

    // Add recipient-based rules (v2 only)
    if (recipientProfile) {
      // First-time external contact → WARN
      if (recipientProfile.type === "external" && recipientProfile.familiarity === "first-time") {
        matches.push({
          rule_id: "RECIPIENT_001",
          category: "COMPLIANCE" as RiskCategory,
          confidence: "medium" as Confidence,
          action: strictness === "strict" ? "BLOCK" : "WARN",
          reason: `First-time external contact: ${recipientProfile.email}. Verify recipient before sending.`,
        });
      }
      // Sensitive recipient → WARN (or BLOCK in strict)
      if (recipientProfile.sensitive) {
        matches.push({
          rule_id: "RECIPIENT_002",
          category: "COMPLIANCE" as RiskCategory,
          confidence: "high" as Confidence,
          action: strictness === "permissive" ? "WARN" : "BLOCK",
          reason: `Sensitive recipient: ${recipientProfile.sensitiveReason}. Requires explicit authorization.`,
        });
      }
    }
  }

  // Determine event type (includes FLAG for medium-confidence WARN matches)
  // THREAT category gets slight weight boost: medium-confidence THREAT warnings
  // escalate to WARN (not just FLAG) to reflect higher inherent risk.
  let event_type: EventType;
  if (matches.some(m => m.action === "BLOCK")) {
    event_type = "BLOCK";
  } else if (matches.some(m => m.action === "WARN")) {
    // Escalation: high-confidence WARN → WARN, OR medium-confidence THREAT → WARN
    const hasHighConfidenceWarn = matches.some(m => m.action === "WARN" && m.confidence === "high");
    const hasMediumThreatWarn = matches.some(m => m.action === "WARN" && m.category === "THREAT" && m.confidence === "medium");
    event_type = (hasHighConfidenceWarn || hasMediumThreatWarn) ? "WARN" : "FLAG";
  } else {
    event_type = "PASS";
  }

  // Build summary
  const summary = matches.length === 0
    ? "No policy violations detected. Message cleared."
    : matches.map(m => `[${m.action}] ${m.category}: ${m.reason}`).join("; ");

  // Determine highest-confidence match for receipt
  const topMatch = matches[0] || {
    rule_id: "NONE",
    category: "NONE" as RiskCategory,
    confidence: "low" as Confidence,
  };

  const result: ScanResult = {
    event_type,
    matched_rules: matches,
    confidence: topMatch.confidence,
    summary,
    recipient: recipientProfile,
  };

  // Run coherence check (logging only — does NOT modify decision)
  const coherence = await checkCoherence(event_type, matches, strictness);

  // Generate receipt (now includes coherence block + recipient profile + channel)
  const receipt = generateEmailReceipt(
    event_type,
    emailBody,
    subject,
    to,
    topMatch,
    summary,
    strictness,
    undefined, // humanApproval
    coherence,
    recipientProfile,
    channel,
  );

  return { result, receipt };
}

// ─── Receipt Generation ────────────────────────────────────────

/**
 * Generate a JSON receipt for an email decision.
 * Email body is NEVER stored — only a SHA-256 hash.
 */
/** Map string confidence to numeric score (0.0-1.0) */
export function confidenceToScore(c: Confidence): number {
  switch (c) {
    case "high": return 0.9;
    case "medium": return 0.6;
    case "low": return 0.3;
  }
}

export function generateEmailReceipt(
  event_type: EventType,
  emailBody: string,
  subject: string | null,
  to: string | null,
  topRule: { rule_id: string; category: RiskCategory; confidence: Confidence },
  reason: string,
  strictness: StrictnessLevel,
  humanApproval?: { approved_by: string; approval_text: string },
  coherence?: CoherenceBlock,
  recipientProfile?: RecipientProfile,
  channel: ChannelType = "email",
  intent?: string,
  channelMetadata?: Record<string, unknown>,
): EmailReceipt {
  const receiptId = crypto.randomUUID();
  const bodyHash = sha256(emailBody);

  return {
    receipt_id: receiptId,
    timestamp: new Date().toISOString(),
    event_type,
    channel,
    email_context: {
      subject: subject || null,
      hash: bodyHash,
      to: to || null,
      recipient: recipientProfile,
    },
    policy: {
      rule_id: topRule.rule_id,
      category: topRule.category,
      confidence: topRule.confidence,
    },
    decision: {
      action: event_type,
      reason,
    },
    human: {
      approved: event_type === "OVERRIDE" || (humanApproval !== undefined),
      approved_by: humanApproval?.approved_by || null,
      approval_text: humanApproval?.approval_text || null,
    },
    system: {
      engine_version: ENGINE_VERSION,
      policy_mode: strictness,
      strictness,
    },
    coherence: coherence || { status: "COHERENT" as CoherenceStatus, issues: [], checked: false },
    ...(intent ? { intent } : {}),
    // Multi-Channel Spec v1.0 fields
    channel_metadata: channelMetadata || buildDefaultChannelMetadata(channel, subject, to),
    pattern_id: topRule.rule_id,
    confidence_score: confidenceToScore(topRule.confidence),
    regulation_cite: undefined, // populated by rule-specific data in future
    org_domain: recipientProfile?.domain || extractDomain(to),
    policy_version: `${ENGINE_VERSION}-${strictness}`,
    reason_display: buildReasonDisplay(event_type, reason),
    suggested_edit: event_type === "BLOCK" || event_type === "FLAG" ? buildSuggestedEdit(reason) : undefined,
  };
}

// ─── Multi-Channel Helpers ────────────────────────────────────

/** Build default channel_metadata based on channel type */
function buildDefaultChannelMetadata(
  channel: ChannelType,
  subject: string | null,
  to: string | null,
): Record<string, unknown> {
  switch (channel) {
    case "email":
      return {
        client: "rio-firewall",
        from: null,
        to: to ? [to] : [],
        cc: [],
        subject: subject || null,
        thread_id: null,
      };
    case "sms":
      return {
        platform: "unknown",
        recipient: to || null,
        recipient_name: null,
        message_type: "outbound",
      };
    case "slack":
      return {
        workspace_id: null,
        workspace_name: null,
        channel_id: null,
        channel_name: null,
        channel_type: "dm",
      };
    case "linkedin":
      return {
        recipient_profile: to || null,
        recipient_name: null,
        conversation_type: "message",
        connection_degree: null,
      };
  }
}

/** Extract domain from an email address or identifier */
function extractDomain(identifier: string | null): string | undefined {
  if (!identifier) return undefined;
  const atIndex = identifier.indexOf("@");
  return atIndex >= 0 ? identifier.slice(atIndex + 1).toLowerCase() : undefined;
}

/** Build human-readable reason_display from event type and raw reason */
function buildReasonDisplay(event_type: EventType, reason: string): string {
  switch (event_type) {
    case "BLOCK":
      return `Message blocked: ${reason.replace(/^\[BLOCK\]\s*/i, "").slice(0, 200)}`;
    case "WARN":
      return `Warning: ${reason.replace(/^\[WARN\]\s*/i, "").slice(0, 200)}`;
    case "FLAG":
      return `Flagged for review: ${reason.replace(/^\[WARN\]\s*/i, "").slice(0, 200)}`;
    case "PASS":
      return "Message cleared — no policy violations detected.";
    case "OVERRIDE":
      return `Override approved: ${reason.slice(0, 200)}`;
  }
}

/** Build a suggested edit hint for blocked/flagged content */
function buildSuggestedEdit(reason: string): string {
  // Simple heuristic — in v2 this could use LLM
  if (/inducement/i.test(reason)) return "Remove language linking financial incentives to actions.";
  if (/threat/i.test(reason)) return "Rephrase to remove threatening or coercive language.";
  if (/pii/i.test(reason)) return "Remove personally identifiable information before sending.";
  if (/confidential/i.test(reason)) return "Remove confidential or proprietary information.";
  if (/inappropriate/i.test(reason)) return "Rephrase to maintain professional tone.";
  if (/compliance/i.test(reason)) return "Review for regulatory compliance before sending.";
  return "Review and revise flagged content before sending.";
}

// ─── File-Based Receipt Store ─────────────────────────────────
// Receipts persist to /receipts/ directory as individual JSON files.
// Survives server restarts. In-memory cache for fast reads.

const RECEIPTS_DIR = path.join(process.cwd(), "receipts");

// Ensure receipts directory exists
function ensureReceiptsDir(): void {
  if (!fs.existsSync(RECEIPTS_DIR)) {
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  }
}

// In-memory cache (loaded from disk on first access)
let receiptCache: EmailReceipt[] | null = null;

function loadReceiptsFromDisk(): EmailReceipt[] {
  ensureReceiptsDir();
  try {
    const files = fs.readdirSync(RECEIPTS_DIR)
      .filter(f => f.endsWith(".json"))
      .sort(); // Sorted by filename (timestamp-based)
    const receipts: EmailReceipt[] = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(RECEIPTS_DIR, file), "utf-8");
        receipts.push(JSON.parse(content) as EmailReceipt);
      } catch {
        // Skip corrupt files
        console.warn(`[ReceiptStore] Skipping corrupt receipt file: ${file}`);
      }
    }
    return receipts;
  } catch {
    return [];
  }
}

function getCache(): EmailReceipt[] {
  if (receiptCache === null) {
    receiptCache = loadReceiptsFromDisk();
  }
  return receiptCache;
}

/** Reset the in-memory cache (for testing) */
export function _resetReceiptCache(): void {
  receiptCache = null;
}

/**
 * Reset ALL caches for testing — receipt cache becomes empty (not reloaded from disk),
 * known contacts becomes empty. Use this in test beforeEach to ensure a clean slate
 * unaffected by on-disk receipt files from previous runs.
 */
export function _resetForTesting(): void {
  receiptCache = []; // empty array, not null — prevents disk reload
  knownContacts = new Set<string>(); // empty set, not null — prevents disk reload
}

export function storeReceipt(receipt: EmailReceipt): void {
  ensureReceiptsDir();
  // Write to disk — filename is timestamp + receipt_id for ordering
  const ts = receipt.timestamp.replace(/[:.]/g, "-");
  const filename = `${ts}_${receipt.receipt_id}.json`;
  const filepath = path.join(RECEIPTS_DIR, filename);
  try {
    fs.writeFileSync(filepath, JSON.stringify(receipt, null, 2), "utf-8");
  } catch (err) {
    console.error(`[ReceiptStore] Failed to write receipt ${receipt.receipt_id}:`, err);
  }
  // Update in-memory cache
  const cache = getCache();
  cache.push(receipt);
  // Keep cache bounded (last 1000)
  if (cache.length > 1000) {
    cache.shift();
  }
}

export function getReceipts(limit: number = 50): EmailReceipt[] {
  const cache = getCache();
  return cache.slice(-limit).reverse();
}

export function getReceiptById(receiptId: string): EmailReceipt | null {
  const cache = getCache();
  return cache.find(r => r.receipt_id === receiptId) || null;
}

export function getReceiptStats(): {
  total: number;
  blocked: number;
  warned: number;
  flagged: number;
  passed: number;
  overridden: number;
} {
  const cache = getCache();
  return {
    total: cache.length,
    blocked: cache.filter(r => r.event_type === "BLOCK").length,
    warned: cache.filter(r => r.event_type === "WARN").length,
    flagged: cache.filter(r => r.event_type === "FLAG").length,
    passed: cache.filter(r => r.event_type === "PASS").length,
    overridden: cache.filter(r => r.event_type === "OVERRIDE").length,
  };
}

// ─── Sample Receipts (for demo) ────────────────────────────────

export function generateSampleReceipts(): EmailReceipt[] {
  const samples: EmailReceipt[] = [
    generateEmailReceipt(
      "BLOCK",
      "If you prescribe our product, we can support your clinic financially.",
      "Partnership Opportunity",
      "dr.smith@clinic.com",
      { rule_id: "INDUCEMENT_001", category: "INDUCEMENT", confidence: "high" },
      "[BLOCK] INDUCEMENT: Direct financial inducement tied to prescribing behavior",
      "standard",
      undefined,
      { status: "COHERENT", issues: [], checked: true },
    ),
    generateEmailReceipt(
      "WARN",
      "We can probably support your team if things go well \uD83D\uDE09",
      "Quick thought",
      "partner@company.com",
      { rule_id: "INDUCEMENT_002", category: "INDUCEMENT", confidence: "medium" },
      "[WARN] INDUCEMENT: Implied or ambiguous inducement language",
      "standard",
      undefined,
      { status: "COHERENT", issues: [], checked: true },
    ),
    generateEmailReceipt(
      "PASS",
      "Please find attached the quarterly report for Q1 2026. Let me know if you have any questions.",
      "Q1 Report",
      "team@company.com",
      { rule_id: "NONE", category: "NONE", confidence: "low" },
      "No policy violations detected. Email cleared for sending.",
      "standard",
      undefined,
      { status: "COHERENT", issues: [], checked: true },
    ),
    generateEmailReceipt(
      "OVERRIDE",
      "Between you and me, we should keep this arrangement quiet.",
      "Re: Arrangement",
      "contact@partner.com",
      { rule_id: "COMPLIANCE_001", category: "COMPLIANCE", confidence: "high" },
      "[BLOCK] COMPLIANCE: Language suggesting concealment or evidence destruction — OVERRIDDEN by user",
      "standard",
      { approved_by: "brian.rasmussen", approval_text: "Approved — context is informal, not compliance risk" },
      { status: "COHERENT", issues: [], checked: true },
    ),
  ];

  return samples;
}

// ─── Inbound Message Adapter ──────────────────────────────────
// Reuses the email firewall engine for inbound text messages (SMS).
// Same scan → policy → decision → receipt → coherence pipeline.

export type MessageRouting = "quarantine" | "review" | "pass";

export interface InboundMessageResult {
  routing: MessageRouting;
  result: ScanResult;
  receipt: EmailReceipt;
}

/**
 * Process an inbound text message through the firewall.
 * Reuses scanEmail() — treats message text as email body, sender as "to" field.
 * Routes: BLOCK → quarantine, WARN → review, PASS → pass.
 */
export async function processIncomingMessage(
  text: string,
  sender: string,
  strictness: StrictnessLevel = "standard",
  useLLM: boolean = false,
  policyConfig?: FirewallPolicyConfig,
): Promise<InboundMessageResult> {
  // Reuse scanEmail with channel = "sms"
  // subject = null (SMS has no subject), to = sender (who sent it)
  const { result, receipt } = await scanEmail(
    text,
    null, // no subject for SMS
    sender,
    strictness,
    useLLM,
    policyConfig,
    "sms",
  );

  // Route based on decision
  let routing: MessageRouting;
  if (result.event_type === "BLOCK") {
    routing = "quarantine";
  } else if (result.event_type === "WARN" || result.event_type === "FLAG") {
    routing = "review";
  } else {
    routing = "pass";
  }

  return { routing, result, receipt };
}

/**
 * Get receipts filtered by channel.
 */
export function getReceiptsByChannel(channel: ChannelType, limit: number = 50): EmailReceipt[] {
  const cache = getCache();
  return cache.filter(r => r.channel === channel).slice(-limit).reverse();
}

/**
 * Get inbound message receipts grouped by routing category.
 */
export function getInboundMessageStats(): {
  quarantine: EmailReceipt[];
  review: EmailReceipt[];
  pass: EmailReceipt[];
} {
  const smsReceipts = getCache().filter(r => r.channel === "sms");
  return {
    quarantine: smsReceipts.filter(r => r.event_type === "BLOCK").reverse(),
    review: smsReceipts.filter(r => r.event_type === "WARN" || r.event_type === "FLAG").reverse(),
    pass: smsReceipts.filter(r => r.event_type === "PASS").reverse(),
  };
}
