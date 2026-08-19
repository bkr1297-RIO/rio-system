import { spawn } from "node:child_process";
import { canonicalJson } from "./stable-json.mjs";

export async function invokeK0Runner(request, {
  command,
  args = [],
  spawnImpl = spawn,
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
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`K0 shadow runner failed with code ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")));
      } catch (error) {
        reject(new Error(`K0 shadow runner returned invalid JSON: ${error.message}`));
      }
    });
    child.stdin.end(`${canonicalJson(request)}\n`);
  });
}
