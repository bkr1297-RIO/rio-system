import { spawn } from "node:child_process";
import { canonicalJson, sha256Canonical } from "./stable-json.mjs";

const EXPECTED_K0 = Object.freeze({
  semanticsVersion: "K0.1",
  packageVersion: "0.1.0",
  sourceCommit: "fff1b024a663a3867f54287dbc859377457f9680",
  admittedMergeCommit: "d7528dc0de20d10fdc03219892cd666e11fdb1b7",
  gitTree: "4637f718c6ba1589d890f45febe67efbdd1b63a8",
  verifierSha256: "b56c26f968082b76e7d21d992c49fbe0db926f10e9f6cd980c0ccdb8d736d5ca",
  frozenDirectoryManifestSha256: "0909acd79500c1160d35e611d11a3319dea24b15105047738e1a53d04928c1b1",
  runtimeManifestDigest: "21e190ffb5898ac5d134fe218e90ee41ba3c372943410a72ddbb285454f72f4a",
});

function exactKeys(value, expected) {
  return value && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

export function parseSingleRunnerDocument(raw) {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("K0 shadow runner returned no document.");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`K0 shadow runner returned invalid or multiple JSON documents: ${error.message}`);
  }
}

export function validateRunnerResult(value, request) {
  const rootKeys = ["schemaVersion", "requestId", "asOf", "labels", "authority", "source", "semantic", "implementation"];
  if (!exactKeys(value, rootKeys)) throw new Error("K0 runner result has an unexpected root shape.");
  if (value.schemaVersion !== "ctl-k0.shadow-result/0.1") throw new Error("K0 runner result schema mismatch.");
  if (value.requestId !== request.requestId || value.asOf !== request.asOf) throw new Error("K0 runner result is bound to a different request.");
  if (canonicalJson(value.source) !== canonicalJson(request.source)) throw new Error("K0 runner source binding mismatch.");
  if (canonicalJson(value.labels) !== canonicalJson(["NON_AUTHORITATIVE_SHADOW", "NOT_FOR_DECISION_USE"])) {
    throw new Error("K0 runner result lacks exact shadow labels.");
  }
  const authorityKeys = ["mayAuthorize", "mayBlock", "mayRoute", "mayExecute", "maySettle"];
  if (!exactKeys(value.authority, authorityKeys) || authorityKeys.some((key) => value.authority[key] !== false)) {
    throw new Error("K0 runner result claims nonzero authority.");
  }
  const binding = value.implementation?.k0;
  for (const [key, expected] of Object.entries(EXPECTED_K0)) {
    if (binding?.[key] !== expected) throw new Error(`K0 runner binding mismatch: ${key}.`);
  }
  if (binding?.runtimeFileSha256?.["src/verifier.ts"] !== EXPECTED_K0.verifierSha256) {
    throw new Error("K0 runner runtime-file binding is absent or mismatched.");
  }
  if (value.implementation?.inputDigest !== sha256Canonical(request.verificationInput)) {
    throw new Error("K0 runner input digest mismatch.");
  }
  if (value.semantic?.report?.schemaVersion !== "ctl-k0.report/0.1"
      || value.semantic?.report?.semanticsStatus !== "CHALLENGER_NON_CANONICAL"
      || value.semantic?.report?.verifierVersion !== "0.1.0") {
    throw new Error("K0 semantic report identity mismatch.");
  }
  if (value.semantic?.projectionDigest !== sha256Canonical(value.semantic?.projection)) {
    throw new Error("K0 semantic projection digest mismatch.");
  }
  const withoutDigest = structuredClone(value);
  const providedDigest = withoutDigest.implementation?.resultDigest;
  delete withoutDigest.implementation.resultDigest;
  if (providedDigest !== sha256Canonical(withoutDigest)) throw new Error("K0 runner result digest mismatch.");
  return structuredClone(value);
}

export async function invokeK0Runner(request, {
  command,
  args = [],
  spawnImpl = spawn,
  timeoutMs = 10_000,
  maxStdoutBytes = 5_000_000,
  maxStderrBytes = 65_536,
} = {}) {
  if (!command) throw new Error("A pinned K0 shadow runner command is required.");
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: {},
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let boundaryError = null;
    const timer = setTimeout(() => {
      boundaryError = new Error(`K0 shadow runner exceeded ${timeoutMs}ms.`);
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      const bytes = Buffer.from(chunk);
      stdoutBytes += bytes.length;
      if (stdoutBytes > maxStdoutBytes) {
        boundaryError = new Error(`K0 shadow runner stdout exceeded ${maxStdoutBytes} bytes.`);
        child.kill("SIGKILL");
        return;
      }
      stdout.push(bytes);
    });
    child.stderr.on("data", (chunk) => {
      const bytes = Buffer.from(chunk);
      stderrBytes += bytes.length;
      if (stderrBytes > maxStderrBytes) {
        boundaryError = new Error(`K0 shadow runner stderr exceeded ${maxStderrBytes} bytes.`);
        child.kill("SIGKILL");
        return;
      }
      stderr.push(bytes);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (boundaryError) {
        reject(boundaryError);
        return;
      }
      if (code !== 0) {
        reject(new Error(`K0 shadow runner failed with code ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`));
        return;
      }
      try {
        resolve(validateRunnerResult(parseSingleRunnerDocument(Buffer.concat(stdout).toString("utf8")), request));
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(`${canonicalJson(request)}\n`);
  });
}
