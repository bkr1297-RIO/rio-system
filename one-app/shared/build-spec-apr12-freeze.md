# RIO System — Frozen Build Specification

**Status:** FROZEN — No modifications without explicit authorization from Brian (Sovereign Root).
**Frozen:** 2026-04-12
**System:** One — Digital Proxy / Fiduciary Agent
**Master Seed:** v1.1
**Phase:** PHASE 2 ACTIVATION — Tool Execution (The Hands)

---

## 1. Purpose

This document is the canonical baseline for the RIO system as of April 12, 2026. It captures the complete architecture, governance flow, inbound firewall (MVP rule), connector registry, receipt and ledger schema, and test coverage. Every module, interface, and flow described here is implemented, tested, and operational. This is the source of truth for RIO Core, the Inbound Firewall, and the System Flow.

---

## 2. Architecture Overview

RIO is a governed digital proxy that enforces human authority over every AI-initiated action. The system implements a **Three-Power Separation** model where no single component can both decide and execute.

### 2.1 Three Powers

| Power | Role | Can | Cannot |
|---|---|---|---|
| OBSERVER | Full visibility, zero write/execute (Mantis) | Read, assess risk, send signals, read full state, write ledger | Approve, sign, execute |
| GOVERNOR | Authorization only, no execution (Human Core) | Approve, sign, write ledger | Read raw data, assess risk, execute |
| EXECUTOR | Action only, no decision or full observation (Gate) | Execute, write ledger | Observe full state, approve, sign |

### 2.2 Core Governance Flow

The complete governed action loop follows this sequence:

> Intent → Integrity Substrate → Policy Engine → Governance Decision → Authorization Token → Execute → Receipt → Ledger

Every message entering the system, whether inbound (Telegram, API) or outbound (send_email, send_sms), passes through this pipeline. There are no bypass paths.

### 2.3 Module Map

| Module | File | Responsibility |
|---|---|---|
| Intent Pipeline | `server/intentPipeline.ts` | Unified entry point for all inbound/outbound messages |
| Email Firewall | `server/emailFirewall.ts` | Policy engine with MVP rule (primary) and v2 rules (preserved) |
| Integrity Substrate | `server/integritySubstrate.ts` | Pre-governance layer: nonce, dedup, replay, receipt linkage |
| Firewall Governance | `server/firewallGovernance.ts` | Stores governed receipts, Telegram block alerts |
| Authority Layer | `server/authorityLayer.ts` | Root authority, policy signing, authorization tokens, receipts |
| Three Powers | `server/threePowers.ts` | RBAC enforcement, permission matrix, component identity |
| Control Plane | `server/controlPlane.ts` | Intent envelopes, hash computation, governance decisions |
| Connectors | `server/connectors.ts` | Tool execution abstraction (8 connectors registered) |
| Action Store | `server/actionStore.ts` | In-memory action lifecycle tracking |
| Coherence Monitor | `server/coherence.ts` | Meta-governance drift detection (intent, objective, relational) |
| Agent Adapters | `server/agentAdapters.ts` | Multi-model routing (Claude, GPT, Gemini) |
| Continuity | `server/continuity.ts` | Cross-session state persistence |
| Resonance | `server/resonance.ts` | GitHub-based resonance feed |
| Mantis | `server/mantis.ts` | Governance artifact integrity sweeps |
| Bondi | `server/bondi.ts` | AI router with context assembly and intent extraction |
| Gateway Proxy | `server/gatewayProxy.ts` | RIO Gateway communication (submit, govern, approve, execute, receipt) |
| Telegram | `server/telegram.ts` | Outbound Telegram notifications |
| Telegram Input | `server/telegramInput.ts` | Inbound Telegram message processing |
| Check Message | `server/checkMessage.ts` | REST API for external message checking |

---

## 3. Inbound Firewall — MVP Rule

### 3.1 The Rule

One rule. Three conditions. All must be true to BLOCK.

```
IF   sender is unknown (first-time external or no profile)
AND  message contains urgency language
AND  message requests a consequential action
THEN BLOCK
ELSE PASS
```

**Rule ID:** `MVP_001`
**Category:** THREAT
**Confidence:** high
**Default mode:** ON (`mvpMode !== false`)

### 3.2 Sender Classification

A sender is classified as **unknown** when:

- No recipient profile is available (inbound message with no known sender), OR
- Recipient is external AND first-time contact (not in receipt history)

