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
import {
  appendEntry,
  getEntries,
  getEntriesByIntent,
  getEntryCount,
  verifyChain,
  getCurrentHash,
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
import {
  buildSignaturePayload,
  verifySignature,
  hashPayload,
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

    // Evaluate against policy
    const decision = evaluateIntent(intent);
    const governanceHash = hashGovernance({ intent_id, ...decision });

    // Update intent
    const newStatus = decision.status === "blocked" ? "blocked" : "governed";
    updateIntent(intent_id, {
      status: newStatus,
      governance: { ...decision, governance_hash: governanceHash },
    });

    // Write to ledger
    appendEntry({
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      status: newStatus,
      detail: `Governance: ${decision.status} — ${decision.reason}`,
      intent_hash: hashIntent(intent),
    });

    console.log(`[RIO Gateway] Governed: ${intent_id} — ${decision.status} (risk: ${decision.risk_level})`);

    res.json({
      intent_id,
      governance_status: decision.status,
      risk_level: decision.risk_level,
      requires_approval: decision.requires_approval,
      reason: decision.reason,
      checks: decision.checks,
      governance_hash: governanceHash,
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
          reason: "Authorization has expired. Re-authorization required.",
        });
      }
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
      version: "2.7.0",
      timestamp: new Date().toISOString(),
      governance: {
        constitution_loaded: !!config.constitution,
        policy_loaded: !!config.policy,
        roles_loaded: {
          manus: !!config.role_manus,
          gemini: !!config.role_gemini,
        },
      },
      ledger: {
        entries: getEntryCount(),
        chain_valid: chainStatus.valid,
        chain_tip: getCurrentHash(),
      },
      pipeline_stats: stats,
      hardening: {
        ed25519_mode: ED25519_MODE,
        token_burn: true,
        replay_prevention: true,
        active_tokens: getActiveTokenCount(),
        replay_stats: getReplayPreventionStats(),
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
