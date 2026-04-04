# RIO Platformization Tracker

**Status:** Active
**Phase:** Enforcement Implementation (Phase 2)
**Owner:** Chief of Staff
**Last Updated:** 2026-04-04

## Purpose

This document tracks the transition of RIO from a conceptual architecture to a software-enforced platform. The architecture is stable. The goal now is to close the enforcement gaps across five concrete areas.

No work in these areas is considered complete without all five stages:

> **Directive → Spec → Implementation Plan → Code → Verification**

---

## Coordination Model

The repo is the coordination layer. Email, Slack, and Telegram are not agent communication channels; they are future interface surfaces for human approvals.

| Layer | Purpose | Location |
|---|---|---|
| Directives | Tasking and instructions | `/directives/` |
| Specs | System definition | `/spec/` and `/docs/` |
| Code | Enforcement | `/gateway/` and codebase |
| Verification | Proof | Verifier + Ledger |
| Tracker | Status | This document |

---

## The Build Order (Dependency Chain)

The enforcement areas must be built in this exact sequence. You cannot enforce policy without identity, you cannot audit without storage, and you cannot govern without audit.

1. **Identity Schema** → defines actors
2. **Policy Schema** → defines rules
3. **Storage Architecture** → defines where artifacts live
4. **Active Audit** → verifies system behavior
5. **Meta-Governance Enforcement** → controls rule changes

---

## Active Directives

| Directive | Target | File |
|---|---|---|
| Foundational Specs | Andrew (Architect) | `/directives/DIRECTIVE_FOUNDATIONAL_SPECS.md` |
| Protocol Review | Romney (Protocol) | `/directives/DIRECTIVE_PROTOCOL_REVIEW.md` |
| Enforcement Plans | Manny (Builder) | `/directives/DIRECTIVE_ENFORCEMENT_PLANS.md` |
| Integration Planning | Damon (SDK) | `/directives/DIRECTIVE_INTEGRATION_PLANNING.md` |
| Platformization Tracking | CoS (Chief of Staff) | `/directives/DIRECTIVE_PLATFORMIZATION_TRACKING.md` |
| Gateway Enforcement Boundary | Manny, Andrew, Damon | `/directives/DIRECTIVE_GATEWAY_ENFORCEMENT_BOUNDARY.md` |

---

## Phase 1: Foundational Specs (Owner: Andrew / Architects)

**STATUS: COMPLETE**

These three specs must be finalized before implementation begins.

### 1. Identity and Roles Spec
**Goal:** A unified identity model for humans, agents, services, and approvers. Roles must be explicit and cryptographically distinct.
- [x] **Directive:** Issued — `/directives/DIRECTIVE_FOUNDATIONAL_SPECS.md`
- [x] **Spec:** `IDENTITY_AND_ROLES_SPEC.md` (Owner: Andrew) — Delivered 2026-04-04
- [x] **Protocol Review:** `IDENTITY_COMPATIBILITY_REVIEW.md` (Owner: Romney) — Approved
- [x] **CoS Verification:** Verified 2026-04-04

### 2. Policy Schema Spec
**Goal:** A formal machine-readable policy schema defining risk levels, approval requirements, quorum rules, allowed executors, expirations, and action classes.
- [x] **Directive:** Issued
- [x] **Spec:** `POLICY_SCHEMA_SPEC.md` (Owner: Andrew) — Delivered 2026-04-04
- [x] **CoS Verification:** Verified 2026-04-04

### 3. Storage Architecture Spec
**Goal:** Formal separation of full artifacts (Content-Addressable Storage) from proof artifacts (Append-Only Ledger).
- [x] **Directive:** Issued
- [x] **Spec:** `STORAGE_ARCHITECTURE_SPEC.md` (Owner: Andrew) — Delivered 2026-04-04
- [x] **Protocol Review:** `STORAGE_COMPATIBILITY_REVIEW.md` (Owner: Romney) — Approved
- [x] **CoS Verification:** Verified 2026-04-04

---

## Phase 2: Enforcement Implementation (Owner: Manny / Builder)

**STATUS: IN PROGRESS**

Do not begin enforcement coding until Andrew's specs are finalized. Prepare implementation plans first.

