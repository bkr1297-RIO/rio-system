import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCidFixture, projectExpected } from "./evaluator.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "cid-001-conformance.json"), "utf8")
);

const results = manifest.requirements.map((requirement) => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(root, requirement.fixture), "utf8")
  );
  const observed = evaluateCidFixture(fixture);
  const actual = projectExpected(observed, fixture.expected);
  const pass = JSON.stringify(actual) === JSON.stringify(fixture.expected);
  return {
    requirement_id: requirement.id,
    fixture_id: fixture.fixture_id,
    pass,
    expected: fixture.expected,
    actual,
    runtime_trace: observed.runtime_trace
  };
});

const report = {
  suite_id: manifest.suite_id,
  doctrine_id: manifest.doctrine_id,
  execution_class: manifest.execution_class,
  passed: results.filter((item) => item.pass).length,
  failed: results.filter((item) => !item.pass).length,
  conformant_at_declared_scope: results.every((item) => item.pass),
  claim_boundary: manifest.claim_boundary,
  results
};

process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (!report.conformant_at_declared_scope) process.exitCode = 1;
