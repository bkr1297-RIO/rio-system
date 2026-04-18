> This document explains the system defined in: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

# RIO System Architecture — v2.7.0

**Date:** 2026-03-31
**Author:** Romney (Manus Agent)
**Status:** Active Development
**Production:** v2.6.0 at https://rio-gateway.onrender.com
**Development:** v2.7.0 (proxy onboarding + policy config pending merge)

---

## 1. System Overview

RIO (Runtime Intelligence Operation) is a governance-first intent execution gateway. It sits between AI agents, humans, and real-world actions. Every action is authorized, executed, verified, recorded, and used to improve future decisions.

The system enforces a **fail-closed architecture**: nothing executes unless explicitly approved through the governance pipeline. The default state is denial.

---

## 2. Core Invariants

These invariants are structural, not advisory. They cannot be overridden by configuration.

| # | Invariant | Enforcement |
|---|-----------|-------------|
| 1 | No action executes without governance evaluation | Pipeline stage gate: `govern` must precede `authorize` |
| 2 | No execution without human authorization | `authorize` stage requires valid approval record |
| 3 | Execution tokens are single-use | Token burn on first use; replay returns 409 |
| 4 | Ledger is append-only | No UPDATE or DELETE on ledger table; hash chain validates integrity |
| 5 | Hash chain is contiguous | Each entry's `prev_hash` must equal the preceding entry's `hash` |
| 6 | Ed25519 signatures bind identity to decisions | When `ED25519_MODE=required`, unsigned authorizations are rejected |
| 7 | Replay prevention on all mutations | `request_timestamp` + `request_nonce` validated on every POST |
| 8 | Three-Power Separation | Rio Interceptor, Governor (Policy Engine), and Execution Gate cannot cross boundaries |

---

## 3. Pipeline Architecture

The governance pipeline processes intents through 7 sequential stages:

```
┌──────────┐   ┌──────────┐   ┌───────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  SUBMIT  │──►│  GOVERN  │──►│ AUTHORIZE │──►│ EXECUTE  │──►│ CONFIRM  │──►│ RECEIPT  │──►│  LEDGER  │
│          │   │          │   │           │   │          │   │          │   │          │   │          │
│ Intake + │   │ Policy   │   │ Human     │   │ Token    │   │ Post-    │   │ Hash     │   │ Append-  │
│ normalize│   │ evaluate │   │ approval  │   │ burn +   │   │ execution│   │ chain +  │   │ only     │
│          │   │          │   │ + Ed25519  │   │ dispatch │   │ verify   │   │ sign     │   │ store    │
└──────────┘   └──────────┘   └───────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
     │              │               │               │               │              │              │
     ▼              ▼               ▼               ▼               ▼              ▼              ▼
  Ledger         Ledger          Ledger          Ledger          Ledger         Ledger         Ledger
  (submit)       (govern)        (authorize)     (execute)       (confirm)      (receipt)      (chain)
```

Each stage appends an entry to the hash-chained ledger. The pipeline is strictly sequential — no stage can be skipped.

---

## 4. Three-Power Separation

The system separates governance authority into three independent powers:

### Rio Interceptor (`rio_interceptor`)

The interception layer. Receives raw intents, normalizes them, attaches metadata, performs advisory risk classification, and forwards to the Governor. Can pause, flag, or escalate — but cannot approve or execute.

**Capabilities:** Intent reception, format normalization, metadata attachment, advisory risk classification, replay prevention, ledger logging (submit entries).

**Constraints:** Cannot approve or deny. Cannot execute. Cannot hold API keys. Cannot modify intents after normalization.

**Implementation:** `gateway/governance/intake.mjs`, `gateway/governance/intents.mjs`, `gateway/routes/index.mjs` (POST /intent)

### Governor (`governor_policy_engine`)

The decision layer. Evaluates intents against the constitution and policy. Determines risk level and whether human authorization is required.

**Capabilities:** Policy evaluation, risk classification, approval routing, threshold enforcement, action classification.

**Constraints:** Cannot execute actions. Cannot access connectors. Cannot modify the ledger (only append governance decisions). Cannot override human decisions.

**Implementation:** `gateway/governance/policy.mjs`, `gateway/governance/config.mjs`, `gateway/routes/index.mjs` (POST /govern)

### Execution Gate (`execution_gate`)

The action layer. Validates single-use tokens and dispatches authorized intents to target systems. This is the hard final gate — it must fail closed.

**Capabilities:** Token validation, connector dispatch, result capture, execution confirmation.

**Constraints:** Cannot approve intents. Cannot modify governance decisions. Cannot bypass token burn. Cannot execute without a valid, unexpired token.

