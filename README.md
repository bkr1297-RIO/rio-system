# RIO System

**Observation and monitoring layer for governed AI execution.**

This repository contains the pattern-awareness subsystem that helps surface relevant context before actions execute. It observes, compares, and surfaces — but it does not approve, block, or execute anything.

> This is **part of the RIO system**, not the entire system. It handles observation. Other repositories handle governance, proof, and interface.

---

## What RIO Is

RIO is a governed execution layer for AI systems. It sits between intelligent systems and real-world actions, ensuring that important actions cannot execute without authorization, policy checks, verification, and proof. Different repositories implement different parts of the system, including governance, receipts, observation, and interface layers.

**The short version:**

- AI proposes.
- Humans approve when required.
- RIO governs execution.
- Receipts prove what happened.

---

## What This Repository Contains

The pre-execution awareness layer. Before an action reaches the governance gate, this system answers:

- "Does this match expected behavior?"
- "What patterns are relevant here?"
- "Is there risk that should be surfaced?"
- "Is this a recurring pattern or a one-off?"

It does **not** answer: "Should this execute?" — that decision belongs to the governance layer.

All outputs are advisory. No component in this repository executes, approves, or blocks actions.

---

## How This Repo Fits Into the Larger System

| Repository | Role |
|------------|------|
| [rio-protocol](https://github.com/bkr1297-RIO/rio-protocol) | Canonical protocol specification |
| [rio-receipt-protocol](https://github.com/bkr1297-RIO/rio-receipt-protocol) | Proof layer — local receipt engine |
| **[rio-system](https://github.com/bkr1297-RIO/rio-system)** (this repo) | Observation and monitoring layer |
| [language-intake-mvp](https://github.com/bkr1297-RIO/language-intake-mvp) | Language governance — crossing detection |

---

## System Flow

```
Task → Pattern Selection → Draft / Proposal → Contrast Check → Trigger Engine → Surface (optional) → Logging → Trend Analysis → Human Decision → RIO Governance → Execution
```

---

## Core Layers

### Pattern Corpus (Reference Layer)

Stores validated patterns in an append-only format. Used to provide context for comparison — does not execute or decide.

- Source: `/corpus/patterns.jsonl`
- Contains: workflow, constraint, risk, and language patterns

---

### Selector

Selects the most relevant patterns for a given task (max 5). Guarantees inclusion of at least one constraint and one risk pattern when available. Deterministic scoring.

---

### MANTIS (Contrast Engine)

Compares current draft or action against selected patterns.

Outputs:
- ALIGNED
- PARTIAL
- DEVIATES

Also computes alignment score, risk flags, and severity level.

**MANTIS observes only. It does not act.**

---

### Trigger Engine

Determines when contrast should be surfaced to the human.

Trigger types:
- T1 — Pre-action
- T2 — Pre-commit
- T3 — Risk detected
- T4 — Constraint violation
- T5 — Manual request

Includes threshold filtering (avoids noise), quiet mode (no surface when high alignment), and deduplication.

---

### Surface Layer

Formats contrast into human-readable output. Non-blocking, non-authoritative. Provides options — the user always decides.

---

### Logging (Observation Memory)

Append-only record of all contrast events. Records task, severity, pattern IDs, trigger type, and whether surface was shown. Logging does not affect system behavior.

---

### Trend Detection (Behavior Over Time)

Analyzes logs to identify drift, recurring patterns, risk frequency, and severity distribution. Read-only — does not modify system state.

---

## Design Principles

### 1. Non-Authority

No component in this repository executes, approves, or blocks actions. All outputs are advisory.

### 2. Separation of Concerns

| Layer | Role |
|------|------|
| Pattern Corpus | Memory of behavior |
| MANTIS | Observation and contrast |
| Trigger | Timing and surfacing decisions |
| Logging | Event history |
| Trends | Behavior analysis over time |
| RIO Protocol (external) | Execution + proof |

### 3. Fail-Closed Execution (External)

Actual execution control is enforced by the RIO protocol. This repository does not execute actions.

### 4. Append-Only Memory

Patterns are append-only. Logs are append-only. No mutation of history.

---

## What This Repository Does NOT Do

- No execution of real-world actions
- No approval workflows
- No policy engine
- No user interface
- No automation of decisions
- No governance consequence enforcement

---

## Repository Structure

```
pattern-corpus/
  corpus/
    patterns.jsonl
    pattern_index.json
    rejected.jsonl
  validator/
    validate_pattern.py
  selector/
    select_patterns.py
  generator/
    generate_context.py
  mantis/
    mantis_contrast.py
    trigger_engine.py
    mantis_logger.py
    trend_analyzer.py
  mantis/logs/
    observations.jsonl

examples/
  example_usage.md
  mantis_example.md
  mantis_logging_example.md
  mantis_trends_example.md
```

---

## Docs

- [Overview](/docs/OVERVIEW.md)
- [Architecture](/docs/ARCHITECTURE.md)

---

## One-Line Summary

Observe before action. Decide before execution. Prove after.
