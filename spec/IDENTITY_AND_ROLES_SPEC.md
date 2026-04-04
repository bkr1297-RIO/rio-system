# RIO Identity and Roles Specification

**Version:** 1.0
**Date:** 2026-04-04
**Authority Level:** High — defines the unified identity model for the platform
**Origin:** Andrew (Solutions Architect / Manus), based on existing Gateway, ONE PWA, and Policy implementations
**Status:** Draft — Requires Romney review for receipt/ledger compatibility
**Supersedes:** Informal identity patterns in `gateway/security/identity-binding.mjs`, `gateway/security/api-keys.mjs`, and `drizzle/schema.ts`

---

## 1. Purpose

This document defines the unified identity model for the RIO governed execution system. It specifies the actor types, the role model, the key model, the identity binding mechanism, and the cryptographic enforcement of role separation. Every entity that interacts with the system — whether human, AI agent, service, or system component — must have a well-defined identity with explicit capabilities and prohibitions.

The constitutional invariant this specification enforces:

> **Separation of Roles: Intelligence cannot execute. Execution cannot approve. The Witness cannot modify what it records.** (Constitution, Invariant 7)

This specification unifies the three identity layers that currently exist independently (Gateway API keys, ONE PWA OAuth users, and Policy JSON owner identity) into a single principal model that is consistent across all system components.

---

## 2. Actor Types

Every entity in the RIO system is classified as one of six actor types. An actor type defines what category of entity the principal is. Actor types are immutable after registration — an agent cannot become a human, and a service cannot become an executor.

| Actor Type | Description | Authentication Method | Example |
|---|---|---|---|
| `human` | A natural person with sovereign authority | OAuth + Ed25519 key pair | Brian (I-1), future team members |
| `ai_agent` | An AI system that proposes actions | API key + agent identifier | Bondi (Scribe), Manny (Builder) |
| `service` | An internal system component | Service account + shared secret | Ledger writer, receipt generator |
| `executor` | A runtime that performs approved actions | Execution token (single-use) | Gateway execution engine |
| `auditor` | An observation component that records but cannot act | Read-only API key | Mantis (Witness) |
| `meta_governor` | A component or human with authority over system rules | OAuth + Ed25519 + quorum membership | Meta-Governance authority set |

Actor types map directly to the Five Layers defined in the Constitution:

| Layer | Permitted Actor Types |
|---|---|
| Cognition | `ai_agent` |
| Governance | `human`, `meta_governor` |
| Execution | `executor` |
| Witness | `auditor`, `service` |
| Meta-Governance | `meta_governor`, `human` |

---

## 3. Role Model

Roles define what an actor is permitted to do within the system. A role is a set of capabilities and prohibitions. Every principal must have exactly one primary role. A principal may hold additional secondary roles only if the role combination does not violate the separation of powers.

### 3.1 Primary Roles

| Role | Layer | Capabilities | Prohibitions |
|---|---|---|---|
| `proposer` | Cognition | Submit intents, provide context, suggest actions | Cannot approve, cannot execute, cannot write to ledger |
| `approver` | Governance | Approve or deny intents, sign approvals with Ed25519 | Cannot execute, cannot propose (unless also a proposer — see 3.2) |
| `executor` | Execution | Execute approved actions, consume execution tokens | Cannot approve, cannot propose, cannot modify ledger |
| `auditor` | Witness | Read all pipeline artifacts, verify receipts, verify chain | Cannot approve, cannot execute, cannot propose |
| `meta_governor` | Meta-Governance | Propose policy changes, participate in quorum votes | Cannot execute actions, cannot bypass governance |
| `root_authority` | All (governance) | All governance capabilities, emergency stop, constitutional authority | Cannot execute actions directly (must go through executor) |

### 3.2 Role Combination Rules

The following table defines which role combinations are permitted and which are prohibited. The principle is that no single principal may hold both the authority to approve and the authority to execute.

