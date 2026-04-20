# Conformance Audit: threePowers.ts vs RIO-SPEC-TPS-001

**Date:** 2026-03-31
**Auditor:** Manny (Manus Agent)
**Spec:** THREE_POWER_SEPARATION.md v1.0 by Romney
**Implementation:** server/threePowers.ts

---

## Separation Matrix Conformance

Romney's spec defines a 14-row resource access matrix (Section 7). Below is the mapping:

| Resource | Spec: Observer | Impl: Observer | Spec: Governor | Impl: Governor | Spec: Executor | Impl: Executor | Status |
|----------|---------------|----------------|----------------|----------------|----------------|----------------|--------|
| Raw intent data | Read | canRead=true | — | canRead=false | — | canRead=false | PASS |
| Normalized intent | Write | canSendSignals=true | Read | receives via queue | Read (auth only) | receives via queue | PASS |
| Constitution | — | N/A | Read | N/A (policy inline) | — | N/A | PASS (advisory) |
| Policy | — | N/A | Read | policyVersion param | — | N/A | PASS |
| Role definitions | — | N/A | Read | N/A | — | N/A | PASS (advisory) |
| Governance decisions | — | N/A | Write | makeDecision() | Read | receiveApproval() | PASS |
| Execution tokens | — | N/A | — | N/A | Read/Burn | single-use via queue | PASS |
| External API keys | — | canExecute=false | — | canExecute=false | Read | connector param | PASS |
| OAuth tokens | — | N/A | — | N/A | Read | connector param | PASS |
| Connectors | — | execute() throws | — | execute() throws | Execute | executeAction() | PASS |
| Ledger | Append | canWriteLedger=false | Append | canWriteLedger=false | Append | canWriteLedger=true | GAP |
| Receipts | — | N/A | — | N/A | Generate | receipt_hash in result | PASS |
| Kill switch | — | N/A | — | N/A | Execute | N/A | GAP |
| Signer registry | — | N/A | — | N/A | Read (verify) | verifyApproval() | PASS |

### GAP 1: Ledger Append Permissions

Romney's spec says ALL THREE powers can append to the ledger. Our implementation only allows Executor (canWriteLedger=true). Observer and Governor have canWriteLedger=false.

**Fix:** Add canWriteLedger=true to Observer and Governor, or add a separate canAppendLedger permission. The spec says Observer appends "submit" entries and Governor appends "governance decision" entries.

### GAP 2: Kill Switch

Romney's spec defines a kill switch (Section 6) with dual-factor auth (JWT + Ed25519), < 1 second latency, and specific actions (burn all tokens, pause proxy, log KILL_PROXY receipt). Our threePowers.ts does not implement the kill switch. It exists in routers.ts as a separate procedure but is not wired through the three-power architecture.

**Fix:** Add killSwitch method to Executor class, or create a separate KillSwitch module that operates outside the normal pipeline (as spec says: "exists outside the normal pipeline").

---

## Fail-Closed Invariants (Section 4)

| Invariant | Spec | Implementation | Status |
|-----------|------|----------------|--------|
| No execution without authorization | Executor checks status=authorized | verifyApproval() before executeAction() | PASS |
| No authorization without governance | Authorize checks status=governed | Governor receives signal before deciding | PASS |
| No governance without observation | Govern checks status=submitted | Observer sends signal before Governor receives | PASS |
| Single-use execution tokens | Token burned on use, re-use returns 409 | Queue dequeue marks processedAt (single-use) | PASS |
| Ed25519 signature required | Unsigned returns 400 | verifyApprovalSignature() blocks unsigned | PASS |
| Human final authority | REQUIRE_HUMAN blocks until signed | humanDecision param required | PASS |
| Kill switch overrides all | POST /api/kill burns all tokens | NOT IMPLEMENTED in threePowers.ts | GAP |

---

## Identity Binding (Section 5)

| Requirement | Spec | Implementation | Status |
|-------------|------|----------------|--------|
| Ed25519 keypair generation | POST /api/signers/generate-keypair | generateComponentKeys() | PASS |
| Public key registration | POST /api/signers/register | Governor constructor takes keys | PASS |
| Signature verification | Verify against registered key | verifyApprovalSignature() | PASS |
| Signer revocation | DELETE /api/signers/:signer_id | NOT IMPLEMENTED | GAP |
| Canonical JSON signing | Keys sorted alphabetically | canonicalJson() sorts keys | PASS |
| Receipt identity_binding block | signer_id, public_key, payload_hash, method | NOT IN ExecutorResult | GAP |

