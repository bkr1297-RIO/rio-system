# RIO Enforcement Implementation Plans

**Date:** 2026-04-04
**Author:** Manny (Builder / Manus)
**Status:** Plans ready. Awaiting Andrew's specs (Identity, Policy Schema, Storage) before implementation begins.
**Authority:** CoS directive — enforcement follows spec order. No code until specs land.

---

## Dependency Chain

The five enforcement areas form a strict dependency chain. Each area depends on the one above it.

```
1. Role Enforcement          ← requires IDENTITY_AND_ROLES_SPEC.md
2. Policy Evaluation Engine  ← requires POLICY_SCHEMA_SPEC.md + roles
3. CAS + Ledger Boundary     ← requires STORAGE_ARCHITECTURE_SPEC.md + policy
4. Active Audit              ← requires all three above
5. Meta-Governance           ← requires all four above
```

No area can be implemented until its dependencies are complete. No area can be implemented until its spec is finalized.

---

## 1. Role Enforcement

### What Exists Today

The Gateway has three identity mechanisms that operate independently:

**API Keys** (`gateway/security/api-keys.mjs`): SHA-256 hashed keys stored in PostgreSQL with `owner_id`, `scopes` (JSON array: read, write, admin), and `rate_limit`. The `requireScope()` middleware on API v1 routes checks that the authenticated key has the required scope. For example, `POST /intents` requires `write` scope, while `POST /intents/:id/authorize` requires `admin` scope.

**Ed25519 Signatures** (`gateway/security/ed25519.mjs`): Public keys stored in `authorized_signers` table with `signer_id`, `public_key_hex`, `display_name`, and `role` (default: `approver`). The authorize endpoint verifies Ed25519 signatures against registered public keys. If `ED25519_MODE=required`, unsigned authorizations are rejected.

**ONE PWA OAuth** (`drizzle/schema.ts`): Users authenticated via Manus OAuth with `role` enum (`user` | `admin`). Owner identified by `OWNER_OPEN_ID` environment variable. Protected procedures inject `ctx.user` with role.

**The gap:** These three systems are not connected. A Gateway API key holder is not the same identity as a ONE PWA user, which is not the same identity as an Ed25519 signer. There is no unified principal model. The `authorized_signers.role` column exists but is not enforced — any registered signer can approve any intent regardless of their role value.

### Implementation Plan

**Objective:** Every request to the system is made by a known principal with an explicit role. The system enforces that principals can only perform actions permitted by their role. No action can be performed by an unknown or unauthorized principal.

**Step 1 — Unified Principal Model.** Create a `principals` table that is the single source of truth for identity:

```
principals
├── principal_id     (UUID, primary key)
├── principal_type   (enum: human, agent, service)
├── display_name     (text)
├── auth_methods     (JSON array of bound auth methods)
│   ├── { type: "oauth", provider: "manus", external_id: "..." }
│   ├── { type: "api_key", key_id: "..." }
│   └── { type: "ed25519", public_key_hex: "..." }
├── roles            (JSON array: proposer, approver, executor, auditor, meta)
├── status           (enum: active, suspended, revoked)
├── created_at       (timestamp)
└── updated_at       (timestamp)
```

**Step 2 — Role Definitions.** Five roles with explicit permissions:

| Role | Can Submit Intent | Can Approve | Can Execute | Can Read Audit | Can Change Rules |
|------|:-:|:-:|:-:|:-:|:-:|
| proposer | Yes | No | No | No | No |
| approver | No | Yes | No | No | No |
| executor | No | No | Yes | No | No |
| auditor | No | No | No | Yes | No |
| meta | No | No | No | Yes | Yes |

A principal can hold multiple roles. The human root (I-1) holds all roles. Agents typically hold only `proposer`. The Gateway service holds `executor`.

**Step 3 — Middleware Enforcement.** Replace the current `requireScope()` middleware with `requireRole()`:

- `POST /intents` → `requireRole('proposer')`
- `POST /intents/:id/authorize` → `requireRole('approver')`
- `POST /intents/:id/execute` → `requireRole('executor')`
- `GET /ledger`, `GET /verify` → `requireRole('auditor')`
- `POST /policy/update` → `requireRole('meta')`

**Step 4 — Identity Binding.** When a ONE PWA user logs in, check if a matching principal exists (by OAuth external_id). If not, create one. When an API key is validated, resolve to the owning principal. When an Ed25519 signature is verified, resolve to the principal that registered that public key.

**Step 5 — Principal Attribution.** Every intent, approval, execution, and receipt must record the `principal_id` of the actor. This creates a complete audit trail of who did what.

### Code Enforcement Approach

The enforcement is implemented as middleware that runs before every route handler. The middleware:

1. Extracts the authentication credential (JWT cookie, API key header, or Ed25519 signature).
2. Resolves the credential to a `principal_id` using the `principals` table.
3. Checks that the principal has the required role for the requested operation.
4. If the principal is unknown, suspended, or lacks the required role: **reject with 403** (fail-closed).
5. Injects `req.principal` into the request context for downstream use.

The fail-closed invariant: if the middleware cannot resolve a principal, the request is rejected. There is no fallback to anonymous access.

### Verification Path

| Test | What It Proves | Method |
|------|---------------|--------|
| Unknown principal rejected | No anonymous access | Send request with no auth → expect 403 |
| Wrong role rejected | Role boundaries enforced | Proposer tries to approve → expect 403 |
| Correct role accepted | Authorized access works | Approver approves → expect 200 |
| Principal recorded on intent | Attribution works | Submit intent → check `principal_id` on stored intent |
| Suspended principal rejected | Revocation works | Suspend principal → send request → expect 403 |
| Multi-role principal works | Role composition works | Human with proposer+approver can submit and approve |
| API key resolves to principal | Identity binding works | Create API key for principal → use key → check `req.principal` |
| Ed25519 resolves to principal | Signature binding works | Register key for principal → sign → check `req.principal` |

**Estimated effort:** 2-3 days after spec lands.

---

## 2. Policy Evaluation Engine

### What Exists Today

**Gateway** (`gateway/governance/policy.mjs`): The `evaluateIntent()` function loads `RIO_CONSTITUTION.json` and `RIO_POLICY.json` at startup and runs a series of hardcoded checks: constitution loaded (fail-closed if missing), policy loaded (fail-closed if missing), agent recognized, environment valid, action allowed, risk level assigned, approval routing determined. Risk levels are LOW, MEDIUM, HIGH, CRITICAL. Approval routing: LOW can auto-approve, MEDIUM/HIGH require human, CRITICAL is blocked.

**ONE PWA** (`server/connectors.ts`): The `executeGoverned()` function enforces fail-closed at the connector level. Each connector declares its own risk tier (Send Email = HIGH, Web Search = LOW, Draft Email = MEDIUM). HIGH and MEDIUM risk require `approvalProof` (args hash match). The risk assessment is generated by LLM with structured output.

**Policy JSON** (`spec/policy-v1.0.json`): Defines operational protocols (AUTO_APPROVE, AUTO_DENY, REQUIRE_HUMAN), informed consent gate, time-bound execution, ambiguity scoring, quantum routing rules, and allowed actions categorized by approval requirement.

**The gap:** The policy engine is static and hardcoded. There is no machine-readable policy schema that can be evaluated at runtime. Risk levels are assigned by if/else chains, not by declarative rules. There is no quorum enforcement — any single approval is accepted. There is no policy versioning beyond the filename. There is no policy change audit trail.

### Implementation Plan

**Objective:** Every intent is evaluated against a versioned, machine-readable policy. The evaluation produces a deterministic governance decision that specifies: risk level, whether approval is required, how many approvals are required (quorum), who is allowed to approve (by role), who is allowed to execute (by role), and when the approval expires (TTL). The policy can only be changed through Meta-Governance (Area 5).

