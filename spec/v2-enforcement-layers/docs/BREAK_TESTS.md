# Break Tests

**Extracted from:** `RED-TEAM-REPORT.md`, `redteam.break.test.ts`, `kernelV2.acceptance.test.ts`, `gateway-identity-eval.test.ts`, `authorityLayer.test.ts`

**Audit date:** April 16, 2026
**Verdict:** NO BYPASS FOUND — 140 tests, 140 passed.

---

## Core Invariant Under Test

> No change to the world or system state can occur unless it passes through the RIO pipeline and is recorded in the ledger.

---

## Test Results Summary

| Test Suite | Tests | Result |
|---|---|---|
| Break Tests (7 attack vectors) | 34 | 34 passed |
| Execution Surface Scan | 20 | 20 passed |
| WAL Validation | 23 | 23 passed |
| Kernel v2 Acceptance Tests | 63 | 63 passed |
| **Total** | **140** | **140 passed** |

---

## Attack 1: Skip Approval — Execute Without Approval

Six sub-tests attempted to bypass the approval requirement.

| Test | Attack | Result | Enforcement |
|---|---|---|---|
| 1a | Call dispatchExecution with HIGH risk, no approval proof | BLOCKED | Risk check rejects |
| 1b | Call dispatchExecution with no proof at all | BLOCKED | Missing proof rejected |
| 1c | Call dispatchExecution with LOW risk + fake proof | BLOCKED | Connector gate rejects |
| 1d | kernelExecutor requires valid approval record | BLOCKED | Approval validation enforced |
| 1e | All execution paths require IntentEnvelope | BLOCKED | No direct calls exist |
| 1f | Pass ExpressionOutput to kernelExecutor | BLOCKED | `isExpressionOutput` type guard rejects at boundary |

**Invariant:** Cannot execute without valid approval. `FAIL_CLOSED` when approval proof is missing for medium/high risk.

---

## Attack 2: Reuse Approval — Double-Spend

Three sub-tests attempted to reuse a consumed approval.

| Test | Attack | Result | Enforcement |
|---|---|---|---|
| 2a | CAS uses atomic `UPDATE WHERE status='PENDING'` | BLOCKED | `rowsAffected === 0` on second attempt → `CAS_FAILED` |
| 2b | Replay consumed nonce | BLOCKED | Nonce cache rejects |
| 2c | Reuse token within TTL window | BLOCKED | TTL = 5 seconds, single-use nonce |

**Invariant:** Approval is consumed exactly once. CAS success only on `rowsAffected === 1`. Zero rows = `CAS_FAILED`.

---

## Attack 3: Concurrency — Race Condition on Same Approval

Three sub-tests attempted concurrent consumption.

| Test | Attack | Result | Enforcement |
|---|---|---|---|
| 3a | Two concurrent CAS attempts on same approval | BLOCKED | DB-level atomic UPDATE, only one succeeds |
| 3b | Check rowsAffected logic | BLOCKED | Explicit `=== 1` check, 0 = failure |
| 3c | Concurrent nonce replay | BLOCKED | Nonce added to cache before execution |

**Invariant:** Only one of two concurrent attempts can succeed. CAS is atomic.

---

## Attack 4: Replay Attack — Reuse Token or Request

Five sub-tests attempted replay.

| Test | Attack | Result | Enforcement |
|---|---|---|---|
| 4a | Replay consumed nonce | BLOCKED | `NONCE_REPLAY` rejection |
| 4b | Use expired token | BLOCKED | `token_not_expired` check in executeGatePreflight |
| 4c | Token TTL window | BLOCKED | TTL = 5,000ms (<= 5 seconds per spec) |
| 4d | Replay after restart | BLOCKED | Nonces rebuilt from ledger via `rebuildNonceCache` |
| 4e | Duplicate content hash | BLOCKED | Integrity substrate dedup check → `BLOCKED_DEDUP` |

**Invariant:** No replay possible. Nonces persist across restarts. Kernel token TTL <= 5,000ms.

---

## Attack 5: Payload Tampering — Change Payload After Approval

Five sub-tests attempted to modify the payload between approval and execution.

