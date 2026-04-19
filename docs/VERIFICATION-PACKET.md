# RIO Governance Boundary — Verification Packet

| Field | Value |
|-------|-------|
| **Date** | 2026-04-19 |
| **Commit** | `05b29a40` |
| **Checkpoint** | `05b29a40` (webdev) |
| **Spec Version** | Master Seed v1.1 |
| **Test Suite** | 79 tests, 11 files, 0 failures |
| **Scope** | Currently inventoried execution surfaces (8) |

---

## Execution Surface Inventory

The following 8 execution surfaces were identified by programmatic scan of the entire `server/` directory. An execution surface is defined as any code path capable of producing a side effect outside the process boundary (network call, file write, email send, API invocation).

| # | Surface | File | Mechanism | Gate |
|---|---------|------|-----------|------|
| 1 | `_sendViaGmail` | `server/one/gmailSmtp.ts` | nodemailer SMTP | Module-private. Not exported. Not reachable from any import. |
| 2 | `GmailTransportGate.send()` | `server/one/gmailSmtp.ts` | HMAC-signed TransportAccessToken | Single-use, 30s TTL, purpose-bound, HMAC-SHA256 with module-private Symbol key. |
| 3 | `FakeEmailAdapter.sendEmail()` | `server/adapters/FakeEmailAdapter.ts` | PhaseTracker + Gate preflight | Authorization token required. `perform()` closure-isolated. Credentials frozen, unexported. |
| 4 | `FakeFileAdapter.executeFileOp()` | `server/adapters/FakeFileAdapter.ts` | PhaseTracker + Gate preflight | Authorization token required. `perform()` closure-isolated. Credentials frozen, unexported. |
| 5 | `DriveAdapter.executeDriveOp()` | `server/adapters/DriveAdapter.ts` | PhaseTracker + Gate preflight | Authorization token required. `perform()` closure-isolated. `GOOGLE_DRIVE_TOKEN` frozen, unexported. |
| 6 | `dispatchExecution()` | `server/one/connectors.ts` | `_gatewayExecution` flag | Refuses execution unless request carries Gateway proof. `send_email` returns `REQUIRES_GATEWAY_GOVERNANCE`. |
| 7 | `invokeLLM()` | `server/_core/llm.ts` | Forge API call | Read-only. No side effects. Not an execution surface in the governance sense. Included for completeness. |
| 8 | External `fetch()` calls | Various | HTTP to external APIs | All routed through gated connectors. No ungated `fetch()` to side-effect-producing endpoints found. |

---

## Claims and Evidence

### CLAIM 1: No execution-capable credential exists outside adapter or sealed transport modules.

**Pass/fail criterion:** A programmatic grep of all `server/` files (excluding `node_modules/` and `*.test.ts`) for each credential pattern returns matches only in the declared allowed-location set.

**Evidence:** `credential-audit.test.ts` — 10 tests, 10 pass. Scanned patterns: SMTP transport creation, `GMAIL_APP_PASSWORD`, `FAKE_CREDENTIALS`, `FAKE_FILE_CREDENTIALS`, `GOOGLE_DRIVE_TOKEN`, OAuth tokens in connectors, direct external `fetch`/`axios`, service account keys, webhook secrets, background workers with credentials.

**Artifact:** `server/credential-audit.test.ts`

---

### CLAIM 2: The canonical adapter pattern (Gate → Pending → Execute → Verify → Receipt) generalizes across domains.

**Pass/fail criterion:** Three adapters in three different domains (email, file, Drive) each enforce the identical phase sequence via PhaseTracker, with `perform()` unreachable from outside the closure and credentials unexported.

**Evidence:** `FakeEmailAdapter.ts` (email), `FakeFileAdapter.ts` (file operations), `DriveAdapter.ts` (Google Drive). Each was independently red-teamed. Combined adversarial tests: 14 pass (4 + 4 + 6).

**Artifacts:** `server/adapters/FakeEmailAdapter.ts`, `server/adapters/FakeFileAdapter.ts`, `server/adapters/DriveAdapter.ts`, `server/adapter.test.ts`, `server/file-adapter.test.ts`, `server/drive-adapter-redteam.test.ts`

