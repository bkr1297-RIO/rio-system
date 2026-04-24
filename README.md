# RIO System — Governed Intelligence Runtime

A modular system for observing, shaping, and governing AI-driven actions before execution, while preserving human authority.

---

## What This Is

This repository contains the runtime layers that sit between a task and real-world execution.

It provides:

- pattern-based reference (what tends to happen)
- real-time contrast (what’s happening now)
- controlled surfacing (when to show it)
- observation logging (what happened)
- trend analysis (what repeats over time)

All layers are non-authoritative.

Execution and enforcement are handled separately by the RIO receipt protocol.

---

## System Flow

text id="flow1" Task → Pattern Selection → Draft / Proposal → MANTIS Contrast → Trigger Engine → Surface (optional) → Logging → Trend Analysis → Human Decision → RIO Governance → Execution 

---

## Core Layers

### Pattern Corpus (Reference Layer)

Stores validated patterns in an append-only format.

- source: /corpus/patterns.jsonl
- contains: workflow, constraint, risk, language patterns
- used to provide context for comparison
- does not execute or decide

---

### Selector

Selects the most relevant patterns per task.

- max 5 patterns
- guarantees inclusion of:
  - at least one constraint (if present)
  - at least one risk (if present)
- deduplicates by pattern_id
- deterministic scoring

---

### MANTIS (Contrast Engine)

Compares current draft or action against selected patterns.

Outputs:

- ALIGNED
- PARTIAL
- DEVIATES

Also computes:

- alignment score
- risk flags
- severity level

MANTIS observes only. It does not act.

---

### Trigger Engine

Determines when contrast should be surfaced.

Trigger types:

- T1 — Pre-action
- T2 — Pre-commit
- T3 — Risk detected
- T4 — Constraint violation
- T5 — Manual request

Includes:

- threshold filtering (avoid noise)
- quiet mode (no surface when high alignment)
- deduplication (no repeated alerts)

---

### Surface Layer

Formats contrast into human-readable output.

- non-blocking
- non-authoritative
- provides A/B/C options
- user always decides

---

### Logging (Observation Memory)

Append-only record of all contrast events.

- file: /mantis/logs/observations.jsonl
- records:
  - task
  - severity
  - pattern_ids
  - trigger type
  - surface shown or not

Logging does not affect system behavior.

---

### Trend Detection (Behavior Over Time)

Analyzes logs to identify:

- drift (how often deviations occur)
- recurring patterns
- risk frequency
- severity distribution

Manual invocation:

python id="trend_call" analyze_trends(window_size=20) 

Read-only. Does not modify system state.

---

## Design Principles

### 1. Non-Authority

No component in this repository:
- executes actions
- approves actions
- blocks actions

All outputs are advisory.

---

### 2. Separation of Concerns

| Layer | Role |
|------|------|
| Pattern Corpus | memory of behavior |
| MANTIS | observation |
| Trigger | timing |
| Logging | event history |
| Trends | behavior analysis |
| RIO Protocol | execution + proof |

---

### 3. Fail-Closed Execution (External)

Actual execution control is enforced by the RIO receipt protocol.

This repository does not execute actions.

---

### 4. Append-Only Memory

- patterns are append-only
- logs are append-only
- no mutation of history

---

## What This Repository Does NOT Do

- no execution of real-world actions
- no approval workflows
- no policy engine
- no UI
- no automation of decisions

---

## Repository Structure

text id="repo_tree" pattern-corpus/   corpus/     patterns.jsonl     pattern_index.json     rejected.jsonl    validator/     validate_pattern.py    selector/     select_patterns.py    generator/     generate_context.py    mantis/     mantis_contrast.py     trigger_engine.py     mantis_logger.py     trend_analyzer.py    mantis/logs/     observations.jsonl  examples/   example_usage.md   mantis_example.md   mantis_logging_example.md   mantis_trends_example.md 

---

## How This Fits

This system provides pre-execution awareness.

It answers:

- “Does this match expected behavior?”
- “What is missing?”
- “Is there risk?”
- “Is this a pattern or a one-off?”

It does not answer:

- “Should this execute?”

---

## One Line

Observe before action. Decide before execution. Prove after.