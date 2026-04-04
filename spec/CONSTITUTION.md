# RIO System Constitution

**Version:** 1.0
**Date:** 2026-04-04
**Authority Level:** Highest — nothing may violate this document
**Origin:** Brian Kent Rasmussen (Human Root Authority), Bondi (Scribe / OpenAI ChatGPT), formalized by Manny (Builder / Manus)
**Status:** Canonical

---

## Preamble

This is the constitution of the RIO governed execution system. It defines the non-negotiable rules, structural invariants, authority model, and separation of powers that the entire system is built on. Every specification, architecture document, implementation, and operational process must conform to this document. If any part of the system violates any rule in this document, the system is in violation and must fail closed.

This document changes slowly and deliberately. Constitutional amendments require unanimous Meta-Governance quorum (3 of 3) and produce a Governance Change Receipt recorded in the ledger.

---

## 1. The Core Model

The RIO system is a governed execution system with separated layers. The core model is:

> AI proposes. RIO governs. Human approves. System executes. Receipts record. Ledger proves. Verification audits.

No component may perform a function outside its layer. No layer may be collapsed into another. This separation is structural, not optional.

---

## 2. The Five Layers

The RIO/ONE architecture consists of five distinct layers. Each layer has a defined role and a defined prohibition. What a layer **cannot** do is as important as what it can.

| Layer | Name | Role | Cannot Do |
|---|---|---|---|
| 1 | Cognition | AI proposes actions | Cannot execute |
| 2 | Governance | Approve or deny | Cannot execute directly |
| 3 | Execution | Perform the action | Cannot approve |
| 4 | Witness | Record and verify | Cannot execute or approve |
| 5 | Meta-Governance | Change policy and learning | Cannot execute actions |

The five layers answer five questions:

| Layer | Question |
|---|---|
| Cognition | What could we do? |
| Governance | Are we allowed to do it? |
| Execution | Do it. |
| Witness | What happened? |
| Meta-Governance | Should the rules change? |

---

## 3. The Seven System Invariants

These invariants must always be true, regardless of deployment, feature, use case, or scale. They are non-negotiable.

### Invariant 1 — Human Authority

A human is always the final approval authority for governed actions. The system cannot override or bypass human intent. No AI agent, automated process, or system component may substitute for human approval on actions that require it.

### Invariant 2 — No Execution Without Approval

High-risk or governed actions cannot execute without explicit approval. The system must enforce this at the execution boundary, not just in policy. If the approval does not exist, the action does not execute.

### Invariant 3 — Receipt Required

Every governed action must produce a cryptographic receipt. If an action occurs, a receipt must exist. No receipt means the action did not happen as far as the system is concerned.

### Invariant 4 — Ledger Required

Every receipt must be written to an append-only, hash-chained ledger. The ledger provides the immutable history of the system. If the ledger write fails, the action must not be considered complete.

### Invariant 5 — Fail Closed

If approval, signing, receipt generation, or ledger write fails, the action must not execute. The system defaults to safety and inaction when any part of the governance loop fails. Fail-closed is the only acceptable failure mode.

### Invariant 6 — Independent Verification

Receipts and the ledger must be independently verifiable by a third party. Trust is established through cryptography, not through system claims. Any party with the receipt can verify its integrity without access to the system that produced it.

### Invariant 7 — Separation of Roles

The system must maintain strict separation between Intelligence (AI proposes), Authority (human approves), Execution (Gateway executes), and Witness (Receipt + Ledger verify). These roles cannot be collapsed or combined. Intelligence cannot execute. Execution cannot approve. The Witness cannot modify what it records.

---

## 4. The Accountability Invariant

Every layer must have a named accountable owner. No work may be completed without an accountable role signing off. These rules prevent role collapse, which is how systems fail.

| Rule | Rationale |
|---|---|
| Every layer must have a named accountable owner | Prevents "nobody was responsible" failure |
| No work may be completed without an accountable role signing off | Prevents unreviewed changes |
| Builder cannot approve their own work | Prevents self-certification |
| Auditor cannot deploy | Prevents verification-execution collapse |
| DevOps cannot change policy | Prevents infrastructure-governance collapse |
| Meta-Governance cannot execute actions | Prevents rule-maker from being rule-enforcer |
| Human does not approve incomplete work | Prevents rubber-stamping |
| Chief of Staff ensures the process is followed | Process authority, not creative authority |

