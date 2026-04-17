# RIO System Overview

**Extracted from:** `controlPlane.ts`, `kernelExecutor.ts`, `constrainedDelegation.ts`, `gatewayProxy.ts`, `integritySubstrate.ts`, `authorityLayer.ts`, `RED-TEAM-REPORT.md`

---

## What RIO Is

RIO is a governed execution system that sits between AI, humans, and real-world actions. It translates goals into structured intent, evaluates risk and policy, requires approval when necessary, controls execution, verifies outcomes, and generates cryptographically signed receipts recorded in a tamper-evident ledger. The system enforces the rules, not the AI.

---

## Core Invariant

> No change to the world or system state can occur unless it passes through the RIO pipeline and is recorded in the ledger.

---

## Design Principles

These are stated in `controlPlane.ts` and enforced throughout:

| Principle | Enforcement |
|---|---|
| Fail closed | Every unknown state resolves to HOLD. Missing approval = refusal. |
| Silence equals refusal | No implied authority. If approval is not explicitly provided, the action is rejected. |
| No implicit authority | Every action requires explicit authorization through the governance pipeline. |
| No component may both approve and execute the same action | Structural separation between governance and execution. |
| Learning is advisory until explicitly promoted | LearningAnalysis.mutates_live_policy is ALWAYS false. |

---

## Five Enforcement Layers

The system is organized into five enforcement layers, each with its own spec directory:

| Layer | Spec Directory | What It Enforces |
|---|---|---|
| **Commit Chain** | `specs/01_commit_chain/` | Append-only hash-linked ledger. WAL discipline. Integrity substrate. Nonce persistence. |
| **Governance Decision** | `specs/02_governance_decision/` | Intent envelope. 6-check verification. Risk assessment. Human authorization boundary. Expression isolation. |
| **Execution Token** | `specs/03_execution_token/` | Single-use token. 6-check preflight gate. Tool sandbox. Kernel execution order. |
| **Witness Receipt** | `specs/04_witness_receipt/` | Chain-of-custody artifact. Hash binding. Receipt chaining. |
| **Delegation Boundary** | `specs/05_delegation_boundary/` | Constrained delegation. Gateway identity evaluation. Authority model labels. Role enforcement. |

---

## Pipeline Flow

Every action flows through this pipeline in strict order:

```
Intent → Substrate Gate → Verification → Governance → Approval → Token → Gate → WAL PREPARED → Execute → WAL COMMITTED → Receipt → Ledger
```

Expanded:

1. **Intent Envelope** (A1) — Package the proposed action with identity, nonce, timestamp, parameters, policy version.
2. **Integrity Substrate** — Four checks (nonce, dedup, replay, receipt linkage) before governance sees the message.
3. **Verification** (A2) — Six checks (schema, auth, signature, TTL, nonce, replay). ALL must pass.
4. **Governance** (A3) — Risk assessment. LOW = auto-approve. MEDIUM/HIGH = require human approval.
5. **Human Authorization** (A4) — If required, a valid ApprovalRecord must be provided. Silence = refusal.
6. **Delegation Check** — If proposer == approver, enforce cooldown (120s). Block if not met.
7. **Tool Sandbox** — Validate tool name and target against denylist/allowlist.
8. **WAL PREPARED** — Write-ahead log entry before execution. Must succeed or execution is blocked.
9. **Execution Token** (A5) — Issue single-use token (TTL = 5s). Bound to intent hash, action hash, policy, target.
10. **Preflight Gate** — Six checks on the token. ALL must pass.
11. **Nonce Consumption** — DB-backed atomic nonce consumption. Prevents replay.
12. **Connector Execution** — The actual side-effecting call.
13. **WAL COMMITTED/FAILED** — Write outcome to WAL. If execution succeeded but WAL write fails, caller MUST NOT return success.
14. **Witness Receipt** (A6) — Generate tamper-evident receipt linking all artifacts.
15. **Formal Ledger Entry** (A7) — Hash-chain the receipt into the ledger.
16. **Learning Loop** (A8) — Advisory analysis. Never mutates live policy.

---

## Kernel Version

The current kernel version is `K2.0.0`, defined in `kernelExecutor.ts`. It appears in every WAL entry and execution result.

---

## Spec Sections (from Kernel v2 Build Spec)

The system implements these sections, all verified by the red-team audit:

