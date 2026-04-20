# PGTC Processing Model

## 1. Overview

This document defines the normative execution model for PGTC-compliant systems.
The key words MUST, MUST NOT, SHOULD, and MAY are to be interpreted as described in RFC 2119.
All state-changing actions MUST follow this processing model.
If any required condition fails, the system MUST halt.

---

## 2. Execution Flow

All execution MUST follow the sequence:

Intent → Intent Packet → Authorization → Gate → Execution → Receipt → Ledger

No step may be skipped or reordered.

---

## 3. Step 1 — Intent Intake

The system receives an intent.
Natural language MUST NOT be executable.
Intent MUST be converted into a structured representation prior to execution.

---

## 4. Step 2 — Packetization

The system MUST convert intent into an Intent Packet.
The Intent Packet MUST:
- include all fields required for execution
- be complete and self-contained
- contain no implicit or inferred parameters

If required fields are missing:
→ execution MUST halt

---

## 5. Step 3 — Canonicalization

The system MUST produce a canonical form of the Intent Packet.
Canonicalization MUST be deterministic.
At minimum, canonicalization MUST:
- sort keys deterministically
- exclude undefined fields
- normalize null values
- avoid implicit defaults

The canonicalization algorithm MUST be explicitly identified (canon_alg).

---

## 6. Step 4 — Hashing

The system MUST compute:

intent_hash = HASH(canonical_packet)

The hash algorithm MUST be explicitly identified (hash_alg).
All subsequent validation MUST use this intent_hash.

---

## 7. Step 5 — Authorization Binding

Authorization MUST be created or provided.
Authorization MUST include:
- intent_hash
- nonce
- expiry
- signature

Authorization MUST be bound to the exact intent_hash.
If authorization does not match the intent_hash:
→ execution MUST halt

---

## 8. Step 6 — Gate Validation

The system MUST validate all conditions at the Gate before execution.
The Gate MUST verify:

1. Packet integrity
   - computed intent_hash matches authorization
2. Authorization validity
   - signature is valid
   - nonce is unused
   - expiry is not exceeded
3. Authorization binding
   - authorization matches packet and execution context
4. Trajectory constraints
   - action is allowed
   - transition is valid
   - resource is within scope

If ANY validation fails:
→ execution MUST halt

No partial validation is permitted.

---

## 9. Step 7 — Pre-Record Creation

The system MUST create a Pre-Record prior to execution.
The Pre-Record MUST include:
- intent_hash
- authorization reference
- timestamp

If Pre-Record creation fails:
→ execution MUST halt

---

## 10. Step 8 — Execution

Execution MUST occur only through an authorized adapter.
No component may produce real-world side effects outside the adapter boundary.
If execution is attempted outside adapters:
→ system MUST be considered non-compliant

---

## 11. Step 9 — Outcome Validation

The system MUST validate the execution result.
Outcome validation MUST verify that:

ObservedOutcome(A) conforms to ExpectedOutcome(A)

within the system's defined observable boundary.

If outcome validation fails:
→ execution MUST halt OR be marked failed with recorded proof

---

## 12. Step 10 — Receipt Creation

The system MUST generate a Receipt after execution.
The Receipt MUST include:
- intent_hash
- execution result
- timestamp
- error (if applicable)

If Receipt creation fails:
→ execution MUST halt

---

## 13. Step 11 — Ledger Append

The system MUST append a Ledger Entry.
Ledger entries MUST:
- include prev_hash
- include entry_hash
- maintain chain integrity

The hash chain MUST be verified prior to append.
If verification fails:
→ execution MUST halt

---

## 14. Step 12 — Blocked Actions

If execution is halted:
The system MUST:
- prevent execution
- create a blocked record
- append a ledger entry describing the failure

Blocked actions MUST be visible and auditable.

---

## 15. Step 13 — Nonce Handling

Nonce MUST be tracked and enforced.
After execution:
- nonce MUST be marked as used

If a nonce is reused:
→ execution MUST halt

---

## 16. Step 14 — Fail-Closed Behavior

At all stages:
If any validation fails:
→ execution MUST halt before impact

No partial execution is permitted.

---

## 17. Determinism Requirement

Execution MUST be deterministic with respect to:
- canonical intent
- bound parameters
- system state

Non-deterministic execution MUST be treated as invalid.

---

## 18. Invariant Enforcement

At completion, the system MUST satisfy:

Valid(A) ⇔ Auth ∧ PreRec ∧ PostRec ∧ Exact ∧ Lineage ∧ Outcome

If not satisfied:
→ action MUST NOT be considered real
