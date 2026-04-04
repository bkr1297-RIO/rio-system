# RIO / ONE — Technical Decisions: Architecture Convergence

**Date:** 2026-04-04
**Author:** Manny (Builder / Manus), responding to Brian's architecture convergence memo
**Status:** Active — decisions documented, gaps identified, next steps proposed
**Audience:** Brian (I-1), Chief of Staff, Bondi (Scribe)

---

## Context

Brian's memo identified five areas where the architecture needs clearer technical decisions to move from concept/prototype toward a real platform. This document maps each area to what already exists in the codebase, identifies gaps, and proposes concrete next steps.

The core definition we are converging on:

> RIO / ONE is a governed execution control plane that sits between AI systems and real-world actions, enforcing policy, approval, execution control, and audit with cryptographic proof for every AI-initiated action.

---

## 1. Identity and Roles

### What Exists

The system has three distinct identity layers, each implemented independently:

**Gateway Layer (gateway/security/):**
- **API Keys** (`api-keys.mjs`): SHA-256 hashed keys stored in PostgreSQL with `key_id`, `owner_id`, `display_name`, `scopes` (JSON array), and `rate_limit`. Keys are validated on every request. Table auto-creates on startup.
- **Ed25519 Signing** (`ed25519.mjs`): Public keys stored in `authorized_signers` table with `signer_id`, `public_key_hex`, `display_name`, and `role`. Used for cryptographic approval signatures.
- **Execution Tokens** (`token-manager.mjs`): Single-use UUIDs bound to a specific `intent_id` with configurable TTL (default 30 min). Tokens are burned after use — replay is impossible.
- **Replay Prevention** (`replay-prevention.mjs`): Nonce + timestamp validation on all state-changing endpoints. Each nonce can only be used once. Timestamps must be within a 5-minute window.

**ONE PWA Layer (drizzle/schema.ts):**
- **User table**: OAuth-authenticated users with `role` enum (`user` | `admin`). Owner identified by `OWNER_OPEN_ID` env var.
- **Protected procedures**: `protectedProcedure` injects `ctx.user` with role. Admin-only operations can gate on `ctx.user.role === 'admin'`.

**Policy Layer (spec/policy-v1.0.json):**
- Defines `owner` (Brian Kent Rasmussen) with digital fingerprint reference.
- Defines `core_invariants` (Agency, Sovereignty, Truth, Precision).
- Defines `allowed_actions` categorized by `AUTO_APPROVE`, `REQUIRE_HUMAN`, and `AUTO_DENY`.

### What Is Missing

The three identity layers are **not yet unified**. The Gateway has its own key-based identity, ONE has OAuth-based identity, and the policy JSON has a conceptual owner identity. There is no single identity model that maps a human or agent to a consistent principal across all three layers.

**Specific gaps:**
- No formal role taxonomy enforced in code. The roles mentioned in the spec (proposer, policy engine, approver, executor, auditor, meta-governance) exist conceptually but are not mapped to a single RBAC model.
- The Gateway `authorized_signers` table has a `role` column (default `'approver'`) but it is not enforced — any signer can approve any intent.
- No mechanism to bind a ONE PWA user identity to a Gateway signer identity.
- No key rotation or revocation protocol beyond manual database updates.

### Recommended Decision

Implement a **unified principal model** with three tiers:

| Tier | Identity | Authentication | Authorization |
|------|----------|---------------|---------------|
| Human (I-1) | OAuth + Ed25519 key pair | ONE PWA login + key signature | Root authority, all roles |
| Agent | API key + agent_id | Gateway API key validation | Scoped by policy (proposer, executor) |
| System | Internal service identity | Shared secret / mTLS | Auditor, ledger writer |

