# Directive: The First Real Platform Slice

**Target:** Andrew, Manny, Romney, Damon
**Date:** 2026-04-04
**Status:** Active

## The Objective

Today we are not building the whole system. We are building one governed action with two humans, enforced by the Gateway, with a receipt and a ledger entry. When that works, the platform is real.

**The Use Case:** Governed Email Send

## The Flow

1. **User A (Proposer)** → Creates intent
2. **User B (Approver)** → Approves intent
3. **Gateway (Executor)** → Executes email send
4. **System** → Generates receipt
5. **System** → Writes ledger entry

## Team Assignments

### 1. Andrew (Architect) — Minimum Spec
Define only what is necessary for this slice. No giant specs.
- **Identity Model:** `principals` table (id, email, actor_type, role, public_key, key_version, status, created_at)
- **Intent Model:** `intents` table (id, created_by, action_type, payload, risk_level, status, created_at)
- **Approval Model:** `approvals` table (id, intent_id, approver_id, decision, timestamp, signature)

### 2. Manny (Builder) — Gateway Enforcement
These endpoints must exist in `rio-system/gateway/` and enforce the rules:
- `POST /intents` (Requires: proposer)
- `POST /approvals/:intent_id` (Requires: approver. Rule: proposer ≠ approver)
- `POST /execute/:intent_id` (Requires: executor. Rule: must be approved)

**Hard Enforcement Rules:**
- Proposer cannot approve
- Approver cannot execute
- Cannot execute without approval
- All actions produce receipt
- All receipts go to ledger

### 3. Manny (Builder) — ONE Interface
ONE only needs 3 screens. It does not enforce anything. It just calls Gateway APIs.
- Login (Google OAuth)
- Create Intent (Form to propose email)
- Approvals (List of pending approvals)

### 4. Romney (Protocol) — Receipt & Ledger
When execution happens, the receipt must include:
- `intent_hash`
- `approval_hash`
- `execution_hash`
- `signer_id`
- `role_exercised`
- `timestamp`
- `previous_ledger_hash`

Ledger entry = `hash(receipt + previous_ledger_entry)`

## The Test (Definition of Done)

**Scenario:**
1. Brian (proposer) logs in, creates intent: "Send email to test@example.com"
2. Person 2 (approver) logs in, sees pending approval, clicks approve
3. Gateway executes email, generates receipt, writes ledger entry

**Verification Checklist:**
- [ ] Intent record exists
- [ ] Approval record exists
- [ ] Execution record exists
- [ ] Receipt exists
- [ ] Ledger entry exists
- [ ] Receipt verifies

If all six exist, we have a governed execution platform.
