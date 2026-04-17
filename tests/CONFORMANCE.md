# RIO Conformance Test Suite

## Purpose

This suite contains permanent, reusable tests that verify the core invariants of the RIO governed execution system. These tests are not regression tests for features. They are structural proofs that the enforcement architecture holds under adversarial conditions.

Any implementation of RIO — current or future — must pass every test in this suite. If a test fails, the system is non-conformant.

---

## Invariants Under Test

| ID | Invariant | Test | Location |
|---|---|---|---|
| INV-1 | Receipt does not equal Authorization. A receipt records what happened. It does not authorize what happens next. Every action requires its own explicit DTT. | Implicit Authority Chain | `tests/authority/` |
| INV-2 | Single-use token enforcement under concurrent execution. A token with `max_executions: 1` must permit exactly one execution, even when multiple requests arrive simultaneously. | Concurrency Race Condition | `tests/runtime/` |
| INV-3 | Single-use token enforcement under true parallel multi-process access. The invariant from INV-2 must hold when independent OS processes access a shared token store simultaneously, simulating a distributed deployment. | Distributed Concurrency Race | `tests/runtime/` |

---

## Test 1: Implicit Authority Chain

**File:** `tests/authority/implicit_authority_chain.test.ts`

**Spec:** `tests/authority/implicit_authority_chain.md`

**Evidence:** `tests/evidence/implicit_authority_chain_evidence.json`

**What it does:** Authorizes a single `draft_email` action, executes it, captures Receipt_1, then attempts 6 unauthorized follow-up actions without issuing any new authorization. Every unauthorized action must be blocked. No action may derive authority from a receipt, context, or session.

**Last run:** 2026-04-17 — 10 tests, 10 passed, 0 failed.

| Step | Action | Expected | Actual |
|---|---|---|---|
| 2 | draft_email (authorized) | ALLOWED | ALLOWED |
| 3a | send_email (no auth) | BLOCKED | BLOCKED — 5 checks failed |
| 3b | send_email (burned token) | BLOCKED | BLOCKED — 5 checks failed |
| 3c | web_search (LOW risk) | ALLOWED (own path) | ALLOWED (independent auto-approval) |
| 3d | draft_email replay | BLOCKED | BLOCKED — 3 checks failed |
| 3e | New draft_email (no approval) | BLOCKED | BLOCKED — 5 checks failed |
| 3f | Cross-intent replay | BLOCKED | BLOCKED — 5 checks failed |

---

## Test 2: Concurrency Race Condition (In-Process)

**File:** `tests/runtime/concurrency_race.test.ts`

**Spec:** `tests/runtime/concurrency_race.md`

**Evidence:** `tests/evidence/concurrency_race_evidence.json`

**What it does:** Creates a single `send_email` action with a single-use authorization token (`max_executions: 1`), then fires 5 concurrent execution requests simultaneously using the same token. Exactly 1 must succeed. Exactly 4 must fail. The token must be burned after completion.

**Last run:** 2026-04-17 — 3 tests, 3 passed, 0 failed.

| Request | Expected | Actual | Failed Check |
|---|---|---|---|
| 1 | SUCCESS | SUCCESS | — |
| 2 | BLOCKED | BLOCKED | token_execution_count_valid |
| 3 | BLOCKED | BLOCKED | token_execution_count_valid |
| 4 | BLOCKED | BLOCKED | token_execution_count_valid |
| 5 | BLOCKED | BLOCKED | token_execution_count_valid |

**Scope limitation:** This test runs within a single Node.js process. The event loop naturally serializes the `validateAuthorizationToken` call. It validates the logical invariant but does not stress-test true parallel access. See Test 3 for the distributed proof.

---

## Test 3: Distributed Concurrency Race Condition (Multi-Process)

**Orchestrator:** `tests/runtime/distributed_concurrency_orchestrator.mjs`

**Worker:** `tests/runtime/distributed_worker.mjs`

**Token Store:** `tests/runtime/distributed_token_store.mjs`

**Spec:** `tests/runtime/distributed_concurrency_race.md`

**Evidence:** `tests/evidence/distributed_concurrency_evidence.json`

**What it does:** Spawns 10 independent child processes (separate PIDs, separate V8 isolates) that each attempt to validate and execute against a single shared token stored in a file (simulating a database row). Runs two phases:

### Phase 1: UNSAFE (no locking) — Proves the race exists

Without locking, multiple processes can read `execution_count === 0` before any process writes `execution_count === 1`. This is the exact vulnerability that would exist in a distributed deployment without CAS/locking.

