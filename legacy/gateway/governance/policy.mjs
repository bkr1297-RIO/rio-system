/**
 * RIO Policy Engine
 *
 * Evaluates intents against governance policy and constitution.
 * Determines risk level and whether human authorization is required.
 */
import { getConstitution, getPolicy, isRestricted } from "./config.mjs";

/**
 * Risk levels used by the gateway.
 */
const RISK_LEVELS = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
};

/**
 * Evaluate an intent against governance policy.
 *
 * @param {object} intent - The intent to evaluate
 * @param {string} intent.action - The action being requested
 * @param {string} intent.agent_id - The requesting agent
 * @param {string} intent.target_environment - Target environment
 * @param {object} intent.parameters - Action parameters
 * @param {number} intent.confidence - AI confidence score (0-100)
 * @returns {object} Governance decision
 */
export function evaluateIntent(intent) {
  const constitution = getConstitution();
  const policy = getPolicy();
  const checks = [];
  let requiresApproval = false;
  let riskLevel = RISK_LEVELS.LOW;
  let blocked = false;
  let blockReason = null;

  // Check 1: Constitution loaded
  if (!constitution) {
    return {
      status: "blocked",
      reason: "No constitution loaded. Gateway cannot govern without constitution.",
      checks: [{ check: "constitution_loaded", passed: false }],
      risk_level: RISK_LEVELS.CRITICAL,
      requires_approval: false,
    };
  }
  checks.push({ check: "constitution_loaded", passed: true });

  // Check 2: Policy loaded
  if (!policy) {
    return {
      status: "blocked",
      reason: "No policy loaded. Gateway cannot govern without policy.",
      checks: [
        ...checks,
        { check: "policy_loaded", passed: false },
      ],
      risk_level: RISK_LEVELS.CRITICAL,
      requires_approval: false,
    };
  }
  checks.push({ check: "policy_loaded", passed: true });

  // Check 3: Agent is recognized
  // Support both flat and nested policy structures
  const knownAgents = policy.scope?.agents
    || policy.one_governance_policy?.scope?.agents
    || [];
  const agentRecognized = knownAgents.includes(intent.agent_id);
  checks.push({ check: "agent_recognized", passed: agentRecognized, agent: intent.agent_id });
  if (!agentRecognized) {
    blocked = true;
    blockReason = `Agent "${intent.agent_id}" is not recognized by governance policy.`;
  }

  // Check 4: Environment is valid
  // Support both flat and nested policy structures, plus default valid environments
  const defaultEnvs = ["local", "sandbox", "google_drive", "gmail", "github", "google_workspace"];
  const policyEnvs = policy.scope?.environments
    || policy.one_governance_policy?.scope?.environments
    || policy.one_governance_policy?.scope?.systems
    || [];
  const validEnvs = [...new Set([...defaultEnvs, ...policyEnvs])];
  const envValid = validEnvs.includes(intent.target_environment || "local");
  checks.push({ check: "environment_valid", passed: envValid, environment: intent.target_environment });
  if (!envValid) {
    blocked = true;
    blockReason = `Environment "${intent.target_environment}" is not in policy scope.`;
  }

  // Check 5: Action classification
  const actionRestricted = isRestricted(intent.action);
  checks.push({ check: "action_classification", restricted: actionRestricted, action: intent.action });
  if (actionRestricted) {
    requiresApproval = true;
    riskLevel = RISK_LEVELS.HIGH;
  }

  // Check 6: Confidence threshold
  const confidence = intent.confidence ?? 0;
  const confidenceThreshold = 80;
  const confidencePassed = confidence >= confidenceThreshold;
  checks.push({
    check: "confidence_threshold",
    passed: confidencePassed,
    confidence,
    threshold: confidenceThreshold,
  });
  if (!confidencePassed) {
    requiresApproval = true;
    if (riskLevel === RISK_LEVELS.LOW) riskLevel = RISK_LEVELS.MEDIUM;
  }

  // Check 7: External effect detection
  const hasExternalEffect = detectExternalEffect(intent.action, intent.parameters);
  checks.push({ check: "external_effect", detected: hasExternalEffect });
  if (hasExternalEffect) {
    requiresApproval = true;
    if (riskLevel === RISK_LEVELS.LOW) riskLevel = RISK_LEVELS.MEDIUM;
  }

  // Final decision
  if (blocked) {
    return {
      status: "blocked",
      reason: blockReason,
      checks,
      risk_level: RISK_LEVELS.CRITICAL,
      requires_approval: false,
    };
  }

  return {
    status: requiresApproval ? "requires_approval" : "auto_approved",
    reason: requiresApproval
      ? "Action requires explicit human authorization before execution."
      : "Action is within allowed permissions and meets all thresholds.",
    checks,
    risk_level: riskLevel,
    requires_approval: requiresApproval,
  };
}

/**
 * Detect if an action has external effects.
 */
function detectExternalEffect(action, parameters) {
  const externalPatterns = [
    "send_", "post_", "publish_", "deploy_", "delete_",
    "create_", "modify_", "write_", "execute_", "enable_",
  ];
  const actionLower = (action || "").toLowerCase();
  return externalPatterns.some((p) => actionLower.startsWith(p));
}
