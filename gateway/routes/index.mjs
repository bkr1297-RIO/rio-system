/**
 * RIO Gateway API Routes
 *
 * Pipeline: Intent → Governance → Authorization → Execution → Receipt
 *
 * Each endpoint advances the intent through one stage of the pipeline.
 * The system is fail-closed: missing authorization blocks execution.
 */
import { Router } from "express";
import { createIntent, getIntent, updateIntent, listIntents, getStats } from "../governance/intents.mjs";
import { evaluateIntent } from "../governance/policy.mjs";
import { getAllConfig, getConstitution, getPolicy } from "../governance/config.mjs";
import { evaluatePolicy, computeGovernanceHash, isApprovalExpired } from "../governance/policy-engine.mjs";
import { getActivePolicy, getSystemMode, getPolicyHistory, verifyPolicyChain } from "../governance/policy-store.mjs";
import {
  appendEntry,
  getEntries,
  getEntriesByIntent,
  getEntryCount,
  verifyChain,
  getCurrentHash,
  createApproval,
  getApprovalsByIntent,
  getApprovalByApprover,
  getPendingApprovals,
  storeReceipt,
} from "../ledger/ledger-pg.mjs";
import {
  hashIntent,
  hashGovernance,
  hashAuthorization,
  hashExecution,
  generateReceipt,
  verifyReceipt,
  buildIngestion,
} from "../receipts/receipts.mjs";
import { sendEmail } from "../execution/gmail-executor.mjs";
import { sendSms } from "../execution/sms-executor.mjs";
import {
  buildSignaturePayload,
  verifySignature,
  hashPayload,
  signPayload,
  loadKeypair,
  generateAndSaveKeypair,
} from "../security/ed25519.mjs";
import { getSignerPublicKey } from "../security/identity-binding.mjs";
import {
  validateIntake,
  normalizeLegacy,
  isIntakeFormat,
} from "../governance/intake.mjs";
import {
  issueExecutionToken,
  validateAndBurnToken,
  getActiveTokenCount,
} from "../security/token-manager.mjs";
import {
  getReplayPreventionStats,
} from "../security/replay-prevention.mjs";
import {
  requireRole,
  requirePrincipal,
  getAllRoles,
} from "../security/principals.mjs";

const router = Router();

// Ed25519 enforcement mode: "optional" (accepts unsigned), "required" (rejects unsigned)
const ED25519_MODE = process.env.ED25519_MODE || "required";

// Gateway Ed25519 keypair for receipt signing (lazy-init on first use)
let _gatewayKeypair = null;
function getGatewayKeypair() {
  if (_gatewayKeypair) return _gatewayKeypair;
  _gatewayKeypair = loadKeypair("gateway");
  if (!_gatewayKeypair) {
    console.log("[RIO Gateway] No gateway keypair found — generating new Ed25519 keypair.");
    _gatewayKeypair = generateAndSaveKeypair("gateway");
  }
  return _gatewayKeypair;
}

// =========================================================================
// POST /intent — Submit a new intent
// Accepts BOTH the new Intake Schema v1 format and legacy format.
// New format: { identity, intent, context }
// Legacy format: { action, agent_id, parameters, ... }
// =========================================================================
router.post("/intent", requireRole("proposer"), (req, res) => {
  try {
    let intake;

    if (isIntakeFormat(req.body)) {
      // --- New Intake Schema v1 ---
      const validation = validateIntake(req.body);
      if (!validation.valid) {
        return res.status(400).json({
          error: "Intake validation failed",
          schema: "RIO Intake Schema v1",
          errors: validation.errors,
          hint: "See spec/intake-schema.json for the required format.",
        });
      }
      intake = validation.intake;
      console.log(`[RIO Gateway] Intake v1 received from ${intake.identity.subject}`);
    } else {
      // --- Legacy format (backward compatible) ---
      const { action, agent_id } = req.body;
      if (!action || !agent_id) {
        return res.status(400).json({
          error: "Missing required fields. Use Intake Schema v1 { identity, intent, context } or legacy { action, agent_id }.",
          hint: "See spec/intake-schema.json for the recommended format.",
        });
      }
      intake = normalizeLegacy(req.body, req);
      console.log(`[RIO Gateway] Legacy intent normalized to intake schema`);
    }

    // Extract fields for the existing pipeline
    const action = intake.intent.action;
    const agent_id = intake.identity.subject;
    const target_environment = intake.intent.target;
    const parameters = intake.intent.parameters || {};
    const description = intake.context.reason;
    const confidence = req.body.confidence;

    const intent = createIntent({
      action,
      agent_id,
      target_environment,
      parameters,
      confidence,
      description,
      _intake: intake,
      // Area 1: Principal attribution
      principal_id: req.principal?.principal_id || null,
      principal_role: req.principal?.primary_role || null,
    });

    // Hash the intent
    const intentHash = hashIntent(intent);

    // Write to ledger
    appendEntry({
      intent_id: intent.intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      status: "submitted",
      detail: `Intent submitted: ${intent.action} by ${intent.agent_id}`,
      intent_hash: intentHash,
    });

    console.log(`[RIO Gateway] Intent submitted: ${intent.intent_id} — ${intent.action} by ${intent.agent_id}`);

    res.status(201).json({
      intent_id: intent.intent_id,
      status: intent.status,
      action: intent.action,
      agent_id: intent.agent_id,
      principal_id: intent.principal_id,
      intent_hash: intentHash,
      timestamp: intent.timestamp,
    });
  } catch (err) {
    console.error(`[RIO Gateway] Intent error: ${err.message}`);
    res.status(500).json({ error: "Internal error submitting intent." });
  }
});

