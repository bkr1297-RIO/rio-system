# RIO Patches — Applied Modifications

**Invariants Version:** 1.0.0
**Last Updated:** 2026-04-15

---

## Purpose

This document records all patches applied to the RIO system after the initial Builder Contract. Each patch extends the system without modifying core invariants. Patches are additive — they add capabilities within existing constraints.

---

## Applied Patches

### PATCH-001: Ambiguity Handling Layer (Phase 2A)

**Date:** 2026-04-15
**Status:** APPLIED
**Invariants Modified:** NONE

**What it adds:**
- CLARIFY added to kernel decision enum (AUTO_APPROVE | REQUIRE_HUMAN | DENY | CLARIFY)
- Confidence scoring: `field_completeness * 0.4 + pattern_grounding * 0.3 + prior_context_match * 0.2 + human_signature_present * 0.1`
- 6 ambiguity detection rules evaluated before decision matrix
- Clarification Agent: stateless, non-authoritative, emits questions only
- TTL enforcement: 180s default (configurable 120-300s), max 3 rounds, max 15 minutes total
- NO-FALLBACK rule: silence = REQUIRE_HUMAN, never assume

**Affected components:**
- Kernel Evaluator (extended with CLARIFY path)
- Clarification Agent (new module)
- Mailbox (new event types: clarify_requested, clarify_response, clarify_timeout)

**Invariant compliance:**
- INV-002 preserved: Kernel still never executes, CLARIFY is a decision not an action
- INV-003 preserved: Clarification Agent cannot execute (code audit verified)
- INV-008 strengthened: NO-FALLBACK rule enforces "never assume" at the clarification layer

**Tests:** 35/35 pass (9 core tests per PATCH spec + 26 sub-tests)

---

### PATCH-002: DB-Backed Mailbox Decision

**Date:** 2026-04-15
**Status:** APPLIED
**Invariants Modified:** NONE

**What it changes:**
- Mailbox canonical backend is database (not file-based JSONL)
- JSONL becomes backup/export/audit format via `export_mailbox_to_jsonl()`
- `parseJsonlExport()` and `replayFromJsonl()` enable offline replay

**Invariant compliance:**
- INV-004 preserved: All 6 guarantees proven by code audit tests (no UPDATE, no DELETE, event sourcing, replay, trace chain, hash chain)
- Storage medium is irrelevant — the append-only invariant is enforced regardless

**Tests:** 27/27 guarantee proof tests pass

---

## Patch Rules

1. Patches MUST NOT modify any invariant in `_invariants.md`
2. Patches MUST declare which invariants they affect and prove compliance
3. Patches MUST include test counts and pass rates
4. Patches are additive — they extend, never replace
5. If a patch requires an invariant change, it MUST go through the full governance approval flow and trigger a version increment of `_invariants.md`

---

## Pending Patches

None at this time.