**Step 1 — Policy Schema.** Define a machine-readable policy schema (awaiting Andrew's `POLICY_SCHEMA_SPEC.md`). Expected structure:

```
policy
├── version          (semver)
├── hash             (SHA-256 of canonical JSON)
├── rules[]
│   ├── rule_id      (unique identifier)
│   ├── priority     (integer, lower = higher priority)
│   ├── condition    (predicate: action_type, risk_level, agent_role, etc.)
│   ├── decision
│   │   ├── risk_override        (optional: override computed risk)
│   │   ├── approval_required    (boolean)
│   │   ├── quorum               (integer: how many approvals needed)
│   │   ├── allowed_approvers    (role list)
│   │   ├── allowed_executors    (role list)
│   │   ├── ttl_seconds          (max time before expiration)
│   │   └── auto_deny            (boolean: block this action entirely)
│   └── metadata
│       ├── created_by           (principal_id)
│       ├── created_at           (timestamp)
│       └── rationale            (text)
└── defaults
    ├── default_risk             (LOW)
    ├── default_quorum           (1)
    ├── default_ttl              (1800 seconds)
    └── default_approval         (true for MEDIUM+)
```

**Step 2 — Rule Evaluator.** Implement a `evaluatePolicy(intent, policy)` function that:

1. Loads the active policy (by version hash).
2. Sorts rules by priority.
3. Evaluates each rule's condition against the intent.
4. Returns the first matching rule's decision (or defaults if no rule matches).
5. Records the evaluation: `{ policy_version, policy_hash, matched_rule_id, decision, timestamp }`.

**Step 3 — Quorum Enforcement.** Replace the current single-approval model with multi-signature collection:

1. When `quorum > 1`, the intent enters `PENDING_APPROVAL` and tracks collected signatures.
2. Each approval adds a signature to the collection.
3. The intent transitions to `AUTHORIZED` only when `collected_signatures.length >= quorum`.
4. Duplicate signatures from the same principal are rejected.
5. Only principals with the `approver` role and matching `allowed_approvers` can sign.

**Step 4 — Policy Versioning.** Every policy change produces a new version. The active policy is identified by its SHA-256 hash. Every governance decision records the `policy_hash` that was in effect. Old policy versions are retained for audit.

**Step 5 — Integration Points.**

- Gateway: Replace `evaluateIntent()` with `evaluatePolicy()`.
- ONE PWA: Replace hardcoded risk tiers in connectors with policy-driven risk evaluation.
- Both: Record `policy_hash` on every governance decision.

### Code Enforcement Approach

The policy engine is a pure function: `evaluatePolicy(intent, policy) → GovernanceDecision`. It has no side effects. It does not modify the intent. It does not call external services. It takes an intent and a policy, and returns a decision.

The enforcement layer wraps the pure function:

1. Load the active policy from the database (by latest version).
2. Call `evaluatePolicy(intent, activePolicy)`.
3. Store the governance decision on the intent record.
4. If `decision.auto_deny === true`: reject immediately (fail-closed).
5. If `decision.approval_required === true`: set status to `PENDING_APPROVAL` with `required_quorum`.
6. If `decision.approval_required === false`: set status to `AUTHORIZED` (auto-approve).

The fail-closed invariant: if the policy cannot be loaded, if the evaluator throws, or if no rule matches and no defaults exist, the intent is rejected.

### Verification Path

| Test | What It Proves | Method |
|------|---------------|--------|
| Missing policy rejects | Fail-closed on missing policy | Delete policy → submit intent → expect rejection |
| Rule matching works | Conditions evaluate correctly | Submit intent matching rule → check decision matches rule |
| Priority ordering works | Higher priority rules win | Create conflicting rules → check higher priority wins |
| Quorum enforced | Multi-approval works | Set quorum=2 → one approval → still PENDING → second approval → AUTHORIZED |
| Duplicate signer rejected | Same person can't approve twice | Same principal approves twice → second rejected |
| Wrong role rejected | Only allowed approvers can approve | Non-approver tries to approve → rejected |
| TTL enforced | Expired approvals rejected | Set TTL=1s → wait 2s → try to execute → rejected |
| Policy hash recorded | Audit trail exists | Submit intent → check governance decision has `policy_hash` |
| Auto-deny works | Blocked actions stay blocked | Submit auto-deny action → expect immediate rejection |
| Default fallback works | Missing rules use defaults | Submit intent matching no rule → check defaults applied |

**Estimated effort:** 3-5 days after spec lands.

---

## 3. CAS + Ledger Boundary

### What Exists Today

**Gateway PostgreSQL** (`gateway/ledger/init.sql`): Three tables serve different purposes. The `intents` table stores full pipeline state as JSONB columns (parameters, governance, authorization, execution, receipt). The `ledger_entries` table stores hash-only entries with `intent_hash`, `authorization_hash`, `execution_hash`, `receipt_hash`, `ledger_hash`, and `prev_hash`. The `receipts` table stores completed receipts with `hash_chain` JSONB.

**ONE PWA MySQL** (`drizzle/schema.ts`): Similar structure. The `intents` table stores full artifacts (parameters, risk assessment, approval data, execution result, receipt as JSON). The `ledger` table stores hash-only entries with the same 6-hash structure.

**S3 Storage** (`server/storage.ts`): Available via `storagePut()` and `storageGet()` helpers but not currently used for governance artifacts.

**The gap:** Full artifacts are stored in relational database columns, not in content-addressable storage. There is no deduplication. The same intent data exists in both databases. There is no artifact lifecycle (no archival, no pruning). The boundary between "what is an artifact" and "what is a proof" is not formally enforced.

### Implementation Plan

**Objective:** Full artifacts (intent parameters, execution results, approval records) are stored in content-addressable storage (CAS), keyed by their SHA-256 hash. The ledger stores only hashes and metadata — never full content. Receipts reference CAS artifacts by hash. Any artifact can be independently verified by recomputing its hash and comparing to the ledger entry.

**Step 1 — CAS Interface.** Define a content-addressable storage interface (awaiting Andrew's `STORAGE_ARCHITECTURE_SPEC.md`). Expected interface:

```
CAS.put(content: Buffer, contentType: string) → { hash: string, url: string }
CAS.get(hash: string) → { content: Buffer, contentType: string }
CAS.exists(hash: string) → boolean
CAS.verify(hash: string, content: Buffer) → boolean
```

The hash is the SHA-256 of the canonical content. The URL is the retrieval path (S3 presigned URL or direct CDN URL). The `verify()` method recomputes the hash and compares — it never trusts the stored hash.

**Step 2 — Artifact Envelope.** Every artifact stored in CAS is wrapped in an envelope:

```json
{
  "artifact_type": "intent_parameters | execution_result | approval_record | receipt",
  "artifact_hash": "sha256:...",
  "content_type": "application/json",
  "size_bytes": 1234,
  "stored_at": "2026-04-04T12:00:00Z",
  "stored_by": "principal_id"
}
```

**Step 3 — Ledger Boundary Enforcement.** Modify the ledger write path:

1. Before writing a ledger entry, store all referenced artifacts in CAS.
2. The ledger entry stores only the artifact hashes, never the content.
3. The receipt references artifacts by hash: `{ intent_hash: "sha256:...", intent_url: "s3://..." }`.
4. The ledger append function rejects any entry that contains content longer than a hash.

**Step 4 — Migration Path.** For existing data:

1. Extract full artifacts from existing `intents` JSONB columns.
2. Store each artifact in CAS.
3. Replace JSONB content with artifact hash references.
4. Verify that all ledger hashes still match after migration.

**Step 5 — Verification Invariant.** At any time, for any ledger entry:

```
CAS.get(entry.intent_hash) → content
SHA256(content) === entry.intent_hash  // Must be true
```

If this invariant fails, the artifact has been tampered with or the CAS is corrupted.

### Code Enforcement Approach

The enforcement is structural: the ledger write function physically cannot accept full content. The function signature enforces the boundary:

```typescript
appendLedgerEntry({
  intent_hash: string,      // SHA-256 hash only
  authorization_hash: string,
  execution_hash: string,
  receipt_hash: string,
  // No content fields accepted
}) → LedgerEntry
```

The CAS write function enforces content-addressability:

```typescript
casPut(content: Buffer) → { hash: string, url: string }
// The hash is computed, not provided by the caller
// The caller cannot choose the hash — it is deterministic
```

The fail-closed invariant: if CAS storage fails, the ledger entry is not written. An artifact that cannot be stored cannot be referenced.

### Verification Path

| Test | What It Proves | Method |
|------|---------------|--------|
| CAS stores by hash | Content-addressable | Store content → retrieve by hash → content matches |
| Duplicate content deduplicates | Same content = same hash | Store same content twice → only one CAS entry |
| Ledger rejects content | Boundary enforced | Try to append entry with content field → rejected |
| Ledger accepts hashes | Normal path works | Append entry with hashes only → accepted |
| Receipt references CAS | Receipts use hashes | Generate receipt → check all fields are hashes, not content |
| Verification invariant holds | Hash chain valid | For every ledger entry → CAS.get(hash) → recompute → matches |
| CAS failure blocks ledger | Fail-closed | Mock CAS failure → try to append → rejected |
| Migration preserves hashes | Backward compatible | Migrate existing data → verify all ledger hashes still valid |

**Estimated effort:** 3-4 days after spec lands.

---

## 4. Active Audit

### What Exists Today

**Ledger Integrity Job** (`gateway/monitoring/ledger_integrity_job.mjs`): Runs every hour. Recomputes the SHA-256 hash chain from genesis to tip. If a chain break is detected, fires a CRITICAL alert via the Alert Dispatcher. This verifies that the ledger has not been tampered with.

**Receipt Verification** (ONE PWA `server/routers.ts`): Recomputes all 5 hashes (intent, args, approval, execution, receipt) and compares to stored values. Verifies approval signature (args hash match). Walks the entire ledger hash chain and verifies each link.

**Alert Dispatcher** (`gateway/monitoring/alert_dispatcher.mjs`): Dispatches JSON-formatted alerts via email (HIGH+) and webhooks (MEDIUM+). Fail-open: observability failures do not block governance execution.

**Approval SLA Metrics** (ONE PWA): Queue size, average time to approve, oldest pending, approved/rejected/expired counts.

**The gap:** The system verifies that receipts and ledger entries are structurally valid, but does not verify that the execution was consistent with the approved plan, that the policy was not violated, or that the execution output matches expectations. There is no post-execution compliance check. There is no anomaly detection.

### Implementation Plan

**Objective:** Every completed governed action is automatically audited. The audit verifies four things: (1) the execution matched the approved plan, (2) the approval signatures are valid, (3) the policy was not violated, and (4) the receipt and ledger entries are valid. The audit runs automatically after every execution, not on a schedule and not manually.

**Step 1 — Audit Pipeline.** After every execution completes and a receipt is generated, an audit pipeline runs automatically:

```
Execution Complete
    → Receipt Generated
    → Audit Pipeline Triggered
        → Check 1: Plan Compliance (execution params match approved params)
        → Check 2: Signature Validity (approval signatures verify against registered keys)
        → Check 3: Policy Compliance (re-evaluate intent against policy that was in effect)
        → Check 4: Receipt Integrity (all hashes recompute correctly)
        → Check 5: Ledger Integrity (entry links correctly to previous entry)
    → Audit Result Recorded
    → If any check fails: CRITICAL alert dispatched
```

**Step 2 — Plan Compliance Check.** Compare the execution parameters to the approved parameters:

1. Retrieve the approval record (includes `approved_args_hash`).
2. Retrieve the execution record (includes actual parameters used).
3. Compute SHA-256 of the actual execution parameters.
4. Compare to `approved_args_hash`.
5. If they do not match: the execution deviated from the approved plan. Flag as `AUDIT_FAIL`.

**Step 3 — Policy Compliance Check.** Re-evaluate the intent against the policy that was in effect at the time of governance:

1. Retrieve the governance decision (includes `policy_hash`).
2. Load the policy version identified by `policy_hash`.
3. Re-run `evaluatePolicy(intent, historicalPolicy)`.
4. Compare the re-evaluated decision to the stored governance decision.
5. If they do not match: the policy was not correctly applied. Flag as `AUDIT_FAIL`.

This check catches retroactive policy tampering — if someone changes the policy after the fact, the re-evaluation will produce a different result.

**Step 4 — Audit Status.** Add `audit_status` to every intent:

| Status | Meaning |
|--------|---------|
| `UNAUDITED` | Execution complete, audit not yet run |
| `AUDIT_PASS` | All 5 checks passed |
| `AUDIT_FAIL` | One or more checks failed |
| `AUDIT_ERROR` | Audit could not complete (e.g., missing artifact) |

**Step 5 — Anomaly Detection.** In addition to per-execution audits, run periodic anomaly detection:

1. Approval rate monitoring: if approval rate drops below configurable threshold, alert.
2. Execution failure rate: if failure rate exceeds threshold, alert.
3. Risk distribution: if average risk level changes significantly, alert.
4. Timing anomalies: if execution latency exceeds historical norms, alert.
5. Volume anomalies: if intent submission rate spikes or drops, alert.

### Code Enforcement Approach

The audit pipeline is triggered by an event, not by a schedule. When the execution handler writes the receipt and ledger entry, it emits an `EXECUTION_COMPLETE` event. The audit pipeline subscribes to this event and runs all 5 checks.

The audit result is itself a governed artifact: it is stored in CAS, and a ledger entry of type `AUDIT` is appended. This means the audit is auditable — you can verify that the audit itself was not tampered with.

The fail-open invariant for audit: if the audit pipeline fails to run (e.g., system crash), the execution is not rolled back. The intent is marked `AUDIT_ERROR` and a CRITICAL alert is dispatched. The execution stands, but it is flagged for manual review. Audit failures do not block execution — they flag it.

### Verification Path

| Test | What It Proves | Method |
|------|---------------|--------|
| Audit runs after execution | Automatic triggering | Execute intent → check audit_status is AUDIT_PASS |
| Plan deviation detected | Compliance check works | Modify execution params after approval → audit flags AUDIT_FAIL |
| Invalid signature detected | Signature check works | Corrupt approval signature → audit flags AUDIT_FAIL |
| Policy violation detected | Policy compliance works | Change policy after governance → re-audit → flags mismatch |
| Receipt tampering detected | Integrity check works | Modify receipt hash → audit flags AUDIT_FAIL |
| Ledger break detected | Chain integrity works | Modify ledger entry → audit flags AUDIT_FAIL |
| Audit result in ledger | Audit is auditable | Check that AUDIT ledger entry exists for every audited execution |
| Anomaly alert fires | Monitoring works | Simulate approval rate drop → check alert dispatched |
| Audit failure alerts | Critical path works | Force AUDIT_FAIL → check CRITICAL alert dispatched |

**Estimated effort:** 3-5 days after Areas 1-3 are complete.

---

## 5. Meta-Governance Enforcement

### What Exists Today

The canonical spec (`spec/META_GOVERNANCE.md`) is the most thoroughly defined area. It specifies: quorum model (1-of-3 for emergency, 2-of-3 for policy changes, 3-of-3 for invariant changes), change control protocol (10-field Governance Change Receipt), learning classification (7 categories), system control modes (8 graduated modes from Normal to Full Stop), and the security audit question.

The ONE PWA has learning events recording (approval/rejection patterns with eventType, category, details, source, impact) and a learning loop that records events on every approval/rejection.

The Gateway has a kill switch endpoint (`POST /api/kill`) and receipt types that include `kill_switch`.

**The gap:** Meta-Governance is fully specified but not enforced in code. There is no quorum enforcement — any single approval is accepted. There is no Governance Change Receipt generation. There is no system control mode state machine. There is no "Do Not Learn" enforcement. The kill switch exists but is not integrated with the control mode system.

### Implementation Plan

**Objective:** The system enforces that rules can only be changed through a governed process. Rule changes require quorum. Every rule change produces a Governance Change Receipt stored in the ledger. The system can be placed into graduated control modes. Learning is classified before it is applied.

**Step 1 — System Control Modes.** Implement a state machine for system operating modes:

```
NORMAL → ELEVATED → RESTRICTED → AUDIT_ONLY → FULL_STOP
```

Each mode restricts what the system can do:

| Mode | Intent Submission | Approval | Execution | Audit | Rule Changes |
|------|:-:|:-:|:-:|:-:|:-:|
| NORMAL | All | All | All | Yes | Yes (with quorum) |
| ELEVATED | All | All | MEDIUM+ blocked | Yes | Yes (with quorum) |
| RESTRICTED | LOW only | All | LOW only | Yes | No |
| AUDIT_ONLY | No | No | No | Yes | No |
| FULL_STOP | No | No | No | No | No |

Transition rules: any single authority can escalate (move toward FULL_STOP). De-escalation requires the quorum defined for the target mode. FULL_STOP can be triggered by any single authority; restart from FULL_STOP requires 2-of-3.

The current mode is stored in the database, not in memory. Every mode transition produces a ledger entry.

**Step 2 — Quorum Enforcement.** Implement multi-signature collection for rule changes:

1. A rule change proposal is submitted by a principal with the `meta` role.
2. The proposal specifies: what is being changed, the new value, the rationale, and the required quorum.
3. Other `meta` principals review and sign the proposal.
4. When the required number of signatures is collected, the change is applied.
5. A Governance Change Receipt is generated and stored in the ledger.

Quorum requirements (from the spec):

| Action | Required Signatures |
|--------|:--:|
| Emergency stop (any → FULL_STOP) | 1 |
| Policy rule change | 2 of 3 |
| Risk model change | 2 of 3 |
| Connector add/remove | 2 of 3 |
| Add/remove authority | 3 of 3 (unanimous) |
| Change invariant | 3 of 3 (unanimous) |

**Step 3 — Governance Change Receipt.** Every rule change produces a 10-field receipt:

```json
{
  "change_id": "GCR-...",
  "change_type": "policy_rule | risk_model | connector | authority | invariant",
  "previous_value_hash": "sha256:...",
  "new_value_hash": "sha256:...",
  "rationale": "...",
  "proposed_by": "principal_id",
  "approved_by": ["principal_id", "principal_id"],
  "quorum_met": true,
  "applied_at": "2026-04-04T12:00:00Z",
  "receipt_hash": "sha256:..."
}
```

This receipt is stored in the ledger as a `META_GOVERNANCE` entry type. The previous and new values are stored in CAS (Area 3). The receipt stores only hashes.

**Step 4 — Learning Classification Gate.** Before any learning event can influence policy or risk models:

1. The event must be classified into one of 7 categories: human_mistake, policy_unclear, model_wrong, execution_bug, edge_case, malicious, unknown.
2. If the category is `unknown`, the event escalates to Meta-Governance for human classification.
3. Only classified events can be used as input to policy improvement suggestions.
4. The classification itself is recorded as a ledger entry.

**Step 5 — Policy Versioning and Rollback.** Every policy version is stored with its hash. The active policy is identified by hash, not by filename. Rollback is a special case of policy change: the "new" value is a previous version's hash. Rollback requires the same quorum as a policy change (2-of-3).

### Code Enforcement Approach

The control mode is enforced as the outermost middleware — it runs before role enforcement, before policy evaluation, before everything. If the system is in FULL_STOP, every request returns 503 immediately.

```
Request → Mode Check → Role Check → Policy Evaluation → ... → Execution
```

The quorum is enforced by a state machine on the proposal object. The proposal transitions through states: `PROPOSED → COLLECTING_SIGNATURES → QUORUM_MET → APPLIED`. The transition from `COLLECTING_SIGNATURES` to `QUORUM_MET` only happens when the signature count meets the requirement. The transition from `QUORUM_MET` to `APPLIED` triggers the actual change and generates the Governance Change Receipt.

The fail-closed invariant: if the control mode cannot be read from the database, the system defaults to FULL_STOP. If the quorum cannot be verified, the change is rejected. If the Governance Change Receipt cannot be generated, the change is not applied.

### Verification Path

| Test | What It Proves | Method |
|------|---------------|--------|
| FULL_STOP blocks everything | Control mode works | Set FULL_STOP → submit intent → expect 503 |
| RESTRICTED blocks HIGH risk | Graduated modes work | Set RESTRICTED → submit HIGH intent → rejected; LOW → accepted |
| Single authority can escalate | Fast stop works | One authority triggers FULL_STOP → system stops |
| De-escalation requires quorum | Can't silently restart | One authority tries to restart → rejected; 2-of-3 → accepted |
| Policy change requires quorum | Rule changes governed | One signature on policy change → still PROPOSED; 2-of-3 → APPLIED |
| Invariant change requires unanimous | Highest protection | 2-of-3 on invariant change → rejected; 3-of-3 → APPLIED |
| Governance Change Receipt generated | Audit trail exists | Apply policy change → check GCR in ledger |
| Previous value preserved | Rollback possible | Change policy → check previous_value_hash in CAS |
| Unclassified learning blocked | Do Not Learn works | Submit unclassified event → policy improvement blocked |
| Unknown events escalate | Safety valve works | Submit unknown event → check Meta-Governance escalation |
| Mode stored in database | Survives restart | Set mode → restart server → check mode persists |
| Mode transition logged | Audit trail exists | Change mode → check ledger entry for mode transition |

**Estimated effort:** 5-7 days after Areas 1-4 are complete.

---

## Summary: Implementation Timeline

| Area | Depends On | Spec Required | Estimated Effort | Status |
|------|-----------|---------------|:--:|--------|
| 1. Role Enforcement | — | `IDENTITY_AND_ROLES_SPEC.md` | 2-3 days | Plan ready, awaiting spec |
| 2. Policy Evaluation Engine | Area 1 | `POLICY_SCHEMA_SPEC.md` | 3-5 days | Plan ready, awaiting spec |
| 3. CAS + Ledger Boundary | Area 2 | `STORAGE_ARCHITECTURE_SPEC.md` | 3-4 days | Plan ready, awaiting spec |
| 4. Active Audit | Areas 1-3 | — (uses existing spec) | 3-5 days | Plan ready, awaiting Areas 1-3 |
| 5. Meta-Governance Enforcement | Areas 1-4 | `META_GOVERNANCE.md` (done) | 5-7 days | Plan ready, awaiting Areas 1-4 |

**Total estimated effort: 16-24 days** (sequential, after all specs land).

With parallel spec work from Andrew and sequential implementation from Manny, the critical path is:

```
Week 1: Andrew finalizes Identity + Policy specs → Manny builds Role Enforcement
Week 2: Andrew finalizes Storage spec → Manny builds Policy Engine
Week 3: Manny builds CAS + Ledger Boundary
Week 4: Manny builds Active Audit + Meta-Governance Enforcement
```

---

## What This Produces

When all five areas are enforced, the system guarantees:

1. **Every actor is known.** No anonymous access. Every action is attributed to a principal.
2. **Every action is evaluated.** No action bypasses policy. Risk, approval, quorum, TTL — all enforced.
3. **Every artifact is stored by hash.** Content-addressable. Tamper-evident. Independently verifiable.
4. **Every execution is audited.** Plan compliance, signature validity, policy compliance, receipt integrity — all checked automatically.
5. **Every rule change is governed.** Quorum required. Receipt generated. Rollback possible. Learning classified.

This is the enforcement layer that makes the governance model non-bypassable. The spec defines what should happen. The enforcement ensures it does happen. The audit proves it did happen.

---

*This document will be updated as specs land and implementation begins.*
