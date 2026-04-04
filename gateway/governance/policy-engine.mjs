/**
 * RIO Policy Evaluation Engine
 *
 * Pure function: evaluatePolicy(intent, policy, context) → GovernanceDecision
 *
 * No side effects. No database calls. No external services.
 * Takes an intent and a policy, returns a decision.
 *
 * Implements the algorithm from POLICY_SCHEMA_SPEC.md Section 10.
 *
 * Fail-closed: if anything is missing, uncertain, or unmatched,
 * the decision defaults to REQUIRE_HUMAN with risk tier HIGH.
 */

import { createHash } from "node:crypto";

// ─── Pattern Matching ───────────────────────────────────────────────

/**
 * Match an action string against a glob-style pattern.
 *
 * Pattern syntax (per spec Section 6.1):
 *   "send_email"       → exact match
 *   "send_*"           → prefix match
 *   "read_*|list_*"    → multiple prefixes (OR)
 *   "*"                → wildcard (matches everything)
 *
 * @param {string} action - The action to match
 * @param {string} pattern - The glob pattern
 * @returns {boolean}
 */
export function matchPattern(action, pattern) {
  if (!action || !pattern) return false;

  // Split on | for OR patterns
  const alternatives = pattern.split("|");

  for (const alt of alternatives) {
    const trimmed = alt.trim();

    if (trimmed === "*") {
      // Wildcard — matches everything
      return true;
    }

    if (trimmed.endsWith("_*")) {
      // Prefix match: "send_*" matches "send_email", "send_payment"
      const prefix = trimmed.slice(0, -1); // Remove the *
      if (action.startsWith(prefix)) return true;
    } else if (trimmed.endsWith("*")) {
      // Generic prefix: "send*" matches "send", "sending"
      const prefix = trimmed.slice(0, -1);
      if (action.startsWith(prefix)) return true;
    } else {
      // Exact match
      if (action === trimmed) return true;
    }
  }

  return false;
}

// ─── Condition Evaluation ───────────────────────────────────────────

/**
 * Evaluate whether an intent satisfies an action class's conditions.
 *
 * Conditions are optional. If no conditions are specified, the match is
 * based on pattern alone. If conditions are present, ALL must be satisfied.
 *
 * @param {object} intent - The intent to check
 * @param {object} conditions - The conditions from the action class
 * @returns {boolean}
 */
export function evaluateConditions(intent, conditions) {
  if (!conditions || Object.keys(conditions).length === 0) {
    return true; // No conditions → pattern match is sufficient
  }

  const params = intent.parameters || {};

  // recipient_in: check if recipient is in a named list
  if (conditions.recipient_in) {
    const recipient = params.recipient || params.to || params.email;
    if (!recipient) return false;
    // For now, we check against the intent's known_contacts list if provided
    // In production, this would query a contacts database
    const knownContacts = params._known_contacts || [];
    if (!knownContacts.includes(recipient)) return false;
  }

  // recipient_not_in: check if recipient is NOT in a named list
  if (conditions.recipient_not_in) {
    const recipient = params.recipient || params.to || params.email;
    if (!recipient) return true; // No recipient → condition is vacuously true
    const knownContacts = params._known_contacts || [];
    if (knownContacts.includes(recipient)) return false;
  }

  // attachment_count.max: check attachment count
  if (conditions.attachment_count?.max !== undefined) {
    const count = params.attachment_count || (params.attachments?.length ?? 0);
    if (count > conditions.attachment_count.max) return false;
  }

  // body_length.max: check body length
  if (conditions.body_length?.max !== undefined) {
    const length = (params.body || params.content || "").length;
    if (length > conditions.body_length.max) return false;
  }

  // confidence.min: check confidence score
  if (conditions.confidence?.min !== undefined) {
    const confidence = intent.confidence ?? 0;
    if (confidence < conditions.confidence.min) return false;
  }

  // risk_scope: check risk scope
  if (conditions.risk_scope) {
    if (intent.risk_scope !== conditions.risk_scope) return false;
  }

  return true;
}

