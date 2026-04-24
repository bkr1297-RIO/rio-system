# MANTIS Trend Detection v0.1 — Example

## What It Does

Trend Detection reads MANTIS observation logs and answers:
- **"What keeps happening?"** — recurring patterns and deviations
- **"Where are we drifting?"** — drift score over time

It is **read-only** and **observer-only**. It never modifies logs, corpus, or system state.

---

## Input

Reads from: `mantis/logs/observations.jsonl`

Each log entry (written by `mantis_logger.py`) contains:
```json
{
  "log_id": "uuid",
  "timestamp": "2026-04-24T...",
  "task": "Draft a follow-up email...",
  "event_type": "pre_action",
  "trigger": "T4",
  "severity": "high",
  "summary": {
    "aligned": 1,
    "deviates": 3,
    "risk_flags": ["Timeline delay communications carry reputational exposure"]
  },
  "pattern_ids": ["PAT-001", "PAT-003", "PAT-002", "PAT-004"],
  "surface_shown": true,
  "notes": null
}
```

---

## Invocation

```python
from mantis.trend_analyzer import analyze_trends, format_trends

# Last 20 observations (default)
report = analyze_trends(window_size=20)

# Last 10
report = analyze_trends(window_size=10)

# Full history
report = analyze_trends(window_size=0)

# Custom log path
report = analyze_trends(window_size=20, log_path="/path/to/observations.jsonl")
```

---

## Sample Scenario

Assume 10 logged observations from various tasks:

| # | Task | Severity | Deviates | Risk Flags | Patterns |
|---|------|----------|----------|------------|----------|
| 1 | Email about delay | high | 3 | 1 | PAT-001, PAT-003, PAT-002, PAT-004 |
| 2 | Email about delay | high | 3 | 1 | PAT-001, PAT-003, PAT-002, PAT-004 |
| 3 | Draft proposal | medium | 1 | 0 | PAT-001, PAT-002 |
| 4 | Send invoice | high | 2 | 1 | PAT-003, PAT-004 |
| 5 | Email about delay | high | 3 | 1 | PAT-001, PAT-003, PAT-002, PAT-004 |
| 6 | Draft summary | low | 0 | 0 | PAT-001, PAT-002 |
| 7 | Email about delay | high | 3 | 1 | PAT-001, PAT-003, PAT-002, PAT-004 |
| 8 | Send report | medium | 1 | 0 | PAT-001, PAT-002 |
| 9 | Email about delay | high | 3 | 1 | PAT-001, PAT-003, PAT-002, PAT-004 |
| 10 | Draft notes | low | 0 | 0 | PAT-001 |

---

## Output (Structured)

```json
{
  "window_size": 10,
  "actual_entries": 10,
  "drift_score": 70.0,
  "top_patterns": [
    {"pattern_id": "PAT-001", "count": 10},
    {"pattern_id": "PAT-002", "count": 7},
    {"pattern_id": "PAT-003", "count": 5}
  ],
  "risk_count": 5,
  "risk_rate": 0.5,
  "severity_distribution": {
    "HIGH": 5,
    "MEDIUM": 2,
    "LOW": 2
  },
  "insight": "High drift detected — most runs have deviations. frequent risk flags. most recurring: PAT-001 (10x)."
}
```

---

## Output (Human-Readable)

```
MANTIS — Trends (last 10 runs, 10 available)

Drift: 70.0% (7/10 runs had deviations)

Top recurring patterns:
  - PAT-001 (10)
  - PAT-002 (7)
  - PAT-003 (5)

Risk frequency:
  - 50% of runs triggered risk flags (5/10)

Severity:
  - HIGH: 5
  - MEDIUM: 2
  - LOW: 2

Insight: High drift detected — most runs have deviations. frequent risk flags. most recurring: PAT-001 (10x).
```

---

## Output (Compact)

```
MANTIS Trends | Drift: 70.0% | Risk: 50% | Top: PAT-001(10), PAT-002(7)
```

---

## System Position

```
Task → Select → Draft → Contrast → Trigger → Surface → Log
                                                          ↓
                                                   Trend Analyzer
                                                   (reads logs)
                                                          ↓
                                                   "What keeps happening?"
```

Trend Detection sits **after** logging. It reads. It reports. It does not decide.
