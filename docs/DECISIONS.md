# Decisions

Decisions made by Brian or the team. Recorded here so they are not re-argued later.

---

## How to Use This File

When a decision is made, add it below with:
- **Date**
- **Decision**
- **Rationale**
- **Decided by**

---

## Architecture Decisions

### 2026-04-03 — Single private repo for now
**Decision:** Use `rio-system` as the private product repo for governance, control plane, and enterprise features. Do not split into separate repos yet.
**Rationale:** Splitting too early creates coordination overhead without benefit. Can always split later if the governance engine grows large enough.
**Decided by:** Brian

### 2026-04-03 — Public/private boundary
**Decision:** Receipt protocol, ledger, verification, SDKs, examples, and integration guides are public. Governance/control plane (policy engine, authorization/HITL enforcement, risk engine, ONE interface, enterprise deployment, orchestration logic) is private and licensed.
**Rationale:** Public repo = proof standard and adoption. Private repo = governance/control plane and enterprise product.
**Decided by:** Brian

### 2026-04-03 — Public docs scope
**Decision:** Public docs may describe the architecture at a high level so people understand where receipts fit. Detailed operational blueprints that would make it easy to replicate the full platform stay private.
**Rationale:** Developers need context to adopt the protocol, but detailed system operation and deployment architecture is the product.
**Decided by:** Brian

---

## Naming Decisions

_None recorded yet._

---

## Licensing Decisions

### 2026-04-03 — Receipt protocol licensing
**Decision:** Receipt protocol is dual-licensed under MIT OR Apache-2.0.
**Rationale:** Maximum adoption. Developers and enterprises can choose whichever license suits their needs.
**Decided by:** Brian

---

## Product Decisions

### 2026-04-03 — First deployment use case: Governed AI Email
**Decision:** The first real-world deployment use case is Governed AI Email — AI drafts and sends email with human approval, cryptographic receipt, and ledger entry.
**Rationale:** Already built (Gmail connector live), universally understood, demonstrates the full RIO loop end-to-end (intent → risk → approval → execution → receipt → ledger), maps to compliance requirements (SEC, HIPAA, legal), and can be piloted quickly with a real organization.
**Decided by:** Brian

### 2026-04-03 — Phase transition: Build → Deployment & Packaging
**Decision:** The project is moving from the Build Phase to the Deployment and Packaging Phase. The team is no longer primarily building new core features. Focus is now on defining the first deployment, packaging the system for external installation, and making ONE the product interface.
**Rationale:** Nothing is blocked on engineering. The core system works: receipt protocol, signing, verification, ledger, governance/HITL, gateway/execution, ONE control center, agent skills, knowledge base, and repo structure are all built. The bottleneck is now use case definition, packaging, and deployment model.
**Decided by:** Brian

---

## System Invariants (Non-Negotiable)

### 2026-04-03 — RIO System Invariants established
**Decision:** The following 7 invariants are non-negotiable system rules. They apply to every deployment, feature, use case, and future connector. No agent, engineer, or product decision may violate them.

1. **Human Authority:** A human is always the final approval authority for governed actions.
2. **No Execution Without Approval:** High-risk or governed actions cannot execute without explicit approval.
3. **Receipt Required:** Every governed action must produce a cryptographic receipt.
4. **Ledger Required:** Every receipt must be written to an append-only, hash-chained ledger.
5. **Fail Closed:** If approval, signing, receipt generation, or ledger write fails, the action must not execute.
6. **Independent Verification:** Receipts and the ledger must be independently verifiable by a third party.
7. **Separation of Roles:** The system must enforce separation between Intelligence (AI proposes), Authority (Human approves), Execution (Gateway executes), and Witness (Receipt + Ledger verify).

**Rationale:** These invariants are the architectural and product definition of RIO. They are the foundation of the trust story, the compliance story, and the licensing boundary. Everything the team builds must enforce them. If a feature cannot satisfy all 7 invariants, it does not ship.
**Decided by:** Brian

### 2026-04-04 — Decision 1: Enforcement Boundary
**Decision:** The Gateway is the enforcement boundary. All identity, role enforcement, policy evaluation, approval validation, execution authorization, audit, and ledger recording must occur in the Gateway. All clients (ONE PWA, CLI, SDKs, Slack, Email, API clients) are untrusted and must go through the Gateway.
**Rationale:** If enforcement logic is built into an interface like the ONE PWA, any other client can bypass it by talking directly to the Gateway. Moving all enforcement to the Gateway makes the system non-bypassable, which is the entire point of governance.
**Decided by:** Brian

### 2026-04-04 — Decision 2: Interface Is Not Authority
**Decision:** Interfaces may display data, collect approvals, and submit intents, but they are not the source of truth and cannot enforce policy or roles.
**Rationale:** Interfaces are presentation layers. They can be compromised, bypassed, or replaced. The system's security model must not rely on the interface behaving correctly.
**Decided by:** Brian

### 2026-04-04 — Decision 3: Ledger Is System of Record
**Decision:** The append-only ledger and receipts are the system of record for what actions occurred, who approved them, and under which policy version.
**Rationale:** Databases can be altered. A hash-chained ledger and cryptographically signed receipts provide independent, tamper-evident proof of the system's history.
**Decided by:** Brian

### 2026-04-04 — Platformization Phase: Enforcement Implementation
**Decision:** The architecture is stable. The project transitions from architecture discovery to enforcement implementation. Five concrete enforcement areas are defined: (1) Identity and Roles, (2) Policy Schema, (3) Storage Architecture, (4) Active Audit, (5) Meta-Governance Enforcement. No work in these areas is complete without a canonical spec, an implementation plan, and a verified code path. The standard: no hidden assumptions, no role drift, no undocumented boundaries.
**Rationale:** The design is not the problem. The gaps are enforcement gaps, not concept gaps. The rules must be non-bypassable in code and infrastructure, not just described in documents.
**Decided by:** Brian

