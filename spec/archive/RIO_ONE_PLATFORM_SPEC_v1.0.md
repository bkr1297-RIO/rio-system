> Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

# RIO / ONE Platform Specification v1.0

**Spec ID:** RIO-SPEC-PLATFORM-001
**Version:** 1.0
**Status:** Active
**Date:** 2026-04-04
**Author:** Brian Kent Rasmussen (System Owner), codified by Manus Agent (Romney)
**Canonical Location:** `spec/RIO_ONE_PLATFORM_SPEC_v1.0.md`

---

## Table of Contents

1. [One-Sentence Architecture](#1-one-sentence-architecture)
2. [The 7 Invariants](#2-the-7-invariants)
3. [The 9-Stage Lifecycle](#3-the-9-stage-lifecycle)
4. [Role Separation](#4-role-separation)
5. [System Components](#5-system-components)
6. [governed_action() API Definition](#6-governed_action-api-definition)
7. [Receipt Schema](#7-receipt-schema)
8. [SDK Structure](#8-sdk-structure)
9. [Deployment Architecture](#9-deployment-architecture)
10. [Agent Work Protocol](#10-agent-work-protocol)
11. [Definition of Done](#11-definition-of-done)
12. [Security Model](#12-security-model)
13. [Async Approval and Queue Model](#13-async-approval-and-queue-model)
14. [Connector Model](#14-connector-model)
15. [Ledger Architecture](#15-ledger-architecture)

---

## 1. One-Sentence Architecture

> RIO / ONE is a sovereign governed execution control plane that sits between AI intelligence and real-world action, enforcing a single non-negotiable rule: no action executes without explicit human-rooted approval and a cryptographic receipt permanently recorded in an immutable ledger.

The system is organized into five layers. Every request traverses these layers in order; no layer may be bypassed.

| Layer | Function | Component |
|---|---|---|
| **Interface** | What the user sees and controls | ONE (PWA) |
| **Intelligence** | AI proposals and reasoning | Agents (Bondi, Jordan, external) |
| **Governance** | Policy evaluation and human approval | RIO Policy Engine |
| **Execution** | Dispatching authorized actions to target systems | Gateway + Connectors |
| **Proof** | Cryptographic receipts and tamper-evident history | Receipt Protocol + Ledger |

RIO does not make AI smarter. RIO makes AI accountable, verifiable, and safe. The system enforces the rules, not the AI.

---

## 2. The 7 Invariants

These are the non-negotiable architectural and operational rules of the RIO system. They must always be true regardless of deployment, feature, or use case. They form the foundation of the product, the architecture, and the trust story.

### Invariant 1: Human Authority

A human is always the final approval authority for governed actions. The system cannot override or bypass human intent. The human (designated I-1 in the architecture) is the root authority — the only "Yes" that matters.

### Invariant 2: No Execution Without Approval

High-risk or governed actions cannot execute without explicit approval. The system enforces this at the execution boundary, not just in policy. An executor that receives a request without a valid, non-revoked execution token MUST reject it. This is a protocol-level invariant, not a recommendation.

### Invariant 3: Receipt Required

Every governed action must produce a cryptographic receipt. If an action occurs, a receipt must exist. The converse is the system's foundational axiom: **No Receipt = Did Not Happen.** A governed action is not considered committed until a conformant receipt has been generated and durably written to the ledger.

### Invariant 4: Ledger Required

Every receipt must be written to an append-only, hash-chained ledger. The ledger provides the immutable history of the system. No entry may be modified or deleted after creation. Every change to the system's state is expressed as a new append-only entry with its own governance receipt. The past is immutable; the future is governed.

### Invariant 5: Fail Closed

If approval, signing, receipt generation, or ledger write fails, the action must not execute. The system defaults to safety and inaction when any part of the governance loop fails. If RIO is unreachable, or if RIO cannot produce a definitive authorization decision, executors MUST treat the action as NOT AUTHORIZED and MUST NOT execute it.

### Invariant 6: Independent Verification

Receipts and the ledger must be independently verifiable by a third party. Trust is established through cryptography, not just system claims. Any conformant RIO implementation must be able, given access to the ledger, to reconstruct the complete chain of receipts for a governed action from intent through approval and authorization to execution and commit.

### Invariant 7: Separation of Roles

The system maintains strict separation between four functional roles: Intelligence (AI proposes actions), Authority (Human approves actions), Execution (Gateway executes actions), and Witness (Receipt + Ledger verify actions). These roles cannot be collapsed or combined. Intelligence cannot execute; execution cannot approve. This separation is codified in the Three-Power Separation specification as Observer, Governor, and Executor — each with explicit capabilities and constraints.

---

## 3. The 9-Stage Lifecycle

The RIO system operates on a continuous, 9-step lifecycle loop. This loop ensures that every action is governed, executed, recorded, and learned from. The lifecycle is the standard model for all RIO deployments.

**Observe → Analyze → Plan → Govern → Approve → Execute → Record → Verify → Learn**

| Stage | Function | Component | Question Answered | Layer |
|---|---|---|---|---|
| 1. Observe | Monitor environment, receive signals | Mantis / Observer | What exists? | Intelligence |
| 2. Analyze | Process observations, identify patterns | AI Model | What does it mean? | Intelligence |
| 3. Plan | Translate goals into structured intents | Orchestrator | What could we do? | Intelligence |
| 4. Govern | Evaluate intent against policy, calculate risk | RIO Policy Engine | What is allowed? | Governance |
| 5. Approve | Human reviews and provides cryptographic approval | Human (I-1) | What will we do? | Governance |
| 6. Execute | Perform the approved action via connectors | Gateway | Do it. | Execution |
| 7. Record | Generate cryptographically signed receipt | Receipt Protocol | What happened? | Proof |
| 8. Verify | Write receipt to immutable hash-chained ledger | Ledger | Can we prove it? | Proof |
| 9. Learn | Use history and outcomes to refine future policies | Policy Engine | What should change? | Feedback |

The lifecycle forms a closed loop: the Learn stage feeds updated policies back into the Govern stage, creating a system where every action is authorized, executed, verified, recorded, and used to improve future decisions.

### State Machine

The protocol defines the following abstract states for a governed action, with strictly enforced transitions:

```
NEW_INTENT → INTENT_REGISTERED → PENDING_APPROVAL → APPROVED → AUTHORIZED → EXECUTING → EXECUTED → COMMITTED
```

Forbidden transitions are enforced at the protocol level:

- Any state → EXECUTING without AUTHORIZED is forbidden.
- Any state → COMMITTED without EXECUTED is forbidden.
- Any state → COMMITTED without a conformant Receipt is forbidden.
- CANCELLED → EXECUTING or AUTHORIZED is forbidden.

---

## 4. Role Separation

### The Three Powers

RIO separates governance authority into three independent powers. This is the structural innovation — not the UI, not individual tools, but the separation itself.

**Observer (Mantis)**

The observation layer. Receives raw intents, normalizes them into the canonical IntentEnvelope format, attaches ingestion metadata, performs advisory risk classification, and forwards to the Governor. Mantis sees everything. Mantis decides nothing. Mantis acts on nothing.

| Capability | Constraint |
|---|---|
| Intent reception from any authenticated source | Cannot approve or deny intents |
| Format normalization to IntentEnvelope | Cannot modify intent parameters after normalization |
| Metadata attachment (source, timestamp, request_id) | Cannot access execution connectors |
| Advisory risk classification (non-binding) | Cannot hold API keys or OAuth tokens |
| Replay prevention (timestamp + nonce validation) | Cannot override Governor verdicts |
| Ledger logging (submit entries only) | Cannot modify existing ledger entries |

**Governor (Policy Engine)**

The decision layer. Evaluates intents against the constitution and policy. Determines risk level and whether human authorization is required.

| Capability | Constraint |
|---|---|
| Policy evaluation against constitution | Cannot execute actions |
| Risk classification (LOW / MEDIUM / HIGH) | Cannot access connectors |
| Approval routing and threshold enforcement | Cannot modify the ledger (append only) |
| Action classification | Cannot override human decisions |

**Executor (Connector Layer)**

The action layer. Dispatches authorized intents to target systems using single-use execution tokens.

| Capability | Constraint |
|---|---|
| Token validation and burn | Cannot approve intents |
| Connector dispatch to target APIs | Cannot modify governance decisions |
| Result capture and execution confirmation | Cannot bypass token burn |
| Receipt generation trigger | Cannot execute without valid, unexpired token |

### The Human Role

The human (I-1) sits above all three powers as the root authority. The human sets policy, approves high-risk actions, and can invoke the kill switch at any time. The human does not need to understand the implementation — they need to understand the question being asked and the consequences of saying "Yes."

### Mapping to Real-World Equivalents

| RIO Layer | Function | Real-World Equivalent |
|---|---|---|
| Human Authority | Final decision | Customer / Principal |
| Governance | Policy + approval | Okta / Auth0 / IAM |
| Orchestration | Task routing | Zapier / Make / Airflow |
| Intelligence | AI proposals | OpenAI / Anthropic / Google |
| Execution | Perform the action | APIs (Google, Slack, Stripe) |
| Witness | Receipts | Stripe-style audit logs |
| Ledger | Immutable record | Blockchain / QLDB |
| Learning | Audit + reasoning | Datadog / MLflow |
| Interface | User interface | Operating System UI |

---

## 5. System Components

### RIO — Governance Engine

RIO is the governed execution system that sits between AI, humans, and real-world actions. It translates goals into structured intent, evaluates risk and policy, requires approval when necessary, controls execution, verifies outcomes, and generates cryptographically signed receipts recorded in a tamper-evident ledger. RIO is built on a three-loop architecture: Intake (goal → intent), Governance (policy → approval → execution → verification), and Learning (ledger → policy improvement).

### ONE — Operating System Interface

ONE is the human control surface — a Progressive Web App (PWA) that serves as the sovereign command center. Through ONE, the human sets goals, reviews AI proposals, approves high-risk actions, views receipts, inspects the ledger, manages policies, and controls connected services. ONE communicates with the Gateway via tRPC procedures and maintains local cryptographic state in IndexedDB.

| ONE Screen | Purpose |
|---|---|
| Bondi (Chat) | Conversational interface to the AI Chief of Staff |
| Approvals | Pending intent queue with approve/deny/batch actions |
| Activity | Full history explorer with status filters |
| Dashboard | System health, approval SLA metrics, proxy status |
| Ledger | Tamper-evident hash chain viewer with verification |
| Intent Detail | Full pipeline view: intent → governance → approval → execution → receipt |
| Receipt Viewer | Cryptographic verification UI with hash chain linkage proof |
| Settings | Identity, Ed25519 keys, policy, connected services |

### Gateway — Execution Engine

The Gateway is the runtime that processes the 7-stage governance pipeline: Submit → Govern → Authorize → Execute → Confirm → Receipt → Ledger. Each stage appends an entry to the hash-chained ledger. The pipeline is strictly sequential — no stage can be skipped. The Gateway exposes both a JWT-authenticated core API and a public API v1 with API key authentication and rate limiting.

### Ledger — Database of Truth

The ledger is the append-only, hash-chained store of all system events. Every intent submission, governance decision, authorization, execution, receipt, and kill switch event is recorded as a ledger entry. The ledger enforces immutability at the database level through triggers that prevent UPDATE and DELETE operations.

### Receipts — Proof

A receipt is a cryptographic artifact that links intent, approvals, authorization, and execution outcomes into a verifiable chain. Receipts use SHA-256 hashing and optional Ed25519 signatures. The receipt schema supports both 3-hash (proof-layer) and 5-hash (governed) formats.

### Mantis — Flight Recorder

Mantis is the governance observer and risk assessor. It is the first stage of the RIO governance pipeline — sitting between intent sources and the Governor. Mantis records all actions and data within the system. If an event is not recorded by Mantis, it is considered as if it did not happen. Mantis functions as a governed database corpus suitable for enterprise-scale applications.

### Agents — Workers

Agents (Bondi, Jordan, and external AI models) are the intelligence layer. They propose actions, analyze data, and generate structured intents. Agents operate under the constraint that they can propose but never execute — all execution is routed through the Gateway under governance control.

### Chief of Staff — Orchestrator

The orchestrator layer that routes tasks between agents, manages workflows, and coordinates multi-step operations. The Chief of Staff translates high-level user goals into sequences of governed actions.

---

## 6. governed_action() API Definition

### Core Pipeline Endpoints (JWT Authentication)

The Gateway exposes the following core pipeline endpoints. All mutations require replay prevention via `request_timestamp` (5-minute window) and `request_nonce` (UUID v4).

**POST /intent** — Submit a new intent for governance evaluation.

```json
{
  "action": "send_email",
  "agent_id": "manus",
  "parameters": {
    "to": "recipient@example.com",
    "subject": "Test",
    "body": "Hello from RIO"
  },
  "confidence": 95,
  "target_environment": "production",
  "request_timestamp": "2026-04-04T00:00:00.000Z",
  "request_nonce": "uuid-v4"
}
```

Response: `{ "intent_id": "uuid", "status": "submitted", "hash": "sha256-hex" }`

**POST /govern** — Evaluate an intent against governance policy.

Response includes governance checks (constitution loaded, policy loaded, agent recognized, environment valid, action classification, confidence threshold, external effect detection), risk level, and whether approval is required.

**POST /authorize** — Authorize a governed intent (approve or deny).

Requires `intent_id`, `decision` (approved/denied), `signer_id`, and optional Ed25519 `signature`. When `ED25519_MODE=required`, unsigned authorizations are rejected. Issues a single-use execution token on approval.

**POST /execute** — Execute an authorized intent using a single-use token.

Requires `intent_id` and `execution_token`. The token burns on first use; replay returns HTTP 409. The executor validates the token, dispatches to the appropriate connector, captures the result, and triggers receipt generation.

**POST /receipt** — Generate a cryptographic receipt for a completed intent.

Returns the full receipt with hash chain (intent_hash, governance_hash, authorization_hash, execution_hash, receipt_hash), ledger linkage, and optional Ed25519 signature.

**GET /ledger** — Return all ledger entries (hash-chained).

**GET /verify** — Verify the integrity of the entire ledger hash chain.

**GET /health** — System health check (public, no auth required).

### Public API v1 Endpoints (API Key Authentication)

All Public API v1 endpoints are mounted at `/api/v1/` and require API key authentication via the `X-API-Key` header. Rate limiting is enforced per API key (read: 100/min, write: 30/min, admin: 10/min).

| Method | Path | Scope | Purpose |
|---|---|---|---|
| POST | `/api/v1/intents` | write | Submit a new intent |
| GET | `/api/v1/intents` | read | List intents (with optional status filter) |
| GET | `/api/v1/intents/:id` | read | Get intent by ID with full pipeline state |
| POST | `/api/v1/intents/:id/govern` | write | Evaluate intent against policy |
| POST | `/api/v1/intents/:id/authorize` | admin | Authorize intent (approve/deny) |
| POST | `/api/v1/intents/:id/execute` | admin | Execute authorized intent |
| POST | `/api/v1/intents/:id/confirm` | write | Confirm execution |
| POST | `/api/v1/intents/:id/receipt` | read | Generate receipt |
| GET | `/api/v1/ledger` | read | Get ledger entries |
| GET | `/api/v1/verify` | read | Verify chain integrity |
| GET | `/api/v1/health` | none | Health check (no auth) |

### ONE tRPC Procedures (Session Authentication)

ONE communicates with its backend via tRPC procedures. Key governance procedures:

| Procedure | Type | Purpose |
|---|---|---|
| `proxy.createIntent` | mutation | Create intent with risk assessment |
| `proxy.approveIntent` | mutation | Submit approval with signature binding |
| `proxy.batchApprove` | mutation | Batch approve up to 50 intents |
| `proxy.executeIntent` | mutation | Execute approved intent with 8 preflight checks |
| `proxy.expireStaleIntents` | mutation | Sweep and expire intents past TTL |
| `proxy.getLedger` | query | Retrieve full tamper-evident ledger |
| `proxy.verifyChain` | query | Verify SHA-256 hash chain integrity |
| `proxy.getReceipt` | query | Get execution receipt with verification data |
| `proxy.kill` | mutation | Global kill switch — revoke all access |
| `proxy.approvalMetrics` | query | Approval SLA dashboard metrics |

---

## 7. Receipt Schema

The receipt schema is defined in `spec/receipt-schema.json` in the `rio-receipt-protocol` repository. Receipts are the cryptographic proof that a governed action occurred. The schema supports two formats:

### 3-Hash Receipt (Proof Layer)

Used for actions that do not require governance approval (LOW risk, auto-approved).

```json
{
  "receipt_id": "uuid-v4",
  "receipt_type": "action",
  "intent_id": "uuid-v4",
  "action": "web_search",
  "agent_id": "bondi",
  "authorized_by": null,
  "timestamp": "2026-04-04T00:00:00.000Z",
  "protocol_version": "2.2.0",
  "hash_chain": {
    "intent_hash": "sha256-hex-64",
    "governance_hash": null,
    "authorization_hash": null,
    "execution_hash": "sha256-hex-64",
    "receipt_hash": "sha256-hex-64"
  },
  "verification": {
    "algorithm": "SHA-256",
    "chain_length": 3,
    "chain_order": ["intent_hash", "execution_hash", "receipt_hash"]
  }
}
```

### 5-Hash Receipt (Governed)

Used for actions that required human approval (MEDIUM / HIGH risk).

```json
{
  "receipt_id": "uuid-v4",
  "receipt_type": "governed_action",
  "intent_id": "uuid-v4",
  "action": "send_email",
  "agent_id": "bondi",
  "authorized_by": "brian.k.rasmussen",
  "timestamp": "2026-04-04T00:00:00.000Z",
  "protocol_version": "2.2.0",
  "hash_chain": {
    "intent_hash": "sha256-hex-64",
    "governance_hash": "sha256-hex-64",
    "authorization_hash": "sha256-hex-64",
    "execution_hash": "sha256-hex-64",
    "receipt_hash": "sha256-hex-64"
  },
  "verification": {
    "algorithm": "SHA-256",
    "chain_length": 5,
    "chain_order": [
      "intent_hash",
      "governance_hash",
      "authorization_hash",
      "execution_hash",
      "receipt_hash"
    ]
  },
  "ingestion": {
    "source": "frontend",
    "channel": "one-pwa",
    "timestamp": "2026-04-04T00:00:00.000Z"
  },
  "identity_binding": {
    "signer_id": "brian-sovereign",
    "public_key_hex": "64-char-hex",
    "signature_hex": "128-char-hex",
    "signature_payload_hash": "sha256-hex-64",
    "verification_method": "ed25519-nacl",
    "ed25519_signed": true
  }
}
```

### Receipt Verification

A receipt is valid if and only if:

1. The `receipt_hash` equals SHA-256 of (`receipt_id` + all present stage hashes in `chain_order` + `timestamp`).
2. Each individual stage hash is independently recomputable from the original data.
3. If `ed25519_signed` is true, the signature over `receipt_hash` verifies against the registered public key.
4. The receipt appears in the ledger with a valid `prev_hash` linking to the preceding entry.

---

## 8. SDK Structure

The RIO Receipt Protocol SDK is published as both an npm package (`@rio-protocol/receipt` v2.2.0) and a Python package (`rio-receipt` on PyPI v2.2.0). The SDK enables developers to integrate with RIO by either calling the API directly or installing the library and calling functions.

### JavaScript SDK (npm)

```javascript
import {
  // Core: Receipt Generation & Verification
  sha256,
  hashIntent,
  hashExecution,
  hashGovernance,
  hashAuthorization,
  generateReceipt,
  verifyReceipt,
  generateKeyPair,
  signReceipt,
  // Ledger
  GENESIS_HASH,
  createLedger,
  // Standalone Verifier
  verifyReceiptStandalone,
  verifyChain,
  verifyReceiptAgainstLedger,
  verifyReceiptBatch,
} from "rio-receipt-protocol";
```

### Python SDK (PyPI)

```python
from rio_receipt_protocol import (
    create_receipt,
    verify_receipt,
    verify_chain,
)
from rio_receipt_protocol.ledger import Ledger
from rio_receipt_protocol.verifier import verify_receipt_standalone
```

### SDK Repository Structure

```
rio-receipt-protocol/
  spec/
    receipt-schema.json          # Canonical JSON Schema
  reference/
    receipts.mjs                 # JS reference implementation
    verifier.mjs                 # JS standalone verifier
    ledger.mjs                   # JS ledger implementation
    sign_receipt.py              # Python signing reference
    verifier.py                  # Python standalone verifier
    web_verifier.js              # Browser-compatible verifier
  python/
    rio_receipt_protocol/
      __init__.py                # Python package entry
      receipts.py                # Receipt generation
      verifier.py                # Receipt verification
      ledger.py                  # Ledger operations
    tests/
      test_conformance.py        # Python conformance tests
  examples/
    basic-usage.mjs              # Quick start
    end-to-end.mjs               # Full pipeline (JS)
    end-to-end.py                # Full pipeline (Python)
    send_email_demo.mjs          # Email connector example
    money_transfer_demo.mjs      # Payment connector example
    database_persistence_demo.mjs # Persistent ledger example
    key_rotation_demo.mjs        # Key rotation example
  cli/
    verify.mjs                   # CLI receipt verifier
    demo.mjs                     # CLI demo runner
  tests/
    conformance.test.mjs         # JS conformance tests (29/29 passing)
  index.mjs                      # Package entry point
  index.d.ts                     # TypeScript declarations
```

### Integration Patterns

A developer integrates with RIO by following one of three patterns:

**Pattern 1: Direct API Integration.** Call the Gateway REST API directly. Suitable for any language or framework that can make HTTP calls.

**Pattern 2: SDK Integration.** Install the npm or PyPI package and use the typed functions. Suitable for Node.js and Python applications that want type safety and convenience.

**Pattern 3: Agent Framework Wrapper.** Wrap AI framework function calls (OpenAI function calling, Anthropic tool use, LangChain tools) with RIO governance. The wrapper intercepts each function call, submits it as an intent, waits for approval, and returns the result with a receipt. Reference implementations exist for OpenAI, Anthropic, and LangChain.


---

## 9. Deployment Architecture

RIO supports three deployment models. Each provides the same governance guarantees — the difference is where the infrastructure runs and who manages it. All models enforce the same core invariants.

### Deployment Options

| Model | Infrastructure | Best For | Setup Time |
|---|---|---|---|
| **Hosted** (Managed) | RIO team manages everything | Teams wanting governance without infrastructure overhead | 1-2 weeks |
| **Self-Hosted** (Docker) | Customer's own cloud or on-premise | Regulated industries (finance, healthcare, government) | 2-4 weeks |
| **Hybrid** | Customer data plane, RIO control plane | Organizations needing data sovereignty with managed governance | 3-4 weeks |

### Self-Hosted Docker Deployment

The canonical self-hosted deployment uses `docker-compose.yml` at the repository root. A single command starts the full stack:

```bash
cp .env.example .env
# Edit .env with your configuration
docker compose up -d
```

**Services:**

| Service | Image | Port | Purpose |
|---|---|---|---|
| `rio-postgres` | postgres:16-alpine | 5432 | Ledger database (append-only, hash-chained) |
| `rio-gateway` | Built from `gateway/Dockerfile` | 4400 | Governance engine + execution runtime |

The PostgreSQL container initializes from `gateway/ledger/init.sql`, which creates the intents, ledger_entries, receipts, and authorized_signers tables with append-only enforcement triggers. The Gateway container depends on PostgreSQL health and auto-migrates on boot.

**Volume Persistence:**

| Volume | Purpose |
|---|---|
| `rio-pgdata` | PostgreSQL data directory — ledger history |
| `gateway-keys` | Ed25519 signing keys |

### Infrastructure Requirements (Self-Hosted)

| Component | Minimum | Recommended |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| Memory | 4 GB | 8 GB |
| Storage | 20 GB SSD | 100 GB SSD |
| Network | HTTPS with valid TLS certificate | Load balancer + WAF |

### Full Stack Deployment (Future)

The complete production deployment will include all system components:

```
docker compose up -d
  ├── rio-postgres      (Ledger database)
  ├── rio-gateway       (Governance engine)
  ├── rio-one           (ONE PWA — human command center)
  └── rio-mantis        (Flight recorder — observation layer)
```

---

## 10. Agent Work Protocol

The Agent Work Protocol (AWP) defines how autonomous agents perform work within the RIO ecosystem. The protocol ensures that no agent can mark work as complete unless it has been explicitly verified, reviewed, and documented. It mitigates the tendency of Large Language Models to optimize for producing an answer rather than verifying correctness.

### The Agent Work Loop

All agent work within the RIO system MUST follow this strict, non-bypassable loop:

**PLAN → BUILD → SELF-CHECK → AUDIT → FIX → APPROVE → COMPLETE → RECORD**

Agents are strictly prohibited from skipping any step in this loop.

### Agent Roles and Separation of Duties

Each task must have clearly assigned roles. To maintain the integrity of the verification loop, no single agent is permitted to act as Architect, Builder, and Approver simultaneously.

| Role | Responsibility |
|---|---|
| **Architect Agent** | Defines what should be built and establishes the requirements |
| **Builder Agent** | Implements the work according to the Architect's requirements |
| **Auditor Agent** | Reviews and tests the Builder's work against the requirements |
| **Human Authority** | Provides final approval for the work |
| **RIO** | Enforces governance rules and generates the cryptographic receipt |
| **Witness** | Records the proof of work in the tamper-evident ledger |

### Builder Completion Report

Before marking any task as COMPLETE, the Builder Agent MUST produce a formal Builder Completion Report containing: task summary, requirements list, implementation summary, files created/modified, tests performed, known limitations, risk areas, and status (COMPLETE, PARTIAL, or NEEDS REVIEW).

### Auditor Checklist

The Auditor Agent MUST verify the Builder's work against a strict checklist: requirements implemented, files exist in the correct locations, code executes without errors, edge cases considered and handled, security implications considered, documentation updated, repository structure maintained, and tests pass successfully. The Auditor outputs either PASS (proceed to Human Approval) or FAIL (return to Builder with specific fixes).

### Task Status Definitions

| Status | Meaning |
|---|---|
| PLANNED | The Architect Agent has defined the task |
| IN PROGRESS | The Builder Agent is actively working |
| BUILT | The Builder Agent has finished the initial implementation |
| IN REVIEW | The Auditor Agent is reviewing the work |
| CHANGES REQUIRED | The Auditor Agent found issues that the Builder must fix |
| APPROVED | Both the Auditor Agent and the Human Authority have approved |
| COMPLETE | The work is finished and the receipt is recorded |
| BLOCKED | The task cannot proceed due to external dependencies |

---

## 11. Definition of Done

A task is only considered **DONE** when all of the following conditions are met:

1. All requirements are implemented.
2. All code is committed to the repository.
3. All relevant documentation is updated.
4. The Auditor Agent has issued a PASS status.
5. The Human Authority has approved the work (if required by policy).
6. A cryptographic receipt has been generated (if the work involves a governed action).
7. The receipt has been written to the ledger.

If any of these conditions are missing, the task is **NOT DONE.** This definition applies to all work within the RIO ecosystem — code, documentation, configuration, and operational changes.

### Governed Action Definition of Done

For governed actions specifically, the definition of done is stricter. A governed action is committed if and only if:

1. A valid intent_token was registered.
2. Required approvals were collected (per policy).
3. An execution_token was issued and validated.
4. The action was executed by an authorized executor.
5. A conformant receipt was generated linking intent, approvals, authorization, and execution.
6. The receipt was durably written to the append-only ledger.

The commit invariant from the protocol is absolute: **No conformant receipt = No commit.** Implementations may maintain temporary state while a receipt is in progress, but MUST treat the action as non-committed until a receipt is written.

---

## 12. Security Model

### Authentication Layers

RIO employs a layered authentication model with three distinct mechanisms:

| Layer | Mechanism | Purpose |
|---|---|---|
| **Session** | JWT (JSON Web Token) | User authentication for core pipeline endpoints |
| **API Key** | `X-API-Key` header | Developer/service authentication for Public API v1 |
| **Cryptographic** | Ed25519 signatures | Approval binding and receipt integrity |

**JWT Authentication.** Users authenticate via OAuth or passphrase login. The Gateway issues a JWT with configurable expiry (default 24 hours). All core pipeline endpoints (`/intent`, `/govern`, `/authorize`, `/execute`) require a valid JWT.

**API Key Authentication.** The Public API v1 uses API keys with scoped permissions (read, write, admin). Keys have configurable expiry and are rate-limited per scope. API keys are created via JWT-authenticated endpoints and can be revoked at any time.

**Ed25519 Signatures.** Approvals can be cryptographically signed using Ed25519 keypairs. When `ED25519_MODE=required`, unsigned authorizations are rejected. The Gateway stores only public keys; private keys are returned exactly once at generation time and never stored on the server. Key backup uses client-side encryption — the server stores only ciphertext.

### Replay Prevention

All state-changing endpoints require two fields for replay prevention:

- `request_timestamp`: Must be within a 5-minute window (configurable). Future timestamps are rejected with 10-second clock skew tolerance.
- `request_nonce`: UUID v4, used exactly once. Nonces are retained for 24 hours (configurable) and automatically cleaned up.

### Token Security

Execution tokens implement single-use burn semantics:

- Tokens are random UUIDs (unpredictable).
- Each token is bound to a specific `intent_id`.
- Tokens expire after a configurable TTL (default 5 minutes for execution tokens, 30 minutes for session tokens).
- Tokens are burned (marked used) on first use.
- Burned tokens cannot be reused — replay returns HTTP 409.
- Expired tokens are automatically cleaned up.

The fail-closed principle applies: any validation failure rejects the request. There is no fallback or degraded mode.

### Kill Switch

The kill switch is a protocol mechanism that temporarily halts the issuance and use of execution tokens in a given scope. When activated:

- RIO MUST NOT issue new execution tokens for governed actions within the affected scope.
- RIO MUST mark existing execution tokens in that scope as revoked.
- Executors MUST check token validity before each governed action and refuse to execute if the kill switch is active.
- Kill switch ON and OFF events are recorded as receipts on the ledger.
- Previously invalidated tokens MUST remain invalid even after the kill switch is deactivated — new tokens must be issued.

### Key Storage and Management

| Component | Storage | Security |
|---|---|---|
| Ed25519 private keys | Client-side only (never on server) | Returned once at generation, client-encrypted backup available |
| Ed25519 public keys | `authorized_signers` table | Registered with signer_id and role |
| Key backups | `key_backups` table (encrypted ciphertext only) | AES-256-GCM with PBKDF2-derived key from user passphrase |
| JWT secret | Environment variable | Injected at deployment, never committed to code |
| API keys | `api_keys` table (hashed) | SHA-256 hashed, original returned once at creation |

---

## 13. Async Approval and Queue Model

RIO implements a fully asynchronous approval model. Intents can be created at any time by any authenticated agent, stored in a pending queue, and approved by a human later — minutes, hours, or days after creation. This is a core requirement for real-world enterprise use.

### Async Flow

```
Agent creates intent → Intent enters PENDING_APPROVAL queue
                       ↓
Human logs into ONE later → Sees list of pending approvals
                            ↓
Human approves/denies individually or in batch
                            ↓
Approved intents receive execution tokens → Execute → Receipt → Ledger
```

### Queue Characteristics

The pending approval queue has the following properties:

**Persistence.** Intents are stored in the database (MySQL in ONE, PostgreSQL in Gateway) and survive server restarts. The queue is not in-memory.

**Ordering.** Intents are presented in chronological order (oldest first) with risk level as a secondary sort. HIGH risk intents are visually distinguished.

**Filtering.** The queue supports filtering by status (PENDING_APPROVAL, APPROVED, DENIED, EXPIRED), by action type, by agent, and by risk level.

**TTL and Expiration.** Intents have an optional `expiresAt` field. Stale intents past their TTL are automatically transitioned to EXPIRED status and cannot be approved or executed. The `proxy.expireStaleIntents` procedure sweeps the queue on demand. Default TTL is configurable per policy.

### Batch Approval

The `proxy.batchApprove` procedure accepts up to 50 intent IDs in a single call. Each intent is individually validated (status check, expiration check, args hash binding) and approved. The response includes per-intent results with success/failure status. The ONE PWA provides a multi-select UI with select-all functionality on the Approvals page.

### Approval SLA Metrics

The system tracks approval performance through the `proxy.approvalMetrics` procedure, which returns:

| Metric | Description |
|---|---|
| `pendingCount` | Number of intents currently awaiting approval |
| `avgApprovalTimeMs` | Average time from intent creation to approval (milliseconds) |
| `oldestPendingMinutes` | Age of the oldest pending intent in minutes |
| `approvedLast24h` | Number of intents approved in the last 24 hours |
| `rejectedLast24h` | Number of intents rejected in the last 24 hours |
| `expiredLast24h` | Number of intents expired in the last 24 hours |

These metrics are displayed on the ONE Dashboard for operational visibility.

---

## 14. Connector Model

Connectors are the execution boundary — the modules that translate authorized intents into real-world API calls. Every connector operates under the same governance constraints: no connector can execute without a valid, non-revoked execution token, and every execution produces a receipt.

### Connector Architecture

```
RIO Gateway
  └── Connector Registry
        ├── gmail_send     → Gmail API (via MCP or OAuth)
        ├── send_sms       → Twilio API
        ├── web_search     → LLM-synthesized search
        ├── draft_email    → Returns draft content (no side effect)
        ├── read_email     → Gmail read (deferred — requires OAuth)
        ├── drive_read     → Google Drive (deferred — requires OAuth)
        ├── drive_write    → Google Drive (deferred — requires OAuth)
        ├── slack_send     → Slack API (planned)
        ├── calendar_event → Google Calendar (planned)
        └── github_pr      → GitHub API (planned)
```

### Connector Interface

Every connector implements the same interface:

```typescript
type ConnectorExecutor = (
  toolArgs: Record<string, unknown>,
  approvalProof: ApprovalProof | null,
) => Promise<ConnectorResult>;

type ConnectorResult = {
  success: boolean;
  output: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
  executedAt: number;
};
```

### Connector Rules

1. **No pseudo-success.** If the API call fails, the connector MUST return `success: false`. A connector must never claim success when the underlying action did not complete.

2. **Args hash verification.** Before execution, the system verifies that the stored `argsHash` (computed at intent creation time) matches the approval's `boundArgsHash`. This prevents parameter tampering between approval and execution.

3. **Exclusive runtime path.** All external API calls go through the Gateway. No agent calls external APIs directly. Sensitive API keys (Gmail, Twilio, etc.) exist only within the connector service boundary.

4. **Receipt after every execution.** Whether the action succeeds or fails, a receipt is generated documenting the outcome. Failed executions produce receipts with `success: false` and the error details.

### Risk Classification by Connector

| Connector | Risk Level | Approval Required | Rationale |
|---|---|---|---|
| `web_search` | LOW | No (auto-approved) | Read-only, no external side effects |
| `draft_email` | LOW | No (auto-approved) | Returns content only, never sends |
| `send_email` | HIGH | Yes | External communication, irreversible |
| `send_sms` | HIGH | Yes | External communication, cost implications |
| `drive_write` | MEDIUM | Yes | Modifies persistent data |
| `slack_send` | MEDIUM | Yes | External communication to team channels |
| `github_pr` | MEDIUM | Yes | Modifies code repository |

### Adding a New Connector

To add a new connector to the system:

1. Implement the `ConnectorExecutor` interface in a new module.
2. Register the connector with the connector registry using `registerConnector(toolName, executor)`.
3. Define the risk classification in the governance policy.
4. Add the connector to the action classification in the policy engine.
5. Write conformance tests verifying that the connector respects the fail-closed invariant.
6. Document the connector's parameters, side effects, and error modes.

---

## 15. Ledger Architecture

The ledger is the immutable, append-only, hash-chained store of all system events. It is the database of truth — the authoritative record of everything that has happened in the RIO system. The ledger enforces the axiom: **No Receipt = Did Not Happen.**

### Ledger Schema (PostgreSQL)

```sql
CREATE TABLE ledger_entries (
    id SERIAL PRIMARY KEY,
    entry_id UUID NOT NULL,
    intent_id UUID NOT NULL,
    action VARCHAR(255),
    agent_id VARCHAR(255),
    status VARCHAR(50) NOT NULL,
    detail TEXT,
    intent_hash VARCHAR(64),
    authorization_hash VARCHAR(64),
    execution_hash VARCHAR(64),
    receipt_hash VARCHAR(64),
    ledger_hash VARCHAR(64) NOT NULL,
    prev_hash VARCHAR(64) NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

### Hash Chain Structure

Each ledger entry contains a `ledger_hash` computed as:

```
ledger_hash = SHA-256(entry_id + intent_id + action + status + detail + prev_hash + timestamp)
```

The `prev_hash` field links each entry to its predecessor, forming an unbroken chain from the genesis entry (`prev_hash = "0000...0000"`) to the most recent entry. Any modification to any entry in the chain breaks all subsequent hashes, making tampering immediately detectable.

### Append-Only Enforcement

The ledger enforces immutability at the database level through PostgreSQL triggers:

```sql
-- Prevent deletion from ledger
CREATE TRIGGER no_delete_ledger
    BEFORE DELETE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION prevent_ledger_delete();

-- Prevent updates to ledger entries
CREATE TRIGGER no_update_ledger
    BEFORE UPDATE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION prevent_ledger_update();
```

Both triggers raise exceptions that block the operation. There is no administrative override — the ledger is structurally immutable.

### Ledger Entry Types

The ledger records every stage of the governance pipeline:

| Entry Status | Trigger | What It Records |
|---|---|---|
| `submit` | Intent created | Action, agent, parameters, intent hash |
| `govern` | Policy evaluated | Risk level, governance checks, approval requirement |
| `authorize` | Human approved/denied | Decision, signer, signature, execution token |
| `execute` | Action performed | Connector result, execution hash |
| `confirm` | Execution verified | Post-execution confirmation |
| `receipt` | Receipt generated | Full hash chain, receipt hash |
| `kill_switch` | Kill switch activated/deactivated | Scope, reason, actor |
| `onboard` | New user/device registered | Public key, device ID |

### Chain Verification

The `GET /verify` endpoint and the `proxy.verifyChain` tRPC procedure walk the entire ledger from genesis to the latest entry, recomputing each `ledger_hash` from the entry data and `prev_hash`, and comparing against the stored hash. If any entry has been tampered with, the verification fails at that entry and reports the break point.

The ONE PWA provides a "Verify Chain" button on the Ledger page that runs this verification in real time and displays the result with a visual indicator (green checkmark for valid, red alert for broken).

### Ledger Integrity Monitoring

The Gateway includes a `ledger_integrity_job` that periodically verifies the chain and dispatches alerts via the `alert_dispatcher` if tampering is detected. This provides continuous integrity monitoring without requiring manual verification.

### Right to History

Any conformant RIO implementation MUST be able, given access to the ledger, to reconstruct the complete chain of receipts for a governed action — from intent through approval and authorization to execution and commit. This is not a feature; it is a protocol requirement. The ledger exists so that the question "What happened?" always has a verifiable answer.

---

## Appendix A: Glossary

| Term | Definition |
|---|---|
| **Governed Action** | An action subject to RIO policies that MUST be authorized and committed through the protocol |
| **Intent** | A structured proposal for a governed action, submitted by an agent |
| **intent_token** | A signed representation of a proposed governed action; does NOT authorize execution |
| **approval_token** | A signed representation of human approval bound to a specific intent |
| **execution_token** | A single-use authorization that permits a specific governed action to execute |
| **Receipt** | A cryptographic artifact linking intent, approvals, authorization, and execution outcomes |
| **Ledger** | The append-only, tamper-evident store of all receipts and system events |
| **Kill Switch** | A protocol mechanism that halts execution token issuance in a given scope |
| **Connector** | A module that translates authorized intents into real-world API calls |
| **I-1** | The human root authority — the only entity whose "Yes" authorizes execution |
| **Fail Closed** | The system defaults to blocking action when any governance component fails |
| **GENESIS_HASH** | The initial `prev_hash` value (`"0000...0000"`) that anchors the ledger chain |

## Appendix B: Document References

| Document | Location | Purpose |
|---|---|---|
| RIO Governance RFC | `spec/draft-rio-governance-00.md` | Formal protocol specification (RFC-style) |
| Agent Work Protocol | `spec/RIO_AGENT_WORK_PROTOCOL.md` | Agent governance and work verification |
| Three-Power Separation | `spec/THREE_POWER_SEPARATION.md` | Observer/Governor/Executor role boundaries |
| Reference Architecture | `spec/REFERENCE_ARCHITECTURE.md` | System topology and data flow |
| API Catalog v2.7 | `docs/API_CATALOG_v2.7.md` | Complete endpoint documentation |
| Receipt Schema | `rio-receipt-protocol/spec/receipt-schema.json` | Canonical JSON Schema for receipts |
| Integration Patterns | `docs/architecture/INTEGRATION_PATTERNS.md` | OpenAI, Anthropic, LangChain integration guides |
| Deployment Options | `docs/architecture/DEPLOYMENT_OPTIONS.md` | Hosted, self-hosted, and hybrid deployment |
| Enterprise Roadmap | `docs/ENTERPRISE_ROADMAP.md` | MFA, PII redaction, and future enterprise features |
| Self-Host Guide | `docs/SELF_HOST_GUIDE.md` | Step-by-step Docker deployment instructions |
| Enterprise FAQ | `docs/enterprise/ENTERPRISE.md` | Enterprise sales and pilot documentation |

---

**End of RIO / ONE Platform Specification v1.0**

This document is the canonical platform spec that all agents, developers, and future customers build against. It defines the contract. Everything else is implementation.
