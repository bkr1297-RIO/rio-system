import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("observer does not import gateway runtime or production stores", async () => {
  const sourceDir = resolve(import.meta.dirname, "../src");
  const files = (await readdir(sourceDir)).filter((name) => name.endsWith(".mjs"));
  const source = (await Promise.all(files.map((name) => readFile(resolve(sourceDir, name), "utf8")))).join("\n");
  for (const prohibited of ["gateway/", "ledger-pg", "governance/", "execution/", "security/", "receipts/"]) {
    assert.equal(source.includes(prohibited), false, `production import present: ${prohibited}`);
  }
  assert.equal(/\b(POST|PUT|PATCH|DELETE)\b/u.test(source), false, "mutating HTTP verb present in source");
});