**Next steps (estimated 2-3 days):**
1. Add `principal_id` and `principal_type` columns to the Gateway `intents` table to track who submitted, who approved, who executed.
2. Create a `principals` table in the Gateway that maps `principal_id` → `type` (human/agent/system), `display_name`, `public_key_hex`, `scopes`, `created_at`.
3. Bind ONE PWA user identity to Gateway principal via a registration flow (user generates Ed25519 key pair in browser, registers public key with Gateway).
4. Enforce role-based scoping: agents can only propose, humans can approve, system can audit.

---

## 2. Policy Engine

### What Exists

**Gateway (gateway/governance/policy.mjs):**
- `evaluateIntent()` function that loads constitution and policy JSON, then runs a series of checks:
  - Constitution loaded (fail-closed if missing)
  - Policy loaded (fail-closed if missing)
  - Agent recognized (checked against `policy.scope.agents`)
  - Environment valid (checked against allowed environments)
  - Action allowed (checked against `allowed_actions` categories)
  - Risk level assignment based on action type
  - Approval routing based on risk level
- Risk levels: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- Approval routing: LOW can auto-approve, MEDIUM/HIGH require human, CRITICAL is blocked

**ONE PWA (server/connectors.ts):**
- `executeGoverned()` function enforces fail-closed at the connector level:
  - HIGH risk requires `approvalProof` (args hash match)
  - MEDIUM risk requires `approvalProof`
  - LOW risk can auto-execute
- Each connector declares its own risk tier (e.g., Send Email = HIGH, Web Search = LOW, Draft Email = MEDIUM)
- Risk assessment generated by LLM with structured output (risk level, blast radius, affected systems, recommendation)

**Policy JSON (spec/policy-v1.0.json):**
- Defines `operational_protocols`: policy object states (AUTO_APPROVE, AUTO_DENY, REQUIRE_HUMAN), informed consent gate, time-bound execution, ambiguity scoring
- Defines `allowed_actions` categorized by approval requirement
- Defines `quantum_routing_rules` for ambient reasoning gating

### What Is Missing

The policy engine works but is **static and file-based**. There is no runtime policy evaluation beyond the hardcoded checks in `policy.mjs`. The policy JSON is loaded once at startup and not dynamically updatable.

**Specific gaps:**
- No policy versioning in the Gateway. The ONE PWA has `protocolVersion` on receipts, but the policy itself has no version tracking beyond the filename.
- No quorum rules enforced in code. The spec defines quorum (1-of-3, 2-of-3, 3-of-3) but the Gateway accepts any single approval.
- No expiration/TTL enforcement in the Gateway. The ONE PWA has `expiresAt` on intents, but the Gateway does not check TTL.
- No policy change audit trail. The spec defines Governance Change Receipts, but no code generates them.
- No custom rules engine. Policies are evaluated by hardcoded if/else chains, not by a declarative rule engine.

### Recommended Decision

Implement a **two-phase policy engine**:

**Phase 1 (immediate, 2-3 days):** Make the existing engine version-aware and auditable.
1. Add `policy_version` field to every governance decision record.
2. Add `policy_hash` (SHA-256 of the policy JSON) to every governance decision — this proves which policy was in effect.
3. Add TTL enforcement to the Gateway `evaluateIntent()` function.
4. Log every policy load/reload as a ledger entry.

**Phase 2 (next sprint, 5-7 days):** Declarative policy rules.
1. Define a policy rule schema: `{ condition, action, risk_override, approval_override, expiration_override }`.
2. Implement a rule evaluator that processes rules in priority order.
3. Add a policy management API: `POST /policy/update` (requires Meta-Governance quorum).
4. Generate Governance Change Receipts for every policy update.

---

## 3. Storage Model (Artifacts vs Hashes vs Ledger)

### What Exists

The current storage model uses three distinct stores:

**Gateway PostgreSQL (gateway/ledger/init.sql):**

