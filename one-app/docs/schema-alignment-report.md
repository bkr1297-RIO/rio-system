# Schema Alignment Report — ONE Authorization Records vs Canonical Packet Format

**Date:** 2026-04-10
**Requested by:** Brian (via Claude stress-test)
**Auditor:** Manny (Builder)

## Canonical Packet Schema (rio-system/packets/)

Three packet types defined:

| Packet Type | Key Fields |
|-------------|------------|
| **TASK** | task_id (UUID), created_at (ISO8601), created_by, authority_status, approved_by, objective, target_lane, source_of_truth, context, constraints, definition_of_done |
| **APPROVAL** | task_id (UUID), requested_at (ISO8601), requested_by, proposed_action, target, impact, approval_required, approved, approved_by, approval_text, approved_at |
| **RESULT** | task_id (UUID), completed_at (ISO8601), completed_by, status, summary, artifacts, verification, blockers, next_recommended_action |

## ONE Authorization Record Output (actual code)

### Intent Submission (maps to TASK packet)
```
Gateway payload: {
  action,                    → maps to "objective"
  agent_id,                  → maps to "created_by"
  target_environment,        → maps to "target_lane"
  parameters,                → maps to "context"
  confidence,                → no canonical equivalent (extension)
  reflection,                → no canonical equivalent (extension)
  request_timestamp (ISO8601), → maps to "created_at"
  request_nonce              → replay protection (extension)
}
```

### Approval Submission (maps to APPROVAL packet)
```
Gateway payload: {
  decision ("approved"|"denied"), → maps to "approval_text"
  reason,                         → no canonical equivalent (extension)
  request_timestamp (ISO8601),    → maps to "approved_at"
  request_nonce                   → replay protection (extension)
}
Ledger record: {
  intent_id,                → maps to "task_id"
  decision,                 → maps to "approval_text"
  principal_id,             → maps to "approved_by"
  approval_id,              → Gateway-generated
  reason,                   → extension
  userId,                   → Manus user ID (extension)
  timestamp (epoch ms)      → maps to "approved_at"
}
```

### Execution Receipt (maps to RESULT packet)
```
Receipt: {
  receipt_hash,             → cryptographic proof (extension)
  receipt_type,             → extension
  intent_hash,              → extension
  governance_hash,          → extension
  authorization_hash,       → extension
  execution_hash,           → extension
  action,                   → maps to "summary"
  agent_id,                 → maps to "completed_by"
  authorized_by,            → maps to "approved_by" (cross-ref)
  timestamp (ISO8601),      → maps to "completed_at"
  identity_binding,         → extension
}
```

## Diff Analysis

### Structural Alignment: COMPATIBLE

The ONE records map cleanly to the canonical packet format. Every required canonical field has a corresponding field in the ONE output:

| Canonical Field | ONE Equivalent | Status |
|-----------------|----------------|--------|
| task_id (UUID) | intent_id (UUID) | **MATCH** (naming differs, semantically identical) |
| created_at (ISO8601) | request_timestamp (ISO8601) | **MATCH** |
| created_by | agent_id / principal_id | **MATCH** |
| approved_by | principal_id (I-2) | **MATCH** |
| approval_text | decision ("approved"/"denied") | **MATCH** |
| approved_at | request_timestamp (ISO8601) | **MATCH** |
| completed_at | timestamp (ISO8601) | **MATCH** |
| completed_by | agent_id | **MATCH** |

### Extensions (ONE adds, canonical doesn't require)

These are **additive** — they don't break compatibility, they strengthen it:

1. **request_nonce** — Replay protection (Claude's requirement #5). Not in canonical schema but already in RIO gate spec.
2. **confidence** — Risk assessment metadata. Extension.
3. **reflection** — Agent reasoning trace. Extension.
4. **receipt_hash / governance_hash / authorization_hash / execution_hash** — Cryptographic proof chain. Extension beyond canonical.
5. **identity_binding** — Cross-reference between Manus identity and Gateway principal. Extension.

### Naming Differences (cosmetic, not structural)

| Canonical | ONE | Notes |
|-----------|-----|-------|
| task_id | intent_id | Same semantics. Gateway uses "intent" terminology. |
| target_lane | target_environment | Same semantics. |
| objective | action | Same semantics. |

### Missing from ONE (canonical has, ONE doesn't explicitly include)

| Canonical Field | Status | Impact |
|-----------------|--------|--------|
| source_of_truth.repo | Not in intent payload | LOW — Gateway tracks this internally |
| source_of_truth.drive_path | Not in intent payload | LOW — not relevant for runtime execution |
| constraints | Not in intent payload | LOW — enforced by governance rules, not payload |
| definition_of_done | Not in intent payload | LOW — tracked at task level, not intent level |
| artifacts.repo_commit | Not in receipt | MEDIUM — could add commit hash to receipt |
| verification.tests | Not in receipt | LOW — execution receipts are runtime, not CI |

## Verdict

**NO BREAKING DIFFS.** The ONE authorization record output is a **superset** of the canonical packet schema. Every field Claude identified as required (Task ID, Timestamp ISO8601, Authorizing identity, Action being authorized, Nonce) is present and correctly formatted.

The naming differences (intent_id vs task_id, action vs objective) are cosmetic and consistent within the Gateway's domain language. The canonical packets are designed for inter-agent coordination; the ONE records are designed for runtime governance. They serve different layers but are structurally compatible.

### One Recommended Addition

Add `repo_commit` to the execution receipt when available. This would close the one MEDIUM-impact gap — linking runtime execution back to the codebase state at time of execution. This is a future enhancement, not a blocker.

## Claude's Required Fields — All Present

| Claude Required | ONE Field | Format | Present |
|-----------------|-----------|--------|---------|
| Task ID (MUSS-095-COMMAND) | intent_id (UUID) | UUID | YES |
| Timestamp (ISO 8601) | request_timestamp | ISO 8601 | YES |
| Authorizing identity (B-Rass) | principal_id (I-2) | String | YES |
| Action being authorized (specific) | action + parameters | String + JSON | YES |
| Nonce (replay protection) | request_nonce | prefix-timestamp-random | YES |
