# RIO System — Deployment Architecture

**Version:** 1.0  
**Date:** April 6, 2026  
**Author:** Manus AI (on behalf of Brian Kent Rasmussen)

---

## Overview

The RIO system is a governed AI execution platform composed of three independently deployable services that communicate over HTTPS. Every AI action flows through a single pipeline: intent declaration, human approval, authorized execution, cryptographic receipt, and immutable ledger entry. No component can bypass this pipeline.

---

## System Components

The following table describes what each component does, where it runs, and what it is responsible for.

| Component | Purpose | Runtime | URL |
|---|---|---|---|
| **ONE Command Center** | Human control surface — submit intents, approve actions, view receipts and ledger, manage principals | Manus (rio-proxy) | `rio-proxy.manus.space` |
| **RIO Router Gateway** | Governance engine — risk assessment, policy enforcement, approval routing, execution dispatch | Replit | `rio-router-gateway.replit.app` |
| **Render Gateway** (legacy) | Original governance engine — being replaced by Replit deployment | Render | `rio-gateway.onrender.com` |

---

## How They Connect

ONE does not execute anything. It is a control surface. When a user submits an intent or approves an action in ONE, the request is proxied through the ONE server to the RIO Router Gateway on Replit. The Replit gateway performs all governance logic: risk classification, policy lookup, approval routing, tool execution, receipt generation, and ledger writes.

The data flow for a governed action is:

1. **User opens ONE** and authenticates with their principal ID and passphrase.
2. **User submits an intent** (e.g., "Send email to X"). ONE sends this to `/api/hitl/intent` on the Replit gateway.
3. **Gateway classifies risk.** LOW risk actions are auto-approved. MEDIUM and HIGH risk actions require explicit human approval.
4. **User approves** (if required). ONE sends the approval decision to `/api/hitl/approve` on the gateway.
5. **Gateway executes.** ONE sends the execute command to `/api/hitl/execute` with the approval ID. The gateway runs the tool (Gmail, Drive, web search, etc.).
6. **Receipt is generated.** The gateway creates a SHA-256 receipt with the execution result, timestamps, and approval chain.
7. **Ledger entry is written.** The receipt hash is appended to the tamper-evident ledger with a link to the previous entry's hash.
8. **ONE displays the result.** Receipts and ledger entries are visible in the ONE UI.

---

## API Endpoints

All HITL endpoints are served by the Replit gateway at `https://rio-router-gateway.replit.app/api/hitl/`.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/hitl/onboard` | POST | Register a new user with the gateway |
| `/api/hitl/intent` | POST | Submit a new governed intent |
| `/api/hitl/approve` | POST | Approve or deny a pending intent |
| `/api/hitl/execute` | POST | Execute an approved intent |
| `/api/hitl/pending-approvals` | GET | List intents awaiting approval |
| `/api/hitl/receipts` | GET | Retrieve execution receipts |
| `/api/hitl/ledger` | GET | Retrieve the full tamper-evident ledger |

All requests require a Bearer token obtained during authentication.

---

## Field Name Convention

The Replit gateway uses **camelCase** field names throughout its API:

| Field | Description |
|---|---|
| `userId` | Principal identifier (e.g., "I-1") |
| `agentId` | Agent performing the action |
| `toolName` | The tool being invoked (e.g., "send_email") |
| `toolArgs` | Arguments for the tool (the actual details — recipient, subject, body, etc.) |
| `intentId` | Unique identifier for the intent |
| `approvalId` | Unique identifier for the approval (required for MEDIUM/HIGH risk execution) |
| `riskTier` | Risk classification: LOW, MEDIUM, HIGH, CRITICAL |
| `decision` | Approval decision object: `{ value: "yes" or "no", reason: "..." }` |

---

## Minimum Authority Layer

The system enforces six invariants that form the authority chain. These are not optional — they are structural requirements:

1. **No execution without authorization token.** Every execution must reference a valid token.
2. **No authorization token without approval.** Tokens are only issued after explicit approval.
3. **No approval without policy.** Approvals are only valid under an active governance policy.
4. **No policy without root signature.** The governance policy must be signed by the root authority (Ed25519).
5. **No execution without receipt.** Every execution produces a cryptographic receipt.
6. **No receipt without ledger entry.** Every receipt is written to the immutable ledger.

The root authority key is generated client-side in the browser. The private key never leaves the device. The public key is registered with the system and used to verify all signatures in the authority chain.

---

## Roles

| Role | Principal | Responsibilities |
|---|---|---|
| **Root Authority** | I-1 (Brian Kent Rasmussen) | Signs governance policy, issues genesis record, activates kill switch, rotates keys |
| **Chief of Staff** | I-2 | Audits the ledger, reviews receipts, verifies the authority chain, reports findings |
| **Agent** | Bondi, Jordan, etc. | Proposes intents, executes approved actions under governance |

---

## Environment Variables

ONE (rio-proxy) requires the following environment variables to connect to the gateway:

| Variable | Value | Purpose |
|---|---|---|
| `HITL_PROXY_URL` | `https://rio-router-gateway.replit.app` | Base URL for the Replit HITL gateway |
| `VITE_GATEWAY_URL` | `https://rio-gateway.onrender.com` | Base URL for the legacy Render gateway |

---

## Known Limitations

The `toolArgs` field must be sent as `toolArgs` (not `params`) when calling the Replit gateway. ONE's gateway.ts maps this correctly. If building a new client, use `toolArgs` in the request body.

The legacy Render gateway at `rio-gateway.onrender.com` uses snake_case field names (`user_id`, `agent_id`, `entry_type`). The Replit gateway uses camelCase (`userId`, `agentId`, `entryType`). ONE normalizes both formats in its Ledger and Receipts views.

Gmail execution requires OAuth credentials configured in the Replit gateway's secrets. Without them, the gateway reaches the Gmail API but authentication fails. This is a Replit-side configuration step.
