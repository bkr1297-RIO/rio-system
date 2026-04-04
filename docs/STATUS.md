# Status

Current state of the RIO system. Updated by agents as work progresses.

Last updated: 2026-04-04 by Manny

---

## Latest Delivery — Scribe Deliverables: Mirrored Governance + Layer 5 Meta-Governance

**Date:** 2026-04-04
**Agent:** Manny (Builder), integrating work from Bondi (Scribe / OpenAI ChatGPT)
**Delivery:** Two canonical spec documents formalizing the organizational architecture and the meta-governance layer
**Branch:** `main`
**Files:**
- `spec/MIRRORED_GOVERNANCE.md` — Organizational architecture mirroring the system architecture
- `spec/META_GOVERNANCE_SPEC.md` — Layer 5 Meta-Governance specification

**Summary:** The Scribe (Bondi / OpenAI ChatGPT) — who wrote the original invariant logic and algebraic formalization for RIO — delivered two architectural documents that complete the system. Manny formalized both into canonical spec documents and pushed to the repo.

**Mirrored Governance** establishes that the team structure must mirror the system architecture: Human Root Authority → Chief of Staff → Architect / Builder / Auditor / DevOps / Security → Mantis. Every system layer has an accountable role. Every role has defined authorities and prohibitions. The Delivery Protocol mirrors the governed action lifecycle.

**Layer 5 Meta-Governance** completes the architecture by adding the layer that governs the system itself — not actions, but rules. It defines 11 meta-governance controls (policy changes, risk thresholds, model retraining, connector permissions, role permissions, emergency stop, rollback, audit review, incident review, versioning, system constitution) and establishes the core rule: *the system must not be allowed to change its own rules automatically.* Learning flows through Meta-Governance before returning to Cognition, preventing runaway self-modification.

With these two documents, the architecture is complete: Protocol + Gateway + ONE + SDK + Async Approvals + Mirrored Governance + Meta-Governance.

---

## Previous Delivery — Platform Specification v1.0

**Date:** 2026-04-04
**Agent:** Manny (Builder)
**Delivery:** RIO / ONE Platform Specification v1.0 — Canonical Platform Spec
**Branch:** `main`
**File:** `spec/RIO_ONE_PLATFORM_SPEC_v1.0.md`

**Summary:** Produced the canonical platform specification covering all 15 sections required to transition RIO from project to platform. This is the document that all agents, developers, and future customers build against. It defines the contract.

### Sections Covered

| # | Section | Content |
|---|---|---|
| 1 | System Architecture | Three-loop architecture, data flow, component topology |
| 2 | System Invariants | 7 non-negotiable rules (fail-closed, no receipt = no commit, etc.) |
| 3 | Governed Action Lifecycle | 7-stage pipeline: Submit → Govern → Authorize → Execute → Verify → Receipt → Commit |
| 4 | System Roles | I-1, Bondi, Mantis, RIO, ONE — role definitions and boundaries |
| 5 | System Components | Gateway, ONE, Mantis, Receipt Protocol, Ledger — what each does |
| 6 | Governed Action API | Full endpoint reference with request/response schemas |
| 7 | Receipt Schema | 5-hash receipt structure, protocol versioning, verification algorithm |
| 8 | SDK and Developer Integration | JS + Python SDKs, integration patterns (OpenAI, Anthropic, LangChain) |
| 9 | Deployment Architecture | Hosted, self-hosted (Docker), hybrid — infrastructure requirements |
| 10 | Agent Work Protocol | PLAN → BUILD → SELF-CHECK → AUDIT → FIX → APPROVE → COMPLETE → RECORD |
| 11 | Definition of Done | 7 conditions for task completion, governed action commit invariant |
| 12 | Security Model | JWT + API Key + Ed25519 auth layers, replay prevention, token burn, kill switch |
| 13 | Async Approval and Queue Model | Async flow, TTL/expiration, batch approval, SLA metrics |
| 14 | Connector Model | Interface spec, risk classification, registration process, fail-closed rules |
| 15 | Ledger Architecture | Hash chain structure, append-only enforcement, chain verification, integrity monitoring |

Plus: Appendix A (Glossary), Appendix B (Document References).

---

## Previous Delivery — Platform Audit + Enterprise Features

**Date:** 2026-04-04
**Agent:** Chief of Staff
**Delivery:** Manifesto, Ecosystem Map, Platform Spec v1.0 Outline, Build Process Directive
**Branch:** `main`

