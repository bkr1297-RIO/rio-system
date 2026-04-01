# Archive

This directory contains earlier iterations and supporting code from RIO's development history. These files are preserved for reference but are **not part of the current canonical implementation**.

The canonical, production-deployed gateway lives in [`/gateway`](../gateway/).

| Directory | Description |
|-----------|-------------|
| `backend/` | Early Python-based execution gate prototype |
| `frontend/` | Initial frontend scaffold (superseded by demo-site) |
| `client/` | ONE App React client (Manny's work stream, PR #80) |
| `server/` | ONE App Express server and test suite |
| `connectors/` | TypeScript connector stubs (calendar, drive, email) |
| `crypto/` | Cryptographic utility prototypes |
| `database/` | Database schema documentation |
| `drizzle/` | Drizzle ORM migration files |
| `hitl-proxy/` | Human-in-the-loop proxy prototype |
| `ledger/` | Early ledger implementation (now in gateway/ledger) |
| `monitoring/` | Standalone monitoring scripts (alerting, health checks) |
| `patches/` | Dependency patches (wouter) |
| `receipts/` | Sample receipt documents and early receipt formats |
| `reserve-builds/` | Static HTML builds (executive one-pager, verify page) |
| `rio-receipt-protocol/` | Receipt protocol SDK with Python and JS examples |
| `session-logs/` | Development session logs |
| `shared/` | Shared TypeScript types and constants |
| `sync/` | Agent coordination sync files |
| `tests/` | Verification test scripts and demo recordings |
| `verification_logs/` | Test run result logs |

For the current system, see:
- **Gateway**: [`/gateway`](../gateway/) — Production governance pipeline
- **Specifications**: [`/spec`](../spec/) — Formal protocol specifications
- **Documentation**: [`/docs`](../docs/) — Architecture, guides, and white papers
- **Corpus**: [`/corpus`](../corpus/) — Governing corpus and policy definitions