| Combination | Permitted | Rationale |
|---|---|---|
| `proposer` + `approver` | Yes (human only) | A human may propose and approve their own actions. This is the single-user case (Brian as I-1). Self-approval is logged as `self_approved` in the receipt. |
| `proposer` + `executor` | **No** | An entity that proposes and executes can bypass governance entirely. |
| `approver` + `executor` | **No** | An entity that approves and executes collapses the governance-execution boundary. |
| `approver` + `auditor` | Yes | An auditor may also approve, because approval is a governance function and audit is a witness function. These are different powers. |
| `approver` + `meta_governor` | Yes | Meta-governors are a superset of approvers for policy-level decisions. |
| `auditor` + any other | Yes (except `executor`) | Auditors observe. Observation does not conflict with governance roles. |
| `root_authority` + any | Yes (except `executor`) | Root authority is the human sovereign. The root authority may hold any governance role but must never directly execute. |

### 3.3 Role Enforcement

Roles are enforced at two boundaries:

**API boundary:** Every API request includes a principal identifier. The Gateway resolves the principal to its registered roles and rejects any request that requires a capability the principal does not hold. For example, an `ai_agent` with role `proposer` that attempts to call `POST /api/approve` receives HTTP 403 with reason `ROLE_VIOLATION: proposer cannot approve`.

**Cryptographic boundary:** Approvals require an Ed25519 signature from a principal with the `approver` role. The Gateway verifies both the signature validity and the signer's role before accepting the approval. An agent with a valid Ed25519 key but the `proposer` role cannot produce a valid approval.

---

## 4. Key Model

Every principal that participates in cryptographic operations (approval signing, identity binding, receipt verification) must have a registered Ed25519 key pair. The key model defines how keys are generated, stored, bound to principals, and rotated.

### 4.1 Key Assignment

Keys are assigned per principal, not per role. A single principal has one active key pair at any time. If a principal holds multiple roles (e.g., `approver` + `meta_governor`), the same key pair is used for both. This simplifies key management and ensures that a signature always identifies a specific principal, regardless of which role they are exercising.

| Principal Type | Key Generation | Private Key Storage | Public Key Storage |
|---|---|---|---|
| `human` | Generated in browser (ONE PWA) or offline tool | User's device only — never on server | `principals` table + `authorized_signers` table |
| `ai_agent` | Generated by Gateway on agent registration | Gateway secure storage (env var or key vault) | `principals` table |
| `service` | Generated during service deployment | Service configuration (env var or key vault) | `principals` table |
| `executor` | No long-lived key — uses single-use execution tokens | N/A | N/A |
| `auditor` | Generated on auditor registration | Auditor's secure storage | `principals` table |
| `meta_governor` | Same as `human` (meta-governors are humans) | User's device only | `principals` table + `authorized_signers` table |

### 4.2 Key Format

| Property | Value |
|---|---|
| Algorithm | Ed25519 (RFC 8032) |
| Public key size | 32 bytes (64 hex characters) |
| Private key size | 64 bytes (128 hex characters) |
| Signature size | 64 bytes (128 hex characters) |
| Encoding | Lowercase hexadecimal |
| Library | `tweetnacl` (Node.js), `PyNaCl` (Python) |

### 4.3 Key Rotation

Key rotation replaces a principal's active key pair with a new one. The old public key is retained in the `key_history` table for receipt verification (old receipts were signed with the old key and must remain verifiable).

The rotation process:

1. The principal generates a new Ed25519 key pair.
2. The principal signs a key rotation request with the **old** private key. The request contains the new public key.
3. The Gateway verifies the rotation request signature against the old public key.
4. The Gateway moves the old public key to `key_history` with a `rotated_at` timestamp.
5. The Gateway registers the new public key as the active key for the principal.
6. A `KEY_ROTATION` ledger entry is created with the old key hash, new key hash, and the rotation signature.

Key rotation for `root_authority` principals requires Meta-Governance quorum (3 of 3) because it is an authority change (Constitution, Section 5.2).

### 4.4 Key Revocation

Key revocation permanently disables a principal's key. Revoked keys cannot be used for new approvals. Old receipts signed with revoked keys remain verifiable (the key is in `key_history` with status `revoked`).

