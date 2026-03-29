# RIO Governance Gateway

The RIO Gateway is a standalone Node.js Express service that sits between AI systems and execution tools. It enforces governance before any action is executed.

**Fail Mode: CLOSED.** No authorization → no execution.

## Pipeline

```
Intent → Governance → Risk → Authorization → Execution → Receipt → Ledger → Verification
```

## Quick Start

```bash
cd gateway
npm install
npm start        # Production: port 4400
npm run dev      # Development: auto-restart on changes
npm test         # Run test suite
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/intent` | Submit an intent from any AI agent |
| POST | `/govern` | Run policy + risk evaluation |
| POST | `/authorize` | Record human approval or denial |
| POST | `/execute` | Execute an authorized action (simulated for MVP) |
| POST | `/receipt` | Generate cryptographic receipt |
| GET | `/ledger` | View ledger entries (supports `?intent_id=`, `?limit=`, `?offset=`) |
| GET | `/verify` | Verify hash chain integrity (supports `?intent_id=`) |
| GET | `/health` | System health check |
| GET | `/intents` | List all intents (supports `?status=`, `?limit=`) |
| GET | `/intent/:id` | Get a specific intent with full pipeline state |

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

## Configuration

Governance config files are in `config/rio/`:

- `RIO_CONSTITUTION.json` — Core governance rules and invariants
- `RIO_POLICY.json` — Build Authority / Deploy Boundary policy
- `RIO_ROLE_MANUS.json` — Manus execution agent role
- `RIO_ROLE_GEMINI.json` — Gemini verification agent role

The gateway will not start if any config file is missing (fail closed).

## Architecture

```
gateway/
├── server.mjs                  # Express server entry point
├── config/rio/                 # Governance configuration
│   ├── RIO_CONSTITUTION.json
│   ├── RIO_POLICY.json
│   ├── RIO_ROLE_MANUS.json
│   └── RIO_ROLE_GEMINI.json
├── governance/                 # Policy engine
│   ├── config.mjs              # Config loader
│   ├── policy.mjs              # Policy evaluator
│   └── intents.mjs             # Intent state machine
├── ledger/                     # Append-only hash-chained ledger
│   └── ledger.mjs
├── receipts/                   # Cryptographic receipt generation
│   └── receipts.mjs
├── routes/                     # API route handlers
│   └── index.mjs
├── data/                       # Persisted ledger data (auto-created)
│   └── ledger.json
└── tests/                      # Test suite
    └── gateway.test.mjs
```

## Governance Rules

1. Human is final authority
2. AI may think and plan freely
3. AI cannot execute without authorization
4. All executions must generate receipts
5. All receipts must be stored in ledger
6. System fails closed on uncertainty

## Part of ONE

This gateway is a component of the **ONE** system — a governed AI command center. It provides the governance and execution control layer that enforces policy, authorization, and receipt generation before any real-world action occurs.
