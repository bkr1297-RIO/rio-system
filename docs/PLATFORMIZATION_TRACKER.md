# RIO Platformization Tracker

**Status:** Active
**Phase:** Enforcement Implementation
**Owner:** Chief of Staff
**Last Updated:** 2026-04-04

## Purpose
This document tracks the transition of RIO from a conceptual architecture to a software-enforced platform. The architecture is stable. The goal now is to close the enforcement gaps across five concrete areas: Identity, Policy Schema, Storage, Active Audit, and Meta-Governance.

No work in these areas is considered complete without:
1. A canonical specification
2. An implementation plan
3. A verified code path

---

## The 5 Enforcement Areas

### 1. Identity and Roles
**Goal:** A unified identity model for humans, agents, services, and approvers. Roles must be explicit and cryptographically distinct.
- [ ] **Spec:** `IDENTITY_AND_ROLES_SPEC.md` (Owner: Architects)
- [ ] **Implementation Plan:** (Owner: Builder)
- [ ] **Code Enforcement:** (Owner: Builder)
- [ ] **Verification:** (Owner: Auditor)

### 2. Policy Schema
**Goal:** A formal machine-readable policy schema defining risk levels, approval requirements, quorum rules, allowed executors, expirations, and action classes.
- [ ] **Spec:** `POLICY_SCHEMA_SPEC.md` (Owner: Architects)
- [ ] **Implementation Plan:** (Owner: Builder)
- [ ] **Code Enforcement:** (Owner: Builder)
- [ ] **Verification:** (Owner: Auditor)

### 3. Storage Architecture
**Goal:** Formal separation of full artifacts (Content-Addressable Storage) from proof artifacts (Append-Only Ledger).
- [ ] **Spec:** `STORAGE_ARCHITECTURE_SPEC.md` (Owner: Architects)
- [ ] **Implementation Plan:** (Owner: Builder)
- [ ] **Code Enforcement:** (Owner: Builder)
- [ ] **Verification:** (Owner: Auditor)

### 4. Active Audit
**Goal:** Move from passive hash verification to active verification. The system must prove that what executed is exactly what was approved before finalizing the receipt.
- [ ] **Spec:** `ACTIVE_AUDIT_SPEC.md` (Owner: Architects)
- [ ] **Implementation Plan:** (Owner: Builder)
- [ ] **Code Enforcement:** (Owner: Builder)
- [ ] **Verification:** (Owner: Auditor)

### 5. Meta-Governance Enforcement
**Goal:** Implement the markdown rules (Quorum, Governance Change Receipts, Kill Switch) in the gateway and policy engine code.
- [x] **Spec:** `META_GOVERNANCE.md` (Completed)
- [ ] **Implementation Plan:** (Owner: Builder)
- [ ] **Code Enforcement:** (Owner: Builder)
- [ ] **Verification:** (Owner: Auditor)

---

## The System Definition
> RIO / ONE is a governed execution control plane. AI may propose. Governance evaluates. Humans or quorum authorize when required. Execution occurs only through controlled gateways. Every action generates proof. Every proof is recorded. Audit verifies. Meta-governance controls how the rules change.
