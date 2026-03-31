/**
 * RIO Gateway — Public API v1 Routes (WS-012)
 *
 * Versioned public API endpoints under /api/v1/*.
 * All routes require API key or JWT authentication.
 * Rate limiting is applied per-key.
 *
 * Endpoints:
 *   POST /api/v1/intents          — Submit a new intent
 *   GET  /api/v1/intents          — List intents
 *   GET  /api/v1/intents/:id      — Get intent details
 *   POST /api/v1/intents/:id/govern   — Run governance on intent
 *   POST /api/v1/intents/:id/authorize — Authorize/deny intent
 *   POST /api/v1/intents/:id/execute   — Execute authorized intent
 *   POST /api/v1/intents/:id/confirm   — Confirm execution
 *   POST /api/v1/intents/:id/receipt   — Generate receipt
 *   GET  /api/v1/ledger           — View ledger entries
 *   GET  /api/v1/verify           — Verify hash chain
 *   GET  /api/v1/health           — API health check
 *   GET  /api/v1/docs             — OpenAPI documentation
 *
 * Key Management:
 *   POST   /api/v1/keys           — Create API key (owner only)
 *   GET    /api/v1/keys           — List API keys
 *   DELETE /api/v1/keys/:key_id   — Revoke API key (owner only)
 */
import { Router } from "express";
import { createIntent, getIntent, updateIntent, listIntents, getStats } from "../governance/intents.mjs";
import crypto from "node:crypto";
import { evaluateIntent } from "../governance/policy.mjs";
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
} from "../receipts/receipts.mjs";
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
} from "../security/token-manager.mjs";
import { requireScope, requireAnyAuth } from "../security/api-auth.mjs";
import { createApiKey, listApiKeys, revokeApiKey, getApiKey } from "../security/api-keys.mjs";
import { getOpenApiSpec } from "./openapi.mjs";

const router = Router();

const ED25519_MODE = process.env.ED25519_MODE || "required";

// ---------------------------------------------------------------------------
// Replay prevention fields helper
// ---------------------------------------------------------------------------
// API v1 auto-generates replay prevention fields for convenience
// (Internal routes require them; API v1 adds them transparently)