---

### CLAIM 3: 25 distinct red-team attack vectors are blocked by the governance boundary.

**Pass/fail criterion:** Each attack must attempt a specific invariant violation and be rejected by the system. No attack may succeed.

**Evidence:** 13 general red-team tests (`red-team.test.ts`) + 6 DriveAdapter red-team tests (`drive-adapter-redteam.test.ts`) + 4 adapter adversarial tests (`adapter.test.ts`) + 2 file adapter adversarial tests (attack-specific from `file-adapter.test.ts`) = 25 distinct attack vectors. All blocked.

| Attack Category | Tests | Vectors |
|----------------|-------|---------|
| No token / forged token / expired token | RT-1, RT-2, RT-3, RT-DRIVE-1 | 4 |
| Args mutation after approval | RT-4, RT-11, RT-DRIVE-3 | 3 |
| Self-approval | RT-5 | 1 |
| Replay / double execution | RT-6, RT-DRIVE-2 | 2 |
| Cross-user theft | RT-7, RT-13 | 2 |
| Skip approval | RT-8, RT-9 | 2 |
| Expired approval | RT-10 | 1 |
| Fabricated intent | RT-12 | 1 |
| Direct connector bypass | RT-DRIVE-4, adapter TEST-3, file-adapter TEST-3 | 3 |
| Ledger bypass | RT-DRIVE-5 | 1 |
| Lineage break | RT-DRIVE-6 | 1 |
| Null/undefined token injection | adapter TEST-2, file-adapter TEST-2 | 2 |
| Codebase scan (no raw patterns outside) | adapter TEST-4, file-adapter TEST-4 | 2 |

**Artifacts:** `server/red-team.test.ts`, `server/drive-adapter-redteam.test.ts`, `server/adapter.test.ts`, `server/file-adapter.test.ts`

---

### CLAIM 4: Raw Gmail transport (`sendViaGmail`) is unreachable from outside its module.

**Pass/fail criterion:** (a) `sendViaGmail` does not appear in the module's export list. (b) No file in the codebase imports `sendViaGmail`. (c) `nodemailer.createTransport` exists only in `gmailSmtp.ts`. (d) HMAC-tampered, expired, and replayed transport tokens are all rejected.

**Evidence:** `redteam-transport-bypass.test.ts` — 8 tests, 8 pass. RT-BYPASS-1 through RT-BYPASS-8 cover: import impossibility, invalid token rejection, single-use enforcement, expiry enforcement, HMAC tamper detection, module-private function unreachability, codebase-wide import scan, codebase-wide transport creation scan.

**Artifact:** `server/redteam-transport-bypass.test.ts`

---

### CLAIM 5: All 8 inventoried execution surfaces are gated. Zero ungated paths exist.

**Pass/fail criterion:** A programmatic inventory of every execution surface in `server/` must (a) produce exactly 8 surfaces, (b) classify each as gated, and (c) find zero ungated surfaces.

**Evidence:** `reachability-audit.test.ts` — 8 tests, 8 pass. AUDIT-1 through AUDIT-8 cover: `sendViaGmail` not exported, `GmailTransportGate` requires HMAC tokens, all 3 adapters require authorization tokens, `dispatchExecution` requires `_gatewayExecution` flag, adapter modules export only public API, no external imports of `sendViaGmail`, all connector dispatch paths go through `dispatchExecution`, total surface count = 8 and all gated.

**Artifact:** `server/reachability-audit.test.ts`

---

### CLAIM 6: The `send_email` connector refuses direct execution without Gateway governance proof.

**Pass/fail criterion:** A fully valid intent (created, approved, token minted, all 8 preflight checks passing) must still be refused by the connector when the `_gatewayExecution` flag is absent. The refusal must be recorded in the ledger.

**Evidence:** `real-email-execution.test.ts` — 1 test, 1 pass. The test creates a real `send_email` intent, approves it, mints a token, passes all preflight checks, and then observes the connector return `REQUIRES_GATEWAY_GOVERNANCE`. Six ledger entries are written. Receipt artifact stored to disk.

