> All tests validate: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

# Distributed Concurrency Race Condition

## Invariant

Single-use token enforcement under true parallel multi-process access.

A token with `max_executions: 1` must permit exactly one execution, even when multiple independent processes attempt to validate and execute against the same shared token store simultaneously.

## Why This Test Exists

The original concurrency test (concurrency_race.test.ts) runs within a single Node.js process. The event loop naturally serializes synchronous operations, meaning `validateAuthorizationToken` (which increments `execution_count`) cannot truly interleave. That test validates the logical invariant but does not stress-test true parallel access.

This test spawns independent child processes that each access a shared file-backed token store (simulating a database row), proving that:

1. **Without locking, the race condition is real and exploitable.** Multiple processes can read `execution_count === 0` before any process writes `execution_count === 1`, causing double-execution.
2. **With CAS (compare-and-swap) locking, the invariant holds.** Exactly one process wins the lock, executes, and burns the token. All others are blocked.

## Architecture

```
Orchestrator (parent process)
  │
  ├── Initializes token in shared file store (simulates DB row)
  │
  ├── Spawns N child processes simultaneously
  │     ├── Worker 1 (PID A) → reads token → validates → attempts increment
  │     ├── Worker 2 (PID B) → reads token → validates → attempts increment
  │     ├── Worker 3 (PID C) → reads token → validates → attempts increment
  │     └── ... (N workers)
  │
  └── Collects results, classifies successes/failures, writes evidence
```

**Shared token store:** A JSON file on disk, accessed by all workers. This simulates a database row that multiple application servers would access concurrently.

**Two modes:**
- `UNSAFE` — read-modify-write without locking. Workers read, sleep (simulating network latency), then write. Multiple workers can read the same state before any writes.
- `CAS` — exclusive file lock (simulating `SELECT ... FOR UPDATE` or Redis `SETNX`). Only one worker holds the lock at a time.

## Setup

- Token: `max_executions: 1`, action: `send_email`, status: `ACTIVE`
- Workers: 10 independent Node.js child processes
- Trials: 5 per mode (total: 10 trials, 100 worker executions)

## Expected Results

### UNSAFE Mode (no locking)

- **Expected:** FAIL — at least one trial should produce more than 1 successful execution.
- **Reason:** The race window between read and write allows multiple workers to see `execution_count === 0` and all proceed to increment.
- **Note:** The race may not manifest on every trial. It depends on process scheduling and I/O timing. Even one double-execution across all trials proves the vulnerability exists.

### CAS Mode (with locking)

- **Expected:** PASS — every trial produces exactly 1 successful execution.
- **Reason:** The exclusive lock serializes access. Only one worker can read-validate-increment at a time.

## Failure Conditions

- **UNSAFE mode produces 0 double-executions across all trials:** INCONCLUSIVE. The race window exists structurally but timing was favorable. Increase worker count or add more latency to widen the window.
- **CAS mode produces more than 1 execution in any trial:** FAIL. The locking implementation is broken.
- **CAS mode produces 0 executions in any trial:** FAIL. The locking implementation is too aggressive (deadlock or timeout).

## How to Run

```bash
cd rio-proxy
node server/distributed-concurrency-orchestrator.mjs 10
```

The orchestrator runs both UNSAFE and CAS phases automatically and writes evidence to `server/distributed-concurrency-evidence.json`.

## Source Files

| File | Purpose |
|---|---|
| `distributed-concurrency-orchestrator.mjs` | Parent process — initializes token, spawns workers, collects results |
| `distributed-worker.mjs` | Child process — reads shared token, attempts validate-and-increment |
| `distributed-token-store.mjs` | Shared token store — file-backed with UNSAFE and CAS modes |
