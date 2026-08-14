import path from "node:path";
import { compareViews } from "./compare.js";
import { loadContract } from "./contracts.js";
import { loadHistoricalFixture } from "./fixture.js";
import { refract } from "./refract.js";

const CONTRACT_FILES = [
  "structural.v1.yaml",
  "temporal.v1.yaml",
  "relational.v1.yaml"
];

export function runFixtureProof({
  fixtureFilename,
  proofId,
  experimentRoot = process.cwd(),
  repositoryRoot = path.resolve(experimentRoot, "../..")
}) {
  if (!fixtureFilename || !proofId) {
    throw new Error("INVALID_PROOF_REQUEST: fixtureFilename and proofId are required");
  }

  const fixturePath = path.join(
    experimentRoot,
    "fixtures",
    fixtureFilename
  );
  const { descriptor, source } = loadHistoricalFixture(
    fixturePath,
    repositoryRoot
  );
  const contracts = CONTRACT_FILES.map((filename) =>
    loadContract(path.join(experimentRoot, "contracts", filename))
  );
  const views = contracts.map((contract) => refract(source, contract));
  const comparison = compareViews(source, contracts, views);

  return {
    proof_id: proofId,
    fixture: descriptor,
    source: {
      source_id: source.source_id,
      object_type: source.object_type,
      source_type: source.source_type,
      source_hash: source.source_hash,
      provenance: source.provenance
    },
    views,
    comparison
  };
}

export function runHistoricalProof(options = {}) {
  return runFixtureProof({
    ...options,
    fixtureFilename: "march-30-receipt.fixture.json",
    proofId: "REFRACT-P0-MARCH-30"
  });
}

export function runAprilFalsificationProof(options = {}) {
  return runFixtureProof({
    ...options,
    fixtureFilename: "april-identity-resolution.fixture.json",
    proofId: "REFRACT-P0-APRIL-IDENTITY-RESOLUTION"
  });
}
