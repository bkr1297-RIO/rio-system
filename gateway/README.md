# RIO Governance Gateway

The RIO Gateway is a Node.js Express service that sits between AI systems and execution tools. It enforces governance before any action is executed.

**Fail mode:** closed. No authorization means no execution.

**Version:** 2.9.0

---

## Runtime Pipeline

```text
Signal → Proposal → Policy → Authorization → Execution Gate → Execute → Receipt → Ledger
```

SPG-M adds a non-executing pattern-governance layer before and during policy review:

```text
Pattern signal → SPG-M intake/review → RIO governance context → authorization boundary
```

---

## Quick Start

```bash
cd gateway
npm install
npm start
npm run dev
npm test
```

SPG-M verification:

```bash
npm run test:spgm
npm run test:spgm:policy-review
npm run test:spgm:govern
npm run test:spgm:openapi
```

---

## Core Routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/intent` | Submit an intent |
| POST | `/govern` | Run governance |
| POST | `/authorize` | Record approval or denial |
| POST | `/execute` | Execute authorized intent |
| POST | `/execute-confirm` | Confirm execution |
| POST | `/receipt` | Generate receipt |
| GET | `/ledger` | View ledger |
| GET | `/verify` | Verify hash chain |
| GET | `/health` | Health check |

---

## SPG-M Routes and Bridges

| Method | Path | Purpose |
|---|---|---|
| GET | `/spgm/status` | SPG-M capability report |
| POST | `/spgm/intake` | Non-executing pattern-governance intake |
| POST | `/spgm/policy-review` | Non-executing RIO review preview |
| POST | `/govern` | Accepts optional SPG-M review metadata |
| POST | `/api/v1/intents/:id/govern` | Accepts optional SPG-M review metadata |

SPG-M metadata may increase review requirements. It may not approve, execute, issue tokens, generate receipts, create memory, or bypass the Execution Gate.

---

## Public API v1

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/intents` | Submit intent |
| GET | `/api/v1/intents` | List intents |
| POST | `/api/v1/intents/:id/govern` | Run governance |
| POST | `/api/v1/intents/:id/authorize` | Authorize or deny |
| POST | `/api/v1/intents/:id/execute` | Execute authorized intent |
| POST | `/api/v1/intents/:id/confirm` | Confirm execution |
| POST | `/api/v1/intents/:id/receipt` | Generate receipt |
| GET | `/api/v1/docs` | OpenAPI contract |

Public API v1 governance supports optional SPG-M review metadata. See:

```text
gateway/spgm/API_V1_GOVERN_BRIDGE.md
gateway/spgm/examples/api-v1-govern-with-spgm-review.request.json
gateway/spgm/examples/api-v1-govern-with-spgm-review.response.json
```

---

## Runtime Architecture

```text
gateway/
  server.mjs
  routes/
    index.mjs
    api-v1.mjs
    spgm.mjs
    spgm-govern.mjs
    spgm-api-v1-govern.mjs
  spgm/
    intake.mjs
    policy-context.mjs
    policy-adapter.mjs
    policy-review.mjs
    govern-request.mjs
  governance/
    policy-engine.mjs
    spgm-policy-bridge.mjs
  ledger/
  receipts/
  security/
  tests/
```

---

## Key Docs

```text
../SYSTEM_RUNTIME_MAP.md
../docs/SPG_M_RUNTIME_PLACEMENT.md
spgm/VERIFY_INTAKE.md
spgm/VERIFY_POLICY_REVIEW.md
spgm/GOVERN_REQUEST_BRIDGE.md
spgm/API_V1_GOVERN_BRIDGE.md
spgm/CI_VERIFICATION.md
```

---

## CI

SPG-M gateway tests run through GitHub Actions:

```text
../.github/workflows/spgm-gateway-tests.yml
```

The workflow covers intake, policy review, govern bridge, and OpenAPI contract tests.

---

## Governance Rules

1. Human authority remains primary.
2. AI may prepare, propose, classify, and route.
3. AI cannot execute without authorization.
4. All executions must generate receipts.
5. All receipts must be stored in the ledger.
6. The system fails closed on uncertainty.
7. SPG-M may increase governance weight only.
8. No component can both decide and act.

---

## One-Line Summary

Human-led. Machine-operated. Governed by protocol. Proven by receipts.
