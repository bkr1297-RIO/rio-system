# ONE App — Architecture Document

**Version:** 1.0
**Date:** 2026-03-31
**Status:** Phase 2 — Production User Interface

---

## Overview

The ONE App is the production user interface for RIO — the first real application where a human owner manages AI-governed actions through a unified dashboard. It transforms the demo site into a functional product that Brian (or any RIO owner) can use to:

- **Approve or deny** AI-initiated actions in real time
- **Browse history** of all governed actions, receipts, and ledger entries
- **Manage policies** that control what AI agents can and cannot do
- **Connect services** (Gmail, Calendar, Drive, GitHub, Slack, Microsoft)
- **Monitor system health** including gateway status and governance mode

---

## Architecture

### Frontend Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/one` | OneAppLayout → Approvals | Authenticated dashboard shell, defaults to approval inbox |
| `/one/approvals` | Approvals.tsx | Pending intents requiring human action |
| `/one/history` | History.tsx | Full history explorer with filters |
| `/one/policies` | Policies.tsx | View/edit governance rules |
| `/one/connections` | Connections.tsx | Manage connected services |
| `/one/settings` | Settings.tsx | Profile, notifications, system info |

### Data Flow

```
User → ONE App UI → tRPC Client → tRPC Server → Governance Router → Gateway Client → Live Gateway
                                                                   ↘ Internal Engine (fallback)
```

All governance operations route through the `governance-router.ts` which dispatches to either:
1. **Live Gateway** (`https://rio-gateway.onrender.com`) when `GATEWAY_URL` is set
2. **Internal Engine** as fallback when gateway is unavailable

### Key Components

- **OneAppLayout** — Sidebar navigation with pending approval badge, user profile, system status
- **Approvals** — Real-time polling (10s interval) for pending intents, approve/deny with mock Ed25519 signatures
- **History** — Merged ledger entries from gateway + internal engine, filterable by status/action/date
- **Policies** — Active rules viewer, learning analytics, accept/dismiss policy suggestions
- **Connections** — OAuth flows for Google, GitHub, Microsoft, Slack services
- **Settings** — Identity info, Ed25519 key scaffolding (placeholder for WS-010), push notifications

### PWA Integration

The ONE App works alongside the existing PWA mobile screens at `/m/*`:
- `/m/approvals` links to `/one/approvals` for full detail view
- `/m/settings` links to `/one/connections` for service management
- Service worker caches ONE App routes for offline access

---

## Existing Demo Preservation

All public demo pages remain at their original routes:
- `/` — Landing page with "Launch ONE App" CTA
- `/demo` — Guided walkthrough
- `/go` — 30-second governance flow
- `/demo1` through `/demo5` — Individual demos
- `/chain`, `/ledger`, `/verify` — Receipt verification tools

The ONE App is the authenticated product layer; demos are the public showcase layer.

---

## Dependencies

- **tRPC** — Type-safe API calls (same procedures used by demos)
- **Manus OAuth** — Authentication (Google OAuth via Manus)
- **Gateway Client** — HTTP client for live RIO gateway
- **Governance Router** — Dual-mode dispatch (gateway + internal)
- **shadcn/ui** — UI components (Card, Badge, Button, Dialog, etc.)

---

## Test Coverage

- `server/one-app.test.ts` — 14 tests covering auth, approvals, history, policies, connections, push, intent creation, routing mode
- Total project: 442 tests passing
