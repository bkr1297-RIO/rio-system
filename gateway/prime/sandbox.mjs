import { createHash, randomUUID } from "node:crypto";
import {
  generateReceipt,
  hashAuthorization,
  hashExecution,
  hashGovernance,
  hashIntent,
  verifyReceipt,
} from "../receipts/receipts.mjs";
import { validatePrimeIr } from "./bridge.mjs";
import { PrimeWorkspaceStore } from "./workspace-store.mjs";

const SET_ACTION = "prime.sandbox.set";
const ROLLBACK_ACTION = "prime.sandbox.rollback";

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateAuthorization(authorization, action, now = new Date()) {
  if (!authorization || authorization.decision !== "approved") throw new Error("Explicit approved authorization is required");
  if (authorization.action !== action) throw new Error(`Authorization action must be ${action}`);
  if (!authorization.authorized_by) throw new Error("Authorization requires authorized_by");
  const expiry = new Date(authorization.expires_at);
  if (!authorization.expires_at || Number.isNaN(expiry.getTime()) || expiry <= now) throw new Error("Authorization is expired or invalid");
}

function receiptFor({ action, ir, authorization, execution, rules }) {
  const timestamp = new Date().toISOString();
  const intent = { intent_id: randomUUID(), action, agent_id: "prime-compiler", parameters: { source_expression: ir.source_expression, symbols: ir.symbols }, timestamp };
  const governance = { intent_id: intent.intent_id, status: "allowed", risk_level: "LOW", requires_approval: true, checks: { prime_ir_valid: true, bounded_action: action, reversible: true, persistent_workspace: true, single_writer: true, durable_proof_coupled: true } };
  const authorizationRecord = { intent_id: intent.intent_id, decision: "approved", authorized_by: authorization.authorized_by, timestamp: authorization.timestamp || timestamp, conditions: { action, expires_at: authorization.expires_at } };
  const executionRecord = { intent_id: intent.intent_id, action, connector: "prime-workspace", timestamp, result: execution };
  const receipt = generateReceipt({
    intent_hash: hashIntent(intent), governance_hash: hashGovernance(governance), authorization_hash: hashAuthorization(authorizationRecord), execution_hash: hashExecution(executionRecord),
    intent_id: intent.intent_id, action, agent_id: intent.agent_id, authorized_by: authorization.authorized_by,
    ingestion: { source: "prime", channel: "prime-workspace", source_message_id: ir.source_expression, timestamp },
    policy: { evaluated: true, decision: "ALLOW", rules_triggered: rules, policy_pack: "prime-workspace-v0.7" },
  });
  const verification = verifyReceipt(receipt);
  if (!verification.valid) throw new Error("Generated RIO receipt failed verification");
  return { intent, governance, authorization: authorizationRecord, execution: executionRecord, receipt, verification };
}

function durableProof(artifacts, operation) {
  return {
    proof_id: artifacts.intent.intent_id,
    operation,
    receipt: artifacts.receipt,
    verification: artifacts.verification,
    runtime: {
      intent: artifacts.intent,
      governance: artifacts.governance,
      authorization: artifacts.authorization,
      execution: artifacts.execution,
    },
  };
}

function responseFor({ status, operation, execution, artifacts, revision }) {
  return {
    status,
    operation,
    execution: { ...execution, workspace_revision: revision, durable_proof_id: artifacts.intent.intent_id },
    runtime: { intent: artifacts.intent, governance: artifacts.governance, authorization: artifacts.authorization, execution: artifacts.execution },
    receipt: artifacts.receipt,
    verification: artifacts.verification,
  };
}

export class PrimeSandbox {
  constructor({ store = new PrimeWorkspaceStore() } = {}) { this.store = store; }
  get(key) { return this.store.get(key); }

  set({ ir, authorization, key, value }) {
    validatePrimeIr(ir);
    validateAuthorization(authorization, SET_ACTION);
    if (typeof key !== "string" || !/^[a-zA-Z0-9._-]{1,64}$/.test(key)) throw new Error("Sandbox key is invalid");
    if (typeof value !== "string" || value.length > 4096) throw new Error("Sandbox value must be a string up to 4096 characters");

    const rollbackToken = randomUUID();
    const execution = { status: "EXECUTED", effect: "WORKSPACE_SET", key, value_hash: sha256(value), reversible: true, rollback_token: rollbackToken, persistent: true, concurrency_control: "SINGLE_WRITER_LOCK", proof_persistence: "ATOMIC_WITH_STATE", external_side_effects: false };
    const artifacts = receiptFor({ action: SET_ACTION, ir, authorization, execution, rules: ["PRIME_IR_VALID", "EXPLICIT_AUTHORIZATION", "ISOLATED_WORKSPACE", "SINGLE_WRITER_LOCK", "DURABLE_PROOF_COUPLED", "PERSISTED", "ROLLBACK_AVAILABLE"] });
    const committed = this.store.atomicSetWithRollback({
      key,
      value,
      token: rollbackToken,
      expectedHash: sha256(value),
      createdAt: new Date().toISOString(),
      proof: durableProof(artifacts, SET_ACTION),
    });
    return responseFor({ status: "RETURNED", operation: SET_ACTION, execution, artifacts, revision: committed.revision });
  }

  rollback({ ir, authorization, rollback_token }) {
    validatePrimeIr(ir);
    validateAuthorization(authorization, ROLLBACK_ACTION);

    let execution;
    let artifacts;
    const committed = this.store.atomicRollback({
      token: rollback_token,
      hashValue: sha256,
      proofFactory: (record) => {
        execution = { status: "EXECUTED", effect: "WORKSPACE_ROLLBACK", key: record.key, restored_previous_state: true, rollback_token, persistent: true, concurrency_control: "SINGLE_WRITER_LOCK", proof_persistence: "ATOMIC_WITH_STATE", external_side_effects: false };
        artifacts = receiptFor({ action: ROLLBACK_ACTION, ir, authorization, execution, rules: ["PRIME_IR_VALID", "EXPLICIT_AUTHORIZATION", "SINGLE_WRITER_LOCK", "ROLLBACK_TOKEN_VALID", "DURABLE_PROOF_COUPLED", "PERSISTENT_STATE_VERIFIED", "STATE_RESTORED", "TOKEN_BURNED"] });
        return durableProof(artifacts, ROLLBACK_ACTION);
      },
    });
    return responseFor({ status: "RETURNED", operation: ROLLBACK_ACTION, execution, artifacts, revision: committed.revision });
  }
}

export const primeSandbox = new PrimeSandbox();
