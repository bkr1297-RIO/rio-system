# RIO Threat Model

## Purpose

This document identifies the threats that a runtime AI authorization system must defend against and explains how RIO mitigates each one. The threat model is organized around a single principle: **execution without valid human approval must be structurally impossible, not merely discouraged.**

Every threat listed below represents a path an attacker, a compromised AI agent, or a system failure could exploit to cause unauthorized execution. For each threat, RIO provides a structural mitigation enforced at the server level — not through prompts, policies, or AI behavior.

---

## Threat Categories

| Category | Description |
|---|---|
| **Bypass Attempts** | Attempts to execute actions without going through the authorization flow |
| **Forged Approvals** | Attempts to fabricate or forge approval credentials |
| **Replay Attacks** | Attempts to reuse a previously valid approval for a new execution |
| **Payload Tampering** | Attempts to modify the action payload after approval has been granted |
| **Ledger Tampering** | Attempts to alter, delete, or falsify records in the audit ledger |
| **Revocation Race Conditions** | Attempts to exploit the time window between approval and execution |
| **System Failure Scenarios** | Behavior when critical system components become unavailable |

---

## Threat Analysis and Mitigations

### T-001: Bypass — Direct Executor Call

**Threat:** An attacker or compromised AI agent calls the executor service directly, bypassing the RIO control plane entirely. If the executor accepts the request, the action executes without any approval, signature, or ledger record.

**Risk Level:** Critical

**Mitigation:** The executor service sits behind a service boundary and only accepts requests from the RIO control plane. Authentication is enforced via a service-to-service token that is not available to external callers, AI agents, or frontend clients. The executor independently verifies that the request originated from RIO, that the referenced turn is in a VERIFIED state, and that the approval payload hash matches the signed payload. If any check fails, the executor refuses to act. Sensitive API keys (e.g., for email services, payment processors) exist only within the executor service and are never exposed to the AI agent or any other component.

**Verification Test:** V-006

---

### T-002: Bypass — Execution Without Approval

**Threat:** An AI agent or attacker submits an intent directly to the Execution Gateway without obtaining human approval. If the gateway does not enforce approval as a prerequisite, the action executes without authorization.

**Risk Level:** Critical

**Mitigation:** The Execution Gateway enforces a strict precondition: every execution request must include a valid, current, unconsumed cryptographic approval. The gateway checks approval status before any execution logic runs. If no approval is present, the gateway returns HTTP 403 and generates a denial receipt and ledger entry. This is a fail-closed design — the default state is "blocked."

**Verification Test:** V-001

---

### T-003: Forged Approval — Invalid Signature

**Threat:** An attacker fabricates an approval payload and generates a forged cryptographic signature, attempting to convince the Execution Gateway that human approval was granted when it was not.

**Risk Level:** Critical

**Mitigation:** The Signature Service uses cryptographic signing keys that are not accessible to any external party, AI agent, or frontend client. The Execution Gateway independently verifies every signature against the Signature Service's public key before authorizing execution. Forged, malformed, expired, or corrupted signatures are all rejected. The signing key is rotated on a defined schedule and is never transmitted outside the Signature Service boundary.

**Verification Test:** V-007

---

### T-004: Forged Approval — Fabricated Approval Record

**Threat:** An attacker inserts a fabricated approval record into the system's data store, making it appear that human approval was granted when it was not.

**Risk Level:** High

**Mitigation:** Approval records are written exclusively by the Human Authorization component and are cryptographically signed at creation time. The Execution Gateway does not trust the approval record alone — it verifies the cryptographic signature independently. A fabricated record without a valid signature is rejected. Additionally, the ledger's chained hash structure means that inserting a record retroactively would break the hash chain, making the fabrication detectable during any audit.

**Verification Test:** V-007 (signature verification), V-003 (ledger integrity)

---

### T-005: Replay Attack — Reuse of Consumed Approval

**Threat:** An attacker captures a valid, previously used approval and submits it again to authorize a second execution. If the system does not track consumed approvals, the same authorization could be used to execute the same or a different action multiple times.

**Risk Level:** High

**Mitigation:** Every approval is single-use. When an approval is consumed during execution, the system marks it as consumed in a persistent store. Subsequent submissions of the same approval are rejected. The Execution Gateway checks the consumed status before authorizing execution. The approval ID, intent ID, and signature are all bound together — an approval for one intent cannot be applied to a different intent.

**Verification Test:** V-003

---

### T-006: Replay Attack — Duplicate Execution Request

**Threat:** An attacker or a network condition causes the same approved execution request to be submitted multiple times in rapid succession. If the system does not enforce idempotency, the action could execute more than once.

**Risk Level:** High

**Mitigation:** The Execution Gateway enforces idempotency at the execution layer. Each approved intent maps to exactly one execution. The system uses the intent ID and approval ID as an idempotency key. The first valid submission triggers execution; all subsequent submissions of the same key are rejected as duplicates. Only one receipt and one ledger entry are generated per approved intent.

**Verification Test:** V-010

---

### T-007: Payload Tampering — Modification After Approval

**Threat:** An attacker intercepts the approved payload between the approval step and the execution step and modifies it — changing the email recipient, altering a financial amount, or substituting a different action entirely. If the system does not bind the signature to the exact payload, the modified action executes with the original approval.

**Risk Level:** Critical

**Mitigation:** The cryptographic signature is computed over the exact payload that was presented to the human for approval. The Execution Gateway recomputes the payload hash at execution time and compares it to the hash embedded in the signature. If the payload has been modified in any way — even a single character — the hashes will not match and execution is blocked. The signature is bound to the payload, not to the intent ID alone.

**Verification Test:** V-004

---

### T-008: Revocation Race Condition — Approval Revoked After Issuance

