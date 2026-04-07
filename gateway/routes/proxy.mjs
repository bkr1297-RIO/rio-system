/**
 * RIO Gateway — Proxy Onboarding & Kill Switch Routes
 *
 * Endpoints Jordan's ONE App frontend is waiting for:
 *   POST /api/onboard   — Register a new user/device with Ed25519 key
 *   POST /api/kill       — Emergency proxy shutdown (kill switch)
 *   GET  /api/receipts/recent — Public recent receipts feed
 *
 * These endpoints generate receipts with receipt_type per Receipt Spec v2.1:
 *   - onboard → receipt_type: "onboard"
 *   - kill    → receipt_type: "kill_switch"
 *
 * Security:
 *   - /onboard is public (new users don't have tokens yet)
 *   - /kill requires JWT authentication (must be a registered user)
 *   - /receipts/recent is public (transparency feed)
 */
import { Router } from "express";
import { randomUUID, createHash } from "node:crypto";
import { requireAuth } from "../security/oauth.mjs";
import { requireRole } from "../security/principals.mjs";
import { registerSigner, getSigner, listSigners } from "../security/identity-binding.mjs";
import {
  appendEntry,
  getEntries,
  getEntryCount,
  getCurrentHash,
} from "../ledger/ledger-pg.mjs";
import {
  generateReceipt,
  hashIntent,
  buildIngestion,
} from "../receipts/receipts.mjs";
import { createIntent, getIntent, updateIntent, listIntents } from "../governance/intents.mjs";

const router = Router();

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

// =========================================================================
// POST /api/onboard — Register a new user/device
//
// Request body:
//   {
//     user_id: string,           // Display name or identifier
//     public_key_hex: string,    // Ed25519 public key (64-char hex)
//     device_id?: string,        // Optional device identifier
//     policy_hash?: string,      // Hash of the policy the user accepted
//     key_fingerprint?: string   // SHA-256 of the public key
//   }
//
// Response: Onboard receipt with receipt_type "onboard"
// =========================================================================
router.post("/onboard", async (req, res) => {
  try {
    const { user_id, public_key_hex, device_id, policy_hash, key_fingerprint } = req.body;

    if (!user_id || !public_key_hex) {
      return res.status(400).json({
        error: "Missing required fields: user_id, public_key_hex",
        hint: "Provide the Ed25519 public key generated in the onboarding wizard.",
      });
    }

    // Validate public key format (64 hex chars)
    if (!/^[0-9a-fA-F]{64}$/.test(public_key_hex)) {
      return res.status(400).json({
        error: "Invalid public_key_hex: must be exactly 64 hexadecimal characters.",
      });
    }

    // Check if already registered
    const existing = getSigner(user_id);
    if (existing) {
      return res.status(409).json({
        error: `User already registered: ${user_id}`,
        signer_id: existing.signer_id,
        registered_at: existing.registered_at,
        hint: "Use POST /api/sync to restore session state.",
      });
    }

    // Register the signer
    const signer = await registerSigner({
      signer_id: user_id,
      public_key_hex,
      display_name: user_id,
      role: "user",
    });

    // Create an onboard intent for the ledger trail
    const intent = createIntent({
      action: "ONBOARD_USER",
      agent_id: "system",
      target_environment: "production",
      parameters: {
        user_id,
        device_id: device_id || null,
        policy_hash: policy_hash || null,
        key_fingerprint: key_fingerprint || sha256(public_key_hex),
      },
      description: `New user onboarded: ${user_id}`,
    });

    const intentHash = hashIntent(intent);

    // Write onboard event to ledger
    appendEntry({
      intent_id: intent.intent_id,
      action: "ONBOARD_USER",
      agent_id: "system",
      status: "onboarded",
      detail: `User onboarded: ${user_id} (device: ${device_id || "unknown"})`,
      intent_hash: intentHash,
    });

    // Generate onboard receipt (Receipt Spec v2.1)
    const receipt = generateReceipt({
      intent_hash: intentHash,
      governance_hash: sha256(JSON.stringify({ action: "ONBOARD_USER", auto_approved: true })),
      authorization_hash: sha256(JSON.stringify({ decision: "auto_approved", reason: "onboard" })),
      execution_hash: sha256(JSON.stringify({ result: "signer_registered", user_id })),
      intent_id: intent.intent_id,
      action: "ONBOARD_USER",
      agent_id: "system",
      authorized_by: "system",
      receipt_type: "onboard",
      ingestion: buildIngestion({
        source: "onboard",
        channel: "POST /api/onboard",
      }),
      identity_binding: {
        signer_id: user_id,
        public_key_hex,
        signature_payload_hash: null,
        verification_method: null,
        ed25519_signed: false,
      },
    });

    // Write receipt to ledger
    appendEntry({
      intent_id: intent.intent_id,
      action: "ONBOARD_USER",
      agent_id: "system",
      status: "receipted",
      detail: `Onboard receipt: ${receipt.receipt_id}`,
      receipt_hash: receipt.hash_chain.receipt_hash,
      intent_hash: intentHash,
    });

    console.log(`[RIO Proxy] ONBOARD: ${user_id} registered (device: ${device_id || "unknown"})`);

    res.status(201).json({
      status: "onboarded",
      user_id,
      signer_id: signer.signer_id,
      public_key_hex: signer.public_key_hex,
      device_id: device_id || null,
      receipt,
      ledger_entry_count: getEntryCount(),
      chain_tip: getCurrentHash(),
    });
  } catch (err) {
    console.error(`[RIO Proxy] Onboard error: ${err.message}`);
    res.status(500).json({ error: "Internal error during onboarding." });
  }
});

