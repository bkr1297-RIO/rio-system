<p align="center">
  <strong>RIO — Runtime Intelligence Orchestration</strong><br>
  RIO is a control plane that turns AI actions into approved, auditable transactions.<br>
  AI can propose. It cannot act without human approval. The system enforces this at runtime.
</p>

<p align="center">
  <a href="https://github.com/bkr1297-RIO/rio-receipt-protocol">Receipt Protocol</a> &middot;
  <a href="https://rio-gateway.onrender.com/health">Gateway Status</a> &middot;
  <a href="https://riodemo-ux2sxdqo.manus.space">Live Demo</a> &middot;
  <a href="https://riodemo-bt7mgkkb.manus.space">Ask Bondi</a> &middot;
  <a href="docs/ARCHITECTURE_v2.7.md">Architecture</a> &middot;
  <a href="docs/whitepapers/RIO_White_Paper_v2.md">White Paper</a>
</p>

<p align="center">
  <a href="https://riodemo-bt7mgkkb.manus.space"><img src="https://img.shields.io/badge/Ask%20Bondi-Implementation%20Assistant-blue" alt="Ask Bondi" /></a>
</p>

---

> **Have implementation questions?** [Ask Bondi](https://riodemo-bt7mgkkb.manus.space) — an interactive assistant that can answer technical questions about RIO architecture, the receipt protocol, verification, and how to implement.

---

## What RIO Is

> **RIO converts AI actions into human-authorized, policy-controlled, cryptographically verifiable transactions.**

RIO is a governed execution protocol. Every action follows a fixed loop:

```
Intent → Govern → Approve → Execute → Receipt → Ledger
```

This is enforced, not suggested. The system enforces the rules — not the AI. There is no code path from intent to execution that bypasses governance.

---

## Three Views of the Same System

RIO is defined in three complementary ways. They are not different systems — they describe the same system completely.

### 1. Invariants (What Cannot Break)

| # | Rule |
|---|------|
| 1 | Human is final authority |
| 2 | No execution without approval (when required) |
| 3 | Every action produces a receipt |
| 4 | Every receipt is written to a ledger |
| 5 | System fails closed |
| 6 | Independent verification is always possible |
| 7 | Roles are strictly separated |

### 2. Lifecycle (How It Runs)

```
Observe → Analyze → Plan → Govern → Approve → Execute → Record → Prove → Learn
```

Governance happens before execution. Proof happens after execution. Learning is controlled and auditable.

### 3. Layers (What Exists)

| Layer | Function |
|-------|----------|
| Authority | Human |
| Governance | Policy Engine |
| Execution | Gateway |
| Witness | Receipt + Ledger |
| Learning | Feedback Loop |
| Stress Testing | Failure Analysis |
| Stabilization | Convergence / Invariants |
| System Grammar | Architecture + Rules |

---

## What This Means

This system does not trust AI. It controls what AI is allowed to do, requires explicit approval when needed, and produces verifiable proof of every action. If it cannot be approved, logged, and verified — it does not execute.

For a complete orientation, see [How to Understand RIO](docs/HOW_TO_UNDERSTAND_RIO.md) and [System Overview](docs/SYSTEM_OVERVIEW.md).

---

## Ask Bondi (Implementation Assistant)

Have questions about how to implement RIO?

> Ask Bondi → [https://riodemo-ux2sxdqo.manus.space/ask](https://riodemo-ux2sxdqo.manus.space/ask)

Ask anything about receipt protocol, gateway integration, governed action flow, or end-to-end implementation. Bondi provides step-by-step, developer-ready answers.

---

## The Problem

Organizations deploying AI agents face a fundamental gap: the AI can reason and propose, but there is no structural guarantee that it cannot act without authorization. Prompt-level guardrails are bypassable. Policy documents are advisory. Audit logs can be incomplete or fabricated after the fact.

Without a governance layer that is architecturally separate from the AI itself, every deployed agent is a liability — capable of taking actions that no human approved, with no cryptographic proof of what happened. As AI systems gain access to email, payments, databases, and APIs, the cost of ungoverned execution scales with capability.

RIO closes this gap by making governance structural, not advisory. The execution gate is locked by default. Every action requires a signed approval, a single-use token, and produces a verifiable receipt. The ledger is append-only and hash-chained. There is no code path from intent to execution that bypasses governance.

---

## What You Can Build with RIO

RIO is designed for any environment where AI agents take real-world actions that carry risk, require accountability, or must comply with policy.

| Use Case | Description |
|----------|-------------|
| **Governed AI Assistants** | Personal or enterprise AI agents that propose actions (send email, schedule meeting, make payment) but cannot execute without human approval |
| **Enterprise Compliance** | AI systems in regulated industries (finance, healthcare, legal) that need provable audit trails for every automated decision |
| **Multi-Agent Orchestration** | Coordination layers where multiple AI agents propose actions through a single governance pipeline with unified policy enforcement |
| **Autonomous Workflow Automation** | Automated business processes where low-risk actions execute automatically while high-risk actions pause for human review |
| **AI Safety Research** | A reference implementation of structural AI containment — fail-closed execution with cryptographic proof |

For enterprise deployment models, ROI analysis, and case studies, see the [Enterprise Overview](docs/enterprise/ENTERPRISE.md).

---

## Architecture Overview

### Three-Power Separation

RIO enforces separation of powers at the architectural level. No single component can both decide and act.

**Observer (Mantis)** — Ingests goals, structures intent, assesses risk, and monitors outcomes. The Observer sees everything but controls nothing. It cannot approve or execute.

**Governor** — Evaluates intent against policy, applies risk thresholds, and issues or denies approval. The Governor decides but cannot execute. Approval produces a signed token; denial produces a signed record.

**Executor** — Receives approved intents with single-use execution tokens. The Executor acts but cannot approve. It verifies the token, executes the action, and produces a cryptographic receipt. If the token is missing, expired, or already used, execution is structurally blocked.

For the full specification, see [Three-Power Separation](spec/THREE_POWER_SEPARATION.md).

### The 7-Stage Pipeline

Every action flows through a deterministic pipeline:

```
Intake → Observation → Policy Evaluation → Approval → Execution → Verification → Ledger
```

1. **Intake** — Goal is received and structured into a typed intent with metadata
2. **Observation** — Mantis assesses risk level, classifies the action, and enriches context
3. **Policy Evaluation** — Governor evaluates the intent against the loaded policy set
4. **Approval** — Human approves or denies (or auto-approval for low-risk actions per policy)
5. **Execution** — Executor validates the single-use token and performs the action
6. **Verification** — Outcome is verified against the original intent
7. **Ledger** — Cryptographic receipt is generated and appended to the hash-chained ledger

For the complete architecture document, see [Architecture v2.7](docs/ARCHITECTURE_v2.7.md).

---

## Quick Start

### Try the Live Demo

The interactive demo site demonstrates the complete RIO governance flow:

**[riodemo-ux2sxdqo.manus.space](https://riodemo-ux2sxdqo.manus.space)**

The demo shows three perspectives: the AI agent proposing actions, the human approving or denying, and the system recording cryptographic proof.

### Verify the Live Gateway

The production gateway is deployed on Render with a PostgreSQL-backed ledger:

```bash
# Check gateway health
curl -s https://rio-gateway.onrender.com/health | python3 -m json.tool

# Fetch recent protocol-format receipts (persisted in PostgreSQL)
curl -s 'https://rio-gateway.onrender.com/api/receipts/recent?format=protocol' | python3 -m json.tool

# Verify receipts using the CLI
npx rio-verify remote https://rio-gateway.onrender.com
```

### Verification Results

Automated security testing confirms 11 of 12 tests passing, with all critical attack vectors blocked:

| Test | Description | Result |
|------|-------------|--------|
| V-001 | Unsigned request blocked | PASS |
| V-002 | Tampered payload rejected | PASS |
| V-003 | Replay attack blocked | PASS |
| V-004 | Expired timestamp rejected | PASS |
| V-005 | Approved intent executes | PASS |
| V-006 | Denied intent blocked | PASS |
| V-007 | Ledger hash chain integrity | PASS |
| V-008 | Receipt signature valid | PASS |
| V-009 | Forged signature rejected | PASS |
| V-010 | Direct access without approval blocked | PASS |
| EG-001 | Execution gate full flow | PASS |
| EG-002 | Receipt lookup verification | PARTIAL |

See [VERIFICATION_RESULTS.md](VERIFICATION_RESULTS.md) for detailed results and [THREAT_MODEL.md](THREAT_MODEL.md) for the complete threat analysis.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture v2.7](docs/ARCHITECTURE_v2.7.md) | System architecture, invariants, module map, deployment topology |
| [Three-Power Separation](spec/THREE_POWER_SEPARATION.md) | Observer / Governor / Executor specification with permission matrix |
| [API Catalog v2.7](docs/API_CATALOG_v2.7.md) | Complete 43-endpoint catalog with auth requirements and examples |
| [White Paper v2](docs/whitepapers/RIO_White_Paper_v2.md) | Technical white paper on governed execution |
| [White Paper (Formal)](docs/whitepapers/RIO_White_Paper_Formal.md) | Formal specification of the RIO protocol |
| [Enterprise Overview](docs/enterprise/ENTERPRISE.md) | Enterprise FAQ, deployment models, ROI, and case studies |
| [Receipt Specification v2.1](spec/Receipt_Specification_v2.1.json) | Receipt schema with ingestion provenance and identity binding |
| [Threat Model](THREAT_MODEL.md) | 12 threat vectors (T-001 to T-012) with mitigations |
| [Deployment Guide](docs/guides/DEPLOYMENT_GUIDE.md) | Production deployment on Render with PostgreSQL |
| [Gateway Architecture](gateway/ARCHITECTURE.md) | Gateway internals, route map, and middleware chain |
| [Mantis Component](spec/MANTIS_COMPONENT.md) | Observer/ingestion layer component definition |
| [Demo Walkthrough](DEMO_WALKTHROUGH.md) | Step-by-step demo with curl commands |

---

## Repository Structure

```
rio-system/
├── gateway/                 # Production governance gateway (Node.js, deployed on Render)
│   ├── config/              #   Policy and constitution configuration
│   ├── execution/           #   Execution gate and token validation
│   ├── governance/          #   Policy evaluation, approval logic, kill switch
│   ├── ledger/              #   PostgreSQL-backed append-only hash-chained ledger
│   ├── receipts/            #   Cryptographic receipt generation (Ed25519)
│   ├── routes/              #   API routes (intake, signers, sync, proxy)
│   ├── security/            #   Signature verification, replay prevention
│   └── tests/               #   Gateway integration tests
├── demo-site/               # Interactive demo site (3-perspective walkthrough)
├── corpus/                  # Governing corpus (policies, directives, agent definitions)
├── docs/                    # Documentation
│   ├── architecture/        #   Architecture diagrams and wiring docs
│   ├── whitepapers/         #   White papers (v1, v2, Formal, The Structural Read)
│   ├── guides/              #   Deployment, verification, and handoff guides
│   ├── enterprise/          #   Enterprise positioning and FAQ
│   ├── security/            #   Security policies, invariants, roles spec
│   └── reference/           #   System overview, master document, code audit
├── spec/                    # Formal specifications
│   ├── THREE_POWER_SEPARATION.md
│   ├── MANTIS_COMPONENT.md
│   ├── Receipt_Specification_v2.1.json
│   └── [component schemas]
├── internal/                # Working notes and development artifacts
├── archive/                 # Historical code iterations (preserved for reference)
├── CONTRIBUTING.md
├── THREAT_MODEL.md
├── VERIFICATION_RESULTS.md
└── DEMO_WALKTHROUGH.md
```

---

## Security Model

RIO implements a **fail-closed** enforcement model. The default state is deny. Execution is structurally blocked unless every condition is met.

**Ed25519 Cryptographic Signatures.** Every receipt is signed with Ed25519. Signatures are generated server-side and can be independently verified. The signing key never leaves the server.

**SHA-256 Hash-Chained Ledger.** Every ledger entry includes the hash of the previous entry. Any modification to a historical record breaks the chain and is immediately detectable. The ledger is append-only — there is no update or delete operation.

**Single-Use Execution Tokens.** Every approved action receives a unique token. The token is consumed on execution and cannot be reused. Replay attacks are blocked at the structural level.

**Fail-Closed Execution Gate.** The execution gate requires a valid approval, a valid token, and a valid signature. If any element is missing, expired, or invalid, the gate does not open. There is no fallback, no override, and no bypass.

**Server-Side Enforcement.** All governance logic runs server-side. The frontend cannot bypass policy evaluation, forge approvals, or skip the execution gate. The client is a view layer — the server is the authority.

11 of 12 security verification tests pass. See [VERIFICATION_RESULTS.md](VERIFICATION_RESULTS.md) and [THREAT_MODEL.md](THREAT_MODEL.md).

---

## Open Standard: RIO Receipt Protocol

The cryptographic receipt and ledger layer has been extracted into a standalone open standard:

**[rio-receipt-protocol](https://github.com/bkr1297-RIO/rio-receipt-protocol)** — Receipt schema, tamper-evident ledger, verifier CLI, and conformance test suite. Zero dependencies. Any AI system can implement RIO Receipts to produce verifiable audit trails without adopting the full RIO gateway.

```bash
git clone https://github.com/bkr1297-RIO/rio-receipt-protocol.git
cd rio-receipt-protocol
node examples/basic-usage.mjs    # Complete flow demo
node tests/conformance.test.mjs  # 45 conformance tests
node cli/verify.mjs remote https://rio-gateway.onrender.com  # Verify live gateway
```

This repository (rio-system) is the reference implementation and full governance platform built on top of that protocol.

---

## Memory Layer (M.A.N.T.I.S.)

**M.A.N.T.I.S.** — **M**emory, **A**udit, **N**otification, **T**racking, **I**ntegrity, **S**ynchronization.

The observation and recording layer of the RIO system. M.A.N.T.I.S. sees and records all actions and data within the system. If an event is not recorded by M.A.N.T.I.S., it is considered as if it did not happen.

The complete build history of RIO is available as a structured conversation corpus — 120 sessions spanning February to April 2026. This is the system's memory: queryable context and provenance, not training data and not authority.

- **Location:** `/data/conversations_export_2026-04-07.json`
- **Purpose:** Retrieval, grounding, and audit — any agent can query prior decisions and rationale
- **Boundary:** Memory informs. It does not decide, approve, or execute. Governance remains separate.
- **Integrity:** `rio_monitor.py` performs SHA-256 verification of all governance artifacts. Mechanical Guard active, fail-closed.

See [docs/MEMORY_LAYER.md](docs/MEMORY_LAYER.md) for the full definition.

> *Governance is the floor, not the ceiling.*

---

## System Extraction (Sanitized Signal)

This repository includes a system-only extraction derived from a large multi-session conversation corpus. The original source contained both system architecture and personal context. Only the architectural signal has been retained here.

### Purpose

To provide a clean, developer-readable representation of the RIO system without exposing any personal or identity data.

### What This File Contains

- Core system definition
- The three unified views:
  - 7 Invariants (rules)
  - 9-Stage Lifecycle (flow)
  - 8-Layer Model (structure)
- Governance model (Generator → Governor → Gate)
- Receipt and ledger architecture
- Learning loop and feedback model
- Key system patterns

### What Has Been Removed

- Personal context
- Identity-linked data
- Conversation-specific narrative
- Any non-system information

### Key Principle

The raw corpus is not the product.

The system extracted from it is.

This file represents the minimal, portable, implementation-ready signal of RIO.

---

## State-Aware Governance (vNext)

RIO now supports structured state input for governance decisions.

State is:
- Explicit
- Non-authoritative
- User-mediated

All decisions remain:
- Deterministic
- Auditable
- Human-approved

See:
- /docs/spec/state-aware-governance.md
- /spec/policy_input_schema.json

---

## System Scope — Current vs Planned

### Currently Implemented
- RIO governance engine
- Proposal → approval → execution → receipt → ledger
- Cryptographic proof system

### Defined but Not Implemented
- Atlas (SAS) observation layer
- State-aware governance inputs

### Design Principle

Atlas is intentionally decoupled.

- Atlas observes (zero authority)
- RIO governs (execution control)
- Human bridges between them

This separation is deliberate and enforced.

---

## Status and Roadmap

### What's Built

- Governance pipeline: 7-stage intake-to-ledger flow, production-deployed
- Gateway: Node.js reference implementation on Render with PostgreSQL
- Cryptography: Ed25519 signatures, SHA-256 hash chains, single-use tokens
- Three-Power Separation: Observer, Governor, Executor with enforced boundaries
- Demo site: Interactive 3-perspective walkthrough at [riodemo-ux2sxdqo.manus.space](https://riodemo-ux2sxdqo.manus.space)
- Formal specifications: Receipt protocol v2.1, component schemas, policy definitions
- Open standard: [RIO Receipt Protocol](https://github.com/bkr1297-RIO/rio-receipt-protocol) extracted as standalone repo
- Security: 100+ verification tests, threat model with 12 vectors, 11/12 passing
- Governing corpus: Policy definitions, agent roles, witness records

### What's Next

- Agent adapter layer for multi-AI orchestration (Claude, GPT, Gemini)
- Enterprise SSO integration
- On-premise deployment option
- SDK for third-party integrations
- Advanced policy engine with conditional approval workflows

### Get Involved

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on reporting issues, suggesting improvements, and submitting code.

---

<p align="center">
  <em>You set the rules. The system enforces them. Every decision is visible, traceable, and provable.</em>
</p>
