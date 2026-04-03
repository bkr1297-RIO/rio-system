# Briefing Patterns

## Daily Quick Check

When Brian asks "what's happening" or "any updates":

```
## Quick Check — [Date]

Decisions needed: [count or "none"]
Blocked items: [count or "none"]
Completed since last check: [one-line summary]
```

Keep to 5 lines or fewer. If nothing needs Brian's attention, say: "All clear. No decisions needed, nothing blocked. [Agent X] completed [thing]. [Agent Y] is working on [thing]."

## Weekly Summary

When Brian asks for a full status or it's been more than 3 days since the last brief:

```
## Weekly Summary — [Date]

### Decisions Needed
- [Question] — raised by [agent] on [date]
- [Question] — raised by [agent] on [date]

### Completed This Week
- [Agent]: [what they finished]
- [Agent]: [what they finished]

### In Progress
- [Agent]: [what they're working on] — ETA: [if known]
- [Agent]: [what they're working on] — ETA: [if known]

### Blocked
- [Item] — blocked because [reason] — needs [what]

### Upcoming
- Next priority from ROADMAP: [item]
- Next priority from ROADMAP: [item]

### Health Check
- Repo docs in sync with Drive: [yes/no — flag mismatches]
- All agents active: [yes/no — flag silent agents]
- HOW_WE_WORK rules followed: [yes/no — flag violations]
```

## Conflict Report

When you detect agents working on the same thing or disagreeing:

```
## Conflict Detected — [Date]

What: [description of the overlap or disagreement]
Agents involved: [names]
What each agent did: [brief summary]
WHO_OWNS_WHAT says: [what the ownership doc says]
Recommendation: [your suggestion, but Brian decides]
```

## Milestone Report

When a major phase or feature completes:

```
## Milestone — [Date]

What completed: [description]
Who did it: [agent]
What it means: [one sentence on impact]
What's next: [the next priority from ROADMAP]
Action needed from Brian: [yes/no — what if yes]
```

## Escalation

When something is urgent (broken system, security concern, agent violating rules):

```
## URGENT — [Date]

What happened: [description]
Impact: [what's affected]
Who's involved: [agents]
Recommended action: [your suggestion]
Needs Brian's decision: YES
```

## Rules for All Briefs

1. No opinions — state facts, surface questions, let Brian decide
2. No jargon — Brian understands the system but doesn't want to parse technical noise
3. No repetition — if something was in the last brief and hasn't changed, don't include it
4. Cite sources — say "per STATUS.md" or "per OPEN_QUESTIONS.md" so Brian can dig deeper if he wants
5. Timestamp everything — Brian needs to know when things happened, not just what happened
