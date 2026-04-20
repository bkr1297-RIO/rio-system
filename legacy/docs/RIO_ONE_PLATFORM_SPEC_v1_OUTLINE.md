# RIO / ONE Platform Specification v1.0 — Outline & Assignments

> **Status:** DRAFT
> **Last Updated:** 2026-04-04
> **Owner:** Chief of Staff

This document outlines the canonical platform specification that all agents, developers, and future customers will build against. It marks the transition from project to platform.

## The 16-Part Specification

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
| 16 | Meta-Governance (Layer 5) | ✅ Exists in `spec/RIO_META_GOVERNANCE.md` | **CoS:** Consolidate into master spec |

## Ecosystem Mapping (The 5 Layers + Meta-Governance)

| Layer | Name | Question | System Component |
|---|---|---|---|
| 1 | Cognition | What could we do? | Agents (OpenAI, Anthropic, etc.) |
| 2 | Governance | Are we allowed to do it? | RIO |
| 3 | Execution | Do it | Gateway + APIs |
| 4 | Witness | What happened? | Receipts + Ledger + Mantis |
| 5 | Meta-Governance | Should the rules change? | Human / Board / Root Authority |
| — | Interface | How does the user interact? | ONE |

## Organizational Structure (Mirrored Governance)

| System Layer | Team Role | Accountable For |
|---|---|---|
| Meta-Governance | Human (Root Authority) | Direction correct |
| Governance | Chief of Staff | Project complete |
| Cognition | Systems Architect | Design correct |
| Build | Developer / Builder | Code works |
| Audit | Auditor / QA | Code correct |
| Execution | DevOps | System runs |
| Witness | Mantis | Logs & metrics |

## Next Steps (The Build Loop)

1. **Build:** Manny implements missing pieces (TTL, Batch, Versioning, SLA, MFA, PII) in the Gateway codebase.
2. **Document:** Chief of Staff consolidates existing docs into the v1.0 Spec.
3. **Architect:** Systems Architect (Romney/Andrew) drafts missing architecture specs (API, Security, Ledger).
4. **Audit:** External agents (Grok/Gemini/Claude) stress-test the spec.
5. **Improve:** Refine based on audit feedback.
6. **Implement:** Finalize code to match the audited spec.
