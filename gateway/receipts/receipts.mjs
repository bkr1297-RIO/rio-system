/**
 * RIO Receipt Generator — v2.1
 *
 * Generates cryptographic receipts for every action that passes
 * through the gateway. Receipts form a 5-artifact hash chain:
 *
 *   Intent → Recommendation → Approval → Execution → Receipt
 *
 * Each artifact is hashed, and the final receipt hash covers
 * all previous hashes, creating a tamper-evident proof chain.
 *
 * v2.1 additions (non-breaking):
 *   - receipt_type: governed_action | kill_switch | onboard | system
 *   - ingestion: source provenance (api, email, sms, webhook, frontend, etc.)
 *   - identity_binding: Ed25519 signer proof on the receipt
 */
import { createHash, randomUUID } from "node:crypto";

/**
 * Compute SHA-256 hash of a string.
 */
function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Canonical ingestion source registry.
 * Maps known entry points to their source classification.
 */
const INGESTION_SOURCE_REGISTRY = {
  "POST /intent": { source: "api", channel: "POST /intent" },
  "POST /api/v1/intents": { source: "api", channel: "POST /api/v1/intents" },
  "POST /api/onboard": { source: "onboard", channel: "POST /api/onboard" },
  "POST /api/kill": { source: "kill_switch", channel: "POST /api/kill" },
  "outlook-power-automate": { source: "email", channel: "outlook-power-automate" },
  "twilio-webhook": { source: "sms", channel: "twilio-webhook" },
  "gmail-executor": { source: "email", channel: "gmail-executor" },
  "frontend": { source: "frontend", channel: "frontend" },
  "service-bus": { source: "service_bus", channel: "service-bus" },
};

/**
 * Build an ingestion provenance object.
 *
 * @param {object} opts
 * @param {string} opts.source - Source classification (api, email, sms, webhook, frontend, etc.)
 * @param {string} opts.channel - Specific endpoint or integration path
 * @param {string} [opts.source_message_id] - Original message ID from source system
 * @returns {object} Ingestion provenance object per Receipt Spec v2.1
 */
export function buildIngestion(opts = {}) {
  const registered = INGESTION_SOURCE_REGISTRY[opts.channel] || {};
  return {
    source: opts.source || registered.source || "api",
    channel: opts.channel || "unknown",
    source_message_id: opts.source_message_id || null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate a hash for an intent.
 */
export function hashIntent(intent) {
  const canonical = JSON.stringify({
    intent_id: intent.intent_id,
    action: intent.action,
    agent_id: intent.agent_id,
    parameters: intent.parameters,
    timestamp: intent.timestamp,
  });
  return sha256(canonical);
}

/**
 * Generate a hash for a governance decision.
 */
export function hashGovernance(governance) {
  const canonical = JSON.stringify({
    intent_id: governance.intent_id,
    status: governance.status,
    risk_level: governance.risk_level,
    requires_approval: governance.requires_approval,
    checks: governance.checks,
  });
  return sha256(canonical);
}

/**
 * Generate a hash for an authorization record.
 */
export function hashAuthorization(authorization) {
  const canonical = JSON.stringify({
    intent_id: authorization.intent_id,
    decision: authorization.decision,
    authorized_by: authorization.authorized_by,
    timestamp: authorization.timestamp,
    conditions: authorization.conditions || null,
  });
  return sha256(canonical);
}

/**
 * Generate a hash for an execution record.
 */
export function hashExecution(execution) {
  const canonical = JSON.stringify({
    intent_id: execution.intent_id,
    action: execution.action,
    result: execution.result,
    connector: execution.connector,
    timestamp: execution.timestamp,
  });
  return sha256(canonical);
}

/**
 * Generate a full receipt covering the entire chain.
 * v2.1: Now includes receipt_type, ingestion, and identity_binding.
 *
 * @param {object} data
 * @param {string} data.intent_hash
 * @param {string} data.governance_hash
 * @param {string} data.authorization_hash
 * @param {string} data.execution_hash
 * @param {string} data.intent_id
 * @param {string} data.action
 * @param {string} data.agent_id
 * @param {string} data.authorized_by
 * @param {string} [data.receipt_type] - governed_action | kill_switch | onboard | system
 * @param {object} [data.ingestion] - Ingestion provenance object
 * @param {object} [data.identity_binding] - Ed25519 signer proof
 * @returns {object} The complete receipt (v2.1)
 */
export function generateReceipt(data) {
  const receiptId = randomUUID();
  const timestamp = new Date().toISOString();

  // v2.1: Receipt type defaults to governed_action
  const receiptType = data.receipt_type || "governed_action";

  // The receipt hash covers all previous hashes in the chain
  const receiptContent = JSON.stringify({
    receipt_id: receiptId,
    intent_hash: data.intent_hash,
    governance_hash: data.governance_hash,
    authorization_hash: data.authorization_hash,
    execution_hash: data.execution_hash,
    timestamp,
  });

  const receiptHash = sha256(receiptContent);

  const receipt = {
    receipt_id: receiptId,
    receipt_type: receiptType,
    intent_id: data.intent_id,
    action: data.action,
    agent_id: data.agent_id,
    authorized_by: data.authorized_by,
    timestamp,
    hash_chain: {
      intent_hash: data.intent_hash,
      governance_hash: data.governance_hash,
      authorization_hash: data.authorization_hash,
      execution_hash: data.execution_hash,
      receipt_hash: receiptHash,
    },
    verification: {
      algorithm: "SHA-256",
      chain_length: 5,
      chain_order: [
        "intent_hash",
        "governance_hash",
        "authorization_hash",
        "execution_hash",
        "receipt_hash",
      ],
    },
  };

  // v2.1: Ingestion provenance (non-breaking — only present if provided)
  if (data.ingestion) {
    receipt.ingestion = {
      source: data.ingestion.source,
      channel: data.ingestion.channel,
      source_message_id: data.ingestion.source_message_id || null,
      timestamp: data.ingestion.timestamp || timestamp,
    };
  }

  // v2.1: Identity binding (non-breaking — only present if provided)
  if (data.identity_binding) {
    receipt.identity_binding = {
      signer_id: data.identity_binding.signer_id || null,
      public_key_hex: data.identity_binding.public_key_hex || null,
      signature_payload_hash: data.identity_binding.signature_payload_hash || null,
      verification_method: data.identity_binding.verification_method || null,
      ed25519_signed: data.identity_binding.ed25519_signed || false,
    };
  }

  return receipt;
}

/**
 * Verify a receipt by recomputing the receipt hash.
 * Works with both v2.0 and v2.1 receipts (backward compatible).
 */
export function verifyReceipt(receipt) {
  const receiptContent = JSON.stringify({
    receipt_id: receipt.receipt_id,
    intent_hash: receipt.hash_chain.intent_hash,
    governance_hash: receipt.hash_chain.governance_hash,
    authorization_hash: receipt.hash_chain.authorization_hash,
    execution_hash: receipt.hash_chain.execution_hash,
    timestamp: receipt.timestamp,
  });

  const computedHash = sha256(receiptContent);
  const storedHash = receipt.hash_chain.receipt_hash;

  return {
    valid: computedHash === storedHash,
    computed_hash: computedHash,
    stored_hash: storedHash,
    receipt_id: receipt.receipt_id,
    receipt_type: receipt.receipt_type || "governed_action",
  };
}
