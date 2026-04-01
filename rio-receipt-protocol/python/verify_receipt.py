#!/usr/bin/env python3
"""
verify_receipt.py — RIO Receipt Protocol
Verify a signed receipt JSON: required fields, ledger_hash integrity, and ECDSA signature.

Usage:
    python verify_receipt.py --receipt <path/to/receipt.json> --key <path/to/public_key.pem>

    # To verify hash chain linkage against a previous receipt:
    python verify_receipt.py --receipt <path/to/receipt.json> --key <path/to/public_key.pem> --prev <path/to/previous_receipt.json>

Exit codes:
    0 — All checks passed (VALID)
    1 — One or more checks failed (INVALID)
"""

import argparse
import base64
import hashlib
import json
import sys


REQUIRED_FIELDS = [
    "receipt_id",
    "request_id",
    "recommendation_id",
    "approval_id",
    "execution_id",
    "action_type",
    "requested_by",
    "approver_id",
    "executed_by",
    "created_at",
    "ledger_hash",
    "previous_hash",
    "signature",
    "verification_method",
    "status",
]


def load_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def canonicalize(receipt: dict) -> bytes:
    """Reproduce the canonical bytes that were signed (excludes signature and ledger_hash)."""
    excluded = {"signature", "ledger_hash"}
    filtered = {k: v for k, v in receipt.items() if k not in excluded}
    return json.dumps(filtered, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def check_required_fields(receipt: dict) -> list[str]:
    """Return list of missing required fields."""
    return [f for f in REQUIRED_FIELDS if f not in receipt]


def check_ledger_hash(receipt: dict) -> tuple[bool, str]:
    """Recompute ledger_hash and compare to stored value."""
    canonical = canonicalize(receipt)
    expected = hashlib.sha256(canonical).hexdigest()
    stored = receipt.get("ledger_hash", "")
    if expected == stored:
        return True, f"ledger_hash OK ({stored[:16]}...)"
    return False, f"ledger_hash MISMATCH\n  expected: {expected}\n  stored:   {stored}"


def check_chain_linkage(receipt: dict, prev_receipt: dict) -> tuple[bool, str]:
    """Verify that receipt.previous_hash matches prev_receipt.ledger_hash."""
    prev_hash = prev_receipt.get("ledger_hash", "")
    stored_prev = receipt.get("previous_hash", "")
    if prev_hash == stored_prev:
        return True, f"chain linkage OK (previous_hash matches prev receipt ledger_hash)"
    return False, f"chain linkage BROKEN\n  receipt.previous_hash: {stored_prev}\n  prev receipt ledger_hash: {prev_hash}"


def check_signature(receipt: dict, public_key_path: str) -> tuple[bool, str]:
    """Verify ECDSA secp256k1 signature."""
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.exceptions import InvalidSignature
    except ImportError:
        return False, "ERROR: 'cryptography' package not installed. Run: pip install cryptography"

    method = receipt.get("verification_method", "")
    if method != "ecdsa_secp256k1":
        return False, f"Unsupported verification_method: '{method}'. This verifier supports 'ecdsa_secp256k1' only."

    try:
        with open(public_key_path, "rb") as f:
            public_key = serialization.load_pem_public_key(f.read())
    except Exception as e:
        return False, f"Failed to load public key: {e}"

    if not isinstance(public_key, ec.EllipticCurvePublicKey):
        return False, "Public key is not an EC key."

    canonical = canonicalize(receipt)
    sig_b64 = receipt.get("signature", "")
    try:
        sig_bytes = base64.b64decode(sig_b64)
    except Exception as e:
        return False, f"Failed to decode signature: {e}"

    try:
        public_key.verify(sig_bytes, canonical, ec.ECDSA(hashes.SHA256()))
        return True, "signature OK"
    except InvalidSignature:
        return False, "signature INVALID — receipt may have been tampered with"
    except Exception as e:
        return False, f"signature verification error: {e}"


def print_result(label: str, passed: bool, detail: str):
    icon = "PASS" if passed else "FAIL"
    print(f"  [{icon}] {label}: {detail}")


def main():
    parser = argparse.ArgumentParser(description="Verify a RIO receipt JSON.")
    parser.add_argument("--receipt", required=True, help="Path to the receipt JSON file to verify.")
    parser.add_argument("--key", required=True, help="Path to the PEM-encoded secp256k1 public key.")
    parser.add_argument("--prev", default=None, help="Path to the previous receipt JSON (for chain linkage check).")
    args = parser.parse_args()

    receipt = load_json(args.receipt)
    results = []

    print(f"\nRIO Receipt Protocol — Verification Report")
    print(f"Receipt ID: {receipt.get('receipt_id', 'UNKNOWN')}")
    print(f"{'─' * 60}")

    # Check 1: Required fields
    missing = check_required_fields(receipt)
    if missing:
        results.append(False)
        print_result("required fields", False, f"missing: {', '.join(missing)}")
    else:
        results.append(True)
        print_result("required fields", True, "all present")

    # Check 2: Ledger hash integrity
    hash_ok, hash_detail = check_ledger_hash(receipt)
    results.append(hash_ok)
    print_result("ledger_hash integrity", hash_ok, hash_detail)

    # Check 3: Chain linkage (optional)
    if args.prev:
        prev_receipt = load_json(args.prev)
        chain_ok, chain_detail = check_chain_linkage(receipt, prev_receipt)
        results.append(chain_ok)
        print_result("hash chain linkage", chain_ok, chain_detail)
    else:
        print(f"  [SKIP] hash chain linkage: --prev not provided")

    # Check 4: Signature
    sig_ok, sig_detail = check_signature(receipt, args.key)
    results.append(sig_ok)
    print_result("signature", sig_ok, sig_detail)

    print(f"{'─' * 60}")
    all_passed = all(results)
    verdict = "VALID — all checks passed." if all_passed else "INVALID — one or more checks failed."
    print(f"  RESULT: {verdict}\n")

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
