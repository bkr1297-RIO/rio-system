import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const schemasUrl = new URL("../schemas/", import.meta.url);

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

test("every root envelope schema is closed and declares every required property", async () => {
  const names = (await readdir(schemasUrl)).filter((name) => name.endsWith(".schema.json"));
  assert.equal(names.length, 9);
  for (const name of names) {
    const schema = await readJson(new URL(name, schemasUrl));
    assert.equal(schema.type, "object", name);
    assert.equal(schema.additionalProperties, false, name);
    const declared = new Set(Object.keys(schema.properties ?? {}));
    for (const required of schema.required ?? []) {
      assert.ok(declared.has(required), `${name}: required property ${required} is undeclared`);
    }
  }
});

test("the frozen experiment contract matches its declared non-authoritative constants", async () => {
  const contract = await readJson(new URL("../experiment-contract.json", import.meta.url));
  const schema = await readJson(new URL("shadow-experiment-contract.schema.json", schemasUrl));
  for (const [name, property] of Object.entries(schema.properties)) {
    if (Object.hasOwn(property, "const")) {
      assert.deepEqual(contract[name], property.const, name);
    }
  }
  assert.equal(contract.activationStatus, "DRAFT_NOT_ACTIVATED");
  assert.equal(contract.promotionEligible, false);
  assert.deepEqual(contract.permittedSourcePaths, ["GET /api/v1/ledger"]);
});
