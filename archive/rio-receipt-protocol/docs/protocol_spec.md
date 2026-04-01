# RIO Receipt Protocol Specification

## 1. Overview

The RIO Receipt Protocol defines a strict, verifiable chain of custody for high-risk actions executed by AI systems on behalf of humans or organizations. It ensures that no action can occur without explicit authorization, and that every action produces an immutable, cryptographically signed receipt.

The protocol enforces end-to-end decision provenance and non-repudiation.

## 2. The Protocol Chain

The protocol operates as a strict, sequential pipeline. Each step must complete successfully before the next step can begin.

**Action Request → AI Recommendation → Human Approval → Controlled Execution → Cryptographic Receipt → Audit Log**

### Step 1: Action Request
An AI agent or system proposes an action. This proposal is formalized as an `ActionRequest` record. It must contain the exact parameters, target, and assessed risk level. Once created, the request is immutable.

### Step 2: AI Recommendation
The AI system evaluates the request against the active policy context and produces an `AIRecommendation`. This record states whether the AI believes the action should proceed, be blocked, or be escalated, along with the reasoning.

### Step 3: Human Approval
For actions exceeding autonomous thresholds, a human must review the request and recommendation. If authorized, the human (or their proxy system) generates an `ApprovalRecord`. This record is cryptographically signed, time-limited, and bound specifically to the `request_id`.

### Step 4: Controlled Execution
The execution gateway receives the approved request. It must verify:
1. The `ApprovalRecord` exists and its signature is valid.
2. The `ApprovalRecord` has not expired.
3. The `ApprovalRecord` has not been used previously (no replay attacks).
4. The parameters of the execution match the original `ActionRequest` exactly.

If all checks pass, the gateway executes the action and generates an `ExecutionRecord`.

### Step 5: Cryptographic Receipt
Immediately following execution, the system generates a `Receipt`. The receipt binds the IDs of the request, recommendation, approval, and execution into a single document. The receipt is canonicalized, hashed (`ledger_hash`), and cryptographically signed by the issuing system.

### Step 6: Audit Log
The signed receipt is appended to an immutable, append-only ledger. The receipt's `previous_hash` field must contain the `ledger_hash` of the immediately preceding receipt, creating a tamper-evident hash chain.

## 3. Core Invariants

Implementations of this protocol must guarantee the following invariants:

1. **No execution without approved request:** The execution gateway must fail-closed. If an approval is missing, invalid, or expired, execution must be blocked.
2. **No valid receipt without signed approval and execution record:** A receipt cannot be generated unless the full chain of prerequisite records exists and is valid.
3. **All high-risk actions must be provable:** Any third-party auditor must be able to take a receipt, verify its signature, recompute its hash, and trace the IDs back to the exact human who approved the action and the exact AI that recommended it.
