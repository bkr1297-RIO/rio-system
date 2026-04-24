# MANTIS Logging Layer — Example Run

## Updated Flow

```
Task
  ↓
Pattern Selection
  ↓
Draft
  ↓
MANTIS Contrast
  ↓
Trigger Engine
  ↓
Surface (optional)
  ↓
LOG OBSERVATION (NEW)
  ↓
User decides
  ↓
RIO Governance
  ↓
Execution
```

---

## 1. Task

```json
{
  "description": "Send a project status update email to the client",
  "type": "pre_action",
  "inputs": ["email", "client", "project status"],
  "signals": ["deadline", "update", "communication"]
}
```

## 2. Draft

```
Hi,

Quick update — things are moving along. We'll circle back next week
with more details.

Thanks
```

## 3. Contrast Packet

```json
{
  "severity": "high",
  "observations": [
    {"pattern_id": "PAT-001", "status": "DEVIATES", "note": "Missing communication elements: deadline, deliverables"},
    {"pattern_id": "PAT-002", "status": "DEVIATES", "note": "Missing expected elements: review, draft"},
    {"pattern_id": "PAT-003", "status": "DEVIATES", "note": "Constraint requires approval/review — not referenced in draft"},
    {"pattern_id": "PAT-004", "status": "DEVIATES", "note": "Risk trigger detected: client, update"}
  ],
  "summary": {
    "aligned": 0,
    "deviates": 4,
    "risk_flags": ["Client communications carry reputational exposure"]
  }
}
```

## 4. Trigger Fired

```
Trigger: T4 (Constraint violation)
Surface shown: Yes
```

## 5. Resulting Log Entry

```json
{
  "log_id": "a3f8c1d2-7e4b-4a9f-b6c3-1d2e3f4a5b6c",
  "timestamp": "2026-04-23T15:30:00.000000+00:00",
  "task": "Send a project status update email to the client",
  "event_type": "pre_action",
  "trigger": "T4",
  "severity": "high",
  "summary": {
    "aligned": 0,
    "deviates": 4,
    "risk_flags": ["Client communications carry reputational exposure"]
  },
  "pattern_ids": ["PAT-001", "PAT-002", "PAT-003", "PAT-004"],
  "surface_shown": true,
  "notes": null
}
```

---

## What Gets Logged

Every observation is logged, regardless of whether it was surfaced to the user.

| Scenario | Surfaced? | Logged? |
|----------|-----------|---------|
| Constraint violation (T4) | Yes | Yes |
| Risk flag (T3) | Yes | Yes |
| Pre-action, clean draft (T1) | Yes (compact) | Yes |
| Duplicate trigger (dedup) | No | Yes |
| Empty contrast (fail silent) | No | Yes |

---

## What the Log Enables (Future)

- **Drift tracking**: Are the same patterns deviating repeatedly? Is severity trending up?
- **Trigger calibration**: Are T1/T2 firing too often on clean drafts? Adjust thresholds.
- **Pattern refinement**: Which patterns are always aligned? Which always deviate? Prune or strengthen.

The log is observation-only. It never feeds back into the system automatically.
