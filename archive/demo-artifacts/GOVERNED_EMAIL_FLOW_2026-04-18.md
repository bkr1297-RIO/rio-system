# Governed Email Flow — Full Evidence

**Date:** April 18, 2026
**System:** RIO Governed Execution Proxy
**Action:** `send_email` via Gmail SMTP
**Recipient:** RasmussenBR@hotmail.com

---

## Email Details

| Field | Value |
|-------|-------|
| **To** | RasmussenBR@hotmail.com |
| **Subject** | Phase 1 complete |
| **Body** | I'm excited to work with this kick-ass builder named Manny and grammar professor Bondi. |
| **Delivery** | Gmail SMTP (real external delivery) |
| **From** | RIO Governed Proxy \<riomethod5@gmail.com\> |

---

## Full Governed Flow

### Step 1: INTENT — Proposer Creates Action Request

Brian (PRI-DEMO-1) submits a `send_email` intent through the RIO governance engine. The system evaluates risk and classifies the action as **HIGH** because email delivery is irreversible and targets an external recipient. The intent enters `PENDING_APPROVAL` status, requiring a separate identity to authorize execution.

| Field | Value |
|-------|-------|
| **Intent ID** | `INT-DEMO-1` |
| **Tool** | `send_email` |
| **Risk Tier** | HIGH |
| **Status** | PENDING_APPROVAL |
| **Args Hash** | `7742ddcb6f620775...` |
| **Break Analysis** | Email will be sent to an external recipient. Cannot be unsent once delivered. Content is personal and non-sensitive. |
| **Proposer** | PRI-DEMO-1 (Brian) |

> **Governance rule enforced:** Break analysis is required for HIGH risk intents. The proposer must articulate what could go wrong before the system accepts the intent.

---

### Step 2: APPROVAL — Separate Identity Authorizes

Manny (PRI-DEMO-2), a different identity from the proposer, reviews and approves the intent. The system verifies **constrained delegation** — the approver identity is different from the proposer identity. An **authorization token** is issued, which is the machine-verifiable artifact that gates execution.

| Field | Value |
|-------|-------|
| **Approval ID** | `APR-DEMO-1` |
| **Decision** | APPROVED |
| **Approver** | PRI-DEMO-2 (Manny) |
| **Role Separation** | `separated` (Proposer ≠ Approver) |
| **Token ID** | `ATOK-a96abb48b59a45d7` |
| **Token tool_name** | `send_email` |
| **Token args_hash** | `f8f0b527ce59619d...` |
| **Token expires** | 2026-04-18T10:08:57.868Z |
| **Max Executions** | 1 (single-use) |

> **Governance rule enforced:** Proposer (PRI-DEMO-1) ≠ Approver (PRI-DEMO-2). The system blocks self-approval for HIGH risk actions. No token = no execution.

---

### Step 3: EXECUTION — Token-Gated Connector Dispatch

Brian executes the approved intent by presenting the authorization token. The system runs **18 preflight checks** — all pass. The `send_email` connector dispatches via Gmail SMTP, delivering the real email to the external recipient. After successful execution, the authorization token is **burned** (permanently invalidated, single-use enforcement).

| Field | Value |
|-------|-------|
| **Execution ID** | `EXE-DEMO-1` |
| **Connector** | `send_email` → Gmail SMTP |
| **Delivery Mode** | `gmail` |
| **Delivery Status** | SENT |
| **Gmail Message ID** | `<6ebcec43-0cab-94b0-8a56-9f3962a805b3@gmail.com>` |
| **Preflight Checks** | 18 checks — ALL PASS |
| **Token Burned** | true |

**Preflight checks include:**

1. `proxy_active` — PASS
2. `not_already_executed` — PASS
3. `tool_registered` — PASS
4. `risk_tier_check` — PASS
5. `approval_exists` — PASS
6. `approval_not_expired` — PASS
7. `execution_limit` — PASS
8. `args_hash_match` — PASS
9. `authorization_token_exists` — PASS
10. `token_not_expired` — PASS
11. `token_not_revoked` — PASS
12. `token_action_match` — PASS
13. `token_args_match` — PASS
14. `token_execution_limit` — PASS
15. `token_kill_switch` — PASS
16. `token_policy_active` — PASS
17. `token_signature_valid` — PASS
18. `proposer_not_approver` — PASS (PRI-DEMO-1 ≠ PRI-DEMO-2)