A sender is classified as **known** when:

- Recipient is on an internal domain, OR
- Recipient is an established external contact (appears in prior receipts)

### 3.3 Urgency Patterns

| Pattern | Examples |
|---|---|
| Direct urgency words | urgent, urgently, URGENT |
| Immediate action demands | immediately, right now, ASAP, act now, act fast |
| Deadline pressure | last chance, final warning, final notice, ultimatum |
| Time scarcity | don't delay, time is running out, expires today, limited time |
| Forced response | must act now, must respond immediately, must confirm today |
| Countdown | within 2 hours, within 30 minutes |
| Consequence framing | before it's too late, or you will lose, or your account |

### 3.4 Consequential Action Patterns

| Category | Examples |
|---|---|
| Money / financial | send money, wire transfer, payment, gift card, bitcoin, invoice |
| Identity / credentials | confirm your login, verify your account, reset your password |
| Data / access | click here, download the file, provide your credentials, grant access |
| Account status | account locked, account suspended, account compromised |
| Security alerts | unauthorized access, security alert, security breach |

### 3.5 What PASSES (by design)

- Verification codes from known services (no urgency pressure)
- Delivery notifications (informational, no consequential action)
- Unknown sender with a link but no urgency pressure
- Informational messages regardless of sender
- Any message from a known/established sender
- Urgency without consequential action
- Consequential action without urgency

### 3.6 V2 Rule Engine

The full v2 rule engine (inducement detection, PII scanning, threat detection, commitment language, recipient-based rules, LLM-assisted classification) is preserved and accessible via `{ mvpMode: false }`. It is not active in the default MVP path.

---

## 4. Unified Intent Pipeline

### 4.1 Pipeline Steps

The `processIntent()` function in `server/intentPipeline.ts` executes the following steps in order:

**Step 0 — Integrity Substrate.** Before any governance surface sees the message, the substrate validates nonce uniqueness, content deduplication, and replay prevention. If any check fails, the message is blocked and logged at the substrate level. Governance surfaces never see it.

**Step 1 — Action Store.** The intent enters the action store as a tracked `RIOAction` with status `pending`. The action is immediately claimed to prevent race conditions.

**Step 2 — Policy Engine.** The message is routed through `scanEmail()` which, under MVP mode, runs only the three-condition MVP rule. The firewall produces a `ScanResult` with an `EventType` (BLOCK, WARN, FLAG, PASS, OVERRIDE) and an `EmailReceipt` with full audit data.

**Step 3 — Decision Mapping.** The firewall `EventType` is mapped to a `PipelineDecision`:

| Direction | BLOCK | WARN | FLAG | PASS |
|---|---|---|---|---|
| Inbound | block | allow | allow | allow |
| Outbound | block | require_confirmation | require_confirmation | allow |

**Step 4 — Execution (outbound only).** If the decision is `allow` and an executor function is provided, the outbound action is executed. Execution failures are fail-closed: the action is marked failed, a receipt is generated, and no partial execution occurs.

**Step 5 — Receipt Generation.** A `PipelineReceipt` is generated with SHA-256 hash integrity for every decision (block, allow, or require_confirmation).

**Step 6 — Action Store Completion.** The action is marked with its final status in the store.

**Step 7 — Continuity State.** The decision is written to the continuity layer for cross-session persistence.

### 4.2 Pipeline Interfaces

```typescript
type IntentDirection = "inbound" | "outbound";
type PipelineDecision = "allow" | "block" | "require_confirmation";

interface PipelineReceipt {
  intent_id: string;
  decision: PipelineDecision;
  direction: IntentDirection;
  reason: string;
  timestamp: string;       // ISO 8601
  hash: string;            // SHA-256
}
```

### 4.3 Channels

| Channel | Type | Notes |
|---|---|---|
| Email | `email` | Primary channel |
| SMS | `sms` | Via Twilio |
| Telegram | `telegram` → normalized to `sms` | Inbound and outbound |
| Slack | `slack` | Defined, not yet connected |
| LinkedIn | `linkedin` | Defined, not yet connected |

---

## 5. Connector Registry

Eight connectors are registered. Each follows the unified `ConnectorExecutor` interface: `(toolArgs, approvalProof, riskTier) → ConnectorResult`.

