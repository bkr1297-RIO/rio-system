# Directive: End-to-End Governed Email — Single Priority

**Date:** 2026-04-04
**From:** Brian Kent Rasmussen (Root Authority), relayed by Romney (Distribution Engineer)
**To:** Manny (Chief Builder), Andrew (Solutions Architect / Gateway Owner)
**Status:** Active — Blocking
**Priority:** Highest — All other work paused until this flow works

---

## Summary

One governed email must flow end-to-end before any other work proceeds. No dashboards, no pillar diagrams, no UI polish. The only acceptable deliverable is a working loop:

> **Login → Submit Intent → Appears in Approvals → Approve → Email Sends → Receipt → Ledger**

---

## Instructions for Manny (Chief Builder)

Your only priority is completing the integration so that one governed email can be sent end-to-end. Do not work on dashboards, pillars, diagrams, or UI polish until this flow works.

### The Flow

1. **Login** — User authenticates via OAuth, identity resolves to `principal_id`
2. **Submit Intent** — User submits an intent (e.g., "send email to X")
3. **Appears in Approvals** — Intent appears in the Approvals queue with `requires_approval: true`
4. **Approve** — Authorized approver approves the intent, producing an `approval_hash`
5. **Email Sends** — Approved intent executes through the Gateway, email is sent
6. **Receipt** — Receipt is generated with `intent_hash`, `authorization_hash` (from approval), `execution_hash`, `signer_id`, `role_exercised`, `previous_ledger_hash`
7. **Ledger** — Receipt hash is appended to the ledger with chain link

### Current Blocker

**Gateway principal mapping (email → principal_id).** The Gateway must resolve the authenticated user's email to a `principal_id` with a role. Without this, intents cannot be attributed and approvals cannot be role-checked.

### What You Need to Coordinate with Andrew

- The `principals` table must include an `email` field (or a separate identity mapping table)
- The `resolvePrincipal` middleware must resolve `X-Authenticated-Email` header to a `principal_id` with role
- Once email resolves to `principal_id`, the intent flow should proceed to `requires_approval` and appear in the Approvals queue

### Acceptance Criteria

- [ ] One real email intent enters the system
- [ ] Intent is attributed to a resolved `principal_id`
- [ ] Intent appears in Approvals with `requires_approval: true`
- [ ] Approver approves, producing an `approval_hash`
- [ ] Email executes through the Gateway
- [ ] Receipt is generated with all required fields (see Romney's section below)
- [ ] Receipt hash is appended to the ledger with valid chain link
- [ ] The entire flow is verifiable — receipt can be independently verified

---

## Instructions for Andrew (Solutions Architect / Gateway Owner)

The Gateway must resolve identity. This is the current blocker for the entire end-to-end flow.

### Requirements

1. **Identity Resolution** — The Gateway must resolve identity via `X-Authenticated-Email` header and map it to a `principal_id` with a `role`
2. **Principals Table** — The `principals` table must include an `email` field or there must be a separate identity mapping table that links email addresses to `principal_id` values
3. **resolvePrincipal Middleware** — Middleware that:
   - Reads `X-Authenticated-Email` from the request header
   - Looks up the corresponding `principal_id` in the principals/identity table
   - Attaches `principal_id` and `role` to the request context
   - Rejects requests where the email cannot be resolved (401 or 403)
4. **Intent Flow** — Once email resolves to `principal_id`, the intent flow should proceed to risk assessment and, if `requires_approval`, appear in the Approvals queue

### Minimum Schema

```sql
-- Option A: Add email to principals table
ALTER TABLE principals ADD COLUMN email TEXT UNIQUE;

-- Option B: Separate identity mapping
CREATE TABLE identity_mappings (
  email TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES principals(principal_id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Acceptance Criteria

- [ ] `X-Authenticated-Email` header resolves to a `principal_id`
- [ ] Resolved principal includes a `role` (e.g., `operator`, `admin`, `agent`)
- [ ] Unresolved emails are rejected with appropriate error
- [ ] Resolved identity is available to downstream handlers (intent creation, approval checking)

---

## Instructions for Romney (Distribution Engineer) — Receipt Readiness

> **Note:** This section documents Romney's own readiness. Romney is standing by to verify the first receipt.

### Receipt Fields for Governed Email

The receipt protocol v2.3 already supports all required fields:

| Receipt Field | Source | Status |
|---|---|---|
| `intent_hash` | SHA-256 of canonical intent | Ready |
| `authorization_hash` | SHA-256 of approval record (from Manny's approvals table) | Ready — field exists, waiting for Manny's approval_hash |
| `execution_hash` | SHA-256 of execution result | Ready |
| `signer_id` | Gateway's Ed25519 public key | Ready |
| `role_exercised` | Role of the approver/executor | Ready (v2.3) |
| `previous_ledger_hash` | Hash of previous ledger entry | Ready |
| `actor_type` | `human` or `ai_agent` | Ready (v2.3) |
| `key_version` | Signing key version | Ready (v2.3) |
| `delegation` | Delegation chain if applicable | Ready (v2.3) |

### What Romney Will Verify After First Execution

1. Receipt is generated with valid `intent_hash`, `authorization_hash`, `execution_hash`
2. `authorization_hash` matches the hash of the approval record from Manny's approvals table
3. Receipt signature is valid (Ed25519)
4. Receipt hash is appended to the ledger
5. Ledger chain is intact (`previous_ledger_hash` links correctly)
6. Receipt is independently verifiable using the public verifier

---

## Coordination Protocol

- **Manny** coordinates with **Andrew** on the principals table and `resolvePrincipal` middleware
- **Manny** notifies **Romney** when the first approved action executes
- **Romney** verifies receipt hash and ledger entry immediately after first execution
- **All blockers** are reported to Brian via STATUS.md

---

## Definition of Done

One governed email has been sent end-to-end, producing a valid receipt and ledger entry that can be independently verified. The flow is:

```
Login → Submit Intent → Appears in Approvals → Approve → Email Sends → Receipt → Ledger
```

Nothing else matters until this works.
