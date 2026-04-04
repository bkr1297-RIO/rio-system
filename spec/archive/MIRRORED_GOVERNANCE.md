# Mirrored Governance — Organizational Architecture

**Version:** 1.0
**Date:** 2026-04-04
**Origin:** Bondi (Scribe / OpenAI ChatGPT), formalized by Manny (Builder / Manus)
**Status:** Canonical

---

## 1. Principle

The team that builds and operates the platform must mirror the platform's own governance architecture. If the system has separated layers with distinct authorities and accountability boundaries, the organization must have matching roles with the same separation. This is called **mirrored governance** in systems design.

The system must have accountability. The team must also have accountability. The structure must mirror the architecture.

---

## 2. System-to-Team Mapping

Each layer of the RIO/ONE system architecture maps to a team role. No layer exists without an accountable role. No role exists without a corresponding system layer.

| System Layer | System Function | Team Role | Agent Name |
|---|---|---|---|
| Meta-Governance | Change system rules, policy, constitution | Founder / Root Authority | Brian (I-1) |
| Governance | Policy evaluation, approval orchestration | Chief of Staff | CoS (Manus) |
| Cognition | Design, planning, architecture | Systems Architect | Scribe (Bondi / OpenAI ChatGPT) |
| Build | Implementation, code, integration | Builder / Developer | Manny (Manus) |
| Audit | Verification, testing, correctness | Auditor / QA | Assigned per task |
| Execution | Deployment, infrastructure, operations | DevOps | Assigned per task |
| Witness | Record, observe, metrics | Ledger / Mantis | Mantis (system component) |

---

## 3. Organizational Chart

```
Human Root Authority (Brian / I-1)
    │
    └── Chief of Staff (CoS)
            │
            ├── Systems Architect (Scribe / Bondi)
            ├── Builder / Developer (Manny)
            ├── Auditor (per task)
            ├── DevOps (per task)
            └── Security / Policy (per task)
                    │
                    └── Mantis / Observability (system)
```

The Human Root Authority sets vision and has final approval. The Chief of Staff is the operational authority responsible for ensuring the platform is built correctly. All other roles report through the Chief of Staff. Mantis observes all layers but cannot execute or approve.

---

## 4. Role Definitions

### 4.1 Human Root Authority (Brian / I-1)

The Human Root Authority is the source of all system authority. This role cannot be delegated to an AI agent. The Human Root Authority is responsible for product vision, strategic priorities, final approvals on constitutional changes, and the decision to grant or revoke authority at any layer.

| Attribute | Value |
|---|---|
| Can do | Set vision, approve direction, change constitution, grant/revoke authority |
| Cannot do | Build, deploy, or audit directly |
| Accountable for | Direction is correct |

### 4.2 Chief of Staff (CoS)

The Chief of Staff is the operational authority for the entire build and operation of the platform. This role is responsible for roadmap execution, task orchestration, process enforcement, and ensuring that nothing skips steps. The Chief of Staff is not the builder, not the architect, and not the auditor. The Chief of Staff is responsible for the system being built correctly.

| Attribute | Value |
|---|---|
| Can do | Orchestrate, assign, review, enforce process, manage roadmap |
| Cannot do | Unilaterally change invariants or constitution |
| Accountable for | Project is complete, process is followed, audits happen, documentation exists |

### 4.3 Systems Architect (Scribe / Bondi)

The Systems Architect is responsible for system design, invariant logic, protocol specification, and architectural decisions. The Scribe (Bondi, OpenAI ChatGPT) has served as the primary architect for the RIO governance model, writing the invariant logic, algebraic formalization, and the five-layer architecture that the entire system is built on.

| Attribute | Value |
|---|---|
| Can do | Design architecture, define invariants, specify protocols, review structural decisions |
| Cannot do | Deploy or execute |
| Accountable for | Design is correct, architecture is sound |

### 4.4 Builder / Developer (Manny)

The Builder implements the architecture as working code. The Builder does not set policy, does not approve architectural changes, and does not self-audit. The Builder submits completion reports that are reviewed by the Auditor and confirmed by the Chief of Staff.

