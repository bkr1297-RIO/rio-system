> Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

# RIO Work Protocol

**Version:** 1.0
**Date:** 2026-04-04
**Authority Level:** Medium — governs how people and agents do work
**Origin:** Bondi (Scribe / OpenAI ChatGPT), formalized by Manny (Builder / Manus)
**Status:** Canonical
**Supersedes:** `RIO_AGENT_WORK_PROTOCOL.md` (moved to `spec/archive/`)

---

## 1. Purpose

This document defines how work gets done within the RIO system — by humans, AI agents, and the system itself. It establishes the delivery protocol, the completion report format, the audit checklist, and the definition of done. The constitutional principles are in `CONSTITUTION.md`. The system architecture is in `ARCHITECTURE.md`. This document governs the people and agents doing the work.

---

## 2. The Agent Work Loop

All agent work within the RIO system follows this strict, non-bypassable loop:

> **PLAN → BUILD → SELF-CHECK → AUDIT → FIX → APPROVE → COMPLETE → RECORD**

No step may be skipped. No agent may mark work as complete without traversing every step. This loop exists because Large Language Models optimize for producing an answer rather than verifying correctness. The work loop forces verification before completion.

---

## 3. Roles and Separation of Duties

Each task must have clearly assigned roles. No single agent may act as Architect, Builder, and Approver simultaneously. The separation of duties prevents self-certification and ensures independent verification.

| Role | Responsibility | Cannot Do |
|---|---|---|
| Architect | Defines what should be built and establishes requirements | Cannot build or approve |
| Builder | Implements the work according to requirements | Cannot approve their own work |
| Auditor | Reviews and tests the Builder's work against requirements | Cannot deploy |
| Human Authority | Provides final approval | Does not approve incomplete work |
| Chief of Staff | Ensures the process is followed | Does not build or audit |
| RIO | Enforces governance rules and generates receipts | Cannot modify what it records |
| Witness | Records proof of work in the ledger | Cannot execute or approve |

---

## 4. Builder Completion Report

Before marking any task as complete, the Builder must produce a formal completion report. The Builder cannot transition a task to `COMPLETE` without this report.

| Field | Description |
|---|---|
| Task Summary | Concise description of the task |
| Requirements List | Exhaustive list of all requirements from the original task definition |
| Implementation Summary | Description of what was actually built |
| Files Created/Modified | Complete list of all file paths affected |
| Tests Performed | Testing methodology and results (test count, pass/fail) |
| Known Limitations | Explicit documentation of what is not finished or out of scope |
| Risk Areas | Potential vulnerabilities or areas that might be incorrect |
| Status | One of: `COMPLETE`, `PARTIAL`, or `NEEDS REVIEW` |

---

## 5. Auditor Checklist

The Auditor must verify each item independently. The Auditor does not trust the Builder's claims — the Auditor verifies them.

| Check | Method | Pass Criteria |
|---|---|---|
| Requirements met | Compare implementation against requirements list | Every requirement has corresponding implementation |
| Tests pass | Run the test suite | All tests pass, no regressions |
| Code quality | Review code for correctness, security, maintainability | No critical issues |
| Documentation updated | Check that relevant docs reflect the changes | Docs match implementation |
| No unauthorized changes | Diff against the task scope | Only scoped files were modified |
| Security review | Check for exposed secrets, injection, auth bypass | No security vulnerabilities |
| Governance compliance | Verify receipts exist for governed actions | All governed actions have receipts |

The Auditor produces an Audit Report with a verdict of `PASS`, `FAIL`, or `CONDITIONAL PASS` (with specific conditions that must be met).

---

## 6. Delivery Protocol

The delivery protocol mirrors the governed action lifecycle. Every piece of work follows this sequence:

| Step | Actor | Action |
|---|---|---|
| 1 | Builder | Submits completion report |
| 2 | Auditor | Reviews work against requirements and checklist |
| 3 | Auditor | Produces audit report (PASS/FAIL/CONDITIONAL) |
| 4 | Chief of Staff | Confirms process was followed, docs updated |
| 5 | Human Authority | Reviews and approves (or rejects) |
| 6 | System | Documentation updated, deployment verified |
| 7 | RIO | Receipt logged in ledger |

If any step fails, work returns to the Builder for remediation. The loop does not advance until the failure is resolved.

---

## 7. Definition of Done

A task is done when all of the following conditions are met. If any condition is not met, the task is not done regardless of what the Builder claims.

| Condition | Verification |
|---|---|
| All requirements implemented | Auditor verified against requirements list |
| All tests pass | Test suite executed with zero failures |
| Code reviewed | Auditor reviewed code and produced audit report |
| Documentation updated | Relevant specs, README, and STATUS.md reflect changes |
| No regressions | Existing functionality still works |
| Receipt exists | Governed actions have cryptographic receipts in the ledger |
| Human approved | Human Authority has explicitly signed off |

---

## 8. STATUS.md Protocol

Every delivery must update `docs/STATUS.md` with the following information:

| Field | Description |
|---|---|
| Date | When the delivery was made |
| Agent | Who performed the work (role and name) |
| Delivery | What was delivered (one-sentence summary) |
| Branch | Which branch the work was pushed to |
| Commit | The commit hash |
| Files | List of files created or modified |

STATUS.md is the running log of all deliveries. It is not a substitute for the ledger, but it provides human-readable context for what happened and when.

---

## 9. Prohibited Behaviors

The following behaviors are explicitly prohibited within the work protocol:

| Prohibited | Rationale |
|---|---|
| Builder approving their own work | Self-certification defeats verification |
| Skipping the audit step | Unaudited work cannot be trusted |
| Marking work as COMPLETE without a completion report | Claims without evidence are not accepted |
| Deploying without human approval | Deployment is a governed action |
| Modifying files outside the task scope without documentation | Scope creep without accountability |
| Claiming "it works" without test output | No test output means it is not verified |
| Repeating the same fix without declaring LOOP DETECTED | Infinite loops waste resources and indicate a deeper problem |
