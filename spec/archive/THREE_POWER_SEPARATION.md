# Three-Power Separation Specification

**Version:** 1.0
**Status:** Active
**Author:** Romney (RIO Engineering)
**Date:** 2026-03-31
**Spec ID:** RIO-SPEC-TPS-001

---

## 1. Purpose

This document defines the structural separation of powers within the RIO governance runtime. The architecture enforces that no single component can both decide and act. Three distinct powers — **Observation**, **Governance**, and **Execution** — operate in isolation with defined boundaries, explicit handoff contracts, and cryptographic proof at every transition.

This is not a design pattern. It is a structural invariant. If any component crosses its boundary, the system is in violation and must fail closed.

---

## 2. The Three Powers

### 2.1 Observer (Power of Perception)

**Responsibility:** Receive, normalize, and classify incoming intents. The Observer sees everything but decides nothing.

**Boundary:** The Observer may read intent data, attach metadata (timestamps, source identifiers, risk classification hints), and forward normalized intents to the Governor. The Observer **must not** approve, deny, modify, or execute any intent.

| Capability | Permitted | Prohibited |
|------------|-----------|------------|
| Receive raw intents from any source | Yes | — |
| Normalize intent format (Intake Schema v1) | Yes | — |
| Attach ingestion metadata (source, timestamp) | Yes | — |
| Classify risk level (advisory, non-binding) | Yes | — |
| Forward to Governor queue | Yes | — |
| Approve or deny intents | — | Yes |
| Modify intent parameters | — | Yes |
| Access execution connectors | — | Yes |
| Hold API keys or OAuth tokens | — | Yes |

**Input contract:** Raw intent from any source (email, API, frontend, Service Bus).
**Output contract:** Normalized `IntentEnvelope` forwarded to the governance queue.

