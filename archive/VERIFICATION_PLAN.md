# RIO Verification Plan

## Purpose

To verify that no AI-initiated action can execute without human approval and that all actions are logged and receipted. This plan defines a set of structured tests that prove RIO enforces **fail-closed execution** — unauthorized execution is structurally prevented, not just discouraged.

Each test targets a specific attack vector or failure mode. A passing system must block execution in every scenario where valid, current, matching human approval is absent.

---

## Verification Scope

The verification plan covers three categories:

| Category | Description |
|---|---|
| **Authorization Enforcement** | Proves that execution requires valid human approval and that the system blocks all unauthorized attempts |
| **Integrity and Replay Protection** | Proves that approvals cannot be reused, forged, or tampered with after issuance |
| **Failure Mode Behavior** | Proves that the system fails closed when any dependency is unavailable or degraded |

---

## Test Definitions

### V-001: Execution Without Approval

**Objective:** Confirm that the execution gateway blocks any action that has not received human approval.

**Preconditions:** An intent is created and recorded. No approval has been issued.

**Procedure:**
1. Create an intent via the Intent Service.
2. Skip the approval step entirely.
3. Submit the intent directly to the Execution Gateway.

**Expected Result:**
- Server returns **HTTP 403 Forbidden**.
- Execution does not occur.
- A denial receipt is generated and written to the ledger.
- An audit log entry is created recording the blocked attempt.

**Verification Criteria:** The action must not execute under any circumstances. The system must produce a traceable record of the blocked attempt.

---

### V-002: Execution With Approval

**Objective:** Confirm that the full approved flow works end to end — intent, approval, signature, execution, receipt, and ledger entry.

**Preconditions:** None.

**Procedure:**
1. Create an intent via the Intent Service.
2. Submit the intent for human approval.
3. Human approves the action.
4. The Signature Service generates a cryptographic signature.
5. Submit the signed approval to the Execution Gateway.

**Expected Result:**
- Action executes successfully.
- A receipt is generated containing the intent ID, approval timestamp, execution timestamp, signature, and hash.
- A ledger entry is written with the receipt hash chained to the previous entry.
- An audit log entry records each step of the flow.

**Verification Criteria:** Every component in the chain must produce its expected output. The receipt must be independently verifiable using the signature and hash.

---

### V-003: Replay Attack (Reuse Approval)

**Objective:** Confirm that a previously used approval cannot be replayed to authorize a second execution.

**Preconditions:** An intent has been created, approved, executed, and receipted (V-002 completed successfully).

**Procedure:**
1. Capture the signed approval payload from the completed V-002 execution.
2. Submit the same signed approval payload to the Execution Gateway a second time.

**Expected Result:**
- Server returns **HTTP 403 Forbidden**.
- Execution does not occur.
- The system identifies the approval as already consumed.
- A denial receipt and audit log entry are created recording the replay attempt.

**Verification Criteria:** Each approval must be single-use. The system must track consumed approvals and reject any reuse.

---

### V-004: Payload Tampering After Approval

**Objective:** Confirm that modifying the action payload after approval invalidates the authorization.

**Preconditions:** An intent has been created and approved with a valid signature.

**Procedure:**
1. Create an intent and obtain human approval with a cryptographic signature.
2. Modify the action payload (e.g., change the email recipient, alter the amount, or change the action type).
3. Submit the modified payload with the original signature to the Execution Gateway.

**Expected Result:**
- Server returns **HTTP 403 Forbidden**.
- Execution does not occur.
- The system detects that the payload hash does not match the signed hash.
- A denial receipt and audit log entry are created recording the tampering attempt.

**Verification Criteria:** The signature must be bound to the exact payload that was approved. Any modification, no matter how small, must invalidate the authorization.

---

### V-005: Approval Revoked Before Execution

**Objective:** Confirm that revoking an approval before execution prevents the action from executing.

**Preconditions:** An intent has been created and approved, but not yet executed.

**Procedure:**
1. Create an intent and obtain human approval.
2. Before submitting to the Execution Gateway, revoke the approval.
3. Submit the original signed approval to the Execution Gateway.

**Expected Result:**
- Server returns **HTTP 403 Forbidden**.
- Execution does not occur.
- The system checks revocation status at execution time and finds the approval revoked.
- A denial receipt and audit log entry are created recording the revoked approval attempt.

**Verification Criteria:** Revocation must be checked at execution time, not just at approval time. The window between approval and execution must not create a gap in enforcement.

---

### V-006: Direct Executor Call (Bypass Attempt)

**Objective:** Confirm that the executor service cannot be called directly, bypassing the RIO control plane.

**Preconditions:** The executor service endpoint is known.

**Procedure:**
1. Attempt to call the executor service directly without going through the RIO control plane.
2. Attempt to call the executor with a fabricated service-to-service token.
3. Attempt to call the executor with a valid-looking but unsigned approval payload.