// ─── Core Evaluation ────────────────────────────────────────────────

/**
 * Evaluate an intent against a policy.
 *
 * This is the core algorithm from POLICY_SCHEMA_SPEC.md Section 10.
 * It is a pure function with no side effects.
 *
 * @param {object} intent - The intent to evaluate
 * @param {object} policy - The active policy document
 * @param {object} context - Additional context
 * @param {string} context.systemMode - Current system mode (NORMAL, ELEVATED, LOCKDOWN, MAINTENANCE)
 * @param {object} context.principal - The requesting principal (for delegation checks)
 * @returns {object} GovernanceDecision
 */
export function evaluatePolicy(intent, policy, context = {}) {
  const checks = [];
  const systemMode = context.systemMode || "NORMAL";
  const principal = context.principal || null;

  // ─── Step 1: Verify policy is active ─────────────────────────────
  if (!policy) {
    return failClosed("NO_ACTIVE_POLICY", "No active policy loaded. Gateway cannot govern.", checks);
  }

  if (policy.status !== "active") {
    checks.push({ check: "policy_status", passed: false, status: policy.status });
    return failClosed("POLICY_NOT_ACTIVE", `Policy status is "${policy.status}", expected "active".`, checks);
  }
  checks.push({ check: "policy_status", passed: true, status: "active" });

  // ─── Step 2: Verify agent is in scope ────────────────────────────
  const scopeAgents = policy.scope?.agents || [];
  const agentInScope = scopeAgents.includes(intent.agent_id);
  checks.push({ check: "agent_in_scope", passed: agentInScope, agent_id: intent.agent_id });

  if (!agentInScope) {
    return {
      governance_decision: "AUTO_DENY",
      risk_tier: "CRITICAL",
      matched_class: null,
      reason: `Agent "${intent.agent_id}" is not in policy scope.`,
      block_reason: "AGENT_NOT_IN_SCOPE",
      approval_requirement: policy.approval_requirements?.AUTO_DENY || { approvals_required: -1 },
      approval_ttl: null,
      checks,
      policy_version: policy.policy_version,
      policy_hash: policy.policy_hash,
    };
  }

  // ─── Step 3: Verify target system is in scope ────────────────────
  const scopeSystems = policy.scope?.systems || [];
  const targetSystem = intent.target_environment || intent.target_system || "local";
  const systemInScope = scopeSystems.includes(targetSystem) || targetSystem === "local";
  checks.push({ check: "system_in_scope", passed: systemInScope, target_system: targetSystem });

  if (!systemInScope) {
    return {
      governance_decision: "AUTO_DENY",
      risk_tier: "CRITICAL",
      matched_class: null,
      reason: `System "${targetSystem}" is not in policy scope.`,
      block_reason: "SYSTEM_NOT_IN_SCOPE",
      approval_requirement: policy.approval_requirements?.AUTO_DENY || { approvals_required: -1 },
      approval_ttl: null,
      checks,
      policy_version: policy.policy_version,
      policy_hash: policy.policy_hash,
    };
  }

  // ─── Step 4: Match action against action classes ─────────────────
  let matchedClass = null;
  const actionClasses = policy.action_classes || [];

  for (const actionClass of actionClasses) {
    if (matchPattern(intent.action, actionClass.pattern)) {
      // Pattern matches — now check conditions
      if (evaluateConditions(intent, actionClass.conditions)) {
        matchedClass = actionClass;
        break;
      }
    }
  }

  // ─── Step 5: Determine governance decision ───────────────────────
  let governanceDecision;
  let riskTier;

  if (matchedClass === null) {
    // No match → fail-closed default (spec Section 6.1)
    governanceDecision = "REQUIRE_HUMAN";
    riskTier = "HIGH";
    checks.push({ check: "action_class_match", passed: false, action: intent.action, fallback: "default" });
  } else {
    governanceDecision = matchedClass.governance_decision;
    riskTier = matchedClass.risk_tier;
    checks.push({
      check: "action_class_match",
      passed: true,
      action: intent.action,
      matched_class: matchedClass.class_id,
      risk_tier: riskTier,
      governance_decision: governanceDecision,
    });
  }

  // ─── Step 6: System mode overrides ───────────────────────────────
  if (systemMode === "MAINTENANCE") {
    checks.push({ check: "system_mode", mode: "MAINTENANCE", effect: "execution_paused" });
    return {
      governance_decision: "MAINTENANCE_PAUSED",
      risk_tier: riskTier,
      matched_class: matchedClass?.class_id || "default",
      reason: "System is in MAINTENANCE mode. Intents accepted but execution is paused.",
      block_reason: "MAINTENANCE_MODE",
      approval_requirement: null,
      approval_ttl: null,
      checks,
      policy_version: policy.policy_version,
      policy_hash: policy.policy_hash,
    };
  }

  if (systemMode === "ELEVATED" && governanceDecision !== "AUTO_DENY") {
    const originalDecision = governanceDecision;
    governanceDecision = "REQUIRE_HUMAN";
    checks.push({
      check: "system_mode_override",
      mode: "ELEVATED",
      original_decision: originalDecision,
      overridden_to: "REQUIRE_HUMAN",
    });
  }

  if (systemMode === "LOCKDOWN" && governanceDecision !== "AUTO_DENY") {
    const originalDecision = governanceDecision;
    governanceDecision = "REQUIRE_HUMAN";
    checks.push({
      check: "system_mode_override",
      mode: "LOCKDOWN",
      original_decision: originalDecision,
      overridden_to: "REQUIRE_HUMAN",
      required_roles: ["root_authority"],
    });
  }

  // ─── Step 7: Confidence threshold ────────────────────────────────
  const confidence = intent.confidence ?? 0;
  const confidenceThreshold = 80;

  if (confidence < confidenceThreshold && governanceDecision === "AUTO_APPROVE") {
    governanceDecision = "REQUIRE_HUMAN";
    checks.push({
      check: "confidence_threshold",
      passed: false,
      confidence,
      threshold: confidenceThreshold,
      effect: "upgraded to REQUIRE_HUMAN due to LOW_CONFIDENCE",
    });
  } else {
    checks.push({
      check: "confidence_threshold",
      passed: true,
      confidence,
      threshold: confidenceThreshold,
    });
  }

  // ─── Step 8: Delegation ceiling check ────────────────────────────
  if (principal?.is_delegate && policy.delegation_rules?.enabled) {
    const riskCeiling = policy.delegation_rules.risk_ceiling || "LOW";
    const ceilingSeverity = getRiskSeverity(riskCeiling, policy);
    const actionSeverity = getRiskSeverity(riskTier, policy);

    if (actionSeverity > ceilingSeverity && governanceDecision === "AUTO_APPROVE") {
      governanceDecision = "REQUIRE_HUMAN";
      checks.push({
        check: "delegation_ceiling",
        passed: false,
        risk_tier: riskTier,
        risk_ceiling: riskCeiling,
        effect: "upgraded to REQUIRE_HUMAN — EXCEEDS_DELEGATION_CEILING",
      });
    } else {
      checks.push({
        check: "delegation_ceiling",
        passed: true,
        risk_tier: riskTier,
        risk_ceiling: riskCeiling,
      });
    }
  }

  // ─── Step 9: Build result ────────────────────────────────────────
  const approvalRequirement = policy.approval_requirements?.[governanceDecision] || null;
  const approvalTtl = policy.expiration_rules?.[riskTier] || null;

  // Determine status for backward compatibility
  let status;
  let reason;

  switch (governanceDecision) {
    case "AUTO_APPROVE":
      status = "auto_approved";
      reason = "Action is within allowed permissions and meets all thresholds.";
      break;
    case "AUTO_DENY":
      status = "blocked";
      reason = matchedClass?.description || "Action is denied by policy.";
      break;
    case "REQUIRE_HUMAN":
      status = "requires_approval";
      reason = "Action requires explicit human authorization before execution.";
      break;
    case "REQUIRE_QUORUM":
      status = "requires_approval";
      reason = `Action requires ${approvalRequirement?.approvals_required || 2}-of-${approvalRequirement?.quorum_size || 3} Meta-Governance quorum.`;
      break;
    case "REQUIRE_UNANIMOUS":
      status = "requires_approval";
      reason = `Action requires unanimous ${approvalRequirement?.quorum_size || 3}-of-${approvalRequirement?.quorum_size || 3} Meta-Governance quorum.`;
      break;
    default:
      status = "requires_approval";
      reason = "Unknown governance decision. Defaulting to require approval.";
  }

  // Lockdown override: only root_authority can approve
  let requiredRoles = approvalRequirement?.required_roles || null;
  if (systemMode === "LOCKDOWN" && governanceDecision !== "AUTO_DENY") {
    requiredRoles = ["root_authority"];
  }

  return {
    governance_decision: governanceDecision,
    risk_tier: riskTier,
    matched_class: matchedClass?.class_id || "default",
    status,
    reason,
    requires_approval: governanceDecision !== "AUTO_APPROVE" && governanceDecision !== "AUTO_DENY",
    risk_level: riskTier.toLowerCase(), // backward compat
    approval_requirement: {
      ...approvalRequirement,
      required_roles: requiredRoles,
    },
    approval_ttl: approvalTtl,
    checks,
    policy_version: policy.policy_version,
    policy_hash: policy.policy_hash,
  };
}

