import { randomUUID } from "node:crypto";
import {
  generateReceipt,
  hashAuthorization,
  hashExecution,
  hashGovernance,
  hashIntent,
  verifyReceipt,
} from "../receipts/receipts.mjs";

const REQUIRED_ACTION = "prime.echo";

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

export function validatePrimeIr(ir) {
  assertObject(ir, "Prime IR");
  if (!Array.isArray(ir.symbols) || ir.symbols.length < 1) {
    throw new TypeError("Prime IR symbols must be a non-empty array");
  }
  if (!Array.isArray(ir.transitions)) {
    throw new TypeError("Prime IR transitions must be an array");
  }
  if (ir.transitions.length !== Math.max(0, ir.symbols.length - 1)) {
    throw new TypeError("Prime IR transition count does not match symbol path");
  }
  return ir;
}

export function validateAuthorization(authorization, now = new Date()) {
  assertObject(authorization, "Authorization");
  if (authorization.decision !== "approved") {
    throw new Error("Prime runtime bridge requires explicit approved authorization");
  }
  if (authorization.action !== REQUIRED_ACTION) {
    throw new Error(`Authorization action must be ${REQUIRED_ACTION}`);
  }
  if (!authorization.authorized_by) {
    throw new Error("Authorization requires authorized_by");
  }
  if (!authorization.expires_at) {
    throw new Error("Authorization requires expires_at");
  }
  const expiry = new Date(authorization.expires_at);
  if (Number.isNaN(expiry.getTime()) || expiry <= now) {
    throw new Error("Authorization is expired or invalid");
  }
  return authorization;
}

export function executePrimeEcho({ ir, authorization, agent_id = "prime-compiler" }) {
  validatePrimeIr(ir);
  validateAuthorization(authorization);

  const intent = {
    intent_id: randomUUID(),
    action: REQUIRED_ACTION,
    agent_id,
    parameters: {
      source_expression: ir.source_expression,
      lexicon_version: ir.lexicon_version,
      symbols: ir.symbols,
      transitions: ir.transitions,
      closed_path: Boolean(ir.closed_path),
    },
    timestamp: new Date().toISOString(),
  };

  const governance = {
    intent_id: intent.intent_id,
    status: "allowed",
    risk_level: "LOW",
    requires_approval: true,
    checks: {
      prime_ir_valid: true,
      bounded_action: REQUIRED_ACTION,
      authorization_present: true,
      external_side_effects: false,
    },
  };

  const authorizationRecord = {
    intent_id: intent.intent_id,
    decision: authorization.decision,
    authorized_by: authorization.authorized_by,
    timestamp: authorization.timestamp || new Date().toISOString(),
    conditions: {
      action: REQUIRED_ACTION,
      expires_at: authorization.expires_at,
      scope: authorization.scope || "prime-runtime-bridge-v0.1",
    },
  };

  const execution = {
    intent_id: intent.intent_id,
    action: REQUIRED_ACTION,
    connector: "prime-runtime-bridge",
    timestamp: new Date().toISOString(),
    result: {
      status: "EXECUTED",
      effect: "ECHO_ONLY",
      source_expression: ir.source_expression,
      returned_symbols: [...ir.symbols],
      crossing_count: ir.transitions.filter(
        (step) => step.direction !== "NO_BOUNDARY_CROSSING",
      ).length,
      external_side_effects: false,
    },
  };

  const receipt = generateReceipt({
    intent_hash: hashIntent(intent),
    governance_hash: hashGovernance(governance),
    authorization_hash: hashAuthorization(authorizationRecord),
    execution_hash: hashExecution(execution),
    intent_id: intent.intent_id,
    action: intent.action,
    agent_id: intent.agent_id,
    authorized_by: authorizationRecord.authorized_by,
    ingestion: {
      source: "prime",
      channel: "prime-runtime-bridge",
      source_message_id: ir.source_expression || null,
      timestamp: intent.timestamp,
    },
    policy: {
      evaluated: true,
      decision: "ALLOW",
      rules_triggered: ["PRIME_IR_VALID", "EXPLICIT_AUTHORIZATION", "ECHO_ONLY"],
      policy_pack: "prime-runtime-bridge-v0.1",
    },
  });

  const verification = verifyReceipt(receipt);
  if (!verification.valid) {
    throw new Error("Generated RIO receipt failed verification");
  }

  return {
    status: "RETURNED",
    prime: {
      source_expression: ir.source_expression,
      lexicon_version: ir.lexicon_version,
      returned_expression: ir.symbols.join(" -> "),
    },
    runtime: {
      intent,
      governance,
      authorization: authorizationRecord,
      execution,
    },
    receipt,
    receipt_verification: verification,
  };
}
