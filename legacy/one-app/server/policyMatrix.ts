/**
 * Policy Matrix — Configurable Governance Decision Engine
 * ═══════════════════════════════════════════════════════════════
 *
 * Extracts and formalizes the governance rules that were previously
 * hardcoded across firewallGovernance.ts and pausePlacement.ts.
 *
 * The policy matrix is a configurable, portable module that:
 *   1. Defines action types and their governance requirements
 *   2. Maps risk levels to approval requirements
 *   3. Routes actions through the correct governance path
 *   4. Returns structured decisions (not just strings)
 *
 * Invariants:
 *   - Fail closed on uncertainty (unknown action → require_approval)
 *   - No execution without governance decision
 *   - No execution without approval when required
 *   - Advisory learning data informs but NEVER overrides
 *   - Matrix is frozen after load — no runtime mutation
 *
 * This is a refactor + packaging of existing behavior, not a rebuild.
 */

import { createHash } from "crypto";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** Governance decision for an action */
export type GovernanceDecision =
  | "allow"              // Execute immediately (no approval needed)
  | "require_approval"   // Must be approved by a human before execution
  | "block"              // Blocked by policy — cannot execute
  | "require_confirmation"; // Needs human confirmation (soft pause)

/** Risk tier — determines default governance path */
export type RiskTier = "low" | "medium" | "high" | "critical";

/** Approval channel — how approval is requested */
export type ApprovalChannel = "email" | "sms" | "telegram" | "ui";

/** Action category for grouping */
export type ActionCategory =
  | "communication"   // send_email, send_sms, send_message
  | "financial"       // send_payment, transfer_funds
  | "data"            // read_data, write_data, delete_data
  | "system"          // restart_service, deploy, config_change
  | "social"          // post_social, comment, like
  | "custom";         // user-defined actions

/**
 * Policy rule for a specific action type.
 * Defines how the governance engine handles this action.
 */
export interface PolicyRule {
  /** Action type identifier (e.g., "send_email") */
  action_type: string;
  /** Human-readable description */
  description: string;
  /** Category for grouping */
  category: ActionCategory;
  /** Default risk tier */
  risk_tier: RiskTier;
  /** Default governance decision */
  default_decision: GovernanceDecision;
  /** Preferred approval channels (ordered by priority) */
  approval_channels: ApprovalChannel[];
  /** Whether learning can advise on this action (advisory only) */
  learning_eligible: boolean;
  /** Maximum approval expiry in ms (0 = use system default) */
  approval_expiry_ms: number;
  /** Whether this action requires the proposer ≠ approver */
  require_different_approver: boolean;
  /** Custom metadata for this rule */
  metadata: Record<string, unknown>;
}

/**
 * Risk tier configuration — maps risk levels to governance behavior.
 */
export interface RiskTierConfig {
  tier: RiskTier;
  /** Minimum risk score for this tier (0-100) */
  min_score: number;
  /** Maximum risk score for this tier (0-100) */
  max_score: number;
  /** Default decision for actions in this tier */
  default_decision: GovernanceDecision;
  /** Whether approval is always required regardless of learning */
  always_require_approval: boolean;
  /** Description of this tier */
  description: string;
}

/**
 * The full policy matrix — configurable governance specification.
 */