### 2026-04-04 — Meta-Governance enforcement mechanisms adopted (Quorum, Change Control, Do Not Learn, Kill Switch)
**Decision:** Meta-Governance is now enforceable, not just described. Four mechanisms are added: (1) Quorum Model — multi-party approval required for all rule changes, with invariant changes requiring unanimous 3-of-3 approval. (2) Change Control Protocol — every rule change must produce a Governance Change Receipt with requestor, reason, evidence, risk assessment, quorum signatures, effective date, rollback plan, and policy version. If no receipt exists, the rule cannot change. (3) Do Not Learn Rule — audit outcomes must be classified before learning occurs (human mistakes must not train the model). (4) Freeze/Kill Switch — Meta-Governance can freeze cognition, freeze execution, force human approval, disable connectors, rollback policy, or enter safe mode.
**Rationale:** A governance layer that is only described but not enforceable is a policy document, not a control system. These four mechanisms make Meta-Governance a runtime-enforceable layer.
**Source:** Bondi (Scribe / ChatGPT)
**Decided by:** Brian

### 2026-04-04 — Meta-Governance (Layer 5) adopted
**Decision:** The RIO architecture is extended with a fifth layer: Meta-Governance. The system must not be allowed to change its own rules automatically. Learning, policy changes, risk threshold adjustments, authority assignments, and invariant modifications all require Meta-Governance approval. Learning flows from Mantis to Meta-Governance first, never directly back to the AI. The Platform Spec v1.0 is updated from 15 to 16 sections to include Meta-Governance.
**Rationale:** A system that governs actions but not its own learning and policy changes is structurally unstable. This is a known problem in safety engineering. The Meta-Governance layer prevents drift and ensures the system remains stable and governable.
**Source:** Bondi (Scribe / ChatGPT)
**Decided by:** Brian

### 2026-04-04 — Organizational Structure formalized (Mirrored Governance)
**Decision:** The team structure must mirror the system architecture. Each system layer has a matching team role with explicit accountability. The Chief of Staff is the operational authority responsible for overall delivery. No work is complete without Builder Completion Report → Auditor PASS/FAIL → CoS scope confirmation → docs updated → deployment verified → human approval → receipt logged.
**Rationale:** Most failures happen because people only build the product and ignore the organization and process. Mirrored governance ensures accountability exists at every layer.
**Source:** Bondi (Scribe / ChatGPT)
**Decided by:** Brian

### 2026-04-04 — Transition from project to platform (Platform Spec v1.0)
**Decision:** RIO/ONE is now a platform, not a project. A 15-section Platform Specification v1.0 will be produced as the canonical document that all agents, developers, and future customers build against. The spec consolidates existing architecture docs, adds missing sections (governed_action() API, security model, ledger architecture), and defines the ecosystem mapping. No external pilot begins until the spec is complete, audited, and approved.
**Rationale:** We are building three things simultaneously: the product, the platform, and the process. The platform spec is the contract that makes all three coherent.
**Decided by:** Brian

### 2026-04-04 — Build Process Directive issued
**Decision:** All work now follows the formal Build → Self-Check → Audit → Approve → Complete workflow. When gaps are found, we fix the system that allowed the gap — not blame the person or agent. Mistakes are progress. The process is documented in `docs/directives/2026-04-04_BUILD_PROCESS_DIRECTIVE.md`.
**Rationale:** The audit of Manny's enterprise features delivery revealed a gap between documented and implemented. This is the system working, not failing. The directive ensures we scale without chaos.
**Decided by:** Brian

### 2026-04-03 — RIO Agent Work Protocol adopted
**Decision:** All agent work within the RIO ecosystem must follow the Agent Work Loop (PLAN → BUILD → SELF-CHECK → AUDIT → FIX → APPROVE → COMPLETE → RECORD). No single agent may Architect + Build + Approve alone. Builders must produce a formal Completion Report before requesting audit. Auditors must verify against a standardized checklist. A task is only DONE when requirements are implemented, code is committed, docs are updated, the Auditor passes, the Human approves, and a receipt is generated.
**Rationale:** LLMs optimize for producing answers, not verifying correctness. This protocol forces a verification loop that creates reliable multi-agent work instead of unchecked output. It extends RIO governance from runtime execution to the development process itself.
**Decided by:** Brian

### 2026-04-03 — RIO-Compliant definition established
**Decision:** A system is considered RIO-compliant if and only if it: (1) implements the 9-stage pipeline with distinct governance and proof layers, (2) enforces the strict separation of the 4 roles (Intelligence, Authority, Execution, Witness), and (3) satisfies all 7 System Invariants without exception. Any system that collapses roles or bypasses receipt/ledger requirements is not RIO-compliant.
**Rationale:** This definition creates a verifiable standard for any system claiming RIO compliance. It is the formal test for architecture reviews, licensing, and partner integrations.
**Decided by:** Brian

---

## Technical Standards Decisions

### 2026-04-03 — Receipt format versions
**Decision:** Proof-layer receipts use 3-hash chain (intent, execution, receipt). Governed receipts use 5-hash chain (intent, governance, authorization, execution, receipt).
**Rationale:** Proof-layer receipts are useful without governance. Governed receipts extend the format for systems that need policy enforcement.
**Decided by:** Brian / Romney