**Threat:** A human approves an action but then revokes the approval before execution occurs. If the system only checks approval status at approval time and not at execution time, the revoked approval could still authorize execution during the window between approval and execution.

**Risk Level:** High

**Mitigation:** The Execution Gateway checks approval status at execution time, not at approval time. Revocation is recorded immediately when the human revokes. When the execution request arrives, the gateway queries the current status of the approval. If the approval has been revoked, execution is blocked regardless of whether the signature is valid. The revocation check is performed as the final gate before execution, closing the race condition window.

**Verification Test:** V-005

---

### T-009: Ledger Tampering — Record Alteration

**Threat:** An attacker with database access modifies, deletes, or reorders ledger entries to hide evidence of unauthorized actions or to fabricate a false audit trail.

**Risk Level:** High

**Mitigation:** The ledger uses a chained hash structure. Each entry's hash is computed from the entry's data combined with the previous entry's hash. Modifying any entry causes all subsequent hashes to change, making the tampering immediately detectable during any audit or integrity check. The ledger is append-only — entries cannot be updated or deleted through the application layer. Periodic integrity checks verify the hash chain from the genesis entry to the most recent entry.

**Verification Approach:** Ledger integrity verification (referenced in VERIFICATION_PLAN.md, Test 3 in docs/reference/RIO_SYSTEM_OVERVIEW.md)

---

### T-010: System Failure — Ledger Service Unavailable

**Threat:** The ledger service becomes unavailable due to network failure, hardware failure, or overload. If the system proceeds with execution without writing a ledger entry, the action occurs without a record, violating the audit guarantee.

**Risk Level:** Critical

**Mitigation:** The system treats ledger availability as a prerequisite for execution, not an optional post-step. If the ledger service is unavailable, the Execution Gateway refuses to execute the action. The system fails closed — it chooses to block a legitimate action rather than execute an unrecorded one. An error is logged indicating that execution was blocked due to ledger unavailability. Execution can be retried once the ledger service is restored.

**Verification Test:** V-008

---

### T-011: System Failure — Approval Service Unavailable

**Threat:** The approval service becomes unavailable. If the system defaults to an open state — assuming approval, skipping the check, or using a cached approval — actions could execute without actual human authorization.

**Risk Level:** Critical

**Mitigation:** The system treats the absence of a verifiable approval identically to a denial. If the approval service is unavailable, the Execution Gateway cannot verify approval status and therefore blocks execution. The system does not assume, infer, cache, or default to approval. The fail-closed principle applies: no verification means no execution. An error is logged indicating that execution was blocked due to approval service unavailability.

**Verification Test:** V-009

---

### T-012: System Failure — Signature Service Unavailable

**Threat:** The Signature Service becomes unavailable. If the system cannot generate or verify signatures, it may either block all actions (acceptable) or skip signature verification (unacceptable).

**Risk Level:** High

**Mitigation:** If the Signature Service is unavailable, the system cannot produce a valid signature for new approvals and cannot verify signatures for pending executions. Both paths result in blocked execution. The system does not skip signature verification under any circumstances. This is consistent with the fail-closed principle applied across all components.

**Verification Approach:** Follows the same fail-closed pattern as V-008 and V-009.

---

## Threat Summary Matrix

| Threat ID | Threat | Risk Level | Mitigation | Verification |
|---|---|---|---|---|
| T-001 | Direct executor call (bypass) | Critical | Service boundary + service-to-service auth + independent verification | V-006 |
| T-002 | Execution without approval | Critical | Fail-closed gateway, HTTP 403, denial receipt | V-001 |
| T-003 | Forged signature | Critical | Cryptographic verification, key isolation | V-007 |
| T-004 | Fabricated approval record | High | Signature verification + chained ledger | V-007, V-003 |
| T-005 | Replay (reuse consumed approval) | High | Single-use approvals, consumed tracking | V-003 |
| T-006 | Duplicate execution | High | Idempotency enforcement | V-010 |
| T-007 | Payload tampering after approval | Critical | Signature bound to payload hash | V-004 |
| T-008 | Revocation race condition | High | Execution-time revocation check | V-005 |
| T-009 | Ledger tampering | High | Chained hash, append-only, integrity checks | Ledger audit |
| T-010 | Ledger service unavailable | Critical | Fail-closed (no record → no execution) | V-008 |
| T-011 | Approval service unavailable | Critical | Fail-closed (no approval → no execution) | V-009 |
| T-012 | Signature service unavailable | High | Fail-closed (no signature → no execution) | Fail-closed pattern |

---

## Design Principles

The threat model is grounded in four principles that apply uniformly across all threat categories:

**Fail-Closed by Default.** The system's default state is "execution blocked." Every component must explicitly authorize its part of the chain. If any component is missing, unavailable, or returns an unexpected result, execution does not proceed.

**Server-Side Enforcement.** All authorization checks are enforced on the backend server. The frontend UI is a convenience layer for human interaction — it is not a security boundary. An attacker who bypasses the frontend still faces the same server-side enforcement.

**Cryptographic Binding.** Approvals are not just database flags. They are cryptographically signed artifacts bound to a specific payload, a specific intent, and a specific moment in time. Signatures are verified independently at execution time.

**Tamper-Evident Recording.** Every decision and action is recorded in a chained-hash ledger. The ledger does not prevent tampering — it makes tampering **detectable**. Any modification to any record breaks the hash chain and is visible during audit.

---

## Conclusion

RIO's threat model is designed around the assumption that every component outside the server-side control plane is potentially compromised — including the AI agent, the network, and the frontend. The system does not trust behavior, policy, or guidelines to prevent unauthorized execution. It enforces control structurally, signs every decision cryptographically, records every event in a tamper-evident ledger, and fails closed when any dependency is unavailable.
