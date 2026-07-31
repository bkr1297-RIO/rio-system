import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

import { PrimeWorkspaceStore } from "../prime/workspace-store.mjs";

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function runChild(code, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", exitCode => resolve({ exitCode, stdout, stderr }));
  });
}

function moduleUrl() {
  return new URL("../prime/workspace-store.mjs", import.meta.url).href;
}

test("dead process lock is reclaimed without changing canonical state", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "prime-crash-lock-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const original = new PrimeWorkspaceStore({ root });
  original.setValue("signal", "before");

  const code = `
    import { PrimeWorkspaceStore } from ${JSON.stringify(moduleUrl())};
    const store = new PrimeWorkspaceStore({ root: process.argv[1], staleLockMs: 60000 });
    store.transact(() => process.exit(91));
  `;
  const crashed = await runChild(code, [root]);
  assert.equal(crashed.exitCode, 91);

  const recovered = new PrimeWorkspaceStore({ root, staleLockMs: 60000 });
  assert.equal(recovered.get("signal"), "before");
  assert.equal(readdirSync(root).includes("prime-workspace-state.lock"), false);
});

test("crash after temp fsync keeps canonical state and discards orphan temp", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "prime-crash-temp-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const original = new PrimeWorkspaceStore({ root });
  original.setValue("signal", "before");

  const code = `
    import { createHash } from "node:crypto";
    import { PrimeWorkspaceStore } from ${JSON.stringify(moduleUrl())};
    const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const store = new PrimeWorkspaceStore({
      root: process.argv[1],
      staleLockMs: 60000,
      faultInjector(point) {
        if (point === "after_temp_fsync") process.exit(92);
      },
    });
    store.atomicSetWithRollback({
      key: "signal",
      value: "after",
      token: "crash-token",
      expectedHash: hash("after"),
      createdAt: new Date().toISOString(),
    });
  `;
  const crashed = await runChild(code, [root]);
  assert.equal(crashed.exitCode, 92);

  const recovered = new PrimeWorkspaceStore({ root, staleLockMs: 60000 });
  assert.equal(recovered.get("signal"), "before");
  assert.equal(recovered.snapshot().rollbacks["crash-token"], undefined);
  assert.equal(readdirSync(root).some(name => name.endsWith(".tmp")), false);
});

test("successful commit remains rollback-capable after recovery path", () => {
  const root = mkdtempSync(join(tmpdir(), "prime-crash-control-"));
  try {
    const store = new PrimeWorkspaceStore({ root });
    store.atomicSetWithRollback({
      key: "signal",
      value: "after",
      token: "control-token",
      expectedHash: sha256("after"),
      createdAt: new Date().toISOString(),
    });
    const recovered = new PrimeWorkspaceStore({ root });
    assert.equal(recovered.get("signal"), "after");
    assert.equal(recovered.snapshot().rollbacks["control-token"].used, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
