import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { assertNoForbiddenInference, assertNoPromotion } from "../src/guards.js";
import { sha256 } from "../src/hash.js";
import { runHistoricalProof } from "../src/run.js";

const root = process.cwd();

function loadHostile(filename) {
  return JSON.parse(
    fs.readFileSync(path.join(root, "fixtures", "hostile", filename), "utf8")
  );
}

test("canonical March 30 receipt produces three source-preserving views", () => {
  const proof = runHistoricalProof();
  assert.equal(proof.views.length, 3);
  assert.deepEqual(
    proof.views.map((view) => view.view_type),
    ["structural", "temporal", "relational"]
  );
  assert.ok(
    proof.views.every((view) => view.source_hash === proof.source.source_hash)
  );
  assert.equal(proof.comparison.source_mutated, false);
  assert.equal(proof.comparison.canonical_view_selected, false);
});

test("fixture is bound to the canonical source blob and raw SHA-256", () => {
  const proof = runHistoricalProof();
  assert.equal(
    proof.source.provenance.source_blob_sha,
    "9998d3681cde9231d04a29dc9db5e40eb7a40c44"
  );
  assert.equal(
    proof.source.provenance.raw_sha256,
    "309ccb81dc719c5be018956a607b479d25a2e0f6253612669985c24ad3a2f897"
  );
});

test("all views preserve immutable source lineage", () => {
  const proof = runHistoricalProof();
  const hashes = new Set(proof.views.map((view) => view.source_hash));
  const ids = new Set(proof.views.map((view) => view.source_id));
  assert.equal(hashes.size, 1);
  assert.equal(ids.size, 1);
  assert.equal(proof.comparison.conserved_across_views.source_hash, true);
  assert.equal(proof.comparison.conserved_across_views.source_id, true);
  assert.equal(
    proof.comparison.conserved_across_views.epistemic_status,
    true
  );
});

test("structural view exposes receipt form without causal or authority claims", () => {
  const proof = runHistoricalProof();
  const view = proof.views.find((item) => item.view_type === "structural");
  const dimensions = view.claims.map((item) => item.dimension);
  assert.ok(dimensions.includes("object_type"));
  assert.ok(dimensions.includes("field_names"));
  assert.ok(dimensions.includes("nesting"));
  assert.ok(dimensions.includes("cardinality"));
  assert.equal(view.epistemic_status, "OBSERVATION");
});

test("temporal view preserves explicit timestamp and declared hash-chain order", () => {
  const proof = runHistoricalProof();
  const view = proof.views.find((item) => item.view_type === "temporal");
  const timestampClaim = view.claims.find(
    (item) => item.dimension === "explicit_timestamps"
  );
  const sequenceClaim = view.claims.find(
    (item) => item.dimension === "declared_sequence"
  );

  assert.deepEqual(timestampClaim.value, ["2026-03-30T16:48:03.494Z"]);
  assert.deepEqual(sequenceClaim.value, [
    "Intent",
    "Governance",
    "Authorization",
    "Execution",
    "Receipt"
  ]);
});

test("relational view exposes only explicitly labeled roles and links", () => {
  const proof = runHistoricalProof();
  const view = proof.views.find((item) => item.view_type === "relational");
  const roleClaim = view.claims.find(
    (item) => item.dimension === "declared_roles"
  );
  const serialized = JSON.stringify(view);

  assert.ok(roleClaim.value.some((item) => item.role === "Proposed by"));
  assert.ok(roleClaim.value.some((item) => item.role === "Approved by"));
  assert.ok(roleClaim.value.some((item) => item.role === "Executed by"));
  const linkClaim = view.claims.find(
    (item) => item.dimension === "explicit_links"
  );
  assert.ok(
    linkClaim.value.some(
      (item) =>
        item.source === "governed_action" &&
        item.relation === "Approved by" &&
        item.target === "Brian Rasmussen (brian.k.rasmussen)"
    )
  );
  assert.equal(
    new Set(view.evidence.map((item) => item.evidence_id)).size,
    view.evidence.length
  );
  assert.equal(serialized.includes("\"authorized\":true"), false);
  assert.equal(serialized.includes("\"permission\":\"granted\""), false);
});

test("comparison names exposure, preservation, misses, and overclaim result", () => {
  const proof = runHistoricalProof();
  assert.equal(proof.comparison.projections.length, 3);
  for (const projection of proof.comparison.projections) {
    assert.equal(projection.preserved.source_id, true);
    assert.equal(projection.preserved.source_hash, true);
    assert.equal(projection.preserved.provenance, true);
    assert.equal(projection.overclaim_check, "PASS");
    assert.ok(Array.isArray(projection.exposed_dimensions));
    assert.ok(Array.isArray(projection.missed_dimensions));
  }
});

test("repeated runs retain the same source hash and deterministic view IDs", () => {
  const first = runHistoricalProof();
  const second = runHistoricalProof();
  assert.equal(first.source.source_hash, second.source.source_hash);
  assert.deepEqual(
    first.views.map((view) => view.view_id),
    second.views.map((view) => view.view_id)
  );
  assert.equal(
    sha256(first.views.map((view) => view.source_hash)),
    sha256(second.views.map((view) => view.source_hash))
  );
});

test("hostile fixture blocks View to Fact promotion", () => {
  const hostile = loadHostile("view-to-fact.json");
  assert.throws(
    () => assertNoPromotion(hostile),
    /HOSTILE_PROMOTION_BLOCKED/
  );
});

test("hostile fixture blocks PatternCandidate to CausalClaim promotion", () => {
  const hostile = loadHostile("pattern-to-causal-claim.json");
  const contract = {
    must_not_infer: ["causal_claim", "intent", "authority"]
  };
  assert.throws(
    () => assertNoForbiddenInference(hostile, contract),
    /HOSTILE_INFERENCE_BLOCKED/
  );
});
