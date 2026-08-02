# UIF-RIO-RECONCILIATION-MATRIX-001 v0.1
# UIF Facade → RIO Gateway Reconciliation Matrix

**Status:** candidate — docs only, no runtime change
**Version:** 0.1
**Source of truth for RIO surfaces:** `gateway/routes/api-v1.mjs`, `gateway/routes/openapi.mjs`
**Source of truth for standing model:** `gateway/governance/intake.mjs`, `SYSTEM_RUNTIME_MAP.md`

---

## 1. Purpose

This document maps proposed UIF facade concepts to actual, existing RIO Gateway surfaces.
It records required corrections to a circulated illustrative FastAPI spike and recommends
an implementation path for the first UIF release.

This document makes no new runtime claim. It is architecture reconciliation only.

---

## 2. Concept-to-Surface Map

The following table maps each UIF lifecycle concept to the existing RIO API v1 endpoint
that implements it, along with standing, consequence, evidence produced, and current
implementation status.

| # | UIF Concept | Existing RIO Surface | Input Standing | Output Standing / Status transition | Responsible Component | Consequence? | Evidence Produced | Current Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Ingest intent | `POST /api/v1/intents` | `AUTHENTICATED_TASK` (RIO Intake Schema v1) | `submitted` | Express router + `validateIntake` / `normalizeLegacy` | No — proposal only | Intent record in memory/DB | **Running** |
| 2 | Evaluate | `POST /api/v1/intents/:id/govern` | `submitted` | `governed` / `blocked` / `authorized` (AUTO_APPROVE) | `policy-engine.mjs`, SPG-M bridge (optional) | No — evaluation only | `governance_hash`, risk tier, `matched_class`, policy version | **Running** |
| 3 | Authorize | `POST /api/v1/intents/:id/authorize` | `governed` | `authorized` / `denied` | Authorization binding + Ed25519 signature verification | No — records human decision | `authorization_hash`, optional `signature_payload_hash` | **Running** |
| 4 | Execute | `POST /api/v1/intents/:id/execute` | `authorized` → token issued | `executing` → connector dispatch | Execution Gate + token issuance (`token-manager.mjs`) | **Yes** — action occurs | `execution_hash`, connector result, `execution_token` burned | **Running** |
| 5 | Confirm outcome | `POST /api/v1/intents/:id/confirm` | `executing` | `executed` / `failed` / `partial` | Execution confirmation handler | No — records outcome | Execution result + confirmation record | **Running** |
| 6 | Retrieve receipt | `POST /api/v1/intents/:id/receipt` | `executed` | `receipted` | Receipt system (`receipts.mjs`), ledger write | No — proof record | Cryptographic receipt, `receipt_hash`, ledger entry | **Running** |
| — | View ledger | `GET /api/v1/ledger` | n/a | n/a | PostgreSQL ledger | No | Append-only hash chain entries | **Running** |
| — | Verify lineage | `GET /api/v1/verify` | n/a | n/a | Chain verifier | No | `chain_valid` boolean, last hash | **Running** |
| — | Read API contract | `GET /api/v1/docs` | n/a | n/a | `openapi.mjs` | No | OpenAPI 3.0 JSON spec | **Running** |

**SPG-M additional surface (non-executing):**

| Surface | Purpose | Consequence? | Status |
|---|---|---|---|
| `GET /spgm/status` | Capability report | No | **Running** |
| `POST /spgm/intake` | Pattern governance intake | No | **Running** |
| `POST /spgm/policy-review` | Non-executing review preview | No | **Running** |
| Optional body on `POST /api/v1/intents/:id/govern` | Conservative escalation context only | No | **Running** |

---

## 3. Status Vocabulary Reconciliation

The existing gateway uses a specific set of status labels. This section distinguishes
what currently exists in runtime, what a normalized vocabulary would look like, and where
mappings are unresolved.

### 3.1 Existing runtime vocabulary (from `api-v1.mjs`)

These status labels are produced and consumed by the current running gateway:

| Status | Where produced | Meaning |
|---|---|---|
| `submitted` | `POST /api/v1/intents` | Intent received and validated |
| `governed` | `POST /api/v1/intents/:id/govern` — when `REQUIRE_HUMAN` | Governance evaluated; human approval required |
| `authorized` | `POST /api/v1/intents/:id/govern` — when `AUTO_APPROVE`; or `POST /api/v1/intents/:id/authorize` decision=approved | Authorization recorded |
| `blocked` | `POST /api/v1/intents/:id/govern` — when `AUTO_DENY`; or authorize decision=denied | Blocked at governance or authorization |
| `denied` | `POST /api/v1/intents/:id/authorize` decision=denied (alias for blocked in authorization handler) | Human denial recorded |
| `executing` | `POST /api/v1/intents/:id/execute` (on token issue) | Execution token issued; dispatch in progress |
| `executed` | `POST /api/v1/intents/:id/confirm` success | Execution confirmed |
| `failed` | `POST /api/v1/intents/:id/confirm` on failure | Execution failed |
| `receipted` | `POST /api/v1/intents/:id/receipt` | Receipt generated and ledger written |

