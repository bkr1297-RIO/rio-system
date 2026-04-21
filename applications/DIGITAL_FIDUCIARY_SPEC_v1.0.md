# Digital Fiduciary Specification v1.0

**Status:** Draft  
**Layer:** Application (above RIO Standard)  
**Depends on:** RIO Standard v1.0 (Execution Boundary + Receipt Protocol)

---

## 1. Purpose

This specification defines the role, constraints, and operational boundaries of a **Digital Fiduciary** — a pattern-aware, governance-bound assistant that acts in the best interest of a principal (human) within a RIO-governed system.

A Digital Fiduciary is not an executor. It does not authorize actions. It does not bypass the execution boundary.

It exists to:

- model a principal's behavior, preferences, and patterns
- detect deviations from expected patterns
- emit structured recommendations and signals
- reduce friction in decision-making without reducing control

---

## 2. Core Principle

> A Digital Fiduciary acts in the principal's interest, within the principal's boundaries, and never beyond the principal's authority.

This is not a suggestion. It is a structural constraint enforced by the RIO Standard.

---

## 3. What a Digital Fiduciary Does

A Digital Fiduciary MAY:

- observe intent proposals and execution history (via ledger)
- model the principal's decision patterns over time
- detect anomalies (unusual intent, unexpected payload, timing deviation)
- emit structured signals: `RECOMMEND`, `WARN`, `FLAG`
- suggest approvals or rejections based on pattern match
- explain why a recommendation was made

A Digital Fiduciary MUST:

- operate only on data available through the RIO receipt and ledger system
- emit signals through a defined interface (not side channels)
- include a confidence score with every recommendation
- include a traceable rationale with every signal
- respect scope constraints defined by the principal

---

## 4. What a Digital Fiduciary Must NOT Do

A Digital Fiduciary MUST NOT:

- issue authorization tokens (DTTs)
- execute actions directly
- modify payloads
- bypass the Execution Gate
- expand its own scope or authority
- override a principal's explicit decision
- act without the principal's awareness

If a Digital Fiduciary violates any of these constraints, it is no longer operating as a fiduciary. The system MUST treat its outputs as untrusted.

---

## 5. Relationship to the RIO Standard

The Digital Fiduciary operates **above** the RIO Standard:

```
┌─────────────────────────────────────┐
│  Digital Fiduciary (this spec)      │  ← observes, recommends, signals
├─────────────────────────────────────┤
│  RIO Standard v1.0                  │  ← authorizes, binds, executes, records
├─────────────────────────────────────┤
│  Adapters (email, funds, etc.)      │  ← performs real-world actions
└─────────────────────────────────────┘
```

The Digital Fiduciary:

- reads from the ledger (receipts, decisions, patterns)
- emits signals to the governance layer (recommendations, warnings)
- never writes to the ledger directly
- never issues tokens or authorizations
- never calls adapters

All real execution flows through the RIO boundary. The Digital Fiduciary influences decisions; it does not make them.

---

## 6. Signal Format

A Digital Fiduciary emits structured signals:

```json
{
  "signal_type": "RECOMMEND",
  "trace_id": "trace-abc-123",
  "intent_summary": "Send quarterly report to compliance@example.com",
  "recommendation": "APPROVE",
  "confidence": 0.94,
  "rationale": "Matches recurring quarterly pattern. Same recipient, similar payload size, expected timing window.",
  "pattern_refs": ["pattern-quarterly-report-v3"],
  "timestamp": "2026-04-21T10:00:00.000Z"
}
```

Signal types:

| Type | Meaning |
|------|---------|
| `RECOMMEND` | Suggests approval or rejection based on pattern match |
| `WARN` | Flags a deviation from expected behavior |
| `FLAG` | Marks an intent for human review without recommendation |

All signals are advisory. None are binding.

---

## 7. Learning Constraints

A Digital Fiduciary MAY learn from:

- approved intents and their outcomes
- denied intents and their reasons
- principal feedback on recommendations
- ledger history (patterns, timing, frequency)

A Digital Fiduciary MUST NOT learn from:

- data outside the RIO system boundary
- other principals' data (unless explicitly shared)
- system internals (gate logic, token mechanics)

Learning improves recommendations. Learning never expands authority.

---

## 8. Accountability

Every signal emitted by a Digital Fiduciary MUST be:

- traceable to a specific intent or pattern
- reproducible given the same input data
- auditable by the principal or a third party

If a recommendation leads to an undesirable outcome, the signal chain MUST be reviewable to determine:

- what data the fiduciary observed
- what pattern it matched
- what confidence it assigned
- whether the principal accepted or overrode the recommendation

---

## 9. Revocation

A principal MAY revoke a Digital Fiduciary's access at any time.

Revocation is immediate and complete:

- all active signal channels are closed
- no further recommendations are emitted
- historical signals remain in the ledger for audit
- the fiduciary retains no authority after revocation

---

## 10. Versioning

This specification follows the same versioning rules as the RIO Standard:

- **Patch** (v1.0.x) — clarifications, typo fixes, no behavioral change
- **Minor** (v1.x.0) — new signal types, new constraints, backward-compatible
- **Major** (vX.0.0) — breaking changes to the fiduciary contract

No version change may violate the core principle defined in Section 2.

---

## 11. Status and Next Steps

v1.0 defines the structural role and constraints of a Digital Fiduciary.

Future versions may define:

- multi-fiduciary coordination (multiple fiduciaries advising one principal)
- delegation protocols (fiduciary-to-fiduciary handoff)
- domain-specific signal schemas (financial, medical, legal)
- confidence calibration standards

These extensions MUST NOT modify the core constraint: a Digital Fiduciary never executes, never authorizes, and never bypasses the RIO boundary.
