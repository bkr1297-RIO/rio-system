# RIO / ONE Platform Specification v1.0 — Outline & Assignments

> **Status:** DRAFT
> **Last Updated:** 2026-04-04
> **Owner:** Chief of Staff

This document outlines the canonical platform specification that all agents, developers, and future customers will build against. It marks the transition from project to platform.

## The 15-Part Specification

| # | Section | Current Status | Owner / Next Action |
|---|---|---|---|
| 1 | One-sentence architecture | ✅ Exists in `RIO_REFERENCE_ARCHITECTURE.md` | **CoS:** Consolidate into master spec |
| 2 | The 7 invariants | ✅ Exists in `RIO_SYSTEM_INVARIANTS.md` | **CoS:** Consolidate into master spec |
| 3 | The 9-stage lifecycle | ✅ Exists in `RIO_REFERENCE_ARCHITECTURE.md` | **CoS:** Consolidate into master spec |
| 4 | Role separation | ✅ Exists in `RIO_REFERENCE_ARCHITECTURE.md` | **CoS:** Consolidate into master spec |
| 5 | System components | ✅ Exists in `RIO_REFERENCE_ARCHITECTURE.md` | **CoS:** Consolidate into master spec |
| 6 | `governed_action()` API definition | ⚠️ Partial (`API_CATALOG_v2.7.md`) | **Andrew/Romney:** Draft formal API spec |
| 7 | Receipt schema (JSON) | ✅ Exists in `receipt.schema.json` | **CoS:** Link/embed |
| 8 | SDK structure | ✅ Exists in `rio-receipt-protocol/` | **Damon:** Document SDK architecture |
| 9 | Deployment architecture (Docker) | ✅ Exists in `DOCKER_DEPLOYMENT.md` | **Andrew:** Review and finalize |
| 10 | Agent Work Protocol | ✅ Exists in `RIO_AGENT_WORK_PROTOCOL.md` | **CoS:** Consolidate into master spec |
| 11 | Definition of Done | ✅ Exists in `RIO_AGENT_WORK_PROTOCOL.md` | **CoS:** Consolidate into master spec |
| 12 | Security model | ❌ Missing unified document | **Andrew/Romney:** Draft security model |
| 13 | Async approval / queue model | ⚠️ Exists in code, needs spec | **Manny:** Document queue architecture |
| 14 | Connector model | ⚠️ Exists in code, needs spec | **Manny:** Document connector architecture |
| 15 | Ledger architecture | ⚠️ Exists in code, needs spec | **Andrew/Romney:** Draft ledger architecture |

## Ecosystem Mapping (The 5 Layers)

1. **Interface Layer:** ONE (what user sees)
2. **Intelligence Layer:** AI agents (OpenAI, Anthropic, etc.)
3. **Governance Layer:** RIO policy + approval
4. **Execution Layer:** Gateway + APIs (Google, Slack, etc.)
5. **Proof Layer:** Receipts + Ledger

## Next Steps (The Build Loop)

1. **Build:** Manny implements missing pieces (TTL, Batch, Versioning, SLA, MFA, PII).
2. **Document:** Chief of Staff consolidates existing docs into the v1.0 Spec.
3. **Architect:** Systems Architect (Romney/Andrew) drafts missing architecture specs (API, Security, Ledger).
4. **Audit:** External agents (Grok/Gemini/Claude) stress-test the spec.
5. **Improve:** Refine based on audit feedback.
6. **Implement:** Finalize code to match the audited spec.
