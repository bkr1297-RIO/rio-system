/**
 * C2C-001 Office Integrity Validator Tests
 *
 * Tests schema-shaped concordance entries, office/action fit, and
 * non-authorizing HOLD receipts on failure.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  findConcordanceEntry,
  validateConcordanceEntryShape,
  verifyOfficeIntegrity,
} from "../governance/office-integrity-validator.mjs";

const sampleMatrix = JSON.parse(
  readFileSync(new URL("../../config/concordance_matrix.sample.json", import.meta.url), "utf8"),
);

const fixedNow = () => "2026-06-23T00:00:00.000Z";
const fixedId = () => "c2c_hold_test_receipt";

function verify(request) {
  return verifyOfficeIntegrity({
    matrix: sampleMatrix,
    request,
    now: fixedNow,
    idFactory: fixedId,
  });
}

describe("C2C-001 Office Integrity Validator", () => {
  it("loads schema-shaped sample concordance entries", () => {
    assert.equal(Array.isArray(sampleMatrix), true);
    assert.ok(sampleMatrix.length >= 2);

    for (const entry of sampleMatrix) {
      assert.deepEqual(validateConcordanceEntryShape(entry), { status: "PASS" });
    }
  });

  it("finds entries by active office and alias", () => {
    const byOffice = findConcordanceEntry(sampleMatrix, "formation_layer");
    assert.equal(byOffice.primitive_id, "P-GRAMMAR-001");

    const byAlias = findConcordanceEntry(sampleMatrix, "Triadic Convergence Gate");
    assert.equal(byAlias.primitive_id, "P-CONV-001");
  });

  it("passes when declared office is allowed to perform requested action", () => {
    const result = verify({
      actor_id: "bondi",
      declared_office: "formation_layer",
      requested_action: "structure_packet",
      consequence_class: "repo_documentation",
      authority_context: {
        authority_level: "policy_profile",
      },
    });

    assert.equal(result.status, "PASS");
    assert.equal(result.non_authorizing, true);
    assert.equal(result.primitive_id, "P-GRAMMAR-001");
    assert.equal(result.receipt_type, "classification_receipt");
    assert.match(result.boundary, /does not authorize action/);
  });

  it("fails with HOLD receipt when grammar office tries to authorize", () => {
    const result = verify({
      actor_id: "bondi",
      declared_office: "formation_layer",
      requested_action: "authorize_action",
      consequence_class: "runtime_action",
      authority_context: {
        authority_level: "policy_profile",
      },
    });

    assert.equal(result.status, "FAIL_HOLD");
    assert.equal(result.reason, "prohibited_action");
    assert.equal(result.receipt.receipt_type, "hold_receipt");
    assert.equal(result.receipt.receipt_id, "c2c_hold_test_receipt");
    assert.equal(result.receipt.status, "HOLD");
    assert.equal(result.receipt.failure_mode, "witness_authorizer_collapse");
    assert.equal(result.receipt.non_authorizing, true);
    assert.match(result.receipt.boundary, /does not authorize action/);
  });

  it("fails with HOLD receipt when convergence signal tries to issue execution token", () => {
    const result = verify({
      actor_id: "convergence-check",
      declared_office: "Triadic Convergence Gate",
      requested_action: "issue_execution_token",
      consequence_class: "runtime_action",
      authority_context: {
        authority_level: "fresh_scoped_authority_event",
      },
    });

    assert.equal(result.status, "FAIL_HOLD");
    assert.equal(result.reason, "prohibited_action");
    assert.equal(result.receipt.primitive_id, "P-CONV-001");
    assert.equal(result.receipt.failure_mode, "authority_substitution");
    assert.equal(result.receipt.repair_path, "ROUTE_TO_CONCORDANCE_REVIEW");
    assert.equal(result.receipt.non_authorizing, true);
  });

  it("fails with HOLD receipt for unknown offices", () => {
    const result = verify({
      actor_id: "rogue",
      declared_office: "self_authorizing_executor",
      requested_action: "execute_action",
      consequence_class: "runtime_action",
      authority_context: {
        authority_level: "fresh_scoped_authority_event",
      },
    });

    assert.equal(result.status, "FAIL_HOLD");
    assert.equal(result.reason, "unknown_office");
    assert.equal(result.receipt.receipt_type, "hold_receipt");
    assert.equal(result.receipt.failure_mode, "office_overreach");
    assert.equal(result.receipt.repair_path, "ROUTE_TO_CONCORDANCE_REVIEW");
  });

  it("fails with HOLD receipt when authority level is insufficient", () => {
    const result = verify({
      actor_id: "bondi",
      declared_office: "formation_layer",
      requested_action: "structure_packet",
      consequence_class: "repo_documentation",
      authority_context: {
        authority_level: "none_observational",
      },
    });

    assert.equal(result.status, "FAIL_HOLD");
    assert.equal(result.reason, "insufficient_authority_level");
    assert.equal(result.receipt.status, "HOLD");
    assert.equal(result.receipt.non_authorizing, true);
  });
});
