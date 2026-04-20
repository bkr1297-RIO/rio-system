# RIO-CS-04: Execution Boundary Protocol

**Version:** 1.0
**Status:** Normative
**Date:** April 2026
**Scope:** Gate enforcement, adapter pattern, credential isolation, phase ordering

---

## 1. Purpose

This protocol defines the execution boundary — the single enforcement point through which all real-world side effects MUST pass. The boundary is implemented as a Gate that validates authorization tokens and delegates execution to domain-specific Adapters. No code path from intent to execution may bypass this boundary.

---

## 2. Definitions

| Term | Meaning |
|------|---------|
| **Execution Gate** | The enforcement function that validates an authorization token before permitting any side effect. |
| **Adapter** | A domain-specific module that contains execution capability (credentials, API calls, side effects) behind the Gate. |
| **PhaseTracker** | A module-private state machine that enforces the ordering of execution phases. |
| **Side Effect** | Any action that modifies state outside the RIO system: sending email, writing files, calling external APIs, transferring funds. |
| **Pending Record** | A durable log entry written BEFORE execution begins, proving intent to execute. |

---

## 3. Gate Enforcement

3.1. The Gate MUST validate the authorization token by calling the token validation function defined in RIO-CS-03.

3.2. If any token validation check fails, the Gate MUST:
- Deny execution.
- Write a ledger entry recording the denial with the specific denial reason(s).
- Never invoke the adapter's execution function.

3.3. The Gate MUST be the sole entry point to execution capability. No adapter method, connector, or transport may be invoked without passing through the Gate.

3.4. The Gate is fail-closed. The default state is deny. Execution is structurally blocked unless every validation check passes.

---

## 4. Adapter Pattern

4.1. All execution capability MUST be physically contained inside adapters.

4.2. Each adapter MUST expose exactly one public method. All internal functions (perform, verify, write receipt) MUST be module-private and unreachable from outside the module.

4.3. The adapter's public surface:

| Component | Visibility | Requirement |
|-----------|-----------|-------------|
| Public execution method (e.g., `sendEmail()`) | PUBLIC | The only entry point. Calls Gate first. |
| `perform()` | PRIVATE | Module-scoped. Contains the actual side effect. |
| `verify()` | PRIVATE | Module-scoped. Validates output matches proposal. |
| `writeReceipt()` | PRIVATE | Module-scoped. Produces the cryptographic receipt. |
| Credentials | PRIVATE | Module-scoped. Frozen. Not exported. Not on any class instance. |

4.4. Credentials MUST be module-scoped, frozen with `Object.freeze()`, and never exported. They MUST NOT be accessible via instance properties, prototype inspection, bracket notation, or reflection.

4.5. Each domain (email, file, drive, API) MUST have its own adapter. Adapters MUST NOT share credentials across domains.

---

## 5. Phase Ordering

Every execution MUST follow this exact sequence. The PhaseTracker enforces it — skipping a phase MUST throw `PHASE_ORDER_VIOLATION`.

```
INIT → GATE_PASSED → PENDING_WRITTEN → EXECUTED → VERIFIED → RECEIPT_WRITTEN
```

| Phase | What Happens | Failure Mode |
|-------|-------------|-------------|
| **GATE** | Validate authorization token via Gate. | `GATE_FAILED` — execution refused, ledger entry written. |
| **PENDING** | Write pending record to ledger BEFORE execution. | Phase violation if skipped. |
| **EXECUTE** | `perform()` runs the side effect (module-private). | `FAILED` receipt written, token burned. |
| **VERIFY** | Check output matches the approved proposal exactly. | `VERIFICATION_FAILED` receipt written, token burned. |
| **RECEIPT** | Write committed entry with SHA-256 receipt hash. | Token burned after receipt. |

5.1. The pending record MUST be written BEFORE execution begins. The order is: log intent, then execute. Not: execute, then log.

5.2. If execution fails at any phase after GATE_PASSED, the token MUST still be consumed. A new approval and new token are required for retry.

---

## 6. Verification

6.1. After execution, the adapter MUST verify that the actual output matches the approved proposal.

6.2. Verification MUST compare:
- Operation type
- Target (recipient, file path, API endpoint)
- Parameters (subject, body, content)

6.3. If verification fails, the adapter MUST:
- Write a `VERIFICATION_FAILED` receipt.
- Burn the token.
- Record the mismatch in the ledger.

---

## 7. Inventoried Execution Surfaces

All execution surfaces MUST be inventoried. Every surface MUST be gated. Zero ungated paths are permitted.

The reference implementation defines 8 execution surfaces:

| # | Surface | Gate Mechanism |
|---|---------|---------------|
| 1 | Gmail transport (raw) | Module-private, not exported. |
| 2 | Gmail transport gate | HMAC-signed, single-use, 30-second TTL transport token. |
| 3 | Email adapter | PhaseTracker + Gate preflight. |
| 4 | File adapter | PhaseTracker + Gate preflight. |
| 5 | Drive adapter | PhaseTracker + Gate preflight. |
| 6 | Dispatch execution | Requires internal `_gatewayExecution` flag. |
| 7 | LLM invocation | Read-only (no side effects — outside scope). |
| 8 | External fetch | All behind gated connectors. |

7.1. Adding a new execution surface MUST include adding a corresponding gate mechanism and updating the inventory.

---

## 8. Transport Gate (Sealed Modules)

For execution surfaces that use raw transport (e.g., SMTP, HTTP), an additional transport gate MUST be enforced:

8.1. The raw transport function MUST NOT be exported from its module.

8.2. Access to the transport MUST require a transport access token: HMAC-signed, single-use, with a short TTL (30 seconds or less).

8.3. The transport gate singleton MUST be the only caller of the raw transport function.

---

## 9. Credential Boundary

9.1. Execution-capable credentials (API keys, SMTP passwords, OAuth tokens) MUST exist only inside adapter or sealed transport modules.

9.2. No credential may be accessible from outside its containing module via any method: export, class property, prototype, reflection, or bracket notation.

9.3. All credentials MUST be frozen (`Object.freeze()`) to prevent mutation.

---

## 10. Failure Mode

The execution boundary is fail-closed. If the Gate does not open, no side effect occurs. There is no fallback execution path, no emergency override, and no bypass mechanism.
