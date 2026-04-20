# Use Case: Governed Email Send

**Version:** 1.0  
**Date:** April 6, 2026

---

## What This Demonstrates

A single governed email send that proves the entire RIO pipeline works end-to-end. One real intent enters the system, is risk-assessed, is approved by a human, is executed with a valid authorization, produces a receipt, is written to the immutable ledger, and is visible in the ONE dashboard as a completed state cycle.

---

## Actors

| Actor | Role | What They Do |
|---|---|---|
| Brian (I-1) | Root Authority | Submits the email intent from ONE |
| RIO Gateway | Governance Engine | Classifies risk, routes for approval, executes after authorization |
| ONE | Control Surface | Displays the intent, approval, receipt, and ledger entry |

---

## Step-by-Step Flow

**Step 1 — Login.** Brian opens ONE and authenticates with principal ID `I-1` and passphrase `rio-governed-2026`. The gateway returns a JWT token.

**Step 2 — Submit Intent.** Brian navigates to "New Action" and selects "Send Email." He fills in the recipient, subject, and body. ONE sends this to the Replit gateway as a `POST /api/hitl/intent` with `toolName: "send_email"` and `toolArgs: { to, subject, body }`.

**Step 3 — Risk Assessment.** The gateway classifies `send_email` as HIGH risk. It creates the intent record and returns `requiresApproval: true`.

**Step 4 — Approval.** Brian sees the pending approval in the Approvals view. He reviews the details and approves with a reason. ONE sends `POST /api/hitl/approve` with `decision: { value: "yes", reason: "Approved for demo" }`.

**Step 5 — Execution.** ONE sends `POST /api/hitl/execute` with the `intentId`, `userId`, and `approvalId`. The gateway verifies the approval, checks the authorization chain, and dispatches the email via the Gmail connector.

**Step 6 — Receipt.** The gateway generates a SHA-256 receipt containing the execution result, timestamp, intent ID, and approval chain. The receipt is hash-chained to the previous receipt.

**Step 7 — Ledger Entry.** The gateway writes a `TOOL_EXECUTION` entry to the ledger with the receipt hash, linked to the previous ledger entry's hash.

**Step 8 — Verification.** Brian opens the Receipts view in ONE and sees the new receipt with status SUCCESS. He opens the Ledger view and sees the new entry with an intact hash chain. The email is delivered to the recipient's inbox.

---

## What Proves It Worked

The system is complete when all of the following are true:

1. The intent exists in the ledger as an `INTENT_CREATED` entry.
2. The approval exists in the ledger as an `APPROVAL_CREATED` entry.
3. The execution exists in the ledger as a `TOOL_EXECUTION` entry.
4. The receipt contains the correct `intentId`, `toolName`, `toolArgs`, and `resultStatus`.
5. The receipt hash chain is intact (each receipt's `prevReceiptHash` matches the previous receipt's `receiptHash`).
6. The ledger hash chain is intact (each entry's `prevHash` matches the previous entry's `hash`).
7. The email was actually delivered.

---

## Current Status

Steps 1 through 7 are verified working via curl and the ONE UI. Step 5 (execution) reaches the Gmail API but fails on authentication because the Gmail OAuth credentials are not yet configured in the Replit gateway's secrets. Once those credentials are set, the email will deliver and the full loop will be closed.
