// All tests validate: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

/**
 * Distributed Worker — Spawned as a child process.
 * Each worker independently attempts to validate and execute against the shared token.
 *
 * Usage: node distributed-worker.mjs <workerId> <mode>
 *   mode: "unsafe" | "cas"
 */

import { runWorker, appendResult } from "./distributed-token-store.mjs";

const workerId = parseInt(process.argv[2], 10);
const mode = process.argv[3]; // "unsafe" or "cas"

if (isNaN(workerId) || !mode) {
  console.error("Usage: node distributed-worker.mjs <workerId> <mode>");
  process.exit(1);
}

// Small random delay to simulate real-world arrival jitter (0-3ms)
const jitter = Math.floor(Math.random() * 3);
const end = Date.now() + jitter;
while (Date.now() < end) { /* busy wait */ }

// Execute
const result = runWorker(workerId, mode);
result.pid = process.pid;
result.timestamp = new Date().toISOString();

// Write result to shared results file
appendResult(result);

// Output for parent process
console.log(JSON.stringify(result));
process.exit(result.success ? 0 : 1);
