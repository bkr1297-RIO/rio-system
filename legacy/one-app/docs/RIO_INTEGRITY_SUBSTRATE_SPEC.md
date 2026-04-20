# RIO Integrity Substrate — Bounded Spec

**Date:** 2026-04-13
**Status:** Implemented (intent pipeline path); not yet wired into HITL approval/execute path
**File:** `server/integritySubstrate.ts` (470 lines, 4 checks, 5 passing tests)

---

## Question 1: Below the four governance surfaces or embedded in one of them?

**Below.** The substrate sits beneath all four governance surfaces (Intent, State, Policy, Authority) and runs before any of them see the message. It is not embedded in any single surface — it is the shared foundation layer, analogous to TCP/IP beneath application protocols.

The current architecture has two distinct execution paths, and the substrate's coverage differs between them:

| Path | Entry Point | Substrate Coverage | Status |
|------|------------|-------------------|--------|
| Intent Pipeline | `processIntent()` in `intentPipeline.ts` | Step 0 — substrate runs first, blocks before governance | **Wired** |
| HITL Approval/Execute | `approveAndExecute` in `routers.ts` | Not wired — goes directly to Gateway | **Not wired** |

The intent pipeline path handles inbound messages (Telegram, API) and outbound actions routed through Bondi. The HITL path handles human-initiated actions from the ONE UI (approve → execute via Gateway). The substrate currently only covers the first path.

**Architectural position:**

```
Message arrives
    │
    ▼
┌─────────────────────────┐
│  INTEGRITY SUBSTRATE    │  ← runs FIRST, before any surface
│  nonce · dedup · replay │
│  receipt linkage        │
└─────────┬───────────────┘
          │ (passes)
          ▼
┌─────────────────────────┐
│  GOVERNANCE SURFACES    │
│  Intent → State →       │
│  Policy → Authority     │
└─────────────────────────┘
```

---

## Question 2: What is the exact definition of done?

The substrate is **done** when the following four conditions are met:

**Condition 1: Both execution paths are covered.** The substrate's `validateAtSubstrate()` function is called at the entry point of both the intent pipeline AND the HITL approval/execute path. No message reaches any governance surface without passing the substrate.

**Condition 2: All four checks enforce correctly.** Each check has a clear pass/fail behavior:

| Check | Pass Condition | Fail Behavior |
|-------|---------------|---------------|
| Nonce | Nonce is unique within TTL window (10 min) | BLOCKED_NONCE — message rejected, logged |
| Dedup | Content hash is unique within TTL window (5 min) | BLOCKED_DEDUP — message rejected, logged |
| Replay | Token ID (if present) is bound to matching content hash | BLOCKED_REPLAY — message rejected, logged |
| Receipt Linkage | Source and action fields are present | Block — missing fields for receipt chain |

**Condition 3: Substrate metadata flows through to receipt.** Every receipt (whether from the intent pipeline or the HITL path) includes `content_hash` and `nonce` from the substrate check, creating an unbroken audit trail from substrate → governance → receipt → ledger.

**Condition 4: Tests prove all four conditions.** Specifically:

1. First message passes substrate and reaches governance (existing test, passes)
2. Duplicate message blocked by substrate dedup (existing test, passes)
3. Duplicate nonce blocked by substrate (existing test, passes)
4. Substrate block produces correct receipt shape (existing test, passes)
5. Substrate metadata attached to passing intents (existing test, passes)
6. **NEW:** HITL approval path rejects duplicate nonce
7. **NEW:** HITL approval path rejects replayed content within TTL window

---

## Question 3: What existing behavior would it replace or intercept?

The substrate does **not replace** any existing behavior. It **intercepts** messages at a layer below the existing governance surfaces. Specifically:

**What it intercepts (already working on intent pipeline path):**

Every call to `processIntent()` now passes through `validateAtSubstrate()` as Step 0. If the substrate rejects the message, the function returns a `BLOCK` result with `SUBSTRATE` as the matched rule. The policy engine, firewall, and execution layer never see the message.

**What it would intercept (not yet wired on HITL path):**

The `approveAndExecute` procedure in `routers.ts` currently goes directly to the Gateway without any substrate check. Wiring the substrate here would intercept the approval request before it reaches the Gateway's `/authorize` and `/execute-action` endpoints. This means:

- A replayed approval request (same nonce) would be blocked locally before hitting the Gateway
- A duplicate execution request (same content hash within TTL) would be blocked locally
- The Gateway's own replay prevention (nonce + timestamp) remains as a second layer of defense

**What it does NOT touch:**

- The Gateway's own replay prevention middleware (`security/replay-prevention.mjs`) — this is a separate, independent layer
- The proxy's TTL check on intent expiry (`expiresAt` check in `approveAndExecute`) — this is a business rule, not an integrity check
- The proxy's constrained delegation check (proposer ≠ approver) — this is a governance rule, not a substrate concern
- The Gateway's token burn mechanism — this is execution-level, not substrate-level

---

## Question 4: What tests prove it without expanding scope?

Seven tests total. Five already exist and pass. Two new tests are needed to cover the HITL path:

| # | Test | File | Status | What It Proves |
|---|------|------|--------|----------------|
| 1 | First message passes substrate | `intentPipeline.test.ts` | PASS | Substrate does not block valid messages |
| 2 | Duplicate message blocked by dedup | `intentPipeline.test.ts` | PASS | Same content within 5-min window is killed |
| 3 | Duplicate nonce blocked | `intentPipeline.test.ts` | PASS | Reused nonce within 10-min window is killed |
| 4 | Block produces correct receipt | `intentPipeline.test.ts` | PASS | Substrate blocks generate proper audit trail |
| 5 | Metadata attached to passing intents | `intentPipeline.test.ts` | PASS | content_hash and nonce flow downstream |
| 6 | HITL path rejects duplicate nonce | **NEW** | TODO | approveAndExecute rejects replayed nonce |
| 7 | HITL path rejects duplicate content | **NEW** | TODO | approveAndExecute rejects same content in TTL |

**Scope boundary:** These seven tests prove the substrate works. They do not test governance decisions, policy evaluation, token issuance, or receipt signing — those are tested by their own test suites (981 passing tests across 53 files).

---

## Implementation Estimate

Wiring the substrate into the HITL path is a bounded patch — approximately 15 lines of code in `routers.ts` at the entry point of `approveAndExecute`, plus 2 new test cases. The substrate module itself (`integritySubstrate.ts`) requires zero changes.

```typescript
// In approveAndExecute, before Step 1 (Gateway login):
const substrateResult = validateAtSubstrate({
  content: `approve:${input.intentId}:${input.action}`,
  nonce: `hitl-${Date.now()}-${nanoid(8)}`,
  source: ctx.user.id,
  action: input.action || "approve_and_execute",
  channel: "one-ui",
});
if (!substrateResult.passed) {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Integrity Substrate: ${substrateResult.block_reason}`,
  });
}
```

This does not expand scope. It applies the existing substrate to an existing code path.