// =========================================================================
// POST /govern — Run policy + risk evaluation
// =========================================================================
router.post("/govern", requireRole("proposer", "executor"), (req, res) => {
  try {
    const { intent_id } = req.body;

    if (!intent_id) {
      return res.status(400).json({ error: "Missing required field: intent_id" });
    }

    const intent = getIntent(intent_id);
    if (!intent) {
      return res.status(404).json({ error: `Intent not found: ${intent_id}` });
    }

    if (intent.status !== "submitted") {
      return res.status(409).json({
        error: `Intent is in status "${intent.status}", expected "submitted".`,
      });
    }

    // ─── Area 2: Policy Evaluation Engine ─────────────────────────
    const activePolicy = getActivePolicy();
    const currentSystemMode = getSystemMode();

    // Evaluate against policy (v2 engine)
    const decision = evaluatePolicy(intent, activePolicy, {
      systemMode: currentSystemMode,
      principal: req.principal || null,
    });

    // Compute governance hash per POLICY_SCHEMA_SPEC.md Section 11
    const timestamp = new Date().toISOString();
    const governanceHash = computeGovernanceHash({
      intent_hash: hashIntent(intent),
      policy_hash: decision.policy_hash,
      policy_version: decision.policy_version,
      governance_decision: decision.governance_decision,
      risk_tier: decision.risk_tier,
      matched_class: decision.matched_class,
      timestamp,
    });

    // Determine intent status
    const newStatus = decision.governance_decision === "AUTO_DENY" ? "blocked"
      : decision.governance_decision === "AUTO_APPROVE" ? "authorized"
      : "governed";

    // Update intent with full governance record
    updateIntent(intent_id, {
      status: newStatus,
      governance: {
        ...decision,
        governance_hash: governanceHash,
        evaluated_at: timestamp,
        system_mode: currentSystemMode,
        principal_id: req.principal?.principal_id || null,
      },
    });

    // Write to ledger
    appendEntry({
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      status: newStatus,
      detail: `Governance: ${decision.governance_decision} — ${decision.reason} (risk: ${decision.risk_tier}, class: ${decision.matched_class})`,
      intent_hash: hashIntent(intent),
    });

    console.log(`[RIO Gateway] Governed: ${intent_id} — ${decision.governance_decision} (risk: ${decision.risk_tier}, class: ${decision.matched_class})`);

    res.json({
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
    });
  } catch (err) {
    console.error(`[RIO Gateway] Govern error: ${err.message}`);
    res.status(500).json({ error: "Internal error during governance evaluation." });
  }
});

// =========================================================================
// POST /authorize — Record human approval or denial
// Supports Ed25519 signatures: if `signature` field is provided, it is verified.
// If ED25519_MODE=required, unsigned requests are rejected.
// =========================================================================
router.post("/authorize", requireRole("approver"), (req, res) => {
  try {
    const { intent_id, decision, authorized_by, conditions, expires_at, signature, signer_id: requestSignerId } = req.body;

    if (!intent_id || !decision || !authorized_by) {
      return res.status(400).json({
        error: "Missing required fields: intent_id, decision, authorized_by",
      });
    }

    if (!["approved", "denied"].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be "approved" or "denied".' });
    }

    const intent = getIntent(intent_id);
    if (!intent) {
      return res.status(404).json({ error: `Intent not found: ${intent_id}` });
    }

    if (intent.status !== "governed") {
      return res.status(409).json({
        error: `Intent is in status "${intent.status}", expected "governed".`,
      });
    }

    const timestamp = new Date().toISOString();
    let signatureVerified = false;
    let signaturePayloadHash = null;

    // ---------------------------------------------------------------
    // Ed25519 Signature Verification
    // ---------------------------------------------------------------
    if (signature) {
      // Build the canonical payload that should have been signed
      const payload = buildSignaturePayload({
        intent_id,
        action: intent.action,
        decision,
        signer_id: requestSignerId || authorized_by,
        timestamp: req.body.signature_timestamp || timestamp,
      });

      // Load the signer's public key from PostgreSQL (WS-010: Identity Binding)
      // Use explicit signer_id if provided, fall back to authorized_by
      const signerId = requestSignerId || authorized_by;
      const publicKeyHex = getSignerPublicKey(signerId);
      if (!publicKeyHex) {
        return res.status(403).json({
          error: `No registered public key for signer: ${signerId}`,
          hint: "Register the signer's Ed25519 public key via POST /api/signers/register or /api/signers/generate-keypair.",
        });
      }

      const valid = verifySignature(payload, signature, publicKeyHex);
      if (!valid) {
        // FAIL CLOSED — invalid signature means no authorization
        appendEntry({
          intent_id,
          action: intent.action,
          agent_id: intent.agent_id,
          status: "blocked",
          detail: `Authorization BLOCKED: Invalid Ed25519 signature from ${authorized_by}`,
        });

        console.log(`[RIO Gateway] SIGNATURE INVALID: ${intent_id} — rejected signature from ${authorized_by}`);

        return res.status(403).json({
          intent_id,
          status: "blocked",
          reason: "Ed25519 signature verification failed. Authorization denied.",
        });
      }

      signatureVerified = true;
      signaturePayloadHash = hashPayload(payload);
      console.log(`[RIO Gateway] Ed25519 signature VERIFIED for ${authorized_by}`);
    } else if (ED25519_MODE === "required") {
      // No signature provided but mode is required — fail closed
      return res.status(400).json({
        error: "Ed25519 signature is required for authorization.",
        hint: "Include 'signature' and 'signature_timestamp' fields in the request.",
      });
    }

    // Build authorization record
    const resolvedSignerId = requestSignerId || authorized_by;
    const authorization = {
      intent_id,
      decision,
      authorized_by,
      signer_id: resolvedSignerId,
      timestamp,
      conditions: conditions || null,
      expires_at: expires_at || null,
      ed25519_signed: signatureVerified,
      signature_payload_hash: signaturePayloadHash,
      // Area 1: Principal attribution
      principal_id: req.principal?.principal_id || null,
      principal_role: req.principal?.primary_role || null,
    };

    const authHash = hashAuthorization(authorization);
    const newStatus = decision === "approved" ? "authorized" : "denied";

    updateIntent(intent_id, {
      status: newStatus,
      authorization: { ...authorization, authorization_hash: authHash },
    });

    // Write to ledger
    appendEntry({
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      status: newStatus,
      detail: `Authorization: ${decision} by ${authorized_by}${signatureVerified ? " (Ed25519 SIGNED)" : " (unsigned)"}`,
      authorization_hash: authHash,
      intent_hash: hashIntent(intent),
    });

    console.log(`[RIO Gateway] Authorization: ${intent_id} — ${decision} by ${authorized_by}${signatureVerified ? " (Ed25519)" : ""}`);  

    res.json({
      intent_id,
      status: newStatus,
      authorization_status: newStatus,
      authorized_by,
      signer_id: resolvedSignerId,
      authorization_hash: authHash,
      signature_verified: signatureVerified,
      ed25519_signed: signatureVerified,
      signature_payload_hash: signaturePayloadHash,
      timestamp,
    });
  } catch (err) {
    console.error(`[RIO Gateway] Authorize error: ${err.message}`);
    res.status(500).json({ error: "Internal error during authorization." });
  }
});

