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
import * as crypto from "crypto";

// ─── Types ─────────────────────────────────────────────────────

export type EventType = "BLOCK" | "WARN" | "PASS" | "OVERRIDE";
export type RiskCategory = "INDUCEMENT" | "THREAT" | "PII" | "COMPLIANCE" | "CONFIDENTIAL" | "INAPPROPRIATE" | "NONE";
export type Confidence = "high" | "medium" | "low";
export type StrictnessLevel = "strict" | "standard" | "permissive";

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
  email_context: {
    subject: string | null;
    hash: string;
    to: string | null;
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
}

// ─── Constants ─────────────────────────────────────────────────

export const ENGINE_VERSION = "v1";

// ─── Built-in Policy Rules ─────────────────────────────────────

export const DEFAULT_RULES: PolicyRule[] = [
  // INDUCEMENT — financial incentives tied to prescribing/purchasing
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
  // THREAT — intimidation or coercion
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
  // PII — personally identifiable information
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
  // COMPLIANCE — regulatory risk
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
  // CONFIDENTIAL — leaking sensitive info
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
];

// ─── Policy Engine ─────────────────────────────────────────────

/**
 * Scan email content against policy rules.
 * Returns matched rules sorted by severity (BLOCK before WARN).
 */
export function scanWithRules(
  emailBody: string,
  subject: string | null,
  strictness: StrictnessLevel = "standard",
): MatchedRule[] {
  const fullText = [subject || "", emailBody].join(" ");
  const matches: MatchedRule[] = [];

  for (const rule of DEFAULT_RULES) {
    // In permissive mode, skip WARN rules
    if (strictness === "permissive" && rule.action === "WARN") continue;

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
): Promise<{ matches: MatchedRule[]; llmUsed: boolean }> {
  // Always run rule-based first
  const ruleMatches = scanWithRules(emailBody, subject, strictness);

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
): Promise<{ result: ScanResult; receipt: EmailReceipt }> {
  // Run scan
  const { matches, llmUsed } = useLLM
    ? await scanWithLLM(emailBody, subject, strictness)
    : { matches: scanWithRules(emailBody, subject, strictness), llmUsed: false };

  // Determine event type
  let event_type: EventType;
  if (matches.some(m => m.action === "BLOCK")) {
    event_type = "BLOCK";
  } else if (matches.some(m => m.action === "WARN")) {
    event_type = "WARN";
  } else {
    event_type = "PASS";
  }

  // Build summary
  const summary = matches.length === 0
    ? "No policy violations detected. Email cleared for sending."
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
  };

  // Generate receipt
  const receipt = generateEmailReceipt(
    event_type,
    emailBody,
    subject,
    to,
    topMatch,
    summary,
    strictness,
  );

  return { result, receipt };
}

// ─── Receipt Generation ────────────────────────────────────────

/**
 * Generate a JSON receipt for an email decision.
 * Email body is NEVER stored — only a SHA-256 hash.
 */
export function generateEmailReceipt(
  event_type: EventType,
  emailBody: string,
  subject: string | null,
  to: string | null,
  topRule: { rule_id: string; category: RiskCategory; confidence: Confidence },
  reason: string,
  strictness: StrictnessLevel,
  humanApproval?: { approved_by: string; approval_text: string },
): EmailReceipt {
  const receiptId = crypto.randomUUID();
  const bodyHash = sha256(emailBody);

  return {
    receipt_id: receiptId,
    timestamp: new Date().toISOString(),
    event_type,
    email_context: {
      subject: subject || null,
      hash: bodyHash,
      to: to || null,
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
  };
}

// ─── In-Memory Receipt Store (v1 — file-based later) ───────────

const receiptStore: EmailReceipt[] = [];

export function storeReceipt(receipt: EmailReceipt): void {
  receiptStore.push(receipt);
  // Keep last 1000 receipts in memory
  if (receiptStore.length > 1000) {
    receiptStore.shift();
  }
}

export function getReceipts(limit: number = 50): EmailReceipt[] {
  return receiptStore.slice(-limit).reverse();
}

export function getReceiptById(receiptId: string): EmailReceipt | null {
  return receiptStore.find(r => r.receipt_id === receiptId) || null;
}

export function getReceiptStats(): {
  total: number;
  blocked: number;
  warned: number;
  passed: number;
  overridden: number;
} {
  return {
    total: receiptStore.length,
    blocked: receiptStore.filter(r => r.event_type === "BLOCK").length,
    warned: receiptStore.filter(r => r.event_type === "WARN").length,
    passed: receiptStore.filter(r => r.event_type === "PASS").length,
    overridden: receiptStore.filter(r => r.event_type === "OVERRIDE").length,
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
    ),
    generateEmailReceipt(
      "WARN",
      "We can probably support your team if things go well 😉",
      "Quick thought",
      "partner@company.com",
      { rule_id: "INDUCEMENT_002", category: "INDUCEMENT", confidence: "medium" },
      "[WARN] INDUCEMENT: Implied or ambiguous inducement language",
      "standard",
    ),
    generateEmailReceipt(
      "PASS",
      "Please find attached the quarterly report for Q1 2026. Let me know if you have any questions.",
      "Q1 Report",
      "team@company.com",
      { rule_id: "NONE", category: "NONE", confidence: "low" },
      "No policy violations detected. Email cleared for sending.",
      "standard",
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
    ),
  ];

  return samples;
}
