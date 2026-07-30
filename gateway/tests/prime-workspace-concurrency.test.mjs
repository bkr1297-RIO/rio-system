import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

import { PrimeWorkspaceStore } from "../prime/workspace-store.mjs";

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function runRollback(root, token) {
  const moduleUrl = new URL("../prime/workspace-store.mjs", import.meta.url).href;
  const code = `
    import { createHash } from "node:crypto";
    import { PrimeWorkspaceStore } from ${JSON.stringify(moduleUrl)};
    const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    try {
      const store = new PrimeWorkspaceStore({ root: process.argv[1], lockTimeoutMs: 3000 });
      store.atomicRollback({ token: process.argv[2], hashValue: hash });
      process.stdout.write("SUCCESS");
    } catch (error) {
      process.stdout.write("BLOCKED:" + error.message);
    }
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code, root, token], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", chunk => { out += chunk; });
    child.stderr.on("data", chunk => { err += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(out) : reject(new Error(err || `child exited ${code}`)));
  });
}

test("two processes racing one rollback token produce exactly one winner", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "prime-race-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const token = "race-token";
  const store = new PrimeWorkspaceStore({ root });
  store.atomicSetWithRollback({
    key: "race.signal",
    value: "current",
    token,
    expectedHash: sha256("current"),
    createdAt: new Date().toISOString(),
  });

  const results = await Promise.all([runRollback(root, token), runRollback(root, token)]);
  assert.equal(results.filter(result => result === "SUCCESS").length, 1);
  assert.equal(results.filter(result => /invalid or already used/.test(result)).length, 1);

  const recovered = new PrimeWorkspaceStore({ root });
  assert.equal(recovered.get("race.signal"), undefined);
  assert.equal(recovered.snapshot().rollbacks[token].used, true);
});

test("an active lock fails closed instead of overwriting state", () => {
  const root = mkdtempSync(join(tmpdir(), "prime-lock-"));
  try {
    const storeA = new PrimeWorkspaceStore({ root, lockTimeoutMs: 30, staleLockMs: 60_000 });
    const lock = join(root, "prime-workspace-state.lock");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(lock, "held", { flag: "wx" });
    assert.throws(
      () => storeA.atomicSetWithRollback({ key: "x", value: "y", token: "t", expectedHash: sha256("y"), createdAt: new Date().toISOString() }),
      /workspace is busy/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
