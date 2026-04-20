# RIO Identity and Roles Specification — Implementation-Ready

**Version:** 1.2 (Email Resolution Update)
**Date:** 2026-04-04
**Author:** Andrew (Solutions Architect)
**Status:** Final — v1.1 approved by Romney. v1.2 adds email-based principal resolution for the First Platform Slice.
**Supersedes:** `spec/IDENTITY_AND_ROLES_SPEC.md` v1.0 (Draft), `docs/IDENTITY_AND_ROLES_SPEC.md` v1.1
**Canonical Location:** `docs/IDENTITY_AND_ROLES_SPEC.md`
**Implementation Reference:** `gateway/security/principals.mjs`, `gateway/security/google-oauth.mjs` (Manny, Area 1 + First Platform Slice)

**v1.2 Change Summary:** Added Section 9.5 (Email-Based Principal Resolution) to unblock the First Platform Slice. The Gateway must resolve `X-Authenticated-Email` → `principal_id` → role. This is the bridge between Google OAuth and the principal registry. Manny has already implemented `resolvePrincipalByEmail()` in `gateway/security/principals.mjs` — this spec formalizes the contract.

---

## 1. Purpose

This document is the implementation-ready specification for the RIO identity model. It defines every actor type, role, key, enforcement rule, and schema that the Gateway must enforce. Manny uses this document as the contract for Gateway enforcement. Romney has reviewed it for receipt and ledger compatibility.

The constitutional invariant this specification enforces:

> **Separation of Roles: Intelligence cannot execute. Execution cannot approve. The Witness cannot modify what it records.** (Constitution, Invariant 7)

---

## 2. Actor Types

Every entity in the RIO system is classified as one of three actor types. An actor type is immutable after registration.

| Actor Type | Description | Authentication Method | Examples |
|---|---|---|---|
| `human` | A natural person with sovereign authority | OAuth + Ed25519 key pair | Brian (I-1) |
| `ai_agent` | An AI system that proposes actions | API key + agent identifier | Bondi, Manny, Andrew, Romney |
| `service` | An internal system component or runtime | Service account + shared secret or execution token | Gateway execution engine, ledger writer, receipt generator, Mantis (auditor) |

These three actor types cover all entities in the system. The previous draft listed six actor types (`human`, `ai_agent`, `service`, `executor`, `auditor`, `meta_governor`). This revision consolidates to three because `executor`, `auditor`, and `meta_governor` are **roles**, not actor types. An entity's actor type describes *what it is*; its role describes *what it may do*. The Gateway execution engine is a `service` with the role `executor`. Mantis is a `service` with the role `auditor`. Brian is a `human` with the role `root_authority`.

---

## 3. Roles (System Roles)

Roles define what an actor is permitted to do. Every principal has exactly one primary role. A principal may hold additional secondary roles only if the combination does not violate the separation of powers (Section 3.2).

### 3.1 Role Definitions

| Role | Layer | Capabilities | Prohibitions |
|---|---|---|---|
| `proposer` | Cognition | Submit intents, provide context, suggest actions, run governance evaluation | Cannot approve, cannot execute, cannot write to ledger, cannot read ledger |
| `approver` | Governance | Approve or deny intents, sign approvals with Ed25519 | Cannot execute |
| `executor` | Execution | Execute approved actions, consume execution tokens, confirm execution | Cannot approve, cannot propose, cannot modify ledger directly |
| `auditor` | Witness | Read all pipeline artifacts, verify receipts, verify chain, generate receipts, write ledger | Cannot approve, cannot execute, cannot propose |
| `meta_governor` | Meta-Governance | Propose policy changes, participate in quorum votes, manage signers, manage API keys, kill switch | Cannot execute actions |

There is one additional role that is not assignable through normal registration:

| Role | Layer | Capabilities | Prohibitions |
|---|---|---|---|
| `root_authority` | All (governance) | All governance capabilities implicitly (proposer, approver, auditor, meta_governor). Emergency stop. Constitutional authority. Manage signers. | **Cannot execute.** This is the critical separation — the sovereign human can authorize anything but must never be the entity that performs the action. |

### 3.2 Role Combination Rules

