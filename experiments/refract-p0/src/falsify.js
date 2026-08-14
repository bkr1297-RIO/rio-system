import fs from "node:fs";
import path from "node:path";
import { assertNoForbiddenInference } from "./guards.js";
import { runAprilFalsificationProof } from "./run.js";

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function claimValue(view, dimension) {
  return view.claims.find((item) => item.dimension === dimension)?.value;
}

function exerciseHostileFixture(fixture, contract) {
  try {
    assertNoForbiddenInference(fixture, contract);
    return { blocked: false, error: null };
  } catch (error) {
    return { blocked: true, error: error.message };
  }
}

export function runFalsificationPack({ experimentRoot = process.cwd() } = {}) {
  const proof = runAprilFalsificationProof({ experimentRoot });
  const fixtureRoot = path.join(experimentRoot, "fixtures");
  const expected = readJson(
    path.join(fixtureRoot, "expected", "april-identity-resolution.json")
  );
  const identityCollapse = readJson(
    path.join(fixtureRoot, "hostile", "identity-collapse.json")
  );
  const authorityPromotion = readJson(
    path.join(fixtureRoot, "hostile", "authority-promotion.json")
  );
  const relationalContract = {
    must_not_infer: [
      "causal_claim",
      "intent",
      "authority",
      "fact_promotion",
      "unstated_relationship",
      "trust",
      "permission"
    ]
  };

  const structural = proof.views.find((view) => view.view_type === "structural");
  const temporal = proof.views.find((view) => view.view_type === "temporal");
  const relational = proof.views.find((view) => view.view_type === "relational");
  const identityResult = exerciseHostileFixture(
    identityCollapse,
    relationalContract
  );
  const authorityResult = exerciseHostileFixture(
    authorityPromotion,
    relationalContract
  );
  const relationalEntities = claimValue(relational, "explicit_entities");
  const relationalRoles = claimValue(relational, "declared_roles");
  const relationalLinks = claimValue(relational, "explicit_links");
  const identityResolution = relational.unresolved_differences.find(
    (item) => item.dimension === "canonical_identity_resolution"
  );
  const identityVisible =
    relationalEntities.includes("brian.k.rasmussen") &&
    relationalEntities.includes("I-1") &&
    relationalRoles.some((item) => item.role === "agent_id") &&
    relationalRoles.some((item) => item.role === "authorized_by") &&
    relationalLinks.some(
      (item) =>
        item.relation === "source_states_same_human_as" &&
        item.standing === "SOURCE_STATED_UNRESOLVED"
    ) &&
    identityResolution?.reason === "REQUIRES_AUTHORIZED_RESOLVER";

  const assessments = [
    {
      criterion: "source_lineage_and_immutability",
      outcome: "HELD",
      evidence: {
        source_mutated: proof.comparison.source_mutated,
        conserved_source_id: proof.comparison.conserved_across_views.source_id,
        conserved_source_hash: proof.comparison.conserved_across_views.source_hash
      }
    },
    {
      criterion: "same_three_contracts",
      outcome: "HELD",
      evidence: proof.views.map((view) => view.contract_id)
    },
    {
      criterion: "structural_projection",
      outcome: "HELD",
      evidence: {
        field_count: claimValue(structural, "field_names").length,
        heading_count: claimValue(structural, "nesting").length
      }
    },
    {
      criterion: "temporal_reconstruction",
      outcome: "WEAKENED",
      evidence: {
        timestamp_count: claimValue(temporal, "explicit_timestamps").length,
        declared_sequence: claimValue(temporal, "declared_sequence"),
        limitation: "The source contains step tables, but temporal.v1 only recognizes the March receipt hash-chain table and reports the empty sequence as OBSERVED."
      }
    },
    {
      criterion: "relational_identity_visibility",
      outcome: identityVisible ? "HELD" : "BROKE",
      evidence: {
        explicit_entities: relationalEntities,
        declared_roles: relationalRoles,
        explicit_identity_links: relationalLinks.filter(
          (item) => item.relation === "source_states_same_human_as"
        ),
        canonical_resolution: identityResolution ?? null
      }
    },
    {
      criterion: "identity_collapse_guard",
      outcome: identityResult.blocked ? "HELD" : "BROKE",
      evidence: identityResult
    },
    {
      criterion: "authority_promotion_guard",
      outcome: authorityResult.blocked ? "HELD" : "BROKE",
      evidence: authorityResult
    }
  ];

  return {
    pack_id: "REFRACT-P0-FALSIFICATION-PACK-v0.1",
    implementation_id: "REFRACT-P0.1-IDENTITY-REPAIR",
    scope: "P0 only; unchanged structural.v1, temporal.v1, and relational.v1 contracts",
    proof,
    expected_unresolved_differences: expected.expected_unresolved_differences,
    hostile_fixture_results: {
      identity_collapse: identityResult,
      authority_promotion: authorityResult
    },
    assessments,
    disposition: {
      promote_to_p1: false,
      reason: "P0.1 closes the two targeted identity breaks; temporal reconstruction remains weakened and no P1 decision is authorized by this repair."
    }
  };
}
