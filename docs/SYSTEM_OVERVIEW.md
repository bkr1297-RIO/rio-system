# RIO System — Complete Definition

> **RIO converts AI actions into human-authorized, policy-controlled, cryptographically verifiable transactions.**

RIO is a closed-loop governed execution system. It sits between AI agents, humans, and real-world actions. The system enforces the rules — not the AI.

---

## Core Loop

Every action in RIO follows the same fixed sequence. There are no exceptions and no alternative paths.

| Step | What Happens | Component |
|------|-------------|-----------|
| 1 | Human states intent | Bondi Interface (`bondi_interface`) |
| 2 | Structured action generated | Generator (`generator_service`) |
| 3 | Intent intercepted, risk assessed | Rio Interceptor (`rio_interceptor`) |
| 4 | Policy evaluates risk | Governor (`governor_policy_engine`) |
| 5 | Human approves (if required) | Human via ONE |
| 6 | Gate validates token, executes | Execution Gate (`execution_gate`) |
| 7 | Receipt is generated | Receipt Service (`receipt_service`) |
| 8 | Ledger records proof | Ledger Service (`ledger_service`) |

```
Human → Bondi → Generator → Rio → Governor → Gate → Action → Receipt + Ledger
```

---

## Three-Power Separation

No single component can both decide and act.

| Power | Role | Can Do | Cannot Do |
|-------|------|--------|-----------|
| Rio Interceptor (`rio_interceptor`) | Intercept | Receive intents, assess risk, route to governance | Approve or execute |
| Governor (`governor_policy_engine`) | Decide | Evaluate policy, issue/deny approval tokens | Execute |
| Execution Gate (`execution_gate`) | Act | Validate token, dispatch action, produce receipt | Approve |

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
│  Human (states intent via Bondi)            │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Generator (structured action proposal)     │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Rio Interceptor (risk + routing)           │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Governor (policy evaluation)               │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  ONE Interface (human approval)             │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Execution Gate (token + dispatch)          │
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