| Combination | Permitted? | Rationale |
|---|---|---|
| `proposer` + `approver` | Yes (human only) | Single-user case. Brian (I-1) may propose and approve. Logged as `self_approved` in receipt. |
| `proposer` + `executor` | **No** | Bypasses governance entirely. |
| `approver` + `executor` | **No** | Collapses governance-execution boundary. |
| `approver` + `auditor` | Yes | Different powers (governance vs. witness). |
| `approver` + `meta_governor` | Yes | Meta-governors are a superset of approvers for policy decisions. |
| `auditor` + any (except `executor`) | Yes | Observation does not conflict with governance roles. |
| `root_authority` + any (except `executor`) | Yes | Root authority is the human sovereign. May hold any governance role. Must never execute. |

### 3.3 Same-Action Enforcement Rules

These rules apply per-action, not per-principal:

1. **No principal may exercise more than one role in the same action.** If Brian (I-1) proposes an intent, he exercises the `proposer` role. When he approves it, he exercises the `approver` role. These are two separate pipeline stages with two separate identity bindings.
2. **The proposer cannot be the approver for the same intent** — unless the principal is `human` with `root_authority`, in which case self-approval is permitted and logged as `self_approved`.
3. **Execution requires a valid approval record.** The Gateway checks that an approval exists with status `approved`, a valid Ed25519 signature from a principal with the `approver` or `root_authority` role, before allowing execution.
4. **Policy changes require meta-governor quorum.** See Section 8.
5. **All actions must be signed by the acting principal.** Approvals require Ed25519 signature. Intent submissions require API key or OAuth session. Executions require execution token.

---

## 4. Identity Model (Principal Registry)

Each principal must have the following fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `principal_id` | VARCHAR(255) | Yes | Unique identifier. Format: human-readable slug (e.g., `I-1`, `bondi`, `gateway-exec`). |
| `actor_type` | ENUM | Yes | One of: `human`, `ai_agent`, `service`. |
| `display_name` | VARCHAR(255) | Yes | Human-readable name. |
| `email` | VARCHAR(320) | No | Contact email (humans only). |
| `primary_role` | ENUM | Yes | One of: `proposer`, `approver`, `executor`, `auditor`, `meta_governor`, `root_authority`. |
| `secondary_roles` | TEXT[] | No | Additional roles. Must not violate combination rules (Section 3.2). |
| `public_key_hex` | VARCHAR(64) | No | Active Ed25519 public key (32 bytes, lowercase hex). Required for `approver` and `root_authority`. |
| `key_version` | INTEGER | No | Current key version. Starts at 1. Incremented on rotation. |
| `key_status` | ENUM | No | One of: `active`, `rotated`, `revoked`, `none`. Default: `none` for principals without keys. |
| `delegation_from` | VARCHAR(255) | No | If this principal acts on behalf of another, the delegator's `principal_id`. |
| `scopes` | JSONB | No | Fine-grained permission scopes (e.g., allowed action types). |
| `metadata` | JSONB | No | Additional metadata (e.g., agent version, registration context). |
| `status` | ENUM | Yes | One of: `active`, `suspended`, `revoked`. Default: `active`. |
| `registered_by` | VARCHAR(255) | Yes | The `principal_id` of the entity that registered this principal. |
| `registered_at` | TIMESTAMPTZ | Yes | Registration timestamp. |
| `last_active_at` | TIMESTAMPTZ | No | Last activity timestamp. |

### 4.1 Principals Table Schema (PostgreSQL)

```sql
CREATE TABLE IF NOT EXISTS principals (
    id              SERIAL PRIMARY KEY,
    principal_id    VARCHAR(255) UNIQUE NOT NULL,
    actor_type      VARCHAR(50) NOT NULL,
    display_name    VARCHAR(255) NOT NULL,
    email           VARCHAR(320),
    primary_role    VARCHAR(50) NOT NULL,
    secondary_roles TEXT[] DEFAULT '{}',
    public_key_hex  VARCHAR(64),
    key_version     INTEGER DEFAULT 0,
    key_status      VARCHAR(20) DEFAULT 'none',
    delegation_from VARCHAR(255),
    scopes          JSONB DEFAULT '[]',
    metadata        JSONB DEFAULT '{}',
    registered_at   TIMESTAMPTZ DEFAULT NOW(),
    registered_by   VARCHAR(255) NOT NULL,
    last_active_at  TIMESTAMPTZ,
    status          VARCHAR(20) DEFAULT 'active',

    CONSTRAINT valid_actor_type CHECK (
        actor_type IN ('human', 'ai_agent', 'service')
    ),
    CONSTRAINT valid_primary_role CHECK (
        primary_role IN ('proposer', 'approver', 'executor', 'auditor', 'meta_governor', 'root_authority')
    ),
    CONSTRAINT valid_key_status CHECK (
        key_status IN ('active', 'rotated', 'revoked', 'none')
    ),
    CONSTRAINT valid_status CHECK (
        status IN ('active', 'suspended', 'revoked')
    )
);

CREATE INDEX IF NOT EXISTS idx_principals_actor_type ON principals(actor_type);
CREATE INDEX IF NOT EXISTS idx_principals_role ON principals(primary_role);
CREATE INDEX IF NOT EXISTS idx_principals_status ON principals(status);
```

