# RIO Invariants — Canonical Constraint Document

**Version:** 1.0.0
**Hash:** To be computed on first load
**Status:** LOCKED — changes require governance approval

---

## Purpose

This document defines the non-negotiable invariants of the RIO system. Every skill, adapter, and agent MUST reference this document. If any invariant is violated, the system MUST halt with `ERR_FATAL`.

These invariants are not guidelines. They are hard constraints. They cannot be relaxed, overridden, or interpreted. They are the constitution of the system.

---

## Core Invariants

### INV-001: Human Authority

No action executes without human authority. Every execution requires either explicit human approval or a trust policy that a human created and can revoke at any time.

**Test:** If `execution.human_authority_chain` is empty or broken, the system MUST halt.

### INV-002: Kernel Never Executes

The Kernel evaluates proposals and produces decisions. It NEVER executes. It NEVER calls external services. It NEVER modifies state beyond writing to the decision mailbox.

**Test:** If any code path in the kernel produces a side effect beyond mailbox writes, the system MUST halt.

### INV-003: Gateway Is the Only Executor

The Gateway Enforcer is the ONLY component authorized to execute actions. No other component — not the kernel, not the sentinel, not the clarification agent, not any skill — may execute.

**Test:** If any non-gateway component attempts execution, the system MUST halt.

### INV-004: Mailbox Is Append-Only

Mailbox entries are NEVER updated. Mailbox entries are NEVER deleted. All state transitions create new entries. The full system state is reconstructable from mailbox entries alone.

**Test:** If any UPDATE or DELETE operation targets `mailbox_entries`, the system MUST halt.

### INV-005: Ledger Is Hash-Chained

Every ledger entry contains a hash of the previous entry. The chain is tamper-evident. Breaking the chain is detectable and constitutes a system integrity failure.

**Test:** If `hash(entry[n-1]) != entry[n].prev_hash`, the system MUST halt.

### INV-006: Sentinel Flags Only

The Sentinel detects anomalies and flags them. It NEVER blocks execution. It NEVER halts the system. It writes to the sentinel mailbox and surfaces to Notion when severity >= WARN. Blocking is the Gateway's job.

**Test:** If sentinel code contains any execution blocking, halt, or reject logic, the system MUST halt.

### INV-007: Receipts Are Cryptographic Proof

Every executed action produces a receipt containing a SHA-256 hash of all action fields and an Ed25519 signature. Receipts are independently verifiable without system access.

**Test:** If any execution completes without a valid receipt, the system MUST halt.

### INV-008: No Default Assumptions

When information is missing, ambiguous, or unclear, the system MUST ask for clarification. It MUST NOT assume, infer, or apply defaults. Silence equals escalation to human, never assumption.

**Test:** If any code path applies a default value to an ambiguous field without human confirmation, the system MUST halt.

### INV-009: Single Role Per Step

Only one role is active per execution step. No multi-role execution. Handoffs between roles must be explicit, logged, and traceable.

**Test:** If two roles are active simultaneously in the same execution context, the system MUST halt.

### INV-010: Trace Completeness

Every action has a trace_id that links the complete chain: proposal → kernel decision → gateway enforcement → receipt → ledger entry. Incomplete traces are system failures.

**Test:** If any trace_id chain has gaps, the system MUST halt.

### INV-011: Dashboard Is Read-Only

The dashboard displays system state. It NEVER modifies state. It NEVER triggers execution. It is a window, not a control surface.

**Test:** If any dashboard operation produces a write to any data store, the system MUST halt.

### INV-012: Adapters Translate Only

Adapters convert skill format between platforms. They NEVER change meaning. They NEVER add authority. They NEVER modify constraints. Translation is format conversion, not interpretation.

**Test:** If adapter output differs semantically from adapter input, the system MUST halt.

---

## Enforcement Errors

| Error Code | Trigger | Severity |
|---|---|---|
| `ERR_FATAL: GOVERNANCE_NOT_LOADED` | Governance skill missing on agent load | Fatal — agent refuses all tasks |
| `ERR_FATAL: ADAPTER_INVALID` | Adapter output missing governance_hash or invariants_ref | Fatal — agent refuses all tasks |
| `ERR_FATAL: INVARIANTS_MISMATCH` | Skill invariants_ref or invariants_version does not match canonical | Fatal — agent refuses all tasks |
| `ERR_FATAL: ROLE_VIOLATION` | Multiple roles active in same step, or role acting outside boundary | Fatal — step rejected |
| `ERR_FATAL: EXECUTION_BOUNDARY` | Non-gateway component attempted execution | Fatal — action blocked |
| `FLAG_DRIFT` | Witness detects behavioral drift from expected patterns | Warning — logged, not blocking |

---

## Invariant Versioning

**Current version:** 1.0.0

All skills MUST declare:
- `invariants_ref: "_invariants.md"`
- `invariants_version: "1.0.0"`

If a skill's declared version does not match this document's version, the system MUST emit `ERR_FATAL: INVARIANTS_MISMATCH` and refuse to load the skill.

Changes to this document require:
1. A proposal packet submitted to the governance mailbox
2. Human approval through the standard approval flow
3. Version increment (semver)
4. All skills updated to reference new version
5. Full test suite re-run

---

## Verification

Any agent can verify invariant compliance by checking:

```
1. Does the governance skill load first? (INV-001)
2. Does the kernel produce decisions without side effects? (INV-002)
3. Is execution restricted to the gateway? (INV-003)
4. Are mailbox operations append-only? (INV-004)
5. Is the ledger hash chain intact? (INV-005)
6. Does the sentinel flag without blocking? (INV-006)
7. Do all executions produce receipts? (INV-007)
8. Are ambiguous inputs escalated, never defaulted? (INV-008)
9. Is only one role active per step? (INV-009)
10. Are all trace chains complete? (INV-010)
11. Is the dashboard read-only? (INV-011)
12. Do adapters translate without changing meaning? (INV-012)
```

If any answer is NO, the system is in violation. Halt and report.