// =========================================================================
// POST /approvals/:intent_id — Record approval/denial decision
// Per Gateway API Contract: POST /approvals/:intent_id
// Writes to the separate approvals table with approver_id, decision, signature.
// Enforces: proposer ≠ approver (the principal who created the intent cannot approve it).
// =========================================================================
router.post("/approvals/:intent_id", requireRole("approver"), async (req, res) => {
  try {
    const { intent_id } = req.params;
    const { decision, reason, signature, signer_id: requestSignerId } = req.body;

    if (!decision) {
      return res.status(400).json({ error: "Missing required field: decision" });
    }
    if (!["approved", "denied"].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be \"approved\" or \"denied\".' });
    }

    const intent = getIntent(intent_id);
    if (!intent) {
      return res.status(404).json({ error: `Intent not found: ${intent_id}` });
    }

    if (intent.status !== "governed") {
      return res.status(409).json({
        error: `Intent is in status "${intent.status}", expected "governed".`,
      });
    }

    // INVARIANT: Proposer cannot approve their own intent
    const approverId = req.principal?.principal_id;
    if (intent.principal_id && approverId === intent.principal_id) {
      return res.status(403).json({
        error: "Self-authorization denied. The proposer cannot approve their own intent.",
        invariant: "proposer_ne_approver",
      });
    }

    // Check if this approver already voted on this intent
    const existingApproval = await getApprovalByApprover(intent_id, approverId);
    if (existingApproval) {
      return res.status(409).json({
        error: `Approver ${approverId} has already voted on this intent.`,
        existing_decision: existingApproval.decision,
      });
    }

    const timestamp = new Date().toISOString();
    let signatureVerified = false;
    let signaturePayloadHash = null;

    // Ed25519 Signature Verification (if provided)
    if (signature) {
      const payload = buildSignaturePayload({
        intent_id,
        action: intent.action,
        decision,
        signer_id: requestSignerId || approverId,
        timestamp: req.body.signature_timestamp || timestamp,
      });
      const signerId = requestSignerId || approverId;
      const publicKeyHex = getSignerPublicKey(signerId);
      if (!publicKeyHex) {
        return res.status(403).json({
          error: `No registered public key for signer: ${signerId}`,
        });
      }
      const valid = verifySignature(payload, signature, publicKeyHex);
      if (!valid) {
        appendEntry({
          intent_id,
          action: intent.action,
          agent_id: intent.agent_id,
          status: "blocked",
          detail: `Approval BLOCKED: Invalid Ed25519 signature from ${approverId}`,
        });
        return res.status(403).json({
          intent_id,
          status: "blocked",
          reason: "Ed25519 signature verification failed.",
        });
      }
      signatureVerified = true;
      signaturePayloadHash = hashPayload(payload);
    } else if (ED25519_MODE === "required") {
      return res.status(400).json({
        error: "Ed25519 signature is required for approvals.",
      });
    }

    // Write to approvals table
    const approval = await createApproval({
      intent_id,
      approver_id: approverId,
      decision,
      reason: reason || null,
      signature: signature || null,
      signature_payload_hash: signaturePayloadHash,
      ed25519_signed: signatureVerified,
      principal_id: approverId,
      principal_role: req.principal?.primary_role || null,
    });

    // Build authorization record (same as /authorize for backward compat)
    const authorization = {
      intent_id,
      decision,
      authorized_by: approverId,
      signer_id: requestSignerId || approverId,
      timestamp,
      conditions: null,
      expires_at: null,
      ed25519_signed: signatureVerified,
      signature_payload_hash: signaturePayloadHash,
      principal_id: approverId,
      principal_role: req.principal?.primary_role || null,
      approval_id: approval.approval_id,
    };

    const authHash = hashAuthorization(authorization);
    const newStatus = decision === "approved" ? "authorized" : "denied";

    updateIntent(intent_id, {
      status: newStatus,
      authorization: { ...authorization, authorization_hash: authHash },
    });

    // Write to ledger
    appendEntry({
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      status: newStatus,
      detail: `Approval: ${decision} by ${approverId} (approval_id: ${approval.approval_id})${signatureVerified ? " (Ed25519 SIGNED)" : " (unsigned)"}`,
      authorization_hash: authHash,
      intent_hash: hashIntent(intent),
    });

    console.log(`[RIO Gateway] Approval: ${intent_id} — ${decision} by ${approverId} (approval_id: ${approval.approval_id})`);

    res.json({
      intent_id,
      approval_id: approval.approval_id,
      status: newStatus,
      decision,
      approver_id: approverId,
      authorization_hash: authHash,
      signature_verified: signatureVerified,
      timestamp,
    });
  } catch (err) {
    console.error(`[RIO Gateway] Approval error: ${err.message}`);
    res.status(500).json({ error: "Internal error recording approval." });
  }
});

