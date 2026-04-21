# Evaluating RIO v1.0

This document is for technical reviewers and standards bodies evaluating the claims of RIO v1.0.

---

## 1. What v1.0 claims

RIO v1.0 makes three core claims:

1. **Execution Boundary** — No action executes unless it passes a fail-closed gate that checks authorization, binding, and lineage.
2. **Exact Intent Binding** — The payload executed is cryptographically bound to the payload that was approved. Any modification after approval causes rejection.
3. **Receipt + Ledger** — Every execution attempt (success, denial, or block) produces a receipt. All receipts are recorded in an append-only, hash-chained ledger.

v1.0 does **not** claim to:

- make decisions
- authorize actions by itself
- implement real-world integrations
- define natural-language intent formation
- provide a user interface or operating environment

---

## 2. How to test the claims

### Setup

```bash
cd enforcement-core
node test_harness.mjs
node test_harness.mjs --case=email
node test_harness.mjs --case=funds
```

### What to inspect

- **Test cases** — Each test targets a specific invariant condition (missing token, payload drift, expired token, replay, trace mismatch, lineage failure, scope violation, valid execution).
- **Example scenarios** — `examples/email_commitment/` and `examples/funds_transfer/` contain valid and invalid JSON payloads with expected outcomes.
- **Generated receipts** — Valid executions produce receipts containing `trace_id`, `intent`, `payload_hash`, `decision`, `execution_result`, and `receipt_hash`.
- **Ledger entries** — Every attempt is appended to the ledger. The chain can be independently verified by recomputing hashes from genesis.

### Execution Boundary

Reviewers should try:

- Submitting a request with no token → confirm DENY (MISSING_TOKEN)
- Submitting a request with an expired token → confirm DENY (INVALID_TOKEN)
- Replaying a consumed token → confirm DENY (TOKEN_USED)
- Submitting a request with a mismatched trace_id → confirm DENY (TRACE_MISMATCH)

Confirm that in every denial case, no adapter is called and no execution occurs.

### Exact Intent Binding

Reviewers should try:

- Approving an intent, then modifying the payload before execution → confirm DENY (ACT_BINDING_MISMATCH)
- Approving an intent with scope constraints, then exceeding those constraints → confirm DENY (SCOPE_VIOLATION)

Confirm that the gate computes a canonical hash of `{intent, payload}` and compares it to the token's `intent_hash`. Any difference causes rejection.

### Receipt Protocol + Ledger

Reviewers should confirm:

- Every execution attempt (DENY, BLOCK, EXECUTE) writes a ledger entry
- Each entry contains `prev_hash` linking to the previous entry
- The genesis entry uses a zero hash
- `verifyChain()` recomputes the full chain and confirms integrity
- Receipts for valid executions include the full intent, payload hash, execution result, and receipt hash

---

## 3. What is out of scope for v1.0

Reviewers should **not** expect v1.0 to define:

- **Natural-language intent formation** — How intents are created from human language is not part of this layer.
- **Policy decision logic** — How authorization decisions are made (who approves, under what conditions) is upstream of the gate.
- **Domain-specific integrations** — Real email sending, funds transfer, or API calls are simulated in examples. The adapters demonstrate the contract, not production integrations.
- **UI / operating environments** — Systems like ONE and MANTIS consume the RIO Standard but are separate repositories and specifications.

These belong to higher-layer specifications or separate repositories.

---

## 4. Recommended evaluation questions

1. **Determinism** — Given the same token, intent, and payload, does the gate always produce the same decision? Is there any path where randomness or timing affects the outcome?

2. **Fail-Closed Behavior** — If any check is indeterminate or throws an error, does the system default to DENY? Is there any path where an exception results in execution?

3. **Traceability** — Can every ledger entry be traced back to a specific intent, token, and decision? Is the chain independently verifiable without trusting the system that wrote it?

4. **Composability** — Can the gate be used with different adapters, different token issuers, and different ledger backends without modifying the core logic?

5. **Minimality** — Does the system contain only what is necessary to enforce the three claims? Is there any code that expands scope beyond enforcement and proof?

---

## 5. Closing framing

RIO v1.0 should be reviewed as infrastructure. It provides five components:

- a **gate** that enforces authorization before execution
- a **token** system that binds authorization to a single use, a single trace, and a single payload
- **exact binding** that rejects any modification between approval and execution
- **receipts** that record the full context of every execution attempt
- a **ledger** that chains receipts into an immutable, verifiable history

Higher-layer systems (application agents, operating environments, policy engines) exist separately and depend on this infrastructure. They do not modify it.
