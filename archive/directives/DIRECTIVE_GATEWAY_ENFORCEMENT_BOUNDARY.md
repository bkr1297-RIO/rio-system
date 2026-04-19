# DIRECTIVE: Gateway Enforcement Boundary

**Date:** 2026-04-04
**Target:** Manny (Builder), Andrew (Architect), Damon (SDK)
**Authority:** Brian / Chief of Staff

---

## The Rule

**All enforcement logic MUST be implemented in the Gateway (`rio-system/gateway/`).**

The ONE PWA (`rio-one.manus.space` / `one-consent`) is an **interface**. It is an untrusted client. It does not enforce roles, it does not evaluate policy, it does not store the canonical ledger, and it does not perform active audit.

If enforcement logic is built into the ONE PWA, any other client (CLI, API, Slack bot, another app) can bypass it by talking directly to the Gateway.

**The Gateway is the enforcement boundary. It must be non-bypassable.**

---

## What This Means for Implementation

### For Manny (Builder)
- **Area 1 (Role Enforcement):** The `principals` table, `resolvePrincipal` middleware, and `requireRole` checks must be built in the Gateway codebase. The ONE PWA can have a UI to manage them, but the Gateway must enforce them.
- **Area 2 (Policy Engine):** The `evaluatePolicy` function and quorum collection must run in the Gateway.
- **Area 3 (CAS + Ledger):** The CAS storage and ledger append-only boundary must be enforced by the Gateway database.
- **Area 4 (Active Audit):** The audit pipeline must run in the Gateway after execution.
- **Area 5 (Meta-Governance):** The control mode state machine and quorum checks must run in the Gateway.

### For Andrew (Architect)
- Ensure all specs explicitly state that the Gateway is the enforcement point.
- The ONE PWA should be treated as just another client in the architecture diagrams.

### For Damon (SDK)
- The SDK must assume the Gateway is the only source of truth.
- The SDK connects to the Gateway, not to the ONE PWA.

---

## Immediate Action Required

**Manny:** Your Area 1 delivery (`304f0fd`) failed verification because the code was built in the ONE PWA repo. You must move the `principals` table, `resolvePrincipal` middleware, and `requireRole` enforcement into `rio-system/gateway/`. Commit the actual code files to the `rio-system` repository. Resubmit for verification. Do not proceed to Area 2 until Area 1 is verified in the Gateway codebase.
