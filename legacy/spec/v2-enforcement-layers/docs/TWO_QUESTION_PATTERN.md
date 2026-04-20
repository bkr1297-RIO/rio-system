> Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

# Two-Question Pattern

At every execution boundary, two questions must be answered in order. No execution may proceed until both are resolved.

---

## Question 1: Is the upstream output trustworthy?

> Validate the receipt.

The receipt from the previous step is validated for:

| Check | What it validates |
|---|---|
| **Signature** | Receipt was signed by the issuing authority and has not been tampered with. |
| **Timing** | Receipt was generated within the expected time window. Not expired. Not future-dated. |
| **Identity** | The identity that produced the receipt matches the expected actor for that step. |
| **Measurement** | The receipt hash covers the actual execution output. Recomputation matches. |

If any check fails, the boundary rejects. No downstream action occurs.

---

## Question 2: What is allowed to happen next?

> Issue a new authorization.

A new, bounded authorization (DTT) is issued for the next step. This authorization is:

- **Explicit** — issued by the gate, not inferred from the receipt.
- **Local** — scoped to the current step only.
- **Bounded** — time-limited, single-use, target-specific.
- **Independent** — the receipt informed the decision, but the receipt itself grants nothing.

---

## Critical Rule

| Concept | Definition |
|---|---|
| **Receipt** | Proof of what happened. A record. A witness artifact. |
| **Authorization** | Permission for what happens next. A bounded credential. |

> Receipts never grant authority. Authority must always be explicitly re-issued.

A valid receipt is necessary but not sufficient. It proves the previous step completed correctly. It does not permit the next step to execute. That permission must come from a new, locally issued authorization.

---

## Why This Matters

Without this separation, the system is vulnerable to:

| Threat | How it happens without the pattern |
|---|---|
| **Authority drift** | A receipt from step N is treated as permission for step N+1. Authority accumulates silently. |
| **Replay attacks** | A valid receipt is replayed to trigger downstream execution without fresh evaluation. |
| **Implicit escalation** | A low-risk receipt is used to authorize a high-risk action in a different context. |
| **Cross-system leakage** | A receipt from Substrate A is accepted as authorization in Substrate B without re-evaluation. |

The two-question pattern eliminates all four by forcing every boundary to re-evaluate trust and re-issue permission.
