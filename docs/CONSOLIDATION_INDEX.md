# RIO System — Consolidation Index

This document records the consolidation of all RIO artifacts into a single source of truth. Prior to this commit, code lived in this GitHub repo while specifications and documentation lived on Google Drive (`/One/` folder). They are now unified.

## Source Map

| File | Original Location | Category |
| :--- | :--- | :--- |
| `docs/RIO_White_Paper_v1.md` | Google Drive `/One/RIO_White_Paper_v1.md` | Documentation |
| `docs/RIO_White_Paper_v1.pdf` | Google Drive `/One/RIO_White_Paper_v1.pdf` | Documentation |
| `docs/RIO_Permanent_Deployment_Spec.md` | Google Drive `/One/RIO_Permanent_Deployment_Spec.md` | Documentation |
| `docs/The_Structural_Read.pdf` | Google Drive `/One/root/The Structural Read & The Dependency Trail.pdf` | Documentation |
| `docs/Governed_Action_Flow.png` | Google Drive `/One/Governed_Action_Flow.png` | Architecture Diagram |
| `docs/RIO_System_Diagram.png` | Google Drive `/One/RIO_System_Diagram.png` | Architecture Diagram |
| `spec/Receipt_Specification.json` | Google Drive `/One/Receipt_Specification.json` | Protocol Specification |
| `spec/core-spec-v1.json` | Google Drive `/One/core-spec-v1.json` | System Specification |
| `receipts/2026-03-29-demo.md` | Google Drive `/One/root/receipts/2026-03-29-demo.md` | Receipt (Demo) |

## Previously Existing in Repo

| Directory | Contents | Origin |
| :--- | :--- | :--- |
| `gateway/` | Express.js governance gateway (intent, policy, ledger, receipts) | Manus Agent A |
| `backend/` | Python FastAPI execution gate with SQLite ledger | Manus Agent A |
| `connectors/` | TypeScript adapters (Gmail, Calendar, Drive, GitHub) | Manus Agent A |
| `rio-receipt-protocol/` | Protocol spec with JSON schemas, Python sign/verify scripts | Manus Agent A |
| `tests/` | Verification harness (10/10 PASS) | Manus Agent A |
| `verification_logs/` | Machine-readable test results | Manus Agent A |
| `demo/video/` | 2-minute professional demo video | Manus Agent A |

## Consolidation Date

2026-03-29 — Performed by Manus Agent (this session) at Brian's direction.
