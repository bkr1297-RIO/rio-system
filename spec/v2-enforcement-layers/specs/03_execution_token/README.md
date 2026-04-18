> Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

# 03 — Execution Token

**Source files:** `controlPlane.ts` (A5: ExecutionToken, issueExecutionToken, executeGatePreflight), `kernelExecutor.ts` (kernelExecute, enforceToolSandbox, consumeNonce, KERNEL_TOKEN_TTL_MS), `authorityLayer.ts` (AuthorizationToken, validateAuthorizationToken)

---

## Purpose

The execution token is the single-use, time-bound, hash-bound credential that authorizes a specific action. No connector call can proceed without a valid token that passes all preflight gate checks. The token binds the approved intent to the exact parameters, policy version, and target — any modification after approval causes the gate to reject.

---

## Schemas

All schemas are defined in [`schema.json`](./schema.json). The canonical types are:

| Schema | Source | Description |
|---|---|---|
| `ExecutionToken` | controlPlane.ts A5 | Single-use token. Binds to intent hash, action hash, policy, TTL, nonce, target. |
| `AuthorizationToken` | authorityLayer.ts | Authority-layer token. Binds to policy hash, execution count limits. |
| `GateCheck` | controlPlane.ts | Individual preflight check result (6 checks). |
| `AuthorityGateCheck` | authorityLayer.ts | Authority-layer gate check result (7 checks). |
| `GatePreflightResult` | controlPlane.ts | Aggregate of all 6 gate checks. |
| `ToolSandboxCheck` | kernelExecutor.ts | Tool sandbox validation result. |
| `KernelExecutionResult` | kernelExecutor.ts | Complete result of a kernel execution attempt. |

---

## Kernel Execution Order

`kernelExecute()` is the ONLY function that may produce side effects. All production execution paths MUST call this function. Strict order:

| Step | Stage | What happens | Failure mode |
|---|---|---|---|
| 0 | Expression isolation guard | `isExpressionOutput(envelope)` → reject | EXPRESSION_ISOLATION_VIOLATION |
| 1 | Verify envelope | `verifyIntentEnvelope()` | Verification failed |
| 2 | Governance decision | `evaluateGovernance()` | DENY |
| 3 | Human authorization check | Validate approval if REQUIRE_HUMAN_APPROVAL | Silence equals refusal |
| 4 | Tool sandbox enforcement | `enforceToolSandbox()` | Sandbox violation |
| 5 | WAL PREPARED | `walPrepare()` — must succeed before execution | WAL write failure |
| 6 | Issue execution token | `issueExecutionToken()` — TTL = 5,000ms | — |
| 7 | Execute via token-verified boundary | `executeGatePreflight()` + `consumeNonce()` + connector call | Gate failure / nonce replay |
| 8 | WAL COMMITTED or FAILED | `walCommit()` or `walFail()` | WAL write failure |
| 9 | Return receipt | `generateWitnessReceipt()` + `buildFormalLedgerEntry()` | — |

---

## Preflight Gate Checks (6 checks)

`executeGatePreflight()` runs 6 checks. `passed` = ALL must pass.

| # | Check | What it validates |
|---|---|---|
| 1 | `token_valid` | Token exists in store AND not already used. |
| 2 | `token_not_expired` | `now < token.expires_at` |
| 3 | `intent_hash_match` | `token.intent_hash === governance.intent_hash` |
| 4 | `action_hash_match` | `token.action_hash === SHA-256(canonical_json({action_type, target, parameters}))` |
| 5 | `policy_version_match` | `token.policy_version === governance.policy_version` |
| 6 | `target_match` | `token.target === envelope.target` |

---

## Authority-Layer Gate Checks (7 checks)

`validateAuthorizationToken()` runs 7 checks for the authority-layer token:

| # | Check | What it validates |
|---|---|---|
| 1 | `token_exists` | Token exists in store. |
| 2 | `token_signature_valid` | Signature is valid. |
| 3 | `token_not_expired` | Token has not expired. |
| 4 | `execution_count_valid` | `execution_count < max_executions` |
| 5 | `parameters_hash_match` | Parameters hash matches token. |
| 6 | `kill_switch_off` | System kill switch is not active. |
| 7 | `policy_hash_match` | `token.policy_hash === active_policy.policy_hash` |

---

## Token Properties

| Property | Value | Source |
|---|---|---|
| TTL | 5,000ms (5 seconds) | kernelExecutor.ts `KERNEL_TOKEN_TTL_MS` |
| Single-use | `storedToken.used = true` after gate passes | controlPlane.ts |
| Nonce | UUID. Consumed via DB-backed atomic operation. | kernelExecutor.ts |
| Action hash binding | `SHA-256(canonical_json({action_type, target, parameters}))` | controlPlane.ts |
| Intent hash binding | `SHA-256(canonical_json(envelope))` | controlPlane.ts |

---

## Tool Sandbox

`enforceToolSandbox()` runs before every connector execution.

**TOOL_DENYLIST blocks:**
- `/runtime/*`
- `/config/*`
- `/keys/*`
- `localhost`
- Recursive RIO calls

**TOOL_ALLOWLIST:** Per-tool URL restrictions.

---

## Stage Progression

`KernelExecutionResult.stage_reached` reports the last stage reached:

```
VERIFICATION → GOVERNANCE → HUMAN_AUTHORIZATION → SANDBOX → WAL_PREPARED → EXECUTION_TOKEN → EXECUTION_GATE → EXECUTION → WAL_COMMITTED → COMPLETE
```

Failure is reported at the stage that failed. `COMPLETE` means the full pipeline succeeded.

---

## Constants

| Constant | Value | Source |
|---|---|---|
| `KERNEL_TOKEN_TTL_MS` | 5,000 (5 seconds) | kernelExecutor.ts |
| `KERNEL_VERSION` | `"K2.0.0"` | kernelExecutor.ts |
| Preflight checks | 6 | controlPlane.ts |
| Authority gate checks | 7 | authorityLayer.ts |

---

## Failure Conditions

| Condition | Stage | Result |
|---|---|---|
| ExpressionOutput at kernel entry | VERIFICATION | EXPRESSION_ISOLATION_VIOLATION |
| Verification fails | VERIFICATION | Intent rejected |
| Governance DENY | GOVERNANCE | Intent rejected |
| Missing approval | HUMAN_AUTHORIZATION | Silence equals refusal |
| Sandbox violation | SANDBOX | Execution blocked |
| WAL PREPARED fails | WAL_PREPARED | Execution blocked |
| Token expired | EXECUTION_GATE | token_not_expired FAIL |
| Token already used | EXECUTION_GATE | token_valid FAIL |
| Intent hash mismatch | EXECUTION_GATE | intent_hash_match FAIL |
| Action hash mismatch | EXECUTION_GATE | action_hash_match FAIL |
| Policy version changed | EXECUTION_GATE | policy_version_match FAIL |
| Nonce replay | EXECUTION_GATE | NONCE_REPLAY |
| Connector failure | EXECUTION | Connector returned success:false |
| WAL COMMITTED fails | WAL_COMMITTED | Caller MUST NOT return success |
