# RIO Intent Packet Specification

**Version:** 0.1
**Status:** Active
**Extracted from:** Master Seed v1.1, live system (rio-proxy)

---

## Overview

An **intent packet** is the complete, self-contained artifact that travels through the governed execution pipeline. It bundles the intent, authorization token, preflight checks, execution result, and receipt into a single verifiable unit.

---

## Packet Structure

```json
{
  "packet_version": "1.0",
  "intent": { ... },
  "authorization_token": { ... },
  "preflight": { ... },
  "execution": { ... },
  "receipt": { ... },
  "proof_packet": { ... }
}
```

---

## Sections

### 1. Intent

The original intent as proposed. See `intent_template_spec.md`.

### 2. Authorization Token

Issued upon approval. Contains:

| Field | Description |
|-------|-------------|
| `token_id` | Unique token identifier (ATOK-...) |
| `intent_id` | Bound to this specific intent |
| `approval_id` | Reference to the approval |
| `tool_name` | Must match intent's tool_name |
| `args_hash` | SHA-256 of canonical(action + args) — binding |
| `environment` | `test` or `production` |
| `nonce` | Single-use randomness |
| `issued_at` | ISO8601 issuance timestamp |
| `expires_at` | ISO8601 expiry (TTL enforcement) |
| `max_executions` | Always 1 (single-use) |
| `signature` | HMAC-SHA256 over canonical payload |
| `policy_hash` | Must match active governance policy |

### 3. Preflight (Gate Check)

The Gate validates the token before execution. 8 checks:

| Check | Category | Description |
|-------|----------|-------------|
| `token_signature_valid` | Cryptographic | Signature matches canonical payload |
| `token_not_expired` | Temporal | Current time < expires_at |
| `token_tool_name_match` | Binding | Token tool_name == request tool_name |
| `token_parameters_hash_match` | Binding | Token args_hash == computed args_hash |
| `policy_hash_match` | Binding | Token policy_hash == active policy hash |
| `token_exists` | Lifecycle | Token found in store (not burned) |
| `execution_count_valid` | Lifecycle | execution_count < max_executions |
| `kill_switch_off` | Safety | System kill switch not active |

All 8 must PASS for execution to proceed.

### 4. Execution

The adapter's execution result. Adapter-specific.

### 5. Receipt

The canonical receipt. See `RECEIPT_SPEC.md` in this directory.

### 6. Proof Packet

The assembled verification artifact containing all of the above, plus:
- `verification.valid` — whether the full chain is valid
- `verification.checks` — individual check results
- `chain.previous_receipt_hash` — link to prior receipt

---

## Denial Reasons

When the Gate rejects execution, the packet includes machine-readable denial reasons:

| Reason | Trigger |
|--------|---------|
| `NO_TOKEN` | No authorization token provided |
| `TOKEN_PROPOSAL_MISMATCH` | Token tool_name does not match request |
| `TOKEN_HASH_MISMATCH` | Token args_hash does not match computed hash |
| `TOKEN_EXPIRED` | Token TTL exceeded |
| `TOKEN_BAD_SIGNATURE` | Token signature verification failed |
| `TOKEN_ALREADY_CONSUMED` | Token already burned (replay attempt) |

---

## Example: Passing Packet

See `examples/passing_integration_sample.json` for a complete passing packet from the live compliance runner.

## Example: Failing Packet

See `examples/failing_integration_sample.json` for a complete failing packet showing Gate rejection.