| Test | Attack | Result | Enforcement |
|---|---|---|---|
| 5a | Change args after approval | BLOCKED | dispatchExecution verifies args hash against approval proof → `ARGS_HASH_MISMATCH` |
| 5b | Approval binds to specific tool + args hash | BLOCKED | Hash mismatch = rejection |
| 5c | Forge envelope signature | BLOCKED | controlPlane verifies signatures |
| 5d | Skip envelope verification in executor | BLOCKED | kernelExecutor calls verifyIntentEnvelope |
| 5e | Modify intent hash | BLOCKED | `intent_hash_match` check in executeGatePreflight |

**Invariant:** Any modification after approval is detected and blocked.

---

## Attack 6: Shadow Path — Execute Outside Main Flow

Four sub-tests searched for alternate execution paths.

| Test | Attack | Result | Enforcement |
|---|---|---|---|
| 6a | Scan all .ts files for unexpected external fetch() calls | CLEAN | Only allowed files |
| 6b | Check if any file exports a direct execution function | CLEAN | `dispatchExecution` is the ONLY connector entry point |
| 6c | Check all callers of dispatchExecution | CLEAN | Only `routers.ts` and `oneClickApproval.ts` |
| 6d | Check all importers of sendViaGmail | CLEAN | Only `connectors.ts` and `emailApproval.ts` (both governed) |

**Invariant:** No shadow execution path exists. `_gatewayExecution` enforcement in connectors.

---

## Attack 7: Background/Worker Path — Execute via Jobs/Webhooks Without Envelope

Eight sub-tests checked background and webhook handlers.

| Test | Attack | Result | Enforcement |
|---|---|---|---|
| 7a | dailyLoop auto-executes | BLOCKED | Only generates proposals, never calls execute/dispatch |
| 7b | weeklyReview auto-executes | BLOCKED | Only generates reports, never calls execute/dispatch |
| 7c | Telegram webhook triggers execution | BLOCKED | Routes through governance pipeline (processIntent) |
| 7d | Slack callback triggers execution | BLOCKED | Only records approval decisions, no execution |
| 7e | Email approval handler bypasses WAL | BLOCKED | Has `walPrepare` + `walCommit` + `walFail` |
| 7f | oneClickApproval handler bypasses WAL | BLOCKED | Has `walPrepare` + `walCommit` + `walFail` |
| 7g | check-message API triggers execution | BLOCKED | Read-only endpoint |
| 7h | policy/evaluate API triggers execution | BLOCKED | Read-only endpoint |

**Invariant:** No background path can trigger execution without governance. WAL discipline enforced in all approval handlers.

---

## WAL Validation (23 tests)

WAL ordering verified across all 5 execution paths:

| Path | walPrepare before execution? | walCommit/walFail after? |
|---|---|---|
| `kernelExecute()` | Yes | Yes |
| `execute` mutation (routers.ts) | Yes | Yes |
| `approveAndExecute` mutation (routers.ts) | Yes | Yes |
| `handleLocalApproval` (emailApproval.ts) | Yes | Yes |
| `oneClickApproval` handler | Yes | Yes |

Failure boundary tests:

| Scenario | Expected | Verified |
|---|---|---|
| PREPARED fails to write | No execution occurs | Yes |
| Connector throws after PREPARED | walFail written, no success returned | Yes |
| Success but COMMITTED fails | No success returned to caller | Yes |
| Fail-closed default | System blocks on any ambiguity | Yes |

---

## Execution Surface Scan (20 tests)

Every side-effecting call cataloged and verified:

| Category | Governed? |
|---|---|
| Email send (sendViaGmail) | Yes — governed connector + governed approval path with WAL |
| SMS send (Twilio) | Yes — governed connector |
| Telegram send | Mixed — notifications ungoverned, execution governed |
| Slack send | Notification only |
| Notion write | Logging only |
| GitHub write (Mantis) | Logging only |
| DB writes | Governed — CAS + append-only ledger |
| Gateway proxy | Governed |

---

## Noted Risks (from audit)

These are not bypasses. They are architectural observations:

1. **Notification emails are ungoverned.** Approval request emails are not governed by the kernel. This is architecturally correct — governing the notification would create a circular dependency. Mitigation: `sendViaGmail` is only importable from 2 files, both governed.

2. **Pre-existing ledger hash mismatches.** Development-era entries have hash mismatches. Logged but do not halt. In production, any new mismatch = SYSTEM CORRUPTION.

3. **MVP firewall mode is permissive.** Only blocks the specific 3-condition AND rule. By design for current phase.
