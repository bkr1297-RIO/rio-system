# PGTC Security Considerations

This document defines the threat model and security boundaries of the PGTC standard.

---

## What PGTC Protects Against

PGTC is designed to prevent the following classes of attack:

| Threat | Mitigation |
|--------|-----------|
| **Unauthorized execution** | Gate requires valid authorization with intent_hash binding |
| **Mutation after approval** | Intent hash is computed from canonical form; any change invalidates the hash |
| **Replay attacks** | Single-use nonces; consumed nonces are rejected |
| **Tampering with execution record** | Hash-linked ledger; any modification breaks the chain |
| **Expired authorizations** | TTL enforcement; expired tokens are rejected at the Gate |
| **Scope violation** | TES enforcement; actions outside allowed scope are halted |
| **Silent failures** | Fail-closed guarantee; every failure produces a ledger entry |
| **Bypass via direct adapter call** | Adapter boundary lock; only system.execute() can invoke adapters |

---

## What PGTC Does NOT Protect Against

PGTC is a governance and trust chain standard. It does not address:

| Out of Scope | Reason |
|-------------|--------|
| **Bad decisions** | PGTC ensures decisions are recorded and enforced, not that they are correct |
| **Compromised keys** | If signing keys are compromised, forged authorizations will pass signature checks |
| **Incomplete observability** | PGTC records what passes through the pipeline; it cannot observe actions taken outside the system |
| **Denial of service** | PGTC does not include rate limiting or availability guarantees |
| **Key management** | Key generation, rotation, and storage are outside the PGTC scope |
| **Network security** | Transport-layer encryption and authentication are assumed but not specified |

---

## Security Assumptions

PGTC assumes:

1. The signing key is kept secret and is not compromised.
2. The hash algorithm (default: SHA-256) is collision-resistant.
3. The ledger storage is append-only and durable.
4. The system clock is reasonably accurate for TTL enforcement.
5. The adapter boundary is enforced at the module level (closure isolation, no public exports of raw connectors).

---

## Recommendations

Implementations SHOULD:

- Use HMAC-SHA256 or Ed25519 for signature verification.
- Store nonces in a persistent registry to survive restarts.
- Monitor ledger chain integrity continuously, not only at test time.
- Rotate signing keys periodically.
- Log all Gate decisions (both ALLOW and HALT) for audit purposes.
