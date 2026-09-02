import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function unique(values, label) {
  assert.equal(
    new Set(values).size,
    values.length,
    `${label} must contain unique values`
  );
}

const atlasSchema = readJson("schema/closure-atlas.schema.json");
const fixtureSchema = readJson("schema/hostile-fixtures.schema.json");
const becomingSchema = readJson("schema/becoming-spine-crosswalk.schema.json");
const atlas = readJson("atlas.json");
const fixturePack = readJson("fixtures/hostile.json");
const becoming = readJson("becoming-spine-crosswalk.json");

assert.equal(atlasSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.equal(fixtureSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.equal(becomingSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.equal(atlas.atlas_id, "RESOLUTION-CLOSURE-ATLAS-F0.1");
assert.equal(atlas.standing, "RESEARCH_CLARIFICATION_METHOD");
assert.equal(atlas.runtime_effect, "NONE");
assert.equal(atlas.authority_effect, "NONE");
assert.equal(atlas.canon_effect, "NONE");
assert.equal(atlas.novelty, "NOT_ESTABLISHED");
assert.equal(fixturePack.fixture_pack_id, "RCA-F0.1-HOSTILE");
assert.equal(fixturePack.runtime_effect, "NONE");
assert.equal(
  becoming.crosswalk_id,
  "CONSTITUTIONAL-BECOMING-SPINE-ESTATE-CROSSWALK-F0.1"
);
assert.equal(becoming.standing, "FROZEN_ESTATE_RECONCILIATION");
assert.equal(becoming.runtime_effect, "NONE");
assert.equal(becoming.authority_effect, "NONE");
assert.equal(becoming.canon_effect, "NONE");

const recordIds = atlas.closure_records.map((record) => record.closure_id);
const fixtureIds = fixturePack.fixtures.map((fixture) => fixture.fixture_id);
unique(recordIds, "closure IDs");
unique(fixtureIds, "fixture IDs");

const recordIdSet = new Set(recordIds);
const fixtureIdSet = new Set(fixtureIds);
const allowedPreEffectForUnprovedConsequence = new Set([
  "REFINE_OR_REOPEN",
  "HOLD"
]);

for (const record of atlas.closure_records) {
  assert.match(record.closure_id, /^RCA-[0-9]{3}$/);
  assert.ok(record.observation.length > 0, `${record.closure_id} observation`);
  assert.ok(record.assessment.length > 0, `${record.closure_id} assessment`);
  assert.ok(record.typing_status.length > 0, `${record.closure_id} typing status`);
  assert.ok(record.genealogy.length > 0, `${record.closure_id} genealogy`);
  assert.ok(record.members.length > 0, `${record.closure_id} members`);
  assert.ok(record.source_anchors.length > 0, `${record.closure_id} sources`);

  const rawAnchorIds = record.source_anchors.map((anchor) => anchor.artifact_id);
  unique(rawAnchorIds, `${record.closure_id} source anchor IDs`);
  const anchorIds = new Set(rawAnchorIds);
  assert.ok(
    anchorIds.has(record.profile.source_anchor_ref),
    `${record.closure_id} profile source must resolve within the record`
  );

  for (const anchor of record.source_anchors) {
    assert.ok(anchor.revision.length > 0, `${record.closure_id} unbound revision`);
    assert.ok(anchor.fragment.length > 0, `${record.closure_id} empty fragment`);
    assert.match(anchor.verification_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.notEqual(anchor.binding_status, undefined);
    if (anchor.binding_status === "PINNED_COMMIT") {
      assert.match(anchor.revision, /^[0-9a-f]{40}$/);
    }
  }

  for (const claim of record.genealogy) {
    assert.ok(claim.source_kind.length > 0);
    assert.ok(claim.source_anchor_refs.length > 0);
    for (const ref of claim.source_anchor_refs) {
      assert.ok(
        anchorIds.has(ref),
        `${record.closure_id} genealogy source ${ref} must resolve`
      );
    }
  }

  unique(
    record.members.map((member) => member.member_id),
    `${record.closure_id} member IDs`
  );
  unique(
    record.resolution_distinctions.map((item) => item.distinction_id),
    `${record.closure_id} distinction IDs`
  );

  const witnessIds = record.witness.map((witness) => witness.witness_id);
  unique(witnessIds, `${record.closure_id} witness IDs`);
  const witnessIdSet = new Set(witnessIds);
  for (const witness of record.witness) {
    if (witness.source_anchor_ref) {
      assert.ok(
        anchorIds.has(witness.source_anchor_ref),
        `${record.closure_id} witness source ${witness.source_anchor_ref} must resolve`
      );
    }
  }

  for (const distinction of record.resolution_distinctions) {
    if (distinction.retention === "WITNESSED") {
      assert.ok(
        witnessIdSet.has(distinction.witness_ref),
        `${record.closure_id} witnessed distinction must resolve a witness`
      );
      assert.ok(
        distinction.reopen_trigger?.length > 0,
        `${record.closure_id} witnessed distinction needs a reopen trigger`
      );
    }
  }

  if (record.closure_type === "EQUIVALENCE") {
    assert.ok(record.resolution.abstraction_ref?.length > 0);
    assert.equal(record.adequacy.criterion_type, "FACTORIZATION");
  }

  if (record.closure_type === "COMPOSITIONAL") {
    assert.ok(record.resolution.macro_contract_status?.length > 0);
    if (record.resolution.macro_contract_status !== "ABSENT") {
      assert.ok(record.resolution.macro_contract_ref?.length > 0);
    }
    assert.ok(record.resolution.boundary_ports?.length > 0);
    assert.equal(record.adequacy.criterion_type, "BOUNDARY_REFINEMENT");
  }

  if (record.closure_type === "MORPHOLOGICAL") {
    assert.ok(record.resolution.pattern_signature_ref?.length > 0);
    assert.equal(record.adequacy.criterion_type, "PATTERN_ONLY");
  }

  if (record.closure_type === "MIXED_TRACE") {
    assert.ok(record.mixed_trace?.length >= 2);
    const orders = record.mixed_trace.map((operation) => operation.order);
    assert.deepEqual(
      orders,
      Array.from({ length: orders.length }, (_, index) => index + 1),
      `${record.closure_id} mixed trace must retain explicit order`
    );
    for (const operation of record.mixed_trace) {
      assert.ok(operation.input_type_ref.length > 0);
      assert.ok(operation.output_type_ref.length > 0);
      assert.ok(operation.typing_status.length > 0);
    }
  }

  if (record.closure_type === "REJECTED_FALSE_CLOSURE") {
    assert.ok(record.rejection_reason?.length > 0);
    assert.equal(record.failure_disposition.pre_effect, "REJECT_CLOSURE");
  }

  const adequacy = record.adequacy;
  if (adequacy.status === "PROVED") {
    assert.ok(adequacy.proof_ref?.length > 0);
  }
  if (adequacy.status === "EXHAUSTIVELY_VERIFIED_FINITE") {
    assert.ok(adequacy.finite_domain_ref?.length > 0);
  }
  if (adequacy.status === "FINITE_FIXTURE_EVIDENCE") {
    assert.ok(adequacy.finite_domain_ref?.length > 0);
  }
  if (adequacy.status === "REFUTED_BY_COUNTEREXAMPLE") {
    assert.ok(adequacy.counterexample_refs?.length > 0);
    for (const ref of adequacy.counterexample_refs) {
      assert.ok(fixtureIdSet.has(ref), `${record.closure_id} unknown attack ${ref}`);
    }
  }
  if (
    adequacy.consequence_use &&
    ["UNESTABLISHED", "REFUTED_BY_COUNTEREXAMPLE"].includes(adequacy.status)
  ) {
    assert.ok(
      allowedPreEffectForUnprovedConsequence.has(
        record.failure_disposition.pre_effect
      ),
      `${record.closure_id} unproved consequential closure must reopen or HOLD`
    );
  }

  if (
    record.witness.length > 0 &&
    adequacy.consequence_use &&
    adequacy.status !== "PROVED" &&
    adequacy.status !== "EXHAUSTIVELY_VERIFIED_FINITE"
  ) {
    assert.notEqual(
      record.failure_disposition.pre_effect,
      "ALLOW_RESEARCH_USE_ONLY",
      `${record.closure_id} witness cannot substitute for adequacy`
    );
  }

  for (const crosswalk of record.concordance_candidate_crosswalk ?? []) {
    assert.ok(crosswalk.binding_status.length > 0);
    assert.ok(crosswalk.source_ref.length > 0);
  }
}

for (const fixture of fixturePack.fixtures) {
  assert.match(fixture.fixture_id, /^RCA-H[0-9]{2}$/);
  assert.ok(fixture.target_record_refs.length > 0);
  for (const ref of fixture.target_record_refs) {
    assert.ok(recordIdSet.has(ref), `${fixture.fixture_id} unknown record ${ref}`);
  }
}

const expectedStageNames = [
  "Possibility",
  "Preparation",
  "Choice",
  "Commitment",
  "Attempt",
  "Occurrence",
  "Consequence",
  "Witness",
  "Evidence",
  "Return",
  "Reconstruction",
  "Settlement",
  "Inheritance"
];
const expectedStageIds = expectedStageNames.map(
  (_, index) => `CBS-${String(index + 1).padStart(2, "0")}`
);

assert.equal(becoming.topology.kind, "TYPED_CAUSAL_HYPERGRAPH");
assert.equal(becoming.topology.linearity_claim, false);
assert.deepEqual(becoming.topology.display_order, expectedStageIds);
assert.equal(becoming.stages.length, 13);
assert.deepEqual(
  becoming.stages.map((stage) => stage.stage_id),
  expectedStageIds
);
assert.deepEqual(
  becoming.stages.map((stage) => stage.name),
  expectedStageNames
);
assert.deepEqual(
  becoming.stages.map((stage) => stage.order),
  Array.from({ length: 13 }, (_, index) => index + 1)
);

const becomingAnchorIds = becoming.source_anchors.map(
  (anchor) => anchor.artifact_id
);
unique(becomingAnchorIds, "Becoming Spine source anchor IDs");
const becomingAnchorIdSet = new Set(becomingAnchorIds);
for (const anchor of becoming.source_anchors) {
  assert.match(anchor.verification_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(anchor.location.length > 0);
  assert.ok(anchor.revision.length > 0);
  if (anchor.repository !== "bkr1297-RIO/rio-system") {
    assert.match(anchor.revision, /^[0-9a-f]{40}$/);
  }
}

function assertBecomingSourceRefs(refs, label) {
  assert.ok(refs.length > 0, `${label} needs source references`);
  for (const ref of refs) {
    assert.ok(
      becomingAnchorIdSet.has(ref),
      `${label} source ${ref} must resolve`
    );
  }
}

for (const claim of becoming.genealogy) {
  assertBecomingSourceRefs(claim.source_anchor_refs, "genealogy claim");
}

const lawIds = becoming.laws.map((law) => law.law_id);
unique(lawIds, "Becoming Spine law IDs");
for (const law of becoming.laws) {
  assertBecomingSourceRefs(law.source_anchor_refs, law.law_id);
}

for (const stage of becoming.stages) {
  assert.ok(stage.carriers.length > 0, `${stage.stage_id} needs carriers`);
  assert.ok(stage.non_conversions.length > 0, `${stage.stage_id} needs non-conversions`);
  assertBecomingSourceRefs(stage.source_anchor_refs, stage.stage_id);
  unique(
    stage.carriers.map((carrier) => carrier.carrier_id),
    `${stage.stage_id} carrier IDs`
  );
  for (const carrier of stage.carriers) {
    assertBecomingSourceRefs(
      carrier.source_anchor_refs,
      `${stage.stage_id}/${carrier.carrier_id}`
    );
  }
}

unique(
  becoming.interstitial_objects.map((object) => object.object_id),
  "Becoming Spine interstitial object IDs"
);
for (const object of becoming.interstitial_objects) {
  assert.equal(object.between_stage_refs.length, 2);
  for (const ref of object.between_stage_refs) {
    assert.ok(expectedStageIds.includes(ref), `${object.object_id} unknown stage ${ref}`);
  }
  assertBecomingSourceRefs(object.source_anchor_refs, object.object_id);
}

assert.equal(becoming.projection.genealogy, "NEW_DERIVATION");
assert.equal(becoming.projection.canonical_name, "BecomingView_t");
assert.equal(becoming.projection.coordinates.length, 8);
const coordinateIds = becoming.projection.coordinates.map(
  (coordinate) => coordinate.coordinate_id
);
unique(coordinateIds, "BecomingView coordinate IDs");
unique(
  becoming.projection.coordinates.map((coordinate) => coordinate.source_symbol),
  "BecomingView source symbols"
);
unique(
  becoming.projection.coordinates.map((coordinate) => coordinate.canonical_name),
  "BecomingView canonical coordinate names"
);
assert.deepEqual(
  becoming.projection.coordinates.flatMap((coordinate) => coordinate.stage_refs),
  expectedStageIds,
  "BecomingView coordinates must cover the thirteen burdens once and in order"
);

const collisionIds = becoming.known_collisions.map(
  (collision) => collision.collision_id
);
unique(collisionIds, "Becoming Spine collision IDs");
for (const collision of becoming.known_collisions) {
  assertBecomingSourceRefs(collision.source_anchor_refs, collision.collision_id);
  if (collision.hostile_fixture_ref) {
    assert.ok(
      fixtureIdSet.has(collision.hostile_fixture_ref),
      `${collision.collision_id} unknown hostile fixture`
    );
  }
}

const attemptCollision = becoming.known_collisions.find(
  (collision) => collision.collision_id === "CBS-C01"
);
assert.equal(attemptCollision.term, "AttemptAdmission");
assert.equal(attemptCollision.disposition, "PROFILE_QUALIFY");
assert.equal(attemptCollision.hostile_fixture_ref, "RCA-H16");

unique(
  becoming.attack_crosswalk.map((attack) => attack.attack_id),
  "Becoming Spine attack IDs"
);
for (const attack of becoming.attack_crosswalk) {
  assertBecomingSourceRefs(attack.source_anchor_refs, attack.attack_id);
  if (attack.hostile_fixture_ref) {
    assert.ok(
      fixtureIdSet.has(attack.hostile_fixture_ref),
      `${attack.attack_id} unknown hostile fixture`
    );
  }
}

unique(
  becoming.evidence.map((evidence) => evidence.evidence_id),
  "Becoming Spine evidence IDs"
);
const evidenceCounts = new Map(
  becoming.evidence.map((evidence) => [evidence.evidence_id, evidence.test_count])
);
assert.equal(evidenceCounts.get("CBS-E01"), 102);
assert.equal(evidenceCounts.get("CBS-E02"), 16);
assert.equal(evidenceCounts.get("CBS-E06"), 590);
for (const evidence of becoming.evidence) {
  assert.equal(evidence.kind, "FINITE_COMPUTATIONAL_EVIDENCE");
  assert.equal(evidence.result, "PASS");
  assertBecomingSourceRefs(evidence.source_anchor_refs, evidence.evidence_id);
}

unique(
  becoming.remaining_seams.map((seam) => seam.seam_id),
  "Becoming Spine seam IDs"
);
for (const seam of becoming.remaining_seams) {
  assertBecomingSourceRefs(seam.source_anchor_refs, seam.seam_id);
}

const runtimeCandidateGate = becoming.interstitial_objects.find(
  (object) => object.object_id === "RuntimeCandidateGate"
);
assert.deepEqual(runtimeCandidateGate.between_stage_refs, ["CBS-10", "CBS-12"]);

const exactAction = fixturePack.fixtures.find(
  (fixture) => fixture.fixture_id === "RCA-H06"
);
assert.equal(exactAction.attack_class, "EXACT_ACTION_MUTATION");
assert.equal(exactAction.expected_disposition, "HOLD");
assert.ok(exactAction.target_record_refs.includes("RCA-005"));

const overlap = fixturePack.fixtures.find(
  (fixture) => fixture.fixture_id === "RCA-H08"
);
assert.equal(overlap.attack_class, "OVERLAP_AMPLIFICATION");
assert.equal(overlap.expected_disposition, "REJECT_AMPLIFICATION");

const overlapPositive = fixturePack.fixtures.find(
  (fixture) => fixture.fixture_id === "RCA-H15"
);
assert.equal(overlapPositive.attack_class, "OVERLAP_POSITIVE_CONTROL");
assert.equal(overlapPositive.expected_disposition, "PRESERVE_OVERLAP");

const attemptCardinality = fixturePack.fixtures.find(
  (fixture) => fixture.fixture_id === "RCA-H16"
);
assert.equal(
  attemptCardinality.attack_class,
  "TYPE_NAME_CARDINALITY_COLLISION"
);
assert.equal(attemptCardinality.expected_disposition, "REJECT_CLOSURE");
assert.ok(attemptCardinality.target_record_refs.includes("RCA-013"));

const settlementCoverage = fixturePack.fixtures.find(
  (fixture) => fixture.fixture_id === "RCA-H21"
);
assert.equal(
  settlementCoverage.attack_class,
  "VALIDATION_COVERAGE_ESCAPE"
);
assert.equal(settlementCoverage.expected_disposition, "HOLD");

const becomingRecord = atlas.closure_records.find(
  (record) => record.closure_id === "RCA-013"
);
assert.equal(becomingRecord.closure_type, "COMPOSITIONAL");
assert.equal(becomingRecord.typing_status, "CANDIDATE");
assert.equal(becomingRecord.result, "PARTIALLY_SURVIVES");
assert.equal(becomingRecord.assessment_disposition, "SUPPORTED_BOUNDED");
assert.equal(becomingRecord.adequacy.status, "UNESTABLISHED");
assert.equal(becomingRecord.members.length, 13);

const graphRecord = atlas.closure_records.find(
  (record) => record.closure_id === "RCA-003"
);
assert.equal(
  graphRecord.members.find((member) => member.member_id === "GraphRAG").standing,
  "EXTERNAL_ALGORITHM"
);

const chiasmRecord = atlas.closure_records.find(
  (record) => record.closure_id === "RCA-011"
);
assert.equal(chiasmRecord.adequacy.status, "UNESTABLISHED");
assert.equal(chiasmRecord.adequacy.criterion_type, "PATTERN_ONLY");

console.log(
  JSON.stringify(
    {
      result: "PASS",
      scope: "structural, uniqueness, declared-constant, and cross-reference checks after strict schema validation",
      closure_records: recordIds.length,
      hostile_fixtures: fixtureIds.length,
      exact_action_disposition: exactAction.expected_disposition,
      becoming_spine_stages: becoming.stages.length,
      becoming_view_coordinates: becoming.projection.coordinates.length,
      novelty: atlas.novelty,
      runtime_effect: atlas.runtime_effect
    },
    null,
    2
  )
);
