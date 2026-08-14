import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { evaluatePolicy } from "../../../gateway/governance/policy-engine.mjs";
import { runOfficeIntegrityExecutionPrecheck } from "../../../gateway/governance/office-integrity-execution-precheck.mjs";
import { validateAuthorization } from "../../../gateway/prime/bridge.mjs";
import {
  generateReceipt,
  verifyReceipt
} from "../../../gateway/receipts/receipts.mjs";
import { evaluateCidFixture, projectExpected } from "../src/evaluator.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(here, "..");
const repositoryRoot = path.resolve(suiteRoot, "../..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(suiteRoot, "cid-001-conformance.json"), "utf8")
);

function loadFixture(requirement) {
  return JSON.parse(
    fs.readFileSync(path.join(suiteRoot, requirement.fixture), "utf8")
  );
}

describe("CID-001 manifest", () => {
  it("declares the three invariants and all ten conformance requirements", () => {
    assert.deepEqual(
      manifest.invariants.map((item) => item.id),
      ["CI-01", "CI-02", "CI-03"]
    );
    assert.deepEqual(
      manifest.requirements.map((item) => item.id),
      Array.from({ length: 10 }, (_, index) =>
        `CT-CI-${String(index + 1).padStart(2, "0")}`
      )
    );
  });

  it("binds every mapped runtime component to existing repository paths", () => {
    for (const [component, paths] of Object.entries(manifest.runtime_components)) {
      assert.ok(paths.length > 0, `${component} must map to at least one path`);
      for (const runtimePath of paths) {
        assert.ok(
          fs.existsSync(path.join(repositoryRoot, runtimePath)),
          `${component} path is missing: ${runtimePath}`
        );
      }
    }
  });
});

describe("CID-001 executable fixtures", () => {
  for (const requirement of manifest.requirements) {
    it(`${requirement.id} matches its declared expectation`, () => {
      const fixture = loadFixture(requirement);
      assert.equal(fixture.requirement_id, requirement.id);
      assert.deepEqual(fixture.runtime_components, requirement.maps_to);

      const result = evaluateCidFixture(fixture);
      assert.deepEqual(
        projectExpected(result, fixture.expected),
        fixture.expected
      );
    });
  }

  it("keeps constitutional evolution exclusive to the authorized lineage fixture", () => {
    const applied = manifest.requirements
      .map(loadFixture)
      .map(evaluateCidFixture)
      .filter((result) => result.constitutional_change === "APPLIED");

    assert.equal(applied.length, 1);
    assert.equal(applied[0].requirement_id, "CT-CI-09");
    assert.equal(applied[0].lineage_preserved, true);
  });
});

describe("Existing runtime anchors", () => {
  const policy = JSON.parse(
    fs.readFileSync(
      path.join(repositoryRoot, "gateway/config/rio/policy-v2.json"),
      "utf8"
    )
  );
  policy.status = "active";
  policy.policy_hash = policy.policy_hash || "cid-001-test-policy-hash";

  it("RIO denies self-authorization and requires quorum for constitutional change", () => {
    const selfAuthorization = evaluatePolicy(
      {
        action: "self_authorize",
        agent_id: "bondi",
        target_environment: "local",
        confidence: 100
      },
      policy
    );
    const constitutionalChange = evaluatePolicy(
      {
        action: "change_constitution",
        agent_id: "brian.k.rasmussen",
        target_environment: "local",
        confidence: 100
      },
      policy
    );

    assert.equal(selfAuthorization.governance_decision, "AUTO_DENY");
    assert.equal(constitutionalChange.governance_decision, "REQUIRE_QUORUM");
  });

  it("RIO does not convert expected utility into financial authority", () => {
    const result = evaluatePolicy(
      {
        action: "send_payment",
        agent_id: "bondi",
        target_environment: "local",
        confidence: 100,
        predicted_utility: 1.0,
        prior_success_count: 100
      },
      policy
    );
    assert.equal(result.governance_decision, "REQUIRE_HUMAN");
  });

  it("Sentinel holds a composed convergence signal that attempts authority", () => {
    const matrix = JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot, "config/concordance_matrix.sample.json"),
        "utf8"
      )
    );
    const result = runOfficeIntegrityExecutionPrecheck({
      intent: {
        intent_id: "cid-001-ct-ci-05-anchor",
        action: "issue_execution_token",
        agent_id: "convergence-check",
        parameters: {
          declared_office: "Triadic Convergence Gate",
          consequence_class: "runtime_action"
        },
        authorization: {
          authorization_hash: "sourcepoint-test-authorization",
          ed25519_signed: true
        }
      },
      matrix,
      now: () => "2026-08-14T12:00:00.000Z",
      idFactory: () => "cid-001-sentinel-anchor"
    });

    assert.equal(result.status, "FAIL_HOLD");
    assert.equal(result.response.receipt.failure_mode, "authority_substitution");
    assert.equal(result.response.receipt.non_authorizing, true);
  });

  it("Prime authorization fails closed after expiry", () => {
    assert.throws(
      () =>
        validateAuthorization(
          {
            decision: "approved",
            action: "prime.echo",
            authorized_by: "human-test-authority",
            expires_at: "2026-08-13T00:00:00.000Z"
          },
          new Date("2026-08-14T12:00:00.000Z")
        ),
      /expired or invalid/
    );
  });

  it("MUS verifies returned receipt integrity without treating it as authority", () => {
    const receipt = generateReceipt({
      intent_hash: "a".repeat(64),
      governance_hash: "b".repeat(64),
      authorization_hash: "c".repeat(64),
      execution_hash: "d".repeat(64),
      intent_id: "cid-001-mus-anchor",
      action: "send_email",
      agent_id: "bondi",
      authorized_by: "human-test-authority"
    });

    assert.equal(verifyReceipt(receipt).valid, true);
    assert.equal(receipt.hash_chain.execution_hash, "d".repeat(64));
    assert.equal(receipt.observation, undefined);
    assert.equal(receipt.authority_grant, undefined);

    const tampered = structuredClone(receipt);
    tampered.hash_chain.execution_hash = "e".repeat(64);
    assert.equal(verifyReceipt(tampered).valid, false);
  });
});
