# Mantis Component Definition

**Version:** 1.0
**Status:** Active
**Spec ID:** RIO-COMP-MANTIS-001
**Date:** 2026-03-31

---

## 1. Identity

**Name:** Mantis
**Type:** Governance Observer + Risk Assessor
**Role:** The Observer power within the Three-Power Separation architecture.
**Position:** First stage of the RIO governance pipeline — sits between intent sources and the Governor.

---

## 2. Purpose

Mantis is the observation layer of the RIO governance runtime. It receives raw intents from any source, normalizes them into the Intake Schema v1 format, attaches ingestion metadata, performs advisory risk classification, and forwards the structured intent envelope to the Governor for binding evaluation.

Mantis sees everything. Mantis decides nothing. Mantis acts on nothing.

---

## 3. Capabilities

| Capability | Description | Boundary |
|------------|-------------|----------|
| **Intent Reception** | Accept intents from any authenticated source (API, email, Service Bus, frontend, webhook) | Read-only access to raw input |
| **Format Normalization** | Transform heterogeneous input formats into canonical `IntentEnvelope` (Intake Schema v1) | Write to intents table only |
| **Metadata Attachment** | Add `ingestion_source`, `ingestion_timestamp`, `source_channel`, `request_id` to every intent | Append-only metadata fields |
| **Advisory Risk Classification** | Perform preliminary risk assessment based on action type, target, and historical patterns | Non-binding; Governor makes final determination |
| **Replay Prevention** | Validate `request_timestamp` and `request_nonce` to prevent duplicate submissions | Reject duplicates, log attempts |
| **Ledger Logging** | Append `submit` entry to the hash-chained ledger for every received intent | Append-only; cannot modify existing entries |

---

## 4. Constraints

Mantis operates under strict boundary constraints defined by the Three-Power Separation spec (`RIO-SPEC-TPS-001`):

| Constraint | Enforcement |
|------------|-------------|
| Cannot approve or deny intents | No access to governance decision functions |
| Cannot modify intent parameters after normalization | Intent is immutable once assigned an ID |
| Cannot access execution connectors | No imports from `execution/` modules |
| Cannot hold API keys or OAuth tokens | Keys stored only in Executor environment |
| Cannot override Governor verdicts | No access to governance state mutation |
| Cannot bypass replay prevention | Middleware runs before Mantis processing |

---

## 5. Interface Contract

### 5.1 Input (Raw Intent)

Mantis accepts intents in multiple formats and normalizes them:

**Direct API (POST /intent):**
```json
{
  "action": "send_email",
  "agent_id": "manus",
  "parameters": {
    "to": "recipient@example.com",
    "subject": "Test",
    "body": "Hello"
  },
  "confidence": 95,
  "target_environment": "production",
  "request_timestamp": "2026-03-31T20:00:00.000Z",
  "request_nonce": "uuid-v4"
}
```

**Email Intent (via Service Bus):**
```json
{
  "intent": "send_sms",
  "parameters": {
    "to": "+18015551234",
    "message": "Test governed action"
  },
  "risk_level": "low",
  "requires_approval": false,
  "requested_by": "Brian",
  "timestamp": "2026-03-31T20:00:00.000Z"
}
```

### 5.2 Output (IntentEnvelope)

After normalization, Mantis produces:

```json
{
  "intent_id": "uuid-v4",
  "action": "send_email",
  "agent_id": "manus",
  "parameters": { ... },
  "confidence": 95,
  "target_environment": "production",
  "identity": {
    "subject": "brian.k.rasmussen",
    "method": "jwt"
  },
  "ingestion": {
    "source": "api",
    "channel": "POST /intent",
    "timestamp": "2026-03-31T20:00:00.000Z",
    "request_id": "uuid-v4"
  },
  "status": "submitted",
  "hash": "sha256-of-intent-payload"
}
```

### 5.3 Ledger Entry

Every intent submission produces a ledger entry:

```json
{
  "entry_id": 1,
  "intent_id": "uuid-v4",
  "action": "submit",
  "hash": "sha256-of-entry",
  "prev_hash": "sha256-of-previous-entry",
  "timestamp": "2026-03-31T20:00:00.000Z",
  "data": {
    "agent_id": "manus",
    "action_type": "send_email",
    "target": "production",
    "ingestion_source": "api"
  }
}
```

---

## 6. Implementation Mapping

| Component | File | Function |
|-----------|------|----------|
| Intake normalization | `gateway/governance/intake.mjs` | `normalizeLegacy()`, `normalizeV1()` |
| Intent storage | `gateway/governance/intents.mjs` | `createIntent()`, `getIntent()`, `updateIntent()` |
| Replay prevention | `gateway/security/replay-prevention.mjs` | `replayPreventionMiddleware()` |
| Ledger append | `gateway/ledger/ledger-pg.mjs` | `appendEntry()` |
| Route handler | `gateway/routes/index.mjs` | `POST /intent` |
| Public API handler | `gateway/routes/api-v1.mjs` | `POST /api/v1/intents` |

---

## 7. Ingestion Sources

Mantis is designed to accept intents from any authenticated channel. Each source is recorded in the `ingestion.source` field of the IntentEnvelope.

| Source | Channel | Status | Implementation |
|--------|---------|--------|----------------|
| Direct API | `POST /intent` | Active | `routes/index.mjs` |
| Public API v1 | `POST /api/v1/intents` | Active | `routes/api-v1.mjs` |
| Onboarding | `POST /api/onboard` | Active | `routes/proxy.mjs` |
| Email | Outlook → Power Automate → Service Bus | In Progress | Manny's pipeline |
| SMS | Twilio webhook | Planned | Damon's connector |
| Webhook | `POST /api/v1/webhook` | Planned | Future |
| Voice | Speech-to-text → intent | Planned | Future |

---

## 8. Monitoring

Mantis contributes to the following health indicators:

| Metric | Source | Meaning |
|--------|--------|---------|
| `intents.total` | `GET /api/sync` | Total intents received |
| `intents.by_status` | `GET /api/sync` | Breakdown by pipeline stage |
| `ledger.total_entries` | `GET /api/sync` | Total ledger entries (includes Mantis submissions) |
| `replay_prevention.active` | `GET /health` | Whether replay prevention is enforcing |

---

## 9. Relationship to Other Components

```
                    ┌─────────────┐
  Intent Sources ──►│   MANTIS    │──► Governor ──► Executor ──► Ledger
  (API, Email,      │ (Observer)  │
   SMS, Webhook)    └─────────────┘
                          │
                          ▼
                    Ledger (submit entry)
```

Mantis feeds the Governor. The Governor feeds the Executor. The Executor feeds the Ledger. No component can reach backward in this chain. The separation is structural, not advisory.
