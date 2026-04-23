/**
 * RIO User Policy Layer — Phase 2 (v1.0)
 *
 * Minimal constraint layer that evaluates deterministic rules
 * AFTER RIO validation, BEFORE execution.
 *
 * Decisions:
 *   ALLOW                — continue execution (no constraint triggered)
 *   DENY                 — block execution immediately
 *   REQUIRE_CONFIRMATION — return intent to approval flow for re-confirmation
 *
 * Invariant: Policy can only restrict; it never grants or expands permission.
 * Invariant: All rules are deterministic and explicit — no inference.
 *
 * @module governance/user-policy
 * @version 1.1.0 — Phase 2 rules defined, PILOT_MODE bypass active
 */

// ───────────────────────────────────────────────────────────────────
// Pilot Mode
// When true: rules are evaluated for logging only, decision is always ALLOW.
// Set to false to activate real enforcement.
// ───────────────────────────────────────────────────────────────────
const PILOT_MODE = true;

// ─────────────────────────────────────────────────────────────────────
// Rule Definitions
// ─────────────────────────────────────────────────────────────────────

/**
 * Each rule is an object with:
 *   id       — unique identifier for audit trail
 *   name     — human-readable description
 *   evaluate — (intent, context) => { triggered: boolean, decision: string }
 *
 * Rules are evaluated in order. First DENY wins. If no DENY,
 * first REQUIRE_CONFIRMATION wins. Otherwise ALLOW.
 */
const POLICY_RULES = [
  {
    id: "POLICY-001",
    name: "Deny emails containing financial keywords",
    description: "Block send_email if body contains wire transfer / payment language",
    evaluate: (intent) => {
      if (intent.action !== "send_email") return { triggered: false };
      const params = intent.parameters || {};
      const body = (params.body || params.content || params.message || "").toLowerCase();
      const subject = (params.subject || "").toLowerCase();
      const text = body + " " + subject;
      const FINANCIAL_KEYWORDS = [
        "wire transfer",
        "wire funds",
        "send wire",
        "bank transfer",
        "routing number",
        "account number",
        "swift code",
        "iban",
      ];
      const matched = FINANCIAL_KEYWORDS.find((kw) => text.includes(kw));
      if (matched) {
        return {
          triggered: true,
          decision: "DENY",
          reason: `Email contains financial keyword: "${matched}"`,
        };
      }
      return { triggered: false };
    },
  },
  {
    id: "POLICY-002",
    name: "External email requires confirmation",
    description: "send_email to non-owner domain requires additional confirmation",
    evaluate: (intent, context) => {
      if (intent.action !== "send_email") return { triggered: false };
      const params = intent.parameters || {};
      const to = (params.to || params.recipient || "").toLowerCase();
      if (!to || !to.includes("@")) return { triggered: false };
      // Extract domain from the recipient
      const recipientDomain = to.split("@")[1];
      // Known internal/owner domains — emails to these are ALLOW
      const INTERNAL_DOMAINS = [
        "gmail.com",       // Owner's primary domain
        "hotmail.com",     // Owner's secondary domain
      ];
      if (INTERNAL_DOMAINS.includes(recipientDomain)) {
        return { triggered: false };
      }
      return {
        triggered: true,
        decision: "REQUIRE_CONFIRMATION",
        reason: `External recipient domain: ${recipientDomain}`,
      };
    },
  },
  {
    id: "POLICY-003",
    name: "High-risk action without break analysis requires confirmation",
    description: "HIGH risk intents must include a break analysis or be re-confirmed",
    evaluate: (intent) => {
      const riskTier = intent.governance?.risk_tier || intent.risk_tier || "low";
      if (riskTier.toLowerCase() !== "high") return { triggered: false };
      // Check if break analysis was provided
      const hasBreakAnalysis =
        intent.parameters?.breakAnalysis ||
        intent.parameters?.break_analysis ||
        intent.governance?.break_analysis;
      if (hasBreakAnalysis) return { triggered: false };
      return {
        triggered: true,
        decision: "REQUIRE_CONFIRMATION",
        reason: "HIGH risk action submitted without break analysis",
      };
    },
  },
];

// ─────────────────────────────────────────────────────────────────────
// Evaluation Engine
// ─────────────────────────────────────────────────────────────────────

/**
 * Evaluate an intent against user-defined policy rules.
 *
 * Rules are evaluated in order. Precedence:
 *   1. First DENY wins → execution blocked
 *   2. First REQUIRE_CONFIRMATION wins → return to approval
 *   3. No rules triggered → ALLOW
 *
 * @param {object} intent - The authorized intent about to be executed
 * @param {object} context - Execution context (principal, environment, etc.)
 * @returns {{
 *   decision: "ALLOW" | "DENY" | "REQUIRE_CONFIRMATION",
 *   rules_triggered: Array<{ id: string, name: string, decision: string, reason: string }>,
 *   policy_pack: string | null
 * }}
 */
export function evaluateUserPolicy(intent, context) {
  const triggered = [];
  let wouldDecide = "ALLOW";

  // Always evaluate rules for logging — even in pilot mode
  for (const rule of POLICY_RULES) {
    try {
      const result = rule.evaluate(intent, context);
      if (result.triggered) {
        triggered.push({
          id: rule.id,
          name: rule.name,
          decision: result.decision,
          reason: result.reason || "",
        });

        if (result.decision === "DENY") {
          wouldDecide = "DENY";
          break;
        }

        if (result.decision === "REQUIRE_CONFIRMATION" && wouldDecide !== "DENY") {
          wouldDecide = "REQUIRE_CONFIRMATION";
        }
      }
    } catch (err) {
      console.error(`[RIO Policy] Rule ${rule.id} threw error: ${err.message}`);
    }
  }

  // PILOT MODE: log what would have happened, but always return ALLOW
  if (PILOT_MODE) {
    if (triggered.length > 0) {
      console.log(`[RIO Policy] PILOT_MODE: would have decided ${wouldDecide} (rules: ${triggered.map(r => r.id).join(", ")}) — returning ALLOW`);
    }
    return {
      decision: "ALLOW",
      rules_triggered: triggered,
      policy_pack: "rio-base-v1",
      pilot_mode: true,
      would_have_decided: wouldDecide,
    };
  }

  return {
    decision: wouldDecide,
    rules_triggered: triggered,
    policy_pack: "rio-base-v1",
  };
}

// ─────────────────────────────────────────────────────────────────────
// Receipt Builder
// ─────────────────────────────────────────────────────────────────────

/**
 * Build the policy block for inclusion in receipts.
 *
 * @param {object} policyResult - Result from evaluateUserPolicy()
 * @returns {object} Policy block for the receipt
 */
export function buildPolicyBlock(policyResult) {
  return {
    evaluated: true,
    decision: policyResult?.decision || "ALLOW",
    rules_triggered: (policyResult?.rules_triggered || []).map((r) => ({
      id: r.id,
      name: r.name,
      decision: r.decision,
      reason: r.reason,
    })),
    policy_pack: policyResult?.policy_pack || null,
  };
}

/**
 * Get the current policy rule definitions (for introspection/debugging).
 *
 * @returns {Array<{ id: string, name: string, description: string }>}
 */
export function getPolicyRules() {
  return POLICY_RULES.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
  }));
}