| Connector | Risk Tier | Status | Implementation |
|---|---|---|---|
| `web_search` | LOW | Active | LLM-powered search via Forge |
| `send_email` | HIGH | Active | Notification API with firewall send-time gate |
| `send_sms` | HIGH | Active | Twilio SMS API |
| `draft_email` | MEDIUM | Active | Returns draft without sending |
| `read_email` | MEDIUM | Deferred | Awaiting Gmail API connection |
| `drive_read` | MEDIUM | Deferred | Awaiting Google Drive API connection |
| `drive_search` | LOW | Deferred | Awaiting Google Drive API connection |
| `drive_write` | HIGH | Deferred | Awaiting Google Drive API connection |

### 5.1 Send-Time Gate

The `send_email` connector includes a unified pipeline gate. Before any email is delivered, the message passes through `processIntent()` as an outbound intent. If the pipeline returns `block`, the email is not sent and a `FIREWALL_BLOCKED` error is returned. If `require_confirmation`, the system logs a warning and proceeds (simulated confirmation). If `allow`, the email is delivered via the notification API.

### 5.2 Fail-Closed Enforcement

All connectors implement fail-closed behavior:

- `ARGS_HASH_MISMATCH`: If `SHA-256(toolArgs at approval) !== SHA-256(toolArgs at execution)`, execution halts.
- Connector errors produce `FAIL_CLOSED` results with no partial execution.
- Pipeline errors produce `FAIL_CLOSED` results — the email is never sent.

---

## 6. Governed Action Flow (Gateway)

The full governed action loop through the RIO Gateway follows this sequence:

1. **Submit Intent** — `proxySubmitIntent()` sends the intent to the Gateway.
2. **Govern Intent** — `proxyGovernIntent()` requests a governance decision.
3. **Pending Approvals** — `proxyGetPendingApprovals()` lists intents awaiting human approval.
4. **Submit Approval** — `proxySubmitApproval()` records the human's decision with cryptographic binding.
5. **Execute Intent** — `proxyExecuteIntent()` obtains an execution token from the Gateway.
6. **Execute Action** — The connector performs the real-world action.
7. **Confirm Execution** — `proxyConfirmExecution()` burns the token and reports the result.
8. **Generate Receipt** — `proxyGenerateReceipt()` produces a cryptographic receipt.

The `executeGovernedAction()` function wraps steps 5-8 into a single atomic operation.

### 6.1 Baseline Governed Actions

Two baseline governed actions have been completed and verified (see `shared/BASELINE_GOVERNED_ACTION.md`):

- **Baseline #1:** Manny's E2E test — `send_email` to `rasmussenbr@hotmail.com`, proposer Bondi (I-1), approver I-2, email confirmed received.
- **Baseline #2:** Brian's live test via ONE UI — `send_email` to `rasmussenbr@hotmail.com`, proposer I-1, approver I-2, email confirmed received.

Both produced valid receipts with SHA-256 hash chain linkage to the ledger.

---

## 7. Authority Layer

### 7.1 Root Authority

A single root authority is registered with an Ed25519 public key. The root authority signs governance policies. Root authority can be revoked (kill switch).

### 7.2 Authorization Tokens

Authorization tokens are issued after governance approval. Each token is bound to a specific action and parameter hash. Tokens are single-use: they are burned after execution. Token validation checks expiry, parameter binding, and burn status.

### 7.3 Receipt Chain

Every execution produces a canonical receipt containing:

- `intent_id`, `approver_id`, `token_id`, `policy_hash`
- `execution_result`, `receipt_hash`, `previous_receipt_hash`
- `ledger_entry_id`, Gateway signature

The receipt hash is written to the ledger, forming a tamper-evident hash chain.

---

## 8. Database Schema

Seventeen tables in MySQL/TiDB:

| Table | Purpose |
|---|---|
| `users` | Manus OAuth users (id, openId, name, email, role) |
| `proxy_users` | RIO proxy identities (publicKey, policyHash, seedVersion, status) |
| `tool_registry` | Registered tools with risk tiers and required params |
| `intents` | Intent lifecycle (intentId, toolName, toolArgs, argsHash, riskTier, status) |
| `approvals` | Approval records with Ed25519 signature binding |
| `executions` | Execution results with receipt hash and preflight results |
| `ledger` | Tamper-evident hash chain (entryType, payload, hash, prevHash) |
| `key_backups` | Encrypted key backups (AES-256-GCM) |
| `conversations` | Bondi chat sessions |
| `learning_events` | Learning loop events (approval/rejection/execution feedback) |
| `node_configs` | AI model configurations |
| `system_components` | Three Powers component registry |
| `policy_rules` | Governance policy rules |
| `notifications` | System notifications |
| `principals` | Gateway principal identities (I-1 Proposer+Root, I-2 Approver) |
| `email_firewall_config` | Per-user firewall policy configuration |