### 4.2 Key History Table Schema

```sql
CREATE TABLE IF NOT EXISTS key_history (
    id                  SERIAL PRIMARY KEY,
    principal_id        VARCHAR(255) NOT NULL REFERENCES principals(principal_id),
    public_key_hex      VARCHAR(64) NOT NULL,
    key_version         INTEGER NOT NULL,
    status              VARCHAR(20) NOT NULL,
    activated_at        TIMESTAMPTZ NOT NULL,
    deactivated_at      TIMESTAMPTZ,
    deactivation_reason VARCHAR(50),
    ledger_entry_id     VARCHAR(255),

    CONSTRAINT valid_key_history_status CHECK (
        status IN ('active', 'rotated', 'revoked')
    )
);

CREATE INDEX IF NOT EXISTS idx_key_history_principal ON key_history(principal_id);
CREATE INDEX IF NOT EXISTS idx_key_history_pubkey ON key_history(public_key_hex);
CREATE INDEX IF NOT EXISTS idx_key_history_version ON key_history(principal_id, key_version);
```

### 4.3 Initial Principal Set

The system bootstraps with these principals on first boot. Additional principals require registration through the Gateway API by a `root_authority` or `meta_governor`.

| principal_id | actor_type | primary_role | secondary_roles | display_name |
|---|---|---|---|---|
| `I-1` | `human` | `root_authority` | `approver`, `meta_governor` | Brian Kent Rasmussen |
| `bondi` | `ai_agent` | `proposer` | — | Bondi (AI Chief of Staff) |
| `manny` | `ai_agent` | `proposer` | — | Manny (Builder) |
| `andrew` | `ai_agent` | `proposer` | — | Andrew (Solutions Architect) |
| `romney` | `ai_agent` | `proposer` | — | Romney (Protocol) |
| `gateway-exec` | `service` | `executor` | — | Gateway Execution Engine |
| `mantis` | `service` | `auditor` | — | Mantis (Witness) |
| `ledger-writer` | `service` | `auditor` | — | Ledger Writer Service |

---

## 5. Key Model (Ed25519)

### 5.1 Key Assignment

Keys are assigned **per principal, not per role**. A single principal has one active key pair at any time. If a principal holds multiple roles (e.g., `approver` + `meta_governor`), the same key pair is used for both.

| Actor Type | Key Generation | Private Key Storage | Public Key Storage |
|---|---|---|---|
| `human` | Generated in browser (ONE PWA) or offline tool | User's device only — never on server | `principals` table + `key_history` table |
| `ai_agent` | Generated by Gateway on agent registration | Gateway secure storage (env var or key vault) | `principals` table |
| `service` | Generated during service deployment | Service configuration (env var or key vault) | `principals` table |

### 5.2 Key Format

| Property | Value |
|---|---|
| Algorithm | Ed25519 (RFC 8032) |
| Public key size | 32 bytes (64 hex characters) |
| Private key size | 64 bytes (128 hex characters) |
| Signature size | 64 bytes (128 hex characters) |
| Encoding | Lowercase hexadecimal |
| Library | `tweetnacl` (Node.js), `PyNaCl` (Python) |

### 5.3 Key Rotation

Key rotation replaces a principal's active key pair with a new one. Old public keys are retained in `key_history` for receipt verification.

**Process:**

1. Principal generates a new Ed25519 key pair.
2. Principal signs a key rotation request with the **old** private key. The request contains the new public key.
3. Gateway verifies the rotation request signature against the old public key.
4. Gateway moves the old public key to `key_history` with status `rotated` and a `deactivated_at` timestamp.
5. Gateway registers the new public key as the active key. Increments `key_version`.
6. A `KEY_ROTATION` ledger entry is created with the old key hash, new key hash, and rotation signature.