**Artifacts:** `server/real-email-execution.test.ts`, `artifacts/real/receipt-*.json`, `artifacts/real/summary-*.txt`

---

### CLAIM 7: Predicate evaluations are logged and proof packets are retrievable for any governed action.

**Pass/fail criterion:** (a) Every execution (blocked or successful) produces a predicate evaluation record. (b) A proof packet can be assembled for any intentId and contains: intent, approval, execution, predicates, ledger entries, and hash chain verification.

**Evidence:** `predicate-compliance.test.ts` — 6 tests, 6 pass. Tests cover: valid action produces predicate log, invalid action produces predicate log with failures, proof packet is self-contained and verifiable, proof packet includes all required fields.

**Artifact:** `server/predicate-compliance.test.ts`

---

## Complete Test File Manifest

| File | Tests | Purpose |
|------|-------|---------|
| `build-mode-tests.test.ts` | 3 | Core invariant: unauthorized blocked, exact-match enforced, receipt retrievable |
| `predicate-compliance.test.ts` | 6 | Predicate logging + proof packet assembly |
| `red-team.test.ts` | 13 | 13 adversarial invariant violation attempts |
| `adapter.test.ts` | 4 | FakeEmailAdapter adversarial |
| `file-adapter.test.ts` | 4 | FakeFileAdapter adversarial |
| `canonical-promotion.test.ts` | 16 | Module reachability, credential boundary, gate enforcement |
| `redteam-transport-bypass.test.ts` | 8 | Transport seal: HMAC, replay, expiry, codebase scan |
| `credential-audit.test.ts` | 10 | Global credential containment |
| `drive-adapter-redteam.test.ts` | 6 | DriveAdapter red-team (6 attack vectors) |
| `reachability-audit.test.ts` | 8 | Import/reachability audit (8 surfaces, all gated) |
| `real-email-execution.test.ts` | 1 | Real governed email: connector refuses without Gateway |
| **Total** | **79** | **Zero failures** |

---

## Artifact Locations

| Artifact | Path |
|----------|------|
| Canonical adapter pattern documentation | `docs/CANONICAL_ADAPTER_PATTERN.md` |
| 5-step hardening report | `docs/5-STEP-HARDENING-REPORT.md` |
| This verification packet | `docs/VERIFICATION-PACKET.md` |
| Real execution receipts | `artifacts/real/receipt-*.json` |
| Real execution summaries | `artifacts/real/summary-*.txt` |
| FakeEmailAdapter (reference implementation) | `server/adapters/FakeEmailAdapter.ts` |
| FakeFileAdapter | `server/adapters/FakeFileAdapter.ts` |
| DriveAdapter | `server/adapters/DriveAdapter.ts` |
| Sealed transport module | `server/one/gmailSmtp.ts` |
| Gate enforcement | `server/rio/gate.ts` |

---

## What We Are Entitled to Claim

> **Entitled claim:** For the 8 currently inventoried execution surfaces in this codebase, at commit `05b29a40`, no code path exists that can produce an external side effect without passing through the Gate → Adapter → Receipt governance boundary. This is demonstrated by programmatic credential containment audit, exhaustive import/reachability analysis, 25 distinct red-team attacks (all blocked), and a real governed email execution where the connector itself refused to act without Gateway proof. The boundary is enforced by construction (closure isolation, module privacy, HMAC-signed tokens, PhaseTracker sequencing), not by convention.

> **Not yet entitled to claim:** (1) That the inventory is complete. Any future execution surface added to the codebase is ungoverned until explicitly gated and added to the inventory. The audit covers what exists today, not what may be added tomorrow. (2) That the Gateway HTTP roundtrip itself is verified end-to-end in production. Step 5 proves the connector refuses without Gateway proof, but the Gateway service (`ENV.gatewayUrl`) was not exercised as a live service in this test suite. (3) That the system is secure against all possible attack vectors. The 25 red-team tests cover the inventoried attack surface; they do not constitute a formal security audit by an independent third party. (4) That runtime integrity is maintained. These tests verify static code properties and runtime behavior at test time. They do not prove that the deployed binary matches this commit, or that the runtime environment has not been tampered with.