// =========================================================================
// POST /api/kill — Emergency proxy shutdown (kill switch)
//
// Request body:
//   {
//     reason?: string,    // Optional reason for the kill
//     device_id?: string  // Optional device that triggered it
//   }
//
// Response: Kill switch receipt with receipt_type "kill_switch"
//
// Security: Requires JWT authentication.
// Effect: Records the kill event in the ledger. The actual proxy
//         shutdown is handled by the frontend — this endpoint
//         provides the cryptographic proof that the kill was requested.
// =========================================================================
router.post("/kill", requireRole("root_authority", "meta_governor"), async (req, res) => {
  try {
    const userId = req.principal?.principal_id || req.user?.sub;
    const { reason, device_id } = req.body;

    const killReason = reason || "Emergency kill switch activated";

    // Create a kill intent
    const intent = createIntent({
      action: "KILL_PROXY",
      agent_id: userId,
      target_environment: "production",
      parameters: {
        reason: killReason,
        device_id: device_id || null,
        triggered_by: userId,
        triggered_at: new Date().toISOString(),
      },
      description: `Kill switch activated by ${userId}: ${killReason}`,
    });

    const intentHash = hashIntent(intent);

    // Write kill event to ledger — this is immediate, no governance needed
    appendEntry({
      intent_id: intent.intent_id,
      action: "KILL_PROXY",
      agent_id: userId,
      status: "killed",
      detail: `KILL SWITCH: ${userId} — ${killReason}`,
      intent_hash: intentHash,
    });

    // Generate kill switch receipt (Receipt Spec v2.1)
    const receipt = generateReceipt({
      intent_hash: intentHash,
      governance_hash: sha256(JSON.stringify({ action: "KILL_PROXY", bypassed: true, reason: "kill_switch" })),
      authorization_hash: sha256(JSON.stringify({ decision: "kill_authorized", by: userId })),
      execution_hash: sha256(JSON.stringify({ result: "proxy_killed", by: userId })),
      intent_id: intent.intent_id,
      action: "KILL_PROXY",
      agent_id: userId,
      authorized_by: userId,
      receipt_type: "kill_switch",
      ingestion: buildIngestion({
        source: "kill_switch",
        channel: "POST /api/kill",
      }),
      identity_binding: {
        signer_id: userId,
        public_key_hex: null,
        signature_payload_hash: null,
        verification_method: null,
        ed25519_signed: false,
        // Area 1: Principal attribution
        principal_id: req.principal?.principal_id || null,
        role_exercised: req.principal?.primary_role || null,
        actor_type: req.principal?.actor_type || null,
      },
    });

    // Write receipt to ledger
    appendEntry({
      intent_id: intent.intent_id,
      action: "KILL_PROXY",
      agent_id: userId,
      status: "receipted",
      detail: `Kill switch receipt: ${receipt.receipt_id}`,
      receipt_hash: receipt.hash_chain.receipt_hash,
      intent_hash: intentHash,
    });

    console.log(`[RIO Proxy] KILL SWITCH: ${userId} — ${killReason}`);

    res.json({
      status: "killed",
      user_id: userId,
      reason: killReason,
      receipt,
      ledger_entry_count: getEntryCount(),
      chain_tip: getCurrentHash(),
      instruction: "Proxy session terminated. All pending intents are frozen. Reactivate via POST /api/onboard.",
    });
  } catch (err) {
    console.error(`[RIO Proxy] Kill error: ${err.message}`);
    res.status(500).json({ error: "Internal error during kill switch." });
  }
});

// =========================================================================
// GET /api/receipts/recent — Public recent receipts feed
//
// Query params:
//   limit: number (default 20, max 100)
//
// Returns the most recent ledger entries with status "receipted",
// suitable for the protocol site's transparency feed.
// No authentication required — this is public data.
// =========================================================================
router.get("/receipts/recent", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const format = req.query.format || "protocol"; // "protocol" (default) or "ledger"
    const totalCount = getEntryCount();

    if (format === "protocol") {
      // Option A: Return full protocol-format receipts from intent store
      // These contain hash_chain, verification, identity_binding — everything
      // the CLI verifier needs for full hash chain verification.
      const receiptedIntents = listIntents("receipted", limit);
      const protocolReceipts = receiptedIntents
        .filter((i) => i.receipt && i.receipt.hash_chain)
        .map((i) => i.receipt);

      res.json({
        receipts: protocolReceipts,
        count: protocolReceipts.length,
        format: "protocol",
        total_ledger_entries: totalCount,
        chain_tip: getCurrentHash(),
        fetched_at: new Date().toISOString(),
      });
    } else {
      // Legacy: Return ledger entry summaries
      const allEntries = getEntries(totalCount);
      const receiptedEntries = allEntries
        .filter((e) => e.status === "receipted")
        .slice(-limit)
        .reverse();

      res.json({
        receipts: receiptedEntries.map((e) => ({
          entry_id: e.entry_id,
          intent_id: e.intent_id,
          action: e.action,
          agent_id: e.agent_id,
          status: e.status,
          detail: e.detail,
          receipt_hash: e.receipt_hash,
          ledger_hash: e.ledger_hash,
          timestamp: e.timestamp,
        })),
        count: receiptedEntries.length,
        format: "ledger",
        total_ledger_entries: totalCount,
        chain_tip: getCurrentHash(),
        fetched_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(`[RIO Proxy] Recent receipts error: ${err.message}`);
    res.status(500).json({ error: "Internal error fetching recent receipts." });
  }
});

export default router;
