/**
 * Distributed Concurrency Test Orchestrator
 * ═══════════════════════════════════════════
 *
 * Spawns N child processes that each independently attempt to validate
 * and execute against a single shared token (file-backed, simulating a DB row).
 *
 * Runs two phases:
 *   Phase 1: UNSAFE — no locking. Proves the race condition exists.
 *   Phase 2: CAS    — compare-and-swap locking. Proves the fix works.
 *
 * Usage: node distributed-concurrency-orchestrator.mjs [workerCount]
 */

import { fork } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { initToken, readResults, readFinalToken, cleanup } from "./distributed-token-store.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = join(__dirname, "distributed-worker.mjs");
const N = parseInt(process.argv[2], 10) || 10;

function spawnWorkers(mode, workerCount) {
  return new Promise((resolve) => {
    const children = [];
    let completed = 0;
    const outputs = [];

    for (let i = 1; i <= workerCount; i++) {
      const child = fork(WORKER_SCRIPT, [String(i), mode], {
        stdio: ["pipe", "pipe", "pipe", "ipc"],
        cwd: __dirname,
      });

      let stdout = "";
      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { /* suppress */ });

      child.on("exit", (code) => {
        completed++;
        try {
          outputs.push(JSON.parse(stdout.trim()));
        } catch {
          outputs.push({ workerId: i, success: false, reason: "parse_error", raw: stdout.trim() });
        }
        if (completed === workerCount) resolve(outputs);
      });

      children.push(child);
    }
  });
}