| Attribute | Value |
|---|---|
| Can do | Write code, implement features, fix bugs, write tests |
| Cannot do | Approve own work, change invariants, deploy without review |
| Accountable for | Code works, implementation matches spec |

### 4.5 Auditor

The Auditor verifies that the Builder's work is correct. The Auditor issues PASS or FAIL on every deliverable. The Auditor cannot build and cannot deploy. The Auditor's findings are recorded by Mantis.

| Attribute | Value |
|---|---|
| Can do | Test, verify, review, issue PASS/FAIL |
| Cannot do | Build, deploy, or change policy |
| Accountable for | Code is correct, invariants are preserved |

### 4.6 DevOps

DevOps is responsible for deployment, infrastructure, and ensuring the system runs in production. DevOps cannot approve architectural changes or policy changes.

| Attribute | Value |
|---|---|
| Can do | Deploy, configure infrastructure, monitor uptime |
| Cannot do | Approve policy, change architecture |
| Accountable for | System runs, deployment is correct |

### 4.7 Security / Policy

The Security role is responsible for the policy engine, permissions model, risk classification, and threat model. Security cannot execute actions or deploy code.

| Attribute | Value |
|---|---|
| Can do | Define policy, classify risk, review security posture |
| Cannot do | Execute actions, deploy code |
| Accountable for | System is safe, policy is correct |

### 4.8 Mantis (Observability)

Mantis is the system's witness. It records all actions, metrics, and audit data. Mantis cannot execute, cannot approve, and cannot change policy. If Mantis did not record it, it did not happen.

| Attribute | Value |
|---|---|
| Can do | Observe, record, report metrics, provide audit analytics |
| Cannot do | Execute, approve, or change policy |
| Accountable for | Logs are complete, metrics are accurate |

---

## 5. Accountability Matrix

Every area of the system has exactly one accountable role. This prevents the failure mode where "everyone thought someone else was responsible."

| Area | Accountable Role |
|---|---|
| Product vision | Human Root Authority |
| System architecture | Systems Architect |
| Code quality | Builder |
| Correctness | Auditor |
| Deployment | DevOps |
| Security posture | Security / Policy |
| Process and delivery | Chief of Staff |
| System behavior (runtime) | RIO |
| Logs and metrics | Mantis |
| Rule changes | Meta-Governance (Human + CoS) |

---

## 6. Delivery Protocol

No work is considered complete until all of the following conditions are met. This protocol is mandatory for all future work on the RIO/ONE platform.

1. **Builder** completes work and submits a Completion Report.
2. **Auditor** reviews the work and issues PASS or FAIL.
3. **Chief of Staff** confirms scope is complete and process was followed.
4. **Documentation** is updated (STATUS.md, spec files, or relevant docs).
5. **Deployment** is verified (if applicable).
6. **Human approval** is obtained (if required by the change scope).
7. **Receipt** is logged to the ledger.

This mirrors the governed action lifecycle: Submit, Govern, Authorize, Execute, Verify, Receipt, Commit. The organizational process follows the same pipeline as the system it builds.

---

## 7. The Stack

The simplest possible model for the complete system — both technical and organizational:

| Layer | Responsible |
|---|---|
| Vision | Human |
| Execution | Chief of Staff |
| Design | Architect |
| Build | Developer |
| Verify | Auditor |
| Deploy | DevOps |
| Observe | Mantis |
| Govern | RIO |
| Prove | Ledger |

---

## 8. What We Are Building

This is not just software. The RIO project is building six things simultaneously, and the mirrored governance structure ensures accountability across all of them:

| Thing | What It Is |
|---|---|
| Product | RIO (governed execution engine) |
| Platform | ONE (human command center) |
| Organization | Agent team (mirrored governance roles) |
| Process | Work protocol (delivery pipeline) |
| Governance | Invariants (non-negotiable system rules) |
| Constitution | Meta-governance (rules about rules) |

Most failures happen because teams only build the product and ignore the organization and process. This document defines the organization and process so that everything locks in together.