### 3.2 Proposed normalized vocabulary

The following is a proposed normalized vocabulary that would make the internal stages
explicit in any public-facing documentation or SDK. These labels are **proposed** —
they do not currently appear verbatim in the gateway code.

| Proposed label | Maps to (existing) | Stage |
|---|---|---|
| `PROPOSED` | `submitted` | Intent received, not yet evaluated |
| `EVALUATED` | `governed` (REQUIRE_HUMAN path) | Policy evaluated; awaiting human decision |
| `AWAITING_APPROVAL` | `governed` (same) | Explicit: approval gate open |
| `AUTHORIZED` | `authorized` | Human approval recorded or AUTO_APPROVE |
| `EXECUTION_PENDING` | `authorized` (just before token issue) | Approved; not yet dispatched |
| `EXECUTING` | `executing` | Token issued; dispatch in progress |
| `EXECUTED` | `executed` | Confirmed outcome |
| `FAILED` | `failed` | Execution failure confirmed |
| `PARTIAL` | (not currently emitted as a status) | Partial execution — **unresolved mapping** |
| `RECEIPTED` | `receipted` | Receipt and ledger entry created |
| `SETTLEMENT_PENDING` | (not currently emitted) | Post-receipt settlement — **unresolved mapping** |
| `SETTLED` | (not currently emitted) | Settlement confirmed — **unresolved mapping** |

### 3.3 Unresolved mappings

| Label | Status | Notes |
|---|---|---|
| `PARTIAL` | Not emitted by current gateway | Confirm logic path and who emits this |
| `SETTLEMENT_PENDING` | Not in current gateway | Requires settlement layer (outside current scope) |
| `SETTLED` | Not in current gateway | Requires settlement layer (outside current scope) |
| `EXECUTION_PENDING` | Implicit, not a distinct status | Currently `authorized` covers both approval and pre-dispatch |
| `AWAITING_APPROVAL` | Not distinct from `governed` | Current `governed` status does not distinguish "waiting for human" explicitly |

---

## 4. Mismatch with the Supplied FastAPI Spike

A FastAPI illustrative spike was circulated with three compressed endpoints. The following
records the required corrections.

### 4.1 Spike structure (illustrative only)

The spike proposed approximately:

```
POST /intake     — ingest and classify content
POST /evaluate   — evaluate and authorize in one step
POST /execute    — execute and return outcome
```

### 4.2 Required corrections

| # | Correction | Detail |
|---|---|---|
| 1 | **Typed content ingress is not authenticated intent ingestion.** | The `/intake` concept in the spike collapses `TypedContentEnvelope` (content plane) with `POST /api/v1/intents` (control plane). These are separate boundaries. Content arriving as `UNTRUSTED_DATA` must pass through the Typed Intake evaluation before it can become a ProposedAction, and must then be explicitly adopted before it becomes an authenticated intent. |
| 2 | **Authorization does not imply execution.** | In the spike, `evaluate` returned an authorization that appeared to enable immediate execution. In the RIO runtime, `governed` → `authorized` transition requires a human approval step (in the `REQUIRE_HUMAN` path). Authorization records that an approval decision was made; it does not dispatch the connector. |
| 3 | **Execution dispatch does not imply confirmed outcome.** | The spike treated execute as atomic. In the RIO runtime, `POST /api/v1/intents/:id/execute` issues a bound execution token and dispatches to the connector, but the outcome is separate and confirmed via `POST /api/v1/intents/:id/confirm`. |
| 4 | **Confirmed outcome does not automatically imply settlement.** | Receipt generation (`POST /api/v1/intents/:id/receipt`) creates cryptographic proof and a ledger entry. Settlement is a separate, future concern not implemented in the current gateway. |
| 5 | **Receipt creation must follow the actual evidence path.** | A receipt is generated from the actual execution record, confirmation, and authorization chain — not from the intake data alone. The spike implied that a receipt could be generated earlier in the lifecycle. |
| 6 | **A public facade may simplify presentation but may not collapse internal standings.** | The spike's three-endpoint design implies that `submitted` → `governed` → `authorized` → `executing` → `executed` → `receipted` can be collapsed into three states. A UIF facade may present a simplified view to callers but must not collapse these standings internally in the gateway. |
| 7 | **The supplied FastAPI code is an illustrative contract spike only.** | It does not represent existing runtime behavior. FastAPI is not a dependency of the RIO Gateway. No FastAPI service is proposed as a governing runtime. |
| 8 | **The existing Node/Express gateway is the implementation target.** | Any future facade work must be implemented against `gateway/` (Node.js/Express, running, `rio-system`). The gateway's OpenAPI spec at `GET /api/v1/docs` is the authoritative interface contract. |

