# RIO Service Registry

**Last Updated:** 2026-04-06  
**Updated By:** COS (Chief of Staff)

Every agent must know what services exist, where they live, and what they do. This is the single source of truth.

---

## Production Services

### 1. RIO Render Gateway

| Field | Value |
|-------|-------|
| **URL** | `https://rio-gateway.onrender.com` |
| **Runtime** | Render (Docker, Node.js) |
| **Built By** | Manus DevOps + Manny |
| **Source** | `gateway/` directory in this repo |
| **Database** | PostgreSQL on Render (`rio-ledger`) |
| **Signature** | Ed25519 |
| **API Style** | REST, snake_case |

**What it does:** Governance engine — intent submission, risk evaluation, policy enforcement, approval routing, execution dispatch, receipt generation (with Ed25519 signatures), and immutable ledger writes. This is the Gateway that the ONE Command Center talks to.

**Key Endpoints:**
- `POST /login` — Authenticate with `user_id` + `passphrase`
- `POST /intents` — Submit a governed intent
- `POST /govern` — Evaluate risk and apply policy
- `POST /approvals/:id` — Approve or deny an intent
- `POST /execute-action` — Full execution pipeline (token → execute → receipt → ledger)
- `GET /health` — System health, ledger count, chain validity, Gmail config status
- `GET /ledger` — Read ledger entries (requires auth)

**Environment Variables (on Render):**
- `DATABASE_URL` — PostgreSQL connection string (auto-injected)
- `JWT_SECRET` — Token signing key
- `ED25519_MODE` — `optional` or `required`
- `RIO_LOGIN_PASSPHRASE` — Login passphrase (currently `rio-governed-2026`)
- `GMAIL_USER` — Gmail address for email execution
- `GMAIL_APP_PASSWORD` — Gmail app password for SMTP

---

### 2. RIO Router Gateway (Replit HITL)

| Field | Value |
|-------|-------|
| **URL** | `https://rio-router-gateway.replit.app` |
| **Runtime** | Replit |
| **Built By** | Manny |
| **Signature** | Ed25519 |
| **API Style** | REST, camelCase |

**What it does:** The HITL (Human-in-the-Loop) governance engine on Replit. Handles the same pipeline as the Render Gateway but with camelCase field names and the `/api/hitl/` prefix. Has tool executors for Gmail, Drive, web search, and more.

**Key Endpoints:**
- `POST /api/hitl/onboard` — Register a new user
- `POST /api/hitl/intent` — Submit a governed intent (`userId`, `agentId`, `toolName`, `toolArgs`)
- `POST /api/hitl/approve` — Approve or deny (`intentId`, `decision: { value, reason }`)
- `POST /api/hitl/execute` — Execute an approved intent (`intentId`, `approvalId`)
- `GET /api/hitl/pending-approvals` — List intents awaiting approval
- `GET /api/hitl/receipts` — Retrieve execution receipts
- `GET /api/hitl/ledger` — Retrieve the full ledger

**Note:** Field names use camelCase (`userId`, `toolName`, `toolArgs`), not snake_case.

---

### 3. B-RASS Sovereign Engine (Named Agent Token)

| Field | Value |
|-------|-------|
| **URL** | `https://fc481cff-f553-4e15-833c-2b694e6cd8a3-00-l8w5dp57agtw.spock.replit.dev` |
| **Runtime** | Replit (Python / Gunicorn) |
| **Engine** | Merkaba Sovereign Engine v1.0.0_Genesis |
| **Signature** | ECDSA secp256k1 |
| **API Style** | REST |

**What it does:** The sovereign identity and intent classification layer. A Python-based cryptographic gate that:
- Classifies intents by domain (architecture, chemistry, construction, language, math) and structural pattern (15 grammar stacks)
- Scores coherence using a composite index (semantic clarity, devotional resonance, fractal similarity)
- Enforces fail-closed gate logic with nonce protection and timestamp validation
- Maintains its own ledger chain (375+ entries, chain valid)
- Uses ECDSA secp256k1 for signatures (different from the Gateway's Ed25519)

**Key Endpoints:**
- `GET /health` — `{"ok": true}`
- `GET /gate/diagnostic` — Engine status, signature algorithm, ledger chain, nonce/timestamp protection
- `GET /telemetry` — Chain health, coherence index, grammar summary, last intake, last mesh
- `GET /ledger` — Ledger entries with hash chain
- `GET /grammar` — 15 structural stacks across 5 domains
- `GET /` — Dashboard UI (HTML)

**Purpose:** This is the "what kind of thing is this" engine. Before the Gateway decides "should this be allowed," the Sovereign Engine classifies the intent's domain, structural pattern, and coherence. It's the identity and classification foundation.

---

## Reference Only (Not Production)

### Demo App

| Field | Value |
|-------|-------|
| **URL** | `https://riodemo-ux2sxdqo.manus.space` |
| **Runtime** | Manus (React + Express + tRPC + TiDB) |
| **Source** | `demo-site/` directory in this repo |
| **Status** | Reference only — not production |

**What it does:** The original proof-of-concept. Has GitHub, Gmail, Slack connectors, 351 passing tests, and a public verification API at `/api/verify`. Proved the governance model works. Superseded by the Render Gateway and Replit Router Gateway.

---

## Control Surfaces

### ONE Command Center

| Field | Value |
|-------|-------|
| **URL** | `https://riocommand-glyfckjy.manus.space` |
| **Runtime** | Manus (React + Tailwind) |
| **Built By** | Manus DevOps (COS) |
| **Source** | Separate Manus webdev project (`rio-one`) |

**What it does:** The human control surface. Login as I-1 or I-2, submit intents, approve actions, view receipts and ledger, execute governed actions. Talks to the Render Gateway.

---

## How They Connect

```
User → ONE Command Center → Render Gateway → [executes action]
                                ↓
                          Receipt + Ledger

B-RASS Sovereign Engine → [intent classification + coherence scoring]
                          (standalone, not yet wired to Gateway)

Replit Router Gateway → [parallel HITL system with tool executors]
                        (same protocol, camelCase fields)
```

**Current state:** The Render Gateway and ONE are the active production loop. The B-RASS engine and Replit Router Gateway are built and running but not yet wired into the ONE → Gateway flow.