**Last run:** 2026-04-17 — 5 trials, 10 workers each.

| Trial | Successes | Expected | Verdict |
|---|---|---|---|
| 1 | 1 | 1 | PASS |
| 2 | 1 | 1 | PASS |
| 3 | 1 | 1 | PASS |
| 4 | 1 | 1 | PASS |
| 5 | **2** | 1 | **FAIL** |

**Result:** Race condition **manifested** on trial 5. Two independent processes both executed against the same single-use token. Total executions: 6 (expected: 5). This proves the race window is real and exploitable.

### Phase 2: CAS (compare-and-swap locking) — Proves the fix works

With exclusive file locking (simulating `SELECT ... FOR UPDATE` or Redis `SETNX`), only one process can read-validate-increment at a time. All others are blocked until the lock is released.

**Last run:** 2026-04-17 — 5 trials, 10 workers each.

| Trial | Successes | Expected | Verdict |
|---|---|---|---|
| 1 | 1 | 1 | PASS |
| 2 | 1 | 1 | PASS |
| 3 | 1 | 1 | PASS |
| 4 | 1 | 1 | PASS |
| 5 | 1 | 1 | PASS |

**Result:** CAS enforcement held across all 5 trials. Exactly 1 execution per trial. Token burned after each execution. Zero double-executions.

### Distributed Test Verdict

| Phase | Result | Meaning |
|---|---|---|
| UNSAFE | FAIL (double-execution detected) | The race window is structurally present in any read-modify-write without locking |
| CAS | PASS (5/5 trials, exactly 1 execution each) | Atomic compare-and-swap eliminates the race |

**Implication for production:** The current in-memory single-process implementation is safe because Node.js event loop serializes access. Any multi-process, multi-server, or database-backed deployment **MUST** use atomic compare-and-swap or row-level locking on the token store. This is not optional.

---

## How to Run

From the `rio-proxy` project root:

```bash
# Run in-process conformance tests (Vitest)
npx vitest run server/implicit-authority-chain.test.ts server/concurrency-race.test.ts

# Run distributed concurrency test (multi-process, standalone)
node server/distributed-concurrency-orchestrator.mjs 10

# Run individually
npx vitest run server/implicit-authority-chain.test.ts
npx vitest run server/concurrency-race.test.ts
```

---

## Evidence Files

Each test produces a JSON evidence file in `tests/evidence/`. These files contain the exact results, timestamps, enforcement mechanisms observed, and failure details for every step. They are the machine-readable proof that the test was run and the invariant held.

| Evidence File | Test |
|---|---|
| `implicit_authority_chain_evidence.json` | Test 1: Implicit Authority Chain |
| `concurrency_race_evidence.json` | Test 2: Concurrency Race (In-Process) |
| `distributed_concurrency_evidence.json` | Test 3: Distributed Concurrency Race (Multi-Process) |

---

## Directory Structure

```
tests/
  CONFORMANCE.md                                    ← This file
  authority/
    implicit_authority_chain.md                      ← Human-readable spec
    implicit_authority_chain.test.ts                 ← Executable test (Vitest)
  runtime/
    concurrency_race.md                              ← Human-readable spec
    concurrency_race.test.ts                         ← Executable test (Vitest)
    distributed_concurrency_race.md                  ← Human-readable spec
    distributed_concurrency_orchestrator.mjs         ← Multi-process orchestrator
    distributed_worker.mjs                           ← Child process worker
    distributed_token_store.mjs                      ← File-backed token store (UNSAFE + CAS)
  evidence/
    implicit_authority_chain_evidence.json            ← Run evidence
    concurrency_race_evidence.json                   ← Run evidence
    distributed_concurrency_evidence.json             ← Run evidence
```

---

## Adding New Conformance Tests

Each new test requires exactly 3 files:

1. `tests/<category>/<test_name>.md` — Human-readable spec (invariant, setup, steps, expected pass/fail conditions)
2. `tests/<category>/<test_name>.test.ts` (or `.mjs` for multi-process) — Executable test
3. `tests/evidence/<test_name>_evidence.json` — Run evidence (generated after execution)

Update this file (CONFORMANCE.md) with the new invariant, test summary, and results table.

---

## Non-Conformance

If any test in this suite fails, the system is non-conformant. The failure must be investigated and resolved before the system can be considered operational. Do not ship a system that fails a conformance test. Do not disable a conformance test to make the system pass.