**Quorum requirements for rotation:**

| Principal Type | Quorum Required |
|---|---|
| `ai_agent`, `service` | Self-rotation (sign with old key) |
| `approver` (human) | Self-rotation (sign with old key) |
| `root_authority` | Meta-Governance quorum (3-of-3) — this is an authority change |

### 5.4 Key Revocation

Key revocation permanently disables a principal's key. Revoked keys cannot be used for new approvals. Old receipts signed with revoked keys remain verifiable (the key is in `key_history` with status `revoked`).

| Principal Type | Revocation Authority |
|---|---|
| `ai_agent` | Any `root_authority` or 2-of-3 meta-governor quorum |
| `service` | Any `root_authority` or 2-of-3 meta-governor quorum |
| `approver` (human) | 2-of-3 meta-governor quorum |
| `root_authority` | 3-of-3 meta-governor quorum |
| Emergency (any key) | Any single `root_authority` — logged as emergency action |

---

## 6. Enforcement Rules

These are the rules the Gateway must enforce. Every rule is fail-closed: if the check cannot be performed, the request is denied.

### 6.1 API Boundary Enforcement

Every Gateway API endpoint declares which roles are permitted. The Gateway middleware resolves the caller's principal and checks the role before processing.

| Endpoint | Method | Required Role | Description |
|---|---|---|---|
| `/api/intents` | POST | `proposer`, `root_authority` | Submit a new intent |
| `/api/intents/:id` | GET | `proposer`, `approver`, `auditor`, `root_authority` | View intent details |
| `/api/approve` | POST | `approver`, `root_authority` | Approve an intent |
| `/api/deny` | POST | `approver`, `root_authority` | Deny an intent |
| `/api/approvals/:intent_id` | POST | `approver`, `root_authority` | Approve or deny (unified endpoint) |
| `/api/approvals/:intent_id` | GET | `proposer`, `approver`, `auditor`, `root_authority` | List approvals for an intent |
| `/api/execute` | POST | `executor` | Execute an approved intent |
| `/api/receipts/:id` | GET | Any authenticated principal | View a receipt |
| `/api/ledger` | GET | `auditor`, `root_authority` | View ledger entries |
| `/api/signers` | POST | `root_authority` | Register a new signer |
| `/api/signers` | DELETE | `root_authority`, `meta_governor` (quorum) | Revoke a signer |
| `/api/policy` | GET | Any authenticated principal | View current policy |
| `/api/policy` | PUT | `meta_governor` (quorum) | Update policy |
| `/api/system/mode` | POST | `meta_governor`, `root_authority` | Change system mode |
| `/api/system/kill` | POST | `root_authority` (any 1) | Emergency stop |

### 6.2 Fail-Closed Invariants

These invariants are proven by the 49 tests in `gateway/tests/principals.test.mjs`:

1. **Unknown principal → 403.** Unrecognized `X-Principal-ID` header is blocked.
2. **Suspended/revoked principal → 403.** Status must be `active`.
3. **Missing required role → 403.** The principal's primary or secondary roles must include the required role.
4. **No fallback to anonymous access.** Every request that passes middleware has `req.principal` set.
5. **root_authority implicit roles.** I-1 has implicit `proposer`, `approver`, `auditor`, `meta_governor` — but **NOT** `executor`.
6. **Proposer cannot authorize or execute.** Tested for `bondi` and `manny`.
7. **Executor cannot propose or authorize.** Tested for `gateway-exec`.
8. **Auditor cannot propose, authorize, or execute.** Tested for `mantis` and `ledger-writer`.

### 6.3 Cryptographic Enforcement

Approvals require an Ed25519 signature from a principal with the `approver` or `root_authority` role. The Gateway verifies:

1. The signature is valid against the signer's registered public key.
2. The signer's `principal_id` resolves to a principal with the `approver` or `root_authority` role.
3. The signer's status is `active`.
4. The signer's key status is `active`.

If any check fails, the approval is rejected with HTTP 403 and a specific reason code:

