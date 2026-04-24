# MANTIS Trigger System — Example Run

## Flow

```
Task
  ↓
Pattern Selection
  ↓
Draft / Proposal
  ↓
MANTIS Contrast
  ↓
Trigger Engine (NEW)
  ↓
Surface (if triggered)
  ↓
Human decides
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

## 3. Selected Patterns (from corpus)

| ID | Type | Description | Confidence |
|----|------|-------------|------------|
| PAT-001 | communication | External communications about project status should include specific dates and deliverables | 0.8 |
| PAT-002 | workflow | Email drafts go through review before send | 0.6 |
| PAT-003 | constraint | Do not send emails to external recipients without explicit approval | 1.0 |
| PAT-004 | risk | Client communications carry reputational exposure | 0.6 |

## 4. Contrast Packet

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
  },
  "non_authoritative": true
}
```

## 5. Event

```json
{
  "type": "pre_action",
  "user_requested": false
}
```

## 6. Trigger Engine Decision

```
Trigger classification:
  T4 check → constraint violation found → FIRES T4
  (T3, T1, T2, T5 not evaluated — T4 has highest priority)

Should surface? → Yes (observations exist)
Duplicate? → No (first time seeing this input)

Result: TRIGGER T4 — Constraint violation
```

## 7. Surface Output

```
MANTIS — Contrast [HIGH]
Aligned:
  (none)
Deviates:
  - Missing communication elements: deadline, deliverables
  - Missing expected elements: review, draft
  - Constraint requires approval/review — not referenced in draft
  - Risk trigger detected: client, update
Risk:
  - Client communications carry reputational exposure
Score: 0/4 aligned
Options:
  A) Address deviations before proceeding
  B) Send for review
  C) Proceed anyway
(Non-binding. You decide.)
```

## 8. What Happens Next

The human sees the surface output and decides:
- **Option A**: Go back and fix the draft (add dates, get review)
- **Option B**: Route to a reviewer first
- **Option C**: Proceed anyway — MANTIS does not block

If the human proceeds → RIO Governance takes over → Execution + Receipt.

---

## Trigger Priority Reference

| Code | Name | Fires When | Priority |
|------|------|-----------|----------|
| T4 | Constraint violation | Any constraint pattern deviates | 1 (highest) |
| T3 | Risk flag | Any risk flag in contrast summary | 2 |
| T1 | Pre-action | Event type is `pre_action` | 3 |
| T2 | Pre-commit | Event type is `pre_commit` | 4 |
| T5 | Manual request | `user_requested: true` | 5 (lowest) |

---

## Deduplication

If the same event + contrast summary is seen again (e.g., user re-runs without changing the draft), the trigger engine returns `surfaced: false, reason: "duplicate"`.

This prevents alert fatigue. The cache resets on new input.
