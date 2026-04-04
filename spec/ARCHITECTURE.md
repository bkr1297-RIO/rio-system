# RIO System Architecture

**Version:** 3.0
**Date:** 2026-04-04
**Authority Level:** High — governs the system design
**Origin:** Brian Kent Rasmussen, Bondi (Scribe / OpenAI ChatGPT), formalized by Manny (Builder / Manus)
**Status:** Canonical
**Supersedes:** `RIO_REFERENCE_ARCHITECTURE.md`, `RIO_ONE_PLATFORM_SPEC_v1.0.md` (architecture sections), `THREE_POWER_SEPARATION.md` (moved to `spec/archive/`)

---

## 1. What RIO Is

RIO is a governed execution system that sits between AI, humans, and real-world actions. It translates goals into structured intent, evaluates risk and policy, requires approval when necessary, controls execution, verifies outcomes, and generates cryptographically signed receipts recorded in a tamper-evident ledger.

The system enforces the rules, not the AI.

> A system that organizes your data, understands your patterns, proposes actions on your behalf, requires your approval for risk, executes safely, and records proof of everything.

---

## 2. The Five Layers

The architecture is organized into five layers as defined in the Constitution. Each layer has a specific function and a strict prohibition.

| Layer | Name | Function | Prohibition |
|---|---|---|---|
| 1 | Cognition | AI proposes actions based on context and patterns | Cannot execute |
| 2 | Governance | Evaluates risk, enforces policy, routes for approval | Cannot execute directly |
| 3 | Execution | Performs approved actions through connectors | Cannot approve |
| 4 | Witness | Records receipts, maintains ledger, enables verification | Cannot execute or approve |
| 5 | Meta-Governance | Controls policy changes, learning, and system rules | Cannot execute actions |

---

## 3. The Three-Loop Architecture

The system operates through three interconnected loops:

**Intake Loop (Goal → Intent):** The user expresses a goal in natural language. Bondi (AI Chief of Staff) translates the goal into a structured intent with action type, target, parameters, and context. The intent enters the governance pipeline.

**Governance Loop (Intent → Receipt):** The intent is risk-assessed, routed for approval if required, executed through the appropriate connector, verified, and a receipt is generated and written to the ledger. This is the core pipeline.

**Learning Loop (Ledger → Policy):** Mantis observes patterns in the ledger — approval times, rejection rates, execution failures, risk assessment accuracy. Observations are escalated to Meta-Governance, which decides whether and how the system should change. Learning flows through Meta-Governance before returning to Cognition.

```
Cognition → Governance → Execution → Receipt → Ledger → Mantis → Meta-Governance → Governance
```

---

## 4. System Components

### 4.1 Gateway

The Gateway is the runtime engine. It receives intents, enforces governance, manages execution, generates receipts, and maintains the ledger. It is the only component that touches external systems.

| Responsibility | Description |
|---|---|
| Intent management | Receives, validates, and stores intents |
| Risk assessment | Evaluates risk level and blast radius |
| Approval routing | Routes high-risk intents to human for approval |
| Execution | Calls connectors to perform approved actions |
| Receipt generation | Produces 5-hash cryptographic receipts |
| Ledger management | Maintains the append-only hash-chained ledger |
| Token management | Issues and validates execution tokens |
| Kill switch | Emergency system halt capability |

**Technology:** Node.js (Express), PostgreSQL, Ed25519 signing.

### 4.2 ONE (Command Center)

ONE is the human control surface — a Progressive Web App that gives the human authority visibility and control over the system. ONE does not execute actions; it provides the interface for humans to approve, deny, monitor, and audit.

| Responsibility | Description |
|---|---|
| Intent visibility | Shows all intents with status, risk, and parameters |
| Approval interface | One-click approve/deny with cryptographic binding |
| Batch approval | Multi-select approval for up to 50 intents |
| Execution monitoring | Real-time status of executing actions |
| Receipt viewing | Full receipt with hash chain verification |
| Ledger browsing | Paginated ledger with chain verification |
| Dashboard | System health, approval SLA metrics, connection status |
| Kill switch | Emergency system halt |

**Technology:** React 19, Tailwind CSS 4, tRPC, PWA (installable on mobile).

### 4.3 Bondi (AI Chief of Staff)

Bondi is the Cognition layer — the AI that translates human goals into structured intents. Bondi proposes actions but cannot execute them. Bondi's proposals enter the governance pipeline like any other intent.

| Responsibility | Description |
|---|---|
| Goal interpretation | Understands natural language requests |
| Intent structuring | Produces structured intents with action type, target, parameters |
| Risk awareness | Includes risk context in proposals |
| Conversation | Maintains context across interactions |

### 4.4 Mantis (Witness)

Mantis is the observation and audit layer. It watches the system but cannot act on it. Mantis records what happens, detects patterns, and escalates anomalies to Meta-Governance.

| Responsibility | Description |
|---|---|
| Observation | Monitors all pipeline events |
| Pattern detection | Identifies trends in approvals, rejections, failures |
| Anomaly detection | Flags unusual behavior for review |
| Escalation | Reports findings to Meta-Governance |
| Audit support | Provides data for periodic system audits |

### 4.5 Receipt Protocol

The Receipt Protocol is the cryptographic layer that produces and verifies receipts. It is implemented as standalone SDKs (JavaScript and Python) that can be used independently of the Gateway.