| Section | Description | Status |
|---|---|---|
| §1.1 | Execution Membrane | PASS |
| §1.2 | Approval Membrane | PASS |
| §1.3 | Expression Layer | PASS |
| §2.A | Execution Isolation | PASS |
| §2.B | Write-Ahead Ledger | PASS |
| §2.C | Atomic Approval (CAS) | PASS |
| §2.D | Global Entry Enforcement | PASS |
| §2.E | Expression Isolation | PASS |
| §3 | Security Primitives | PASS |
| §7 | Tool Sandbox | PASS |
| §8 | Failure Semantics | PASS |
| §9 | Ledger Integrity | PASS |
| §10 | Acceptance Tests | PASS (63/63) |
| §11 | Red-Team Audit | PASS (140/140) |
| §12 | Final Invariant | PASS |

---

## Execution Surface

Every side-effecting call in the codebase has been cataloged:

| Category | Files | Governed? |
|---|---|---|
| Email send (sendViaGmail) | connectors.ts, emailApproval.ts | Yes |
| SMS send (Twilio) | connectors.ts | Yes |
| Telegram send | telegram.ts | Mixed (notifications ungoverned, execution governed) |
| Slack send | slack.ts | Notification only |
| Notion write | notion.ts | Logging only |
| GitHub write (Mantis) | mantis.ts | Logging only |
| DB writes | db.ts, routers.ts | Governed (CAS, append-only ledger) |
| Gateway proxy | gatewayProxy.ts | Governed |

Notifications (approval requests via email/Slack/Telegram) are NOT governed — they are informational. Governing the notification would create a circular dependency. Execution (the actual email, SMS, API call) IS governed.

---

## Permitted Execution Entry Points

Only these files may call `dispatchExecution`:

1. `routers.ts`
2. `oneClickApproval.ts`
3. `emailApproval.ts` (calls `sendViaGmail` directly, governed by WAL)

No other file in the codebase has a path to side-effecting execution.

---

## Constants Summary

| Constant | Value | Source |
|---|---|---|
| `KERNEL_VERSION` | `"K2.0.0"` | kernelExecutor.ts |
| `KERNEL_TOKEN_TTL_MS` | 5,000ms (5 seconds) | kernelExecutor.ts |
| `DELEGATION_COOLDOWN_MS` | 120,000ms (2 minutes) | constrainedDelegation.ts |
| `INTENT_TTL_MS` | 300,000ms (5 minutes) | controlPlane.ts |
| `NONCE_TTL_MS` | 600,000ms (10 minutes) | controlPlane.ts |
| `DEDUP_TTL_MS` | 300,000ms (5 minutes) | integritySubstrate.ts |
| Hash algorithm | SHA-256 | controlPlane.ts |
| Canonical JSON | Keys sorted recursively | controlPlane.ts |
| Preflight gate checks | 6 | controlPlane.ts |
| Authority gate checks | 7 | authorityLayer.ts |
| Verification checks | 6 | controlPlane.ts |
| Substrate checks | 4 | integritySubstrate.ts |
| Genesis previous_hash | `"0000000000000000"` | authorityLayer.ts |
| First receipt previous_hash | 64 hex zeros | authorityLayer.ts |

---

## Final Refinement: Receipt ≠ Authorization

The system separates two concepts that must never be conflated:

| Concept | Definition |
|---|---|
| **Truth (Receipts)** | Proof of what happened. A signed, hash-bound witness artifact. Evidence. |
| **Permission (Authorization)** | Permission for what happens next. A bounded, locally issued credential (DTT). |

This separation prevents:

| Threat | How it is prevented |
|---|---|
| **Authority drift** | Authority is local to each step. Cannot accumulate across steps. |
| **Replay attacks** | Each authorization is single-use and time-bounded. Receipts cannot substitute for authorization. |
| **Implicit escalation** | No receipt grants permission. Every step requires fresh evaluation and fresh authorization. |
| **Cross-system leakage** | Receipts from one substrate cannot authorize actions in another. New DTT required at every boundary. |

At every execution boundary, two questions must be answered:

1. **Is the upstream output trustworthy?** — Validate the receipt (signature, timing, identity, measurement).
2. **What is allowed to happen next?** — Issue a new authorization (DTT).

See `docs/TWO_QUESTION_PATTERN.md` and `docs/INVARIANT.md` for the full specification.
