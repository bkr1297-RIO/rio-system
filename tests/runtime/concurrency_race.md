# Test: Concurrency Race Condition

## Invariant Under Test

**Single-use token enforcement under concurrent execution** — A token with `max_executions: 1` must permit exactly one execution, even when multiple execution requests arrive simultaneously. The token store is the serialization point.

## Setup

- Two principals: Proposer (userId=1) and Approver (userId=2)
- Root authority registered with mock Ed25519 public key
- Governance policy activated with default rules
- Proposer onboarded as active proxy user
- Tool: `send_email` (HIGH risk, requires approval + token)
- Single intent created, approved, and token issued with `max_executions: 1`

## Steps

1. **Create and authorize a single `send_email` action**
   - Proposer creates intent (HIGH risk → PENDING_APPROVAL)
   - Approver approves → single-use authorization token issued

2. **Fire N concurrent execution requests using the same token**
   - N = 5 parallel calls to `proxy.execute` with the same intentId and tokenId
   - All requests are dispatched simultaneously (not sequentially)

3. **Count outcomes**
   - Count how many requests returned `success: true`
   - Count how many requests returned `success: false`
   - Verify the token was burned after the successful execution

## Expected PASS Condition

- Exactly 1 of N requests succeeds
- Exactly (N-1) of N requests fail
- Failed requests fail on preflight checks (token burned, execution limit, or already executed)
- The token no longer exists in the store after completion
- No double-execution occurs

## Expected FAIL Condition

- More than 1 request succeeds (double-execution)
- Token is used more than once before being burned
- System produces duplicate receipts or ledger entries for the same intent