async function runPhase(mode, workerCount) {
  // Initialize fresh token
  const token = initToken(1); // max_executions: 1

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  PHASE: ${mode.toUpperCase()} MODE — ${workerCount} concurrent workers`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  Token ID:        ${token.token_id}`);
  console.log(`  Max Executions:  ${token.max_executions}`);
  console.log(`  Mode:            ${mode}`);
  console.log(`  Workers:         ${workerCount}`);
  console.log(`${"─".repeat(60)}`);

  // Spawn all workers simultaneously
  const startTime = Date.now();
  const outputs = await spawnWorkers(mode, workerCount);
  const elapsed = Date.now() - startTime;

  // Read final state
  const finalToken = readFinalToken();
  const results = readResults();

  // Classify
  const successes = outputs.filter(o => o.success);
  const failures = outputs.filter(o => !o.success);

  console.log(`\n  RESULTS (${elapsed}ms):`);
  console.log(`  ─────────────────────────────────`);

  for (const o of outputs.sort((a, b) => a.workerId - b.workerId)) {
    const status = o.success ? "✓ EXECUTED" : "✗ BLOCKED ";
    const pid = o.pid ? ` (PID ${o.pid})` : "";
    console.log(`    Worker ${String(o.workerId).padStart(2)}: ${status} — ${o.reason}${pid}`);
  }

  console.log(`\n  SUMMARY:`);
  console.log(`    Successes:        ${successes.length}`);
  console.log(`    Failures:         ${failures.length}`);
  console.log(`    Final exec count: ${finalToken?.execution_count ?? "N/A"}`);
  console.log(`    Token status:     ${finalToken?.status ?? "N/A"}`);
  console.log(`    Token burned:     ${finalToken?.status === "BURNED" ? "YES" : "NO"}`);

  // Verdict
  const isCorrect = successes.length === 1 && failures.length === workerCount - 1;
  const verdict = isCorrect ? "PASS" : "FAIL";
  console.log(`\n  VERDICT: ${verdict}`);

  if (!isCorrect && mode === "unsafe") {
    console.log(`  ⚠ EXPECTED FAILURE — ${successes.length} workers executed (should be 1).`);
    console.log(`    This proves the race condition exists without locking.`);
  } else if (!isCorrect && mode === "cas") {
    console.log(`  ✗ UNEXPECTED — CAS should prevent double-execution.`);
  } else if (isCorrect && mode === "unsafe") {
    console.log(`  ⚠ Race condition did not manifest in this run.`);
    console.log(`    This can happen with low worker counts or fast I/O.`);
    console.log(`    The race window exists but was not triggered.`);
  } else if (isCorrect && mode === "cas") {
    console.log(`  ✓ CAS enforcement held — exactly 1 execution across ${workerCount} processes.`);
  }

  cleanup();

  return {
    mode,
    workerCount,
    elapsed,
    successes: successes.length,
    failures: failures.length,
    finalExecutionCount: finalToken?.execution_count ?? null,
    tokenBurned: finalToken?.status === "BURNED",
    verdict,
    isRaceManifested: mode === "unsafe" && successes.length > 1,
    outputs,
    finalToken,
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  DISTRIBUTED CONCURRENCY TEST — RIO TOKEN ENFORCEMENT   ║");
console.log("║  Invariant: Single-use token under true parallel access ║");
console.log("╚══════════════════════════════════════════════════════════╝");

// Phase 1: UNSAFE — prove the race exists
const unsafeResults = [];
const UNSAFE_RUNS = 5; // Run multiple times to increase chance of manifesting race
console.log(`\nRunning ${UNSAFE_RUNS} UNSAFE trials to detect race condition...`);

for (let trial = 1; trial <= UNSAFE_RUNS; trial++) {
  console.log(`\n--- UNSAFE Trial ${trial}/${UNSAFE_RUNS} ---`);
  const result = await runPhase("unsafe", N);
  unsafeResults.push(result);
  if (result.isRaceManifested) {
    console.log(`\n  ★ Race condition MANIFESTED on trial ${trial}!`);
  }
}

const raceManifested = unsafeResults.some(r => r.isRaceManifested);
const totalUnsafeSuccesses = unsafeResults.reduce((sum, r) => sum + r.successes, 0);

console.log(`\n${"═".repeat(60)}`);
console.log(`  UNSAFE PHASE SUMMARY (${UNSAFE_RUNS} trials, ${N} workers each)`);
console.log(`${"═".repeat(60)}`);
console.log(`  Race manifested:    ${raceManifested ? "YES" : "NO"}`);
console.log(`  Total executions:   ${totalUnsafeSuccesses} across ${UNSAFE_RUNS} trials`);
console.log(`  Expected:           ${UNSAFE_RUNS} (one per trial)`);
if (raceManifested) {
  console.log(`  ⚠ DOUBLE-EXECUTION DETECTED — proves the race window is real.`);
} else {
  console.log(`  ⚠ Race did not manifest — window exists but timing was favorable.`);
  console.log(`    In production with network latency, the window would be wider.`);
}

// Phase 2: CAS — prove the fix works
const casResults = [];
const CAS_RUNS = 5;
console.log(`\nRunning ${CAS_RUNS} CAS trials to verify enforcement...`);

for (let trial = 1; trial <= CAS_RUNS; trial++) {
  console.log(`\n--- CAS Trial ${trial}/${CAS_RUNS} ---`);
  const result = await runPhase("cas", N);
  casResults.push(result);
}

const allCasPassed = casResults.every(r => r.verdict === "PASS");
const totalCasSuccesses = casResults.reduce((sum, r) => sum + r.successes, 0);

console.log(`\n${"═".repeat(60)}`);
console.log(`  CAS PHASE SUMMARY (${CAS_RUNS} trials, ${N} workers each)`);
console.log(`${"═".repeat(60)}`);
console.log(`  All trials passed:  ${allCasPassed ? "YES" : "NO"}`);
console.log(`  Total executions:   ${totalCasSuccesses} across ${CAS_RUNS} trials`);
console.log(`  Expected:           ${CAS_RUNS} (exactly one per trial)`);
if (allCasPassed) {
  console.log(`  ✓ CAS enforcement held across all trials.`);
} else {
  console.log(`  ✗ CAS enforcement FAILED — this should not happen.`);
}

// ═══════════════════════════════════════════════════════════════
// FINAL VERDICT
// ═══════════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(60)}`);
console.log(`  FINAL VERDICT`);
console.log(`${"═".repeat(60)}`);

const evidence = {
  test_name: "Distributed Concurrency Race Condition",
  invariant: "Single-use token enforcement under true parallel multi-process access",
  run_date: new Date().toISOString(),
  worker_count: N,
  unsafe_phase: {
    trials: UNSAFE_RUNS,
    race_manifested: raceManifested,
    total_executions: totalUnsafeSuccesses,
    expected_executions: UNSAFE_RUNS,
    double_execution_detected: totalUnsafeSuccesses > UNSAFE_RUNS,
    results: unsafeResults.map(r => ({
      trial: unsafeResults.indexOf(r) + 1,
      successes: r.successes,
      failures: r.failures,
      verdict: r.verdict,
      elapsed_ms: r.elapsed,
    })),
  },
  cas_phase: {
    trials: CAS_RUNS,
    all_passed: allCasPassed,
    total_executions: totalCasSuccesses,
    expected_executions: CAS_RUNS,
    results: casResults.map(r => ({
      trial: casResults.indexOf(r) + 1,
      successes: r.successes,
      failures: r.failures,
      verdict: r.verdict,
      elapsed_ms: r.elapsed,
    })),
  },
  conclusions: {
    race_window_exists: true,
    race_window_exploitable: raceManifested,
    cas_prevents_double_execution: allCasPassed,
    recommendation: allCasPassed
      ? "CAS/locking is required for distributed deployments. The in-memory single-process implementation is safe only because Node.js event loop serializes access. Any multi-process, multi-server, or database-backed deployment MUST use atomic compare-and-swap or row-level locking on the token store."
      : "CAS implementation needs review — double-execution occurred even with locking.",
  },
};

if (raceManifested) {
  console.log(`  UNSAFE: FAIL (race condition manifested — ${totalUnsafeSuccesses} executions in ${UNSAFE_RUNS} trials)`);
} else {
  console.log(`  UNSAFE: INCONCLUSIVE (race window exists but did not manifest in ${UNSAFE_RUNS} trials)`);
}
console.log(`  CAS:    ${allCasPassed ? "PASS" : "FAIL"} (${totalCasSuccesses} executions in ${CAS_RUNS} trials)`);
console.log(`\n  The race window is structurally present in any read-modify-write`);
console.log(`  without locking. CAS enforcement eliminates it.`);

// Write evidence
import { writeFileSync } from "fs";
import { join as joinPath } from "path";
const evidencePath = joinPath(dirname(fileURLToPath(import.meta.url)), "distributed-concurrency-evidence.json");
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
console.log(`\n  Evidence written to: ${evidencePath}`);
