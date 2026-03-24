#!/usr/bin/env python3
"""
sign_receipt.py — RIO Receipt Protocol
Canonicalize and sign a receipt JSON using ECDSA secp256k1.

Usage:
    python sign_receipt.py --receipt <path/to/receipt.json> --key <path/to/private_key.pem> [--out <path/to/signed_receipt.json>]

If --out is not specified, the signed receipt is written to stdout.

Key generation (one-time setup):
    openssl ecparam -name secp256k1 -genkey -noout -out private_key.pem
    openssl ec -in private_key.pem -pubout -out public_key.pem
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path


def load_receipt(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def canonicalize(receipt: dict) -> bytes:
    """
    Produce a canonical, deterministic byte representation of the receipt
    for signing. Fields 'signature' and 'ledger_hash' are excluded from
    the signed payload — ledger_hash is computed from this canonical form,
    and signature is the output of signing it.
    """
    excluded = {"signature", "ledger_hash"}
    filtered = {k: v for k, v in receipt.items() if k not in excluded}
    # RFC 8785-style: sorted keys, no extra whitespace, UTF-8
    return json.dumps(filtered, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def compute_ledger_hash(canonical_bytes: bytes) -> str:
    """SHA-256 hash of the canonical receipt bytes (hex string)."""
    return hashlib.sha256(canonical_bytes).hexdigest()


def sign_bytes(data: bytes, private_key_path: str) -> str:
    """
    Sign data using ECDSA secp256k1 via the cryptography library.
    Returns a base64-encoded DER signature string.
    """
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        import base64
    except ImportError:
        print("ERROR: 'cryptography' package not installed. Run: pip install cryptography", file=sys.stderr)
        sys.exit(1)

    with open(private_key_path, "rb") as f:
        private_key = serialization.load_pem_private_key(f.read(), password=None)

    if not isinstance(private_key, ec.EllipticCurvePrivateKey):
        print("ERROR: Key is not an EC private key.", file=sys.stderr)
        sys.exit(1)

    signature_bytes = private_key.sign(data, ec.ECDSA(hashes.SHA256()))
    return base64.b64encode(signature_bytes).decode("utf-8")


def main():
    parser = argparse.ArgumentParser(description="Sign a RIO receipt JSON using ECDSA secp256k1.")
    parser.add_argument("--receipt", required=True, help="Path to the unsigned receipt JSON file.")
    parser.add_argument("--key", required=True, help="Path to the PEM-encoded secp256k1 private key.")
    parser.add_argument("--out", default=None, help="Output path for the signed receipt JSON. Defaults to stdout.")
    args = parser.parse_args()

    receipt = load_receipt(args.receipt)

    # Remove any existing signature and ledger_hash before computing
    receipt.pop("signature", None)
    receipt.pop("ledger_hash", None)

    canonical = canonicalize(receipt)
    ledger_hash = compute_ledger_hash(canonical)
    signature = sign_bytes(canonical, args.key)

    receipt["ledger_hash"] = ledger_hash
    receipt["signature"] = signature
    receipt["verification_method"] = "ecdsa_secp256k1"

    signed_json = json.dumps(receipt, indent=2, ensure_ascii=False)

    if args.out:
        Path(args.out).write_text(signed_json, encoding="utf-8")
        print(f"Signed receipt written to: {args.out}", file=sys.stderr)
    else:
        print(signed_json)


if __name__ == "__main__":
    main()
