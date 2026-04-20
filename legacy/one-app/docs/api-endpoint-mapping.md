# API Endpoint Mapping: Proxy tRPC vs Gateway REST Catalog v2.7

**Date:** 2026-03-31
**Purpose:** Map our tRPC procedures against Romney's 43-endpoint API Catalog to identify coverage and gaps.

---

## Architecture Context

The RIO system has two layers:
- **Gateway** (Romney's domain): REST API on Render, 43 endpoints, PostgreSQL, handles the 7-stage pipeline
- **Proxy** (Manny's domain): tRPC on Manus, handles HITL approval UX, local key management, connector dispatch

The proxy is a **client** of the gateway for some operations, and an **independent governance layer** for others. Not all 43 gateway endpoints need proxy-side equivalents.

---

## Mapping Table

| # | Gateway Endpoint | Proxy tRPC Equivalent | Coverage | Notes |
|---|-----------------|----------------------|----------|-------|
| 1 | POST /login | Manus OAuth (built-in) | DIFFERENT | Proxy uses Manus OAuth, not JWT login |
| 2 | GET /whoami | auth.me | COVERED | Returns current user from session |
| 3 | POST /intent | proxy.createIntent | COVERED | Creates intent with risk assessment |
| 4 | POST /govern | (inline in createIntent) | COVERED | Risk assessment happens at intent creation |
| 5 | POST /authorize | proxy.approve | COVERED | Human approval with signature binding |
| 6 | POST /execute | proxy.execute | COVERED | 8-preflight gate + connector dispatch |
| 7 | POST /execute-confirm | (inline in execute) | COVERED | Confirmation is part of execution flow |
| 8 | POST /receipt | (inline in execute) | COVERED | Receipt generated automatically after execution |
| 9 | GET /ledger | proxy.ledger | COVERED | Returns full ledger with hash chain |
| 10 | GET /verify | proxy.verifyChain | COVERED | Verifies SHA-256 hash chain integrity |
| 11 | GET /health | (no equivalent) | NOT NEEDED | Gateway health, not proxy concern |
| 12 | GET /intents | proxy.status (includes recentIntents) | COVERED | Status endpoint returns intent list |
| 13 | GET /intent/:id | proxy.intentDetail | COVERED | Full intent detail with approval/execution state |
| 14-25 | /api/v1/* | (no equivalent) | NOT NEEDED | Public API v1 is gateway-only (external consumers) |
| 26-29 | /api/v1/keys/* | (no equivalent) | NOT NEEDED | API key management is gateway-only |
| 30 | POST /api/signers/generate-keypair | (browser-side Web Crypto) | DIFFERENT | Proxy generates keys in browser, not server |
| 31 | POST /api/signers/register | proxy.onboard | COVERED | Onboarding registers public key |
| 32 | GET /api/signers | (no equivalent) | GAP | Could add signer list to admin UI |
| 33 | GET /api/signers/:signer_id | (no equivalent) | GAP | Could add signer detail |
| 34 | DELETE /api/signers/:signer_id | (no equivalent) | GAP | Signer revocation not implemented |
| 35 | POST /api/key-backup | proxy.backupKey | COVERED | Encrypted key backup to server |
| 36 | GET /api/key-backup/:signer_id | proxy.getBackup | COVERED | Retrieve encrypted backup |
| 37 | GET /api/key-backup | (no equivalent) | MINOR GAP | List all backups (single-user system, low priority) |
| 38 | DELETE /api/key-backup/:signer_id | (no equivalent) | MINOR GAP | Delete backup |
| 39 | POST /api/sync | sync.pull | COVERED | Full device sync with ledger |
| 40 | GET /api/sync/health | sync.health | COVERED | Ledger health check |
| 41 | POST /api/kill | proxy.kill | COVERED | Kill switch with ledger entry |
| 42 | GET /api/sync (proxy) | proxy.status | COVERED | Full proxy state |
| 43 | POST /api/onboard | proxy.onboard | COVERED | User onboarding with key registration |

---

## Summary

| Category | Count | Details |
|----------|-------|---------|
| COVERED | 22 | Direct tRPC equivalent exists |
| DIFFERENT | 2 | Different approach (Manus OAuth vs JWT, browser keygen vs server keygen) |
| NOT NEEDED | 14 | Gateway-only endpoints (Public API v1, API keys, health) |
| GAP | 3 | Signer list, signer detail, signer revocation |
| MINOR GAP | 2 | List all backups, delete backup |

### Gaps to Address (Priority)

1. **Signer revocation** (DELETE /api/signers/:signer_id) — Important for security. Should be added to proxy for key rotation scenarios.
2. **Signer list** (GET /api/signers) — Useful for admin UI showing registered keys.
3. **Signer detail** (GET /api/signers/:signer_id) — Low priority, single-user system.

### Not Needed (By Design)

The Public API v1 endpoints (14-29) are for external consumers hitting the gateway directly. The proxy doesn't need to replicate these — it's a different access pattern (human-in-the-loop UX vs programmatic API).
