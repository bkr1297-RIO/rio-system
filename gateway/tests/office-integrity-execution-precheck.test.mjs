/**
 * C2C-001 Office Integrity Execution Precheck Tests
 *
 * Tests the gateway-ready integration seam before execution token issuance.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildOfficeIntegrityRequest,
  extractDeclaredOffice,
  inferAuthorityLevel,
  runOfficeIntegrityExecutionPrecheck,
} from "../governance/office-integrity-execution-precheck.mjs";

const sampleMatrix = JSON.parse(
  readFileSync(new URL("../../config/concordance_matrix.sample.json", import.meta.url), "utf8"),
);

const now = () => "2026-06-23T00:00:00.000Z";
const idFactory = () => "c2c_hold_execution_precheck_test";

function precheck(intent, context = {}) {
  return runOfficeIntegrityExecutionPrecheck({
    intent,
    matrix: sampleMatrix,
    context,
    now,
    idFactory,
  });
}

describe("C2C-001 Office Integrity Execution Precheck", () => {
  it("extracts declared office from supported intent locations", () => {
    assert.equal(extractDeclaredOffice({ parameters: { declared_office: "formation_layer" } }), "formation_layer");
    assert.equal(extractDeclaredOffice({ parameters: { c2c: { declared_office: "validation_methodology" } } }), "validation_methodology");
    assert.equal(extractDeclaredOffice({ _intake: { context: { office: "formation_layer" } } }), "formation_layer");
  });

  it("infers authority level from existing authorization/governance state", () => {
    assert.equal(inferAuthorityLevel({}), "none_observational");
    assert.equal(inferAuthorityLevel({ governance: { governance_hash: "g" } }), "policy_profile");
    assert.equal(inferAuthorityLevel({ authorization: { authorization_hash: "a" } }), "human_confirmation");
    assert.equal(inferAuthorityLevel({ authorization: { authorization_hash: "a", ed25519_signed: true } }), "human_signature");
  });

  it("skips without authorizing when no office is declared", () => {
    const result = precheck({
      intent_id: "intent-1",
      action: "send_email",
      agent_id: "MANUS",
      status: "authorized",
      authorization: { authorization_hash: "auth" },
    });

    assert.equal(result.status, "SKIPPED");
    assert.equal(result.reason, "no_declared_office");
    assert.equal(result.non_authorizing, true);
    assert.match(result.boundary, /does not authorize action/);
  });

  it("builds an office integrity request from an authorized intent", () => {
    const request = buildOfficeIntegrityRequest({
      intent_id: "intent-2",
      action: "structure_packet",
      agent_id: "bondi",
      parameters: { declared_office: "formation_layer", consequence_class: "repo_documentation" },
      authorization: { authorization_hash: "auth" },
    });

    assert.equal(request.actor_id, "bondi");
    assert.equal(request.declared_office, "formation_layer");
    assert.equal(request.requested_action, "structure_packet");
    assert.equal(request.consequence_class, "repo_documentation");
    assert.equal(request.authority_context.authority_level, "human_confirmation");
  });

  it("passes when office/action/consequence/authority fit", () => {
    const result = precheck({
      intent_id: "intent-3",
      action: "structure_packet",
      agent_id: "bondi",
      parameters: { declared_office: "formation_layer", consequence_class: "repo_documentation" },
      authorization: { authorization_hash: "auth" },
    });

    assert.equal(result.status, "PASS");
    assert.equal(result.non_authorizing, true);
    assert.equal(result.result.status, "PASS");
    assert.match(result.boundary, /Execution still requires normal RIO authorization/);
  });

  it("returns ledger-compatible HOLD receipt when office overreaches", () => {
    const result = precheck({
      intent_id: "intent-4",
      action: "authorize_action",
      agent_id: "bondi",
      parameters: { declared_office: "formation_layer", consequence_class: "runtime_action" },
      authorization: { authorization_hash: "auth" },
    });

    assert.equal(result.status, "FAIL_HOLD");
    assert.equal(result.result.reason, "prohibited_action");
    assert.equal(result.receipt_hash.length, 64);
    assert.equal(result.ledger_entry.intent_id, "intent-4");
    assert.equal(result.ledger_entry.status, "blocked");
    assert.equal(result.ledger_entry.receipt_hash, result.receipt_hash);
    assert.match(result.ledger_entry.detail, /C2C office integrity HOLD/);
    assert.equal(result.response.status, "blocked");
    assert.equal(result.response.decision, "HOLD");
    assert.equal(result.response.receipt.receipt_type, "hold_receipt");
    assert.equal(result.response.receipt.non_authorizing, true);
  });

  it("blocks convergence signal from becoming execution authority", () => {
    const result = precheck({
      intent_id: "intent-5",
      action: "issue_execution_token",
      agent_id: "convergence-check",
      parameters: { declared_office: "Triadic Convergence Gate", consequence_class: "runtime_action" },
      authorization: { authorization_hash: "auth", ed25519_signed: true },
    });

    assert.equal(result.status, "FAIL_HOLD");
    assert.equal(result.result.reason, "prohibited_action");
    assert.equal(result.response.receipt.failure_mode, "authority_substitution");
    assert.equal(result.response.receipt.repair_path, "ROUTE_TO_CONCORDANCE_REVIEW");
  });
});
