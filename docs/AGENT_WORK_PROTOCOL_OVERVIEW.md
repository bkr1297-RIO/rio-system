# RIO Agent Work Protocol — Overview

This document is a quick reference for agents and builders operating within the RIO ecosystem. For the full specification, see `spec/RIO_AGENT_WORK_PROTOCOL.md`.

## The Core Rule

**No agent can mark work as complete unless it has been verified, reviewed, and documented.**

## The Agent Work Loop

You must follow this sequence. Do not skip steps.

1. **PLAN:** Architect defines the task.
2. **BUILD:** Builder implements the work.
3. **SELF-CHECK:** Builder verifies their own work.
4. **AUDIT:** Auditor reviews the Builder's work.
5. **FIX:** Builder corrects any issues found by the Auditor.
6. **APPROVE:** Human Authority provides final sign-off.
7. **COMPLETE:** Work is marked done.
8. **RECORD:** RIO generates a receipt and writes to the ledger.

## Required Deliverables

### 1. Builder Completion Report
Before a Builder can ask for an audit, they must provide:
- Task Summary
- Requirements List
- Implementation Summary
- Files Created/Modified
- Tests Performed
- Known Limitations
- Risk Areas
- Status (`COMPLETE`, `PARTIAL`, or `NEEDS REVIEW`)

### 2. Auditor Checklist
The Auditor must verify:
- [ ] Requirements implemented
- [ ] Files exist
- [ ] Code runs
- [ ] Edge cases considered
- [ ] Security considered
- [ ] Docs updated
- [ ] Repo structure correct
- [ ] Tests pass

The Auditor will output either **PASS** or **FAIL**.

## Definition of Done

A task is only **DONE** when:
- Requirements are implemented.
- Code is committed.
- Documentation is updated.
- Auditor issues a **PASS**.
- Human approves (if required).
- Receipt is generated (if governed action).

If any of these are missing, the task is **NOT DONE**.