**Implementation:** `gateway/routes/index.mjs` (POST /execute, POST /execute-confirm)

See `spec/THREE_POWER_SEPARATION.md` for the full specification.

---

## 5. Security Architecture

### 5.1 Authentication Layers

```
┌─────────────────────────────────────────────────────────┐
│                    Request Arrives                        │
├─────────────────────────────────────────────────────────┤
│ Layer 1: Replay Prevention                               │
│   request_timestamp (5-min window) + request_nonce       │
├─────────────────────────────────────────────────────────┤
│ Layer 2: Identity Authentication                         │
│   JWT Bearer Token  OR  API Key (X-API-Key header)       │
├─────────────────────────────────────────────────────────┤
│ Layer 3: Cryptographic Signature (when required)         │
│   Ed25519 signature with registered signer_id            │
├─────────────────────────────────────────────────────────┤
│ Layer 4: Token Burn (execution only)                     │
│   Single-use execution_token consumed on dispatch        │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Ed25519 Identity Binding

Every human authority in the system is bound to an Ed25519 keypair:

- **Key generation:** Server generates keypair, returns private key ONCE, stores only public key
- **External registration:** Users can register externally-generated public keys
- **Signature verification:** Authorization requests include `signer_id` + `signature`; server verifies against registered public key
- **Key backup:** Encrypted private key backups stored on server (server never sees plaintext)
- **Key revocation:** Signers can be revoked, immediately invalidating their authority

### 5.3 Token Burn

Authorization produces a single-use execution token:
- 5-minute TTL
- Bound to specific intent_id
- Consumed on first use (burned)
- Cannot be replayed or reused
- Stored in memory with automatic expiry

### 5.4 Hash Chain Integrity

The ledger maintains a contiguous SHA-256 hash chain:
- Each entry includes `hash` (SHA-256 of entry content) and `prev_hash` (hash of preceding entry)
- First entry uses `prev_hash = "GENESIS"`
- Chain integrity can be verified at any time via `GET /verify`
- Serialization: deterministic JSON (keys sorted alphabetically, no whitespace, UTF-8)

---

## 6. Data Architecture

### 6.1 PostgreSQL Tables

| Table | Purpose | Type |
|-------|---------|------|
| `ledger_entries` | Hash-chained governance audit trail | Append-only |
| `authorized_signers` | Ed25519 public key registry | CRUD (with revocation) |
| `proxy_users` | Proxy user accounts (v2.7.0) | CRUD |

### 6.2 In-Memory Stores

| Store | Purpose | Persistence |
|-------|---------|-------------|
| `intents` | Active intent pipeline state | Memory (lost on restart) |
| `execution_tokens` | Single-use tokens with TTL | Memory (auto-expire) |
| `api_keys` | API key registry | Memory (lost on restart) |
| `key_backups` | Encrypted key backup storage | Memory (lost on restart) |
| `nonce_cache` | Replay prevention nonces | Memory (auto-expire) |

### 6.3 Ledger Entry Schema

```json
{
  "entry_id": "auto-increment",
  "intent_id": "uuid-v4",
  "action": "submit | govern | authorize | execute | confirm | receipt | kill_switch | onboard",
  "hash": "sha256-hex",
  "prev_hash": "sha256-hex | GENESIS",
  "timestamp": "ISO-8601",
  "data": { ... }
}
```

---

## 7. Module Map

```
gateway/
├── server.mjs                    # Express app, route mounting, middleware
├── config/
│   └── rio/
│       ├── RIO_CONSTITUTION.json # System constitution
│       └── RIO_POLICY.json       # Governance policy v1.1
├── governance/
│   ├── config.mjs                # Config loader (fail-closed)
│   ├── intake.mjs                # Intent normalization
│   ├── intents.mjs               # Intent CRUD + pipeline state
│   ├── policy.mjs                # Policy evaluation engine
│   └── proxy-store.mjs           # Proxy user management (v2.7.0)
├── ledger/
│   └── ledger-pg.mjs             # PostgreSQL append-only ledger
├── routes/
│   ├── index.mjs                 # Core pipeline routes (7 stages)
│   ├── api-v1.mjs                # Public API v1 (API key auth + rate limiting)
│   ├── signers.mjs               # Ed25519 signer management
│   ├── key-backup.mjs            # Encrypted key backup
│   ├── sync.mjs                  # Device sync + ledger health
│   └── proxy.mjs                 # Kill switch, sync, onboard (v2.7.0)
├── security/
│   ├── oauth.mjs                 # JWT authentication middleware
│   ├── ed25519.mjs               # Ed25519 key generation + signing
│   ├── identity-binding.mjs      # Signer registry (register, list, revoke)
│   ├── replay-prevention.mjs     # Timestamp + nonce validation
│   └── token-manager.mjs         # Single-use execution token management (v2.7.0)
└── test_*.mjs                    # Test suites
```

---

## 8. Deployment Architecture

### 8.1 Current (Render.com)

```
┌─────────────────────────────────────────────┐
│              Render.com                       │
│                                               │
│  ┌─────────────────┐   ┌──────────────────┐  │
│  │  Gateway Service │   │   PostgreSQL DB   │  │
│  │  (Docker)        │──►│   (Managed)       │  │
│  │  Port 10000      │   │                    │  │
│  │  v2.6.0          │   │  - ledger_entries  │  │
│  │                   │   │  - auth_signers   │  │
│  └─────────────────┘   └──────────────────┘  │
│           │                                    │
│           ▼                                    │
│  https://rio-gateway.onrender.com              │
└─────────────────────────────────────────────┘
```

### 8.2 Planned (Azure — Manny's Pipeline)

```
┌──────────────────────────────────────────────────────────┐
│                        Azure                              │
│                                                           │
│  Outlook → Power Automate → Service Bus → Gateway         │
│                                                           │
│  ┌──────────┐   ┌────────────┐   ┌──────────────────┐   │
│  │ Outlook  │──►│   Power    │──►│   Service Bus    │   │
│  │ Inbox    │   │ Automate   │   │   Queue          │   │
│  └──────────┘   └────────────┘   └──────────────────┘   │
│                                          │                │
│                                          ▼                │
│                                  ┌──────────────┐        │
│                                  │   Gateway    │        │
│                                  │   (Azure)    │        │
│                                  └──────────────┘        │
└──────────────────────────────────────────────────────────┘
```

---

## 9. Version History

| Version | Date | Key Changes |
|---------|------|-------------|
| 2.0.0 | 2026-03-25 | PostgreSQL ledger, hash chain, JWT auth |
| 2.1.0 | 2026-03-26 | Governance pipeline (7 stages), policy engine |
| 2.2.0 | 2026-03-27 | Execution tokens, token burn, replay prevention |
| 2.3.0 | 2026-03-27 | Receipt generation, hash chain verification |
| 2.4.0 | 2026-03-28 | Ed25519 identity binding (WS-010) |
| 2.5.0 | 2026-03-28 | Key backup, device sync, ledger resync |
| 2.6.0 | 2026-03-29 | Public API v1 (WS-012), API key auth, rate limiting |
| 2.7.0 | 2026-03-31 | Proxy onboarding (kill, sync, onboard), policy config |

---

## 10. Team Responsibilities

| Team Member | Role | Owns |
|-------------|------|------|
| Romney | Backend Builder | Gateway, connectors, ledger, security, API, specs |
| Manny | Coordinator | Azure infrastructure, Power Automate, Service Bus |
| Jordan | Frontend Builder | ONE App dashboard, onboarding wizard, visualizations |
| Damon | DevOps/Architect | Deployment, CI/CD, infrastructure architecture |
| Andrew | Analyst/Auditor | Audit, compliance, verification |
| Brian | Owner/Authority | Sovereign signer, final approval authority |

---

## 11. Open PRs and Pending Work

| PR | Branch | Description | Status |
|----|--------|-------------|--------|
| #78 | `feature/policy-config-agents` | Policy config + agent recognition + signer_id fix | Pending merge |
| #80 | `feature/proxy-onboarding` | Kill switch, sync, onboard endpoints | Pending merge |
| — | `docs/spec-and-architecture` | Three-Power Separation spec, Mantis component, API catalog, architecture docs | In progress |

---

## 12. References

| Document | Location |
|----------|----------|
| Three-Power Separation Spec | `spec/THREE_POWER_SEPARATION.md` |
| Mantis Component Definition | `spec/MANTIS_COMPONENT.md` |
| Receipt Specification v2.1 | `spec/Receipt_Specification_v2.1.json` |
| API Endpoint Catalog | `docs/API_CATALOG_v2.7.md` |
| Intake Schema | `spec/intake-schema.json` |
| Core Spec v1 | `spec/core-spec-v1.json` |
| Policy v1.0 | `spec/policy-v1.0.json` |
| Gateway Wiring (Jordan) | `docs/GATEWAY_WIRING.md` |
| Deployment Guide | `docs/DEPLOYMENT_GUIDE.md` |
| White Paper (Formal) | `docs/RIO_White_Paper_Formal.md` |
