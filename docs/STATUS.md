# Status

Current state of the RIO system. Updated by agents as work progresses.

Last updated: 2026-04-04 by Manny (Builder)

---

## Latest Delivery — First Platform Slice (Priorities 1-4)

**Date:** 2026-04-04
**Agent:** Manny (Builder)
**Directive:** `directives/DIRECTIVE_FIRST_PLATFORM_SLICE.md`
**Prerequisites:** Area 1 (VERIFIED PASS), Area 2 (VERIFIED PASS)

### What Was Requested (4 Priorities)

1. Add a separate `approvals` table with `approver_id`, `decision`, `signature`
2. Wire real Google OAuth into the Gateway so two humans can log in
3. Rewire ONE to call the Gateway API — no enforcement in ONE
4. ONE needs 3 screens: Login, Create Intent, Approvals. That's it.

### What Shipped

**Priority 1: Approvals Table (Gateway)**

| File | What It Does |
|---|---|
| `gateway/ledger/ledger-pg.mjs` | New `approvals` table in autoMigrate: `approval_id`, `intent_id`, `approver_id`, `decision`, `reason`, `signature`, `signature_payload_hash`, `ed25519_signed`, `principal_id`, `principal_role`, `created_at`. Helper functions: `createApproval()`, `getApprovalsByIntent()`, `getApprovalByApprover()`, `getPendingApprovals()`. |
| `gateway/ledger/init.sql` | Approvals table DDL for Docker/fresh deployments |
| `gateway/routes/index.mjs` | `POST /approvals/:intent_id` — records approval/denial, enforces proposer ≠ approver, writes to approvals table + ledger. `GET /approvals/:intent_id` — lists all approvals for an intent. |

**Priority 2: Google OAuth (Gateway)**

| File | What It Does |
|---|---|
| `gateway/security/google-oauth.mjs` | Full Google OAuth flow: `GET /auth/google` → redirect to consent, `GET /auth/google/callback` → exchange code → resolve email → principal → JWT → redirect to ONE, `GET /auth/status` → check config. CSRF state tokens with 10-min TTL. Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `ONE_FRONTEND_URL`. |
| `gateway/security/oauth.mjs` | `createToken()` Mode 2: direct claims from Google OAuth (principal_id, role, auth_method). JWT now includes `auth_method` field. |
| `gateway/security/principals.mjs` | `resolvePrincipalByEmail()` — bridges Google OAuth email → principal. Checks direct email, metadata.emails, known aliases. |
| `gateway/server.mjs` | Google OAuth routes wired. Startup logs OAuth config status. Passphrase login preserved as fallback. |

**Priority 3: Rewire ONE → Gateway API**

| File | What It Does |
|---|---|
| `client/src/lib/gateway.ts` (ONE PWA) | Gateway API client — typed fetch wrappers for all Gateway endpoints. Token storage in localStorage. Replay prevention (request_timestamp, request_nonce) on all POST requests. |
| `client/src/hooks/useGatewayAuth.ts` (ONE PWA) | Gateway auth context/hook — manages JWT token, whoami, login/logout state. |

**Priority 4: ONE = 3 Screens Only**

| File | What It Does |
|---|---|
| `client/src/App.tsx` (ONE PWA) | Stripped to 3 routes: `/` (Login), `/intent/new` (Create Intent), `/approvals` (Approvals). No enforcement logic. No old pages. |
| `client/src/pages/Login.tsx` (ONE PWA) | Gateway status check, passphrase login, Google OAuth button (when configured), token handling from OAuth callback redirect. |
| `client/src/pages/NewIntent.tsx` (ONE PWA) | Form → `POST /intent` → `POST /govern` → displays governance result (decision, risk tier, TTL). All 4 decision types rendered. |
| `client/src/pages/GatewayApprovals.tsx` (ONE PWA) | Polls Gateway for pending approvals. Approve/Deny with reason. Handles proposer ≠ approver error. 30-second auto-refresh. |

### Alignment with Locked Decisions

- **Decision 1 (Enforcement Boundary):** All enforcement in `gateway/`. ONE is a thin client.
- **Decision 2 (Interface Is Not Authority):** ONE calls Gateway API. No enforcement in ONE. Footer on every screen: "Decision 2: Interface Is Not Authority."
- **Decision 3 (Ledger Is System of Record):** Every approval writes a ledger entry. Policy evaluation produces governance hash.

