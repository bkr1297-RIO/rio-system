# RIO Governance Gateway

The RIO Gateway is a standalone Node.js Express service that sits between AI systems and execution tools. It enforces governance before any action is executed.

**Fail Mode: CLOSED.** No authorization = no execution.

**Production URL:** `https://rio-gateway.onrender.com`
**Version:** 2.9.0

---

## Pipeline

```
Human → Bondi → Generator → Rio → Governor → Gate → Action → Receipt + Ledger
```

---

## Quick Start

```bash
cd gateway
npm install
npm start        # Production: port 4400
npm run dev      # Development: auto-restart on changes
npm test         # Run test suite
```

**Environment variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ED25519_PRIVATE_KEY` | Yes | Base64-encoded Ed25519 signing key |
| `ED25519_PUBLIC_KEY` | Yes | Base64-encoded Ed25519 verification key |
| `API_KEYS` | No | Comma-separated API keys for /api/v1 access |
| `PORT` | No | Server port (default: 4400) |

---

## API Endpoints

### Core Pipeline

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/intent` | Optional | Submit an intent from any AI agent |
| POST | `/govern` | Optional | Run policy + risk evaluation |
| POST | `/authorize` | Optional | Record human approval or denial |
| POST | `/execute` | Optional | Execute an authorized action |
| POST | `/execute-confirm` | Optional | Confirm execution with token |
| POST | `/receipt` | Optional | Generate cryptographic receipt |
| GET | `/ledger` | None | View ledger entries (`?intent_id=`, `?limit=`, `?offset=`) |
| GET | `/verify` | None | Verify hash chain integrity (`?intent_id=`) |
| GET | `/health` | None | System health check |
| GET | `/intents` | None | List all intents (`?status=`, `?limit=`) |
| GET | `/intent/:id` | None | Get a specific intent with full pipeline state |

### Signer Management (`/api/signers`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/signers` | Bearer | Rotate or create signing keys |
| POST | `/api/signers/register` | Owner | Register a new signer identity |
| GET | `/api/signers` | Bearer | List all registered signers |
| GET | `/api/signers/:id` | Bearer | Get a specific signer |

### Key Backup (`/api/key-backup`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/key-backup` | Bearer | Store encrypted key backup |
| GET | `/api/key-backup/:id` | Bearer | Retrieve key backup |
| GET | `/api/key-backup` | Bearer | List all key backups |

### Device Sync (`/api/sync`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/sync` | Bearer | Push device sync state |
| GET | `/api/sync/health` | None | Sync service health check |

### Proxy / Onboarding (`/api`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/onboard` | None | Onboard a new proxy agent |
| POST | `/api/kill` | Bearer | Emergency kill switch |
| GET | `/api/receipts/recent` | None | Public feed of recent receipts |

### Public API v1 (`/api/v1`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| All v1 routes | `/api/v1/*` | API Key | Rate-limited public API access |

For the complete endpoint catalog, see the tables above and the gateway source in `routes/index.mjs`.

---

## Example: Full Pipeline

```bash
# 1. Submit intent
curl -X POST http://localhost:4400/intent \
  -H "Content-Type: application/json" \
  -d '{"action":"send_email","agent_id":"MANUS","parameters":{"to":"user@example.com","subject":"Test"},"confidence":95}'

# 2. Govern (use the intent_id from step 1)
curl -X POST http://localhost:4400/govern \
  -H "Content-Type: application/json" \
  -d '{"intent_id":"<INTENT_ID>"}'

# 3. Authorize
curl -X POST http://localhost:4400/authorize \
  -H "Content-Type: application/json" \
  -d '{"intent_id":"<INTENT_ID>","decision":"approved","authorized_by":"brian.rasmussen"}'

# 4. Execute
curl -X POST http://localhost:4400/execute \
  -H "Content-Type: application/json" \
  -d '{"intent_id":"<INTENT_ID>"}'

# 5. Receipt
curl -X POST http://localhost:4400/receipt \
  -H "Content-Type: application/json" \
  -d '{"intent_id":"<INTENT_ID>"}'

# 6. Verify
curl http://localhost:4400/verify?intent_id=<INTENT_ID>

# 7. View ledger
curl http://localhost:4400/ledger
```

---

## Configuration

Governance config files are in `config/rio/`:

| File | Description |
|------|-------------|
| `RIO_CONSTITUTION.json` | Core governance rules and invariants |
| `RIO_POLICY.json` | Build Authority / Deploy Boundary policy |
| `RIO_ROLE_MANUS.json` | Manus execution agent role |
| `RIO_ROLE_GEMINI.json` | Gemini verification agent role |

The gateway will not start if any config file is missing (fail closed).

---

## Architecture

```
gateway/
├── server.mjs                  # Express server entry point
├── config/rio/                 # Governance configuration
│   ├── RIO_CONSTITUTION.json
│   ├── RIO_POLICY.json
│   ├── RIO_ROLE_MANUS.json
│   └── RIO_ROLE_GEMINI.json
├── governance/                 # governor_policy_engine
│   ├── config.mjs              # Config loader (fail-closed)
│   ├── policy.mjs              # Policy evaluator + kill switch
│   └── intents.mjs             # Intent state machine
├── execution/                  # execution_gate
│   └── gate.mjs                # Token validation, single-use enforcement
├── ledger/                     # ledger_service — append-only hash-chained
│   ├── ledger-pg.mjs           # PostgreSQL-backed ledger
│   ├── ledger.mjs              # In-memory ledger (development)
│   └── init.sql                # Database schema
├── receipts/                   # receipt_service — cryptographic receipt generation
│   └── receipts.mjs            # Ed25519 signatures, Receipt Spec v2.1
├── security/                   # Security middleware
│   └── auth.mjs                # Bearer auth, replay prevention
├── routes/                     # API route handlers
│   ├── index.mjs               # Core pipeline routes
│   ├── signers.mjs             # Signer management
│   ├── key-backup.mjs          # Encrypted key backup
│   ├── sync.mjs                # Device sync
│   ├── proxy.mjs               # Onboard, kill switch, receipts feed
│   └── api-v1.mjs              # Public API v1 (rate-limited)
├── monitoring/                 # System monitoring
│   ├── admin_health.mjs        # Health metrics
│   ├── alert_dispatcher.mjs    # Alert routing
│   └── ledger_integrity_job.mjs # Hash chain integrity checks
└── tests/                      # Test suite
    └── gateway.test.mjs
```

---

## Governance Rules

1. Human is final authority
2. AI may think and plan freely
3. AI cannot execute without authorization
4. All executions must generate receipts
5. All receipts must be stored in ledger
6. System fails closed on uncertainty
7. Three-Power Separation: Rio Interceptor, Governor (Policy Engine), Execution Gate are architecturally separate
8. No single component can both decide and act

---

## Part of RIO

This gateway is the reference implementation of the [RIO Protocol](../README.md) — governed execution infrastructure for AI systems. It provides the governance and execution control layer that enforces policy, authorization, and receipt generation before any real-world action occurs.

For specifications, see [`/spec`](../spec/). For architecture documentation, see [`/docs`](../docs/).