| Reason Code | Meaning |
|---|---|
| `INVALID_SIGNATURE` | Ed25519 signature verification failed |
| `ROLE_VIOLATION` | Signer does not hold the required role |
| `PRINCIPAL_SUSPENDED` | Signer's status is `suspended` |
| `PRINCIPAL_REVOKED` | Signer's status is `revoked` |
| `KEY_REVOKED` | Signer's key has been revoked |
| `UNKNOWN_PRINCIPAL` | `principal_id` not found in registry |

---

## 7. Identity Binding in Pipeline Artifacts

Every pipeline artifact includes identity fields that bind the action to the acting principal.

### 7.1 Binding Fields

| Field | Description | Example |
|---|---|---|
| `principal_id` | Unique identifier of the acting principal | `I-1`, `bondi`, `gateway-exec` |
| `actor_type` | Actor type of the principal | `human`, `ai_agent`, `service` |
| `role_exercised` | The specific role being exercised in this action | `approver`, `proposer`, `executor` |

### 7.2 Binding per Pipeline Stage

| Pipeline Stage | Principal | Role Exercised | Binding Proof |
|---|---|---|---|
| Intent submission | The proposing agent or human | `proposer` | API key or OAuth session |
| Risk assessment | The governance engine (service) | `auditor` | Service identity |
| Approval/Denial | The approving human | `approver` | Ed25519 signature |
| Execution | The execution engine | `executor` | Single-use execution token |
| Receipt generation | The receipt service | `auditor` | Service identity |
| Ledger write | The ledger writer service | `auditor` | Service identity |

### 7.3 Receipt Identity Binding (v2.3 — Per Romney Sign-Off)

The receipt `identity_binding` object carries the following fields. Fields marked **(new)** are additions approved by Romney for receipt spec v2.3. All new fields are OPTIONAL for backward compatibility with v2.1 receipts.

```json
{
  "identity_binding": {
    "signer_id": "I-1",
    "principal_id": "I-1",
    "actor_type": "human",
    "role_exercised": "approver",
    "public_key_hex": "a1b2c3d4...64chars",
    "signature_payload_hash": "sha256hex...64chars",
    "verification_method": "ed25519",
    "key_version": 1
  }
}
```

| Field | Status | Notes |
|---|---|---|
| `signer_id` | Existing (v2.1) | Direct mapping to `principal_id` |
| `principal_id` | Existing (v2.1) | Same as `signer_id` |
| `actor_type` | **New (v2.3)** | Informational metadata. Does not affect proof. |
| `role_exercised` | **New (v2.3)** | Informational metadata. Does not affect proof. |
| `public_key_hex` | Existing (v2.1) | The signing key |
| `signature_payload_hash` | Existing (v2.1) | The signed payload hash |
| `verification_method` | Existing (v2.1) | Always `ed25519` |
| `key_version` | **New (v2.3)** | Lookup hint for post-rotation verification. Not included in `authorization_hash` computation (per Romney, Question 2). |

### 7.4 Delegation in Receipts (Per Romney Sign-Off)

Delegated actions use the existing `governed_action` receipt type. No new receipt type is needed. The `identity_binding` includes an optional `delegation` sub-object:

```json
{
  "identity_binding": {
    "signer_id": "I-1",
    "principal_id": "I-1",
    "actor_type": "human",
    "role_exercised": "approver",
    "public_key_hex": "...",
    "signature_payload_hash": "...",
    "verification_method": "ed25519",
    "key_version": 1,
    "delegation": {
      "delegation_id": "uuid",
      "delegate_id": "bondi",
      "delegate_actor_type": "ai_agent",
      "scope": ["draft_email", "summarize_receipts"],
      "risk_ceiling": "LOW",
      "delegated_at": "ISO 8601",
      "expires_at": "ISO 8601"
    }
  }
}
```

The `delegation_id` is included in the `authorization_hash` computation when delegation exists (per Romney, Question 3).

---

## 8. Quorum Rules

Policy changes and authority-level actions require quorum approval from meta-governors.

| Action | Quorum Required | Rationale |
|---|---|---|
| Policy update | 2-of-3 meta-governor | Operational change |
| System mode change | 2-of-3 meta-governor or 1 root_authority | Operational control |
| Key rotation (root_authority) | 3-of-3 meta-governor | Constitutional change |
| Key revocation (root_authority) | 3-of-3 meta-governor | Constitutional change |
| Key revocation (agent/service) | 2-of-3 meta-governor or 1 root_authority | Operational |
| Emergency stop | 1 root_authority | Emergency override |
| Principal registration | 1 root_authority | Administrative |
| Principal suspension | 1 root_authority or 2-of-3 meta-governor | Administrative |