| Responsibility | Description |
|---|---|
| Receipt creation | Generates 5-hash receipts from pipeline artifacts |
| Receipt verification | Verifies receipt integrity from hash chain |
| Chain verification | Verifies the integrity of the full ledger chain |
| Identity binding | Links approvals to Ed25519 signers |

**Packages:** `@rio-protocol/receipt` (npm), `rio-receipt` (PyPI).

---

## 5. The Three Powers

The system enforces strict separation of three powers. No single component may hold more than one power. This is a structural invariant, not a design pattern.

| Power | Holder | Function | Boundary |
|---|---|---|---|
| Observation | Mantis / Intake | See everything, decide nothing | May read and classify, must not approve or execute |
| Governance | RIO / Human | Evaluate risk, approve or deny | May approve or deny, must not execute |
| Execution | Gateway | Perform approved actions | May execute with valid token, must not approve |

The handoff between powers is explicit and cryptographic. Observation produces a classified intent. Governance produces an approval with a signed token. Execution consumes the token and produces a receipt. The receipt proves the handoff occurred correctly.

---

## 6. The Governed Action Pipeline

Every governed action passes through a 7-stage pipeline:

| Stage | Layer | Input | Output |
|---|---|---|---|
| 1. Submit | Cognition | Natural language goal | Structured intent |
| 2. Govern | Governance | Intent | Risk assessment + routing decision |
| 3. Authorize | Governance | Risk assessment | Approval or denial (human for HIGH/CRITICAL) |
| 4. Execute | Execution | Approved intent + token | Execution result |
| 5. Verify | Witness | Execution result | Verification status |
| 6. Receipt | Witness | All pipeline artifacts | 5-hash cryptographic receipt |
| 7. Commit | Witness | Receipt | Ledger entry (hash-chained) |

If any stage fails, the pipeline halts. The system fails closed. No partial executions are permitted.

---

## 7. Risk Classification

Every intent is classified by risk level, which determines the approval routing.

| Risk Level | Blast Radius | Approval Required | Examples |
|---|---|---|---|
| LOW | 1-3 | Auto-approve (policy-dependent) | Read-only queries, status checks |
| MEDIUM | 4-6 | Auto-approve with logging | Calendar events, document edits |
| HIGH | 7-9 | Human approval required | Email sending, file sharing, API calls |
| CRITICAL | 10 | Human approval + enhanced verification | Financial transactions, account changes, bulk operations |

The risk classification is determined by the connector's registered risk level and the specific action parameters. Connectors declare their risk tier at registration time.

---

## 8. Connector Model

Connectors are the interface between the Gateway and external systems. Each connector implements a standard interface and is registered with a risk classification.

| Field | Description |
|---|---|
| Connector ID | Unique identifier |
| Name | Human-readable name (e.g., "Gmail", "GitHub") |
| Risk Tier | Default risk level for this connector |
| Actions | List of supported action types |
| Parameters | Required and optional parameters per action |
| Verification | How to verify execution success |

**Implemented connectors:** Gmail (send_email), Twilio (send_sms), Calendar (create_event), Google Drive (file operations).

**Connector rules:** A connector must declare its risk tier at registration. A connector cannot lower its own risk tier. A new connector requires Meta-Governance approval. If a connector fails, the system fails closed (the action does not execute).

---

## 9. Token Model

The Gateway uses short-lived tokens to control execution. A token is issued after approval and consumed during execution. Tokens enforce that execution can only happen with valid authorization.

| Property | Value |
|---|---|
| Format | JWT (signed with Ed25519) |
| Lifetime | Short-lived (configurable, default 5 minutes) |
| Single-use | Token is burned after execution |
| Binding | Token is bound to a specific intent ID and action type |

---

## 10. Deployment Architecture

The system supports three deployment models:

**Hosted (Manus):** Gateway and ONE hosted on Manus infrastructure. PostgreSQL managed. Suitable for individual users and small teams.

**Self-Hosted (Docker):** Gateway and PostgreSQL deployed via `docker-compose.yml`. ONE deployed separately or on the same host. Suitable for enterprises that require data sovereignty.

**Hybrid:** Gateway self-hosted, ONE hosted on Manus. Suitable for enterprises that want control over the execution layer but convenience for the human interface.

---

## 11. Security Model

The system implements three layers of authentication and authorization:

| Layer | Mechanism | Purpose |
|---|---|---|
| API Authentication | API keys + JWT | Authenticates callers to the Gateway |
| Approval Signing | Ed25519 | Cryptographically binds approvals to human identity |
| Receipt Verification | SHA-256 hash chain | Proves integrity of the complete pipeline |

Additional security measures include token burn (single-use execution tokens), replay prevention (intent IDs cannot be reused), kill switch (emergency system halt), and append-only ledger enforcement (database triggers prevent modification).

---

## 12. Data Flow Summary

```
User → Bondi (Cognition)
         ↓
    Structured Intent
         ↓
  Gateway (Governance) → Risk Assessment
         ↓
  ONE (Human Authority) → Approve / Deny
         ↓
  Gateway (Execution) → Connector → External System
         ↓
  Receipt (Witness) → 5-Hash Chain
         ↓
  Ledger (Witness) → Hash-Chained Entry
         ↓
  Mantis (Observation) → Pattern Detection
         ↓
  Meta-Governance → Policy Review
         ↓
  Governance (Updated Rules)
```

This is the complete loop. Every action enters at the top and exits at the bottom. The loop closes when Meta-Governance feeds updated rules back to Governance.
