# Appendix: RIO Unified Architecture v1.0

**Version:** 1.0
**Status:** Active

---

## Overview

The RIO Unified Architecture defines the complete system topology: which components exist, what role each plays, and how they interact through governed boundaries.

---

## Components

| Component | Role | Layer |
|-----------|------|-------|
| **RIO** | Governor — authorizes and constrains | Governance |
| **ONE** | Executor — carries out approved actions | Execution |
| **Mantis** | Observer — records and audits | Witness |
| **Gateway** | Router — HTTP entry point for all governed actions | Infrastructure |
| **Gate** | Enforcer — validates tokens before execution | Enforcement |
| **Adapters** | Connectors — hold credentials, execute side effects | Execution |
| **Ledger** | Record — append-only hash chain of all actions | Witness |

---

## Separation of Powers

```
RIO (Governor)     → Defines policy, issues tokens
ONE (Executor)     → Proposes intents, executes approved actions
Mantis (Observer)  → Reads ledger, verifies chain, audits
```

No component crosses its boundary:
- RIO cannot execute
- ONE cannot authorize
- Mantis cannot modify

---

## Execution Flow

```
ONE proposes intent
  → RIO evaluates against policy
    → Human approves (or denies)
      → RIO issues authorization token
        → ONE presents token to Gate
          → Gate validates (8 checks)
            → Adapter executes (holds credentials)
              → Adapter writes receipt
                → Ledger appends entry
                  → Mantis observes
```

---

## Credential Isolation

Credentials exist ONLY inside adapter modules:
- `FakeEmailAdapter` — SMTP credentials (module-private)
- `DriveAdapter` — Drive OAuth token (module-private)
- `FakeFileAdapter` — File system access (module-private)

No other component can access these credentials. The orchestrator dispatches to adapters through the Gate, never directly.

---

## 8 Inventoried Execution Surfaces

As of the governance boundary verification (April 2026):

| # | Surface | Gate |
|---|---------|------|
| 1 | `_sendViaGmail` | Module-private, not exported |
| 2 | `GmailTransportGate.send()` | HMAC-signed, single-use, 30s TTL |
| 3 | `FakeEmailAdapter.sendEmail()` | PhaseTracker + Gate preflight |
| 4 | `FakeFileAdapter.executeFileOp()` | PhaseTracker + Gate preflight |
| 5 | `DriveAdapter.executeDriveOp()` | PhaseTracker + Gate preflight |
| 6 | `dispatchExecution()` | Requires `_gatewayExecution` flag |
| 7 | `invokeLLM()` | Read-only (no side effects) |
| 8 | External `fetch()` | All behind gated connectors |

All 8 are gated. Zero ungated paths exist at this commit.