---

## 9. Authentication Flows

### 9.1 Human Authentication (Google OAuth)

The primary authentication flow for humans is Google OAuth via the Gateway. The ONE PWA is an untrusted client — it does not perform authentication. The Gateway handles the full OAuth flow and resolves the authenticated email to a principal.

```
Browser → ONE PWA → Gateway /auth/google → Google Consent Screen
                                                    ↓
                                          Google returns auth code
                                                    ↓
                          Gateway /auth/google/callback
                                    ↓
                          Exchange code for tokens
                                    ↓
                          Fetch Google profile (email, name)
                                    ↓
                          resolvePrincipalByEmail(email)
                                    ↓
                          principal found? → Issue JWT with principal_id + role
                          principal NOT found? → 403 ("No RIO principal registered")
                                    ↓
                          Redirect to ONE PWA with JWT token
                                    ↓
                          ONE stores token, includes in all Gateway API calls
```

The JWT issued by the Gateway contains:

| Claim | Value | Purpose |
|---|---|---|
| `sub` | `principal_id` (e.g., `I-1`) | Identity for `resolvePrincipal` middleware |
| `email` | Google email | Audit trail |
| `name` | Google display name | UI display |
| `principal_id` | Same as `sub` | Explicit binding |
| `role` | `primary_role` from principals table | Role for enforcement |
| `auth_method` | `google_oauth` | Authentication method audit |

### 9.2 Agent Authentication

```
AI Agent → API Key → Gateway → api_keys table → principal_id lookup → principals table
```

### 9.3 Service Authentication

```
Internal Service → Shared Secret / mTLS → Gateway → principals table
```

### 9.4 Principal Resolution Middleware

The Gateway `resolvePrincipal()` middleware runs on every request. It resolves identity from multiple credential sources in priority order:

1. **JWT `sub` claim** → Look up `principal_id` via `authBindings.jwt` map → principals table.
2. **API key `owner_id`** → Look up `principal_id` via `authBindings.api_key` map → principals table.
3. **`X-Principal-ID` header** → Direct lookup in principals table (service-to-service calls).
4. **`X-Authenticated-Email` header** → Look up via `resolvePrincipalByEmail()` (see Section 9.5).
5. Verify status is `active`. If not → 403.
6. Inject `req.principal` with the full principal record (id, actor_type, primary_role, secondary_roles, public_key_hex, key_version).
7. If no credential resolves to a principal → 403 (fail-closed).

### 9.5 Email-Based Principal Resolution (First Platform Slice)

This is the critical bridge for the First Platform Slice. Google OAuth gives the Gateway an email address. The Gateway must resolve that email to a `principal_id` with a role. Without this mapping, the intent flow cannot proceed.

**Resolution Algorithm (`resolvePrincipalByEmail`):**

```
Input: email (string, from Google OAuth profile)
Output: principal record or null

1. Normalize email to lowercase, trim whitespace.
2. Direct match: scan principals table for principal.email === normalized_email.
   → If found and status === 'active', return principal.
3. Metadata match: scan principals table for principal.metadata.emails[] containing normalized_email.
   → If found and status === 'active', return principal.
4. Alias match: check KNOWN_EMAIL_ALIASES map for hardcoded email → principal_id bindings.
   → If found and principal status === 'active', return principal.
5. No match → return null → Gateway returns 403 to user.
```

**The `email` field in the principals table:**

The `email` field (VARCHAR 320) already exists in the principals table schema (Section 4.1). For the First Platform Slice, the following principals must have their email field populated:

