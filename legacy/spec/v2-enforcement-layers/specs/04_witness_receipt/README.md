> Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

# 04 — Witness Receipt

**Source files:** `controlPlane.ts` (A6: WitnessReceipt, generateWitnessReceipt), `authorityLayer.ts` (CanonicalReceipt, generateCanonicalReceipt, receipt hash chaining)

---

## Purpose

The witness receipt is the tamper-evident proof that an action was proposed, verified, evaluated, approved, executed, and recorded. It links every artifact in the chain of custody into a single hash-bound record. The receipt is the system's answer to the question: "Prove it happened exactly this way."

---

## Schemas

All schemas are defined in [`schema.json`](./schema.json). The canonical types are:

| Schema | Source | Description |
|---|---|---|
| `WitnessReceipt` | controlPlane.ts A6 | Full chain-of-custody receipt with hash binding. |
| `ChainOfCustody` | controlPlane.ts | All artifacts that produced the receipt. |
| `ConnectorResult` | controlPlane.ts | Result of the connector (tool) execution. |
| `CanonicalReceipt` | authorityLayer.ts | Receipt with hash chaining to previous receipt. |

---

## WitnessReceipt Hash Computation

The `receipt_hash` covers the entire chain:

```
receipt_hash = SHA-256(canonical_json({
  receipt_id,
  intent_hash,
  verification_hash,
  decision_hash,
  approval_hash,
  execution_hash
}))
```

Each component hash is computed from its respective artifact:

| Hash Field | Computed From |
|---|---|
| `intent_hash` | `SHA-256(canonical_json(envelope))` — from verification |
| `verification_hash` | `SHA-256(canonical_json(verification))` |
| `decision_hash` | `SHA-256(canonical_json(governance))` |
| `approval_hash` | `SHA-256(canonical_json(approval))` or `null` if auto-approved |
| `execution_hash` | `SHA-256(canonical_json({token_id, result: connectorResult}))` |

---

## Chain of Custody

Every WitnessReceipt embeds the full chain of custody:

1. **envelope** — The original IntentEnvelope
2. **verification** — The VerificationResult
3. **governance** — The GovernanceDecision
4. **approval** — The ApprovalRecord (or null if auto-approved)
5. **execution_token** — The ExecutionToken used
6. **connector_result** — The result of the connector call

---

## CanonicalReceipt Hash Chaining

The authority layer's `CanonicalReceipt` adds hash chaining between receipts:

- First receipt: `previous_receipt_hash` = `"0000000000000000000000000000000000000000000000000000000000000000"` (64 hex zeros)
- Subsequent receipts: `previous_receipt_hash` = previous receipt's `receipt_hash`

This creates an append-only receipt chain independent of the ledger hash chain.

---

## CanonicalReceipt Required Fields

Every CanonicalReceipt MUST contain all of these fields:

| Field | Description |
|---|---|
| `receipt_id` | Unique receipt identifier |
| `intent_id` | The intent this receipt covers |
| `proposer_id` | Who proposed the action |
| `approver_id` | Who approved the action |
| `token_id` | The authorization token used |
| `action` | What action was executed |
| `status` | EXECUTED, FAILED, or REJECTED |
| `executor` | What system executed the action |
| `execution_hash` | Hash of the execution result |
| `policy_hash` | Hash of the policy in effect |
| `ledger_entry_id` | The ledger entry this receipt is recorded in |
| `receipt_hash` | Hash of this receipt |
| `gateway_signature` | Gateway's signature on this receipt |
| `timestamp_proposed` | When the intent was proposed |
| `timestamp_approved` | When the intent was approved |
| `timestamp_executed` | When the action was executed |
| `decision_delta_ms` | `timestamp_approved - timestamp_proposed` in milliseconds |
| `previous_receipt_hash` | Hash of the previous receipt (64 zeros for first) |

---

## Status Mapping

| WitnessReceipt Field | Logic |
|---|---|
| `verification_status` | `verification.verified ? "VERIFIED" : "FAILED"` |
| `outcome_status` | `connectorResult.success ? "SUCCESS" : "FAILURE"` |

`PARTIAL` is reserved for future use.

| CanonicalReceipt Field | Values |
|---|---|
| `status` | `"EXECUTED"`, `"FAILED"`, `"REJECTED"` |

---

## Approval Hash Nullability

`approval_hash` is `null` when the intent was auto-approved (LOW risk, governance decision = APPROVE). It is non-null when human approval was provided (MEDIUM or HIGH risk).

---

## Failure Conditions

| Condition | Result |
|---|---|
| Recomputed receipt_hash !== stored | Tamper detected. |
| receipt[i].previous_receipt_hash !== receipt[i-1].receipt_hash | Chain integrity violation. |
| Missing chain_of_custody field | Receipt is invalid. |
| Recomputed execution_hash !== stored | Connector result was modified. |