**Expected Result:**
- All three attempts are rejected.
- The executor returns an error or **HTTP 403** for each attempt.
- No action is executed.
- Audit log entries are created for each blocked attempt.

**Verification Criteria:** The executor must only accept requests that originate from the RIO control plane with valid service-to-service authentication and a verified approval. No other path to execution may exist.

---

### V-007: Invalid Signature

**Objective:** Confirm that an approval with an invalid or forged cryptographic signature is rejected.

**Preconditions:** An intent has been created.

**Procedure:**
1. Create an intent and generate a forged or corrupted signature (not produced by the Signature Service).
2. Submit the intent with the invalid signature to the Execution Gateway.

**Expected Result:**
- Server returns **HTTP 403 Forbidden**.
- Execution does not occur.
- The system detects the invalid signature during verification.
- A denial receipt and audit log entry are created recording the invalid signature attempt.

**Verification Criteria:** The Execution Gateway must independently verify every signature before authorizing execution. Forged, expired, malformed, or corrupted signatures must all be rejected.

---

### V-008: Ledger Unavailable (Fail-Closed)

**Objective:** Confirm that if the ledger service is unavailable, execution is blocked rather than proceeding without a record.

**Preconditions:** An intent has been created and approved with a valid signature.

**Procedure:**
1. Create an intent and obtain valid human approval.
2. Simulate ledger service unavailability (network failure, service down, timeout).
3. Submit the approved intent to the Execution Gateway.

**Expected Result:**
- Execution does **not** occur.
- The system detects that it cannot write to the ledger.
- The system fails closed — it refuses to execute rather than executing without a record.
- An error is logged indicating ledger unavailability and execution was blocked.

**Verification Criteria:** The system must never execute an action it cannot record. Ledger availability is a prerequisite for execution, not an optional post-step.

---

### V-009: Approval Service Unavailable (Fail-Closed)

**Objective:** Confirm that if the approval service is unavailable, execution is blocked rather than defaulting to an assumed approval.

**Preconditions:** An intent has been created.

**Procedure:**
1. Create an intent.
2. Simulate approval service unavailability (network failure, service down, timeout).
3. Attempt to submit the intent to the Execution Gateway.

**Expected Result:**
- Execution does **not** occur.
- The system does not assume approval, skip approval, or default to an open state.
- The system fails closed — no approval means no execution.
- An error is logged indicating approval service unavailability and execution was blocked.

**Verification Criteria:** The absence of an approval must be treated identically to a denial. The system must never infer, assume, or cache approval when the approval service is unreachable.

---

### V-010: Duplicate Execution Request (Idempotency)

**Objective:** Confirm that submitting the same approved intent for execution multiple times results in only one execution.

**Preconditions:** An intent has been created and approved with a valid signature.

**Procedure:**
1. Create an intent and obtain valid human approval.
2. Submit the approved intent to the Execution Gateway.
3. Immediately submit the same approved intent to the Execution Gateway again (race condition simulation).

**Expected Result:**
- The action executes exactly **once**.
- The second submission is rejected as a duplicate.
- Only one receipt is generated.
- Only one ledger entry is written.
- An audit log entry records the duplicate attempt.

**Verification Criteria:** The system must enforce idempotency at the execution layer. Each approved intent must map to exactly one execution, regardless of how many times the request is submitted.

---

## Summary

| Test ID | Description | Category | Expected Outcome |
|---|---|---|---|
| V-001 | Execution without approval | Authorization Enforcement | Blocked (HTTP 403) |
| V-002 | Execution with approval | Authorization Enforcement | Action executes successfully |
| V-003 | Replay attack (reuse approval) | Integrity and Replay Protection | Blocked |
| V-004 | Payload tampering after approval | Integrity and Replay Protection | Blocked |
| V-005 | Approval revoked before execution | Authorization Enforcement | Blocked |
| V-006 | Direct executor call (bypass) | Authorization Enforcement | Blocked |
| V-007 | Invalid signature | Integrity and Replay Protection | Blocked |
| V-008 | Ledger unavailable | Failure Mode Behavior | Blocked (fail-closed) |
| V-009 | Approval service unavailable | Failure Mode Behavior | Blocked (fail-closed) |
| V-010 | Duplicate execution request | Integrity and Replay Protection | Blocked (idempotency) |

---

## Conclusion

A system that passes all ten tests demonstrates that unauthorized execution is **structurally impossible** — not merely discouraged by policy, guidelines, or AI behavior. The RIO system enforces control at the server level, signs every decision cryptographically, and records every event in a tamper-evident ledger. If any component is unavailable, the system fails closed. If any approval is missing, invalid, consumed, revoked, or tampered with, execution is blocked.
