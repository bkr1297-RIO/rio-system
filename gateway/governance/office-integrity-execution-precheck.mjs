/**
 * C2C-001 Office Integrity Execution Precheck
 *
 * Gateway-ready precheck seam for running Office Integrity before execution
 * token issuance. This module does not write to the ledger or mutate intent
 * state directly; callers receive a ledger-compatible entry and response
 * payload when HOLD is required.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import { verifyOfficeIntegrity } from "./office-integrity-validator.mjs";

const DEFAULT_MATRIX_URL = new URL("../../config/concordance_matrix.sample.json", import.meta.url);

let cachedMatrix = null;

export function loadConcordanceMatrix(matrixUrl = DEFAULT_MATRIX_URL) {
  if (cachedMatrix && matrixUrl === DEFAULT_MATRIX_URL) return cachedMatrix;

  const matrix = JSON.parse(readFileSync(matrixUrl, "utf8"));
  if (matrixUrl === DEFAULT_MATRIX_URL) cachedMatrix = matrix;
  return matrix;
}

export function hashOfficeIntegrityReceipt(receipt = {}) {
  return createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
}

export function extractDeclaredOffice(intent = {}) {
  return intent.c2c?.declared_office
    || intent.office?.declared_office
    || intent.parameters?.declared_office
    || intent.parameters?.office
    || intent.parameters?.c2c?.declared_office
    || intent._intake?.context?.declared_office
    || intent._intake?.context?.office
    || null;
}

export function inferAuthorityLevel(intent = {}) {
  if (intent.authorization?.ed25519_signed === true) return "human_signature";
  if (intent.authorization?.authorization_hash) return "human_confirmation";
  if (intent.governance?.governance_hash) return "policy_profile";
  return "none_observational";
}

export function inferConsequenceClass(intent = {}) {
  return intent.parameters?.consequence_class
    || intent.parameters?.c2c?.consequence_class
    || intent._intake?.context?.consequence_class
    || "runtime_action";
}

export function buildOfficeIntegrityRequest(intent = {}, context = {}) {
  const declaredOffice = extractDeclaredOffice(intent);
  if (!declaredOffice) return null;

  return {
    actor_id: context.actor_id || intent.agent_id || intent.principal_id || null,
    declared_office: declaredOffice,
    requested_action: context.requested_action || intent.action,
    consequence_class: context.consequence_class || inferConsequenceClass(intent),
    authority_context: {
      authority_level: context.authority_level || inferAuthorityLevel(intent),
    },
  };
}

export function buildOfficeIntegrityLedgerEntry(intent = {}, holdResult = {}, receiptHash = null) {
  return {
    intent_id: intent.intent_id,
    action: intent.action,
    agent_id: intent.agent_id,
    status: "blocked",
    detail: `C2C office integrity HOLD: ${holdResult.reason} — ${holdResult.message}`,
    receipt_hash: receiptHash,
  };
}

export function buildOfficeIntegrityHoldResponse(intent = {}, holdResult = {}, receiptHash = null) {
  return {
    intent_id: intent.intent_id,
    status: "blocked",
    decision: "HOLD",
    reason: holdResult.reason,
    message: holdResult.message,
    c2c_office_integrity: {
      status: holdResult.status,
      reason: holdResult.reason,
      non_authorizing: true,
      receipt_hash: receiptHash,
    },
    receipt: holdResult.receipt,
  };
}

export function runOfficeIntegrityExecutionPrecheck({
  intent = {},
  matrix = loadConcordanceMatrix(),
  context = {},
  now,
  idFactory,
} = {}) {
  const request = buildOfficeIntegrityRequest(intent, context);

  if (!request) {
    return {
      status: "SKIPPED",
      reason: "no_declared_office",
      non_authorizing: true,
      boundary: "Office Integrity precheck is skipped because the intent does not declare an office. This preserves backward compatibility and does not authorize action.",
    };
  }

  const result = verifyOfficeIntegrity({ matrix, request, now, idFactory });

  if (result.status === "PASS") {
    return {
      status: "PASS",
      result,
      non_authorizing: true,
      boundary: "Office Integrity PASS confirms office/action fit only. Execution still requires normal RIO authorization, token, and receipt controls.",
    };
  }

  const receiptHash = hashOfficeIntegrityReceipt(result.receipt);
  return {
    status: "FAIL_HOLD",
    result,
    receipt_hash: receiptHash,
    ledger_entry: buildOfficeIntegrityLedgerEntry(intent, result, receiptHash),
    response: buildOfficeIntegrityHoldResponse(intent, result, receiptHash),
    non_authorizing: true,
  };
}
