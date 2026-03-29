/**
 * RIO Receipt Generator
 *
 * Generates cryptographic receipts for every action that passes
 * through the gateway. Receipts form a 5-artifact hash chain:
 *
 *   Intent → Recommendation → Approval → Execution → Receipt
 *
 * Each artifact is hashed, and the final receipt hash covers
 * all previous hashes, creating a tamper-evident proof chain.
 */
import { createHash, randomUUID } from "node:crypto";

/**
 * Compute SHA-256 hash of a string.
 */
function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
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
 * @returns {object} The complete receipt
 */
export function generateReceipt(data) {
  const receiptId = randomUUID();
  const timestamp = new Date().toISOString();

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

  return {
    receipt_id: receiptId,
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
}

/**
 * Verify a receipt by recomputing the receipt hash.
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
  };
}
