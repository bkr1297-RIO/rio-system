# RIO Pause Placement Model — Integration Spec

## Core Concept
Every action passes through EXACTLY ONE pause:
- **Intake** (pre-approved via rule)
- **Pre-Execution** (ask user each time)
- **Sentinel** (fallback intercept for external actions)

## Decision Tree (route_action)

```
STEP 1: Identify source
  - source in ["RIO_UI", "RIO_API"] → in_rio_system = TRUE
  - else → in_rio_system = FALSE

STEP 2: Check Intake Rules (only if in_rio_system)
  - in_rio_system TRUE → find matching intake rule
    - match found → intake_rule = RULE
    - no match → intake_rule = NULL
  - in_rio_system FALSE → skip rule check

STEP 3: Route to pause type
  - IF intake_rule EXISTS AND in_rio_system → PATH A: INTAKE PAUSE
  - ELSE IF in_rio_system AND intake_rule NULL → PATH B: PRE-EXECUTION PAUSE
  - ELSE (in_rio_system FALSE) → PATH C: SENTINEL PAUSE
```

## PATH A: INTAKE PAUSE
- **When:** Action has pre-approved IntakeRule AND originates from RIO
- **User interruption:** NO
- **Ledger marker:** pause_type="INTAKE"
- **Action:** Verify rule active → check constraints → execute → log to ledger
- **Result:** EXECUTED or REJECTED (constraint violation)
- **Map to existing:** Use existing workflow/rule system, execute directly (no new approval UI)

## PATH B: PRE-EXECUTION PAUSE
- **When:** Action originates from RIO BUT no matching IntakeRule
- **User interruption:** YES (immediate pause, ask for approval)
- **Ledger marker:** pause_type="PRE_EXEC"
- **Action:** Create PauseRecord → show approval dialog → wait (timeout: 15 min) → execute or reject
- **Result:** EXECUTED or REJECTED
- **Map to existing:** Use existing ONE approval flow, Gateway /authorize, execution + receipt + ledger

## PATH C: SENTINEL PAUSE
- **When:** Action originates from OUTSIDE RIO system
- **User interruption:** YES (emergency, ask for approval)
- **Ledger marker:** pause_type="SENTINEL"
- **Action:** BLOCK immediately → create PauseRecord with synthetic intent → show emergency approval → wait (timeout: 1 hour, auto-reject) → execute or permanently delete
- **Result:** EXECUTED or BLOCKED
- **Phase 1 scope:** Intercept outbound email only at email send boundary
- **Map to existing:** Create synthetic intent → route to existing approval flow → existing execution + receipt + ledger

## Data Structures (USE EXISTING — NO NEW MODELS)
- PauseRecord = existing receipt (add pause_type field)
- LedgerEntry = existing ledger (add pause_type field)
- IntakeRule: { id, name, action_type, conditions, constraints, approved_by, approved_at, active }

## Invariants (NEVER VIOLATE)
- DO NOT let action execute without exactly one pause
- DO NOT execute without user approval
- DO NOT let Sentinel trigger if another pause already handled it
- DO NOT modify ledger entries (immutable)
- DO log every action to ledger
- DO create exactly one pause per action
- DO use Sentinel only as fallback

## Configuration
- PRE_EXEC_APPROVAL_TIMEOUT = 900 (15 minutes)
- SENTINEL_APPROVAL_TIMEOUT = 3600 (1 hour)
- MAX_RULE_CONDITIONS = 10
- MAX_RULE_CONSTRAINTS = 10
- MAX_RULE_DESTINATIONS = 100

## Critical Constraints
- EXACTLY one pause per action
- No action executes without approval
- Sentinel only triggers if no prior pause exists
- All actions must use existing receipt + ledger
- No duplicate approval paths

## DO NOT
- Create new ledger schema
- Create new receipt structure
- Create new approval flows
- Rebuild RIO
- Introduce new databases

## Quick Reference Table
| Scenario | Source | Intake Rule | Pause Type | User Interruption | Execution |
|---|---|---|---|---|---|
| Daily automation | RIO_UI | Matches | A (INTAKE) | None | Automatic |
| One-off request | RIO_UI | No match | B (PRE_EXEC) | Yes (15 min) | If approved |
| External email | SMTP | — | C (SENTINEL) | Yes (1 hour) | If approved |
| External API | requests | — | C (SENTINEL) | Yes (1 hour) | If approved |
| External file write | file system | — | C (SENTINEL) | Yes (1 hour) | If approved |
