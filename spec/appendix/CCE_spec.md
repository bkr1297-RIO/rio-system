# Appendix: Canonical Computation Environment (CCE) Specification

**Version:** 0.1
**Status:** Draft

---

## Overview

The Canonical Computation Environment (CCE) defines the deterministic execution context in which all RIO hash computations, token signing, and receipt generation occur. The CCE ensures that the same inputs always produce the same outputs across all system components.

---

## Invariants

1. **Single canonical JSON function** — `canonical_json()` / `canonicalJsonStringify()` is the only serialization function used for hash computation. All components use the same implementation.

2. **Deterministic key ordering** — Object keys are sorted alphabetically at all nesting levels.

3. **No whitespace** — Separators are `(",", ":")` with no trailing whitespace.

4. **UTF-8 encoding** — All strings are encoded as UTF-8 before hashing.

5. **SHA-256 for all hashes** — `compute_hash()` uses SHA-256 exclusively.

6. **HMAC-SHA256 for signatures** — `compute_gateway_signature()` uses HMAC-SHA256 with the gateway signing key.

---

## Hash Computation Points

| Computation | Input | Function |
|-------------|-------|----------|
| `args_hash` | `{"action": tool_name, "args": tool_args}` | `canonical_json → SHA-256` |
| `policy_hash` | `{"policy_id": id, "rules": rules}` | `canonical_json → SHA-256` |
| `token_signature` | `canonical_json(10 canonical fields) → SHA-256 → HMAC-SHA256` | Two-step |
| `receipt_hash` | `canonical_json(all receipt fields except hash/sig)` | `canonical_json → SHA-256` |
| `genesis_hash` | `canonical_json(genesis fields)` | `canonical_json → SHA-256` |

---

## Drift Prevention

The CCE is the single point of truth. If the canonical JSON function changes, every hash in the system changes. This is by design — it makes drift detectable.

To verify CCE consistency:
1. Compute `args_hash` for a known input
2. Compare against the stored hash in the authorization token
3. If they differ, the CCE has drifted — halt execution