| principal_id | email | Purpose |
|---|---|---|
| `I-1` | `bkr1297@gmail.com` | Brian logs in via Google OAuth, creates intents, approves |
| (second human) | (second person's email) | Second approver for two-user test |

**Known Email Aliases (hardcoded fallback):**

Brian has multiple email addresses. All must resolve to `I-1`:

| Email | Principal |
|---|---|
| `bkr1297@gmail.com` | `I-1` |
| `riomethod5@gmail.com` | `I-1` |
| `rasmussenbr@hotmail.com` | `I-1` |

**Registering a Second Human Principal:**

For the two-user test (proposer ≠ approver), a second human principal must be registered. The Gateway provides `POST /principals` (requires `root_authority`). The registration payload:

```json
{
  "principal_id": "user-2",
  "actor_type": "human",
  "display_name": "Test Approver",
  "email": "second.person@gmail.com",
  "primary_role": "approver",
  "registered_by": "I-1"
}
```

Once registered, the second person can log in via Google OAuth, their email resolves to `user-2` with role `approver`, and they can approve intents submitted by `I-1`.

**End-to-End Flow (Login → Intent → Approval):**

```
1. Brian opens ONE PWA → clicks "Login with Google"
2. ONE redirects to Gateway /auth/google
3. Gateway redirects to Google consent screen
4. Brian authenticates with bkr1297@gmail.com
5. Google redirects to Gateway /auth/google/callback with auth code
6. Gateway exchanges code for tokens, fetches profile: email=bkr1297@gmail.com
7. Gateway calls resolvePrincipalByEmail("bkr1297@gmail.com")
8. Match found: principal I-1, role root_authority, status active
9. Gateway issues JWT: { sub: "I-1", role: "root_authority", email: "bkr1297@gmail.com" }
10. Gateway redirects to ONE PWA with token
11. ONE stores token in localStorage
12. Brian clicks "Create Intent" → ONE calls POST /intents with Authorization: Bearer <token>
13. Gateway resolvePrincipal middleware extracts JWT sub "I-1" → principal found
14. requireRole("proposer") → I-1 is root_authority → implicit proposer → PASS
15. Intent created with principal_id: "I-1", principal_role: "proposer"
16. Gateway calls POST /govern → policy engine evaluates → requires_approval
17. Intent appears in Approvals list
18. Person 2 logs in → same flow → resolves to "user-2" with role "approver"
19. Person 2 clicks Approve → POST /approvals/:intent_id
20. Gateway checks: approver (user-2) ≠ proposer (I-1) → PASS
21. Approval recorded → execution proceeds → receipt → ledger
```

**Implementation Status:**

Manny has already implemented `resolvePrincipalByEmail()` in `gateway/security/principals.mjs` (lines 522-565). The function covers all three resolution paths (direct email, metadata.emails, known aliases). The Google OAuth callback in `gateway/security/google-oauth.mjs` calls this function at step 4 of the callback handler.

**What remains for the First Platform Slice:**

1. Ensure Brian's email (`bkr1297@gmail.com`) is populated in the `I-1` principal record (already in INITIAL_PRINCIPALS seed).
2. Register a second human principal with their Google email.
3. Set Google OAuth environment variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `ONE_FRONTEND_URL`).
4. Set `VITE_GATEWAY_URL` in ONE PWA to point to the Gateway.

---

## 10. Ledger Compatibility

Ledger entries include `principal_id` and `role_exercised` fields (per Romney, Question 4). These are added directly to the `ledger_entries` table, not a separate view.

| Field | Type | Notes |
|---|---|---|
| `principal_id` | VARCHAR(255) NOT NULL | The principal who triggered this entry |
| `role_exercised` | VARCHAR(50) | Nullable for backward compatibility with pre-migration entries |
| `schema_version` | INTEGER | 1 for old entries, 2 for new entries. Verifier uses this to select hash computation formula. (Per Romney recommendation.) |

The `ledger_hash` computation for new entries (schema_version 2) includes `principal_id` and `role_exercised`. Old entries retain their original hash formula. The verifier is schema-version-aware.

---

## 11. Delegation Model

Delegation allows a human to grant limited authority to an AI agent.

### 11.1 Delegation Record

```json
{
  "delegation_id": "uuid",
  "delegator_id": "I-1",
  "delegate_id": "bondi",
  "scope": {
    "actions": ["draft_email", "summarize_receipts"],
    "risk_ceiling": "LOW",
    "expires_at": "2026-04-05T00:00:00Z"
  },
  "created_at": "2026-04-04T12:00:00Z",
  "signature": "ed25519hex...128chars"
}
```

### 11.2 Delegation Rules

