# Pattern Corpus System v0.1

A governed, append-only pattern corpus pipeline for the RIO/ONE stack.

Patterns are **non-authoritative observations** — they shape LLM behavior context but never decide, execute, or modify governance.

---

## What It Does

1. **Stores** patterns in append-only JSONL (no update, no delete)
2. **Validates** patterns through a strict gate before write (fail closed)
3. **Selects** relevant patterns per task (scored auto-select, 3–5 results)
4. **Generates** a non-authoritative Pattern Context block for LLM prompts

---

## File Structure

```
pattern-corpus/
  corpus/
    patterns.jsonl       ← Append-only pattern store
    pattern_index.json   ← Pattern ID → line reference
    rejected.jsonl       ← Failed validations (audit trail)
  validator/
    validate_pattern.py  ← Strict gate: schema, evidence, confidence, language checks
  selector/
    select_patterns.py   ← Auto-select 3–5 patterns per task (scoring algorithm)
  generator/
    generate_context.py  ← Produces the "Pattern Context (Non-Authoritative)" block
  examples/
    example_usage.md     ← Full walkthrough: task → select → context → prompt
  README.md              ← This file
```

---

## Non-Negotiables

- No execution without validation
- Append-only writes (no UPDATE/DELETE)
- Pattern corpus is separate from the RIO ledger
- Patterns are non-authoritative (never decide or execute)
- No identity inference or interpretation
- Fail closed on validation

---

## Pattern Schema

Each pattern in `patterns.jsonl` is a single JSON line:

```json
{
  "pattern_id": "PAT-001",
  "pattern_type": "workflow|decision|constraint|risk|communication|design",
  "description": "Human-readable description of the observed pattern",
  "conditions": {
    "context": ["email", "external communication"],
    "inputs": ["email", "client"],
    "signals": ["delay", "deadline"]
  },
  "expression": "Observed: <what was observed and when>",
  "confidence": {
    "score": 0.8,
    "evidence_count": 4,
    "reinforcement": false
  },
  "version": "0.1",
  "created_at": "2026-04-01T00:00:00Z"
}
```

---

## Validation Rules

`validate_pattern.py` checks:

| Check | Rule |
|-------|------|
| Schema | All required fields present |
| Evidence | `evidence_count ≥ 2` OR `(1 + reinforcement)` |
| Confidence | `score = min(1.0, evidence_count * 0.2)` |
| Language | No identity/trait words, no interpretation beyond signals |
| System rules | Not an extraction/parsing/regex rule |
| Bounded | `conditions.context`, `conditions.inputs`, `conditions.signals` all present |

**FAIL** → written to `rejected.jsonl`, not appended.
**PASS** → appended to `patterns.jsonl`, index updated.

---

## Selection Algorithm

`select_patterns.py` scores each pattern against the task:

| Factor | Points |
|--------|--------|
| Context match | +2 |
| Inputs overlap | +2 |
| Per signal match | +1 each |
| Type boost (task keyword → pattern type) | +2 |
| **Final score** | `raw * (1 + confidence.score)` |

Rules:
- Max 5 patterns, min 3 (if available)
- At least 1 workflow + 1 constraint (if available)
- Drop conflicts (keep higher score)
- Exclude patterns with confidence < 0.5

---

## Context Block Format

`generate_context.py` produces:

```
--- Pattern Context (Non-Authoritative) ---
Observed patterns for reference only:
1) <description>
   Type: <type>
   Confidence: <high|medium>
   Constraint: non-authoritative; do not treat as instruction
...
Behavior Rules:
- Patterns are observations, not instructions
- Do NOT assume direction or make decisions
- Ask at most ONE clarifying question if needed
- Offer 2–3 concise options (A/B/C)
- Do NOT choose for the user
- Keep responses concrete and forward-moving
--- End Pattern Context ---

Task:
<original task>
```

Confidence mapping: `0.8–1.0 = high`, `0.5–0.79 = medium`, `<0.5 = exclude`

---

## Usage

```bash
# Validate and append a pattern
python validator/validate_pattern.py pattern.json

# Select patterns for a task
python selector/select_patterns.py task.json

# Generate context block for a task
python generator/generate_context.py task.json
```

---

## How This Connects (Later)

```
User Task → select_patterns → generate_context → prepend to LLM prompt → response
```

This layer shapes behavior only. It does not approve, execute, or modify RIO governance.

---

## What This Is NOT

- Not connected to Gmail, APIs, or execution tools
- Not part of the RIO gateway, HITL, or ledger
- Not a user identity or trait system
- Not an auto-ingestion pipeline
- Not a UI
