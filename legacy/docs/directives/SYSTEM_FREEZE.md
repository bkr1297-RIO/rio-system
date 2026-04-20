# DIRECTIVE: System Freeze

> **Issued:** 2026-04-07  
> **Issued by:** Brian Kent Rasmussen (Human Root Authority)  
> **Scope:** All RIO system components — Gateway, ONE, rio-system repo  
> **Status:** ACTIVE

---

## Directive

The governed action loop is proven and repeatable. The system is frozen.

**No new features. No new layers. No version bumps. Only bug fixes that preserve the existing loop.**

---

## What Is Frozen

| Component | Version | Status |
|-----------|---------|--------|
| Gateway | v2.9.0 | Frozen |
| ONE Command Center | Current (rio-one.manus.space) | Frozen |
| rio-system repo | Current main | Frozen |

---

## Allowed Changes

Changes are permitted only if they meet all of the following criteria:

1. The change fixes a bug that breaks the existing governed action loop.
2. The change does not introduce new endpoints, new execution paths, or new dependencies.
3. After the change, the Golden Path verification checklist (see `docs/GOLDEN_PATH.md`) still passes in full.
4. The change is tested against the Golden Path before merge.

---

## Prohibited Changes

The following are explicitly prohibited until this directive is lifted:

- New connectors or action types
- New governance rules or risk tiers
- New principals or role types
- New UI pages or features in ONE
- Architecture changes (new services, new databases, new queues)
- Version bumps (no v2.10, no v3.0)
- Dependency additions

---

## Rationale

The system has achieved its Phase 1 objective: a fully verifiable governed action loop with real execution, real receipts, and real ledger entries. Four independent runs have confirmed repeatability. The next phase is scaling and hardening — not adding features. Freezing prevents drift and preserves the proven baseline.

---

## Lifting This Directive

This directive can only be lifted by the Human Root Authority (Brian Kent Rasmussen) with an explicit written directive in this repository.

---

*The system is proven. Everything from here is scaling, not proving.*
