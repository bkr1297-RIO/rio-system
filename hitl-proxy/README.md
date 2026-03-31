# RIO HITL Proxy

Human-in-the-Loop governance proxy for the RIO system. Every action flows through intent → risk assessment → approval → preflight checks → execution → ledger.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/hitl/onboard` | Onboard a proxy user |
| POST | `/api/hitl/intent` | Create an intent (risk-scored) |
| POST | `/api/hitl/approval` | Approve or reject an intent |
| POST | `/api/hitl/execute` | Execute an intent (with preflight checks) |
| GET | `/api/hitl/status/:userId` | User status + recent intents/approvals |
| GET | `/api/hitl/ledger` | View audit ledger (last 100) |
| POST | `/api/hitl/kill` | Emergency kill switch |
| GET | `/api/hitl/verify` | Verify hash chain integrity |
| GET | `/api/hitl/health` | Health check |
| GET | `/health` | Health check (root) |

## Invariants

- **P-HUMAN-ROOT-ONLY-YES**: No HIGH or MEDIUM tool execution without explicit human approval
- **P-ALL-ACTIONS-LEDGERED**: Every action is written to the tamper-evident SHA-256 hash chain
- **P-KILL-IS-GLOBAL**: Kill switch immediately blocks all execution and revokes all approvals
- **P-APPROVAL-BOUND**: Approvals are cryptographically bound to tool + argsHash + expiry + maxExecutions

## Deployment

Render auto-deploys from the `main` branch using `render.yaml`.

## Local Development

```bash
npm install
node server.mjs
# Server runs on http://localhost:8080
```

## Testing

```bash
bash test-playbook.sh
```