1. Only a `human` or `root_authority` principal can create a delegation.
2. A delegation cannot grant capabilities the delegator does not hold.
3. A delegation cannot exceed `LOW` risk without explicit per-action approval.
4. Maximum delegation duration: 24 hours (configurable by policy).
5. A delegation can be revoked at any time by the delegator.
6. All delegated actions include `on_behalf_of` in the intent and `delegation_id` in the receipt.
7. The delegator's identity appears in the receipt as the ultimate authority.

---

## 12. Migration Path

### Phase 1 — Create Tables (Complete)
Create `principals` and `key_history` tables. Seed initial principals. Implemented in `gateway/security/principals.mjs`.

### Phase 2 — Dual-Write
Write to both old tables (`authorized_signers`, `api_keys`) and new `principals` table on every registration and update.

### Phase 3 — Read from Principals
Switch Gateway authentication and authorization middleware to read from `principals` table. Old tables become read-only backups.

### Phase 4 — Bind ONE PWA Users
Add registration flow in ONE PWA that binds OAuth user identity to a Gateway principal with Ed25519 key pair.

### Phase 5 — Enforce Roles
Enable role enforcement at API boundary. Requests without required role receive HTTP 403. Point of no return.

### Phase 6 — Deprecate Old Tables
Remove `authorized_signers` and `api_keys` tables. All identity flows through `principals`.

---

## 13. Implementation Status

| Component | Status | Reference |
|---|---|---|
| `principals` table creation | Done | `gateway/security/principals.mjs` |
| `key_history` table creation | Done | `gateway/security/principals.mjs` |
| Initial principal seeding | Done | 6 principals seeded (I-1, bondi, manny, gateway-exec, mantis, ledger-writer) |
| `resolvePrincipal()` middleware | Done | Global middleware in `gateway/server.mjs` |
| `requireRole()` middleware | Done | Applied to all pipeline and API routes |
| Role gating on pipeline routes | Done | `gateway/routes/index.mjs` |
| Role gating on API v1 routes | Done | `gateway/routes/api-v1.mjs` |
| Role gating on signer routes | Done | `gateway/routes/signers.mjs` |
| Kill switch role gating | Done | `gateway/routes/proxy.mjs` |
| Principal attribution on intents | Done | `gateway/governance/intents.mjs` |
| 49 enforcement tests | Done | `gateway/tests/principals.test.mjs` |
| Andrew and Romney principals | **Not yet seeded** | Need to add to INITIAL_PRINCIPALS |
| `resolvePrincipalByEmail()` | Done | `gateway/security/principals.mjs` (lines 522-565) |
| Google OAuth flow | Done | `gateway/security/google-oauth.mjs` |
| Google OAuth → principal resolution | Done | Callback calls `resolvePrincipalByEmail()` |
| JWT with principal_id + role | Done | `gateway/security/oauth.mjs` createToken Mode 2 |
| Approvals table | Done | `gateway/ledger/ledger-pg.mjs` |
| `POST /approvals/:intent_id` | Done | `gateway/routes/index.mjs` |
| Proposer ≠ approver enforcement | Done | `gateway/routes/index.mjs` |
| Ed25519 key binding for humans | Not yet | Phase 4 of migration |
| Delegation enforcement | Not yet | Requires delegation table and middleware |
| Quorum enforcement | Not yet | Requires quorum table and vote counting |
| `key_version` field | Not yet | Requires schema update |
| `schema_version` on ledger entries | Not yet | Per Romney recommendation |

---

## 14. Open Items

| Item | Owner | Status |
|---|---|---|
| Receipt spec bump to v2.3 (add `role_exercised`, `actor_type`, `key_version`) | Romney | Planned |
| Add `andrew` and `romney` to initial principal seed | Manny | Pending |
| Add `delegation_from` column to principals table | Manny | Pending |
| Add `key_version` column to principals table | Manny | Pending |
| Add `schema_version` to ledger entries | Manny | Pending |
| Implement delegation table and enforcement | Manny | Phase 2+ |
| Implement quorum table and vote counting | Manny | Phase 2+ |
| ONE PWA Ed25519 key generation and registration | Manny | Phase 4 |
| Register second human principal for two-user test | Brian (decision) | Blocking — need email address |
| Set Google OAuth env vars on deployed Gateway | Brian (decision) | Blocking — need Google Cloud project |
| Set `VITE_GATEWAY_URL` in ONE PWA | Manny | Pending |
| Verify end-to-end: Login → Intent → Approval → Execute → Receipt → Ledger | All | Definition of Done |