**Summary:** Processed Brian's three foundational documents (Manifesto, Platform Spec outline, Synthesis). Created the Manifesto as a repo document, formalized the ecosystem mapping, drafted the Platform Spec v1.0 outline with assignments, and committed the Build Process Directive. Also recorded two new decisions: the project-to-platform transition and the build process shift.

**Files delivered:**
- `docs/MANIFESTO.md` — Brian's founding statement for Sovereign ONE
- `docs/architecture/ECOSYSTEM_MAP.md` — 5-layer model, industry mapping, multi-router model
- `docs/RIO_ONE_PLATFORM_SPEC_v1_OUTLINE.md` — 15-section spec outline with status and assignments
- `docs/directives/2026-04-04_BUILD_PROCESS_DIRECTIVE.md` — Formal build process shift
- `docs/DECISIONS.md` — Two new decisions recorded

---

### Previous Delivery

**Date:** 2026-04-04
**Agent:** Manny (Builder)
**Delivery:** Platform Audit + Enterprise Features for Pilot Readiness
**Branch:** `main`

**Summary:** Completed the platform capability audit requested by Brian and CoS. Verified SDK, receipt schema, async approvals, and batch approval capabilities. Implemented six enterprise features required before external pilots.

### Platform Audit Results

| Capability | Status | Evidence |
|---|---|---|
| Receipt schema (JSON) | **Verified** | `rio-receipt-protocol/spec/receipt.schema.json` — full JSON Schema with 3-hash and 5-hash formats |
| Signing + verification (Python + JS) | **Verified** | Python SDK: `rio-receipt-protocol/python/rio_receipt/` (29/29 tests). JS SDK: `rio-receipt-protocol/js/` |
| SDK structure (npm + PyPI) | **Verified** | npm: `@rio-protocol/receipt` v2.2.0. PyPI: `rio-receipt` v2.2.0 |
| Example integration code | **Verified** | `rio-receipt-protocol/examples/basic-usage.mjs`, integration guide with OpenAI/Anthropic/LangChain |
| API endpoints documented | **Verified** | Gateway: `/intent`, `/approve`, `/execute`, `/receipt`, `/verify`, `/ledger`, `/health`. ONE: full tRPC API |
| Async approval queue | **Verified** | Intents persist in PENDING_APPROVAL state, humans approve/reject later, execution only after approval |
| Batch approval | **Implemented** | New `proxy.batchApprove` procedure + multi-select UI on Approvals page |
| Intent → Queue → Approve → Execute → Receipt → Ledger | **Verified** | Full async loop confirmed in live ONE PWA |

**Conclusion:** RIO is a developer platform with SDK + API. The async approval queue exists and works. Batch approval is now implemented.

### Enterprise Features Implemented

| Feature | Status | Details |
|---|---|---|
| Intent expiration (TTL) | **Done** | `expiresAt` column on intents. Enforced at approval time + execution preflight. `proxy.expireStale` sweeps stale intents. |
| Versioned receipt schema | **Done** | `protocolVersion` field (semver) on every receipt. Currently `2.2.0`. |
| Batch approval | **Done** | `proxy.batchApprove` accepts up to 50 intent IDs. Multi-select UI with select-all/approve-all/reject-all. |
| Approval SLA dashboard | **Done** | 6 metrics on Dashboard: queue size, avg time to approve, oldest pending, approved/rejected/expired counts. |
| MFA / hardware key | **Documented** | Architecture defined in `docs/ENTERPRISE_ROADMAP.md`. WebAuthn/FIDO2 design with fallback to software Ed25519. Est. 2-3 days. |
| PII redaction in Mantis | **Documented** | Architecture defined in `docs/ENTERPRISE_ROADMAP.md`. Redaction policy design with encrypted unredacted column. Est. 3-4 days. |

**Files delivered:**
- `docs/ENTERPRISE_ROADMAP.md` — Full enterprise feature roadmap with implemented + planned items, architecture designs for MFA and PII redaction
- ONE PWA: schema migration (expiresAt), db helpers, router procedures, Approvals batch UI, Dashboard SLA card, EXPIRED status across all pages
- `server/enterprise-features.test.ts` — 7 new tests covering TTL, batch approval, expire stale, SLA metrics, versioned receipts

**Test results:** 305 tests passing across 20 test files (all green).

