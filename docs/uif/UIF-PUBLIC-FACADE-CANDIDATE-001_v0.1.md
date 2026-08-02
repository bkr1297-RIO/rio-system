# UIF-PUBLIC-FACADE-CANDIDATE-001 v0.1
# Upstream Intent Firewall — Public Facade Candidate

**Status:** candidate proposal — docs only, no runtime change
**Version:** 0.1
**Depends on:** RIO Gateway (rio-system), TYPED-INTAKE-PROFILE-001@0.1
**Does not change:** any runtime code, route, dependency, or deployment

---

## 1. What UIF Is

UIF — Upstream Intent Firewall — is a **proposed public product facade** over the
existing RIO Governance Gateway. It is not a new authority engine, not a parallel
runtime, and not a replacement for any existing RIO system component.

UIF's purpose is to present the existing six-stage RIO governance API to external
callers through a well-described, portable, product-facing interface — without
introducing a second implementation or collapsing the internal runtime standings
that the gateway already enforces.

---

## 2. What UIF Is Not

| UIF is NOT… | Reason |
|---|---|
| A new runtime | The Express gateway is the existing and current implementation |
| A parallel execution path | There is one governed execution system |
| A replacement for RIO | RIO remains the governance authority |
| A replacement for Sentinel | Sentinel remains the future point-of-use verifier |
| A replacement for MUS | MUS remains the receipt and proof office |
| A replacement for MANTIS | MANTIS is a separate system |
| A replacement for ONE | ONE is a separate system |
| A replacement for Typed Intake | Typed Intake remains the upstream content-standing boundary |
| A FastAPI service | FastAPI is not proposed as a governing runtime |
| A new authority claim | No new runtime, cryptographic, ledger, or security claim is made here |

---

## 3. Interface Contract

### 3.1 OpenAPI as portable contract

The existing gateway exposes its API contract through a programmatically generated
OpenAPI 3.0 specification served at:

```
GET /api/v1/docs
```

This OpenAPI document is the **single source of truth for the public API contract**
(see `gateway/routes/openapi.mjs`). UIF inherits and extends this contract; it does
not replace it.

The OpenAPI spec is portable: it can be consumed by client SDKs, documentation
generators, API gateways, and testing tools without requiring any particular
server-side framework.

### 3.2 Existing gateway as current implementation

The existing Node.js/Express gateway at `gateway/` is and remains the current
runtime implementation target. Any UIF facade work must be implemented against this
gateway. No new server runtime is introduced by this document.

### 3.3 FastAPI — position statement

A FastAPI application was circulated as an illustrative contract spike to demonstrate
a simplified three-endpoint UIF interface. That spike is:

- an **illustrative contract sketch only**, not existing runtime behavior;
- not proposed as a second governing runtime;
- not a dependency or prerequisite for UIF;
- potentially useful as an optional reference client or thin HTTP adapter at a later
  stage, once the underlying gateway API is stable and the adapter boundary is
  specified.

FastAPI may not be represented as implementing, replacing, or running alongside the
existing gateway unless an explicit adapter boundary document is produced and
reviewed.

---

## 4. Relationship to Typed Intake

Typed Intake is the **upstream content-standing boundary**. It evaluates whether
external content (email body, document, webpage, database record) may be admitted as
data or must be refused promotion to instruction standing.

UIF sits downstream of Typed Intake:

```text
Untrusted External Content
  → Typed Intake (CONTENT PLANE: standing evaluation, BLOCK or PASS)
  → ProposedAction (non-executing, requires explicit authenticated adoption)
  → RIO Intake Schema v1 (CONTROL PLANE: authenticated intent)
  → UIF / Gateway API (governance, authorization, execution, receipt, ledger)
```

Typed Intake is **not presently integrated** with the live gateway. It exists as a
local deterministic fixture (`language-intake-mvp`). Any claim that Typed Intake
guards live gateway ingress is expressly not made by this document.

---

## 5. Relationship to Existing RIO Components

```text
UIF Facade Layer (proposed, docs only)
  │
  └─► RIO Governance Gateway (Node/Express, running, gateway/)
          │
          ├─► SPG-M (non-executing pattern governance, running)
          ├─► Policy Engine (running, governance/policy-engine.mjs)
          ├─► Authorization Binding (running)
          ├─► Execution Gate (running)
          ├─► Receipt System (running)
          └─► Ledger (PostgreSQL, running)

Upstream (not yet integrated at runtime):
  └─► Typed Intake (local fixture only, language-intake-mvp)

Separate systems (not within UIF scope):
  ONE / MANTIS / MUS / Sentinel / rio-protocol / rio-receipt-protocol
```

---

## 6. No New Runtime Claim

This document makes no new claim about:

- prompt-injection protection in production;
- cryptographic receipt integrity beyond what the existing gateway produces;
- ledger settlement;
- execution authority;
- Typed Intake integration with the live gateway;
- any behavior of ONE, MANTIS, MUS, Sentinel, or any system other than the
  existing gateway and its documented API surface.

---

## 7. Required Authorization Before Runtime Work

Any work that would:

- add a new runtime endpoint under the UIF name,
- introduce FastAPI as a server-side dependency,
- claim Typed Intake guards live gateway ingress,
- compress or collapse the existing six internal standings, or
- introduce a new deployment target

must be authorized through a separate implementation proposal and reviewed against
the existing gateway contract before proceeding.

---

## 8. Summary

UIF is a name and a facade contract. The implementation is the existing gateway.
The interface is the existing OpenAPI spec. The authority is RIO. The boundary is
Typed Intake — not yet at runtime, only as a local fixture. No new runtime is
introduced. No existing runtime is replaced.