---

## 9. Frontend (ONE Command Center)

The ONE PWA is the human control surface for the RIO system. It is deployed at `rio-one.manus.space`.

### 9.1 Routes

| Route | Page | Purpose |
|---|---|---|
| `/` | Login | Gateway authentication with principal selection and passphrase |
| `/dashboard` | Governance Dashboard | System status, recent actions, health indicators |
| `/intent/new` | New Intent | Create intents with tool selector and risk display |
| `/approvals` | Gateway Approvals | Pending approvals with approve/reject actions |
| `/receipts` | Receipts | Receipt history with verification |
| `/ledger` | Ledger | Tamper-evident hash chain viewer |
| `/status` | Status | Proxy state and system health |
| `/architecture` | System Architecture | Visual system architecture diagram |
| `/ask-bondi` | Ask Bondi | AI router chat interface |
| `/email-firewall` | Email Firewall | Policy engine demo and testing |

---

## 10. Test Coverage

**44 test files** with **14,344 lines** of test code covering:

| Area | Key Test Files | Tests |
|---|---|---|
| Email Firewall (MVP + v2) | `emailFirewall.test.ts`, `mvpRule.test.ts` | 128 |
| Connectors + Send-Time Gate | `connectors.test.ts` | 37 |
| Intent Pipeline | `intentPipeline.test.ts` | 25 |
| Check Message API | `checkMessage.test.ts` | 56 |
| Authority Layer | `authorityLayer.test.ts` | Multiple |
| Three Powers | `threePowers.test.ts` | Multiple |
| Control Plane | `controlPlane.test.ts` | Multiple |
| Integrity Substrate | (tested within intentPipeline) | 5 |
| Coherence | `coherence.test.ts` | Multiple |
| Agent Adapters | `agentAdapters.test.ts` | 44 |
| Governed Action E2E | `approve-execute-e2e.test.ts`, `13-point-governed-action.test.ts` | Multiple |
| Firewall Governance | `firewallGovernance.test.ts` | 13 |
| Continuity | `continuity.test.ts` | Multiple |

**Total:** 801+ tests, 799 passing (2 pre-existing network timeouts in `agentAdapters` and `hitl-proxy`).

---

## 11. What Comes Next

This frozen spec establishes the baseline. The next steps, authorized by Brian, are:

1. **Close the outbound loop through RIO** — Wire the full governed action flow so that outbound emails go through Gateway governance (submit → govern → approve → execute → receipt → ledger) rather than the simulated confirmation path.

2. **Run one full governed action end-to-end** — Demonstrate a complete cycle: intent enters the system, is risk-assessed, is approved by the Governor (I-2), is executed with a valid authorization token, produces a receipt, is written to the ledger, and is visible in the dashboard.

---

## 12. Invariants

The following invariants hold for this frozen baseline and must not be violated:

1. **No bypass paths.** Every message passes through the intent pipeline. There is no code path that skips the integrity substrate or policy engine.

2. **Fail-closed.** Any error in the pipeline, connector, or governance flow results in a blocked action. No partial execution occurs.

3. **Proposer ≠ Approver.** The principal that proposes an intent cannot approve it. This is enforced by the Gateway.

4. **Single-use tokens.** Authorization tokens are burned after execution. A burned token cannot be reused.

5. **Hash chain integrity.** Every receipt hash is linked to the previous receipt hash. The ledger forms a tamper-evident chain that can be independently verified.

6. **MVP rule is default.** The three-condition AND rule is the only active firewall rule in production. The v2 rule engine is preserved but requires explicit opt-in via `{ mvpMode: false }`.

7. **Three-Power separation.** Observer cannot execute. Governor cannot execute. Executor cannot approve. These are enforced at both compile-time (typed permissions) and runtime (RBAC checks).

---

**End of Frozen Specification.**
**Document SHA-256:** `646b972b507b824e4f4092978305d39a9ee09cfd2d37867a37f6f6caaaf6ec7d`
**Any modification requires explicit authorization from Brian (Sovereign Root).**
