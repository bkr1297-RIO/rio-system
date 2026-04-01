# RIO Gateway — API Endpoint Catalog

**Version:** 2.7.0
**Date:** 2026-03-31
**Author:** Romney (Manus Agent)
**Base URL (Production):** `https://rio-gateway.onrender.com`

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Core Pipeline Endpoints](#2-core-pipeline-endpoints)
3. [Public API v1 Endpoints](#3-public-api-v1-endpoints)
4. [Identity & Signer Management](#4-identity--signer-management)
5. [Key Backup & Recovery](#5-key-backup--recovery)
6. [Device Sync](#6-device-sync)
7. [Proxy Onboarding (v2.7.0)](#7-proxy-onboarding-v270)
8. [Observability](#8-observability)
9. [Authentication Methods](#9-authentication-methods)
10. [Error Responses](#10-error-responses)

---

## 1. Authentication

### POST /login

Authenticate and receive a JWT token.

| Field | Value |
|-------|-------|
| Auth Required | No |
| Rate Limited | No |
| Replay Prevention | Yes |

**Request Body:**
```json
{
  "user_id": "brian.k.rasmussen",
  "passphrase": "rio-governed-2026",
  "request_timestamp": "2026-03-31T20:00:00.000Z",
  "request_nonce": "uuid-v4"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "sub": "brian.k.rasmussen",
    "role": "owner"
  },
  "expires_in": "24h"
}
```

### GET /whoami

Return the authenticated user's identity.

| Field | Value |
|-------|-------|
| Auth Required | JWT |
| Rate Limited | No |

**Response (200):**
```json
{
  "authenticated": true,
  "user": {
    "sub": "brian.k.rasmussen",
    "role": "owner",
    "iat": 1743451200,
    "exp": 1743537600
  }
}
```

---

## 2. Core Pipeline Endpoints

These endpoints implement the 7-stage governance pipeline. They are mounted at the root path and accept JWT authentication.

### POST /intent

Submit a new intent for governance evaluation.

| Field | Value |
|-------|-------|
| Auth Required | JWT (optional for submission) |
| Replay Prevention | Yes |
| Ledger Entry | `submit` |

**Request Body:**
```json
{
  "action": "send_email",
  "agent_id": "manus",
  "parameters": {
    "to": "recipient@example.com",
    "subject": "Test",
    "body": "Hello from RIO"
  },
  "confidence": 95,
  "target_environment": "production",
  "request_timestamp": "2026-03-31T20:00:00.000Z",
  "request_nonce": "uuid-v4"
}
```

**Response (201):**
```json
{
  "intent_id": "uuid-v4",
  "status": "submitted",
  "hash": "sha256-hex",
  "message": "Intent submitted successfully."
}
```

### POST /govern

Evaluate an intent against governance policy.

| Field | Value |
|-------|-------|
| Auth Required | JWT |
| Replay Prevention | Yes |
| Ledger Entry | `govern` |

**Request Body:**
```json
{
  "intent_id": "uuid-v4",
  "request_timestamp": "2026-03-31T20:00:00.000Z",
  "request_nonce": "uuid-v4"
}
```

**Response (200):**
```json
{
  "intent_id": "uuid-v4",
  "status": "auto_approved | requires_approval | blocked",
  "governance": {
    "checks": [
      { "check": "constitution_loaded", "passed": true },
      { "check": "policy_loaded", "passed": true },
      { "check": "agent_recognized", "passed": true, "agent": "manus" },
      { "check": "environment_valid", "passed": true },
      { "check": "action_classification", "restricted": false },
      { "check": "confidence_threshold", "passed": true, "confidence": 95 },
      { "check": "external_effect", "detected": true }
    ],
    "risk_level": "medium",
    "requires_approval": true
  }
}
```

### POST /authorize

Authorize a governed intent (approve or deny).

| Field | Value |
|-------|-------|
| Auth Required | JWT |
| Ed25519 Signature | Required when `ED25519_MODE=required` |
| Replay Prevention | Yes |
| Ledger Entry | `authorize` |
| Token Burn | Issues single-use execution token |

**Request Body:**
```json
{
  "intent_id": "uuid-v4",
  "decision": "approved",
  "signer_id": "brian-sovereign",
  "signature": "ed25519-hex-signature",
  "request_timestamp": "2026-03-31T20:00:00.000Z",
  "request_nonce": "uuid-v4"
}
```

**Response (200):**
```json
{
  "intent_id": "uuid-v4",
  "status": "authorized",
  "execution_token": "uuid-v4",
  "token_expires_at": "2026-03-31T20:05:00.000Z",
  "ed25519_signed": true,
  "signer_id": "brian-sovereign"
}
```

### POST /execute

Execute an authorized intent using a single-use token.

| Field | Value |
|-------|-------|
| Auth Required | JWT |
| Execution Token | Required (single-use, burns on use) |
| Replay Prevention | Yes |
| Ledger Entry | `execute` |

**Request Body:**
```json
{
  "intent_id": "uuid-v4",
  "execution_token": "uuid-v4",
  "request_timestamp": "2026-03-31T20:00:00.000Z",
  "request_nonce": "uuid-v4"
}
```

**Response (200):**
```json
{
  "intent_id": "uuid-v4",
  "status": "executed",
  "result": { ... },
  "connector": "gmail"
}
```

### POST /execute-confirm

Confirm execution completion (post-execution verification).

| Field | Value |
|-------|-------|
| Auth Required | JWT |
| Replay Prevention | Yes |
| Ledger Entry | `confirm` |

### POST /receipt

Generate a cryptographic receipt for a completed intent.

| Field | Value |
|-------|-------|
| Auth Required | JWT |
| Replay Prevention | Yes |
| Ledger Entry | `receipt` |

**Response (200):**
```json
{
  "receipt_id": "uuid-v4",
  "intent_id": "uuid-v4",
  "hash_chain": {
    "intent_hash": "sha256-hex",
    "governance_hash": "sha256-hex",
    "authorization_hash": "sha256-hex",
    "execution_hash": "sha256-hex",
    "receipt_hash": "sha256-hex"
  },
  "ledger_hash": "sha256-hex",
  "previous_hash": "sha256-hex | GENESIS",
  "signature": "hex-string",
  "verification_method": "ed25519",
  "status": "valid"
}
```

### GET /intents

List all intents with optional status filter.

| Field | Value |
|-------|-------|
| Auth Required | JWT |
| Query Params | `status` (optional filter) |

### GET /intent/:id

Get a specific intent by ID with full pipeline state.

| Field | Value |
|-------|-------|
| Auth Required | JWT |

### GET /ledger

Return all ledger entries (hash-chained).

| Field | Value |
|-------|-------|
| Auth Required | JWT |

### GET /verify

Verify the integrity of the entire ledger hash chain.

| Field | Value |
|-------|-------|
| Auth Required | JWT |

**Response (200):**
```json
{
  "chain_valid": true,
  "total_entries": 42,
  "first_hash": "sha256-hex",
  "last_hash": "sha256-hex",
  "verified_at": "2026-03-31T20:00:00.000Z"
}
```

### GET /health

System health check (public, no auth required).

| Field | Value |
|-------|-------|
| Auth Required | No |

**Response (200):**
```json
{
  "status": "operational",
  "version": "2.7.0",
  "uptime": 86400,
  "governance": {
    "constitution_loaded": true,
    "policy_loaded": true,
    "policy_version": "1.1"
  },
  "ledger": {
    "total_entries": 42,
    "chain_valid": true
  },
  "security": {
    "ed25519_mode": "required",
    "replay_prevention": true,
    "registered_signers": 1
  }
}
```

---

## 3. Public API v1 Endpoints

All Public API v1 endpoints are mounted at `/api/v1/` and require API key authentication via the `X-API-Key` header. Rate limiting is enforced per API key.

### Authentication

All requests must include:
```
X-API-Key: <api-key>
```

API keys have scopes: `read`, `write`, `admin`.

### Rate Limits

| Scope | Limit |
|-------|-------|
| `read` | 100 requests/minute |
| `write` | 30 requests/minute |
| `admin` | 10 requests/minute |

Rate limit headers are included in every response:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 97
X-RateLimit-Reset: 1743451260
```

### Endpoints

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| POST | `/api/v1/intents` | write | Submit a new intent |
| GET | `/api/v1/intents` | read | List intents (with optional `?status=` filter) |
| GET | `/api/v1/intents/:id` | read | Get intent by ID |
| POST | `/api/v1/intents/:id/govern` | write | Evaluate intent against policy |
| POST | `/api/v1/intents/:id/authorize` | admin | Authorize intent (approve/deny) |
| POST | `/api/v1/intents/:id/execute` | admin | Execute authorized intent |
| POST | `/api/v1/intents/:id/confirm` | write | Confirm execution |
| POST | `/api/v1/intents/:id/receipt` | read | Generate receipt |
| GET | `/api/v1/ledger` | read | Get ledger entries |
| GET | `/api/v1/verify` | read | Verify chain integrity |
| GET | `/api/v1/health` | none | Health check (no auth required) |
| GET | `/api/v1/docs` | none | OpenAPI documentation |

### API Key Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/keys` | JWT (owner) | Create a new API key |
| GET | `/api/v1/keys` | JWT or API key | List all API keys |
| GET | `/api/v1/keys/:key_id` | JWT or API key | Get API key details |
| DELETE | `/api/v1/keys/:key_id` | JWT (owner) | Revoke an API key |

**Create API Key (POST /api/v1/keys):**
```json
{
  "name": "jordan-frontend",
  "scopes": ["read", "write"],
  "expires_in": "30d"
}
```

**Response:**
```json
{
  "key_id": "uuid-v4",
  "api_key": "rio_v1_...",
  "name": "jordan-frontend",
  "scopes": ["read", "write"],
  "created_at": "2026-03-31T20:00:00.000Z",
  "expires_at": "2026-04-30T20:00:00.000Z"
}
```

---

## 4. Identity & Signer Management

Mounted at `/api/signers/`. All endpoints require JWT authentication with `role=owner`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/signers/generate-keypair` | Generate Ed25519 keypair (private key returned ONCE) |
| POST | `/api/signers/register` | Register an externally-generated public key |
| GET | `/api/signers` | List all registered signers (public keys only) |
| GET | `/api/signers/:signer_id` | Get a specific signer |
| DELETE | `/api/signers/:signer_id` | Revoke a signer |

### POST /api/signers/generate-keypair

Generate a new Ed25519 keypair. The private key is returned exactly once and never stored on the server.

**Request Body:**
```json
{
  "signer_id": "brian-sovereign",
  "display_name": "Brian's Sovereign Key",
  "role": "owner"
}
```

**Response (201):**
```json
{
  "signer_id": "brian-sovereign",
  "public_key_hex": "64-char-hex",
  "private_key_hex": "128-char-hex (SAVE THIS — returned only once)",
  "display_name": "Brian's Sovereign Key",
  "role": "owner",
  "created_at": "2026-03-31T20:00:00.000Z",
  "warning": "Private key is returned ONCE. Store it securely."
}
```

### POST /api/signers/register

Register an externally-generated Ed25519 public key.

**Request Body:**
```json
{
  "signer_id": "brian-mobile",
  "public_key_hex": "64-char-hex",
  "display_name": "Brian's Mobile Key",
  "role": "owner"
}
```

---

## 5. Key Backup & Recovery

Mounted at `/api/key-backup/`. All endpoints require JWT authentication. The server stores only encrypted ciphertext — decryption requires the user's passphrase, which is never sent to the server.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/key-backup` | Store an encrypted key backup |
| GET | `/api/key-backup/:signer_id` | Retrieve an encrypted backup |
| GET | `/api/key-backup` | List all backups for the authenticated user |
| DELETE | `/api/key-backup/:signer_id` | Delete a backup |

### POST /api/key-backup

**Request Body:**
```json
{
  "signer_id": "brian-sovereign",
  "public_key_hex": "64-char-hex",
  "encrypted_key": "base64-encrypted-private-key",
  "salt": "base64-salt",
  "iv": "base64-iv",
  "version": 1
}
```

---

## 6. Device Sync

Mounted at `/api/sync/`. Provides full device state restoration.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/sync` | JWT | Full device sync (identity + key backup + ledger) |
| GET | `/api/sync/health` | None | Lightweight ledger health check |

### POST /api/sync

Returns everything a device needs to restore full signing and governance capability.

**Request Body:**
```json
{
  "signer_id": "brian-sovereign",
  "last_known_hash": "sha256-hex (for incremental sync)",
  "ledger_limit": 500
}
```

**Response (200):**
```json
{
  "identity": {
    "signer_id": "brian-sovereign",
    "public_key_hex": "64-char-hex",
    "status": "active",
    "has_backup": true
  },
  "key_backup": {
    "encrypted_key": "base64",
    "salt": "base64",
    "iv": "base64"
  },
  "ledger": {
    "entries": [ ... ],
    "total_count": 42,
    "returned_count": 42,
    "tip_hash": "sha256-hex"
  },
  "health": {
    "chain_valid": true,
    "entry_count": 42,
    "tip_hash": "sha256-hex"
  }
}
```

### GET /api/sync/health

Lightweight health check for drift detection (no auth required).

**Response (200):**
```json
{
  "chain_valid": true,
  "entry_count": 42,
  "tip_hash": "sha256-hex",
  "checked_at": "2026-03-31T20:00:00.000Z"
}
```

---

## 7. Proxy Onboarding (v2.7.0)

**Status:** PR #80 (pending merge)

These endpoints are mounted at `/api/` and provide proxy user management. They are part of the v2.7.0 release.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/kill` | JWT + Ed25519 | Emergency kill switch — burns tokens, pauses proxy |
| GET | `/api/sync` | JWT | Real-time state endpoint (replaces Drive-based sync) |
| POST | `/api/onboard` | JWT | Create user with Ed25519 key + welcome receipt |

### POST /api/kill

Emergency kill switch with dual-factor authentication. Burns all active execution tokens and pauses the proxy.

| Field | Value |
|-------|-------|
| Auth Required | JWT + Ed25519 (dual-factor) |
| Latency Target | <20ms |
| Ledger Entry | `kill_switch` |

**Request Body:**
```json
{
  "reason": "Suspicious activity detected",
  "signer_id": "brian-sovereign",
  "signature": "ed25519-hex-signature",
  "request_timestamp": "2026-03-31T20:00:00.000Z",
  "request_nonce": "uuid-v4"
}
```

**Response (200):**
```json
{
  "status": "killed",
  "tokens_burned": 3,
  "proxy_paused": true,
  "receipt": {
    "receipt_id": "uuid-v4",
    "action": "KILL_PROXY",
    "ledger_hash": "sha256-hex"
  },
  "latency_ms": 17
}
```

### GET /api/sync (Proxy State)

Real-time system state endpoint. Returns full operational status.

**Response (200):**
```json
{
  "version": "2.7.0",
  "status": "operational",
  "proxy": {
    "active_users": 1,
    "paused": false
  },
  "intents": {
    "total": 42,
    "by_status": {
      "submitted": 2,
      "governed": 5,
      "authorized": 3,
      "executed": 30,
      "receipted": 2
    }
  },
  "ledger": {
    "total_entries": 42,
    "chain_valid": true,
    "tip_hash": "sha256-hex"
  },
  "signers": {
    "total": 1,
    "active": 1
  }
}
```

### POST /api/onboard

Create a new proxy user with Ed25519 key registration and welcome receipt.

**Request Body:**
```json
{
  "user_id": "new-user",
  "display_name": "New User",
  "email": "user@example.com",
  "role": "user",
  "request_timestamp": "2026-03-31T20:00:00.000Z",
  "request_nonce": "uuid-v4"
}
```

**Response (201):**
```json
{
  "user_id": "new-user",
  "signer_id": "new-user",
  "public_key_hex": "64-char-hex",
  "private_key_hex": "128-char-hex (SAVE THIS — returned only once)",
  "welcome_receipt": {
    "receipt_id": "uuid-v4",
    "action": "USER_ONBOARD",
    "ledger_hash": "sha256-hex"
  }
}
```

---

## 8. Observability

### GET /health (Root)

Public health check endpoint. No authentication required.

### GET /api/v1/health

Public API v1 health check. No authentication required.

### GET /api/sync/health

Lightweight ledger health for drift detection. No authentication required.

---

## 9. Authentication Methods

The gateway supports multiple authentication methods, applied at different layers:

| Method | Layer | Usage |
|--------|-------|-------|
| JWT Bearer Token | Core pipeline, Signer management, Key backup, Sync | `Authorization: Bearer <token>` |
| API Key | Public API v1 | `X-API-Key: <key>` |
| Ed25519 Signature | Authorization, Kill switch | Inline `signature` + `signer_id` in request body |
| Dual-Factor (JWT + Ed25519) | Kill switch | Both JWT header and Ed25519 signature in body |

### Replay Prevention

All POST endpoints enforce replay prevention via:
- `request_timestamp`: Must be within 5-minute window
- `request_nonce`: Must be unique (UUID v4)

Requests missing these fields or with expired timestamps are rejected.

### Token Burn

Authorization produces a single-use execution token. The token:
- Has a 5-minute TTL
- Is consumed (burned) on first use
- Cannot be replayed
- Is bound to a specific intent_id

---

## 10. Error Responses

All error responses follow a consistent format:

```json
{
  "error": "Human-readable error message",
  "hint": "Actionable suggestion for resolution",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

| HTTP Status | Code | Meaning |
|-------------|------|---------|
| 400 | `INVALID_REQUEST` | Missing or malformed request body |
| 401 | `UNAUTHORIZED` | Missing or invalid JWT/API key |
| 403 | `FORBIDDEN` | Insufficient permissions or role |
| 403 | `SIGNATURE_REQUIRED` | Ed25519 signature required but not provided |
| 403 | `SIGNATURE_INVALID` | Ed25519 signature verification failed |
| 404 | `NOT_FOUND` | Intent or resource not found |
| 409 | `REPLAY_DETECTED` | Duplicate nonce or expired timestamp |
| 409 | `TOKEN_BURNED` | Execution token already consumed |
| 429 | `RATE_LIMITED` | API rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Server error |

---

## Appendix: Endpoint Summary

| # | Method | Path | Auth | Description |
|---|--------|------|------|-------------|
| 1 | POST | `/login` | None | Authenticate, get JWT |
| 2 | GET | `/whoami` | JWT | Current user identity |
| 3 | POST | `/intent` | JWT* | Submit intent |
| 4 | POST | `/govern` | JWT | Evaluate against policy |
| 5 | POST | `/authorize` | JWT + Ed25519 | Approve/deny intent |
| 6 | POST | `/execute` | JWT + Token | Execute with single-use token |
| 7 | POST | `/execute-confirm` | JWT | Confirm execution |
| 8 | POST | `/receipt` | JWT | Generate receipt |
| 9 | GET | `/ledger` | JWT | List ledger entries |
| 10 | GET | `/verify` | JWT | Verify chain integrity |
| 11 | GET | `/health` | None | System health |
| 12 | GET | `/intents` | JWT | List intents |
| 13 | GET | `/intent/:id` | JWT | Get intent detail |
| 14 | POST | `/api/v1/intents` | API Key | Submit intent (v1) |
| 15 | GET | `/api/v1/intents` | API Key | List intents (v1) |
| 16 | GET | `/api/v1/intents/:id` | API Key | Get intent (v1) |
| 17 | POST | `/api/v1/intents/:id/govern` | API Key | Govern intent (v1) |
| 18 | POST | `/api/v1/intents/:id/authorize` | API Key | Authorize intent (v1) |
| 19 | POST | `/api/v1/intents/:id/execute` | API Key | Execute intent (v1) |
| 20 | POST | `/api/v1/intents/:id/confirm` | API Key | Confirm execution (v1) |
| 21 | POST | `/api/v1/intents/:id/receipt` | API Key | Generate receipt (v1) |
| 22 | GET | `/api/v1/ledger` | API Key | Get ledger (v1) |
| 23 | GET | `/api/v1/verify` | API Key | Verify chain (v1) |
| 24 | GET | `/api/v1/health` | None | Health check (v1) |
| 25 | GET | `/api/v1/docs` | None | OpenAPI docs |
| 26 | POST | `/api/v1/keys` | JWT | Create API key |
| 27 | GET | `/api/v1/keys` | JWT/API Key | List API keys |
| 28 | GET | `/api/v1/keys/:key_id` | JWT/API Key | Get API key |
| 29 | DELETE | `/api/v1/keys/:key_id` | JWT | Revoke API key |
| 30 | POST | `/api/signers/generate-keypair` | JWT (owner) | Generate Ed25519 keypair |
| 31 | POST | `/api/signers/register` | JWT (owner) | Register external public key |
| 32 | GET | `/api/signers` | JWT | List signers |
| 33 | GET | `/api/signers/:signer_id` | JWT | Get signer |
| 34 | DELETE | `/api/signers/:signer_id` | JWT (owner) | Revoke signer |
| 35 | POST | `/api/key-backup` | JWT | Store encrypted backup |
| 36 | GET | `/api/key-backup/:signer_id` | JWT | Retrieve backup |
| 37 | GET | `/api/key-backup` | JWT | List backups |
| 38 | DELETE | `/api/key-backup/:signer_id` | JWT | Delete backup |
| 39 | POST | `/api/sync` | JWT | Full device sync |
| 40 | GET | `/api/sync/health` | None | Ledger health check |
| 41 | POST | `/api/kill` | JWT + Ed25519 | Kill switch (v2.7.0) |
| 42 | GET | `/api/sync` (proxy) | JWT | Proxy state (v2.7.0) |
| 43 | POST | `/api/onboard` | JWT | User onboarding (v2.7.0) |

*JWT optional for `/intent` — unauthenticated submissions are accepted but flagged.
