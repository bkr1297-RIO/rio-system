# 02 — Governance Decision

**Source files:** `controlPlane.ts` (A1: IntentEnvelope, A2: VerificationResult, A3: GovernanceDecision, A4: ApprovalRecord, A8: LearningAnalysis, §2.E: ExpressionOutput)

---

## Purpose

The governance decision layer transforms raw intent into a verified, risk-assessed, policy-evaluated decision. It enforces the principle that no action proceeds without structured evaluation, and that silence equals refusal.

---

## Schemas

All schemas are defined in [`schema.json`](./schema.json). The canonical types are:

| Schema | Source Section | Description |
|---|---|---|
| `IntentEnvelope` | A1 | The atomic unit of proposed action. |
| `VerificationResult` | A2 | Six-check verification gate. Runs before governance. |
| `GovernanceDecision` | A3 | Risk assessment and policy evaluation. |
| `ApprovalRecord` | A4 | Human authorization boundary. |
| `ExpressionOutput` | §2.E | Non-authoritative AI output. Cannot enter kernel. |
| `LearningAnalysis` | A8 | Advisory learning loop. Never mutates live policy. |
| `PolicyRecommendation` | A8 | Learning loop recommendation. Status always PENDING_REVIEW. |
| `ReplayInput` | A8 | Suggested replay for failed executions. |

---

## Pipeline Order

The governance pipeline runs in strict order. Each step requires the previous step to succeed.

```
IntentEnvelope → Verification → Governance → Approval (if required) → Execution Token
```

1. **A1: Intent Envelope** — Package the proposed action with identity, nonce, timestamp, parameters, and policy version.
2. **A2: Verification** — Six checks in order: schema, auth, signature, TTL, nonce, replay. ALL must pass.
3. **A3: Governance** — Risk assessment. Produces APPROVE, DENY, or REQUIRE_HUMAN_APPROVAL.
4. **A4: Human Authorization** — If REQUIRE_HUMAN_APPROVAL, a valid ApprovalRecord must be provided. If missing: "Silence equals refusal."

---

## Verification Checks (A2)

Six checks run in order. `verified` = ALL six pass.

| # | Check | What it validates |
|---|---|---|
| 1 | `schema_valid` | All 10 required fields present and non-empty. source_type in enum. parameters is non-null object. |
| 2 | `auth_valid` | actor_id is in knownActorIds (if provided). |
| 3 | `signature_valid` | Signature present and >= 10 chars (if requireSignature=true). |
| 4 | `ttl_valid` | age >= 0 AND age <= INTENT_TTL_MS (300,000ms = 5 minutes). |
| 5 | `nonce_valid` | Nonce is a non-empty string. |
| 6 | `replay_check` | Nonce not already in usedNonces set. |

Required envelope fields: `intent_id`, `request_id`, `source_type`, `source_id`, `actor_id`, `timestamp`, `nonce`, `action_type`, `target`, `parameters`.

---

## Risk Decision Matrix (A3)

Governance ONLY runs after verification passes. Throws `GOVERNANCE_ERROR` if `verification.verified` is false.

| Risk Level | Decision | Required Approvals |
|---|---|---|
| `LOW` | `APPROVE` | 0 |
| `MEDIUM` | `REQUIRE_HUMAN_APPROVAL` | 1 |
| `HIGH` | `REQUIRE_HUMAN_APPROVAL` | 1 |

Risk score formula: `min(10, blastRadiusBase + floor(argCount / 2))`

If risk_score >= 8 on HIGH risk: blocking condition "High blast radius — review carefully" is added.

---

## Approval Validation (A4)

`validateApproval()` enforces four conditions:

1. `approval.intent_hash` must match `governance.intent_hash`
2. `approval.decision_id` must match `governance.decision_id`
3. `approval.approval_status` must be `"APPROVED"`
4. `approval.approval_artifact` must be >= 10 characters

Failure of any condition invalidates the approval.

---

## Expression Isolation (§2.E)

ExpressionOutput is the output of the expression layer (AI chat). It is **non-authoritative**.

**Invariants:**

- ExpressionOutput CANNOT be passed to `rio_process_intent()` or `rio_approve_intent()`.
- `isExpressionOutput()` type guard checks `__expression_output === true`.
- `kernelExecutor.ts` rejects ExpressionOutput at entry (Step 0).
- Conversion to IntentEnvelope requires explicit human approval via `expression_to_intent()`.
- `expression_to_intent()` requires `approvedByHuman === true` at runtime.
- All conversions MUST be logged to the ledger.
- Expression data is NEVER canonical state.

The `__expression_output: true` discriminator prevents structural compatibility with IntentEnvelope.

---

## Learning Loop (A8)

The learning loop is **advisory only**. It never mutates live policy.

- `LearningAnalysis.mutates_live_policy` is ALWAYS `false`.
- `PolicyRecommendation.status` is ALWAYS `"PENDING_REVIEW"`.
- Learning is advisory until explicitly promoted by a human.

---

## Constants

| Constant | Value | Source |
|---|---|---|
| `INTENT_TTL_MS` | 300,000 (5 minutes) | controlPlane.ts |
| `NONCE_TTL_MS` | 600,000 (10 minutes) | controlPlane.ts |
| Required envelope fields | 10 fields | controlPlane.ts |
| Valid source_type values | HUMAN, AI_AGENT, SYSTEM, API | controlPlane.ts |

---

## Failure Conditions

| Condition | Result |
|---|---|
| Any of 6 verification checks fail | verified=false. Governance cannot run. Intent rejected. |
| Governance decision is DENY | Intent rejected. No execution. |
| REQUIRE_HUMAN_APPROVAL, no approval | "Silence equals refusal." Intent rejected. |
| approval.intent_hash mismatch | Approval invalid. |
| ExpressionOutput enters kernel | EXPRESSION_ISOLATION_VIOLATION error. |
| expression_to_intent() with approvedByHuman=false | EXPRESSION_ISOLATION_VIOLATION error. |
| Nonce replay | replay_check=false. Verification fails. |