**No decisions needed from Brian.** Implemented features are live. MFA and PII redaction architectures are documented and ready for implementation when pilot onboarding begins.

---

### Previous Delivery

**Date:** 2026-04-03
**Agent:** Chief of Staff
**Delivery:** RIO Agent Work Protocol — Canonical Spec + Overview
**Branch:** `main`

**Summary:** Formalized the RIO Agent Work Protocol as a canonical spec. This defines the agent-to-agent building standard: the 8-step work loop, role separation for agents, Builder Completion Report requirements, Auditor Checklist, Definition of Done, and standardized task statuses. This is the spec that other agents and external builders will follow.

**Files delivered:**
- `spec/RIO_AGENT_WORK_PROTOCOL.md` — Full canonical spec (8 sections)
- `docs/AGENT_WORK_PROTOCOL_OVERVIEW.md` — Shorter quick-reference for agents
- `docs/DECISIONS.md` — Updated with Agent Work Protocol adoption decision

**No decisions needed from Brian.**

---

### Previous Delivery

**Date:** 2026-04-03
**Agent:** Damon (Developer Relations)
**Delivery:** Corrected function names in VERIFY_API_INTEGRATION.md
**Commit:** `[PENDING]` on `main`

**Summary:** Corrected the function names in `VERIFY_API_INTEGRATION.md` Section 2 from `verify_rio_receipt` / `verifyRioReceipt` to the correct `verify_receipt_standalone` / `verifyReceiptStandalone` as per Romney's review.

**Files delivered:**
- `docs/guides/VERIFY_API_INTEGRATION.md` — Updated with correct function names.

---

## Previous Delivery — For Chief of Staff Review

**Date:** 2026-04-03
**Agent:** Damon (Developer Relations)
**Delivery:** Docker Compose Deployment Guide — "Getting Started in 5 Minutes"
**Commit:** `[PENDING]` on `main`

**Summary:** Created a step-by-step guide for developers to deploy RIO locally using Docker Compose. This includes the RIO Gateway and a PostgreSQL ledger database, enabling a "zero to running" experience in under 5 minutes.

**Files delivered:**
- `docs/guides/DOCKER_DEPLOYMENT.md` — Full guide covering prerequisites, quick start, common operations, and troubleshooting.
- `docker-compose.yml` — Moved from archive to root for standard deployment access.

**Key technical details:**
1. Uses Manny's `gateway/Dockerfile` and the PostgreSQL 16-alpine image.
2. Automatically initializes the ledger schema via `gateway/ledger/init.sql`.
3. Configures persistent volumes for both the database (`pgdata`) and Ed25519 keys (`gateway-keys`).
4. Provides a fail-closed default configuration for local development.

---

## Previous Delivery — For Chief of Staff Review

**Date:** 2026-04-03
**Agent:** Chief of Staff
**Delivery:** RIO Reference Architecture, Overview, and Visual Diagrams
**Branch:** `main`

**Summary:** Formalized the canonical RIO Reference Architecture (spec/), created a shorter public-facing Overview (docs/), generated 3 website/deck-ready visual diagrams, defined the RIO-Compliant standard, and recorded the compliance definition in DECISIONS.md.

**Files delivered:**
- `spec/RIO_REFERENCE_ARCHITECTURE.md` — Full canonical spec (12 sections: classification, core model, 7 invariants, 9-stage pipeline, role separation, 8 components, cryptographic guarantees, failure modes, licensing, compliance mapping, strategic direction, one-sentence architecture)
- `docs/RIO_OVERVIEW.md` — Shorter public-facing overview with pipeline, roles, invariants, and RIO-Compliant definition
- `docs/architecture/diagrams/rio-9-stage-pipeline.png` — 9-stage pipeline diagram (website/deck ready)
- `docs/architecture/diagrams/rio-4-roles.png` — 4-role separation diagram with prohibited combinations (website/deck ready)
- `docs/architecture/diagrams/rio-component-architecture.png` — ONE + RIO + Gateway + Ledger component architecture (website/deck ready)
- `docs/DECISIONS.md` — Updated with RIO-Compliant definition

**RIO-Compliant definition:** A system is RIO-compliant if and only if it (1) implements the 9-stage pipeline, (2) enforces 4-role separation, and (3) satisfies all 7 invariants.

**No decisions needed from Brian.**

---

### Previous Delivery