// ---------------------------------------------------------------------------
// POST /api/v1/intents — Submit a new intent
// Scope: write
// ---------------------------------------------------------------------------
router.post("/intents", requireScope("write"), (req, res) => {
  try {
    let intake;

    if (isIntakeFormat(req.body)) {
      const validation = validateIntake(req.body);
      if (!validation.valid) {
        return res.status(400).json({
          error: "Intake validation failed",
          schema: "RIO Intake Schema v1",
          errors: validation.errors,
        });
      }
      intake = validation.intake;
    } else {
      const { action, agent_id } = req.body;
      if (!action) {
        return res.status(400).json({
          error: "Missing required field: action",
          hint: "Use Intake Schema v1 { identity, intent, context } or provide { action, agent_id }.",
        });
      }
      // For API key auth, use the key owner as agent_id if not provided
      const effectiveAgentId = agent_id || req.apiKey?.owner_id || req.user?.sub || "unknown";
      intake = normalizeLegacy({ ...req.body, agent_id: effectiveAgentId }, req);
    }

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
      _auth_method: req.authMethod,
      _api_key_id: req.apiKey?.key_id || null,
    });

    const intentHash = hashIntent(intent);

    appendEntry({
      intent_id: intent.intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      status: "submitted",
      detail: `[API v1] Intent submitted: ${intent.action} by ${intent.agent_id} (auth: ${req.authMethod})`,
      intent_hash: intentHash,
    });

    console.log(`[RIO API v1] Intent submitted: ${intent.intent_id} — ${intent.action} by ${intent.agent_id} (${req.authMethod})`);

    res.status(201).json({
      intent_id: intent.intent_id,
      status: intent.status,
      action: intent.action,
      agent_id: intent.agent_id,
      intent_hash: intentHash,
      timestamp: intent.timestamp,
      api_version: "v1",
    });
  } catch (err) {
    console.error(`[RIO API v1] Intent error: ${err.message}`);
    res.status(500).json({ error: "Internal error submitting intent." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/intents — List intents
// Scope: read
// ---------------------------------------------------------------------------
router.get("/intents", requireScope("read"), (req, res) => {
  try {
    const status = req.query.status;
    const limit = parseInt(req.query.limit) || 50;
    const intents = listIntents(status, limit);
    res.json({ intents, count: intents.length, api_version: "v1" });
  } catch (err) {
    res.status(500).json({ error: "Internal error listing intents." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/intents/:id — Get intent details
// Scope: read
// ---------------------------------------------------------------------------
router.get("/intents/:id", requireScope("read"), (req, res) => {
  try {
    const intent = getIntent(req.params.id);
    if (!intent) {
      return res.status(404).json({ error: `Intent not found: ${req.params.id}` });
    }
    res.json({ ...intent, api_version: "v1" });
  } catch (err) {
    res.status(500).json({ error: "Internal error reading intent." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/intents/:id/govern — Run governance
// Scope: write
// ---------------------------------------------------------------------------
router.post("/intents/:id/govern", requireScope("write"), (req, res) => {
  try {
    const intent_id = req.params.id;
    const intent = getIntent(intent_id);
    if (!intent) {
      return res.status(404).json({ error: `Intent not found: ${intent_id}` });
    }

    if (intent.status !== "submitted") {
      return res.status(409).json({
        error: `Intent is in status "${intent.status}", expected "submitted".`,
      });
    }

    const decision = evaluateIntent(intent);
    const governanceHash = hashGovernance({ intent_id, ...decision });

    const newStatus = decision.status === "blocked" ? "blocked" : "governed";
    updateIntent(intent_id, {
      status: newStatus,
      governance: { ...decision, governance_hash: governanceHash },
    });

    appendEntry({
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      status: newStatus,
      detail: `[API v1] Governance: ${decision.status} — ${decision.reason}`,
      intent_hash: hashIntent(intent),
    });

    console.log(`[RIO API v1] Governed: ${intent_id} — ${decision.status}`);

    res.json({
      intent_id,
      governance_status: decision.status,
      risk_level: decision.risk_level,
      requires_approval: decision.requires_approval,
      reason: decision.reason,
      checks: decision.checks,
      governance_hash: governanceHash,
      api_version: "v1",
    });
  } catch (err) {
    console.error(`[RIO API v1] Govern error: ${err.message}`);
    res.status(500).json({ error: "Internal error during governance evaluation." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/intents/:id/authorize — Authorize/deny
// Scope: admin
// ---------------------------------------------------------------------------
router.post("/intents/:id/authorize", requireScope("admin"), (req, res) => {
  try {
    const intent_id = req.params.id;
    const { decision, authorized_by, conditions, expires_at, signature, signature_timestamp, signer_id: requestSignerId } = req.body;

    if (!decision || !authorized_by) {
      return res.status(400).json({
        error: "Missing required fields: decision, authorized_by",
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

    if (signature) {
      const payload = buildSignaturePayload({
        intent_id,
        action: intent.action,
        decision,
        signer_id: requestSignerId || authorized_by,
        timestamp: signature_timestamp || timestamp,
      });

      const signerId = requestSignerId || authorized_by;
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
          detail: `[API v1] Authorization BLOCKED: Invalid Ed25519 signature from ${authorized_by}`,
        });

        return res.status(403).json({
          intent_id,
          status: "blocked",
          reason: "Ed25519 signature verification failed.",
          api_version: "v1",
        });
      }

      signatureVerified = true;
      signaturePayloadHash = hashPayload(payload);
    } else if (ED25519_MODE === "required") {
      return res.status(400).json({
        error: "Ed25519 signature is required for authorization.",
        hint: "Include 'signature' and 'signature_timestamp' fields.",
      });
    }

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
    };

    const authHash = hashAuthorization(authorization);
    const newStatus = decision === "approved" ? "authorized" : "denied";

    updateIntent(intent_id, {
      status: newStatus,
      authorization: { ...authorization, authorization_hash: authHash },
    });

    appendEntry({
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      status: newStatus,
      detail: `[API v1] Authorization: ${decision} by ${authorized_by}${signatureVerified ? " (Ed25519)" : ""}`,
      authorization_hash: authHash,
      intent_hash: hashIntent(intent),
    });

    res.json({
      intent_id,
      authorization_status: newStatus,
      authorized_by,
      authorization_hash: authHash,
      ed25519_signed: signatureVerified,
      timestamp,
      api_version: "v1",
    });
  } catch (err) {
    console.error(`[RIO API v1] Authorize error: ${err.message}`);
    res.status(500).json({ error: "Internal error during authorization." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/intents/:id/execute — Execute authorized intent
// Scope: admin
// ---------------------------------------------------------------------------
router.post("/intents/:id/execute", requireScope("admin"), (req, res) => {
  try {
    const intent_id = req.params.id;
    const intent = getIntent(intent_id);
    if (!intent) {
      return res.status(404).json({ error: `Intent not found: ${intent_id}` });
    }

    if (intent.status !== "authorized") {
      const reason =
        intent.status === "denied"
          ? "Intent was denied."
          : intent.status === "blocked"
          ? "Intent was blocked by governance."
          : `Intent is in status "${intent.status}", expected "authorized".`;

      return res.status(403).json({
        intent_id,
        status: "blocked",
        reason,
        api_version: "v1",
      });
    }

    if (intent.authorization?.expires_at) {
      if (new Date(intent.authorization.expires_at) < new Date()) {
        updateIntent(intent_id, { status: "blocked" });
        return res.status(403).json({
          intent_id,
          status: "blocked",
          reason: "Authorization has expired.",
          api_version: "v1",
        });
      }
    }

    const timestamp = new Date().toISOString();
    const { token: burnableToken, expires_at: tokenExpiresAt } = issueExecutionToken(intent_id);

    const executionToken = {
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      authorized_by: intent.authorization?.authorized_by,
      authorization_hash: intent.authorization?.authorization_hash,
      parameters: intent.parameters,
      issued_at: timestamp,
      status: "execute_now",
      execution_token: burnableToken,
      token_expires_at: tokenExpiresAt,
    };

    updateIntent(intent_id, {
      status: "executing",
      execution_token: executionToken,
    });

    appendEntry({
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      status: "executing",
      detail: `[API v1] Execution token issued (single-use, expires ${tokenExpiresAt}).`,
      intent_hash: hashIntent(intent),
    });

    res.json({
      intent_id,
      status: "execute_now",
      execution_token: executionToken,
      instruction: "Execute the action, then POST to /api/v1/intents/:id/confirm with execution_result and execution_token.",
      api_version: "v1",
    });
  } catch (err) {
    console.error(`[RIO API v1] Execute error: ${err.message}`);
    res.status(500).json({ error: "Internal error during execution." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/intents/:id/confirm — Confirm execution
// Scope: write
// ---------------------------------------------------------------------------
router.post("/intents/:id/confirm", requireScope("write"), (req, res) => {
  try {
    const intent_id = req.params.id;
    const { execution_result, connector, execution_token } = req.body;

    if (!execution_result) {
      return res.status(400).json({ error: "Missing required field: execution_result" });
    }

    const intent = getIntent(intent_id);
    if (!intent) {
      return res.status(404).json({ error: `Intent not found: ${intent_id}` });
    }

    if (intent.status !== "executing") {
      return res.status(409).json({
        error: `Intent is in status "${intent.status}", expected "executing".`,
      });
    }

    const tokenToValidate = execution_token || intent.execution_token?.execution_token;
    const burnResult = validateAndBurnToken(intent_id, tokenToValidate);
    if (!burnResult.valid) {
      appendEntry({
        intent_id,
        action: intent.action,
        agent_id: intent.agent_id,
        status: "blocked",
        detail: `[API v1] Execution-confirm BLOCKED: ${burnResult.reason}`,
      });

      return res.status(403).json({
        intent_id,
        status: "blocked",
        reason: burnResult.reason,
        api_version: "v1",
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
      detail: `[API v1] Executed: ${intent.action} (${connectorUsed})`,
      intent_hash: hashIntent(intent),
    });

    res.json({
      intent_id,
      status: "executed",
      execution_hash: executionHash,
      connector: connectorUsed,
      result: execution_result,
      timestamp,
      api_version: "v1",
    });
  } catch (err) {
    console.error(`[RIO API v1] Execute-confirm error: ${err.message}`);
    res.status(500).json({ error: "Internal error confirming execution." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/intents/:id/receipt — Generate receipt
// Scope: read
// ---------------------------------------------------------------------------
router.post("/intents/:id/receipt", requireScope("read"), (req, res) => {
  try {
    const intent_id = req.params.id;
    const intent = getIntent(intent_id);
    if (!intent) {
      return res.status(404).json({ error: `Intent not found: ${intent_id}` });
    }

    if (intent.status !== "executed") {
      return res.status(409).json({
        error: `Intent is in status "${intent.status}", expected "executed".`,
      });
    }

    const receipt = generateReceipt({
      intent_hash: hashIntent(intent),
      governance_hash: intent.governance?.governance_hash || "",
      authorization_hash: intent.authorization?.authorization_hash || "",
      execution_hash: intent.execution?.execution_hash || "",
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      authorized_by: intent.authorization?.authorized_by || "unknown",
    });

    const authBy = intent.authorization?.authorized_by;
    const signerPubKey = authBy ? getSignerPublicKey(authBy) : null;
    receipt.identity_binding = {
      ed25519_signed: intent.authorization?.ed25519_signed || false,
      signer_id: authBy || null,
      signer_public_key_hex: signerPubKey || null,
      signature_payload_hash: intent.authorization?.signature_payload_hash || null,
      verification_method: intent.authorization?.ed25519_signed
        ? "Ed25519 signature verified against registered public key"
        : "No Ed25519 signature",
    };

    updateIntent(intent_id, { status: "receipted", receipt });

    appendEntry({
      intent_id,
      action: intent.action,
      agent_id: intent.agent_id,
      status: "receipted",
      detail: `[API v1] Receipt generated: ${receipt.receipt_id}`,
      receipt_hash: receipt.hash_chain.receipt_hash,
      intent_hash: hashIntent(intent),
    });

    res.json({ ...receipt, api_version: "v1" });
  } catch (err) {
    console.error(`[RIO API v1] Receipt error: ${err.message}`);
    res.status(500).json({ error: "Internal error generating receipt." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/ledger — View ledger entries
// Scope: read
// ---------------------------------------------------------------------------
router.get("/ledger", requireScope("read"), (req, res) => {
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
      api_version: "v1",
    });
  } catch (err) {
    res.status(500).json({ error: "Internal error reading ledger." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/verify — Verify hash chain integrity
// Scope: read
// ---------------------------------------------------------------------------
router.get("/verify", requireScope("read"), (req, res) => {
  try {
    const intentId = req.query.intent_id;

    if (intentId) {
      const intent = getIntent(intentId);
      if (!intent) {
        return res.status(404).json({ error: `Intent not found: ${intentId}` });
      }
      if (!intent.receipt) {
        return res.status(404).json({ error: `No receipt for intent: ${intentId}` });
      }

      const receiptVerification = verifyReceipt(intent.receipt);
      const chainVerification = verifyChain();

      return res.json({
        receipt_verification: receiptVerification,
        ledger_chain_verification: chainVerification,
        api_version: "v1",
      });
    }

    const chainVerification = verifyChain();
    res.json({ ledger_chain_verification: chainVerification, api_version: "v1" });
  } catch (err) {
    res.status(500).json({ error: "Internal error during verification." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/health — API health check (public, no auth required)
// ---------------------------------------------------------------------------
router.get("/health", (req, res) => {
  try {
    const chainStatus = verifyChain();
    const stats = getStats();

    res.json({
      status: "operational",
      api_version: "v1",
      gateway: "RIO Governance Gateway",
      timestamp: new Date().toISOString(),
      ledger: {
        entries: getEntryCount(),
        chain_valid: chainStatus.valid,
      },
      pipeline_stats: stats,
      fail_mode: "closed",
    });
  } catch (err) {
    res.status(500).json({ status: "degraded", error: err.message, api_version: "v1" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/docs — OpenAPI documentation
// ---------------------------------------------------------------------------
router.get("/docs", (req, res) => {
  try {
    const spec = getOpenApiSpec();
    res.json(spec);
  } catch (err) {
    res.status(500).json({ error: "Error generating API documentation." });
  }
});

// ---------------------------------------------------------------------------
// API Key Management Routes
// ---------------------------------------------------------------------------

// POST /api/v1/keys — Create API key (owner only via JWT)
router.post("/keys", (req, res, next) => {
  // Only JWT-authenticated owners can create keys
  if (!req.user || req.user.role !== "owner") {
    return res.status(403).json({
      error: "Only the owner can create API keys.",
      hint: "Authenticate via POST /login with owner credentials.",
    });
  }
  next();
}, async (req, res) => {
  try {
    const { display_name, scopes, rate_limit } = req.body;

    if (!display_name) {
      return res.status(400).json({ error: "Missing required field: display_name" });
    }

    const validScopes = ["read", "write", "admin"];
    const requestedScopes = scopes || ["read"];
    for (const s of requestedScopes) {
      if (!validScopes.includes(s)) {
        return res.status(400).json({
          error: `Invalid scope: "${s}". Valid scopes: ${validScopes.join(", ")}`,
        });
      }
    }

    const result = await createApiKey({
      owner_id: req.user.sub,
      display_name,
      scopes: requestedScopes,
      rate_limit: rate_limit || 100,
    });

    appendEntry({
      intent_id: "00000000-0000-0000-0000-000000000000",
      action: "system.api_key.create",
      agent_id: req.user.sub,
      status: "system",
      detail: `[API v1] API key created: ${result.key_id} (${display_name}) — scopes: ${requestedScopes.join(",")}`,
    });

    console.log(`[RIO API v1] API key created: ${result.key_id} by ${req.user.sub}`);

    res.status(201).json({ ...result, api_version: "v1" });
  } catch (err) {
    console.error(`[RIO API v1] Key creation error: ${err.message}`);
    res.status(500).json({ error: "Internal error creating API key." });
  }
});

// GET /api/v1/keys — List API keys
router.get("/keys", requireAnyAuth, (req, res) => {
  try {
    const owner_id = req.user?.role === "owner" ? null : req.user?.sub;
    const keys = listApiKeys(owner_id);
    res.json({ keys, count: keys.length, api_version: "v1" });
  } catch (err) {
    res.status(500).json({ error: "Internal error listing API keys." });
  }
});

// GET /api/v1/keys/:key_id — Get API key details
router.get("/keys/:key_id", requireAnyAuth, (req, res) => {
  try {
    const key = getApiKey(req.params.key_id);
    if (!key) {
      return res.status(404).json({ error: `API key not found: ${req.params.key_id}` });
    }
    // Non-owners can only see their own keys
    if (req.user?.role !== "owner" && key.owner_id !== req.user?.sub) {
      return res.status(403).json({ error: "Access denied." });
    }
    res.json({ ...key, api_version: "v1" });
  } catch (err) {
    res.status(500).json({ error: "Internal error reading API key." });
  }
});

// DELETE /api/v1/keys/:key_id — Revoke API key (owner only)
router.delete("/keys/:key_id", (req, res, next) => {
  if (!req.user || req.user.role !== "owner") {
    return res.status(403).json({ error: "Only the owner can revoke API keys." });
  }
  next();
}, async (req, res) => {
  try {
    const result = await revokeApiKey(req.params.key_id);
    if (!result.revoked) {
      return res.status(404).json({ error: `API key not found: ${req.params.key_id}` });
    }

    appendEntry({
      intent_id: "00000000-0000-0000-0000-000000000000",
      action: "system.api_key.revoke",
      agent_id: req.user.sub,
      status: "system",
      detail: `[API v1] API key revoked: ${req.params.key_id}`,
    });

    console.log(`[RIO API v1] API key revoked: ${req.params.key_id} by ${req.user.sub}`);

    res.json({ ...result, api_version: "v1" });
  } catch (err) {
    console.error(`[RIO API v1] Key revocation error: ${err.message}`);
    res.status(500).json({ error: "Internal error revoking API key." });
  }
});

export default router;
