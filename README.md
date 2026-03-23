# RIO — Runtime Intelligence Orchestration

A runtime authorization and audit control system that governs AI-initiated actions.

> AI proposes → Human approves → System executes → System records

See [RIO_SYSTEM_OVERVIEW.md](./RIO_SYSTEM_OVERVIEW.md) for the full system overview, architecture, security model, and verification details.

---

## Repository Structure

```
├── RIO_SYSTEM_OVERVIEW.md   # Full system overview document
├── README.md                # This file
├── frontend/                # Frontend UI (demo site, approval interfaces)
├── backend/                 # Backend services (intent, policy, execution gateway)
├── crypto/                  # Cryptographic signature and verification services
├── ledger/                  # Tamper-evident ledger and hash chain logic
├── database/                # Database schemas, migrations, and models
└── tests/                   # Test suites (approval flow, denial flow, ledger integrity)
```

---

## Core Principle

The AI does not execute actions. The system controls execution. Execution without approval is structurally blocked by the server.
