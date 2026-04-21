# SKILL: Interaction Monitor

**Status:** Example Usage (Non-normative Skill)

> This document defines a skill: a bounded way to use RIO.  
> It is NOT part of the RIO standard or enforcement mechanism.

---

## Purpose

Monitor interactions for:

- ambiguity,
- drift,
- mismatch,
- false agreement.

This skill provides awareness and advisory signals. It does not execute, authorize, or route.

---

## Outputs

This skill MAY emit:

- `InteractionAlert` – describing specific issues in the interaction (e.g., ambiguity, missing constraints, misalignment),
- `CoherenceSignal` – describing the perceived coherence and alignment level of the conversation so far.

These outputs are advisory only.

---

## Constraints (MUST NOT)

This skill MUST NOT:

- authorize actions,
- execute actions,
- route or trigger execution,
- modify tokens, receipts, or ledger,
- generate or modify authorization mechanisms.

It may only observe interactions and emit advisory signals for humans or other skills to consider.

---
