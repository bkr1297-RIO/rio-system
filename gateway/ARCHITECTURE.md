# RIO Governance Gateway — Architecture

[Back to README.md](../../README.md)

This document provides a detailed overview of the RIO Governance Gateway's architecture. For information on how to contribute to the project, please see [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Overview

The RIO Gateway is a standalone Node.js Express service that sits between AI systems and execution tools. It enforces governance before any action is executed.

## Pipeline

```
Intent → Governance → Risk → Authorization → Execution → Receipt → Ledger → Verification
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /intent | Submit an intent from any AI agent |
| POST | /govern | Run policy + risk evaluation |
| POST | /authorize | Record human approval/denial |
| POST | /execute | Execute approved action through connector |
| POST | /receipt | Generate cryptographic receipt |
| GET | /ledger | View ledger entries |
| GET | /verify | Verify receipt hash chain integrity |
| GET | /health | System health check |

## Config Files (loaded from /config/rio/)

- `RIO_CONSTITUTION.json` — Core governance rules
- `RIO_POLICY.json` — Build Authority / Deploy Boundary policy (ONE-GOV-DEPLOY-001)
- `RIO_ROLE_MANUS.json` — Manus execution agent role definition
- `RIO_ROLE_GEMINI.json` — Gemini verification agent role definition

## Core Modules

- `server.mjs` — Express server, middleware, route mounting
- `routes/` — One file per endpoint group
- `governance/` — Policy engine, risk evaluator, config loader
- `ledger/` — Append-only hash-chained ledger (SHA-256)
- `receipts/` — Receipt generation and verification
- `config/rio/` — Governance configuration JSON files

## Three-Power Separation

RIO implements a three-power separation model to ensure robust governance and prevent single points of failure. This model separates the functions of **Intent**, **Governance**, and **Execution**.

*   **Intent:** AI systems propose actions.
*   **Governance:** Human authorities review and approve/deny actions.
*   **Execution:** The RIO Gateway executes approved actions.

For more details, refer to the [Three-Power Separation document](spec/THREE_POWER_SEPARATION.md).

## Invariants

1. **Fail Closed** — No authorization → no execution
2. **Hash Chain** — Every ledger entry links to the previous via SHA-256
3. **Receipt Required** — Every execution produces a receipt before ledger write
4. **Human Final Authority** — Authorization requires explicit human approval
