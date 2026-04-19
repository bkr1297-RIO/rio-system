# RIO Gateway — Demo Readiness Stabilization Report

**Date:** 2026-04-13
**Gateway Version:** 2.9.0
**Assessed by:** Manus ONE Builder Agent

---

## Current State Assessment

The Gateway is operational and successfully processes the full governance pipeline (intent, govern, authorize, execute, receipt, ledger) when called with the correct parameters. The demo run produced a complete governed action with 13/13 verification checks passing.

### What Works

| Capability | Status | Evidence |
|-----------|--------|----------|
| Principal authentication (I-1, I-2) | Working | Both login successfully via passphrase |
| Intake Schema v1 validation | Working | Intents accepted with identity/intent/context structure |
| Policy v2 governance | Working | Risk assessment, scope checks, action classification |
| Authorization (separate approver) | Working | I-2 approved I-1's intent correctly |
| Token issuance and burn | Working | token_id present in receipt, token_burn=true |
| Ed25519 receipt signing | Working | 128-char hex signature with gateway public key |
| Hash chain (per-receipt) | Working | 5-level chain: intent→governance→authorization→execution→receipt |
| Ledger write | Working | ledger_entry_id returned, current epoch valid |
| Replay prevention | Working | Nonce tracking active, 34 tracked nonces |
| External delivery mode | Working | Completes in ~400ms, returns email_payload |

### Issues Found

| # | Issue | Severity | Impact | Fix Location |
|---|-------|----------|--------|-------------|
| 1 | `/authorize` endpoint lacks self-approval check | Medium | Proposer can approve own intent via old endpoint | `routes/index.mjs` line 272 |
| 2 | `/authorize` vs `/approvals/:intent_id` duplication | Low | Two endpoints do the same thing with different invariants | `routes/index.mjs` |
| 3 | SMTP hang on Render | Resolved | Fixed by using `delivery_mode=external` | Proxy-side fix applied |
| 4 | `chain_valid=false` in health | Informational | 33 linkage breaks at epoch boundaries (expected for epoch model) | N/A |

---

## Issue 1: Self-Approval Gap on `/authorize`

The old `/authorize` endpoint (line 272) does not check whether the approver is the same principal as the proposer. It accepts `authorized_by` from the request body and compares nothing.

The newer `/approvals/:intent_id` endpoint (line 418) correctly enforces this invariant:

```javascript
// INVARIANT: Proposer cannot approve their own intent
const approverId = req.principal?.principal_id;
if (intent.principal_id && approverId === intent.principal_id) {
  return res.status(403).json({
    error: "Self-authorization denied. The proposer cannot approve their own intent.",
    invariant: "proposer_ne_approver",
  });
}
```

**Recommended fix:** Add the same check to `/authorize`:

```javascript
// After line 295 (status check), before line 297 (timestamp):
const approverId = req.principal?.principal_id;
if (intent.principal_id && approverId === intent.principal_id) {
  return res.status(403).json({
    error: "Self-authorization denied. The proposer cannot approve their own intent.",
    invariant: "proposer_ne_approver",
  });
}
```

**Alternative:** Deprecate `/authorize` entirely and route all authorization through `/approvals/:intent_id`. The proxy would need to be updated to use the new endpoint.

---

## Issue 2: Endpoint Duplication

Two endpoints serve the same purpose with different contracts:

| Aspect | `/authorize` (old) | `/approvals/:intent_id` (new) |
|--------|-------------------|-------------------------------|
| Self-approval check | Missing | Present |
| Duplicate vote check | Missing | Present (via `getApprovalByApprover`) |
| `authorized_by` source | Request body | `req.principal.principal_id` |
| Separate approvals table | No | Yes |
| Signature verification | Yes | Yes |

**Recommendation:** Migrate to `/approvals/:intent_id` as the canonical authorization endpoint. The proxy currently calls `/authorize` — update the proxy's `approveAndExecute` to call `/approvals/:intent_id` instead.

---

## Principals Configuration

The current principal registry is correct for demo purposes:

| Principal | Type | Primary Role | Secondary Roles | Status |
|-----------|------|-------------|-----------------|--------|
| I-1 | human | root_authority | approver, meta_governor | active |
| I-2 | human | approver | (none) | active |
| bondi | ai_agent | proposer | (none) | active |
| manny | ai_agent | proposer | (none) | active |

I-1 has `root_authority` which includes all roles via `getAllRoles()`. I-2 has `approver` only. This correctly models the separated authority pattern for demos.

---

## Policy Scope

The policy v2 scope is configured for demo scenarios:

| Scope Type | Values |
|-----------|--------|
| Agents | bondi, manny, andrew, romney, damon, brian.k.rasmussen |
| Systems | gmail, google_drive, github, google_workspace, calendar, ONE, RIO |
| Environments | local, sandbox, production |

**Note:** When submitting intents, `identity.subject` must be one of the scoped agents (e.g., `brian.k.rasmussen`), and `intent.target` must be one of the scoped systems (e.g., `gmail`). Using values outside scope triggers `AUTO_DENY`.

---

## Demo Readiness Checklist

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Gateway reachable | READY | Responds in ~700ms from sandbox |
| 2 | Both principals authenticate | READY | I-1 and I-2 login successfully |
| 3 | Full pipeline completes | READY | 13/13 governed action checks pass |
| 4 | Receipt has Ed25519 signature | READY | Signature present, gateway public key returned |
| 5 | Ledger entry written | READY | Current epoch valid |
| 6 | Denial flow works | READY | Denied intent blocked from execution |
| 7 | Self-approval blocked | PARTIAL | Blocked on `/approvals/:intent_id`, not on `/authorize` |
| 8 | External delivery mode | READY | Completes in ~400ms |
| 9 | Replay prevention | READY | Nonce tracking active |
| 10 | Policy scope correct | READY | gmail + brian.k.rasmussen in scope |

**Overall: READY for demo with the caveat that self-approval enforcement requires using the newer `/approvals/:intent_id` endpoint or the proxy's local enforcement.**
