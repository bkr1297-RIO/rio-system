# RIO Demo Site — Infrastructure Code

**Live URL:** https://riodemo-ux2sxdqo.manus.space
**Verification API:** https://riodemo-ux2sxdqo.manus.space/api/verify

This directory contains the core infrastructure code from the RIO demo site. The full demo site is a Manus-hosted React + Express + tRPC application with a TiDB database. This export preserves the governance engine, connectors, and verification API for reference and potential reuse.

## Directory Structure

```
demo-site/
  drizzle/
    schema.ts              — Database schema (intents, approvals, executions, receipts, ledger, policies)
  server/
    api/
      verify-api.ts        — Public REST verification endpoint (CORS-enabled, no auth)
    connectors/
      base.ts              — Connector interface and types
      registry.ts          — Connector registry (maps actions to connectors)
      github.ts            — GitHub connector (create issue, create PR, commit file)
      gmail.ts             — Gmail connector (send email via MCP/OAuth)
      slack.ts             — Slack connector (webhook + interactive approval)
      index.ts             — Connector barrel export
    lib/rio/
      engine.ts            — Core RIO governance engine (1,400+ lines)
      ledger-guard.ts      — Ledger integrity guard (append-only enforcement)
  tests/
    github-connector.test.ts  — GitHub connector governance flow tests (8 tests)
    ledger-verify.test.ts     — Ledger integrity verification tests (16 tests)
```

## Key Capabilities

| Feature | Status | Details |
|---|---|---|
| Persistent Ledger | Production | Hash-chained, append-only, Ed25519-signed |
| Ed25519 Signing | Production | Deterministic key derived from JWT_SECRET |
| Public Verification | Production | `/api/verify/:id` with CORS for cross-origin |
| GitHub Connector | Production | Create issue, create PR, commit file |
| Gmail Connector | Production | Send email via per-user OAuth tokens |
| Slack Connector | Production | Webhook + interactive approval with HMAC-SHA256 |
| Policy Engine | Production | Auto-approve/deny rules, confidence scoring |
| Identity Binding | Production | Approver identity from ctx.user (authenticated session) |

## Test Results

**351 tests passing** across 23 test files (as of 2026-03-29).

## Integration with Standalone Gateway

The standalone gateway (in `/gateway/`) implements the same governance pipeline as a standalone Express service with PostgreSQL. The demo site implements it within the Manus platform using TiDB. Both share the same protocol:

- Same receipt format (v2 with 5-link SHA-256 hash chain)
- Same Ed25519 signature scheme
- Same fail-closed enforcement
- Same connector interface

The verification API at `/api/verify` can be called by the protocol site or any external system to independently verify receipts from the demo site.