// =========================================================================
// GET /approvals/:intent_id — List all approvals for an intent
// =========================================================================
router.get("/approvals/:intent_id", requirePrincipal, async (req, res) => {
  try {
    const { intent_id } = req.params;
    const intent = getIntent(intent_id);
    if (!intent) {
      return res.status(404).json({ error: `Intent not found: ${intent_id}` });
    }
    const approvals = await getApprovalsByIntent(intent_id);
    res.json({
      intent_id,
      approvals,
      count: approvals.length,
    });
  } catch (err) {
    console.error(`[RIO Gateway] List approvals error: ${err.message}`);
    res.status(500).json({ error: "Internal error listing approvals." });
  }
});

// =========================================================================
// GET /approvals — List all pending intents that need approval
// =========================================================================
router.get("/approvals", requireRole("approver"), async (req, res) => {
  try {
    // Use in-memory intent store (listIntents) since intents are not in PostgreSQL.
    // getPendingApprovals() queries PostgreSQL which has no intent rows.
    const allGoverned = listIntents("governed");
    const pending = allGoverned.filter(
      (i) =>
        i.governance &&
        (i.governance.governance_decision === "REQUIRE_HUMAN" ||
         i.governance.governance_decision === "REQUIRE_QUORUM")
    );
    res.json({ pending_approvals: pending, pending: pending, count: pending.length });
  } catch (err) {
    console.error(`[RIO Gateway] Pending approvals error: ${err.message}`);
    res.status(500).json({ error: "Internal error fetching pending approvals." });
  }
});

// =========================================================================
// POST /execute — Execute an authorized action
// =========================================================================
router.post("/execute", requireRole("executor"), (req, res) => {
  try {
    const { intent_id } = req.body;

    if (!intent_id) {
      return res.status(400).json({ error: "Missing required field: intent_id" });
    }

    const intent = getIntent(intent_id);
    if (!intent) {
      return res.status(404).json({ error: `Intent not found: ${intent_id}` });
    }

    // FAIL CLOSED: Only authorized intents can execute
    if (intent.status !== "authorized") {
      const reason =
        intent.status === "denied"
          ? "Intent was denied by human authority."
          : intent.status === "blocked"
          ? "Intent was blocked by governance policy."
          : `Intent is in status "${intent.status}", expected "authorized".`;

      appendEntry({
        intent_id,
        action: intent.action,
        agent_id: intent.agent_id,
        status: "blocked",
        detail: `Execution blocked: ${reason}`,
      });

      console.log(`[RIO Gateway] EXECUTION BLOCKED: ${intent_id} — ${reason}`);

      return res.status(403).json({
        intent_id,
        status: "blocked",
        reason,
      });
    }

    // Check authorization expiry (explicit expires_at)
    if (intent.authorization?.expires_at) {
      const expiresAt = new Date(intent.authorization.expires_at);
      if (expiresAt < new Date()) {
        updateIntent(intent_id, { status: "blocked" });
        appendEntry({
          intent_id,
          action: intent.action,
          agent_id: intent.agent_id,
          status: "blocked",
          detail: "Execution blocked: Authorization has expired.",
        });
        return res.status(403).json({
          intent_id,
          status: "blocked",
          reason: "Authorization has expired. Re-authorization required.",
        });
      }
    }

    // Area 2: Policy-based TTL expiration check
    const approvalTtl = intent.governance?.approval_ttl;
    const authTimestamp = intent.authorization?.timestamp;
    if (approvalTtl && authTimestamp && isApprovalExpired(authTimestamp, approvalTtl)) {
      updateIntent(intent_id, { status: "blocked" });
      appendEntry({
        intent_id,
        action: intent.action,
        agent_id: intent.agent_id,
        status: "blocked",
        detail: `Execution blocked: Approval TTL expired (${approvalTtl}s for risk tier ${intent.governance?.risk_tier}).`,
      });
      return res.status(403).json({
        intent_id,
        status: "blocked",
        reason: `Approval has expired. TTL for risk tier ${intent.governance?.risk_tier} is ${approvalTtl} seconds.`,
      });
    }

    // ---------------------------------------------------------------
    // EXECUTION — Issue execution token for the authorized agent
    // The agent must execute externally (e.g., via MCP) and then
    // call /execute-confirm with the result.
    // ---------------------------------------------------------------
    const timestamp = new Date().toISOString();

    // Collect CC recipients from parameters
    const ccList = [];
    if (intent.parameters) {
      for (const [key, val] of Object.entries(intent.parameters)) {
        if (key.startsWith("cc") && typeof val === "string" && val.includes("@")) {
          ccList.push(val);
        }
      }
    }

    // ---------------------------------------------------------------
    // HARDENED: Issue single-use execution token (Fix #1: Token Burn)
    // The token is a cryptographic UUID that can be used EXACTLY ONCE.
    // ---------------------------------------------------------------
    const { token: burnableToken, expires_at: tokenExpiresAt } = issueExecutionToken(intent_id);

    // Build the execution token — this is what the agent uses to prove
    // the gateway authorized this specific action
    const executionToken = {
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      authorized_by: intent.authorization?.authorized_by,
      authorization_hash: intent.authorization?.authorization_hash,
      parameters: intent.parameters,
      cc_recipients: ccList,
      issued_at: timestamp,
      status: "execute_now",
      execution_token: burnableToken,
      token_expires_at: tokenExpiresAt,
    };

    // Move intent to "executing" state
    updateIntent(intent_id, {
      status: "executing",
      execution_token: executionToken,
    });

    // Write to ledger
    appendEntry({
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      status: "executing",
      detail: `Execution token issued (single-use, expires ${tokenExpiresAt}). Agent must execute and confirm.`,
      intent_hash: hashIntent(intent),
    });

    console.log(`[RIO Gateway] Execution token issued: ${intent_id} — single-use, expires ${tokenExpiresAt}`);

    res.json({
      intent_id,
      status: "execute_now",
      execution_token: executionToken,
      instruction: "Execute the action externally, then POST to /execute-confirm with intent_id, execution_result, and execution_token.",
      timestamp,
    });
  } catch (err) {
    console.error(`[RIO Gateway] Execute error: ${err.message}`);
    res.status(500).json({ error: "Internal error during execution." });
  }
});