### Test Results

**Gateway Tests (27 pass, 0 fail):**
- Unit (13): Google OAuth handlers, principal email resolution, createToken Mode 2, approvals table helpers
- Integration (14): Full governed flow (submit → govern → approve → execute → receipt), proposer ≠ approver enforcement, denial flow, unauthenticated blocked

**ONE PWA Tests (18 pass, 0 fail):**
- App routing: exactly 3 screens, no old enforcement pages, no tRPC proxy calls
- Gateway client: all required exports, VITE_GATEWAY_URL, replay prevention, Authorization header
- Login page: uses Gateway API (not tRPC), Google OAuth support, Decision 2 footer
- Create Intent page: calls Gateway directly, displays all 4 governance decisions
- Approvals page: calls Gateway directly, handles proposer ≠ approver, polls for pending

**Full project test suite: 339 tests, 0 failures across 23 files.**

### What's Needed Before Two-User Test

1. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Gateway environment
2. Set `GOOGLE_REDIRECT_URI` to `https://<gateway-domain>/auth/google/callback`
3. Set `ONE_FRONTEND_URL` to the ONE PWA URL
4. Set `VITE_GATEWAY_URL` in ONE PWA environment to the Gateway URL
5. Register Brian's second email in a principal (or add a second human principal)

---

## Previous Delivery — Area 2: Policy Evaluation Engine (VERIFIED PASS)

**Date:** 2026-04-04
**Agent:** Manny (Builder)
**Delivery:** Machine-readable policy evaluation engine, implemented in the Gateway (`rio-system/gateway/`)
**Prerequisite:** Area 1 (Role Enforcement) — VERIFIED PASS

### Alignment with Locked Decisions

- **Decision 1 (Enforcement Boundary):** All policy evaluation code in `gateway/`
- **Decision 2 (Interface Is Not Authority):** Policy engine runs server-side only; no policy logic in ONE PWA
- **Decision 3 (Ledger Is System of Record):** Policy versions stored in PostgreSQL with hash chain; every policy change produces a ledger entry

### What Shipped

| File | What It Does |
|---|---|
| `gateway/governance/policy-engine.mjs` | Pure evaluation function per Andrew's Policy Schema Spec Section 10. Action pattern matching, risk tier classification, invariant violation detection, confidence override, system mode enforcement, approval requirements, TTL computation, governance hash generation. |
| `gateway/governance/policy-store.mjs` | PostgreSQL-backed policy storage with hash chain versioning. `policies` table, `initPolicyStore()`, `loadGenesisPolicy()`, `getActivePolicy()`, `activatePolicy()`, `deactivatePolicy()`. |
| `gateway/config/rio/policy-v2.json` | Genesis policy document v2.0.0 with 14 action classes, 5 risk tiers, 4 governance decisions, 4 system modes, 6 scoped agents, 7 scoped systems, and 7 invariant violations. |
| `gateway/server.mjs` | Wired `initPolicyStore()` into startup sequence |
| `gateway/routes/index.mjs` | `/govern` route now uses v2 policy engine instead of hardcoded `evaluateIntent()`. Policy-based TTL expiration check on `/execute`. Health endpoint shows policy v2 info. |
| `gateway/routes/api-v1.mjs` | API v1 `/govern` route uses v2 policy engine |
| `gateway/tests/policy-engine.test.mjs` | 57 tests across 13 suites |

### Policy Engine Architecture

