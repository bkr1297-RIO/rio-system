# RIO — Canonical Definition (Foundation Layer)

## Definition

RIO converts authorized, executed system events into immutable, verifiable records within its scope.

---

## Mechanism

System Event → Record → Proof → Audit → Constraint → Stability

---

## Boundary

Includes:
- authorization
- execution
- system observation

Excludes:
- intent (unexpressed)
- off-system activity
- meaning

---

## Core Properties

### 1. Boundary Integrity

- System Event defines the boundary of what is captured
- Claims are limited to events within system scope
- No external assumptions are made

---

### 2. Function

RIO performs one function:

Fix system events into records.

All downstream effects (trust, control, safety) emerge from this, but are not directly claimed.

---

### 3. Authority Containment

Events cannot occur silently within the system boundary.

- every authorized action is recorded
- every recorded event is available for verification

---

## Pattern (Closed Loop)

System Event → Record → Proof → Audit → Constraint → Stability

Each step depends only on the previous:

- no interpretation
- no narrative
- no external truth dependency

---

## Valid Claims

From this structure, only the following are valid:

- Events can be verified
- Verification enables audit
- Audit enables constraint enforcement
- Constraint enforcement stabilizes system behavior

---

## Precision Constraints

- "immutable records within system scope" replaces broader claims
- no claim extends beyond the defined boundary
- no claim depends on belief, identity, or interpretation

---

## System Basis

This layer depends only on:

- events
- records
- verification

It does not depend on:

- people
- models
- intentions
- narratives

---

## Operational Meaning

If an event occurs within the system:

→ it is recorded  
→ the record can be verified  
→ the verification enables audit  
→ audit enables constraint  

No step requires interpretation.

---

## Final Statement

This foundation layer ensures that:

- truth is bounded
- records are fixed
- drift is detectable

Nothing above it can change without being observable.

---

## One Line

RIO fixes events into verifiable records, and everything else follows from that.