// =========================================================================
// POST /execute-confirm — Agent confirms external execution with result
// =========================================================================
router.post("/execute-confirm", requireRole("executor"), (req, res) => {
  try {
    const { intent_id, execution_result, connector, execution_token } = req.body;

    if (!intent_id || !execution_result) {
      return res.status(400).json({
        error: "Missing required fields: intent_id, execution_result",
      });
    }

    const intent = getIntent(intent_id);
    if (!intent) {
      return res.status(404).json({ error: `Intent not found: ${intent_id}` });
    }

    // Must be in "executing" state (token was issued)
    if (intent.status !== "executing") {
      return res.status(409).json({
        error: `Intent is in status "${intent.status}", expected "executing".`,
      });
    }

    // ---------------------------------------------------------------
    // HARDENED: Validate and burn execution token (Fix #1: Token Burn)
    // Token can only be used ONCE. Replay attempts are rejected.
    // ---------------------------------------------------------------
    const tokenToValidate = execution_token || intent.execution_token?.execution_token;
    const burnResult = validateAndBurnToken(intent_id, tokenToValidate);
    if (!burnResult.valid) {
      appendEntry({
        intent_id,
        action: intent.action,
        agent_id: intent.agent_id,
        status: "blocked",
        detail: `Execution-confirm BLOCKED: ${burnResult.reason}`,
      });

      console.log(`[RIO Gateway] TOKEN BURN FAILED: ${intent_id} — ${burnResult.reason}`);

      return res.status(403).json({
        intent_id,
        status: "blocked",
        reason: burnResult.reason,
        hint: "Execution tokens are single-use. Request a new token via POST /execute.",
      });
    }

    const timestamp = new Date().toISOString();
    const connectorUsed = connector || "external";

    const execution = {
      intent_id,
      action: intent.action,
      result: execution_result,
      connector: connectorUsed,
      timestamp,
      // Area 1: Principal attribution
      principal_id: req.principal?.principal_id || null,
      principal_role: req.principal?.primary_role || null,
    };

    const executionHash = hashExecution(execution);

    updateIntent(intent_id, {
      status: "executed",
      execution: { ...execution, execution_hash: executionHash },
    });

    // Write to ledger
    appendEntry({
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      status: "executed",
      detail: `Executed: ${intent.action} (${connectorUsed}) — confirmed by agent`,
      intent_hash: hashIntent(intent),
    });

    console.log(`[RIO Gateway] Execution confirmed: ${intent_id} — ${intent.action} via ${connectorUsed}`);

    res.json({
      intent_id,
      status: "executed",
      execution_hash: executionHash,
      connector: connectorUsed,
      result: execution_result,
      timestamp,
    });
  } catch (err) {
    console.error(`[RIO Gateway] Execute-confirm error: ${err.message}`);
    res.status(500).json({ error: "Internal error confirming execution." });
  }
});

// =========================================================================
// POST /receipt — Generate cryptographic receipt
// =========================================================================
router.post("/receipt", requireRole("executor", "auditor"), (req, res) => {
  try {
    const { intent_id } = req.body;

    if (!intent_id) {
      return res.status(400).json({ error: "Missing required field: intent_id" });
    }

    const intent = getIntent(intent_id);
    if (!intent) {
      return res.status(404).json({ error: `Intent not found: ${intent_id}` });
    }

    if (intent.status !== "executed") {
      return res.status(409).json({
        error: `Intent is in status "${intent.status}", expected "executed".`,
      });
    }

    // Generate the full receipt with v2.1 fields: receipt_type, ingestion, identity_binding
    const signerIdForReceipt = intent.authorization?.signer_id || intent.authorization?.authorized_by;
    const signerPubKey = signerIdForReceipt ? getSignerPublicKey(signerIdForReceipt) : null;

    const receipt = generateReceipt({
      intent_hash: hashIntent(intent),
      governance_hash: intent.governance?.governance_hash || "",
      authorization_hash: intent.authorization?.authorization_hash || "",
      execution_hash: intent.execution?.execution_hash || "",
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      authorized_by: intent.authorization?.authorized_by || "unknown",
      // v2.1: Receipt type
      receipt_type: "governed_action",
      // v2.1: Ingestion provenance
      ingestion: buildIngestion({
        source: intent._intake?.context?.ingestion_source || "api",
        channel: intent._intake?.context?.ingestion_channel || "POST /intent",
        source_message_id: intent._intake?.context?.source_message_id || null,
      }),
      // v2.1 + Area 1: Identity binding with principal attribution
      identity_binding: {
        signer_id: signerIdForReceipt || null,
        public_key_hex: signerPubKey || null,
        signature_payload_hash: intent.authorization?.signature_payload_hash || null,
        verification_method: intent.authorization?.ed25519_signed ? "ed25519" : null,
        ed25519_signed: intent.authorization?.ed25519_signed || false,
        // Area 1: Principal fields
        principal_id: intent.authorization?.principal_id || req.principal?.principal_id || null,
        role_exercised: intent.authorization?.principal_role || req.principal?.primary_role || null,
        actor_type: req.principal?.actor_type || null,
      },
    });

    updateIntent(intent_id, {
      status: "receipted",
      receipt,
    });

    // Write to ledger
    appendEntry({
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      status: "receipted",
      detail: `Receipt generated: ${receipt.receipt_id}`,
      receipt_hash: receipt.hash_chain.receipt_hash,
      intent_hash: hashIntent(intent),
    });

    console.log(`[RIO Gateway] Receipt: ${intent_id} — ${receipt.receipt_id}`);

    res.json(receipt);
  } catch (err) {
    console.error(`[RIO Gateway] Receipt error: ${err.message}`);
    res.status(500).json({ error: "Internal error generating receipt." });
  }
});