| Table | What It Stores | Full or Hash |
|-------|---------------|-------------|
| `intents` | Full pipeline state (parameters, governance, authorization, execution, receipt as JSONB) | **Full artifacts** |
| `ledger_entries` | Append-only event log with `intent_hash`, `authorization_hash`, `execution_hash`, `receipt_hash`, `ledger_hash`, `prev_hash` | **Hashes only** (plus `detail` text) |
| `receipts` | Completed receipts with `hash_chain` JSONB | **Full receipt** |
| `authorized_signers` | Ed25519 public keys | **Full keys** |
| `api_keys` | API key hashes, scopes, rate limits | **Hash of key** (not the key itself) |

**ONE PWA MySQL (drizzle/schema.ts):**

| Table | What It Stores | Full or Hash |
|-------|---------------|-------------|
| `intents` | Full intent with parameters, risk assessment, approval data, execution result, receipt | **Full artifacts** |
| `ledger_entries` | Hash chain entries with `intentHash`, `approvalHash`, `executionHash`, `receiptHash`, `ledgerHash`, `prevHash` | **Hashes only** |
| `conversations` | Chat history with Bondi (messages as JSON) | **Full content** |
| `learning_events` | Learning observations from approvals/rejections | **Full content** |

**S3 Storage (server/storage.ts):**
- Available for file uploads but not currently used for governance artifacts.

### What Is Missing

The storage model is **functional but not formalized**. Both the Gateway and ONE PWA store full artifacts in their respective databases, and both maintain hash-only ledgers. But there is no explicit policy about what should be stored where, and there is duplication.

**Specific gaps:**
- No content-addressable storage. Artifacts are stored by ID, not by hash. Two identical intents would be stored twice.
- No deduplication. The same intent data exists in both the Gateway PostgreSQL and the ONE PWA MySQL.
- No explicit artifact lifecycle. Intents are never archived or pruned.
- No separation between hot storage (recent, frequently accessed) and cold storage (historical, audit-only).
- Mantis (the observation layer) does not yet have its own storage — observations are stored as `learning_events` in the ONE PWA database.

### Recommended Decision

Formalize the **three-tier storage model**:

| Tier | Store | What Goes Here | Retention |
|------|-------|---------------|-----------|
| **Hot** | Gateway PostgreSQL | Active intents, pending approvals, recent receipts | 90 days active, then archive |
| **Ledger** | Gateway PostgreSQL (append-only) | Hash chain entries only — never full artifacts | Permanent, immutable |
| **Archive** | S3 (content-addressable) | Full artifact blobs keyed by SHA-256 hash | Permanent, read-only |

**Key principle:** The ledger stores hashes. The archive stores content. The hot store is the working set. If you need to verify, you recompute the hash from the archive and compare to the ledger.

**Next steps (estimated 3-4 days):**
1. Define an artifact envelope: `{ artifact_type, artifact_hash, content_type, size_bytes, stored_at }`.
2. Implement `archiveArtifact(type, content)` → computes SHA-256, stores to S3 with hash as key, returns `{ hash, url }`.
3. Add `artifact_hash` and `artifact_url` columns to the Gateway `intents` table.
4. Modify receipt generation to reference archived artifacts by hash rather than embedding full content.

---

## 4. Audit and Observability

### What Exists

**Automated Verification (gateway/monitoring/):**
- **Ledger Integrity Job** (`ledger_integrity_job.mjs`): Runs every hour. Recomputes the SHA-256 hash chain from genesis to tip. If a break is detected, fires a CRITICAL alert immediately. This is the core chain verification.
- **Alert Dispatcher** (`alert_dispatcher.mjs`): Dispatches JSON-formatted alerts via email and webhooks. Severity levels: CRITICAL, HIGH, MEDIUM, LOW. Email for HIGH+, webhooks for MEDIUM+. Fail-open: observability failures do not block governance execution.
- **Admin Health** (`admin_health.mjs`): Returns detailed system metrics including ledger size, last critical alert, and system health status.