Revocation requires:
- For `approver` keys: 2-of-3 Meta-Governance quorum
- For `root_authority` keys: 3-of-3 Meta-Governance quorum
- For `ai_agent` keys: Any `root_authority` or 2-of-3 quorum
- Emergency revocation: Any single `root_authority` can revoke any key immediately (logged as emergency action)

---

## 5. Principal Registry

The principal registry is the single source of truth for all identities in the system. It replaces the current fragmented identity stores (Gateway `authorized_signers`, ONE PWA `users`, Policy JSON `owner`).

### 5.1 Principals Table Schema

```sql
CREATE TABLE IF NOT EXISTS principals (
    id              SERIAL PRIMARY KEY,
    principal_id    VARCHAR(255) UNIQUE NOT NULL,
    actor_type      VARCHAR(50) NOT NULL,
    display_name    VARCHAR(255) NOT NULL,
    email           VARCHAR(320),
    primary_role    VARCHAR(50) NOT NULL,
    secondary_roles VARCHAR(255)[] DEFAULT '{}',
    public_key_hex  VARCHAR(64),
    key_status      VARCHAR(20) DEFAULT 'active',
    scopes          JSONB DEFAULT '[]',
    metadata        JSONB DEFAULT '{}',
    registered_at   TIMESTAMPTZ DEFAULT NOW(),
    registered_by   VARCHAR(255) NOT NULL,
    last_active_at  TIMESTAMPTZ,
    status          VARCHAR(20) DEFAULT 'active',
    
    CONSTRAINT valid_actor_type CHECK (
        actor_type IN ('human', 'ai_agent', 'service', 'executor', 'auditor', 'meta_governor')
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

### 5.2 Key History Table Schema

```sql
CREATE TABLE IF NOT EXISTS key_history (
    id              SERIAL PRIMARY KEY,
    principal_id    VARCHAR(255) NOT NULL REFERENCES principals(principal_id),
    public_key_hex  VARCHAR(64) NOT NULL,
    status          VARCHAR(20) NOT NULL,
    activated_at    TIMESTAMPTZ NOT NULL,
    deactivated_at  TIMESTAMPTZ,
    deactivation_reason VARCHAR(50),
    rotation_signature  VARCHAR(128),
    
    CONSTRAINT valid_key_history_status CHECK (
        status IN ('active', 'rotated', 'revoked')
    )
);