// =========================================================================
// POST /execute-action — Full execution pipeline in one call
// Verifies intent is authorized → sends email → generates receipt → writes ledger
// This is the "close the loop" endpoint for the first governed action.
// =========================================================================
router.post("/execute-action", requireRole("proposer"), async (req, res) => {
  try {
    const { intent_id } = req.body;
    if (!intent_id) {
      return res.status(400).json({ error: "Missing required field: intent_id" });
    }

    const intent = getIntent(intent_id);
    if (!intent) {
      return res.status(404).json({ error: `Intent not found: ${intent_id}` });
    }

    // Must be authorized (approved by human)
    if (intent.status !== "authorized") {
      return res.status(409).json({
        error: `Intent is in status "${intent.status}", expected "authorized".`,
        hint: "The intent must be approved before it can be executed.",
      });
    }

    // Check authorization expiry
    if (intent.authorization?.expires_at) {
      const expiresAt = new Date(intent.authorization.expires_at);
      if (expiresAt < new Date()) {
        updateIntent(intent_id, { status: "blocked" });
        appendEntry({
          intent_id,
          action: intent.action,
          agent_id: intent.agent_id,
          status: "blocked",
          detail: "Execution blocked: Authorization has expired.",
        });
        return res.status(403).json({
          intent_id,
          status: "blocked",
          reason: "Authorization has expired.",
        });
      }
    }

    // Policy-based TTL check
    const approvalTtl = intent.governance?.approval_ttl;
    const authTimestamp = intent.authorization?.timestamp;
    if (approvalTtl && authTimestamp && isApprovalExpired(authTimestamp, approvalTtl)) {
      updateIntent(intent_id, { status: "blocked" });
      appendEntry({
        intent_id,
        action: intent.action,
        agent_id: intent.agent_id,
        status: "blocked",
        detail: `Execution blocked: Approval TTL expired (${approvalTtl}s).`,
      });
      return res.status(403).json({
        intent_id,
        status: "blocked",
        reason: `Approval has expired. TTL is ${approvalTtl} seconds.`,
      });
    }

    // ——— ITEM 1: Issue authorization token after verifying approval ————
    const { token: executionToken, expires_at: tokenExpiresAt } = issueExecutionToken(intent_id);
    const tokenId = executionToken; // UUID token string serves as token_id

    console.log(`[RIO Gateway] Token issued for ${intent_id} — expires ${tokenExpiresAt}`);

    appendEntry({
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      status: "token_issued",
      detail: `Authorization token issued (single-use, expires ${tokenExpiresAt}).`,
    });

    // ——— ITEM 2 + 3: Validate and burn token before execution ——————————
    // validateAndBurnToken is single-use: it marks the token as burned on
    // first call. If the same token is presented again, it returns
    // { valid: false, reason: "...already been used..." }.
    const burnResult = validateAndBurnToken(intent_id, executionToken);
    if (!burnResult.valid) {
      // FAIL CLOSED: token validation failed — do not execute
      appendEntry({
        intent_id,
        action: intent.action,
        agent_id: intent.agent_id,
        status: "blocked",
        detail: `Execution BLOCKED: Token validation failed — ${burnResult.reason}`,
      });
      return res.status(403).json({
        intent_id,
        status: "blocked",
        reason: burnResult.reason,
      });
    }

    console.log(`[RIO Gateway] Token validated and burned for ${intent_id}`);

    // ——— STEP 1: Execute the action ———————————————————————————————
    const timestamp = new Date().toISOString();
    let executionResult;

    // Check if caller requests external delivery (caller will send email via OAuth/MCP)
    const deliveryMode = req.body.delivery_mode || "gateway";

    if (intent.action === "send_email") {
      // Extract email parameters
      const params = intent.parameters || {};
      const to = params.to || params.recipient;
      const subject = params.subject || "(no subject)";
      const body = params.body || params.content || params.message || "";
      const cc = params.cc ? (Array.isArray(params.cc) ? params.cc : [params.cc]) : [];

      if (!to) {
        return res.status(400).json({
          error: "Cannot execute send_email: missing 'to' or 'recipient' in parameters.",
        });
      }

      if (deliveryMode === "external") {
        // External delivery mode: Gateway handles ALL governance (token, receipt, ledger)
        // but the caller is responsible for actually sending the email.
        // We record execution as "external_pending" and return the email payload.
        executionResult = {
          status: "external_pending",
          connector: "external",
          detail: `Email delivery delegated to external caller. To: ${to}, Subject: ${subject}`,
          email_payload: { to, cc, subject, body },
        };
      } else {
        // Gateway delivery mode: send via nodemailer SMTP
        try {
          executionResult = await sendEmail({ to, cc, subject, body });
        } catch (emailErr) {
          // SMTP failed — fall back to external mode instead of blocking
          console.warn(`[RIO Gateway] SMTP failed (${emailErr.message}) — switching to external delivery mode`);
          executionResult = {
            status: "external_pending",
            connector: "external_fallback",
            detail: `SMTP failed: ${emailErr.message}. Email delivery delegated to external caller. To: ${to}, Subject: ${subject}`,
            email_payload: { to, cc, subject, body },
            smtp_error: emailErr.message,
          };
        }
      }
    } else if (intent.action === "send_sms") {
      // Extract SMS parameters
      const params = intent.parameters || {};
      const to = params.to || params.phone || params.recipient;
      const smsBody = params.body || params.message || params.content || "";

      if (!to) {
        return res.status(400).json({
          error: "Cannot execute send_sms: missing 'to', 'phone', or 'recipient' in parameters.",
        });
      }

      try {
        executionResult = await sendSms({ to, body: smsBody });
      } catch (smsErr) {
        console.warn(`[RIO Gateway] Twilio SMS failed (${smsErr.message})`);
        executionResult = {
          status: "failed",
          connector: "twilio_sms",
          detail: `SMS failed: ${smsErr.message}. To: ${to}`,
          sms_error: smsErr.message,
        };
      }
    } else {
      // For other actions, record as simulated execution
      executionResult = {
        status: "simulated",
        connector: "none",
        detail: `Action '${intent.action}' executed (simulated — no connector configured).`,
      };
    }

    // ——— STEP 2: Record execution ——————————————————————————————————
    const execution = {
      intent_id,
      action: intent.action,
      result: executionResult,
      connector: executionResult.connector,
      timestamp,
      principal_id: req.principal?.principal_id || null,
      principal_role: req.principal?.primary_role || null,
    };
    const executionHash = hashExecution(execution);

    updateIntent(intent_id, {
      status: "executed",
      execution: { ...execution, execution_hash: executionHash },
    });

    appendEntry({
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      status: "executed",
      detail: `Executed: ${intent.action} (${executionResult.connector}) — ${executionResult.detail?.substring(0, 200)}`,
      intent_hash: hashIntent(intent),
    });

    console.log(`[RIO Gateway] Executed: ${intent_id} — ${intent.action} via ${executionResult.connector}`);

    // ——— STEP 3: Generate receipt ——————————————————————————————————
    const receipt = generateReceipt({
      intent_hash: hashIntent(intent),
      governance_hash: intent.governance?.governance_hash || "",
      authorization_hash: intent.authorization?.authorization_hash || "",
      execution_hash: executionHash,
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      authorized_by: intent.authorization?.authorized_by || "unknown",
      receipt_type: "governed_action",
      ingestion: buildIngestion({
        source: "one_pwa",
        channel: "POST /execute-action",
      }),
    });

    // ——— POLICY-COMPLIANT RECEIPT FIELDS (Governance Policy v1, Section 6) ——
    // Canonical policy_hash: SHA-256 of governance/GOVERNANCE_POLICY_V1.md
    const CANONICAL_POLICY_HASH = "df474ff9f0c7d80c28c3d2393bef41b80f72439c3c8ed59b389a7f7aabbe409d";

    // proposer_id — who proposed the intent
    receipt.proposer_id = intent.agent_id || intent.proposer_id || req.principal?.principal_id || "unknown";
    // approver_id — who approved the intent
    receipt.approver_id = intent.authorization?.authorized_by || "unknown";
    // token_id — from the token issued above
    receipt.token_id = tokenId;
    // policy_hash — bind to the canonical governance policy v1
    receipt.policy_hash = CANONICAL_POLICY_HASH;
    // execution_result — the raw result from the connector
    receipt.execution_result = executionResult;
    // execution_hash — the SHA-256 of the execution record (top-level alias)
    receipt.execution_hash = executionHash;
    // timestamp_proposed — when the intent was created
    receipt.timestamp_proposed = intent.created_at || intent.timestamp || null;
    // timestamp_approved — when the intent was approved
    receipt.timestamp_approved = intent.authorization?.timestamp || null;
    // timestamp_executed — when execution completed
    receipt.timestamp_executed = timestamp;
    // decision_delta — time between proposal and approval (Section 7)
    const tProposed = receipt.timestamp_proposed ? new Date(receipt.timestamp_proposed).getTime() : null;
    const tApproved = receipt.timestamp_approved ? new Date(receipt.timestamp_approved).getTime() : null;
    receipt.decision_delta_ms = (tProposed && tApproved) ? (tApproved - tProposed) : null;
    // previous_receipt_hash — from the last ledger entry's hash
    receipt.previous_receipt_hash = getCurrentHash() || null;
    // ledger_entry_id — will be set after ledger write (see below)

    // ——— ITEM 5: Sign receipt with Gateway Ed25519 key ————————————
    const receiptHash = receipt.hash_chain.receipt_hash;
    const gatewayKeypair = getGatewayKeypair();
    const signaturePayload = buildSignaturePayload({
      intent_id,
      action: intent.action,
      decision: "receipted",
      signer_id: "gateway",
      timestamp,
    });
    const receiptSignature = signPayload(signaturePayload, gatewayKeypair.secretKey);
    receipt.receipt_signature = receiptSignature;
    receipt.gateway_public_key = gatewayKeypair.publicKey;
    receipt.signature_payload_hash = hashPayload(signaturePayload);

    console.log(`[RIO Gateway] Receipt signed with Gateway Ed25519 key`);

    updateIntent(intent_id, {
      status: "receipted",
      receipt,
    });

    // ——— STEP 4: Write receipt to ledger ——————————————————————————
    const ledgerEntry = appendEntry({
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      status: "receipted",
      detail: `Receipt generated: ${receipt.receipt_id}`,
      receipt_hash: receipt.hash_chain.receipt_hash,
      intent_hash: hashIntent(intent),
      proposer_id: receipt.proposer_id,
      approver_id: receipt.approver_id,
      token_id: tokenId,
      policy_hash: receipt.policy_hash,
      execution_hash: receipt.execution_hash,
      decision_delta_ms: receipt.decision_delta_ms,
      timestamp_proposed: receipt.timestamp_proposed,
      timestamp_approved: receipt.timestamp_approved,
      timestamp_executed: receipt.timestamp_executed,
      receipt_signature: receiptSignature,
    });

    // Set ledger_entry_id on receipt (now that we have it)
    receipt.ledger_entry_id = ledgerEntry?.entry_id || ledgerEntry?.id || null;
    // Update intent with final receipt including ledger_entry_id
    updateIntent(intent_id, { receipt });

    // ——— Persist receipt to PostgreSQL (survives redeploys) ———————
    await storeReceipt(receipt);

    console.log(`[RIO Gateway] Receipt: ${intent_id} — ${receipt.receipt_id}`);
    console.log(`[RIO Gateway] ✓ FULL LOOP CLOSED: ${intent.action} — submit → govern → approve → token → execute → burn → receipt → sign → ledger`);

    // Return the complete result
    const responsePayload = {
      intent_id,
      status: "receipted",
      pipeline: "complete",
      execution: {
        connector: executionResult.connector,
        status: executionResult.status,
        detail: executionResult.detail,
        message_id: executionResult.message_id || null,
      },
      receipt: {
        receipt_id: receipt.receipt_id,
        receipt_hash: receipt.hash_chain.receipt_hash,
        hash_chain: receipt.hash_chain,
        proposer_id: receipt.proposer_id,
        approver_id: receipt.approver_id,
        token_id: receipt.token_id,
        policy_hash: receipt.policy_hash,
        execution_hash: receipt.execution_hash,
        execution_result: receipt.execution_result,
        timestamp_proposed: receipt.timestamp_proposed,
        timestamp_approved: receipt.timestamp_approved,
        timestamp_executed: receipt.timestamp_executed,
        decision_delta_ms: receipt.decision_delta_ms,
        previous_receipt_hash: receipt.previous_receipt_hash,
        ledger_entry_id: receipt.ledger_entry_id,
        receipt_signature: receipt.receipt_signature,
        gateway_public_key: receipt.gateway_public_key,
      },
      timestamp,
    };

    // If external delivery, include the email payload so caller can send it
    if (executionResult.email_payload) {
      responsePayload.email_payload = executionResult.email_payload;
      responsePayload.delivery_mode = executionResult.connector === "external" ? "external" : "external_fallback";
      responsePayload.delivery_instruction = "Email not yet sent. Use the email_payload to send via your preferred method (OAuth, MCP, etc). The receipt and ledger entry are already written.";
    }

    res.json(responsePayload);
  } catch (err) {
    console.error(`[RIO Gateway] Execute-action error: ${err.message}`);
    res.status(500).json({ error: "Internal error during execute-action." });
  }
});

