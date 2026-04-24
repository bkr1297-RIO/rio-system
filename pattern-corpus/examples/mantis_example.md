# MANTIS Contrast Layer — Example

Full flow: **task → select patterns → draft → MANTIS contrast → surface to user**.

MANTIS is a read-only observer. It never executes, blocks, or decides.

---

## 1. Task

```json
{
  "description": "Draft a follow-up email to a client about the project timeline delay",
  "inputs": ["email", "client", "project timeline"],
  "signals": ["deadline", "delay", "communication"]
}
```

---

## 2. Draft (what the user/AI has written so far)

```
Hi team,

Just wanted to give you a quick update. We're running a bit behind
on the project. We'll get back to you soon with more details.

Thanks
```

---

## 3. Selected Patterns (from corpus)

| # | ID | Type | Description | Confidence |
|---|-----|------|-------------|------------|
| 1 | PAT-001 | communication | Include specific revised dates rather than vague timelines | 0.8 |
| 2 | PAT-003 | constraint | Do not send emails to external recipients without explicit approval | 1.0 |
| 3 | PAT-002 | workflow | Email drafts go through review before send | 0.6 |
| 4 | PAT-004 | risk | Timeline delay communications carry reputational exposure | 0.6 |

---

## 4. Contrast Packet (raw)

```json
{
  "packet_id": "a1b2c3d4-...",
  "task": "Draft a follow-up email to a client about the project timeline delay",
  "observations": [
    {
      "pattern_id": "PAT-001",
      "status": "DEVIATES",
      "note": "Missing expected elements: deadline",
      "confidence": 0.8
    },
    {
      "pattern_id": "PAT-003",
      "status": "DEVIATES",
      "note": "Constraint requires approval/review — not referenced in draft",
      "confidence": 1.0
    },
    {
      "pattern_id": "PAT-002",
      "status": "DEVIATES",
      "note": "Missing expected elements: review",
      "confidence": 0.6
    },
    {
      "pattern_id": "PAT-004",
      "status": "DEVIATES",
      "note": "Risk trigger detected: delay",
      "confidence": 0.6,
      "risk_flag": "Timeline delay communications carry reputational exposure"
    }
  ],
  "summary": {
    "aligned": 0,
    "deviates": 4,
    "risk_flags": [
      "Timeline delay communications carry reputational exposure"
    ]
  },
  "severity": "high",
  "non_authoritative": true
}
```

---

## 5. Surface Output (what the user sees)

```
MANTIS — Contrast [HIGH]

Deviates:
  - Missing expected elements: deadline
  - Constraint requires approval/review — not referenced in draft
  - Missing expected elements: review
  - Risk trigger detected: delay

Risk:
  - Timeline delay communications carry reputational exposure

Score: 0/4 aligned

Options:
  A) Address deviations before proceeding
  B) Send for review
  C) Proceed anyway

(Non-binding. You decide.)
```

---

## 6. Integration Code

```python
from selector.select_patterns import select_patterns
from validator.validate_pattern import load_corpus
from mantis.mantis_contrast import mantis_contrast
from mantis.surface_formatter import format_surface

# 1. Load corpus and select patterns
corpus = load_corpus()
task = {
    "description": "Draft a follow-up email to a client about the project timeline delay",
    "inputs": ["email", "client", "project timeline"],
    "signals": ["deadline", "delay", "communication"],
}
patterns = select_patterns(task, corpus)

# 2. Run contrast against draft
draft = "Hi team, Just wanted to give you a quick update..."
contrast = mantis_contrast(task["description"], draft, patterns)

# 3. Surface to user
output = format_surface(contrast)
print(output)
```

---

## How This Fits

```
Task → Pattern Selection → Draft
                ↓
          MANTIS Contrast
                ↓
           Surface to user
                ↓
         User decides next step
                ↓
           RIO Governance
```

MANTIS observes. It does not approve, deny, execute, or modify.
