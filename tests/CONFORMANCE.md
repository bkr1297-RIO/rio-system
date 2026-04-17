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

## Test 2: Concurrency Race Condition

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

**Concurrency note:** In the current in-memory implementation, Node.js single-threaded event loop provides natural serialization of the `validateAuthorizationToken` call (which increments `execution_count` synchronously). In a distributed deployment, the token store must use atomic compare-and-swap (CAS) or database-level locking to maintain this guarantee. This test validates the logical invariant; a distributed deployment must add its own concurrency-specific tests.

---

## How to Run

From the `rio-proxy` project root:

```bash
# Run both conformance tests
npx vitest run server/implicit-authority-chain.test.ts server/concurrency-race.test.ts

# Run individually
npx vitest run server/implicit-authority-chain.test.ts
npx vitest run server/concurrency-race.test.ts
```

---

## Evidence Files

Each test produces a JSON evidence file in `tests/evidence/`. These files contain the exact results, timestamps, enforcement mechanisms observed, and failure details for every step. They are the machine-readable proof that the test was run and the invariant held.

---

## Directory Structure

```
tests/
  CONFORMANCE.md              ← This file
  authority/
    implicit_authority_chain.md        ← Human-readable spec
    implicit_authority_chain.test.ts   ← Executable test (Vitest)
  runtime/
    concurrency_race.md                ← Human-readable spec
    concurrency_race.test.ts           ← Executable test (Vitest)
  evidence/
    implicit_authority_chain_evidence.json   ← Run evidence
    concurrency_race_evidence.json          ← Run evidence
```

---

## Adding New Conformance Tests

Each new test requires exactly 3 files:

1. `tests/<category>/<test_name>.md` — Human-readable spec (invariant, setup, steps, expected pass/fail conditions)
2. `tests/<category>/<test_name>.test.ts` — Executable Vitest test
3. `tests/evidence/<test_name>_evidence.json` — Run evidence (generated after execution)

Update this file (CONFORMANCE.md) with the new invariant, test summary, and results table.

---

## Non-Conformance

If any test in this suite fails, the system is non-conformant. The failure must be investigated and resolved before the system can be considered operational. Do not ship a system that fails a conformance test. Do not disable a conformance test to make the system pass.