CREATE INDEX IF NOT EXISTS idx_key_history_principal ON key_history(principal_id);
CREATE INDEX IF NOT EXISTS idx_key_history_pubkey ON key_history(public_key_hex);
```

### 5.3 Initial Principal Set

The system bootstraps with the following principals. Additional principals require registration through the Gateway API with appropriate authorization.

| Principal ID | Actor Type | Primary Role | Display Name | Registration |
|---|---|---|---|---|
| `I-1` | `human` | `root_authority` | Brian Kent Rasmussen | System bootstrap |
| `bondi` | `ai_agent` | `proposer` | Bondi (AI Chief of Staff) | Registered by I-1 |
| `manny` | `ai_agent` | `proposer` | Manny (Builder) | Registered by I-1 |
| `gateway-exec` | `executor` | `executor` | Gateway Execution Engine | System bootstrap |
| `mantis` | `auditor` | `auditor` | Mantis (Witness) | System bootstrap |
| `ledger-writer` | `service` | `auditor` | Ledger Writer Service | System bootstrap |

---

## 6. Identity Binding

Identity binding is the mechanism that connects a principal's identity to their actions in the pipeline. Every pipeline artifact (intent, approval, execution, receipt, ledger entry) must reference the principal who produced it.

### 6.1 Binding Fields

Every pipeline artifact includes the following identity fields:

| Field | Description | Example |
|---|---|---|
| `principal_id` | The unique identifier of the acting principal | `I-1`, `bondi`, `gateway-exec` |
| `actor_type` | The actor type of the principal | `human`, `ai_agent`, `executor` |
| `role_exercised` | The specific role being exercised in this action | `approver`, `proposer`, `executor` |

### 6.2 Binding in the Pipeline

| Pipeline Stage | Principal | Role Exercised | Binding Proof |
|---|---|---|---|
| Intent submission | The proposing agent or human | `proposer` | API key or OAuth session |
| Risk assessment | The governance engine (service) | `auditor` | Service identity |
| Approval | The approving human | `approver` | Ed25519 signature |
| Execution | The execution engine | `executor` | Single-use execution token |
| Receipt generation | The receipt service | `auditor` | Service identity |
| Ledger write | The ledger writer service | `auditor` | Service identity |

### 6.3 Approval Identity Binding (Receipt v2.1 Compatibility)

The existing Receipt Specification v2.1 defines an `identity_binding` object on receipts. This specification formalizes and extends that binding:

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

The `key_version` field is new. It references the version of the key used for signing, enabling receipt verification even after key rotation. The verifier looks up the key in `key_history` by `principal_id` and `key_version` to find the correct public key.

---

## 7. Delegation Model

Delegation allows a human to grant limited authority to an AI agent. The agent acts on behalf of the human, but the human retains ultimate authority and the delegation is recorded in the receipt.

### 7.1 Delegation Record

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

### 7.2 Delegation Rules

Delegation is constrained by the following rules, which prevent privilege escalation:

1. Only a `human` or `root_authority` principal can create a delegation.
2. A delegation cannot grant capabilities that the delegator does not hold.
3. A delegation cannot exceed `LOW` risk without explicit per-action approval from the delegator.
4. A delegation has a mandatory expiration (maximum 24 hours, configurable by policy).
5. A delegation can be revoked at any time by the delegator.
6. All actions performed under delegation include `on_behalf_of` in the intent and `delegation_id` in the receipt.
7. The delegator's identity appears in the receipt as the ultimate authority, even when the delegate performed the action.

---

## 8. Authentication Flow

Authentication is the process of verifying that a principal is who they claim to be. Different actor types use different authentication methods, but all authentication flows produce the same result: a verified `principal_id` that is injected into the request context.

### 8.1 Human Authentication

```
Browser → ONE PWA → OAuth Provider → ONE PWA → Gateway Registration
                                                      ↓
                                              principals table
                                              (principal_id = OAuth openId)
                                              (public_key_hex = browser-generated Ed25519)
