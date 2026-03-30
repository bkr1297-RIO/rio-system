# RIO — Runtime Intelligence Orchestration

**AI Control and Audit Protocol**

A runtime authorization and audit control system that governs AI-initiated actions. RIO enforces governance structurally — not through prompts, policies, or alignment, but through a cryptographic control plane that requires human approval before any high-impact action can execute.

> AI proposes → Human approves → System executes → System records

---

## Demo Video

A 2-minute walkthrough showing the complete RIO flow — from an AI finance agent proposing a $48,250 payment, through interception, phone-based cryptographic approval, execution, and audit trail generation.

**[Watch the Demo Video](./demo/video/RIO_Demo_Video.mp4)**

---

## Live Demo Site

The interactive demo site showcases three perspectives of the RIO system:

**[riodemo-ux2sxdqo.manus.space](https://riodemo-ux2sxdqo.manus.space)**

| Demo | Description |
|------|-------------|
| **Demo 1 — Human Approval Required** | Walk through the approval story from the human's perspective: AI proposes, phone notification arrives, biometric approval or denial, cryptographic receipt generated |
| **Demo 2 — How RIO Enforces Approval** | See the enforcement pipeline: intent registration, policy check, signature verification, execution gate, and ledger recording with stage-light indicators |
| **Demo 3 — Audit & Runtime Log** | Examine the full audit trail: action summary, system log, cryptographic receipt, and tamper-evident ledger entry |

---

## Live Backend Gateway

The hardened RIO gateway is deployed and operational with full cryptographic enforcement:

**Base URL:** `rio-router-gateway.replit.app`

| Endpoint | Purpose |
|----------|---------|
| `POST /api/rio-gateway/intake` | Sovereign gate — requires ECDSA signature + execution token |
| `POST /api/rio-gateway/sign-intent` | Generate ECDSA signature + nonce for an intent |
| `POST /api/rio-gateway/generate-execution-token` | Generate single-use execution token |
| `GET /api/rio-gateway/execution-gate/audit-log` | View the tamper-evident execution ledger |
| `POST /api/rio-gateway/execution-gate/verify-receipt` | Verify receipt authenticity |
| `GET /api/rio-gateway/nonce-registry` | Monitor nonce/signature registry |

---

## Verification Results

Automated security testing confirmed 11 of 12 tests pass, with all critical attack vectors blocked:

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

See [VERIFICATION_RESULTS.md](./VERIFICATION_RESULTS.md) for detailed test results and [VERIFICATION_PLAN.md](./VERIFICATION_PLAN.md) for the complete test plan.

---

## Repository Structure

```
├── README.md                   # This file
├── RIO_SYSTEM_OVERVIEW.md      # Full system architecture and design
├── VERIFICATION_PLAN.md        # 10 security verification tests (V-001 to V-010)
├── VERIFICATION_RESULTS.md     # Complete test results with explanations
├── THREAT_MODEL.md             # 12 threats (T-001 to T-012) with mitigations
├── DEMO_WALKTHROUGH.md         # Step-by-step demo with curl commands
├── demo/
│   └── video/
│       └── RIO_Demo_Video.mp4  # 2-minute professional demo video
├── frontend/                   # Frontend UI (demo site, approval interfaces)
├── backend/                    # Backend services (intent, policy, execution gateway)
├── crypto/                     # Cryptographic signature and verification services
├── ledger/                     # Tamper-evident ledger and hash chain logic
├── database/                   # Database schemas, migrations, and models
├── tests/                      # Test suites and automated verification harness
└── verification_logs/          # Machine-readable test results (JSON)
```

---

## Security Model

RIO implements a **fail-closed** enforcement model. The system is designed so that structure enforces the rules, not policy.

**Key properties:**

- **No approval = no execution.** The execution gate is structurally locked until a valid ECDSA signature and single-use execution token are presented.
- **Single-use approvals.** Every nonce and signature hash is registered in a database. Replay attacks are blocked at the structural level.
- **Timestamp freshness.** Approvals expire after 300 seconds. Stale signatures are rejected.
- **Tamper-evident ledger.** Every action is recorded in a hash-chained ledger. Any modification to a previous entry breaks the chain and is detectable.
- **Cryptographic receipts.** Every execution produces an ECDSA-signed receipt that can be independently verified.

---

## Core Principle

> You set the rules. The system enforces them. Every decision is visible, traceable, and provable.

The AI does not execute actions. The system controls execution. Execution without approval is structurally blocked by the server. Every proposal, approval, denial, and execution is recorded with cryptographic proof.
