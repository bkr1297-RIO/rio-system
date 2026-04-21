# RIO Phase 1 — Invariant Test Matrix

**Version:** 1.0
**Scope:** Execution Boundary Validation
**Mode:** Validation only — no feature expansion

---

## Core Invariant

An action is authorized **only when**:

1. A valid, single-use token exists
2. Execution exactly matches the approved intent (payload binding)
3. Lineage is fully resolved (no pending/failed dependencies)

**If any condition fails → DENY (fail-closed)**

---

## Outcome Semantics

| Outcome | Meaning |
|---------|---------|
| **DENY** | Request rejected before execution |
| **BLOCK** | Halted due to lineage/dependency |
| **EXECUTE** | Action performed |

No other outcomes exist in Phase 1. There is no WARN, no RETRY, no PARTIAL.

---

## T-01 — Authorization Required

**Action:** Submit execution request with no token.

**Expected:** DENY

**Checks:**
- No token → gate rejects immediately
- Reason code: `MISSING_TOKEN`
- No execution occurs
- Denial receipt written to ledger

**Invariant:** `¬Token(A) ⇒ ¬Real(A)`

---

## T-02 — ExactMatch (Payload Binding)

**Action:** Submit execution with valid token but modified payload.

**Expected:** DENY

**Checks:**
- `hash(intent + payload)` ≠ `token.intent_hash`
- Reason code: `ACT_BINDING_MISMATCH`
- No execution occurs
- Denial receipt written to ledger

**Invariant:** `Real(A) ≠ Approved(A) ⇒ ¬Real(A)`

---

## T-03 — Replay Prevention

**Action:** Use a consumed token a second time.

**Expected:** DENY

**Checks:**
- First use succeeds (EXECUTE)
- Second use denied
- Reason code: `TOKEN_USED`
- Token status: CONSUMED
- No second execution occurs

**Invariant:** `Used(T) ⇒ ¬Valid(T) ⇒ ¬Real(A)`

---

## T-04 — Trace Integrity

**Action:** Submit execution with valid token but wrong `trace_id`.

**Expected:** DENY

**Checks:**
- `token.trace_id` ≠ `request.trace_id`
- Reason code: `TRACE_MISMATCH`
- No execution occurs
- Cross-session attack blocked

**Invariant:** `Trace(T) ≠ Trace(R) ⇒ ¬Real(A)`

---

## T-05 — Lineage Integrity

**Action:** Submit execution with valid token but unresolved dependency.

**Expected:** BLOCK

**Checks:**
- At least one dependency has status PENDING or FAILURE
- Reason code: `LINEAGE_UNRESOLVED`
- No execution occurs
- Blocking receipt written to ledger

**Invariant:** `¬Resolved(Deps(A)) ⇒ ¬Real(A)`

---

## T-06 — Valid Execution (Happy Path)

**Action:** Submit execution with valid token, matching payload, correct trace, all dependencies resolved.

**Expected:** EXECUTE

**Checks:**
- All 5 gate checks pass
- Execution occurs
- Token consumed (status: CONSUMED)
- Receipt generated with:
  - `decision: EXECUTE`
  - `receipt_hash` present
  - `payload_hash` matches `hash(intent + payload)`
  - `prev_hash` links to previous ledger entry
- Ledger entry written
- Ledger hash chain validates

**Invariant:** `Token(A) ∧ Match(A) ∧ Trace(A) ∧ Resolved(A) ⇒ Real(A)`

---

## T-06a — Scope / Constraint Enforcement

**Action:** Submit execution with valid token, matching payload, correct trace, resolved lineage — but payload violates a scope constraint (e.g., `amount > max_amount`, or `target` not in allowed list).

**Expected:** DENY

**Checks:**
- Constraint violation detected
- Execution blocked
- Reason code: `SCOPE_VIOLATION`
- No execution occurs
- Denial receipt written to ledger

**Invariant:** `WithinScope(A) = false ⇒ Real(A) = false`

---

## Validation Criteria

The system is valid **only if**:

- All Phase 1 tests pass (T-01 through T-06a)
- Every failure condition produces DENY or BLOCK
- No execution occurs under invalid conditions
- Receipt + ledger remain consistent after all tests
- Ledger hash chain validates end-to-end

---

## Final Rule

If the system cannot reliably say "no" under invalid conditions:

> The execution boundary is not valid.
