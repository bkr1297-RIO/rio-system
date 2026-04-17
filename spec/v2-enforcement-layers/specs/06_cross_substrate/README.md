# 06 — Cross-Substrate Handoff

---

## Purpose

The cross-substrate handoff defines the boundary protocol when execution crosses from one substrate to another. The core rule: **receipt validation does not grant execution permission**. Every substrate boundary requires a fresh authorization.

---

## Process

Every cross-substrate handoff follows this exact sequence:

| Step | Action | Description |
|---|---|---|
| 1 | `validate_upstream_receipt` | Validate the receipt from the upstream substrate. Four checks: signature, timing, identity, measurement. |
| 2 | `validate_compatibility` | Verify the upstream action is compatible with the downstream substrate's capabilities and policy. |
| 3 | `issue_new_dtt` | Issue a NEW Delegation Trust Token for the downstream substrate. Fresh authorization — not derived from the upstream receipt. |
| 4 | `execute` | Execute the action in the downstream substrate under the newly issued DTT. |
| 5 | `generate_receipt` | Generate a receipt for the downstream execution. Links to upstream_receipt_hash for traceability. |

---

## Receipt Validation (Step 1)

Four checks on the upstream receipt. All must pass.

| Check | What it validates |
|---|---|
| **Signature** | Receipt was signed by the issuing authority and has not been tampered with. |
| **Timing** | Receipt was generated within the expected time window. Not expired. Not future-dated. |
| **Identity** | The identity that produced the receipt matches the expected actor for that step. |
| **Measurement** | The receipt hash covers the actual execution output. Recomputation matches. |

If any check fails: **BLOCK**. No downstream action occurs.

---

## New DTT Issuance (Step 3)

The new DTT is:

| Property | Value |
|---|---|
| Scope | Local to the downstream substrate only |
| TTL | Bounded. Same TTL rules as any execution token |
| Single-use | Yes |
| Source | Issued by the gate, not by the upstream substrate |
| Relationship to receipt | The receipt informed the decision. The receipt did not create the DTT. |

---

## Constraints

| Constraint | Value | Description |
|---|---|---|
| `no_implicit_authority_flow` | `true` | Authority does not flow implicitly from one substrate to another. |
| `receipt_not_permission` | `true` | A receipt is proof of what happened. It is not permission for what happens next. |
| `new_authorization_required` | `true` | Every cross-substrate handoff requires a new, locally issued authorization. No exceptions. |

---

## The Rule That Applies to Every Spec

> Execution requires a locally issued authorization. Upstream receipts may be consumed but never grant permission.

This rule is not unique to cross-substrate handoffs. It applies at every execution boundary in the system. The cross-substrate case makes it most visible because the boundary is between different substrates, but the same principle holds within a single substrate.

---

## Failure Conditions

| Condition | Result |
|---|---|
| Upstream receipt fails any of 4 checks | BLOCK. No downstream action. |
| Compatibility check fails | BLOCK. Incompatible substrates cannot hand off. |
| Execution attempted without fresh DTT | BLOCK. |
| Upstream receipt used as authorization | VIOLATION. This is the core anti-pattern this spec prevents. |