// =========================================================================
// GET /ledger — View ledger entries
// =========================================================================
router.get("/ledger", requireRole("auditor"), (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const intentId = req.query.intent_id;

    let entries;
    if (intentId) {
      entries = getEntriesByIntent(intentId);
    } else {
      entries = getEntries(limit, offset);
    }

    res.json({
      entries,
      total: getEntryCount(),
      chain_tip: getCurrentHash(),
    });
  } catch (err) {
    console.error(`[RIO Gateway] Ledger error: ${err.message}`);
    res.status(500).json({ error: "Internal error reading ledger." });
  }
});

// =========================================================================
// GET /verify — Verify receipt hash chain integrity
// =========================================================================
router.get("/verify", requireRole("auditor"), (req, res) => {
  try {
    const receiptId = req.query.receipt_id;
    const intentId = req.query.intent_id;

    // If a specific intent is requested, verify its receipt
    if (intentId) {
      const intent = getIntent(intentId);
      if (!intent) {
        return res.status(404).json({ error: `Intent not found: ${intentId}` });
      }
      if (!intent.receipt) {
        return res.status(404).json({ error: `No receipt found for intent: ${intentId}` });
      }

      const receiptVerification = verifyReceipt(intent.receipt);
      const chainVerification = verifyChain();

      return res.json({
        receipt_verification: receiptVerification,
        ledger_chain_verification: chainVerification,
      });
    }

    // Otherwise, verify the full ledger chain
    const chainVerification = verifyChain();
    res.json({
      ledger_chain_verification: chainVerification,
    });
  } catch (err) {
    console.error(`[RIO Gateway] Verify error: ${err.message}`);
    res.status(500).json({ error: "Internal error during verification." });
  }
});

