# Proof of System Properties

> Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

---

## The Claim

RIO enforces the following invariant structurally — not by policy, not by discipline:

```
An action is AUTHORIZED only when:
1. A valid single-use token exists
2. Lineage is fully resolved (no PENDING, no FAILURE)
3. Execution payload exactly matches authorized intent

If any condition fails → DENY or BLOCK (fail-closed)
```

---

## Why "Structurally"

Most governance systems enforce rules through policy — written guidelines people are expected to follow. This system enforces rules through structure — no execution path exists that violates the invariant.

The distinction:
- **Policy:** "You should not execute without approval." (depends on compliance)
- **Structural:** "No execution path exists without a valid token." (depends on architecture)

---

## Evidence

| Artifact | Condition Tested | Result |
|---|---|---|
| `success_chain.json` | All three invariant conditions satisfied | EXECUTED — receipt with binding_match: true |
| `failure_chain.json` | Authorized but execution resolved as failure | PENDING → FAILURE — truth recorded, chain intact |
| `blocked_attempt.json` | Invariant condition failed at gate | DENIED — no execution, no lineage entry |

---

## Property 1 — No Execution Without Authorization

**Claim:** An action cannot execute without a valid, unexpired, single-use token bound to the exact intent.

**Proof mechanism:**
- Execution Gate check 1-2: TOKEN_PRESENT + TOKEN_VALID
- Token is single-use — replay returns TOKEN_ALREADY_USED
- Token is intent-bound — substitution returns ACT_BINDING_MISMATCH
- Token expiry enforced — expired token returns APPROVAL_EXPIRED

**Verified by:** `blocked_attempt.json` (no token case)

---

## Property 2 — No Silent Execution

**Claim:** Every execution attempt produces a receipt. No attempt goes unrecorded.

**Proof mechanism:**
- Receipt generated for EXECUTED, BLOCKED, and DENIED
- Ledger is append-only — no deletion, no modification
- Hash chain makes tampering detectable

**Verified by:** All three artifacts — each produces a receipt regardless of outcome.

---

## Property 3 — Binding Integrity

**Claim:** The action that executes must exactly match the action that was authorized.

**Proof mechanism:**
- Authorization computes: `binding_hash = hash(intent + payload)`
- Execution Gate check 4: `hash(execution_payload) == token.intent_hash`
- Mismatch returns ACT_BINDING_MISMATCH — execution blocked

**Verified by:** Modify `success_chain.json` payload after authorization → gate returns DENIED.

---

## Property 4 — No Continuation on Broken Lineage

**Claim:** A step in a chain cannot proceed if any declared dependency is PENDING or FAILURE.

**Proof mechanism:**
- Lineage Gate checks declared dependencies only (not chronological order)
- PENDING dependency → BLOCK (DEPENDENCY_PENDING)
- FAILURE dependency → BLOCK (DEPENDENCY_FAILED)
- Context cannot repair a failed dependency

**Verified by:** `failure_chain.json` — downstream step blocked after upstream FAILURE.

---

## Property 5 — Context Cannot Grant Permission

**Claim:** Context signals may tighten authorization requirements but cannot grant permission.

**Proof mechanism:**
- Context evaluated only at Governor layer
- `allow = base.allow AND context.allow` — context can only restrict
- Context never touches DTT, Execution Gate, receipts, or ledger

**Verified by:** Test D in LineageSpec — HIGH_RISK context tightens step 2, does not bypass it.

---

## How to Run Verification

```bash
# 1. Verify ledger chain integrity
GET /ledger/verify
# Expected: { "valid": true }

# 2. Attempt token replay
POST /execute with used token
# Expected: DENIED / TOKEN_ALREADY_USED

# 3. Attempt binding mismatch
POST /execute with modified payload
# Expected: DENIED / ACT_BINDING_MISMATCH

# 4. Attempt execution without authorization
POST /execute with no token
# Expected: DENIED / MISSING_TOKEN

# 5. Verify all attempts are receipted
GET /ledger
# Expected: receipt exists for every attempt including denials
```

---

## Conclusion

The system enforces its invariant under real conditions.

These are verifiable records, not design claims.  
The architecture makes violation structurally impossible — not merely inadvisable.

---

*Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md*  
*Confidential — Brian K. Rasmussen — April 2026*
