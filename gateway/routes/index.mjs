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
} from "../ledger/ledger.mjs";
import {
  hashIntent,
  hashGovernance,
  hashAuthorization,
  hashExecution,
  generateReceipt,
  verifyReceipt,
} from "../receipts/receipts.mjs";

const router = Router();

// =========================================================================
// POST /intent — Submit a new intent
// =========================================================================
router.post("/intent", (req, res) => {
  try {
    const { action, agent_id, target_environment, parameters, confidence, description } = req.body;

    if (!action || !agent_id) {
      return res.status(400).json({
        error: "Missing required fields: action, agent_id",
      });
    }

    const intent = createIntent({
      action,
      agent_id,
      target_environment,
      parameters,
      confidence,
      description,
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
router.post("/govern", (req, res) => {
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
// =========================================================================
router.post("/authorize", (req, res) => {
  try {
    const { intent_id, decision, authorized_by, conditions, expires_at } = req.body;

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

    // If governance said auto_approved, authorization is still accepted but logged
    const timestamp = new Date().toISOString();
    const authorization = {
      intent_id,
      decision,
      authorized_by,
      timestamp,
      conditions: conditions || null,
      expires_at: expires_at || null,
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
      detail: `Authorization: ${decision} by ${authorized_by}`,
      authorization_hash: authHash,
      intent_hash: hashIntent(intent),
    });

    console.log(`[RIO Gateway] Authorization: ${intent_id} — ${decision} by ${authorized_by}`);

    res.json({
      intent_id,
      authorization_status: newStatus,
      authorized_by,
      authorization_hash: authHash,
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
router.post("/execute", (req, res) => {
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

    // Execute (simulated for MVP — real connectors will be wired in)
    const timestamp = new Date().toISOString();
    const execution = {
      intent_id,
      action: intent.action,
      result: {
        status: "simulated",
        message: `Action "${intent.action}" would execute with parameters: ${JSON.stringify(intent.parameters)}`,
      },
      connector: "simulated",
      timestamp,
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
      detail: `Executed: ${intent.action} (simulated)`,
      intent_hash: hashIntent(intent),
    });

    console.log(`[RIO Gateway] Executed: ${intent_id} — ${intent.action}`);

    res.json({
      intent_id,
      status: "executed",
      execution_hash: executionHash,
      result: execution.result,
      timestamp,
    });
  } catch (err) {
    console.error(`[RIO Gateway] Execute error: ${err.message}`);
    res.status(500).json({ error: "Internal error during execution." });
  }
});

// =========================================================================
// POST /receipt — Generate cryptographic receipt
// =========================================================================
router.post("/receipt", (req, res) => {
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

    // Generate the full receipt
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
router.get("/ledger", (req, res) => {
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
router.get("/verify", (req, res) => {
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
      version: "1.0.0",
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
router.get("/intents", (req, res) => {
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
router.get("/intent/:id", (req, res) => {
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
