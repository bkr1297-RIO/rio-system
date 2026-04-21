# INTERACTION MONITOR SPECIFICATION (v0.1)

**Status:** Draft (spec candidate)
**Layer:** Application Layer (above RIO Standard + Receipt Protocol)
**Dependency:** Non-functional without RIO

---

## 0. Purpose

The Interaction Monitor (IM) observes human-agent interactions and surfaces signals about **interaction integrity**:

- unresolved ambiguity
- constraint mismatch
- semantic drift
- false agreement
- incomplete resolution

The IM:

- does NOT authorize actions
- does NOT execute actions
- does NOT enforce policies

It governs **awareness**, not **action**.

---

## 1. Core Principle

> The Interaction Monitor may observe and signal.
> It must not decide, authorize, or execute.

Authority remains with:

- the human (Decision Surface)
- the RIO Execution Gate

---

## 2. System Placement

```text
Human <-> Agent(s)
        |
Interaction Monitor (signals only)
        |
Decision Surface (human commit)
        |
Authorization -> Execution Gate -> Execution -> Receipt -> Ledger
```

The IM exists strictly before commitment, not at or after execution.

---

## 3. Scope of Observation

The IM observes only structural properties of interaction, not meaning itself.

Examples of observable signals:

- missing constraint confirmation
- repeated unresolved questions
- divergence between request and response
- contradiction across turns
- incomplete alignment before agreement

The IM MUST NOT infer intent beyond what is explicitly present.

---

## 4. Capabilities

### 4.1 Observation

The IM MAY:

- monitor interaction streams
- track questions vs responses
- track stated vs applied constraints
- detect unresolved elements

---

### 4.2 Signal Detection

The IM MAY emit signals such as:

- `AMBIGUITY_DETECTED`
- `CONSTRAINT_MISMATCH`
- `DRIFT_DETECTED`
- `FALSE_AGREEMENT`
- `INCOMPLETE_RESOLUTION`

Signals MUST be based on observable structure.

---

### 4.3 Signal Emission

The IM MAY produce:

**InteractionAlert**

```json
{
  "type": "InteractionAlert",
  "category": "constraint_mismatch",
  "severity": "medium",
  "description": "Budget constraint stated but not applied in proposed plan",
  "evidence_refs": ["turn-2", "turn-5"],
  "suggested_actions": [
    "restate constraint",
    "request constrained version of plan"
  ]
}
```

---

**CoherenceSignal**

```json
{
  "type": "CoherenceSignal",
  "coherence_index": 0.64,
  "gaps": [
    "timeline undefined",
    "constraints partially applied"
  ],
  "recommendations": [
    "clarify timeline",
    "confirm constraint boundaries"
  ]
}
```

---

## 5. Non-Capabilities (Strict)

The IM MUST NOT:

- authorize actions
- execute actions
- modify intent, payload, or policy
- reorder or prioritize options
- influence decisions automatically
- intervene in execution flow

---

## 6. Non-Interference Rule

The IM MUST remain:

- advisory only
- visible to the human
- non-blocking

It MUST NOT:

- act as a hidden control layer
- alter system outputs silently
- override human decisions

---

## 7. Severity Behavior

Signal severity affects:

- visibility
- urgency of presentation

It MUST NOT affect:

- system behavior
- authorization
- execution

---

## 8. Governance Requirements

To be compliant:

1. **Declared Scope**
   - What interactions are observed
   - What signals are emitted
2. **Transparency**
   - Signals visible to human
   - Evidence references provided
3. **Auditability**
   - Signals logged
   - No hidden behavior
4. **Privacy Respect**
   - Only necessary interaction data observed

---

## 9. Failure Behavior

When uncertain, the IM MUST:

- prefer silence over false signals
- provide low-pressure suggestions
- avoid high-severity alerts without strong evidence

The IM MUST NOT:

- escalate into decision-making
- generate artificial agreement
- act beyond observation

---

## 10. Non-Goals

This spec does NOT:

- define decision correctness
- define execution logic (RIO handles this)
- define policy enforcement
- replace human judgment

---

## 11. Summary

- RIO governs execution integrity
- Receipt Protocol governs proof
- Digital Fiduciary supports decisions
- Interaction Monitor observes interaction quality

The Interaction Monitor adds:

> a governance primitive for collaboration quality

It strengthens the system by making misalignment visible before commitment, while preserving authority and enforcement boundaries.

---

## 12. Final Rule

The Interaction Monitor helps the human see clearly.
It must not change what happens.
