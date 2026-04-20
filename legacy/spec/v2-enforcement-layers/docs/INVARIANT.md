> Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

# Core Invariant

## Statement

> No action may execute unless:
> 1. The previous step produced a valid receipt
> 2. That receipt is validated at the boundary
> 3. A NEW bounded authorization is issued for the next step

---

## Authority Properties

Authority in the RIO system is:

| Property | Meaning |
|---|---|
| **Always explicit** | Authority is issued by a gate through a formal authorization artifact (DTT). It is never inferred, inherited, or assumed. |
| **Always local to the current step** | An authorization is scoped to exactly one step. It cannot be carried forward, stored for later, or applied to a different action. |
| **Never inherited** | Completing step N does not grant permission for step N+1. The receipt from step N is evidence, not a credential. |
| **Never accumulated** | Multiple receipts do not combine to create broader authority. Each step starts from zero authority and must receive its own authorization. |

---

## Relationship to Existing Enforcement

This invariant is the unifying rule across all five enforcement layers:

| Layer | How the invariant applies |
|---|---|
| **01 Commit Chain** | Every ledger entry is a receipt. The next entry requires its own hash-link authorization (previous_ledger_hash binding). The chain does not grant write permission — the append operation does. |
| **02 Governance Decision** | The verification result is a receipt of intent validation. It does not authorize execution. A separate governance decision must be issued. The governance decision does not authorize execution either — a separate execution token must be issued. |
| **03 Execution Token** | The token is the authorization. It is local (5s TTL), explicit (6 gate checks), and single-use. The approval receipt informed the token issuance, but the receipt itself is not the token. |
| **04 Witness Receipt** | The receipt is the proof. It records what happened. It does not authorize what happens next. The next action in the pipeline requires its own authorization. |
| **05 Delegation Boundary** | The delegation check is a receipt of identity evaluation. It does not authorize execution. A separate authorization must be issued after the delegation check passes. |

---

## What This Prevents

| Threat | Blocked by |
|---|---|
| Authority drift | Authority is local. Cannot accumulate across steps. |
| Replay attacks | Each authorization is single-use and time-bounded. Receipts cannot substitute. |
| Implicit escalation | No receipt grants permission. Every step requires fresh evaluation. |
| Cross-system leakage | Receipts from one substrate cannot authorize actions in another. New DTT required at every boundary. |
