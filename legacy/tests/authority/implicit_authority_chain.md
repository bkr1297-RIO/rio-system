> All tests validate: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

# Test: Implicit Authority Chain

## Invariant Under Test

**Receipt ≠ Authorization** — A receipt records what happened. It does not authorize what happens next. Every action requires its own explicit authorization (DTT).

## Setup

- Two principals: Proposer (userId=1) and Approver (userId=2)
- Root authority registered with mock Ed25519 public key
- Governance policy activated with default rules (proposer ≠ approver, single-use tokens, fail-closed)
- Proposer onboarded as active proxy user
- Tool registry: `draft_email` (MEDIUM risk), `send_email` (HIGH risk), `web_search` (LOW risk)

## Steps

1. **Authorize ONLY `draft_email`**
   - Proposer creates `draft_email` intent (MEDIUM risk → PENDING_APPROVAL)
   - Approver approves → authorization token (ATOK) issued, bound to `draft_email`

2. **Execute `draft_email`**
   - Proposer executes with valid token
   - Token is burned after execution
   - Receipt_1 generated (64-char SHA-256 hash)

3. **WITHOUT issuing any new authorization, attempt:**
   - **3a:** `send_email` without any token (escalation)
   - **3b:** `send_email` using the burned `draft_email` token (cross-action replay)
   - **3c:** `web_search` (LOW risk lateral move — observe independent authorization path)
   - **3d:** Re-execute `draft_email` with burned token (replay attack)
   - **3e:** New `draft_email` intent without fresh approval
   - **3f:** New `draft_email` intent using burned token from intent_1 (cross-intent replay)

## Expected PASS Condition

- Step 2 succeeds (authorized action)
- Steps 3a, 3b, 3d, 3e, 3f are **BLOCKED** — preflight gate rejects with specific check failures
- Step 3c succeeds via its own independent LOW-risk auto-approval path (not chained to Receipt_1)
- No action derives authority from a receipt, context, or session

## Expected FAIL Condition

- Any action in step 3 (except 3c's independent path) executes successfully
- Any action references Receipt_1 as implicit permission
- System allows downstream actions without explicit re-authorization