// =========================================================================
// GET /health — System health check
// =========================================================================
router.get("/health", (req, res) => {
  try {
    const chainStatus = verifyChain();
    const stats = getStats();
    const config = getAllConfig();

    res.json({
      status: "operational",
      gateway: "RIO Governance Gateway",
      version: "2.9.0",
      timestamp: new Date().toISOString(),
      governance: {
        constitution_loaded: !!config.constitution,
        policy_v1_loaded: !!config.policy,
        policy_v2: {
          active: !!getActivePolicy(),
          version: getActivePolicy()?.policy_version || null,
          hash: getActivePolicy()?.policy_hash?.substring(0, 16) || null,
          action_classes: getActivePolicy()?.action_classes?.length || 0,
        },
        system_mode: getSystemMode(),
        roles_loaded: {
          manus: !!config.role_manus,
          gemini: !!config.role_gemini,
        },
      },
      ledger: {
        entries: getEntryCount(),
        chain_valid: chainStatus.valid,
        chain_tip: getCurrentHash(),
        hashes_verified: chainStatus.hashes_verified || chainStatus.entries_checked,
        hash_mismatches: chainStatus.hash_mismatches || 0,
        linkage_breaks: chainStatus.linkage_breaks || 0,
        epochs: chainStatus.epochs || 1,
        current_epoch: chainStatus.current_epoch || null,
      },
      pipeline_stats: stats,
      hardening: {
        ed25519_mode: ED25519_MODE,
        token_burn: true,
        replay_prevention: true,
        active_tokens: getActiveTokenCount(),
        replay_stats: getReplayPreventionStats(),
      },
      gmail: {
        configured: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
        user_set: !!process.env.GMAIL_USER,
        pass_set: !!process.env.GMAIL_APP_PASSWORD,
      },
      twilio: {
        configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER),
        sid_set: !!process.env.TWILIO_ACCOUNT_SID,
        token_set: !!process.env.TWILIO_AUTH_TOKEN,
        phone_set: !!process.env.TWILIO_PHONE_NUMBER,
      },
      principals: {
        enforcement: "active",
        role_gating: true,
        fail_closed: true,
      },
      fail_mode: "closed",
    });
  } catch (err) {
    res.status(500).json({
      status: "degraded",
      error: err.message,
    });
  }
});

// =========================================================================
// GET /intents — List intents (utility endpoint)
// =========================================================================
router.get("/intents", requirePrincipal, (req, res) => {
  try {
    const status = req.query.status;
    const limit = parseInt(req.query.limit) || 50;
    const intents = listIntents(status, limit);
    res.json({ intents, count: intents.length });
  } catch (err) {
    res.status(500).json({ error: "Internal error listing intents." });
  }
});

// =========================================================================
// GET /intent/:id — Get a specific intent with full pipeline state
// =========================================================================
router.get("/intent/:id", requirePrincipal, (req, res) => {
  try {
    const intent = getIntent(req.params.id);
    if (!intent) {
      return res.status(404).json({ error: `Intent not found: ${req.params.id}` });
    }
    res.json(intent);
  } catch (err) {
    res.status(500).json({ error: "Internal error reading intent." });
  }
});

export default router;