**Date:** 2026-04-03
**Agent:** Romney (Repo / Packaging / Protocol)
**Delivery:** Deployment Program Artifact #5 — Protocol Packaging
**Branch:** `main`

**Summary:** Completed the Protocol Packaging artifact. Set up CI/CD pipeline (3 GitHub Actions workflows), reviewed and signed off on Damon's protocol asset refinements, and verified Docker image for receipt verification.

**Work completed:**
- **CI/CD pipeline** — 3 workflows added to `.github/workflows/`:
  - `ci.yml` — Runs Node.js (20/22) and Python (3.9-3.12) conformance tests on every push and PR. All passing.
  - `publish.yml` — Automatically publishes to npm and PyPI when a version tag (v*.*.*) is pushed. Verifies version match before publishing.
  - `docker.yml` — Builds Docker image and pushes to GitHub Container Registry (ghcr.io) on version tags. Tests image on every push.
- **Repository secrets configured:** `NPM_TOKEN` and `PYPI_TOKEN` added to GitHub Actions secrets.
- **Damon's protocol asset refinements reviewed:**
  - Protocol repo code: **APPROVED** — 38/38 Node.js tests pass, 29/29 Python tests pass, all 8 examples run, CLI verifier works, versions aligned at 2.2.0.
  - Integration guide (`docs/guides/VERIFY_API_INTEGRATION.md`): **NEEDS FIX** — Section 2 references `verify_rio_receipt` (Python) and `verifyRioReceipt` (Node.js) which don't exist. Correct exports are `verify_receipt_standalone` and `verifyReceiptStandalone`. Damon should update.
