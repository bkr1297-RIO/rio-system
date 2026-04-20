# Enterprise Roadmap — Pilot Readiness Features

> Last updated: 2026-04-04

This document tracks enterprise features required before external pilot deployments.

---

## Implemented (v2.2.0)

### 1. Intent Expiration (TTL)

**Status: DONE**

Every intent now carries an optional `expiresAt` timestamp (UTC milliseconds). When a human attempts to approve an intent past its TTL, the system:

1. Marks the intent as `EXPIRED`
2. Rejects the approval with a clear error message
3. Logs the expiration to the ledger

A background sweep (`proxy.expireStale`) can be called to batch-expire all stale intents. The default TTL is configurable per policy rule.

**Files changed:** `drizzle/schema.ts`, `server/db.ts`, `server/routers.ts`

---

### 2. Versioned Receipt Schema

**Status: DONE**

All receipts now include a `protocolVersion` field (semver string, currently `2.2.0`). This enables:

- Forward-compatible receipt parsing by external verifiers
- Schema evolution tracking across protocol upgrades
- Clear contract for SDK consumers

**Files changed:** `server/connectors.ts` (PROTOCOL_VERSION constant + receipt generation)

---

### 3. Batch Approval / Rejection

**Status: DONE**

The `proxy.batchApprove` procedure accepts up to 50 intent IDs and processes them atomically:

- Each intent is validated (ownership, status = PENDING_APPROVAL)
- Each approval is logged individually to the ledger with `batchOperation: true`
- Already-processed intents are skipped (idempotent)

The ONE PWA Approvals page now has a "Batch Mode" toggle with select-all, approve-all, and reject-all controls.

**Files changed:** `server/db.ts`, `server/routers.ts`, `client/src/pages/Approvals.tsx`

---

### 4. Approval SLA Dashboard

**Status: DONE**

The Dashboard now displays an "APPROVAL SLA" card with six metrics:

| Metric | Description |
|---|---|
| Queue Size | Number of intents currently PENDING_APPROVAL |
| Avg Time to Approve | Mean time from intent creation to approval decision |
| Oldest Pending | Age of the longest-waiting intent in the queue |
| Approved | Total approved intents (lifetime) |
| Rejected | Total rejected intents (lifetime) |
| Expired | Total expired intents (lifetime) |

**Files changed:** `server/db.ts`, `server/routers.ts`, `client/src/pages/Dashboard.tsx`

---

## Planned (Pre-Pilot)

### 5. MFA / Hardware Key Requirement for Signing Approvals

**Status: PLANNED — Architecture defined, implementation deferred to pilot onboarding**

**Design:**

The ONE PWA already uses Ed25519 keypairs for cryptographic approval signing. The MFA upgrade path is:

1. **WebAuthn / FIDO2 integration** — Replace or augment the browser-generated Ed25519 key with a hardware-backed key (YubiKey, Titan, platform authenticator). The `navigator.credentials.create()` API generates a keypair where the private key never leaves the hardware token.

2. **Approval signing flow change:**
   - Current: `signData(privateKey, approvalPayload)` using browser-stored Ed25519 key
   - Future: `navigator.credentials.get()` → hardware token signs the approval payload directly
   - The signature is bound to the approval's `argsHash`, preventing replay

3. **Server-side verification:**
   - Store the WebAuthn credential ID and public key during signer registration
   - On approval, verify the WebAuthn assertion signature against the stored public key
   - Reject approvals that lack a valid hardware-backed signature

4. **Fallback:** Software-only Ed25519 signing remains available for development/testing environments. Production deployments can enforce hardware-only via a policy rule (`requireHardwareKey: true`).

**Implementation estimate:** 2-3 days. Requires `@simplewebauthn/server` + `@simplewebauthn/browser` packages.

**Files to change:** `client/src/lib/crypto.ts`, `client/src/pages/SignerManagement.tsx`, `server/routers.ts` (signer registration + approval verification), `drizzle/schema.ts` (WebAuthn credential storage)

---

### 6. Log Redaction / PII Scrubbing in Mantis

**Status: PLANNED — Architecture defined, implementation deferred to pilot onboarding**

**Design:**

Mantis (the governance observation layer) records all reasoning traces, tool arguments, and execution results. For enterprise deployments handling PII (email addresses, phone numbers, names, financial data), the following redaction strategy applies:

1. **Redaction at write time** — Before any data is written to the ledger or stored in execution results, a redaction pass strips or masks PII fields:
   - Email addresses → `***@domain.com`
   - Phone numbers → `***-***-1234`
   - Names → `[REDACTED]` (configurable per field)
   - Custom patterns via regex rules in the policy engine

2. **Redaction rules as policy** — Each deployment defines a `redactionPolicy` in the governance seed:
   ```json
   {
     "redactionPolicy": {
       "enabled": true,
       "fields": {
         "to": "email",
         "phone": "phone",
         "body": "freetext"
       },
       "freetextPatterns": [
         { "pattern": "\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b", "replacement": "[EMAIL]" },
         { "pattern": "\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b", "replacement": "[PHONE]" }
       ]
     }
   }
   ```

3. **Unredacted access** — The original unredacted data is stored in a separate encrypted column accessible only via a compliance key. This supports audit requirements while protecting day-to-day access.

4. **Scope:** Redaction applies to:
   - Ledger entry payloads (intent args, execution results)
   - Mantis reasoning traces (agent provenance, LLM outputs)
   - Notification content (Telegram, in-app)
   - Receipt payloads (the `result` field)

**Implementation estimate:** 3-4 days. Requires a redaction middleware in `server/db.ts` (before `appendLedger`) and a policy schema extension.

**Files to change:** `server/db.ts` (redaction middleware), `shared/redaction.ts` (new module), `drizzle/schema.ts` (encrypted unredacted column), policy engine extension

---

### 7. Full Docker Compose (ONE + RIO + Gateway + Mantis)

**Status: PARTIAL — Gateway + PostgreSQL compose exists. ONE PWA deployment pending.**

The current `docker-compose.yml` starts the Gateway server and PostgreSQL. The full production compose will add:

- ONE PWA (static build served via nginx or embedded in Gateway)
- Mantis observation service (if separated from Gateway)
- Redis for session/queue management (optional)
- Nginx reverse proxy with TLS termination

---

## Feature Matrix

| Feature | Status | Priority | Effort |
|---|---|---|---|
| Intent TTL / Expiration | Done | P0 | — |
| Versioned Receipt Schema | Done | P0 | — |
| Batch Approval | Done | P0 | — |
| Approval SLA Dashboard | Done | P1 | — |
| MFA / Hardware Key | Planned | P1 | 2-3 days |
| PII Redaction | Planned | P1 | 3-4 days |
| Full Docker Compose | Partial | P2 | 1-2 days |
