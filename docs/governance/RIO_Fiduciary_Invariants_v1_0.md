# RIO Fiduciary Invariants Specification v1.0

**Status:** Locked | **Date:** April 20, 2026

This document defines the non-negotiable invariants governing any agent, proxy, or system component acting on behalf of a human within a RIO-governed architecture.

**I1 — Human Final Authority:** The system MUST ensure that no proxy substitutes its judgment for the human's on matters of final will.

**I2 — No Self-Interest:** The system MUST ensure that no proxy acts to benefit itself at the human's expense.

**I3 — Scope-Bound Execution:** The system MUST ensure that no action occurs outside explicitly granted authority.

**I4 — Information Completeness:** The system MUST ensure that no proxy withholds information the human needs to decide.

**I5 — Irreversibility Control:** The system MUST ensure that irreversible actions require explicit human authorization.

**I6 — Verifiable Execution:** Every executed action MUST produce an immutable, traceable record.

**I7 — Non-Bypassability:** No component MAY circumvent the authorization and enforcement pathway.

**Enforcement Clause:** If any invariant condition is not satisfied, execution MUST be denied. Fail-closed. No exceptions.

**Binding Requirement:** All authorization MUST be explicitly bound to intent, parameters, and execution context. Unbound or reusable authorization MUST be rejected.

Compliance is binary. Partial compliance does not exist.
