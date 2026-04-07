# RIO System — Complete Definition

> **RIO converts AI actions into human-authorized, policy-controlled, cryptographically verifiable transactions.**

RIO is a closed-loop governed execution system. It sits between AI agents, humans, and real-world actions. The system enforces the rules — not the AI.

---

## Core Loop

Every action in RIO follows the same fixed sequence. There are no exceptions and no alternative paths.

| Step | What Happens | Component |
|------|-------------|-----------|
| 1 | AI proposes intent | Observer (Mantis) |
| 2 | Policy evaluates risk | Governance Engine |
| 3 | Human approves (if required) | Governor (via ONE) |
| 4 | Gateway executes | Executor (Gateway) |
| 5 | Receipt is generated | Receipt Protocol |
| 6 | Ledger records proof | Ledger (hash-chained) |
| 7 | System learns (controlled) | Feedback Loop |

```
Intent → Govern → Approve → Execute → Receipt → Ledger
```

---

## Three-Power Separation

No single component can both decide and act.

| Power | Role | Can Do | Cannot Do |
|-------|------|--------|-----------|
| Observer (Mantis) | See everything | Ingest goals, structure intent, assess risk | Approve or execute |
| Governor | Decide | Evaluate policy, issue/deny approval tokens | Execute |
| Executor (Gateway) | Act | Execute with valid token, produce receipt | Approve |

This separation is architectural, not advisory. It is enforced by the Gateway at runtime.

---

## System Guarantee

No action with real-world consequences can occur without:

1. **Governance** — policy evaluation and risk classification
2. **Authorization** — human approval when required by policy
3. **Proof** — cryptographic receipt written to a hash-chained ledger

If any of these three conditions cannot be met, the action does not execute. The system fails closed.

---

## Repository Map

| Repository | Contents | Visibility |
|-----------|----------|------------|
| **rio-system** (this repo) | Gateway, policy engine, ONE interface, connectors, deployment | Private |
| **rio-receipt-protocol** | Receipt format, hash chain spec, verifier, conformance tests | Public |

The receipt protocol is the proof layer — open standard, zero dependencies. The governance engine (this repo) is the control plane — policy, authorization, execution, and operational infrastructure.

---

## How the Pieces Fit

```
┌─────────────────────────────────────────────┐
│  AI Agent (proposes intent)                 │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Policy Engine (risk + rules)               │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  ONE Interface (human approval)             │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Gateway (token validation + execution)     │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Connectors (Gmail, Twilio, etc.)           │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Receipt + Ledger (proof layer)             │
└─────────────────────────────────────────────┘
```

---

## Next Steps

To understand the system in 2 minutes, read [How to Understand RIO](HOW_TO_UNDERSTAND_RIO.md).

To see the full architecture specification, read [Architecture v2.7](ARCHITECTURE_v2.7.md).

To ask implementation questions, use [Ask Bondi](https://riodemo-ux2sxdqo.manus.space/ask).
