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

## 6. The One-Sentence Architecture

> RIO/ONE is a governed execution platform with separated cognition, approval, execution, audit, and meta-governance layers, ensuring that AI can propose and act only within human-authorized policy, with cryptographic proof and controlled learning.
