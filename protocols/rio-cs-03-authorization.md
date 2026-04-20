# RIO-CS-03: Authorization Protocol

**Version:** 1.0
**Status:** Normative
**Date:** April 2026
**Scope:** Token issuance, binding, validation, and consumption

---

## 1. Purpose

This protocol defines how authorization tokens are issued, bound to approved intents, validated at the execution boundary, and consumed after use. No execution occurs without a valid token. No token is issued without approval. No approval is issued without policy.

---

## 2. Definitions

| Term | Meaning |
|------|---------|
| **Authorization Token** | A single-use, time-limited, cryptographically signed artifact that permits exactly one execution of exactly one approved intent. |
| **Policy Hash** | SHA-256 hash of the canonical JSON representation of the active governance policy. |
| **Args Hash** | SHA-256 hash of the canonical JSON representation of the approved action parameters. |
| **Canonical JSON** | Deterministic JSON serialization: keys sorted lexicographically, undefined values excluded, algorithm identifier `PGTC-CANON-1`. |
| **Denial Reason** | A machine-readable constant returned when token validation fails. |

---

## 3. Token Structure

An authorization token MUST contain the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `token_id` | string | Unique identifier (UUID). |
| `intent_id` | string | The intent this token authorizes. |
| `tool_name` | string | The exact tool/action authorized. |
| `args_hash` | string | SHA-256 hash of the canonical action parameters. |
| `approval_id` | string | The approval record that produced this token. |
| `environment` | string | Execution environment identifier. |
| `nonce` | string | Unique nonce for replay prevention. |
| `issued_at` | string | ISO 8601 timestamp of issuance. |
| `expires_at` | string | ISO 8601 timestamp of expiration. |
| `max_executions` | number | Maximum permitted executions. MUST be 1. |
| `execution_count` | number | Current execution count. Starts at 0. |
| `policy_hash` | string | Hash of the policy in effect at issuance. |
| `signature` | string | HMAC-SHA256 signature over the canonical token payload. |

---

## 4. Issuance Rules

4.1. A token MUST NOT be issued unless an active signed policy exists.

4.2. A token MUST NOT be issued unless a valid approval record exists for the intent.

4.3. The `policy_hash` field MUST match the hash of the currently active policy at the moment of issuance.

4.4. The `args_hash` field MUST be computed as `SHA-256(canonical_json(parameters))` where `parameters` is the exact parameter set from the approved intent.

4.5. The `signature` field MUST be computed as `HMAC-SHA256(signing_key, SHA-256(canonical_json(canonical_payload)))` where `canonical_payload` includes: `token_id`, `intent_id`, `approval_id`, `tool_name`, `args_hash`, `environment`, `issued_at`, `expires_at`, `max_executions`, `nonce`.

4.6. The `max_executions` field MUST be set to 1. Multi-use tokens are prohibited.

---

## 5. Validation Rules

Before any execution, the token MUST pass all of the following checks. If any check fails, execution MUST be denied.

| Check | Rule | Denial Reason |
|-------|------|---------------|
| Token exists | The token MUST exist in the token store and MUST NOT have been consumed. | `NO_TOKEN` or `TOKEN_ALREADY_CONSUMED` |
| Signature valid | The recomputed HMAC-SHA256 signature MUST match the stored signature. | `TOKEN_BAD_SIGNATURE` |
| Not expired | Current time MUST be before `expires_at`. | `TOKEN_EXPIRED` |
| Tool name match | The requested tool MUST exactly match `token.tool_name`. | `TOKEN_PROPOSAL_MISMATCH` |
| Args hash match | `SHA-256(canonical_json(requested_parameters))` MUST exactly match `token.args_hash`. | `TOKEN_HASH_MISMATCH` |
| Execution count | `execution_count` MUST be less than `max_executions`. | `TOKEN_ALREADY_CONSUMED` |

---

## 6. Denial Reasons

The system defines exactly six machine-readable denial constants:

| Constant | Trigger |
|----------|---------|
| `NO_TOKEN` | No authorization token was provided with the execution request. |
| `TOKEN_PROPOSAL_MISMATCH` | The token's `tool_name` does not match the requested action. |
| `TOKEN_HASH_MISMATCH` | The token's `args_hash` does not match the hash of the requested parameters. |
| `TOKEN_EXPIRED` | The token's TTL has been exceeded. |
| `TOKEN_BAD_SIGNATURE` | The token's HMAC signature verification failed. |
| `TOKEN_ALREADY_CONSUMED` | The token has already been used (burn-after-use). |

Every denied execution MUST return at least one denial reason. Denial reasons MUST be included in the ledger entry for the denied attempt.

---

## 7. Consumption Rules

7.1. Upon successful validation and execution, the token MUST be marked as consumed (`execution_count` incremented to `max_executions`).

7.2. A consumed token MUST NOT be reused. Any attempt to reuse a consumed token MUST return `TOKEN_ALREADY_CONSUMED`.

7.3. Token consumption MUST occur atomically with execution. If execution fails after the token is consumed, the token remains consumed. A new approval and new token are required for retry.

---

## 8. Delegation Constraint

8.1. If the proposer and approver are the same identity, the system MUST enforce a cooldown period before approval is permitted.

8.2. Three cases are defined, exhaustively:

| Case | Condition | Allowed | Authority Model |
|------|-----------|---------|-----------------|
| Separated | `proposer !== approver` | Yes | Separated Authority |
| Constrained | `proposer === approver` AND cooldown elapsed | Yes | Constrained Single-Actor Execution |
| Blocked | `proposer === approver` AND cooldown NOT elapsed | No | BLOCKED |

8.3. The cooldown boundary is inclusive: at exactly the cooldown duration, approval is permitted.

8.4. The authority model label MUST be recorded in the receipt and ledger entry.

---

## 9. Policy Binding

9.1. Every token is bound to the policy that was active at issuance via `policy_hash`.

9.2. If the active policy changes between token issuance and execution, the token remains valid only if the policy hash still matches. If the policy has been superseded, the token MUST be rejected.

9.3. Only one policy may be active at any time. Activating a new policy supersedes the previous one.

---

## 10. Failure Mode

The authorization system is fail-closed. If any condition is not met, the default state is deny. There is no fallback, no override, and no bypass.