**ONE PWA Verification:**
- **Receipt verification**: Recomputes all 5 hashes (intent, args, approval, execution, receipt) and compares to stored values.
- **Chain verification**: Walks the entire ledger hash chain and verifies each link.
- **Approval signature verification**: Checks that `approval_args_hash` matches recomputed hash of approved parameters.
- **Approval SLA metrics**: Queue size, average time to approve, oldest pending, approved/rejected/expired counts.

**What the audit currently verifies:**
1. Approval existed and was valid — **Yes** (approval signature check, args hash match)
2. Execution matched the approved plan — **Partial** (args hash match proves parameters matched, but execution output is not verified against expected output)
3. Policy was not violated — **No** (no post-execution policy compliance check)
4. Receipt and ledger entries exist and are valid — **Yes** (receipt hash verification, chain integrity check)

### What Is Missing

**Specific gaps:**
- No post-execution policy compliance audit. The system verifies that the receipt is valid, but does not verify that the execution was consistent with the policy that was in effect.
- No execution output verification. The system records what happened but does not verify that what happened was what was supposed to happen (e.g., "email was sent to the correct recipient").
- No system-level metrics dashboard in the Gateway. The ONE PWA has approval SLA metrics, but the Gateway only has basic health checks.
- No automated anomaly detection. The ledger integrity job catches tampering, but does not catch anomalies (e.g., unusual approval patterns, sudden risk level changes).
- Mantis is specified as the observation layer but is not yet implemented as a standalone component — observations are stored as learning events in the ONE PWA.

### Recommended Decision

Implement audit in **two layers**:

**Layer 1 — Automated Verification (extend existing, 2-3 days):**
1. Add post-execution policy compliance check: after execution, re-evaluate the intent against the policy that was in effect (stored by `policy_hash`) and flag any violations.
2. Add execution output verification: for connectors with deterministic outputs (e.g., email sent confirmation), verify that the output matches the expected result.
3. Add `audit_status` field to intents: `UNAUDITED` → `AUDIT_PASS` → `AUDIT_FAIL`.

**Layer 2 — Observability (new, 3-5 days):**
1. Add system metrics endpoint to the Gateway: intent throughput, approval latency, execution success rate, policy evaluation time.
2. Add anomaly detection rules: flag if approval rate drops below threshold, if execution failure rate exceeds threshold, if average risk level changes significantly.
3. Expose metrics in Prometheus format for external monitoring integration.

---

## 5. Meta-Governance

### What Exists

Meta-Governance is the most thoroughly specified area. The canonical spec (`spec/META_GOVERNANCE.md`) defines:

- **Quorum Model**: Emergency stop (1-of-3), policy/risk/model/connector changes (2-of-3), invariant/authority changes (3-of-3 unanimous).
- **Change Control Protocol**: 10-field Governance Change Receipt required for every rule change. No receipt = no change.
- **Learning Classification**: 7 categories (human mistake, policy unclear, model wrong, execution bug, edge case, malicious, unknown). System cannot learn from unclassified events.
- **System Control Modes**: 8 graduated modes from Normal to Full Stop. Easier to stop than to start. Any single authority can trigger Full Stop.
- **Security Audit Question**: "Where in this architecture can an action happen without approval, and where can a rule change without Meta-Governance?"

The ONE PWA has:
- **Learning events table**: Records approval/rejection patterns with `eventType`, `category`, `details`, `source`, `impact`.
- **Learning loop**: On every approval/rejection, a learning event is recorded for future policy improvement.

### What Is Missing

Meta-Governance is **fully specified but not yet enforced in code**. The spec defines exactly what should happen, but the Gateway does not implement quorum, change control receipts, or graduated control modes.

**Specific gaps:**
- No quorum enforcement. Any single approval is accepted.
- No Governance Change Receipt generation. Policy changes are manual file edits with no audit trail.
- No system control mode state machine. There is no way to put the system into Restricted, Audit Only, or Full Stop mode.
- No "Do Not Learn" enforcement. Learning events are recorded but not classified before being used.

