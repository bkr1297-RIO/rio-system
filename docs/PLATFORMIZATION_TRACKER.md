# RIO Platformization Tracker

**Status:** Active
**Phase:** Enforcement Implementation
**Owner:** Chief of Staff
**Last Updated:** 2026-04-04

## Purpose
This document tracks the transition of RIO from a conceptual architecture to a software-enforced platform. The architecture is stable. The goal now is to close the enforcement gaps across five concrete areas.

No work in these areas is considered complete without:
1. A canonical specification
2. An implementation plan
3. A verified code path
4. A verification path

---

## The Build Order (Dependency Chain)

The enforcement areas must be built in this exact sequence. You cannot enforce policy without identity, you cannot audit without storage, and you cannot govern without audit.

1. **Identity Schema** → defines actors
2. **Policy Schema** → defines rules
3. **Storage Architecture** → defines where artifacts live
4. **Active Audit** → verifies system behavior
5. **Meta-Governance Enforcement** → controls rule changes

---

## Phase 1: Foundational Specs (Owner: Andrew / Architects)

These three specs must be finalized before implementation begins.

### 1. Identity and Roles Spec
**Goal:** A unified identity model for humans, agents, services, and approvers. Roles must be explicit and cryptographically distinct.
- [ ] **Spec:** `IDENTITY_AND_ROLES_SPEC.md` (Owner: Andrew)
- [ ] **Protocol Review:** (Owner: Romney)

### 2. Policy Schema Spec
**Goal:** A formal machine-readable policy schema defining risk levels, approval requirements, quorum rules, allowed executors, expirations, and action classes.
- [ ] **Spec:** `POLICY_SCHEMA_SPEC.md` (Owner: Andrew)

### 3. Storage Architecture Spec
**Goal:** Formal separation of full artifacts (Content-Addressable Storage) from proof artifacts (Append-Only Ledger).
- [ ] **Spec:** `STORAGE_ARCHITECTURE_SPEC.md` (Owner: Andrew)
- [ ] **Protocol Review:** (Owner: Romney)

---

## Phase 2: Enforcement Implementation (Owner: Manny / Builder)

Once the specs are finalized, the Builder implements enforcement in this order:

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
- [x] **Spec:** `META_GOVERNANCE.md` (Completed)
- [ ] **Implementation Plan:** (Owner: Manny)
- [ ] **Code Enforcement:** (Owner: Manny)
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
Andrew     Manny     Romney
(Architect)(Builder) (Protocol)
   │         │         │
   └─────────┴─────────┘
        Platform Core
```

- **Andrew** = defines structures
- **Manny** = builds enforcement
- **Romney** = ensures proof/ledger compatibility
- **CoS** = ensures coordination and sequencing
- **Brian** = governance + product definition
