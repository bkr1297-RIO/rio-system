# RIO — System Runtime Map

## Purpose

This document defines what is running, how the system is structured at runtime, how specification artifacts map to implementation, and how to verify the system end-to-end.

It is the authoritative guide for understanding what is real, specified, and planned.

---

## 1. System Definition

RIO is a governed execution system that enforces:

> No digital action occurs without explicit authorization, and all actions produce verifiable cryptographic proof.

Runtime structure:

```text
Signal → Proposal → Policy → Authorization → Execution Gate → Execute → Receipt → Ledger
```

---

## 2. Runtime Architecture

### Core Runtime System

| Component | Status | Location |
|---|---|---|
| Gateway | Running | `gateway/server.mjs` |
| Execution Gate | Running | Gateway execution handler |
| Authorization Binding | Running | Token issuance + validation |
| Receipt System | Running | Receipt generation logic |
| Ledger | Running | PostgreSQL + receipt linkage |
| Connectors | Running | Gateway adapter layer |

### Supporting Runtime Systems

| Component | Status | Location |
|---|---|---|
| PostgreSQL Database | Running | External deployment |
| Render Deployment | Running | Production gateway instance |
| SPG-M Intake | Running, non-executing | `POST /spgm/intake` |
| SPG-M Policy Review Preview | Running, non-executing | `POST /spgm/policy-review` |
| SPG-M Policy Bridge | Running | `/govern`, `/api/v1/intents/:id/govern` |

---

## 3. Specification vs Runtime Mapping

### Execution Gate Protocol

- Spec: `protocols/rio-cs-04-execution-boundary.md`
- Runtime: Gateway execution handler
- Function:
  - validates authorization token,
  - enforces single-use execution,
  - rejects invalid or replayed requests.

### Authorization Binding Protocol

- Spec: `protocols/rio-cs-03-authorization.md`
- Runtime: token generation and validation
- Function:
  - binds approval to intent and parameters,
  - enforces expiry and scope,
  - prevents execution drift.

### Receipt & Ledger Protocol

- Spec: `protocols/rio-cs-05-receipt-ledger.md`
- Runtime: receipt generation and ledger write
- Function:
  - produces cryptographic receipt,
  - links to previous receipt,
  - creates append-only hash chain.

### Policy & Risk Layer

- Spec: `spec/RIO-STANDARD-v1.0.md`
- Runtime: gateway risk classification and pure policy engine
- Function:
  - classifies intent risk,
  - determines approval requirement,
  - may consume SPG-M review metadata as conservative context,
  - does not execute actions.

### SPG-M Pattern Governance Layer

- Placement: `docs/SPG_M_RUNTIME_PLACEMENT.md`
- Intake contract: `docs/SPG_M_GATEWAY_INTAKE_CONTRACT.md`
- Policy bridge: `docs/SPG_M_POLICY_CONTEXT_BRIDGE.md`
- Verification:
  - `gateway/spgm/VERIFY_INTAKE.md`
  - `gateway/spgm/VERIFY_POLICY_REVIEW.md`
  - `gateway/spgm/GOVERN_REQUEST_BRIDGE.md`

Runtime surfaces:

```text
GET /spgm/status
POST /spgm/intake
POST /spgm/policy-review
POST /govern
POST /api/v1/intents/:id/govern
```

SPG-M may:

- accept ambiguous pattern-governance signals,
- validate intake packets fail-closed,
- classify consequence class,
- return gate/routing/review metadata,
- preview RIO policy review,
- pass review metadata into live governance paths,
- escalate `AUTO_APPROVE` to `REQUIRE_HUMAN` when RIO review is required.

SPG-M may not:

- approve,
- execute,
- issue tokens,
- dispatch connectors,
- write execution ledger entries,
- generate receipts,
- create memory.

---

## 4. System Invariants

1. No execution without valid authorization.
2. No authorization without binding to intent.
3. No replay of executed actions.
4. No execution without receipt.
5. No receipt without ledger entry.
6. All actions produce verifiable lineage.
7. SPG-M intake is non-executing.
8. SPG-M policy context can only preserve or increase governance weight.
9. SPG-M policy review preview cannot create intent or authorization.
10. SPG-M governance bridges cannot bypass the Execution Gate.

---

## 5. What Is Not Running

| Component | Status |
|---|---|
| Mantis pattern detection | Not implemented |
| SPG-M memory integration | Not implemented |
| SPG-M receipt generation | Not implemented |
| Bondi orchestration runtime | Not part of runtime |
| ONE PWA interface | Not deployed |
| Meta-Governance quorum system | Not implemented |
| Learning Loop | Not implemented |

---

## 6. Verification Path

Core gateway verification:

```bash
npm test
```

SPG-M verification:

```bash
npm run test:spgm
npm run test:spgm:policy-review
npm run test:spgm:govern
```

Manual verification:

```text
gateway/spgm/VERIFY_INTAKE.md
gateway/spgm/VERIFY_POLICY_REVIEW.md
gateway/spgm/GOVERN_REQUEST_BRIDGE.md
```

---

## 7. Known Gaps

- No CI/CD pipeline enforcing tests — Open
- SPG-M receipt generation / ledger write is not implemented — Open
- SPG-M memory or pattern-log persistence is not implemented — Open
- SPG-M public API docs may need deeper OpenAPI examples — Open

Completed:

- Demo walkthrough endpoint/crypto fixes
- HTTP-based verifier update
- Runtime reading map
- License file
- SPG-M intake
- SPG-M policy review preview
- SPG-M live governance bridge
- SPG-M API v1 governance bridge

---

## 8. Canonical Reading Order

1. `README.md`
2. `SYSTEM_RUNTIME_MAP.md`
3. `gateway/README.md`
4. `protocols/`
5. `spec/RIO-STANDARD-v1.0.md`
6. `docs/SPG_M_RUNTIME_PLACEMENT.md`
7. `docs/ONE_RIO_MUSS_MODULE_MAP.md`
8. `docs/SPG_M_GATEWAY_INTAKE_CONTRACT.md`
9. `docs/SPG_M_POLICY_CONTEXT_BRIDGE.md`
10. `gateway/spgm/VERIFY_INTAKE.md`
11. `gateway/spgm/VERIFY_POLICY_REVIEW.md`
12. `gateway/spgm/GOVERN_REQUEST_BRIDGE.md`
13. `demo/DEMO_WALKTHROUGH.md`

---

## 9. Summary

This is a single governed execution system.

SPG-M is now present as a non-executing pattern-governance intake, review-preview surface, and conservative governance bridge. It may increase review weight but cannot create authority, execute actions, issue tokens, create receipts, or create memory.

There is no parallel execution path.
There is no dual authority.
There is one system.