The accountability map:

| Type | Who |
|---|---|
| Vision accountability | Human |
| System accountability | Chief of Staff |
| Technical accountability | Architect |
| Build accountability | Builder |
| Verification accountability | Auditor |
| Runtime accountability | DevOps |
| Policy accountability | Meta-Governance |
| Evidence accountability | Ledger |

No single person controls everything, but someone owns each layer.

---

## 5. The Authority Model

### 5.1 Three Powers

The system enforces three separated powers. No single component may hold more than one power.

| Power | Holder | Function |
|---|---|---|
| Observation | Mantis / Intake | See everything, decide nothing |
| Governance | RIO / Human | Evaluate risk, approve or deny |
| Execution | Gateway | Perform approved actions only |

### 5.2 Meta-Governance Quorum

Meta-Governance actions require multi-party approval. No single person can change the rules.

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

The emergency stop is set at 1-of-3 because the ability to halt the system must never be blocked by quorum unavailability. Constitutional changes (invariants, authority changes) require unanimous agreement.

---

## 6. The Core Meta-Governance Rule

> **The system must not be allowed to change its own rules automatically.**

Anything that changes how the system decides, approves, executes, or records requires Meta-Governance approval. Anything that changes how the system looks or suggests does not.

| Can Auto-Change | Requires Meta-Governance |
|---|---|
| UI text, labels, formatting | Risk thresholds |
| Routing and suggestions | Policies |
| AI prompt tuning (cosmetic) | Approval rules |
| | Who has authority |
| | Ledger rules |
| | System invariants |
| | Connector permissions |
| | Model retraining decisions |

Learning does not flow directly from the Witness layer back to Cognition. It flows through Meta-Governance, which decides whether and how the system should change. This prevents runaway self-modification.

---

## 7. The Security Audit Question

The canonical question for pressure-testing this architecture:

> **Where in this architecture can an action happen without approval, and where can a rule change without Meta-Governance?**

If the answer is "nowhere," the architecture is sound. If there is any path, that is the vulnerability. This question is the standing security audit question for all future reviews.

---

## 8. Document Authority Hierarchy

Each document in the spec directory has a defined authority level. Higher-authority documents override lower-authority documents in case of conflict.

| Document | Purpose | Authority |
|---|---|---|
| CONSTITUTION.md | Rules — the non-negotiable foundation | Highest |
| ARCHITECTURE.md | System design — how the layers are built | High |
| META_GOVERNANCE.md | Policy change — how rules change | High |
| WORK_PROTOCOL.md | Process — how work gets done | Medium |
| RECEIPT_SPEC.md | Technical — receipt format and verification | Medium |
| LEDGER_SPEC.md | Technical — ledger format and integrity | Medium |

There is one source of truth per domain. No two documents may define the same thing. If they conflict, the higher-authority document wins.

---

## 9. Amendment Process

This constitution may only be amended through the following process:

1. A change is proposed by any Meta-Governance authority with written rationale.
2. A risk assessment is conducted documenting what changes, what could break, and who is affected.
3. All Meta-Governance authorities review the proposal (3 of 3 required for constitutional changes).
4. If approved, a Governance Change Receipt is produced with all required fields.
5. The receipt is recorded in the ledger as a `CONSTITUTIONAL_AMENDMENT` entry.
6. The constitution is updated with the new version number and effective date.
7. All downstream documents are reviewed for conformance.

No shortcut exists. If this process was not followed, the amendment is invalid.

---

## 10. One-Sentence Architecture

> RIO/ONE is a governed execution platform with separated cognition, approval, execution, audit, and meta-governance layers, ensuring that AI can propose and act only within human-authorized policy, with cryptographic proof and controlled learning.

---

## 11. One-Sentence Organizational Model

> Humans set direction. Meta-Governance sets rules. Chief of Staff runs process. Architects design. Builders build. Auditors verify. Systems execute. Ledger proves.

That is a complete governed system — both technically and organizationally.
