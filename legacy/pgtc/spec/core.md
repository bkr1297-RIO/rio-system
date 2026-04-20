# RIO Core Specification

## 1. Scope

This specification governs real-world side effects only.
If no external effect occurs, this specification does not apply.

---

## 2. Core Invariant

An action is real if and only if all conditions below are satisfied:

Real(A) ⇔
Authorized(A) ∧
Recorded_pre(A) ∧
Recorded_post(A) ∧
OutcomeConsistency(A) ∧
ExactMatch(A) ∧
LineageIntegrity(A)

Where:

OutcomeConsistency(A) ⇔ ObservedOutcome(A) = ExpectedOutcome(A)

Outcome consistency MUST be evaluated within the defined observable boundary of the system.

---

## 3. Authority Constraint

All authority MUST originate from an explicit human-held key.
Authority MUST be expressed as a verifiable authorization artifact bound to a specific intent.

Prohibited:
- inferred authority
- delegated authority without explicit grant
- self-issued authority

---

## 4. Execution Constraint

No real-world effect may occur outside a governed execution path.
All execution MUST pass through a single enforcement boundary:

Execution Gate

---

## 5. Pre-Recording Constraint

Execution requires a durable PendingRecord prior to any side effect.
If no pending record exists:
→ Execution MUST be considered invalid

---

## 6. Post-Recording Constraint

Every execution MUST produce an immutable Receipt.
If no receipt exists:
→ Action MUST NOT be considered real

---

## 7. Exact Match Constraint

Executed action MUST exactly match authorized intent.
ExactMatch(A) MUST be determined by comparing the executed action to the canonical form of the authorized intent.
Canonical form MUST be deterministic and used for all hash-based validation.

Includes:
- operation type
- target
- parameters
- context

Prohibited:
- expansion
- substitution
- interpretation

---

## 8. Outcome Consistency Constraint

Execution is valid only if:

ObservedOutcome(A) = ExpectedOutcome(A)

Where:

ObservedOutcome(A):
The state of all affected variables after execution, within the system's observable boundary.

ExpectedOutcome(A):
The state defined by applying the authorized intent to the pre-execution state.

If mismatch:
→ System MUST HALT

---

## 9. Lineage Constraint

All actions MUST be linked in a continuous, verifiable chain.
Lineage MUST be reconstructable across:
- intent
- authorization
- execution
- receipt
- ledger entries

Prohibited:
- orphan actions
- chain breaks
- unverified dependencies

---

## 10. Non-Bypassability

No component may produce real-world effects outside the governed system.

Applies to:
- AI outputs
- scripts
- connectors
- background processes

All side effects MUST occur through authorized execution paths only.

---

## 11. Failure Behavior

All violations MUST result in fail-closed behavior.
System response:
→ HALT before impact

---

## 12. Deterministic Execution Requirement

Execution MUST be deterministic with respect to:
- canonical intent
- bound parameters
- system state

---

## 13. Role Separation

Generation, Approval, Authorization, Execution, and Verification MUST remain independent roles.
No role overlap is allowed.

---

## 14. Update Constraint

System rules may only change through an authorized update process.

Requirements:
- explicit approval
- versioning
- reversibility

---

## 15. Completeness Condition

An action is valid if and only if all constraints are satisfied.
No partial validity exists.
