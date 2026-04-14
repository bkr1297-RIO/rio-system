# Claude Spec Notes — Selective Integration Reference

## ARCHITECTURE.pdf — Key Findings

### 6 Core Layers (Claude's Python build)
1. **Receipt Chain** (core/receipt.py) — Immutable witness log, cryptographic chaining (prev_receipt_hash)
2. **Coherence & Somatic Oracles** (core/somatic.py) — Temporal freshness, embodied presence validation
3. **Policy Evaluator** (core/policy.py) — Z3-backed policy logic: ALLOW, REQUIRE_APPROVAL, DENY
4. **MANTIS Graph Store** (core/mantis.py) — Structural witness database, anti-collusion enforcement
5. **RIO/ONE Orchestrator** (core/orchestrator.py) — 8-step workflow: propose → evaluate → approve → check → execute → emit receipt. Fail-closed.
6. **Witness Dashboard** (dashboard.jsx) — React interface, receipt visualization

### Receipt Structure (from Claude)
Fields in Claude's receipt model:
- receipt_id
- prev_receipt_hash
- action_intent (type, target, parameters)
- policy_decision
- approval_status
- execution_status
- timestamp
- receipt_hash

### Orchestrator Workflow (8 steps)
propose → evaluate coherence → evaluate policy → check somatic → approve → execute → emit receipt → store in MANTIS

### Formal Verification (4 layers)
1. TLA+ — State machine correctness, fail-closed, no deadlocks
2. Alloy — Graph structure sound, no unwitnessed actions
3. Z3 — Policy has no contradictions, execution cannot bypass coherence/policy/approval
4. Property Tests — Code matches spec, invariants hold under random input

### Key Files
- core/receipt.py (320 lines) — Receipt & ReceiptChain
- core/somatic.py (200 lines) — Coherence & Somatic oracles
- core/policy.py (160 lines) — Policy evaluator
- core/mantis.py (350 lines) — Graph store & constraints
- core/orchestrator.py (480 lines) — Main state machine

## What to integrate (from Brian's directive):
1. Receipt structure standardization (align our receipts to Claude's fields)
2. ActionEnvelope wrapper (lightweight input normalization)
3. NOT: orchestrator, MANTIS graph, Z3 policy, somatic oracles (our Gateway handles these)

## FORMALVERIFICATION.pdf — Key Findings

### 4-Layer Verification Stack
1. **TLA+** — Temporal logic: fail-closed boundary, state machine correctness, receipt emission for every outcome
   - Key invariants: NoExecutionWithoutChecks, ReceiptForEveryOutcome, NoClosedWithoutReceipt
2. **Alloy** — Structural integrity: receipt-action linkage, consequential actions witnessed, anti-collusion
   - Node types: Principal, Agent, ActionIntent, Receipt, ApprovalWitness, CoherenceRecord, SomaticReading
   - Edge types: PROPOSED_BY, ATTESTS_TO, AUTHORIZED_BY, COHERES_WITH, SATISFIES
   - Key facts: ReceiptAttestsToExactlyOneActionIntent, ConsequentialActionHasReceipt, NoSelfApprovalByAgent
3. **Z3** — Logical consistency: no bypass models, policy cannot contradict, required approval enforceable
4. **Property Tests** — Implementation fidelity: code matches spec, edge cases, invariants under random input

### What to integrate from this:
- The RECEIPT STRUCTURE (standardized fields) — YES, align our receipts
- The INVARIANT NAMES — useful for our test assertions
- The formal specs themselves — NOT for this build, but reference for future

## README.pdf — Key Findings

### Claude's Receipt Structure (the standard we need to align to):
```json
{
  "receipt_id": "rcpt_xyz...",
  "prev_receipt_hash": "rcpt_abc_hash...",
  "action_intent": {
    "type": "email.send",
    "target": "alice@example.com",
    "consequential": true
  },
  "coherence_record": {
    "coherence_status": "WITHIN_ENVELOPE",
    "delta_ms": 234,
    "bound_ms": 5000
  },
  "somatic_reading": {
    "somatic_invariant_status": "PASS",
    "freshness_window_ms": 1000,
    "presence_valid": true
  },
  "execution_status": "EXECUTED",
  "receipt_status": "EMITTED_EXECUTED",
  "policy_decision": "ALLOW"
}
```

### 6 Invariants
1. Safety: Execution cannot occur unless all preflight checks pass (fail-closed)
2. Witness: Every consequential action emits an immutable receipt
3. Integrity: Every receipt is chained to the prior receipt (unbreakable history)
4. Coherence: Actions must execute within a temporal envelope (freshness bound)
5. Somatic: Actions require embodied presence and freshness
6. Structure: The witness graph is incorruptible

### Orchestrator 8-Step Workflow
1. Propose action
2. Evaluate policy
3. Request approval (if required)
4. Issue capability
5. Check coherence
6. Check somatic
7. Execute action (if all checks pass)
8. Emit receipt (always)

### What to integrate for this build:
1. **Receipt structure** — align our receipts to include: receipt_id, prev_receipt_hash, action_intent, policy_decision, approval_status, execution_status, timestamp
2. **ActionEnvelope** — lightweight wrapper: action_id, actor, intent, payload, policy_ref
3. **Read APIs** — getLastAction(), getActionHistory(), getSystemState() reading from Drive
4. **One new surface** — SMS send through Gateway → authorize → receipt → ledger
5. **Drive as source of truth** — on startup, read anchor.json + ledger.json, verify chain integrity
