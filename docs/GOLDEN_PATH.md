# RIO Golden Path — Reference Flow

> **Status:** LOCKED  
> **Captured:** 2026-04-07T01:18 UTC  
> **Gateway:** v2.9.0  
> **Author:** Manny (ONE Agent)

This document records the canonical governed action flow. Nothing ships unless it matches this exact pipeline. Any future change to the system must still produce the same sequence of steps with valid artifacts at each stage.

---

## Pipeline Summary

| Step | Operation | Result |
|------|-----------|--------|
| 0 | Health Check | Gateway operational, Gmail configured |
| 1 | Login I-1 | Proposer + Root authenticated |
| 2 | Login I-2 | Approver authenticated |
| 3 | Submit Intent | `send_email` to rasmussenbr@hotmail.com |
| 4 | Govern | REQUIRE_HUMAN — risk HIGH, class send_new_contact |
| 5 | Authorize | I-2 approved (separation of duties enforced) |
| 6 | Execute | Gateway SMTP sent via gmail_smtp connector |
| 7 | Receipt | Cryptographic receipt generated with hash chain |
| 8 | Ledger | Entry written to hash-chained ledger |
| 9 | Delivery | Email arrived in recipient inbox |

---

## Proof Artifacts

### Intent

| Field | Value |
|-------|-------|
| Intent ID | `e69b071c-a7b7-4e3c-b8b3-cdf6b2ba6185` |
| Action | send_email |
| Recipient | rasmussenbr@hotmail.com |
| Status | submitted |
| Intent Hash | `6d61430baaec84b4bd0000fcaf85a6ae529245b336a3341bd59bedce90d57b18` |

### Governance

| Field | Value |
|-------|-------|
| Decision | REQUIRE_HUMAN |
| Risk Tier | HIGH |
| Matched Class | send_new_contact |
| Requires Approval | true |

### Authorization

| Field | Value |
|-------|-------|
| Proposer | I-1 (Brian Kent Rasmussen) — role: root_authority |
| Approver | I-2 (Brian, Approver) — role: approver |
| Separation of Duties | Enforced (proposer != approver) |
| Status | authorized |
| Authorization Hash | `1f0a61b319a53e2beefba935d49f2952bbb5d44dc38ded98a4e25cfbf82b5276` |

### Execution

| Field | Value |
|-------|-------|
| Connector | gmail_smtp |
| Status | sent |
| SMTP Message ID | `<a11f60f5-714d-bbc5-4c6a-74fcf890619e@gmail.com>` |
| Detail | Email sent to rasmussenbr@hotmail.com |

### Receipt

| Field | Value |
|-------|-------|
| Receipt ID | `58e43eee-6591-41cd-bc0c-6f95b395d085` |
| Receipt Hash | `f789b2ccad1bcd62b010d42bf4ba8af92e1048041f3a08b25b93096323cbaf2b` |
| Ledger Entry ID | `6f16be01-5042-4fae-add1-4e78cdcef66a` |
| Pipeline | complete |

---

## What This Proves

This single run demonstrates every property of the RIO governed execution architecture:

1. **Intent-driven.** The action was proposed as a structured intent, not executed directly.
2. **Risk-evaluated.** The policy engine classified it as HIGH risk, class `send_new_contact`, and required human approval.
3. **Separation of duties.** The proposer (I-1) and approver (I-2) are different principals with different roles. The Gateway enforced this.
4. **Authorization-gated.** Execution only proceeded after I-2 approved and the Gateway issued an authorization hash.
5. **Gateway-executed.** The email was sent by the Gateway itself via SMTP — not by ONE, not by a fallback, not by a second path.
6. **Receipted.** A cryptographic receipt was generated with a hash chain linking intent, governance, authorization, and execution.
7. **Ledgered.** The receipt was written to the hash-chained ledger with a verifiable entry ID.
8. **Delivered.** The email arrived in the recipient's inbox.

---

## Repeatability

This flow has been executed four times independently, all successful:

| Run | Intent ID | Receipt ID | Ledger Entry ID | Email |
|-----|-----------|------------|------------------|-------|
| Manny E2E | `0bcb0a0a` | `08ef1d38` | `53b860b7` | Delivered |
| Brian Live | `b11fdf17` | `73c26fef` | `82abe46c` | Delivered |
| Repeatability | `4ffef78a` | `560da8dc` | `11d30da5` | Delivered |
| Golden Path | `e69b071c` | `58e43eee` | `6f16be01` | Delivered |

---

## Verification Checklist

Any future change must still produce all of the following:

- [ ] Intent created with unique ID and hash
- [ ] Risk evaluated by policy engine
- [ ] Proposer != Approver enforced
- [ ] Approval recorded with authorization hash
- [ ] Execution only after authorization
- [ ] Gateway sends directly (no fallback, no second path)
- [ ] Receipt generated with hash chain
- [ ] Ledger entry written
- [ ] Email arrives in recipient inbox
- [ ] Pipeline status: `complete`

---

*This is the reference flow. It is locked.*