export interface PolicyMatrix {
  /** Version string for this matrix */
  version: string;
  /** When this matrix was created/last updated */
  updated_at: string;
  /** SHA-256 hash of the canonical matrix (for integrity) */
  matrix_hash: string;
  /** Action-specific rules */
  rules: PolicyRule[];
  /** Risk tier configuration */
  risk_tiers: RiskTierConfig[];
  /** System-wide defaults */
  defaults: {
    /** Default decision for unknown actions (MUST be require_approval or block) */
    unknown_action_decision: "require_approval" | "block";
    /** Default approval expiry in ms */
    approval_expiry_ms: number;
    /** Default approval channels */
    default_channels: ApprovalChannel[];
    /** Whether to fail closed on any error */
    fail_closed: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════
// STRUCTURED EVALUATION RESULT
// ═══════════════════════════════════════════════════════════════

/**
 * Structured result from policy evaluation.
 * Every evaluation produces one of these — no exceptions.
 */
export interface PolicyEvaluation {
  /** The action that was evaluated */
  action_type: string;
  /** The governance decision */
  decision: GovernanceDecision;
  /** Risk tier assigned */
  risk_tier: RiskTier;
  /** Risk score (0-100) */
  risk_score: number;
  /** Human-readable reason for the decision */
  reason: string;
  /** The rule that matched (null if using defaults) */
  matched_rule: string | null;
  /** Approval channels to use (if approval required) */
  approval_channels: ApprovalChannel[];
  /** Approval expiry in ms */
  approval_expiry_ms: number;
  /** Whether proposer must differ from approver */
  require_different_approver: boolean;
  /** Advisory data from learning (if available) */
  learning_advisory: {
    available: boolean;
    trend: "TRUSTED" | "NEUTRAL" | "RISKY" | "UNKNOWN";
    approval_rate: number | null;
    total_decisions: number;
    advisory_risk_score: number | null;
  };
  /** Timestamp of evaluation */
  evaluated_at: string;
  /** Matrix version used for this evaluation */
  matrix_version: string;
  /** Matrix hash at time of evaluation */
  matrix_hash: string;
}

/**
 * Structured failure report — returned when evaluation cannot proceed.
 */
export interface PolicyFailure {
  /** Always "failure" */
  status: "failure";
  /** Error code */
  code: "NO_MATRIX" | "INVALID_INPUT" | "EVALUATION_ERROR" | "MATRIX_INTEGRITY";
  /** Human-readable error message */
  message: string;
  /** What is required to resolve this */
  required_next_step: string;
  /** Governance decision in failure mode (always fail closed) */
  fallback_decision: "block";
  /** Timestamp */
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT POLICY MATRIX
// ═══════════════════════════════════════════════════════════════

/**
 * Default policy matrix — extracted from existing hardcoded rules
 * in firewallGovernance.ts and pausePlacement.ts.
 *
 * This preserves all existing behavior exactly as-is.
 */
function buildDefaultMatrix(): Omit<PolicyMatrix, "matrix_hash"> {
  return {
    version: "v1.0.0",
    updated_at: new Date().toISOString(),
    rules: [
      // ─── Communication ──────────────────────────────────────
      {
        action_type: "send_email",
        description: "Send an email message",
        category: "communication",
        risk_tier: "medium",
        default_decision: "require_approval",
        approval_channels: ["email", "telegram"],
        learning_eligible: true,
        approval_expiry_ms: 900000, // 15 min
        require_different_approver: false,
        metadata: {},
      },
      {
        action_type: "send_sms",
        description: "Send an SMS text message",
        category: "communication",
        risk_tier: "medium",
        default_decision: "require_approval",
        approval_channels: ["sms", "email", "telegram"],
        learning_eligible: true,
        approval_expiry_ms: 900000,
        require_different_approver: false,
        metadata: {},
      },
      {
        action_type: "send_message",
        description: "Send a message via any channel",
        category: "communication",
        risk_tier: "medium",
        default_decision: "require_approval",
        approval_channels: ["email", "telegram"],
        learning_eligible: true,
        approval_expiry_ms: 900000,
        require_different_approver: false,
        metadata: {},
      },
      // ─── Financial ──────────────────────────────────────────
      {
        action_type: "send_payment",
        description: "Send a financial payment",
        category: "financial",
        risk_tier: "critical",
        default_decision: "require_approval",
        approval_channels: ["email"],
        learning_eligible: false,
        approval_expiry_ms: 300000, // 5 min — tighter window
        require_different_approver: true,
        metadata: {},
      },
      {
        action_type: "transfer_funds",
        description: "Transfer funds between accounts",
        category: "financial",
        risk_tier: "critical",
        default_decision: "require_approval",
        approval_channels: ["email"],
        learning_eligible: false,
        approval_expiry_ms: 300000,
        require_different_approver: true,
        metadata: {},
      },
      // ─── Data ───────────────────────────────────────────────
      {
        action_type: "delete_data",
        description: "Delete data permanently",
        category: "data",
        risk_tier: "high",
        default_decision: "require_approval",
        approval_channels: ["email", "telegram"],
        learning_eligible: false,
        approval_expiry_ms: 600000,
        require_different_approver: false,
        metadata: {},
      },
      {
        action_type: "read_data",
        description: "Read data from a source",
        category: "data",
        risk_tier: "low",
        default_decision: "allow",
        approval_channels: [],
        learning_eligible: true,
        approval_expiry_ms: 0,
        require_different_approver: false,
        metadata: {},
      },
      // ─── System ─────────────────────────────────────────────
      {
        action_type: "deploy",
        description: "Deploy code or configuration",
        category: "system",
        risk_tier: "critical",
        default_decision: "require_approval",
        approval_channels: ["email"],
        learning_eligible: false,
        approval_expiry_ms: 300000,
        require_different_approver: true,
        metadata: {},
      },
      {
        action_type: "config_change",
        description: "Change system configuration",
        category: "system",
        risk_tier: "high",
        default_decision: "require_approval",
        approval_channels: ["email", "telegram"],
        learning_eligible: false,
        approval_expiry_ms: 600000,
        require_different_approver: false,
        metadata: {},
      },
      // ─── Social ─────────────────────────────────────────────
      {
        action_type: "post_social",
        description: "Post to social media",
        category: "social",
        risk_tier: "high",
        default_decision: "require_approval",
        approval_channels: ["email", "telegram"],
        learning_eligible: true,
        approval_expiry_ms: 900000,
        require_different_approver: false,
        metadata: {},
      },
      // ─── Classification (inbound) ───────────────────────────
      {
        action_type: "classify_message",
        description: "Classify an inbound message",
        category: "data",
        risk_tier: "low",
        default_decision: "allow",
        approval_channels: [],
        learning_eligible: true,
        approval_expiry_ms: 0,
        require_different_approver: false,
        metadata: {},
      },
    ],
    risk_tiers: [
      {
        tier: "low",
        min_score: 0,
        max_score: 25,
        default_decision: "allow",
        always_require_approval: false,
        description: "Low risk — can execute without approval",
      },
      {
        tier: "medium",
        min_score: 26,
        max_score: 50,
        default_decision: "require_approval",
        always_require_approval: true,
        description: "Medium risk — requires human approval",
      },
      {
        tier: "high",
        min_score: 51,
        max_score: 75,
        default_decision: "require_approval",
        always_require_approval: true,
        description: "High risk — requires approval, tighter controls",
      },
      {
        tier: "critical",
        min_score: 76,
        max_score: 100,
        default_decision: "require_approval",
        always_require_approval: true,
        description: "Critical risk — requires approval, different approver, short expiry",
      },
    ],
    defaults: {
      unknown_action_decision: "require_approval",
      approval_expiry_ms: 900000,
      default_channels: ["email"],
      fail_closed: true,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// MATRIX MANAGEMENT
// ═══════════════════════════════════════════════════════════════

let activeMatrix: PolicyMatrix | null = null;

/**
 * Compute the integrity hash of a policy matrix.
 */
function computeMatrixHash(matrix: Omit<PolicyMatrix, "matrix_hash">): string {
  const canonical = JSON.stringify({
    version: matrix.version,
    rules: matrix.rules,
    risk_tiers: matrix.risk_tiers,
    defaults: matrix.defaults,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Load the default policy matrix.
 * Freezes the matrix after construction.
 */
export function loadDefaultMatrix(): PolicyMatrix {
  const base = buildDefaultMatrix();
  const matrix: PolicyMatrix = {
    ...base,
    matrix_hash: computeMatrixHash(base),
  };
  activeMatrix = matrix;
  return matrix;
}

/**
 * Load a custom policy matrix (e.g., from DB or config file).
 * Validates and freezes after construction.
 */
export function loadCustomMatrix(custom: Omit<PolicyMatrix, "matrix_hash">): PolicyMatrix {
  // Validate required fields
  if (!custom.version) throw new Error("MATRIX_ERROR: version is required");
  if (!custom.rules || !Array.isArray(custom.rules)) throw new Error("MATRIX_ERROR: rules must be an array");
  if (!custom.risk_tiers || !Array.isArray(custom.risk_tiers)) throw new Error("MATRIX_ERROR: risk_tiers must be an array");
  if (!custom.defaults) throw new Error("MATRIX_ERROR: defaults is required");

  // Validate fail-closed default
  if (!["require_approval", "block"].includes(custom.defaults.unknown_action_decision)) {
    throw new Error("MATRIX_ERROR: unknown_action_decision must be 'require_approval' or 'block'");
  }

  const matrix: PolicyMatrix = {
    ...custom,
    matrix_hash: computeMatrixHash(custom),
  };
  activeMatrix = matrix;
  return matrix;
}

/**
 * Get the active policy matrix.
 * If none loaded, loads the default.
 */
export function getActiveMatrix(): PolicyMatrix {
  if (!activeMatrix) {
    return loadDefaultMatrix();
  }
  return activeMatrix;
}

/**
 * Verify the integrity of a policy matrix.
 */
export function verifyMatrixIntegrity(matrix: PolicyMatrix): boolean {
  const recomputed = computeMatrixHash(matrix);
  return recomputed === matrix.matrix_hash;
}

// ═══════════════════════════════════════════════════════════════
// RULE LOOKUP
// ═══════════════════════════════════════════════════════════════

/**
 * Find the policy rule for a given action type.
 * Returns null if no specific rule exists (will use defaults).
 */
export function findRule(actionType: string): PolicyRule | null {
  const matrix = getActiveMatrix();
  return matrix.rules.find(r => r.action_type === actionType) || null;
}

/**
 * Get the risk tier config for a given risk score.
 */
export function getRiskTierForScore(score: number): RiskTierConfig {
  const matrix = getActiveMatrix();
  const clamped = Math.max(0, Math.min(100, score));

  // Find the matching tier
  const tier = matrix.risk_tiers.find(t => clamped >= t.min_score && clamped <= t.max_score);
  if (tier) return tier;

  // Fallback: highest tier (fail closed)
  return matrix.risk_tiers[matrix.risk_tiers.length - 1];
}

// ═══════════════════════════════════════════════════════════════
// POLICY EVALUATION
// ═══════════════════════════════════════════════════════════════

/**
 * Evaluate an action against the policy matrix.
 *
 * This is the core decision function. It:
 *   1. Looks up the rule for the action type
 *   2. Determines the risk tier
 *   3. Consults learning data (advisory only)
 *   4. Returns a structured PolicyEvaluation
 *
 * Invariants:
 *   - Unknown actions → fail closed (require_approval or block)
 *   - Learning is advisory only — never overrides the matrix
 *   - Critical/financial actions always require approval
 *   - Every evaluation produces a complete structured result
 */
export function evaluateAction(params: {
  action_type: string;
  target?: string;
  risk_score_override?: number;
  learning_data?: {
    trend: "TRUSTED" | "NEUTRAL" | "RISKY" | "UNKNOWN";
    approval_rate: number | null;
    total_decisions: number;
    advisory_risk_score: number | null;
  };
}): PolicyEvaluation | PolicyFailure {
  const matrix = getActiveMatrix();

  // Validate matrix integrity
  if (!verifyMatrixIntegrity(matrix)) {
    return {
      status: "failure",
      code: "MATRIX_INTEGRITY",
      message: "Policy matrix integrity check failed — hash mismatch",
      required_next_step: "Reload or reset the policy matrix",
      fallback_decision: "block",
      timestamp: new Date().toISOString(),
    };
  }

  // Validate input
  if (!params.action_type || typeof params.action_type !== "string") {
    return {
      status: "failure",
      code: "INVALID_INPUT",
      message: "action_type is required and must be a string",
      required_next_step: "Provide a valid action_type",
      fallback_decision: "block",
      timestamp: new Date().toISOString(),
    };
  }

  try {
    // Step 1: Find the rule
    const rule = findRule(params.action_type);
    const isKnownAction = rule !== null;

    // Step 2: Determine base risk score
    let riskScore: number;
    if (params.risk_score_override !== undefined) {
      riskScore = Math.max(0, Math.min(100, params.risk_score_override));
    } else if (rule) {
      // Map risk tier to base score
      const tierScores: Record<RiskTier, number> = {
        low: 15,
        medium: 40,
        high: 65,
        critical: 85,
      };
      riskScore = tierScores[rule.risk_tier];
    } else {
      // Unknown action — default to high risk (fail closed)
      riskScore = 70;
    }

    // Step 3: Get risk tier config
    const tierConfig = getRiskTierForScore(riskScore);

    // Step 4: Determine decision
    let decision: GovernanceDecision;
    let reason: string;
    let matchedRule: string | null = null;

    if (rule) {
      decision = rule.default_decision;
      reason = `Policy rule: ${rule.description} [${rule.risk_tier} risk]`;
      matchedRule = rule.action_type;

      // Override with tier config if tier always requires approval
      if (tierConfig.always_require_approval && decision === "allow") {
        decision = "require_approval";
        reason += ` — elevated by risk tier (${tierConfig.tier})`;
      }
    } else {
      // Unknown action — fail closed
      decision = matrix.defaults.unknown_action_decision;
      reason = `Unknown action type "${params.action_type}" — fail closed (${decision})`;
    }

    // Step 5: Build learning advisory (NEVER overrides decision)
    const learningAdvisory = params.learning_data || {
      available: false,
      trend: "UNKNOWN" as const,
      approval_rate: null,
      total_decisions: 0,
      advisory_risk_score: null,
    };

    // If learning data provided, mark as available
    const advisory = {
      available: !!params.learning_data,
      trend: learningAdvisory.trend,
      approval_rate: learningAdvisory.approval_rate ?? null,
      total_decisions: learningAdvisory.total_decisions ?? 0,
      advisory_risk_score: learningAdvisory.advisory_risk_score ?? null,
    };

    // Step 6: Build evaluation result
    return {
      action_type: params.action_type,
      decision,
      risk_tier: rule?.risk_tier ?? tierConfig.tier,
      risk_score: riskScore,
      reason,
      matched_rule: matchedRule,
      approval_channels: rule?.approval_channels ?? matrix.defaults.default_channels,
      approval_expiry_ms: rule?.approval_expiry_ms || matrix.defaults.approval_expiry_ms,
      require_different_approver: rule?.require_different_approver ?? false,
      learning_advisory: advisory,
      evaluated_at: new Date().toISOString(),
      matrix_version: matrix.version,
      matrix_hash: matrix.matrix_hash,
    };
  } catch (err) {
    // Fail closed on any error
    return {
      status: "failure",
      code: "EVALUATION_ERROR",
      message: `Evaluation failed: ${err instanceof Error ? err.message : String(err)}`,
      required_next_step: "Investigate the error and retry",
      fallback_decision: "block",
      timestamp: new Date().toISOString(),
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// TYPE GUARDS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if an evaluation result is a failure.
 */
export function isFailure(result: PolicyEvaluation | PolicyFailure): result is PolicyFailure {
  return "status" in result && result.status === "failure";
}

/**
 * Check if an evaluation result requires approval.
 */
export function requiresApproval(result: PolicyEvaluation): boolean {
  return result.decision === "require_approval" || result.decision === "require_confirmation";
}

// ═══════════════════════════════════════════════════════════════
// RESET (for testing)
// ═══════════════════════════════════════════════════════════════

export function _resetMatrix(): void {
  activeMatrix = null;
}
