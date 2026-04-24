# RIO System — Architecture

## Overview

The RIO System is a pre-execution awareness layer that sits between intent and action.

It provides structured observation, contrast, and memory—without taking control of execution.

Execution is handled separately by the RIO Receipt Protocol.

---

## Architectural Position

text [ AI / User Intent ]           ↓ [ RIO System (this repo) ]           ↓ [ RIO Governance + Receipt Protocol ]           ↓ [ Execution ] 

---

## Core Components

### 1. Pattern Corpus

Purpose: Reference memory of known patterns

- append-only storage
- validated before entry
- contains:
  - workflow patterns
  - constraint patterns
  - risk patterns
  - language patterns

Does not:
- execute
- decide
- update itself

---

### 2. Selector

Purpose: Determine which patterns apply to a task

- deterministic scoring
- max 5 patterns
- guarantees:
  - at least one constraint (if present)
  - at least one risk (if present)
- deduplicates by pattern_id

---

### 3. MANTIS (Contrast Engine)

Purpose: Compare current state to expected patterns

Outputs:
- ALIGNED
- PARTIAL
- DEVIATES

Also produces:
- alignment score
- risk flags
- severity level

Constraint:
- observer only

---

### 4. Trigger Engine

Purpose: Decide when to surface contrast

Trigger types:
- T1: Pre-action
- T2: Pre-commit
- T3: Risk detection
- T4: Constraint violation
- T5: Manual request

Features:
- threshold filtering
- quiet mode
- deduplication

---

### 5. Surface Layer

Purpose: Present contrast to user

Characteristics:
- non-blocking
- non-authoritative
- provides options (A/B/C)
- human retains control

---

### 6. Logging Layer

Purpose: Record system observations

- append-only JSONL
- records:
  - task
  - severity
  - patterns involved
  - trigger type
- does not affect system behavior

---

### 7. Trend Analyzer

Purpose: Analyze behavior over time

Produces:
- drift score
- pattern frequency
- risk frequency
- severity distribution

Invocation:
- manual (v0.1)

Constraint:
- read-only

---

## Data Flow

text Patterns → Selected → Compared → Evaluated → (maybe) surfaced → Logged → Aggregated 

---

## System Guarantees

### Non-Authority
No component:
- executes actions
- blocks execution
- makes decisions

---

### Determinism
All outputs are:
- rule-based
- repeatable
- inspectable

---

### Separation of Concerns

| Layer | Responsibility |
|------|---------------|
| Pattern Corpus | memory |
| MANTIS | observation |
| Trigger | timing |
| Logging | history |
| Trends | analysis |
| RIO Protocol | enforcement |

---

### Fail-Closed Execution (External)

Execution only occurs if:
- intent matches approval
- validation passes

This is enforced outside this repository.

---

## Design Philosophy

The system does not attempt to:

- optimize decisions
- automate behavior
- replace human judgment

It instead provides:

> structured awareness before action

---

## Extension Points

Future layers may include:

- adaptive pattern weighting
- automated trend surfacing
- anomaly clustering

These must preserve:
- non-authority
- determinism
- separation of concerns

---

## Summary

The RIO System provides:

- awareness (MANTIS)
- timing (Trigger)
- memory (Logging)
- reflection (Trends)

It does not provide execution.

---

## One Line

A system that sees clearly before anything acts.