- **Docker image for receipt verifier:** Already exists (Dockerfile merged in PR #3). Now automatically built and pushed to ghcr.io via the Docker workflow on version tags. Supports: API server, CLI verifier, test runner, and Node.js REPL modes.

**Release workflow (for future versions):**
1. Bump version in `package.json` and `python/pyproject.toml`
2. Commit and push to `main`
3. Tag: `git tag v2.3.0 && git push origin v2.3.0`
4. CI runs tests → Publish workflow pushes to npm + PyPI → Docker workflow pushes image to ghcr.io

**One item for Damon:** Fix the function names in `VERIFY_API_INTEGRATION.md` Section 2 (see review findings above).

**No decisions needed from Brian.**

---

### Previous Delivery

**Date:** 2026-04-03
**Agent:** Manny (Builder)
**Delivery:** Deployment Program Artifact #4 — ONE Demo Readiness
**Branch:** `main`

**Summary:** Completed the ONE Demo Readiness artifact. Dockerized the Gateway server for self-hosted deployment and verified the full governed email loop end-to-end through the ONE PWA.

**Files delivered:**
- `docker-compose.yml` — Top-level Docker Compose file that starts the Gateway + PostgreSQL with one command
- `.env.example` — Fully documented environment configuration with all required and optional variables
- `docs/SELF_HOST_GUIDE.md` — Complete self-hosted deployment guide: prerequisites, quick start, architecture diagram, configuration reference, verification steps, operations guide, security considerations

**Demo flow verified (6 steps, all passing):**
1. Create intent via Bondi chat ("Send an email to demo@example.com")
2. Risk assessment displayed (HIGH risk, blast radius 9/10, affected systems listed)
3. Approval with cryptographic binding (one-click approve, signature recorded)
4. Execution with 8/8 preflight checks (proxy_active, args_hash_match, etc.)
5. Receipt with cryptographic verification (SHA-256 hash valid, chain link valid, approval sig valid)
6. Ledger entry in tamper-evident hash chain (90 entries, chain integrity verified)

**No decisions needed from Brian.** Docker packaging is ready for self-hosted deployment. Demo flow is ready for prospect demonstrations.

---

### Previous Delivery

**Date:** 2026-04-03
**Agent:** Jordan (Knowledge Architect)
**Delivery:** Knowledge Base Sync — Artifact #6 of Deployment Program

**Summary:** Synced Google Drive knowledge base with current repo state. Uploaded 6 new docs that existed in the repo but not in Drive. Updated index.json from v2.1 to v2.2. Updated agent roster from 3 to 7.

**Files synced to Drive:**
- `THREE_POWER_SEPARATION.md` → RIO/01_ARCHITECTURE (from repo `spec/`)
- `MANTIS_COMPONENT.md` → RIO/01_ARCHITECTURE (from repo `spec/`)
- `EMAIL_DEPLOYMENT_ARCHITECTURE.md` → RIO/01_ARCHITECTURE (from repo `docs/architecture/`)
- `PILOT_DEPLOYMENT_PLAYBOOK.md` → RIO/03_CONTROL_PLANE (from repo `docs/enterprise/`)
- `DEPLOYMENT_PACKAGING_CHECKLIST.md` → RIO/03_CONTROL_PLANE (from repo `docs/`)
- `FIRST_DEPLOYMENT_USE_CASE.md` → RIO/03_CONTROL_PLANE (from repo `docs/`)

**index.json changes (v2.1 → v2.2):**
- Added `build_state` section reflecting Phase 0-4 status
- Added `new_files_synced_2026_04_03` entries in 01_ARCHITECTURE and 03_CONTROL_PLANE with Drive IDs and source paths
- Replaced `agent_roles` (3 stale entries) with `team` section (7 members matching repo TEAM.md)
- Added `deployment_program` section with all 6 artifact statuses
- Added `delivery` rule to `rules` section

**No decisions needed from Brian.** This is a sync operation — no new content was created, only existing repo docs copied to their correct Drive folders.

---

### Previous Delivery

**Date:** 2026-04-03
**Agent:** Damon (Developer Relations)
**Delivery:** Docker Compose Deployment Guide — "Getting Started in 5 Minutes"

**Summary:** Created a step-by-step guide for developers to deploy RIO locally using Docker Compose. This includes the RIO Gateway and a PostgreSQL ledger database, enabling a "zero to running" experience in under 5 minutes.

**Files delivered:**
- `docs/guides/DOCKER_DEPLOYMENT.md` — Full guide covering prerequisites, quick start, common operations, and troubleshooting.
- `docker-compose.yml` — Moved from archive to root for standard deployment access.

**Key technical details:**
1. Uses Manny's `gateway/Dockerfile` and the PostgreSQL 16-alpine image.
2. Automatically initializes the ledger schema via `gateway/ledger/init.sql`.
3. Configures persistent volumes for both the database (`pgdata`) and Ed25519 keys (`gateway-keys`).
4. Provides a fail-closed default configuration for local development.

---

### Previous Delivery

**Date:** 2026-04-03
**Agent:** Andrew (Solutions Architect)
**Delivery:** Email Deployment Architecture — First Real Use Case
**Commit:** `cbf5047` on `main`

**Summary:** Completed the ONE Demo Readiness artifact. Dockerized the Gateway server for self-hosted deployment and verified the full governed email loop end-to-end through the ONE PWA.

**Files delivered:**
- `docs/architecture/EMAIL_DEPLOYMENT_ARCHITECTURE.md` — Full deployment document covering all 10 requested items
- `docs/architecture/email-deployment-architecture.png` — Full system architecture diagram
- `docs/architecture/email-simple-flow.png` — Non-technical stakeholder diagram

**No decisions needed from Brian.** Completed deliverable ready for prospect conversations.

---

## What Is Built

### Receipt Protocol (Public — rio-receipt-protocol)

| Component | Status | Owner | Notes |
|-----------|--------|-------|-------|
| Receipt specification | **Done** | Romney | 3-hash and 5-hash formats specified |
| Reference implementation (Node.js) | **Done** | Romney | CLI + programmatic API |
| Reference implementation (Python) | **Done** | Romney | 29/29 conformance tests passing |
| npm package | **Done** | Romney | v2.2.0 published |
| PyPI package | **Done** | Romney | v2.2.0 published |
| Docker REST API | **Done** | Romney | 6 endpoints, PR merged |
| Integration guide | **Done** | Romney | OpenAI, Anthropic, LangChain examples |
| README restructure | **Done** | Romney | Quick Start first, concepts later |
| Public/private boundary audit | **Done** | Romney | rio-overview.md trimmed (PR #5) |
| Ed25519 signature integration | **Done** | Damon | Replaced placeholders in Python and JS |
| Conformance test suite | **Done** | Damon | 6/6 tests passing for real crypto |
| v2.2.0 Spec Alignment | **Done** | Damon | ledger-format.md and signing-rules.md updated |
| SECURITY.md | **Done** | Damon | Vulnerability reporting and threat model added |
| Landing page content | **Done** | Damon | Annotated JSON and proof-point cards drafted |
| Integration guide refinement | **Done** | Damon | Updated VERIFY_API_INTEGRATION.md with SDKs, rate limits, Ed25519 examples, and corrected function names |
| Protocol examples audit | **Done** | Damon | Refined basic-usage.mjs and reference implementations for v2.2.0 alignment |

### ONE Command Center (Private — live at rio-one.manus.space)

| Component | Status | Owner | Notes |
|-----------|--------|-------|-------|
| PWA with manifest + service worker | **Done** | Manny | Installable on iOS/Android, offline-capable |
| Bondi AI orchestrator | **Done** | Manny | OpenAI + Claude dual routing, risk assessment |
| Intent creation + risk classification | **Done** | Manny | 4-tier risk: LOW/MEDIUM/HIGH/CRITICAL |
| HITL approval flow | **Done** | Manny | Ed25519 signed approvals, cryptographic binding |
| Execution gateway | **Done** | Manny | Gmail, Google Search, SMS (Twilio), Google Drive connectors |
| Receipt generation + verification | **Done** | Manny | SHA-256 hash, Ed25519 signature, client-side re-verification |
| Hash-chained ledger | **Done** | Manny | Tamper-evident, chain integrity verification UI |
| Custom policy rules (editable) | **Done** | Manny | Create/edit/toggle/delete rules, risk overrides, conditions |
| In-app notification center | **Done** | Manny | Bell icon, unread count, linked to approvals/executions |
| Kill switch | **Done** | Manny | Emergency stop, rejects all pending, logs to ledger |
| Activity feed + audit views | **Done** | Manny | Filterable by status, risk tier, date range |
| System status dashboard | **Done** | Manny | Component health, uptime, configuration display |
| Learning events tracking | **Done** | Manny | Records outcomes and feedback for future improvement |
| Telegram bot integration | **Done** | Manny | Inline APPROVE/REJECT, receipt notifications, kill switch alerts |
| Intent TTL / expiration | **Done** | Manny | `expiresAt` column, enforced at approval + execution, auto-expire sweep |
| Batch approval | **Done** | Manny | `batchApprove` procedure, multi-select UI with select-all |
| Versioned receipt schema | **Done** | Manny | `protocolVersion` field on every receipt (semver) |
| Approval SLA dashboard | **Done** | Manny | Queue size, avg time to approve, oldest pending, counts |
| EXPIRED status handling | **Done** | Manny | Across all UI pages: Activity, Approvals, IntentDetail, Dashboard |
| Test suite | **Done** | Manny | 305 tests passing (vitest), 20 test files |

### Governance Engine (Private — running inside ONE)

| Component | Status | Owner | Notes |
|-----------|--------|-------|-------|
| Risk assessment engine | **Done** | Manny | Tool-based classification with policy rule overrides |
| Policy enforcement | **Done** | Manny | Built-in rules + custom rules, logged to ledger |
| Approval queue | **Done** | Manny | Pending items with approve/deny + reasoning + batch operations |
| Execution binding | **Done** | Manny | Receipt proves approval-to-execution link |
| Ledger persistence | **Done** | Manny | MySQL/TiDB, hash-chained entries |
| Constitutional invariants | **Done** | Manny | Fail-closed enforcement in code |
| Intent TTL enforcement | **Done** | Manny | Stale intents cannot be approved or executed |

### Gateway Server (Private — rio-system/gateway/)

| Component | Status | Owner | Notes |
|-----------|--------|-------|-------|
| Express server | **In Progress** | Manny | Standalone implementation for self-hosted deployment |
| Ed25519 signing | **Done** | Manny | Key generation, signing, verification |
| OAuth integration | **In Progress** | Manny | Identity binding started |
| API routes | **In Progress** | Manny | 6 routes defined, not all wired |

### Coordination + Knowledge

| Component | Status | Owner | Notes |
|-----------|--------|-------|-------|
| Multi-agent coordination structure | **Done** | Romney | COORDINATION.md + 8 docs |
| Agent skills (5 roles) | **Done** | Manny | rio-system/skills/ — SA, Dev, Compliance, Ops, Builder |
| Google Drive knowledge base | **In Progress** | Jordan | Restructuring into 8-folder layout |
| Master operating prompt | **Done** | Brian | 17-section onboarding prompt for all agents |

---

## Two Implementations — Important Distinction

There are two implementations of the RIO governance engine:

1. **ONE app** (rio-one.manus.space) — The live, production implementation. Built with React + tRPC + Express inside the Manus webdev framework. This is where the full governed execution loop runs end-to-end today. This is the product.

2. **Gateway server** (rio-system/gateway/) — A standalone Express server intended for self-hosted deployment. This is a separate implementation that shares the same concepts but is not yet feature-complete. This is for enterprises who want to run RIO on their own infrastructure.

When checking status, the ONE app is the canonical reference for what works. The gateway is the distribution target for what will be packaged.

---

### Solutions Architect Materials (Private — docs/architecture/)

| Component | Status | Owner | Notes |
|-----------|--------|-------|-------|
| Deployment Options brief | **Done** | Andrew | Hosted, Self-Hosted, Hybrid — with infra requirements and comparison table |
| Integration Patterns guide | **Done** | Andrew | OpenAI, Anthropic, LangChain, Direct HTTP — with code examples |
| Prospect architecture diagram (full) | **Done** | Andrew | Mermaid source + rendered PNG — 4-layer governance flow |
| Prospect pipeline diagram (simple) | **Done** | Andrew | Mermaid source + rendered PNG — 6-stage linear flow |
| First Meeting Overview | **Done** | Andrew | Single document for 30-minute technical introductions |
| Email Deployment Architecture | **Done** | Andrew | Full deployment doc: 10 sections covering components, HITL flow, install requirements, open vs licensed, diagrams |
| Email system architecture diagram | **Done** | Andrew | Mermaid source + rendered PNG — full component and data flow |
| Email simple flow diagram | **Done** | Andrew | Mermaid source + rendered PNG — non-technical stakeholder view |

---

## Deployment Program Status (Phase 3)

We are managing Phase 3 as a deployment program to produce the five artifacts required for a deployable product.

| Document / Artifact | Audience | Owner | Status |
|---|---|---|---|
| **1. Pilot Playbook** | Operations / Compliance | Chief of Staff | **Done** |
| **2. Deployment Architecture** | CTO / Security / IT | Solutions Architect | **Done** |
| **3. Integration Guide** | Developers | Developer Relations | **Done** |
| **4. ONE Demo Readiness** | End Users | Manny | In Progress |
| **5. Protocol Packaging** | Open Source Community | Romney | In Progress |
| **6. Knowledge Base Sync** | Internal | Jordan | In Progress |

---

## Enterprise Readiness Status

| Feature | Status | Priority | Notes |
|---|---|---|---|
| Intent TTL / Expiration | **Done** | P0 | Enforced at approval + execution. Auto-expire sweep. |
| Versioned Receipt Schema | **Done** | P0 | `protocolVersion` field on all receipts (semver). |
| Batch Approval | **Done** | P0 | Up to 50 intents per batch. Multi-select UI. |
| Approval SLA Dashboard | **Done** | P1 | 6 metrics on Dashboard. |
| MFA / Hardware Key | **Planned** | P1 | WebAuthn/FIDO2 architecture documented. Est. 2-3 days. |
| PII Redaction in Mantis | **Planned** | P1 | Redaction policy architecture documented. Est. 3-4 days. |
| Full Docker Compose (ONE+Gateway+Mantis) | **Partial** | P2 | Gateway + PostgreSQL done. ONE PWA pending. |

See `docs/ENTERPRISE_ROADMAP.md` for full architecture designs and implementation plans.

---

## What Is In Progress (Other)

- Google Drive knowledge base reorganization (Jordan)
- Gateway server hardening for standalone deployment (Manny)
- Agent onboarding and testing (Brian)
- RIO Receipt Protocol launch hardening sprint (Damon/Jordan/Romney)
- MFA / hardware key implementation for pilot onboarding (Manny — planned)
- PII redaction middleware for Mantis (Manny — planned)

---

## What Is Blocked

_Nothing currently blocked._

---

## What Is Next
- MFA / hardware key implementation (WebAuthn/FIDO2) — when pilot onboarding begins
- PII redaction middleware for Mantis — when pilot onboarding begins
- Compliance and regulatory mapping (TBD)
- Protocol Packs (domain-specific policy profiles — engineering, legal, medical, financial)
- Learning Loop feedback (learning events improving future Bondi recommendations)
- PWA push notifications (requires VAPID key setup)
- Witness service (independent verification network)
- Gateway server completion for self-hosted deployment
- Developer tutorials and quickstart guides (Damon) [DONE: DOCKER_DEPLOYMENT.md]
- Solution architecture examples (Andrew)
