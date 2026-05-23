/**
 * SPG-M Govern Bridge Route
 *
 * Intercepts POST /govern only when SPG-M review metadata is present.
 * Otherwise it passes through to the standard RIO /govern route.
 *
 * This route does not authorize, execute, issue tokens, generate receipts,
 * or create memory. It performs governance review only.
 */
import { Router } from "express";
import { getIntent, updateIntent } from "../governance/intents.mjs";
import { evaluatePolicy, computeGovernanceHash } from "../governance/policy-engine.mjs";
import { getActivePolicy, getSystemMode } from "../governance/policy-store.mjs";
import { appendEntry } from "../ledger/ledger-pg.mjs";
import { hashIntent } from "../receipts/receipts.mjs";
import { requireRole } from "../security/principals.mjs";
import {
  buildSpgmGovernContext,
  buildSpgmGovernResponseFields,
  extractSpgmReviewFromGovernBody,
} from "../spgm/govern-request.mjs";

const router = Router();

export function handleSpgmGovernRequest({
  body = {},
  principal = null,
  getIntentFn = getIntent,
  updateIntentFn = updateIntent,
  evaluatePolicyFn = evaluatePolicy,
  getActivePolicyFn = getActivePolicy,
  getSystemModeFn = getSystemMode,
  appendEntryFn = appendEntry,
  hashIntentFn = hashIntent,
} = {}) {
  const spgmReview = extractSpgmReviewFromGovernBody(body);
  if (!spgmReview) {
    return { handled: false };
  }

  const { intent_id } = body;
  if (!intent_id) {
    return {
      handled: true,
      statusCode: 400,
      body: { error: "Missing required field: intent_id" },
    };
  }

  const intent = getIntentFn(intent_id);
  if (!intent) {
    return {
      handled: true,
      statusCode: 404,
      body: { error: `Intent not found: ${intent_id}` },
    };
  }

  if (intent.status !== "submitted") {
    return {
      handled: true,
      statusCode: 409,
      body: {
        error: `Intent is in status "${intent.status}", expected "submitted".`,
      },
    };
  }

  const activePolicy = getActivePolicyFn();
  const currentSystemMode = getSystemModeFn();
  const context = buildSpgmGovernContext({
    body,
    principal,
    systemMode: currentSystemMode,
  });

  const decision = evaluatePolicyFn(intent, activePolicy, context);
  const timestamp = new Date().toISOString();
  const intentHash = hashIntentFn(intent);
  const governanceHash = computeGovernanceHash({
    intent_hash: intentHash,
    policy_hash: decision.policy_hash,
    policy_version: decision.policy_version,
    governance_decision: decision.governance_decision,
    risk_tier: decision.risk_tier,
    matched_class: decision.matched_class,
    timestamp,
  });

  const newStatus = decision.governance_decision === "AUTO_DENY" ? "blocked"
    : decision.governance_decision === "AUTO_APPROVE" ? "authorized"
    : "governed";

  updateIntentFn(intent_id, {
    status: newStatus,
    governance: {
      ...decision,
      governance_hash: governanceHash,
      evaluated_at: timestamp,
      system_mode: currentSystemMode,
      principal_id: principal?.principal_id || null,
      spgm_review_metadata_present: true,
    },
  });

  appendEntryFn({
    intent_id,
    action: intent.action,
    agent_id: intent.agent_id,
    status: newStatus,
    detail: `Governance with SPG-M review: ${decision.governance_decision} — ${decision.reason} (risk: ${decision.risk_tier}, class: ${decision.matched_class})`,
    intent_hash: intentHash,
  });

  return {
    handled: true,
    statusCode: 200,
    body: {
      intent_id,
      governance_decision: decision.governance_decision,
      governance_status: decision.status,
      risk_tier: decision.risk_tier,
      risk_level: decision.risk_level,
      matched_class: decision.matched_class,
      requires_approval: decision.requires_approval,
      approval_requirement: decision.approval_requirement,
      approval_ttl: decision.approval_ttl,
      reason: decision.reason,
      checks: decision.checks,
      policy_version: decision.policy_version,
      policy_hash: decision.policy_hash,
      governance_hash: governanceHash,
      system_mode: currentSystemMode,
      ...buildSpgmGovernResponseFields(decision),
    },
  };
}

router.post("/govern", requireRole("proposer", "executor"), (req, res, next) => {
  try {
    const result = handleSpgmGovernRequest({
      body: req.body || {},
      principal: req.principal || null,
    });

    if (!result.handled) return next();
    return res.status(result.statusCode).json(result.body);
  } catch (err) {
    console.error(`[RIO Gateway] SPG-M govern bridge error: ${err.message}`);
    return res.status(500).json({ error: "Internal error during SPG-M governance evaluation." });
  }
});

export default router;