> **Governance rule enforced:** Fail-closed — if any single check fails, execution is blocked. The token is burned after execution so it cannot be replayed.

---

### Step 4: RECEIPT — Cryptographic Proof of Governed Action

The system generates a **canonical receipt** — a cryptographically signed proof that the action was proposed, approved by a separate identity, executed through the governance engine, and recorded in the immutable ledger. This receipt satisfies all 13 points of the governed action definition.

| Field | Value |
|-------|-------|
| **Receipt ID** | `RCPT-7979071560094939` |
| **Intent ID** | `INT-DEMO-1` |
| **Proposer ID** | `PRI-DEMO-1` |
| **Approver ID** | `PRI-DEMO-2` |
| **Token ID** | `ATOK-a96abb48b59a45d7` |
| **Policy Hash** | `62c3138783d7faed...` |
| **Execution Hash** | `23006ba42b081f8c...` |
| **Receipt Hash** | `d0afb6b56f1cff6b...` |
| **Previous Receipt Hash** | `0000000000000000...` (genesis) |
| **Ledger Entry ID** | `LED-DEMO-8` |
| **Gateway Signature** | `b0c46a1e2ea2a0d7...` |
| **Status** | SUCCESS |
| **Decision Delta** | 53ms |

> **13-Point Governed Action — ALL SATISFIED:**
> 1. Intent created
> 2. Risk evaluated (HIGH)
> 3. Proposer ≠ Approver
> 4. Approval recorded
> 5. Authorization token issued
> 6. Token validated before execution
> 7. Token burned after execution
> 8. Execution performed
> 9. Receipt generated
> 10. Receipt includes: intent_id, approver_id, token_id, policy_hash, execution_result, receipt_hash, previous_receipt_hash, ledger_entry_id
> 11. Receipt signed by Gateway
> 12. Receipt hash written to ledger
> 13. Ledger hash chain verifies

---

### Step 5: LEDGER — Immutable Hash-Chained Audit Trail

The ledger contains 9 entries for this governed action, forming a hash chain from GENESIS through all governance events. Each entry's hash incorporates the previous entry's hash, creating a tamper-evident chain.

| Entry | Type | Entry ID | Hash (prefix) | Previous Hash (prefix) |
|-------|------|----------|---------------|----------------------|
| 1 | ONBOARD | LED-DEMO-1 | `c77001c107dd` | `GENESIS` |
| 2 | INTENT | LED-DEMO-2 | `a304f1167bb2` | `c77001c107dd` |
| 3 | APPROVAL | LED-DEMO-3 | `0c027f5011ad` | `a304f1167bb2` |
| 4 | AUTHORITY_TOKEN | LED-DEMO-4 | `8fa48bca3479` | `0c027f5011ad` |
| 5 | WAL_PREPARED | LED-DEMO-5 | `1cfdcd8ae684` | `8fa48bca3479` |
| 6 | FIREWALL_SCAN | LED-DEMO-6 | `8430b3f2dbb4` | `1cfdcd8ae684` |
| 7 | ACTION_COMPLETE | LED-DEMO-7 | `b2593a41d32f` | `8430b3f2dbb4` |
| 8 | EXECUTION | LED-DEMO-8 | `b27caef1883a` | `b2593a41d32f` |
| 9 | WAL_COMMITTED | LED-DEMO-9 | `1427f3ade271` | `b27caef1883a` |

> **Hash chain integrity: VERIFIED.** Each entry's `prevHash` matches the preceding entry's `hash`. The chain is unbroken from GENESIS through WAL_COMMITTED.

---

## Test Results

All 7 test steps passed:

```
✓ Step 0: Onboard Brian (proposer)
✓ Step 1: INTENT — Brian creates send_email intent
✓ Step 2: APPROVAL — Manny (different identity) approves
✓ Step 3: EXECUTION — Brian executes with authorization token (Gmail SMTP delivery) [6574ms]
✓ Step 4: RECEIPT — Verify canonical receipt fields
✓ Step 5: LEDGER — Verify hash chain contains all governance entries
✓ Step 6: SUMMARY — Full governed email flow evidence

Test Files  1 passed (1)
     Tests  7 passed (7)
  Duration  8.54s
```

---

## Invariant

> **Receipt ≠ Authorization — ENFORCED**
>
> The receipt proves what happened. The token authorized what could happen. They are separate artifacts. The token is burned. The receipt is permanent.
