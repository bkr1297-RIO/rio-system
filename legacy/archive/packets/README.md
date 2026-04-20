# RIO Universal Packet Format

Standard coordination format for all inter-agent work in the RIO system.

Every task starts as a **TASK** packet, produces a **RESULT** packet, and may require an **APPROVAL** packet before execution.

## Packet Types

| Type | Purpose | Who Creates | Who Consumes |
|------|---------|-------------|--------------|
| TASK | Propose work to be done | Any agent or Brian | Assigned agent |
| RESULT | Report completed work | Executing agent | Brian + all agents |
| APPROVAL | Gate an action that modifies state | Requesting agent | Brian (sole approver) |

## Core Rule

> The system may wake itself up to observe, compare, summarize, and notify.
> It may **not** execute, commit, deploy, approve, or modify runtime without Brian's explicit current approval.

## Files

- `task_packet.json` — TASK packet template
- `result_packet.json` — RESULT packet template
- `approval_packet.json` — APPROVAL packet template

## Timer Permissions

**Allowed on timer:** Observe, Compare, Summarize, Draft, Notify

**Not allowed on timer:** Commit, Send, Execute, Modify running systems, Merge PRs, Change policy