**Evaluation Algorithm (per Andrew's Spec Section 10):**

1. Verify policy is active
2. Verify agent is in scope (`scope.agents`)
3. Verify target system is in scope (`scope.systems`)
4. Check invariant violations (7 hard-coded blocks)
5. Match action against action classes (first-match-wins with pattern support)
6. Apply confidence override (< 80 upgrades AUTO_APPROVE → REQUIRE_HUMAN)
7. Apply system mode override (ELEVATED, LOCKDOWN, MAINTENANCE)
8. Compute approval requirements and TTL
9. Generate governance hash (SHA-256)
10. Return structured result with full audit trail

**Action Classes (14 in genesis policy):**

| Class ID | Pattern | Risk | Decision |
|---|---|---|---|
| `read_operations` | `read_*\|list_*\|get_*\|search_*\|view_*` | NONE | AUTO_APPROVE |
| `draft_operations` | `draft_*\|compose_*\|edit_draft_*` | LOW | AUTO_APPROVE |
| `design_operations` | `design_*\|create_mockup_*\|create_wireframe_*` | LOW | AUTO_APPROVE |
| `send_known_contact` | `send_email\|send_message` (with conditions) | MEDIUM | REQUIRE_HUMAN |
| `send_new_contact` | `send_email\|send_message` (with conditions) | MEDIUM | REQUIRE_HUMAN |
| `send_generic` | `send_*` | MEDIUM | REQUIRE_HUMAN |
| `calendar_operations` | `create_event_*\|update_event_*\|delete_event_*` | MEDIUM | REQUIRE_HUMAN |
| `file_operations` | `create_file_*\|update_file_*\|move_*\|rename_*` | MEDIUM | REQUIRE_HUMAN |
| `deploy_operations` | `deploy_*\|publish_*\|enable_live_*` | HIGH | REQUIRE_HUMAN |
| `financial_operations` | `transfer_*\|payment_*\|invoice_*` | HIGH | REQUIRE_HUMAN |
| `destructive_operations` | `delete_*\|purge_*\|revoke_*\|disable_*` | CRITICAL | REQUIRE_HUMAN |
| `policy_changes` | `change_policy\|update_policy\|modify_governance` | CRITICAL | REQUIRE_QUORUM |
| `system_admin` | `restart_*\|shutdown_*\|reset_*\|migrate_*` | CRITICAL | REQUIRE_HUMAN |
| `invariant_violations` | `self_authorize\|bypass_governance\|...` | CRITICAL | AUTO_DENY |

**Risk Tiers and TTLs:**

| Risk Tier | Approval TTL | Meaning |
|---|---|---|
| NONE | No TTL | Read-only, auto-approved |
| LOW | No TTL | Safe write, auto-approved |
| MEDIUM | 3600s (1 hour) | Requires human review |
| HIGH | 1800s (30 min) | Requires human review, shorter window |
| CRITICAL | 900s (15 min) | Requires human review or quorum, tightest window |

**System Modes:**

| Mode | Effect |
|---|---|
| NORMAL | Standard evaluation |
| ELEVATED | AUTO_APPROVE → REQUIRE_HUMAN |
| LOCKDOWN | Only root_authority can approve |
| MAINTENANCE | All execution paused |

**Invariant Violations (7 hard blocks):**

`self_authorize`, `bypass_governance`, `execute_without_approval`, `modify_own_permissions`, `delete_ledger`, `forge_receipt`, `impersonate_principal`

### Test Results

57 tests, 0 failures across 13 suites:

**Unit Tests (49):**
- Action Pattern Matching (6 tests)
- Condition Evaluation (5 tests)
- Risk Classification and Action Classes (7 tests)
- Invariant Violation Detection (3 tests)
- Fail-Closed Defaults (4 tests)
- Confidence Override (2 tests)
- System Mode Override (5 tests)
- Approval Requirements (4 tests)
- Approval TTL by Risk Tier (4 tests)
- Approval Expiration Helper (3 tests)
- Governance Hash (2 tests)
- Policy Version and Hash Tracking (2 tests)
- Action Class Priority / First Match Wins (2 tests)

**Integration Tests (8):**
- Health endpoint shows policy v2 info
- `read_email` → AUTO_APPROVE (NONE risk)
- `deploy_production` → REQUIRE_HUMAN (HIGH risk)
- `self_authorize` → AUTO_DENY (invariant violation)
- Unknown action → REQUIRE_HUMAN + HIGH (fail-closed)
- `change_policy` → REQUIRE_QUORUM (2-of-3 meta-governance)
- Low confidence read → upgraded to REQUIRE_HUMAN
- Governance hash is a 64-char hex string (SHA-256)
- Unknown agent → AUTO_DENY (agent not in scope)

### Verification Checklist

- [x] Policy engine is a pure function — no side effects, deterministic output
- [x] Fail-closed: unknown actions → REQUIRE_HUMAN + HIGH
- [x] Fail-closed: unknown agents → AUTO_DENY
- [x] Fail-closed: no policy → gateway refuses to govern
- [x] Invariant violations → AUTO_DENY (cannot be overridden)
- [x] Confidence override works (< 80 upgrades AUTO_APPROVE)
- [x] System modes work (ELEVATED, LOCKDOWN, MAINTENANCE)
- [x] Policy versioning with hash chain in PostgreSQL
- [x] Genesis policy loaded on first boot
- [x] Governance hash computed per Andrew's spec
- [x] All 57 tests pass
- [x] All code in `gateway/` per Decision 1

---

## Previous Delivery — Area 1: Role Enforcement (VERIFIED PASS)

**Date:** 2026-04-04
**Agent:** Manny (Builder)
**Delivery:** Unified principal model with role enforcement, implemented in the Gateway (`rio-system/gateway/`)

**Previous submission failed verification** (commit `304f0fd`) — code was in the ONE PWA, not the Gateway.
This resubmission places all enforcement in the Gateway per the three locked decisions:
- **Decision 1 (Enforcement Boundary):** All enforcement in `gateway/`
- **Decision 2 (Interface Is Not Authority):** ONE PWA is an untrusted client
- **Decision 3 (Ledger Is System of Record):** Principal changes produce ledger entries

### What Shipped

| File | What It Does |
|---|---|
| `gateway/security/principals.mjs` | Principal registry: `principals` + `key_history` tables, `resolvePrincipal()` middleware, `requireRole()` middleware, initial principal seeding (I-1, bondi, manny, gateway-exec, mantis, ledger-writer) |
| `gateway/server.mjs` | Wired `initPrincipals()` into startup, `resolvePrincipal` as global middleware |
| `gateway/routes/index.mjs` | Role gating on all pipeline routes: `/intent` (proposer), `/govern` (proposer/executor), `/authorize` (approver/root_authority), `/execute` (executor), `/receipt` (executor/auditor), `/ledger` (auditor), `/verify` (auditor). Principal attribution on all intents. |
| `gateway/routes/api-v1.mjs` | Role gating on API v1 routes: intent submission (proposer), authorization (approver), execution (executor), ledger/verify (auditor), key management (root_authority/meta_governor) |
| `gateway/routes/signers.mjs` | Role gating: list (any principal), register/revoke (root_authority/meta_governor) |
| `gateway/routes/proxy.mjs` | Kill switch gated by root_authority/meta_governor |
| `gateway/governance/intents.mjs` | Extended `createIntent()` to carry `principal_id` and `principal_role` attribution |
| `gateway/tests/principals.test.mjs` | 49 tests across 11 suites proving fail-closed behavior, role boundaries, principal attribution, and full pipeline with role enforcement |

### Role Enforcement Model

| Role | Can Do | Cannot Do |
|---|---|---|
| `proposer` (bondi, manny) | Submit intents, run governance | Authorize, execute, read ledger |
| `approver` (I-1 implicit) | Authorize/deny intents | Execute |
| `executor` (gateway-exec) | Execute authorized intents, confirm execution | Submit intents, authorize, read ledger |
| `auditor` (mantis, ledger-writer) | Read ledger, verify chain, generate receipts | Submit intents, authorize, execute |
| `root_authority` (I-1) | All governance roles implicitly. Manage signers, kill switch. | Execute (NOT implicit — separation of powers) |
| `meta_governor` (I-1 secondary) | Manage signers, manage API keys, kill switch | Execute |

### Enforcement Invariants (Proven by Tests)

1. **Fail-closed:** Unauthenticated requests → 403 on all role-gated routes (9 routes tested)
2. **Role boundaries:** Proposer cannot authorize/execute, executor cannot propose/authorize, auditor cannot propose/authorize/execute
3. **Principal attribution:** Every intent carries `principal_id` of the submitting principal
4. **root_authority implicit roles:** I-1 has implicit proposer, approver, auditor, meta_governor — but NOT executor
5. **Unknown principal → 403:** Unrecognized `X-Principal-ID` header blocked
6. **Full pipeline works:** Intent → Govern → Authorize → Execute → Confirm → Receipt → Verify all pass with correct role assignments

### Test Results

49 tests, 0 failures across 11 suites:
- Public Endpoints (2 tests)
- Fail-Closed: Unauthenticated Requests (9 tests)
- Root Authority: Brian (I-1) Full Access (6 tests)
- Role Boundaries: Proposer/bondi (4 tests)
- Role Boundaries: Executor/gateway-exec (3 tests)
- Role Boundaries: Auditor/mantis (5 tests)
- Signer Management Role Gating (3 tests)
- Kill Switch Role Gating (2 tests)
- Fail-Closed: Unknown Principal (1 test)
- Principal Attribution (2 tests)
- Full Pipeline with Role Enforcement (8 tests)

### Initial Principal Set (Seeded on First Boot)

| Principal ID | Actor Type | Primary Role | Secondary Roles |
|---|---|---|---|
| `I-1` | human | root_authority | approver, meta_governor |
| `bondi` | ai_agent | proposer | — |
| `manny` | ai_agent | proposer | — |
| `gateway-exec` | executor | executor | — |
| `mantis` | auditor | auditor | — |
| `ledger-writer` | service | auditor | — |

### Prohibited Role Combinations (Enforced)

- `proposer` + `executor` — would allow bypassing governance entirely
- `approver` + `executor` — would collapse the governance-execution boundary

---

## Previous Delivery — Area 1 (FAILED VERIFICATION)

**Date:** 2026-04-04
**Agent:** Manny (Builder)
**Delivery:** Role enforcement implemented in ONE PWA (wrong location)
**Checkpoint:** `7b0ab4d3`
**Verification Result:** FAILED — Code not in Gateway repo. See commit `3e2361d`.
**Corrective Action:** Resubmitted above with all code in `gateway/`.

---

## Previous Delivery — Receipt Protocol v2.3.0 Published

**Date:** 2026-04-04
**Agent:** Romney (Protocol / Packaging)
**Delivery:** Receipt spec v2.3.0 implemented, tested, merged, and published to npm and PyPI
**Branch:** `main` (PR #6 merged)
**Commit:** `34f30c0`

**What shipped:**

| Package | Version | Link |
|---|---|---|
| npm | `rio-receipt-protocol@2.3.0` | https://www.npmjs.com/package/rio-receipt-protocol/v/2.3.0 |
| PyPI | `rio-receipt-protocol 2.3.0` | https://pypi.org/project/rio-receipt-protocol/2.3.0/ |

**New fields in `identity_binding` (all optional, backward-compatible):**
- `role_exercised` (string) — The role the signer was acting under
- `actor_type` (string) — Whether the signer is "human", "ai_agent", or "service"
- `key_version` (integer) — Version number of the signing key for rotation tracking
- `delegation` (object) — Full delegation chain with delegation_id, delegate_id, scope, risk_ceiling, expiry

**Files changed:** 20 files across schema, spec, reference implementation, Python implementation, TypeScript declarations, tests, changelog, and version references.

**Test results:**
- Node.js: 44/44 pass (7 new identity enrichment tests)
- Python: 29/29 pass
- Examples: 8/8 pass

**Compatibility:** Fully backward-compatible. v2.2 receipts remain valid and verifiable. New fields do not affect `receipt_hash` computation.

**This completes the protocol-level work from the sign-off.** Manny can now build enforcement logic against the v2.3 receipt format with confidence that the published packages match the spec.

---

### Previous Delivery — Protocol Sign-Off: Phase 1 Foundational Specs

---

## Latest Delivery — Protocol Sign-Off: Phase 1 Foundational Specs

**Date:** 2026-04-04
**Agent:** Romney (Protocol / Packaging)
**Delivery:** Protocol compatibility sign-off for all three Phase 1 foundational specs, with responses to all 8 open questions from Andrew
**Branch:** `main`
**File:** `docs/reviews/PROTOCOL_SIGNOFF.md`

**Verdict:** APPROVED with conditions. All three specs are compatible with the receipt protocol. No breaking changes required.

**Key Decisions:**

1.  **Receipt version bump: v2.3 (minor, not major).** Three new optional fields (`role_exercised`, `actor_type`, `key_version`) are additive and backward-compatible.
2.  **`key_version` excluded from `authorization_hash`.** It is a lookup hint, not a proof element. Including it would create false distinctions after key rotation.
3.  **Delegation handled within existing `governed_action` type.** No new receipt type needed. `identity_binding.delegation` is an optional sub-object.
4.  **Ledger columns added directly** (not via separate view). `schema_version` field recommended for version-aware hash computation.
5.  **Receipt self-containment preserved.** CAS is a storage location, not a structural change to the receipt.
6.  **CAS keys should use algorithm prefix** (`sha256:...`). Receipt hash fields remain bare hex strings.
7.  **Ledger export format v2** with new fields. V1 exports remain available for backward compatibility.
8.  **CAS garbage collection acceptable** for abandoned intents (submitted, no evaluation, >90 days). Ledger entries and hashes are never deleted.

**All 8 open questions answered.** See `docs/reviews/PROTOCOL_SIGNOFF.md` for full reasoning.

**Next Steps:**
- Romney: Implement receipt spec v2.3 in public protocol repo (additive fields, schema update, reference implementation)
- Manny: Cleared to begin enforcement implementation using the three specs as contract
- Andrew: Minor spec updates recommended (version bump number, CAS key format, schema_version field)

**Platformization Tracker:** Phase 1 protocol reviews complete. Phase 2 (implementation) is unblocked.

---

## Latest Delivery — Gateway API Contract

**Date:** 2026-04-04
**Agent:** Damon (Developer Relations)
**Delivery:** Defined the developer contract for the Gateway API, standardizing it as the only enforcement and execution entry point.
**Branch:** `main`
**File:** `docs/GATEWAY_API_CONTRACT.md`

**Summary:**
- Standardized Gateway as the sole enforcement and execution entry point for ONE, CLI, Slack, and future SDKs.
- Defined required Gateway Endpoints: `POST /intents`, `POST /approvals/:intent_id`, `POST /execute/:intent_id`, `GET /receipts/:receipt_id`, `GET /ledger/:entry_id`.
- Specified request requirements: `principal_id`, `signature`, `key_version`, `intent_hash` (where applicable).

**Current Status:**
- Gateway API Contract defined and documented.
- Ready for use by ONE, CLI, Slack, and future SDKs.

---

## Latest Delivery — SDK Interface and Developer Flow

**Date:** 2026-04-04
**Agent:** Damon (Developer Relations)
**Delivery:** Drafted SDK Interface and Developer Flow documentation, aligned with new Identity, Policy, and Storage specifications.
**Branch:** `main`
**Files Delivered:**

| File | Purpose | Status |
|---|---|---|
| `docs/guides/EXTERNAL_INTEGRATION_PLAN.md` | Updated External System Integration Plan | Aligned with new specs |
| `docs/guides/SDK_INTERFACE_AND_DEVELOPER_FLOW.md` | Draft SDK Interface and Developer Flow | Drafted |

**Summary:**
- Updated `docs/guides/EXTERNAL_INTEGRATION_PLAN.md` to reflect the actual Gateway routes (`/api/v1/*`) and incorporate the new `principal_id`, `actor_type`, and `role_exercised` fields for identity binding and policy evaluation.
- Created `docs/guides/SDK_INTERFACE_AND_DEVELOPER_FLOW.md` outlining the conceptual SDK structure and step-by-step developer flow with code examples for Python and Node.js, fully aligned with the `IDENTITY_AND_ROLES_SPEC.md`, `POLICY_SCHEMA_SPEC.md`, and `STORAGE_ARCHITECTURE_SPEC.md`.

**Current Status:**
- Completed alignment of the External System Integration Plan and drafted the SDK Interface and Developer Flow documentation.
- Awaiting feedback on the drafted SDK Interface and Developer Flow, and further instructions.

---

## Previous Delivery — Phase 1 Foundational Specs (3 of 3)

**Date:** 2026-04-04
**Agent:** Andrew (Solutions Architect / Manus)
**Delivery:** Three foundational specifications required before Manny can begin enforcement implementation
**Branch:** `main`
**Tracker Reference:** `docs/PLATFORMIZATION_TRACKER.md` — Phase 1

**Files Delivered:**

| File | Purpose | Lines | Status |
|---|---|---|---|
| `spec/IDENTITY_AND_ROLES_SPEC.md` | Unified identity model: 6 actor types, 6 roles, Ed25519 key model, principal registry, delegation, role enforcement at API boundary | ~450 | Draft — Romney review needed |
| `spec/POLICY_SCHEMA_SPEC.md` | Machine-readable policy schema: risk tiers, action classes, approval requirements, quorum rules, delegation rules, system modes, policy versioning with hash chain | ~400 | Draft |
| `spec/STORAGE_ARCHITECTURE_SPEC.md` | CAS + Append-Only Ledger boundary: what goes where, artifact lifecycle, verification endpoints, deployment configurations | ~400 | Draft — Romney review needed |

**Key Design Decisions:**

1.  **Keys per principal, not per role.** A single principal has one active Ed25519 key pair. Simplifies key management. Key rotation is logged in the ledger.
2.  **Role separation enforced cryptographically.** An agent with role `proposer` cannot produce a valid approval even if it has a valid Ed25519 key — the Gateway checks both signature validity AND signer role.
3.  **Policy is versioned with a hash chain.** Every policy change produces a new document with `previous_policy_hash`, forming a tamper-evident chain of policy versions. Changes require Meta-Governance quorum.
4.  **CAS for content, Ledger for proof.** Full artifacts (intent body, execution result, receipt) go in Content-Addressable Storage (S3 or PostgreSQL fallback). Only hashes go in the ledger. This keeps the ledger small and permanent.
5.  **Fail-closed default.** If no action class matches an intent, the governance decision defaults to `REQUIRE_HUMAN`.

**Open Questions for Romney (8 total across 3 specs):**
- Receipt field additions (`role_exercised`, `actor_type`, `key_version`) — version bump needed?
- Key version in hash chain computation?
- Delegation representation in receipts?
- Ledger backward compatibility approach?
- Receipt self-containment with CAS separation?
- Hash algorithm future-proofing (prefix scheme)?
- Ledger export format update?
- CAS garbage collection for abandoned intents?

**Decisions Needed from Brian:** None. These are architectural specs within the Solutions Architect's territory. Romney review is the next gate.

**Next Step:** Romney reviews Identity and Storage specs for receipt/ledger compatibility. Once approved, Manny begins enforcement implementation (Phase 2 of Platformization Tracker).

---

### Previous Delivery — Enforcement Implementation Plans

**Date:** 2026-04-04
**Agent:** Manny (Builder)
**Delivery:** Implementation plans for all 5 enforcement areas. Plans only — no code until Andrew's specs land.
**Branch:** `main`
**File:** `docs/ENFORCEMENT_PLANS.md`

**Five enforcement areas planned:**
1.  Role Enforcement — unified principal model, 5 roles, middleware enforcement, identity binding (2-3 days)
2.  Policy Evaluation Engine — machine-readable policy schema, rule evaluator, quorum enforcement, versioning (3-5 days)
3.  CAS + Ledger Boundary — content-addressable storage, hash-only ledger, artifact envelopes (3-4 days)
4.  Active Audit — automatic post-execution audit pipeline, 5 compliance checks, anomaly detection (3-5 days)
5.  Meta-Governance Enforcement — control modes, quorum, governance change receipts, learning classification (5-7 days)

**Total estimated effort: 16-24 days** (sequential, after specs land).
**Dependency:** Awaiting Andrew's three specs (Identity, Policy Schema, Storage).
**Status:** Plans ready. Builder is ready to build as soon as specs land. **Andrew's specs have now landed — Manny is unblocked.**

---

### Previous Delivery — Protocol Alignment Reviews for Platformization

**Date:** 2026-04-04
**Agent:** Romney (Protocol / Packaging)
**Delivery:** Three protocol compatibility reviews for the Enforcement Implementation phase
**Branch:** `main`
**Files:**
- `docs/reviews/IDENTITY_COMPATIBILITY_REVIEW.md` — How identity decisions affect receipt verification. Analyzes role-based IDs, DID-style identifiers, embedded vs external roles, multi-signer scenarios. Verdict: protocol is compatible with all likely identity models; no changes needed unless multi-signer receipts are required (breaking change).
- `docs/reviews/STORAGE_COMPATIBILITY_REVIEW.md` — CAS vs Ledger boundary analysis. Confirms receipts hash artifacts (not store them), ledger stores references (not full receipts). Recommends adding `execution_hash` to ledger entries for completeness. Identifies canonical serialization as the critical contract for CAS.
- `docs/reviews/AUTOMATED_AUDIT_SPEC.md` — Defines 5 mandatory audit checks, 3 audit levels (receipt-only, receipt+ledger, full artifact), structured output format, and audit frequency. Maps existing verifier functions to audit checks and identifies gaps for Level 3 (artifact re-derivation).

**Key findings:**
- Protocol is identity-model-agnostic. No receipt changes needed for role-based or DID identifiers.
- Protocol is storage-model-agnostic. CAS integration is naturally compatible.
- One ledger change recommended: add `execution_hash` to ledger entry schema.
- One open question: will quorum approvals produce multi-signed receipts? If yes, `identity_binding` needs to become an array (major version bump).
- Policy version checking is blocked on Andrew's Policy Schema Spec. **Andrew's Policy Schema Spec has now landed.**

**Platformization Tracker updates:**
- Identity and Roles Spec → Protocol Review: **Ready** (review complete, awaiting Andrew's spec for final sign-off)
- Storage Architecture Spec → Protocol Review: **Ready** (review complete, awaiting Andrew's spec for final sign-off)

---

### Previous Delivery — Platformization Phase: Enforcement Tracker + Directive

**Date:** 2026-04-04
**Agent:** Chief of Staff
**Delivery:** Platformization Tracker, Directive, and Decision
**Branch:** `main`
**Source:** Brian (Root Authority)
**Files:**
- `docs/PLATFORMIZATION_TRACKER.md` — 5 enforcement areas with spec/implementation/verification checklist
- `docs/directives/2026-04-04_PLATFORMIZATION_DIRECTIVE.md` — Formal directive: enforcement implementation phase
- `docs/DECISIONS.md` — Platformization phase decision recorded

---

## Previous Delivery — Architecture Convergence: Technical Decisions

**Date:** 2026-04-04
**Agent:** Manny (Builder)
**Delivery:** Technical decisions document mapping Brian's 5 architecture convergence areas to existing implementation, gaps, and next steps
**Branch:** `main`
**File:** `docs/TECHNICAL_DECISIONS.md`

**Estimated Phase 1 effort across all areas: 10-14 days.**

---

### Previous Delivery — Spec Consolidation: Canonical 6-Document Structure

**Date:** 2026-04-04
**Agent:** Manny (Builder), integrating directive from Bondi (Scribe / OpenAI ChatGPT)
**Delivery:** Consolidated the entire spec/ directory into the Scribe's canonical 6-document structure
**Branch:** `main`

**Canonical Documents (spec/):**
- `CONSTITUTION.md` — Highest authority. Invariants, 5 layers, quorum, accountability invariant, amendment process.
- `ARCHITECTURE.md` — System design. Five layers, three loops, components, connector model, token model, deployment.
- `META_GOVERNANCE.md` — Layer 5 operational manual. Quorum, change control, learning classification, control modes.
- `WORK_PROTOCOL.md` — How work gets done. Agent work loop, roles, completion reports, audit checklist, definition of done.
- `RECEIPT_SPEC.md` — Receipt format. 5-hash chain, verification algorithm, protocol versioning, SDK support.
- `LEDGER_SPEC.md` — Ledger format. Append-only enforcement, hash chain algorithm, chain verification, integrity monitoring.

**Archived (spec/archive/):** 11 superseded files preserved for historical reference.

**Rationale:** Two Meta-Governance files existed (META_GOVERNANCE_SPEC.md and RIO_META_GOVERNANCE.md), creating governance drift risk. The Scribe directed: "Do not keep two specs — that creates governance drift." All content consolidated into one source of truth per domain.

---

## Previous Delivery — Meta-Governance Enforcement Mechanisms

**Date:** 2026-04-04
**Agent:** Chief of Staff
**Delivery:** 4 enforceable mechanisms added to Meta-Governance spec
**Branch:** `main`
**Source:** Bondi (Scribe / ChatGPT)
**Files:**
- `spec/RIO_META_GOVERNANCE.md` — Updated with Sections 6–10 (Quorum, Change Control, Do Not Learn, Kill Switch)
- `docs/DECISIONS.md` — Enforcement mechanisms decision recorded

---

### Previous Delivery — Scribe Deliverables: Mirrored Governance + Layer 5 Meta-Governance

---