**Ingestion sources:**
- `POST /intent` — Direct API submission
- `POST /api/v1/intents` — Public API v1 submission
- `POST /api/onboard` — Onboarding welcome intent
- Email → Power Automate → Service Bus → Observer (Manny's pipeline)
- Future: Webhook, SMS, voice

### 2.2 Governor (Power of Decision)

**Responsibility:** Evaluate intents against the active policy set and issue binding verdicts. The Governor decides but never acts.

**Boundary:** The Governor may read the normalized intent, evaluate it against the constitution, policy, and role definitions, and produce a governance decision. The Governor **must not** execute actions, access external APIs, or modify the intent after evaluation.

| Capability | Permitted | Prohibited |
|------------|-----------|------------|
| Read normalized intent | Yes | — |
| Evaluate against RIO_CONSTITUTION.json | Yes | — |
| Evaluate against RIO_POLICY.json | Yes | — |
| Evaluate against role definitions | Yes | — |
| Classify risk level (binding) | Yes | — |
| Issue verdict: AUTO_APPROVE, REQUIRE_HUMAN, AUTO_DENY | Yes | — |
| Record governance decision hash in ledger | Yes | — |
| Execute actions | — | Yes |
| Access OAuth tokens or API keys | — | Yes |
| Modify intent parameters | — | Yes |
| Override human denial | — | Yes |

**Input contract:** `IntentEnvelope` from Observer.
**Output contract:** `GovernanceDecision` containing verdict, risk level, policy violations, confidence score, and decision hash.

**Verdicts:**

| Verdict | Meaning | Next Step |
|---------|---------|-----------|
| `AUTO_APPROVE` | Intent is within pre-authorized boundaries | Proceed to Execution |
| `REQUIRE_HUMAN` | Intent exceeds autonomous thresholds | Block until human authority issues signed approval |
| `AUTO_DENY` | Intent violates hard policy constraint | Permanently blocked, logged in ledger |

**Policy checks (evaluated in order):**
1. Constitution compliance (hard constraints)
2. Agent recognition (is the agent in scope?)
3. Environment validation (is the target environment permitted?)
4. Action classification (restricted, external_effect, irreversible)
5. Confidence threshold (agent confidence >= policy minimum)
6. Risk aggregation (combine all signals into final risk level)

### 2.3 Executor (Power of Action)

**Responsibility:** Carry out approved actions through external connectors. The Executor acts but never decides.

**Boundary:** The Executor may receive a signed, approved intent and dispatch it to the appropriate connector (Gmail, Twilio, GitHub, etc.). The Executor **must not** evaluate policy, approve intents, or act without a valid authorization record.

| Capability | Permitted | Prohibited |
|------------|-----------|------------|
| Receive authorized intent with valid approval | Yes | — |
| Verify Ed25519 signature on approval | Yes | — |
| Verify execution token is valid and unburned | Yes | — |
| Dispatch action to external connector | Yes | — |
| Record execution hash in ledger | Yes | — |
| Generate cryptographic receipt | Yes | — |
| Evaluate policy | — | Yes |
| Approve or deny intents | — | Yes |
| Execute without valid authorization | — | Yes |
| Re-use burned execution tokens | — | Yes |
| Modify intent parameters during execution | — | Yes |

**Input contract:** `AuthorizedIntent` with valid Ed25519 signature, unburned execution token, matching intent ID.
**Output contract:** `ExecutionResult` with connector response, execution hash, and receipt.

**Pre-execution checks (all must pass):**
1. Intent status is `authorized`
2. Execution token exists and has not been burned
3. Token matches the intent ID
4. Ed25519 signature on authorization is valid (when mode = required)
5. Signer public key is registered and not revoked

---

## 3. Boundary Enforcement

### 3.1 Structural Isolation

Each power is implemented as a separate module with no shared mutable state:

| Power | Module(s) | Data Access |
|-------|-----------|-------------|
| Observer | `governance/intake.mjs` | Write: intents table. Read: none. |
| Governor | `governance/policy.mjs`, `governance/config.mjs` | Read: intents, constitution, policy, roles. Write: governance decision on intent. |
| Executor | `execution/gmail-executor.mjs`, `routes/index.mjs` (execute routes) | Read: intents (authorized only), execution tokens. Write: execution result, receipt, ledger entry. |

### 3.2 Handoff Contracts

Every transition between powers produces a cryptographic hash that is recorded in the ledger. The hash chain proves the sequence of events is tamper-evident.

```
Observer                    Governor                    Executor
   │                           │                           │
   ├── IntentEnvelope ────────►│                           │
   │   [intent_hash]           │                           │
   │                           ├── GovernanceDecision ────►│
   │                           │   [governance_hash]       │
   │                           │                           ├── ExecutionResult
   │                           │                           │   [execution_hash]
   │                           │                           │
   │                           │                           ├── Receipt
   │                           │                           │   [receipt_hash]
   │                           │                           │
   ▼                           ▼                           ▼
                        LEDGER (append-only, hash-chained)
```

### 3.3 Hash Chain Integrity

Each ledger entry contains:

| Field | Description |
|-------|-------------|
| `entry_id` | Auto-incrementing integer |
| `intent_id` | UUID of the associated intent |
| `action` | Pipeline stage (submit, govern, authorize, execute, receipt, kill) |
| `hash` | SHA-256 of the entry payload |
| `prev_hash` | SHA-256 hash of the previous entry (genesis = "0000...0000") |
| `timestamp` | ISO-8601 timestamp |
| `data` | JSONB payload specific to the action |

**Verification:** `GET /verify` walks the entire chain and confirms every entry's `prev_hash` matches the preceding entry's `hash`. If any link is broken, the chain is invalid and the system reports the break point.

---

## 4. Fail-Closed Invariants

The system defaults to denial. These invariants are structural — they cannot be overridden by configuration, policy, or user action.

| Invariant | Enforcement |
|-----------|-------------|
| No execution without authorization | Executor checks intent status = `authorized` before dispatching |
| No authorization without governance | Authorize route checks intent status = `governed` before accepting approval |
| No governance without observation | Govern route checks intent exists and status = `submitted` |
| Single-use execution tokens | Token is burned immediately on use; re-use returns 409 |
| Ed25519 signature required (when mode = required) | Unsigned authorization returns 400 |
| Human final authority | `REQUIRE_HUMAN` verdict blocks until signed human approval |
| Kill switch overrides all | `POST /api/kill` burns all tokens and pauses the proxy immediately |

---

## 5. Identity Binding

Every authorization is cryptographically bound to a specific human identity through Ed25519 signatures.

### 5.1 Signer Lifecycle

```
Generate Keypair → Register Public Key → Sign Authorizations → [Revoke if compromised]
```

| Stage | Endpoint | What Happens |
|-------|----------|--------------|
| Generate | `POST /api/signers/generate-keypair` | Server generates Ed25519 keypair, returns secret key ONCE, stores only public key |
| Register | `POST /api/signers/register` | Accept externally-generated public key, bind to signer_id |
| Authorize | `POST /authorize` | Verify signature against registered public key |
| Revoke | `DELETE /api/signers/:signer_id` | Mark signer as revoked, reject future signatures |

### 5.2 Signature Payload (Canonical JSON)

The signed payload for authorization is a deterministic JSON string:

```json
{
  "intent_id": "<uuid>",
  "action": "<action_type>",
  "decision": "approved",
  "signer_id": "<signer_id>",
  "timestamp": "<ISO-8601>"
}
```

Keys are sorted alphabetically. The signature is computed over the UTF-8 bytes of this string using Ed25519.

### 5.3 Receipt Identity Binding

Every receipt includes an `identity_binding` block:

```json
{
  "identity_binding": {
    "signer_id": "brian-sovereign",
    "public_key": "721b260779...",
    "signature_payload_hash": "a3f8c1...",
    "verification_method": "Ed25519"
  }
}
```

This proves which human authorized the action, with what key, and that the signature was verified at execution time.

---

## 6. Kill Switch

The kill switch is the architectural override. It exists outside the normal pipeline and can halt all activity immediately.

**Endpoint:** `POST /api/kill`
**Auth:** JWT + Ed25519 signature (dual-factor)
**Latency requirement:** < 1 second

**Actions on activation:**
1. Burn ALL active execution tokens for the user
2. Set proxy user status to `PAUSED`
3. Log immutable `KILL_PROXY` receipt in ledger with full hash chain
4. Return confirmation with receipt ID

**Signature payload:**
```json
{
  "action": "KILL_PROXY",
  "signer_id": "<signer_id>",
  "user_id": "<user_id>",
  "timestamp": "<ISO-8601>"
}
```

The kill switch cannot be disabled by policy, configuration, or any agent. It is always reachable from any authenticated context.

---

## 7. Separation Matrix

This matrix defines which power can access which system resource. Any violation is a structural breach.

| Resource | Observer | Governor | Executor |
|----------|----------|----------|----------|
| Raw intent data | Read | — | — |
| Normalized intent | Write | Read | Read (authorized only) |
| Constitution | — | Read | — |
| Policy | — | Read | — |
| Role definitions | — | Read | — |
| Governance decisions | — | Write | Read |
| Execution tokens | — | — | Read/Burn |
| External API keys | — | — | Read |
| OAuth tokens | — | — | Read |
| Connectors (Gmail, Twilio, etc.) | — | — | Execute |
| Ledger | Append | Append | Append |
| Receipts | — | — | Generate |
| Kill switch | — | — | Execute |
| Signer registry | — | — | Read (verify) |

---

## 8. Compliance Verification

To verify the Three-Power Separation is intact:

1. **Code audit:** Confirm no module in `governance/` imports from `execution/`. Confirm no module in `execution/` imports from `governance/policy.mjs` or `governance/config.mjs`.
2. **Runtime check:** `GET /health` reports all three powers as loaded and isolated.
3. **Ledger check:** `GET /verify` confirms the hash chain is unbroken, proving every transition was recorded.
4. **Penetration test:** Submit an intent and attempt to execute it without governance. The system must return 409 (wrong status).
5. **Kill switch test:** Activate kill switch and verify all tokens are burned and proxy is paused within 1 second.

---

## 9. Future Extensions

| Extension | Power Affected | Description |
|-----------|---------------|-------------|
| Multi-agent governance | Governor | Multiple agents vote on high-risk intents |
| Automated escalation | Governor | Time-based escalation if human doesn't respond |
| Connector plugins | Executor | Add new execution targets without modifying governance |
| Ingestion adapters | Observer | Add new intent sources (voice, webhook, IoT) |
| Cross-chain verification | All | External auditor verifies ledger independently |

---

## 10. References

- `spec/core-spec-v1.json` — Core protocol specification
- `spec/Receipt_Specification_v2.json` — Receipt format specification
- `spec/INTAKE_SPEC.md` — Intake schema specification
- `spec/policy-v1.0.json` — Policy schema
- `docs/RIO_White_Paper_Formal.md` — Formal white paper
- `gateway/config/rio/RIO_CONSTITUTION.json` — Active constitution
- `gateway/config/rio/RIO_POLICY.json` — Active governance policy (v1.1)