---

## 5. Recommendation

### 5.1 First UIF release

The first UIF release should **reuse the existing six-stage API** rather than introducing
three compressed runtime endpoints:

```
POST /api/v1/intents                  — ingest
POST /api/v1/intents/:id/govern       — evaluate
POST /api/v1/intents/:id/authorize    — authorize
POST /api/v1/intents/:id/execute      — execute
POST /api/v1/intents/:id/confirm      — confirm
POST /api/v1/intents/:id/receipt      — receipt
```

This preserves all internal standing transitions, maintains the existing fail-closed
behavior, requires no gateway changes, and allows the facade to be a thin client or
proxy layer over the running API.

### 5.2 Simplified caller experience

A future client SDK or user interface may present a simpler three-step experience
(e.g. "Submit → Approve → Done") to end users. This simplification must live in the
client layer, not in the gateway. The underlying API must continue to traverse all
required internal standings.

The following status labels must be preserved in the internal pipeline regardless of
what the client surface exposes:

**Existing (running):**
- `submitted`
- `governed`
- `authorized`
- `blocked` / `denied`
- `executing`
- `executed` / `failed`
- `receipted`

**Proposed (normalized, pending adoption):**
- `PROPOSED` → `submitted`
- `EVALUATED` / `AWAITING_APPROVAL` → `governed`
- `AUTHORIZED` → `authorized`
- `EXECUTION_PENDING` → (sub-state of authorized)
- `EXECUTING` → `executing`
- `EXECUTED` → `executed`
- `FAILED` / `PARTIAL` → `failed` + unresolved PARTIAL path
- `RECEIPTED` → `receipted`
- `SETTLEMENT_PENDING` / `SETTLED` → not yet implemented

**Not stated as currently existing:** `PARTIAL`, `SETTLEMENT_PENDING`, `SETTLED`,
`EXECUTION_PENDING` (as a discrete status), `AWAITING_APPROVAL` (as distinct from
`governed`).

### 5.3 Typed Intake integration path

The Typed Intake layer must not be integrated directly into the existing gateway
`POST /api/v1/intents` handler without first:

1. Completing the adapter boundary specification (see
   `TYPED-INTAKE-RIO-ADAPTER-CANDIDATE-001_v0.1.md`).
2. Defining and implementing the explicit authenticated adoption step.
3. Extending TYPED-INTAKE-PROFILE-001 to cover the adapter boundary.
4. Receiving explicit authorization for runtime implementation work.

---

## 6. Unresolved Questions

The following questions were discovered during this reconciliation and must be resolved
before any UIF implementation work proceeds:

1. **Who produces `observed_attempt`?** The Typed Intake evaluator accepts
   `observed_attempt` as trusted harness input. In a live adapter, this must come
   from a verified model output boundary — not from the content itself. The component
   that produces and signs this boundary record is not yet specified.

2. **Where do Typed Intake denial records go?** Currently denial records are local and
   ephemeral. Should they be written to the RIO ledger? Through what authentication
   path? With what retention policy?

3. **What is the `PARTIAL` execution path?** The normalized vocabulary includes
   `PARTIAL` as a possible outcome, but the current gateway does not emit this status.
   The path that produces a partial outcome (one of N connector targets succeeded) is
   not defined.

4. **Does `EXECUTION_PENDING` require a distinct database status?** Currently
   `authorized` covers both "approval recorded" and "token about to be issued."
   If the execution window is long or retried, a distinct `EXECUTION_PENDING` status
   may be needed to prevent duplicate execution attempts.

5. **What does settlement mean for the current receipt layer?** The normalized
   vocabulary includes `SETTLEMENT_PENDING` and `SETTLED`, but neither the current
   gateway nor `rio-receipt-protocol` defines a settlement event. This must be
   specified before it can be included in a public API contract.

6. **Can SPG-M intake accept `TypedContentEnvelope` directly?** The SPG-M intake
   endpoint (`POST /spgm/intake`) currently accepts a different packet shape than
   the proposed `TypedContentEnvelope`. If these two intake paths are to converge,
   the schema alignment must be specified first.

7. **Who owns the UIF facade layer?** The facade might be a thin proxy route added
   to the existing gateway, a separate Express app on the same server, or a standalone
   service. The deployment topology must be decided before implementation.

---

## 7. Non-Claims

This document does not claim:

- Any of the unresolved questions above are currently answered.
- The existing gateway implements `PARTIAL`, `SETTLEMENT_PENDING`, or `SETTLED`.
- Typed Intake is integrated with the live gateway.
- The normalized vocabulary is adopted by the existing gateway.
- The FastAPI spike represents any existing runtime behavior.
- UIF is a production system.