// ─── Governance Hash ────────────────────────────────────────────────

/**
 * Compute the governance hash per POLICY_SCHEMA_SPEC.md Section 11.
 *
 * governance_hash = SHA-256(canonical_json({
 *   intent_hash, policy_hash, policy_version,
 *   governance_decision, risk_tier, matched_class, timestamp
 * }))
 */
export function computeGovernanceHash(params) {
  const canonical = JSON.stringify({
    intent_hash: params.intent_hash,
    policy_hash: params.policy_hash,
    policy_version: params.policy_version,
    governance_decision: params.governance_decision,
    risk_tier: params.risk_tier,
    matched_class: params.matched_class,
    timestamp: params.timestamp,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Get the numeric severity of a risk tier from the policy.
 */
function getRiskSeverity(tierName, policy) {
  const tier = policy.risk_tiers?.[tierName];
  if (tier) return tier.severity;

  // Fallback severity map
  const defaults = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  return defaults[tierName] ?? 3; // Unknown → HIGH severity (fail-closed)
}

/**
 * Fail-closed helper — returns a blocked decision.
 */
function failClosed(blockReason, reason, checks) {
  return {
    governance_decision: "AUTO_DENY",
    risk_tier: "CRITICAL",
    matched_class: null,
    status: "blocked",
    reason,
    block_reason: blockReason,
    requires_approval: false,
    risk_level: "critical",
    approval_requirement: { approvals_required: -1 },
    approval_ttl: null,
    checks,
    policy_version: null,
    policy_hash: null,
  };
}

/**
 * Check if an approval has expired based on the TTL.
 *
 * @param {string} approvalTimestamp - ISO 8601 timestamp of the approval
 * @param {number|null} ttlSeconds - TTL in seconds (null = no expiration)
 * @returns {boolean} true if expired
 */
export function isApprovalExpired(approvalTimestamp, ttlSeconds) {
  if (ttlSeconds === null || ttlSeconds === undefined) return false;
  const approvalTime = new Date(approvalTimestamp).getTime();
  const now = Date.now();
  return (now - approvalTime) > (ttlSeconds * 1000);
}