### Recommended Decision

Implement Meta-Governance in **three phases**:

**Phase 1 — Control Modes (immediate, 1-2 days):**
1. Add `system_mode` state to the Gateway (stored in database, not in-memory).
2. Implement mode transitions: Normal → Elevated → Restricted → Audit Only → Full Stop.
3. Add `POST /system/mode` endpoint (requires authentication).
4. Enforce mode restrictions: in Restricted mode, only LOW risk intents proceed; in Audit Only, no execution; in Full Stop, all endpoints return 503.

**Phase 2 — Quorum (next sprint, 3-5 days):**
1. Add `required_approvals` field to governance decisions based on risk level and action type.
2. Implement multi-signature approval: collect signatures until quorum is met.
3. Store approval signatures as an array, not a single value.

**Phase 3 — Change Control (following sprint, 3-5 days):**
1. Implement `POST /policy/propose` → creates a policy change proposal.
2. Implement `POST /policy/approve` → collects quorum signatures for the proposal.
3. Generate Governance Change Receipt on policy activation.
4. Store Governance Change Receipts in the ledger as `META_GOVERNANCE` entry type.

---

## Summary: What We Have vs What We Need

| Area | Exists | Gap | Priority | Effort |
|------|--------|-----|----------|--------|
| **Identity & Roles** | Three separate identity layers (API keys, OAuth, Ed25519) | Not unified, no RBAC enforcement | HIGH | 2-3 days |
| **Policy Engine** | Static file-based evaluation with risk levels and approval routing | No versioning, no quorum, no dynamic rules | HIGH | 2-3 days (Phase 1) |
| **Storage Model** | Full artifacts in DB + hash-only ledger | No content-addressable storage, no deduplication, no lifecycle | MEDIUM | 3-4 days |
| **Audit & Observability** | Ledger integrity check, receipt verification, alert dispatcher | No post-execution compliance check, no anomaly detection | MEDIUM | 2-3 days (Layer 1) |
| **Meta-Governance** | Fully specified in canonical spec | Not enforced in code (no quorum, no control modes, no change receipts) | HIGH | 1-2 days (Phase 1) |

**Total estimated effort for Phase 1 across all areas: 10-14 days.**

The system is structurally sound. The architecture is correct. The gaps are enforcement gaps, not design gaps — the spec defines what should happen, and the code needs to catch up to the spec. This is a normal and healthy state for a system transitioning from prototype to platform.

---

## Artifact-Based Coordination

Brian's memo identified a key architectural insight: agents coordinate through shared artifacts, not direct communication. This is already the pattern in practice:

| Artifact | Producer | Consumer | Storage |
|----------|----------|----------|---------|
| Intent | Bondi (proposer) | Gateway (governor) | Gateway DB + ONE DB |
| Risk Assessment | LLM (via ONE) | Human (via ONE UI) | ONE DB |
| Policy Decision | Gateway (governor) | ONE (display) | Gateway DB |
| Approval Record | Human (via ONE) | Gateway (executor) | ONE DB + Gateway DB |
| Execution Record | Connector (executor) | ONE (display) | ONE DB |
| Receipt | Gateway/ONE (verifier) | Anyone (auditor) | Both DBs |
| Ledger Entry | Gateway/ONE (recorder) | Mantis (observer) | Both DBs (append-only) |
| Audit Log | Mantis (observer) | Meta-Governance | ONE DB (learning_events) |

The system is "watching itself" through the ledger, audit, and observability layers. No agent needs to talk to another agent directly — they read and write artifacts, and the system state is the sum of all artifacts.

This is the correct architecture for a governed system. Direct agent-to-agent communication would create ungoverned channels. Artifact-based coordination ensures that every interaction is recorded, verifiable, and auditable.

---

*This document will be updated as technical decisions are made and implemented.*
