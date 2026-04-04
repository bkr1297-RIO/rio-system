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
