# RIO — Canonical Specification (v1.0)

**Author:** Brian K. Rasmussen | April 2026  
**Status:** CANONICAL — All components derive from this document  
**Repository:** rio-system

---

> If it cannot be derived from this invariant, it is not part of RIO.

---

## Purpose

This document defines the complete, non-negotiable structure of the RIO system.

It unifies:
- Invariant
- System model
- Enforcement boundaries
- Derivation order

Everything in the system must derive from this document.

---

## Core Invariant

An action is AUTHORIZED only when:

1. A valid single-use DTT (Decision Token) exists
2. Lineage is fully resolved (no PENDING, no FAILURE in declared dependencies)
3. Execution payload exactly matches the authorized intent

**If any condition fails → DENY or BLOCK (fail-closed)**

---

## System Model

RIO is a deterministic execution control plane.

It does NOT:
- Interpret intent
- Evaluate meaning
- Make decisions

It enforces:
- **Permission** — authorization
- **Truth** — proof
- **Continuity** — lineage

---

## System Origin

The Execution Gate is the first enforceable boundary.

All components exist to satisfy its checks.

The system begins at the point where intent becomes real-world action.

---

## Execution Lifecycle

Every action must follow this sequence exactly:

```
Propose → Authorize → Record (PENDING) → Execute → Resolve → Stop
```

No step may be skipped. No step may be reordered.

---

## Enforcement Boundaries

### 1. Authority Boundary
Permission is granted only via DTT. Tokens are:
- Single-use
- Scoped to exact intent
- Bound by expiry

### 2. Truth Entry Boundary
No action begins without a PENDING record.  
Truth is written **before** execution.

### 3. Truth Resolution Boundary
No action completes without a resolved state.  
Only SUCCESS or FAILURE. No silent completion.

### 4. Lineage Integrity Boundary
No step proceeds unless lineage is fully resolved.  
A step is blocked if any declared dependency is PENDING or FAILURE.

---

## Fundamental Separations

### Truth ≠ Permission
```
Receipt ≠ Authorization
```
A receipt proves something happened. It does not authorize future action.

### Signal ≠ Authority
```
Context ≠ Authorization
```
Context may restrict. Context cannot grant permission.

---

## System Derivation Order

The system must be understood and built in this sequence:

| Order | Component | Role |
|---|---|---|
| 1 | Execution Gate | Enforces invariant directly — the firewall |
| 2 | Authorization Layer (DTT) | Generates and binds tokens to exact intent |
| 3 | Truth Layer (Ledger + Receipt) | Records PENDING; resolves SUCCESS / FAILURE |
| 4 | Lineage Enforcement | Validates dependency state before continuation |
| 5 | Constraints Layer | Enforces bounded behavior (SG / TES / MASG / CSIC) |
| 6 | Context Layer | Policy modifier — restrict only, no permission authority |

---

## Execution Gate (Core Boundary)

An action may execute only if all five checks pass in strict order:

1. `TOKEN_PRESENT` — token exists
2. `TOKEN_VALID` — not expired, not used
3. `TRACE_MATCH` — token.trace_id == proposal.trace_id
4. `INTENT_BINDING` — hash(intent + payload) == token.intent_hash
5. `LINEAGE_RESOLVED` — no declared dependency is PENDING or FAILURE

**Otherwise: DENY or BLOCK**

---

## Contributor Gate (CCL)

All contributors must prove under instrumented conditions:
- No action crosses Execution Gate without valid DTT
- No execution occurs without PENDING truth entry
- No continuation occurs with unresolved lineage
- All actions produce valid receipt + ledger record

**Any violation → reject contribution**

---

## System Constraints

- Fail-closed by default
- No implicit execution
- No permission inheritance
- No silent state
- No bypass path

---

## Non-Goals

RIO does NOT:
- Interpret human reasoning
- Evaluate correctness of content
- Predict behavior
- Make decisions

It governs only: **whether an action is allowed to execute**

---

## Final Constraint

If an action cannot satisfy the invariant at the Execution Gate:

```
→ It must not execute
→ It is not part of the system
```

---

## Document Lock

This document is canonical and frozen.  
New versions are created as new files (v1.1, v2.0).  
This file is never modified.

All specs, docs, tests, gateway implementations, and artifacts derive from this document.  
Add the following line to the top of every component file:

```
Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md
```

---

*Confidential — Brian K. Rasmussen — April 2026*