### GAP 3: Signer Revocation

No revocation mechanism in threePowers.ts. The spec requires the ability to mark a signer as revoked and reject future signatures from that key.

### GAP 4: Receipt identity_binding

Romney's Receipt Spec v2.1 requires an `identity_binding` block on every receipt:
```json
{
  "signer_id": "...",
  "public_key_hex": "...",
  "signature_payload_hash": "...",
  "verification_method": "ed25519"
}
```
Our ExecutorResult does not include this. The approval_signature is present but not structured as identity_binding.

---

## Receipt Spec v2.1 Conformance

| Field | Spec v2.1 | Our Implementation | Status |
|-------|-----------|-------------------|--------|
| receipt_id | UUID | result_id (nanoid) | PARTIAL (format differs) |
| receipt_type | governed_action/kill_switch/onboard/system | NOT PRESENT | GAP |
| ingestion.source | api/email/sms/webhook/frontend/service_bus | NOT PRESENT | GAP |
| ingestion.channel | endpoint path | NOT PRESENT | GAP |
| ingestion.source_message_id | original message ID | NOT PRESENT | GAP |
| ingestion.timestamp | ISO 8601 | NOT PRESENT | GAP |
| identity_binding.signer_id | registered signer ID | NOT PRESENT | GAP |
| identity_binding.public_key_hex | Ed25519 public key | governor_public_key (in approval, not receipt) | GAP |
| identity_binding.signature_payload_hash | SHA-256 of signed payload | NOT PRESENT | GAP |
| identity_binding.verification_method | ed25519 | NOT PRESENT | GAP |
| hash_chain.intent_hash | SHA-256 | intent_hash (present) | PASS |
| hash_chain.governance_hash | SHA-256 | NOT PRESENT (signal_hash in ObserverSignal) | GAP |
| hash_chain.authorization_hash | SHA-256 | NOT PRESENT | GAP |
| hash_chain.execution_hash | SHA-256 | NOT PRESENT | GAP |
| hash_chain.receipt_hash | SHA-256 | receipt_hash (present) | PASS |
| ledger_hash | SHA-256 | current_hash in ledger_entry | PASS |
| previous_hash | SHA-256 or GENESIS | prev_hash in ledger_entry | PASS |

---

## MANTIS_COMPONENT.md Conformance

| Requirement | Spec | Implementation | Status |
|-------------|------|----------------|--------|
| Intent reception from any source | Accept from API, email, Service Bus, frontend, webhook | assessRisk() accepts any intent | PASS |
| Format normalization to IntentEnvelope | Normalize to canonical format | ObserverSignal is the normalized output | PASS |
| Metadata attachment | ingestion_source, ingestion_timestamp, source_channel, request_id | NOT PRESENT in ObserverSignal | GAP |
| Advisory risk classification | Non-binding risk assessment | recommendation field (advisory) | PASS |
| Replay prevention | Validate timestamp + nonce | NOT IMPLEMENTED in Observer class | GAP |
| Ledger logging of submit entry | Append submit entry for every received intent | canWriteLedger=false (contradicts spec) | GAP |
| Cannot approve or deny | No access to governance functions | approve() throws POWER_VIOLATION | PASS |
| Cannot modify intent after normalization | Intent immutable once assigned ID | No mutation methods | PASS |
| Cannot access execution connectors | No imports from execution modules | execute() throws POWER_VIOLATION | PASS |
| Cannot hold API keys or OAuth tokens | Keys only in Executor | No key storage in Observer | PASS |

---

## Summary of Gaps (Priority Order)

1. **Receipt identity_binding** — Add signer_id, public_key_hex, signature_payload_hash, verification_method to ExecutorResult
2. **Receipt ingestion provenance** — Add source, channel, source_message_id, timestamp to receipt
3. **Receipt type** — Add receipt_type enum (governed_action, kill_switch, onboard, system)
4. **Full hash_chain** — Add governance_hash, authorization_hash, execution_hash to receipt
5. **Observer ledger append** — Allow Observer to write "submit" entries to ledger
6. **Governor ledger append** — Allow Governor to write "governance decision" entries to ledger
7. **Observer ingestion metadata** — Add ingestion source/channel/timestamp to ObserverSignal
8. **Observer replay prevention** — Add nonce/timestamp validation
9. **Signer revocation** — Add ability to revoke a signer key
10. **Kill switch in three-power architecture** — Wire existing kill switch through the power separation model