### 1. Role Enforcement
- [x] **Implementation Plan:** `ENFORCEMENT_PLANS.md` (Owner: Manny) — Verified
- [x] **Code Enforcement:** (Owner: Manny) — **RESUBMITTED** — All code now in `gateway/security/principals.mjs` + route gating in `gateway/routes/*.mjs`. 49 tests, 0 failures. Previous submission (ONE PWA) failed verification at commit `3e2361d`.
- [x] **Verification:** (Owner: CoS) — Verified 2026-04-04 (Commit 2d698d2)

### 2. Policy Evaluation Engine
- [x] **Implementation Plan:** `ENFORCEMENT_PLANS.md` (Owner: Manny) — Verified
- [x] **Code Enforcement:** (Owner: Manny) — Policy engine in `gateway/governance/policy-engine.mjs` + policy store in `gateway/governance/policy-store.mjs` + genesis policy v2.0.0. 57 tests, 0 failures. Wired into `/govern` route.
- [x] **Verification:** (Owner: CoS) — **PASS** — Verified 2026-04-04 (Commit `239044d`). See `docs/reviews/AREA2_VERIFICATION_REPORT.md`.

### 3. CAS + Ledger Boundary
- [x] **Implementation Plan:** `ENFORCEMENT_PLANS.md` (Owner: Manny) — Verified
- [ ] **Code Enforcement:** (Owner: Manny)
- [ ] **Verification:** (Owner: CoS)

### 4. Active Audit
- [x] **Spec:** `AUTOMATED_AUDIT_SPEC.md` (Owner: Romney) — Verified
- [x] **Implementation Plan:** `ENFORCEMENT_PLANS.md` (Owner: Manny) — Verified
- [ ] **Code Enforcement:** (Owner: Manny)
- [ ] **Verification:** (Owner: CoS)

### 5. Meta-Governance Enforcement
- [x] **Spec:** `RIO_META_GOVERNANCE.md` (Completed)
- [x] **Implementation Plan:** `ENFORCEMENT_PLANS.md` (Owner: Manny) — Verified
- [ ] **Code Enforcement:** (Owner: Manny)
- [ ] **Verification:** (Owner: CoS)

---

## Parallel Deliveries (During Phase 2)

The following deliveries landed while Phase 2 enforcement coding is in progress:

| Commit | Owner | Delivery | Status |
|---|---|---|---|
| `c628f52` | Andrew | Identity Spec v1.1 (Implementation-Ready) | Delivered |
| `fc95196` | Romney | Protocol Identity & Storage Compatibility Note | Delivered |
| `c31af09` | Damon/Andrew | Gateway API Contract | Delivered |
| `2c90943` | Damon | STATUS.md update for Gateway API Contract | Delivered |
| (in docs/) | Damon | SDK Interface and Developer Flow guide | Delivered |

---

## Phase 3: Integration Layer (Owner: Damon / SDK)

**STATUS: PENDING**

Do not build yet. Plan first. SDK and integration architecture must align with Identity, Policy, and Storage specs.

- [x] **SDK Architecture Plan:** `EXTERNAL_INTEGRATION_PLAN.md` (Owner: Damon) — Verified
- [x] **Gateway API Contract:** `GATEWAY_API_CONTRACT.md` (Owner: Damon/Andrew) — Delivered
- [x] **SDK Interface Design:** `SDK_INTERFACE_AND_DEVELOPER_FLOW.md` (Owner: Damon) — Delivered
- [ ] **API Surface Reconciliation:** (Owner: Damon)
- [ ] **Verification:** (Owner: CoS)

---

## The Platformization Triangle

```text
            Brian
             │
             ▼
      Chief of Staff
             │
   ┌─────────┼─────────┐
   ▼         ▼         ▼
Andrew     Manny     Romney     Damon
(Architect)(Builder) (Protocol) (SDK)
   │         │         │         │
   └─────────┴─────────┴─────────┘
              Platform Core
```

### Current Focus Assignments

| Person | Focus Now |
|---|---|
| **Andrew** | Identity spec, Policy schema, Storage spec — all must assume Gateway enforcement |
| **Manny** | Move enforcement into Gateway and implement Areas 1–5 there |
| **Romney** | Ensure receipts/ledger/verifier align with Gateway enforcement |
| **Damon** | SDKs must call Gateway, not ONE PWA |
| **CoS** | Track enforcement in Gateway only |
| **Brian** | Governance model, invariants, product direction |
| **Bondi** | Scribe, invariant logic, journey record |
