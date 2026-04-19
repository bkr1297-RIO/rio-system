"""
RIO Canonical Utilities — Hash Binding and Deterministic Serialization
══════════════════════════════════════════════════════════════════════
Shared utilities for canonical JSON serialization and hash computation.

NORMALIZATION INVARIANT:
  All hash computations in the RIO system use canonical_json() for
  deterministic serialization. This function is the single source
  of truth for JSON encoding across:
    - args_hash computation
    - token payload signing
    - receipt hash computation
    - ledger entry hashing
    - policy hash computation

  No drift allowed. If you change this function, every hash in the
  system changes.
"""

import hashlib
import json
from typing import Any


def canonical_json(obj: Any) -> str:
    """
    Deterministic JSON serialization.

    Rules:
      - Keys sorted alphabetically (recursive)
      - No whitespace between separators
      - UTF-8 encoding
      - None → null
      - bool → true/false (lowercase)

    This is the ONLY serialization function used for hash computation
    in the RIO system.
    """
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_hash(data: str) -> str:
    """SHA-256 hex digest of a UTF-8 string."""
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def compute_args_hash(tool_name: str, args: dict) -> str:
    """
    Compute the canonical args hash for an authorization token.

    The hash covers: {"action": tool_name, "args": args}
    This is the same computation used in token issuance and validation.
    """
    return compute_hash(canonical_json({"action": tool_name, "args": args}))


def verify_hash(data: str, expected_hash: str) -> bool:
    """Verify that data hashes to the expected value."""
    return compute_hash(data) == expected_hash


def compute_receipt_hash(receipt_fields: dict) -> str:
    """
    Compute the hash of a receipt from its canonical fields.

    The receipt_fields dict should contain all fields EXCEPT
    receipt_hash and gateway_signature (which are computed from
    this hash).
    """
    return compute_hash(canonical_json(receipt_fields))
