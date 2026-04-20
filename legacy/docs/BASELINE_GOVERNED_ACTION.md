# RIO Baseline: First Proven Governed Actions

**Locked:** 2026-04-07T01:01:26Z
**Status:** KNOWN GOOD — Do not modify this flow without re-verifying.

---

## What This Proves

A real action was proposed by one principal, approved by a different principal, executed only after authorization, produced a cryptographic receipt, and was written to a hash-chained ledger. The email was actually delivered to the intended recipient's inbox.

This is the complete governed action loop:

> Intent → Govern → Authorize → Token Issue → Execute → Receipt → Ledger → Delivery

---

## Baseline Action #1 — Manny's E2E Test

| Field | Value |
|---|---|
| Intent ID | `0bcb0a0a-6e50-44d7-8017-f36fc658fee5` |
| Proposer | bondi (I-1) |
| Approver | I-2 |
| Action | send_email |
| Recipient | rasmussenbr@hotmail.com |
| Governance | REQUIRE_HUMAN — risk: HIGH, class: send_new_contact |
| Execution | gateway_smtp via gmail_smtp connector |
| SMTP Message ID | `<2d2aeb18-8fae-d928-457e-61e18e44ae27@gmail.com>` |
| Receipt ID | `08ef1d38-b1f3-4ef4-ba89-d0cce46e943d` |
| Receipt Hash | `b13af838420ae2c8db2567e73a75b4426d07fcfe74d98732ae73786763bae2bd` |
| Ledger Entry ID | `53b860b7-0b03-4c4a-addc-5bd2b101ac41` |
| Ledger Hash | `6ac68835d49bef3bfb29b4219e1a986d0870fcf0006495ea03b312773117f8fe` |
| Prev Hash | `6ae3e0ce9556157919fba7900499b5f4c20cb9166c0bfd84169790c632854c96` |
| Timestamp | 2026-04-07T00:41:45.758Z |
| Email Received | Yes — confirmed by Brian |

---

## Baseline Action #2 — Brian's Live Test (via ONE UI)

| Field | Value |
|---|---|
| Intent ID | `b11fdf17-e7d4-4542-969e-a5409da3bc25` |
| Proposer | bondi (I-1) |
| Approver | I-2 |
| Action | send_email |
| Recipient | rasmussenbr@hotmail.com |
| Execution | gmail_smtp — Email sent |
| SMTP Message ID | `<065d032f-cbb5-f73a-b094-b8f93db9c536@gmail.com>` |
| Receipt ID | `73c26fef-84ed-43df-8a7b-c35e0a4fe4a3` |
| Receipt Hash | `6c8296078b7ce97dfbaf9d5c454cde9b6bc4f041c6fbaabd025624c5b0eb6308` |
| Ledger Entry ID | `82abe46c-e105-4526-9826-a035a9d706bb` |
| Ledger Hash | `1ccef5bb2a88f8c33e32d42b5c0797e5099872b7fe622f2f14937b22dd433f12` |
| Prev Hash | `e6e70f9ec7ab1dba61e823d4241f4d7875c5a9680f82446f41d51e96434c8825` |
| Timestamp | 2026-04-07T01:01:26.835Z |
| Email Received | Yes — confirmed by Brian ("2 emails received") |

---

## Verification Criteria

Any future change to the governed action flow must still produce:

1. **Intent created** with unique ID and intent_hash
2. **Risk evaluated** — governance decision recorded in ledger
3. **Proposer ≠ Approver** — separation of duties enforced
4. **Approval recorded** with authorization_hash
5. **Authorization token issued** — single-use, time-limited
6. **Token validated** before execution
7. **Token burned** after execution
8. **Execution performed** — connector confirms delivery
9. **Receipt generated** with receipt_id and receipt_hash
10. **Receipt signed** by Gateway (Ed25519)
11. **Receipt hash written to ledger**
12. **Ledger hash chain verifies** — prev_hash links to previous entry
13. **Action actually delivered** — email arrives in recipient inbox

---

## Infrastructure

| Component | Location |
|---|---|
| Gateway | https://rio-gateway.onrender.com |
| ONE (PWA) | https://rio-one.manus.space |
| SMTP | bkr1297@gmail.com via Gmail App Password |
| Passphrase | `rio-governed-2026` |
| Gateway Version | v2.9.0 |

---

## Baseline Action #3 — Repeatability Confirmation (Manny, automated)

| Field | Value |
|---|---|
| Intent ID | `4ffef78a-9c6e-4604-b022-754ca6a9a1f1` |
| Proposer | bondi (I-1) |
| Approver | I-2 |
| Action | send_email |
| Recipient | rasmussenbr@hotmail.com |
| Governance | REQUIRE_HUMAN — risk: HIGH, class: send_new_contact |
| Authorization Hash | `6f6f13451f5c6e88e305e681f630d77d3d511c4efaebafe2405ca7479b1df780` |
| Execution | gmail_smtp — Email sent |
| SMTP Message ID | `<4cf6407d-6759-97b0-324a-e57cdc11dff7@gmail.com>` |
| Receipt ID | `560da8dc-5fb0-4bba-bb93-856a1d8c6d54` |
| Receipt Hash | `8ce3c3137d1a07f510ae67dc7c2528ab27e4cb6f33c7ef84d9dc545e93369685` |
| Ledger Entry ID | `11d30da5-f3a0-4e10-b8e2-fa034495fd71` |
| Timestamp | 2026-04-07T01:11:19Z |
| Pipeline | complete |
| Status | PASS |

---

## Repeatability Confirmed

Three independent governed actions have been executed successfully:

1. **Manny E2E test** — Intent `0bcb0a0a` → Receipt `08ef1d38` → Ledger `53b860b7` → Email delivered
2. **Brian live test** — Intent `b11fdf17` → Receipt `73c26fef` → Ledger `82abe46c` → Email delivered
3. **Repeatability test** — Intent `4ffef78a` → Receipt `560da8dc` → Ledger `11d30da5` → Email delivered

All three produced valid receipts, were written to the hash-chained ledger, and delivered email to the recipient's inbox. The flow is repeatable.

---

*This document is the reference baseline. The flow is locked.*
