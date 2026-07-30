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

const SET_ACTION = "prime.sandbox.set";
const ROLLBACK_ACTION = "prime.sandbox.rollback";

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateAuthorization(authorization, action, now = new Date()) {
  if (!authorization || authorization.decision !== "approved") {
    throw new Error("Explicit approved authorization is required");
  }
  if (authorization.action !== action) {
    throw new Error(`Authorization action must be ${action}`);
  }
  if (!authorization.authorized_by) {
    throw new Error("Authorization requires authorized_by");
  }
  const expiry = new Date(authorization.expires_at);
  if (!authorization.expires_at || Number.isNaN(expiry.getTime()) || expiry <= now) {
    throw new Error("Authorization is expired or invalid");
  }
}

function receiptFor({ action, ir, authorization, execution, rules }) {
  const timestamp = new Date().toISOString();
  const intent = {
    intent_id: randomUUID(),
    action,
    agent_id: "prime-compiler",
    parameters: { source_expression: ir.source_expression, symbols: ir.symbols },
    timestamp,
  };
  const governance = {
    intent_id: intent.intent_id,
    status: "allowed",
    risk_level: "LOW",
    requires_approval: true,
    checks: { prime_ir_valid: true, bounded_action: action, reversible: true },
  };
  const authorizationRecord = {
    intent_id: intent.intent_id,
    decision: "approved",
    authorized_by: authorization.authorized_by,
    timestamp: authorization.timestamp || timestamp,
    conditions: { action, expires_at: authorization.expires_at },
  };
  const executionRecord = {
    intent_id: intent.intent_id,
    action,
    connector: "prime-sandbox",
    timestamp,
    result: execution,
  };
  const receipt = generateReceipt({
    intent_hash: hashIntent(intent),
    governance_hash: hashGovernance(governance),
    authorization_hash: hashAuthorization(authorizationRecord),
    execution_hash: hashExecution(executionRecord),
    intent_id: intent.intent_id,
    action,
    agent_id: intent.agent_id,
    authorized_by: authorization.authorized_by,
    ingestion: { source: "prime", channel: "prime-sandbox", source_message_id: ir.source_expression, timestamp },
    policy: { evaluated: true, decision: "ALLOW", rules_triggered: rules, policy_pack: "prime-sandbox-v0.2" },
  });
  const verification = verifyReceipt(receipt);
  if (!verification.valid) throw new Error("Generated RIO receipt failed verification");
  return { intent, governance, authorization: authorizationRecord, execution: executionRecord, receipt, verification };
}

function responseFor({ status, operation, execution, artifacts }) {
  return {
    status,
    operation,
    execution,
    runtime: {
      intent: artifacts.intent,
      governance: artifacts.governance,
      authorization: artifacts.authorization,
      execution: artifacts.execution,
    },
    receipt: artifacts.receipt,
    verification: artifacts.verification,
  };
}

export class PrimeSandbox {
  constructor() {
    this.values = new Map();
    this.rollbacks = new Map();
  }

  get(key) {
    return this.values.get(key);
  }

  set({ ir, authorization, key, value }) {
    validatePrimeIr(ir);
    validateAuthorization(authorization, SET_ACTION);
    if (typeof key !== "string" || !/^[a-zA-Z0-9._-]{1,64}$/.test(key)) {
      throw new Error("Sandbox key is invalid");
    }
    if (typeof value !== "string" || value.length > 4096) {
      throw new Error("Sandbox value must be a string up to 4096 characters");
    }
    const hadPrevious = this.values.has(key);
    const previousValue = this.values.get(key);
    this.values.set(key, value);
    const rollbackToken = randomUUID();
    this.rollbacks.set(rollbackToken, { key, hadPrevious, previousValue, expectedHash: sha256(value), used: false });
    const execution = {
      status: "EXECUTED",
      effect: "SANDBOX_SET",
      key,
      value_hash: sha256(value),
      reversible: true,
      rollback_token: rollbackToken,
      external_side_effects: false,
    };
    const artifacts = receiptFor({ action: SET_ACTION, ir, authorization, execution, rules: ["PRIME_IR_VALID", "EXPLICIT_AUTHORIZATION", "SANDBOX_ONLY", "ROLLBACK_AVAILABLE"] });
    return responseFor({ status: "RETURNED", operation: SET_ACTION, execution, artifacts });
  }

  rollback({ ir, authorization, rollback_token }) {
    validatePrimeIr(ir);
    validateAuthorization(authorization, ROLLBACK_ACTION);
    const record = this.rollbacks.get(rollback_token);
    if (!record || record.used) throw new Error("Rollback token is invalid or already used");
    if (sha256(this.values.get(record.key)) !== record.expectedHash) {
      throw new Error("Sandbox state changed after the receipted mutation");
    }
    if (record.hadPrevious) this.values.set(record.key, record.previousValue);
    else this.values.delete(record.key);
    record.used = true;
    const execution = {
      status: "EXECUTED",
      effect: "SANDBOX_ROLLBACK",
      key: record.key,
      restored_previous_state: true,
      rollback_token,
      external_side_effects: false,
    };
    const artifacts = receiptFor({ action: ROLLBACK_ACTION, ir, authorization, execution, rules: ["PRIME_IR_VALID", "EXPLICIT_AUTHORIZATION", "ROLLBACK_TOKEN_VALID", "STATE_RESTORED"] });
    return responseFor({ status: "RETURNED", operation: ROLLBACK_ACTION, execution, artifacts });
  }
}

export const primeSandbox = new PrimeSandbox();
