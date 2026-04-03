# RIO System Architecture

## Table of Contents
1. Core Concepts
2. 8-Layer Stack
3. Build Phases
4. Agent Territory Rules
5. Key URLs and Resources

## 1. Core Concepts

RIO (Responsible Intelligence Orchestration) is a governance protocol for AI agent actions. Every action must be proposed, risk-assessed, approved by a human, executed with a signed receipt, and logged to a tamper-evident ledger.

**Fundamental Invariant:** No action executes without human authority, cryptographic proof, and an immutable record.

**Key Entities:**
- **ONE** — the command center UI (React PWA)
- **Bondi** — the orchestrator/planner (LLM-powered chief of staff)
- **RIO** — the governance kernel (risk assessment, policy, approval flow)
- **MANTIS** — the memory/learning system

## 2. 8-Layer Stack (Bottom to Top)

| Layer | Name | Purpose |
|-------|------|---------|
| 1 | Infrastructure | Database, S3, APIs, connectors |
| 2 | Constitution | Fail-closed invariants, kill switch |
| 3 | Governance | Risk tiers, policy rules, approval flow |
| 4 | Interaction | ONE UI, Telegram bot, API endpoints |
| 5 | Context | Session observation, current state |
| 6 | Audit | Receipts, ledger, verification |
| 7 | Mosaic | Cross-session pattern detection |
| 8 | Meta | System self-observation |

**Layers 1-4 are built. Layers 5-8 are the frontier.**

## 3. Build Phases

```
Phase 0 — Protocol: receipts, signing, ledger (DONE)
Phase 1 — Control Plane: RIO gateway, policy, approval, execution (DONE)
Phase 2 — ONE: command center UI (ACTIVE)
Phase 3 — Packaging: SDKs, Docker, self-host deploy (separate agent)
Phase 4 — Witness: independent verification network (future)
```

## 4. Agent Territory Rules

Three agents work in parallel. Brian acts as intermediary.

| Agent | Owns | Does NOT Touch |
|-------|------|----------------|
| ONE Builder | Live PWA, database, tRPC routes, UI | GitHub repo, Google Drive structure |
| Knowledge/Drive | Google Drive folder structure, docs | Code, database, live app |
| Protocol/Packaging | GitHub repo, npm/PyPI, Docker | Live app, Google Drive |

**Shared state:** Google Drive `One/root/` folder. All agents read from it. Only the Knowledge agent writes to it.

## 5. Key URLs and Resources

- **Live app:** rio-one.manus.space
- **GitHub repo:** bkr1297-RIO/rio-system
- **Google Drive entry point:** `One/root/RIO_BUILDER_MAP.md`
- **Architecture docs:** `RIO/01_ARCHITECTURE/`
- **Protocol spec:** `spec/canonical-rules.md` in GitHub repo
