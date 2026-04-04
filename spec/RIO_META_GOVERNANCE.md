# RIO Meta-Governance (Layer 5)

> **Status:** Canonical Spec
> **Last Updated:** 2026-04-04
> **Source:** Bondi (Scribe) / Brian Kent Rasmussen

---

## 1. The Necessity of Meta-Governance

A governed execution system must not only govern its actions; it must govern its own learning and policy changes. If a system can automatically change its own rules, risk thresholds, or policies based on feedback, it is structurally unstable and prone to drift.

**The core invariant of Meta-Governance:**
> The system must not be allowed to change its own rules automatically.

Learning must not go straight back to the AI. It must go to the Meta-Governance layer first.

## 2. The 5 Non-Negotiable Layers

The RIO/ONE architecture consists of five distinct layers, each with a specific role and strict limitations.

| Layer | Name | Role | Cannot Do |
|---|---|---|---|
| 1 | **Cognition** | AI proposes | Cannot execute |
| 2 | **Governance** | Approve / deny | Cannot execute directly |
| 3 | **Execution** | Perform action | Cannot approve |
| 4 | **Witness** | Record & verify | Cannot execute or approve |
| 5 | **Meta-Governance** | Change policy & learning | Cannot execute actions |

*(Note: "Authority" is the human component within the Governance layer).*

## 3. The Control Loop

The full system loop operates as follows:

1. **Cognition (AI)** proposes an action.
2. **Governance (RIO)** evaluates against policy.
3. **Execution (Gateway)** performs the action if approved.
4. **Witness (Receipt + Ledger)** records the proof.
5. **Observability (Mantis)** analyzes the outcome.
6. **Meta-Governance (Human/Board)** reviews the analysis and decides on rule changes.
7. **Governance (RIO)** is updated with new rules.

## 4. Meta-Governance Controls

The Meta-Governance layer is responsible for deciding:

- Policy changes
- Risk threshold changes
- Model retraining approval
- Connector permissions
- Human role permissions
- Emergency stop
- Rollback
- Audit review
- Incident review
- Versioning
- System constitution

## 5. What Can and Cannot Auto-Change

| Component | Can Auto-Change? |
|---|---|
| UI text | Yes |
| Routing | Yes |
| Suggestions | Yes |
| **Risk thresholds** | **No** |
| **Policies** | **No** |
| **Approval rules** | **No** |
| **Who has authority** | **No** |
| **Ledger rules** | **No** |
| **Invariants** | **No** |

## 6. Meta-Governance Authority Model (Quorum)

To prevent privilege escalation, silent lowering of safety, or system drift, Meta-Governance actions require multi-party approval. One person cannot change the rules alone.

| Action | Required Approval |
|---|---|
| Policy change | 2 of 3 |
| Risk threshold change | 2 of 3 |
| Add/remove human authority | 3 of 3 |
| Model retraining | 2 of 3 |
| Connector permission change | 2 of 3 |
| Emergency stop | 1 of 3 |
| System rollback | 2 of 3 |
| Change invariants | 3 of 3 |

## 7. Change Control Protocol

Any Meta-Governance change must produce a **Governance Change Receipt**. If this receipt does not exist, the rule cannot change. This prevents silent rule changes.

A Governance Change Receipt must include:
- **Change ID:** Unique identifier
- **Requestor:** Who proposed the change
- **Reason:** Why the change is needed
- **Evidence:** Receipts or incident logs justifying the change
- **Risk Assessment:** Impact analysis
- **Approvers:** Cryptographic signatures of the quorum
- **Effective Date:** When the change becomes active
- **Rollback Plan:** How to undo the change
- **Policy Version:** The new version number

## 8. The "Do Not Learn" Rule

Audit outcomes must be classified *before* learning occurs. Otherwise, the system may learn the wrong lesson (e.g., training a model to replicate a human mistake).

| Audit Result | Learning Action |
|---|---|
| Human mistake | Do not train model |
| Policy unclear | Update policy |
| Model reasoning wrong | Retrain model |
| Execution bug | Fix code |
| Edge case | Add rule |
| Malicious attempt | Update security |
| Unknown | Escalate to Meta-Governance |

## 9. The Freeze / Kill Switch Rule

Meta-Governance must have the ability to halt or restrict the system at various layers during an emergency.

| Action | Effect |
|---|---|
| **Freeze Cognition** | AI cannot propose actions |
| **Freeze Execution** | Nothing executes |
| **Force Human Approval** | All actions require human approval (bypasses auto-approve policies) |
| **Disable Connector** | Specific API or integration is disabled |
| **Rollback Policy** | Revert to previous policy version |
| **Safe Mode** | Read-only system state |

## 10. The One-Sentence Architecture

> RIO/ONE is a governed execution platform with separated cognition, approval, execution, audit, and meta-governance layers, ensuring that AI can propose and act only within human-authorized policy, with cryptographic proof and controlled learning.
