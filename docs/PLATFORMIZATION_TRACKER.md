# RIO Platformization Tracker

**Status:** Active
**Phase:** Enforcement Implementation
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

---

## Phase 1: Foundational Specs (Owner: Andrew / Architects)

Directive: `/directives/DIRECTIVE_FOUNDATIONAL_SPECS.md`

These three specs must be finalized before implementation begins.

### 1. Identity and Roles Spec
**Goal:** A unified identity model for humans, agents, services, and approvers. Roles must be explicit and cryptographically distinct.
- [ ] **Directive:** Issued
- [ ] **Spec:** `IDENTITY_AND_ROLES_SPEC.md` (Owner: Andrew)
- [ ] **Protocol Review:** (Owner: Romney) — per `/directives/DIRECTIVE_PROTOCOL_REVIEW.md`

### 2. Policy Schema Spec
**Goal:** A formal machine-readable policy schema defining risk levels, approval requirements, quorum rules, allowed executors, expirations, and action classes.
- [ ] **Directive:** Issued
- [ ] **Spec:** `POLICY_SCHEMA_SPEC.md` (Owner: Andrew)

### 3. Storage Architecture Spec
**Goal:** Formal separation of full artifacts (Content-Addressable Storage) from proof artifacts (Append-Only Ledger).
- [ ] **Directive:** Issued
- [ ] **Spec:** `STORAGE_ARCHITECTURE_SPEC.md` (Owner: Andrew)
- [ ] **Protocol Review:** (Owner: Romney) — per `/directives/DIRECTIVE_PROTOCOL_REVIEW.md`

---

## Phase 2: Enforcement Implementation (Owner: Manny / Builder)

Directive: `/directives/DIRECTIVE_ENFORCEMENT_PLANS.md`

Do not begin enforcement coding until Andrew's specs are finalized. Prepare implementation plans first.

### 1. Role Enforcement
- [ ] **Implementation Plan:** (Owner: Manny)
- [ ] **Code Enforcement:** (Owner: Manny)
- [ ] **Verification:** (Owner: CoS)

### 2. Policy Evaluation Engine
- [ ] **Implementation Plan:** (Owner: Manny)
- [ ] **Code Enforcement:** (Owner: Manny)
- [ ] **Verification:** (Owner: CoS)

### 3. CAS + Ledger Boundary
- [ ] **Implementation Plan:** (Owner: Manny)
- [ ] **Code Enforcement:** (Owner: Manny)
- [ ] **Verification:** (Owner: CoS)

### 4. Active Audit
- [ ] **Implementation Plan:** (Owner: Manny)
- [ ] **Code Enforcement:** (Owner: Manny)
- [ ] **Verification:** (Owner: CoS)

### 5. Meta-Governance Enforcement
- [x] **Spec:** `RIO_META_GOVERNANCE.md` (Completed)
- [ ] **Implementation Plan:** (Owner: Manny)
- [ ] **Code Enforcement:** (Owner: Manny)
- [ ] **Verification:** (Owner: CoS)

---

## Phase 3: Integration Layer (Owner: Damon / SDK)

Directive: `/directives/DIRECTIVE_INTEGRATION_PLANNING.md`

Do not build yet. Plan first. SDK and integration architecture must align with Identity, Policy, and Storage specs.

- [ ] **SDK Architecture Plan:** (Owner: Damon)
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

- **Andrew** = defines structures (Identity, Policy, Storage)
- **Manny** = builds enforcement (Gateway code)
- **Romney** = ensures proof/ledger compatibility (Receipt, Ledger)
- **Damon** = builds integration layer (SDK, API, Docs)
- **CoS** = ensures coordination, sequencing, and verification
- **Brian** = governance, product definition, meta-governance
- **Bondi** = scribe, invariant logic, journey record
