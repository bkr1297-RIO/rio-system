# RIO Agent Work Protocol Specification
**Version:** 1.0
**Status:** Active
**Spec ID:** RIO-SPEC-AWP-001
**Date:** 2026-04-03

---

## 1. Purpose

This document defines the canonical protocol for how autonomous agents perform work within the RIO ecosystem. RIO is not just a system for governing execution; it is a system for governing agents and their workflows. 

The goal of this protocol is to ensure that no agent can mark work as complete unless it has been explicitly verified, reviewed, and documented. It mitigates the tendency of Large Language Models (LLMs) to optimize for producing an answer rather than verifying correctness.

---

## 2. The Agent Work Loop

All agent work within the RIO system MUST follow this strict, non-bypassable loop:

**PLAN → BUILD → SELF-CHECK → AUDIT → FIX → APPROVE → COMPLETE → RECORD**

Agents are strictly prohibited from skipping any step in this loop.

---

## 3. Agent Roles and Separation of Duties

Each task must have clearly assigned roles. To maintain the integrity of the verification loop, no single agent is permitted to act as Architect, Builder, and Approver simultaneously.

| Role | Responsibility |
|---|---|
| **Architect Agent** | Defines what should be built and establishes the requirements. |
| **Builder Agent** | Implements the work according to the Architect's requirements. |
| **Auditor Agent** | Reviews and tests the Builder's work against the requirements. |
| **Human Authority** | Provides final approval for the work. |
| **RIO** | Enforces governance rules and generates the cryptographic receipt. |
| **Witness** | Records the proof of work in the tamper-evident ledger. |

---

## 4. Builder Agent Requirements

Before marking any task as `COMPLETE`, the Builder Agent MUST produce a formal **Builder Completion Report**. The Builder is not allowed to transition a task to `COMPLETE` without this report.

### Builder Completion Report Structure

1. **Task Summary:** A concise description of the task.
2. **Requirements List:** An exhaustive list of all requirements from the original task definition.
3. **Implementation Summary:** A description of what was actually built.
4. **Files Created/Modified:** A complete list of all file paths affected by the work.
5. **Tests Performed:** A description of the testing methodology and results.
6. **Known Limitations:** Explicit documentation of what is not finished or out of scope.
7. **Risk Areas:** Identification of potential vulnerabilities or areas that might be incorrect.
8. **Status:** Must be one of: `COMPLETE`, `PARTIAL`, or `NEEDS REVIEW`.

---

## 5. Auditor Agent Requirements

The Auditor Agent MUST review the Builder Completion Report and verify the work against a strict checklist.

### Auditor Checklist

| Check | Pass/Fail |
|---|---|
| Requirements implemented | |
| Files exist in the correct locations | |
| Code executes without errors | |
| Edge cases considered and handled | |
| Security implications considered | |
| Documentation updated | |
| Repository structure maintained | |
| Tests pass successfully | |

### Auditor Output

- **PASS:** The task meets all criteria and can proceed to Human Approval.
- **FAIL:** The task does not meet criteria and returns to the Builder Agent with specific fixes required.

---

## 6. Official Definition of Done

A task is only considered **DONE** when all of the following conditions are met:

1. All requirements are implemented.
2. All code is committed to the repository.
3. All relevant documentation is updated.
4. The Auditor Agent has issued a `PASS` status.
5. The Human Authority has approved the work (if required by policy).
6. A cryptographic receipt has been generated (if the work involves a governed action).

If any of these conditions are missing, the task is **NOT DONE**.

---

## 7. Task Status Definitions

Agents MUST use the following standardized statuses to track work:

| Status | Meaning |
|---|---|
| **PLANNED** | The Architect Agent has defined the task. |
| **IN PROGRESS** | The Builder Agent is actively working on the task. |
| **BUILT** | The Builder Agent has finished the initial implementation. |
| **IN REVIEW** | The Auditor Agent is reviewing the work. |
| **CHANGES REQUIRED** | The Auditor Agent found issues that the Builder must fix. |
| **APPROVED** | Both the Auditor Agent and the Human Authority have approved the work. |
| **COMPLETE** | The work is finished and the receipt is recorded. |
| **BLOCKED** | The task cannot proceed due to external dependencies or issues. |

---

## 8. Architectural Alignment

This protocol aligns directly with the core RIO architecture:

- **Governed Execution:** Work is executed only after passing through defined stages.
- **Governed Agents:** Agents operate within strict role boundaries.
- **Governed Workflows:** The process of building is as structured as the runtime execution.
- **Verifiable Completion:** Completion is a provable state, not an assumption.