```

The human authenticates via OAuth in the ONE PWA. On first login, the ONE PWA generates an Ed25519 key pair in the browser and registers the public key with the Gateway. Subsequent approvals are signed with the browser-held private key.

### 8.2 Agent Authentication

```
AI Agent → API Key → Gateway → api_keys table → principal_id lookup → principals table
```

Agents authenticate with API keys. Each API key is bound to a `principal_id` in the `api_keys` table. The Gateway resolves the API key to a principal and injects the principal's identity and roles into the request context.

### 8.3 Service Authentication

```
Internal Service → Shared Secret / mTLS → Gateway → principals table
```

Internal services authenticate with shared secrets or mutual TLS. Service principals are registered at deployment time and have fixed roles.

---

## 9. Role Enforcement at the API Boundary

Every Gateway API endpoint declares which roles are permitted to call it. The Gateway middleware resolves the caller's principal and checks the role before processing the request.

| Endpoint | Method | Required Role | Description |
|---|---|---|---|
| `/api/intents` | POST | `proposer` | Submit a new intent |
| `/api/intents/:id` | GET | `proposer`, `approver`, `auditor`, `root_authority` | View intent details |
| `/api/approve` | POST | `approver`, `root_authority` | Approve an intent |
| `/api/deny` | POST | `approver`, `root_authority` | Deny an intent |
| `/api/execute` | POST | `executor` | Execute an approved intent |
| `/api/receipts/:id` | GET | Any authenticated | View a receipt |
| `/api/ledger` | GET | `auditor`, `root_authority` | View ledger entries |
| `/api/signers` | POST | `root_authority` | Register a new signer |
| `/api/signers` | DELETE | `root_authority`, `meta_governor` (quorum) | Revoke a signer |
| `/api/policy` | GET | Any authenticated | View current policy |
| `/api/policy` | PUT | `meta_governor` (quorum) | Update policy |
| `/api/system/mode` | POST | `meta_governor`, `root_authority` | Change system mode |
| `/api/system/kill` | POST | `root_authority` (any 1) | Emergency stop |

---

## 10. Migration Path

The current system has three independent identity stores. This section defines the migration path to the unified principal model.

### 10.1 Phase 1 — Create Principals Table

Create the `principals` and `key_history` tables in the Gateway PostgreSQL database. Populate with the initial principal set (Section 5.3). This does not change existing behavior — the old tables remain active.

### 10.2 Phase 2 — Dual-Write

Modify the Gateway to write to both the old tables (`authorized_signers`, `api_keys`) and the new `principals` table on every registration and update. This ensures backward compatibility during migration.

### 10.3 Phase 3 — Read from Principals

Modify the Gateway authentication and authorization middleware to read from the `principals` table instead of the old tables. The old tables become read-only backups.

### 10.4 Phase 4 — Bind ONE PWA Users

Add a registration flow in the ONE PWA that binds the OAuth user identity to a Gateway principal. On first login after migration, the user is prompted to generate an Ed25519 key pair and register it. The `principal_id` is set to the user's OAuth `openId`.

### 10.5 Phase 5 — Enforce Roles

Enable role enforcement at the API boundary. Requests from principals without the required role receive HTTP 403. This is the point of no return — after this phase, the old identity model is deprecated.

### 10.6 Phase 6 — Deprecate Old Tables

Remove the old `authorized_signers` table (data migrated to `principals` and `key_history`). Remove the old `api_keys` table (data migrated to `principals` with `scopes` field). Update all documentation.

---

## 11. Compatibility with Receipt Specification

This identity model is designed to be fully compatible with the Receipt Specification v2.1. The following table maps identity fields to receipt fields:

| Identity Field | Receipt Field | Notes |
|---|---|---|
| `principal_id` | `identity_binding.signer_id` | Direct mapping |
| `public_key_hex` | `identity_binding.public_key_hex` | Direct mapping |
| `role_exercised` | New field: `identity_binding.role_exercised` | Added by this spec |
| `actor_type` | New field: `identity_binding.actor_type` | Added by this spec |
| `key_version` | New field: `identity_binding.key_version` | Added by this spec |
| Signature | `identity_binding.signature_payload_hash` | Existing field |
| Verification method | `identity_binding.verification_method` | Existing field (`ed25519`) |

Romney should review whether the new fields (`role_exercised`, `actor_type`, `key_version`) require a minor version bump to the Receipt Specification (v2.2 or v2.3).

---

## 12. Compatibility with Ledger Specification

Ledger entries currently include `agent_id` as a flat string. This specification recommends extending ledger entries with `principal_id` and `role_exercised` fields. The `agent_id` field is retained for backward compatibility but is deprecated in favor of `principal_id`.

The migration is non-breaking: new ledger entries include both `agent_id` (for backward compatibility) and `principal_id` (for the new model). Old entries are not modified (the ledger is append-only).

---

## 13. Open Questions for Romney

The following questions require Romney's review before this specification is finalized:

1. **Receipt field additions:** Do the new `identity_binding` fields (`role_exercised`, `actor_type`, `key_version`) require a receipt protocol version bump? If so, should it be a minor bump (v2.3) or a major bump (v3.0)?

2. **Key version in hash chain:** Should `key_version` be included in the `authorization_hash` computation? Including it would make the hash chain aware of key rotation, but it would also mean that the same approval signed with different key versions would produce different hashes.

3. **Delegation in receipts:** How should delegated actions appear in the receipt? The current proposal is to include both `delegator_id` and `delegate_id` in the `identity_binding`, with the `delegator_id` as the authoritative signer. Does this require a new receipt type or can it be handled within the existing `governed_action` type?

4. **Ledger backward compatibility:** Is it acceptable to add `principal_id` and `role_exercised` columns to the `ledger_entries` table, or should these be stored in a separate identity-enriched view?
