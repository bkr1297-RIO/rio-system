> Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

# 05 — Delegation Boundary

**Source files:** `constrainedDelegation.ts` (checkDelegation, classifyRoleSeparation, validateRoleTransition, formatCooldownMessage), `gatewayProxy.ts` (evaluateIdentityAtGatewayBoundary, resolveAuthorityModel, GatewayIdentityEvaluation), `authorityLayer.ts` (RootAuthority, SignedPolicy)

---

## Purpose

The delegation boundary prevents trivial self-approval by enforcing structural friction when the same human identity operates as both proposer and approver. It is the enforcement of Rule 3: IF `proposer_identity_id == approver_identity_id`, THEN the transaction is INVALID unless the Self-Authorization sub-policy is met.

---

## Schemas

All schemas are defined in [`schema.json`](./schema.json). The canonical types are:

| Schema | Source | Description |
|---|---|---|
| `DelegationCheck` | constrainedDelegation.ts | Result of checkDelegation(). Three outcomes. |
| `DelegationContext` | constrainedDelegation.ts | Input to checkDelegation(). |
| `GatewayIdentityEvaluation` | gatewayProxy.ts | Gateway-level identity evaluation result. |
| `RoleTransitionCheck` | constrainedDelegation.ts | Role transition validation result. |
| `RootAuthority` | authorityLayer.ts | Root authority record. |
| `SignedPolicy` | authorityLayer.ts | Signed governance policy. |

---

## Decision Matrix

Three cases, exhaustive:

| Case | Condition | allowed | role_separation | authority_model |
|---|---|---|---|---|
| 1 | `proposer !== approver` | `true` | `"separated"` | `"Separated Authority"` |
| 2 | `proposer === approver` AND cooldown elapsed | `true` | `"constrained"` | `"Constrained Single-Actor Execution"` |
| 3 | `proposer === approver` AND cooldown NOT elapsed | `false` | `"self"` | `"BLOCKED — Self-Authorization Sub-Policy Not Met"` |

**Boundary semantics:** At `cooldown - 1ms`: BLOCKED. At exactly cooldown elapsed: ALLOWED (constrained). The boundary is inclusive.

---

## Authority Model Labels

These are the canonical audit trail labels. They appear in receipts, ledger entries, and governance reports. The exact set:

| Label | When used |
|---|---|
| `"Separated Authority"` | Different identities. True separation. |
| `"Constrained Single-Actor Execution"` | Same identity, cooldown satisfied. |
| `"BLOCKED — Self-Authorization Sub-Policy Not Met"` | Same identity, cooldown not elapsed. |

---

## Cooldown

| Constant | Value | Source |
|---|---|---|
| `DELEGATION_COOLDOWN_MS` | 120,000 (2 minutes) | constrainedDelegation.ts |

The cooldown is the minimum time that must elapse between intent creation and same-identity approval. It is measured as:

```
elapsed = approvalAttemptedAt - intentCreatedAt
remaining = max(0, DELEGATION_COOLDOWN_MS - elapsed)
```

---

## Role Enforcement

Proposer and approver are distinct roles with non-overlapping permissions:

| Role | Permitted Actions |
|---|---|
| `proposer` | `create_intent` |
| `approver` | `authorize_action` |

Cross-role actions require explicit role switch. A proposer cannot directly invoke `authorize_action`.

---

## Gateway Identity Evaluation

`evaluateIdentityAtGatewayBoundary()` MUST be called before any Gateway `/authorize` call. It is the single source of truth for identity verification at the Gateway evaluation level.

The function:
1. Calls `checkDelegation()` with the proposer and approver identity IDs
2. Maps the `role_separation` to the canonical `authority_model` label via `resolveAuthorityModel()`
3. Returns the full `GatewayIdentityEvaluation` with all fields

---

## Ledger Identity Fields

`DELEGATION_BLOCKED`, `DELEGATION_APPROVED`, and `EXECUTION` ledger entries MUST include:

- `proposer_identity_id`
- `approver_identity_id`
- `authority_model`

---

## ONE as Untrusted Client

Per Decision 2: ONE is an untrusted client. It NEVER sends raw principal IDs. The Gateway resolves email to principal via `resolvePrincipalByEmail()`. ONE only bridges identity via email through the `X-Authenticated-Email` header.

---

## Authority Layer

The authority layer provides root authority management and signed policy lifecycle:

**Root Authority:**
- Ed25519 key pair holder
- Status: `active` or `revoked`
- Revoked authorities cannot sign policies or issue tokens

**Signed Policy:**
- Deterministic hash: `SHA-256(canonical_json(rules))` — same rules always produce same hash
- Lifecycle: `active` → `superseded` (when new policy activated) or `active` → `revoked`
- Only one policy can be active at a time
- Authorization tokens cannot be issued if no active policy exists

---

## Failure Conditions

| Condition | Result |
|---|---|
| Same identity, cooldown not elapsed | BLOCKED. authority_model = "BLOCKED — Self-Authorization Sub-Policy Not Met" |
| Proposer attempts authorize_action | Denied. Must switch to approver role. |
| Revoked authority signs policy | Rejected. |
| No active policy | Authorization token cannot be issued. |
| token.policy_hash !== active_policy.policy_hash | policy_hash_match FAIL. |
