"""
RIO Authority Layer — Single-Use Token System
══════════════════════════════════════════════
Reference implementation (Python) of the TypeScript authority layer
in the live RIO system (rio-proxy/server/rio/authorityLayer.ts).

This module defines:
  1. Root Authority (Ed25519 signer)
  2. Governance Policy Hash + Root Signature
  3. Authorization Token (issued after approval, required for execution)
  4. Canonical Receipt (references token_id and policy_hash)
  5. Genesis Record (ledger block 0)

The One Rule:
  No execution without authorization token.
  No authorization token without approval.
  No approval without policy.
  No policy without root signature.
  No execution without receipt.
  No receipt without ledger entry.

NORMALIZATION INVARIANT:
  The same canonical_json function is used for:
    - args_hash computation
    - token payload signing
    - token payload verification
  No drift allowed.
"""

import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

# ═══════════════════════════════════════════════════════════════
# CANONICAL JSON
# ═══════════════════════════════════════════════════════════════

def canonical_json(obj: Any) -> str:
    """Deterministic JSON serialization — sorted keys, no whitespace."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def compute_hash(data: str) -> str:
    """SHA-256 hex digest of a string."""
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def compute_gateway_signature(data: str, signing_key: Optional[str] = None) -> str:
    """HMAC-SHA256 gateway signature over arbitrary data."""
    key = signing_key or os.environ.get("JWT_SECRET", "rio-gateway-default-key")
    return hmac.new(key.encode("utf-8"), data.encode("utf-8"), hashlib.sha256).hexdigest()


# ═══════════════════════════════════════════════════════════════
# DENIAL REASONS
# ═══════════════════════════════════════════════════════════════

DENIAL_REASONS = {
    "NO_TOKEN": "NO_TOKEN",
    "TOKEN_PROPOSAL_MISMATCH": "TOKEN_PROPOSAL_MISMATCH",
    "TOKEN_HASH_MISMATCH": "TOKEN_HASH_MISMATCH",
    "TOKEN_EXPIRED": "TOKEN_EXPIRED",
    "TOKEN_BAD_SIGNATURE": "TOKEN_BAD_SIGNATURE",
    "TOKEN_ALREADY_CONSUMED": "TOKEN_ALREADY_CONSUMED",
}

_CHECK_TO_DENIAL = {
    "token_signature_valid": "TOKEN_BAD_SIGNATURE",
    "token_not_expired": "TOKEN_EXPIRED",
    "token_tool_name_match": "TOKEN_PROPOSAL_MISMATCH",
    "token_parameters_hash_match": "TOKEN_HASH_MISMATCH",
    "token_exists": "TOKEN_ALREADY_CONSUMED",
    "execution_count_valid": "TOKEN_ALREADY_CONSUMED",
}


def extract_denial_reasons(validation_result: dict) -> list[str]:
    """Extract machine-readable denial reasons from a validation result."""
    if validation_result.get("valid"):
        return []
    reasons = []
    for c in validation_result.get("checks", []):
        if c["status"] == "FAIL":
            reason = _CHECK_TO_DENIAL.get(c["check"])
            if reason and reason not in reasons:
                reasons.append(reason)
    return reasons


# ═══════════════════════════════════════════════════════════════
# DEFAULT POLICY RULES
# ═══════════════════════════════════════════════════════════════

DEFAULT_POLICY_RULES = {
    "proposer_cannot_approve": True,
    "high_risk_requires_approval": True,
    "approval_expiry_minutes": 5,
    "max_executions_per_approval": 1,
    "ledger_required": True,
    "receipt_required": True,
    "fail_closed": True,
}


# ═══════════════════════════════════════════════════════════════
# IN-MEMORY STATE
# ═══════════════════════════════════════════════════════════════

_active_root_authority: Optional[dict] = None
_active_policy: Optional[dict] = None
_authorization_tokens: dict[str, dict] = {}
_last_receipt_hash: str = "0" * 64


# ═══════════════════════════════════════════════════════════════
# 1. ROOT AUTHORITY
# ═══════════════════════════════════════════════════════════════

def register_root_authority(public_key_hex: str) -> dict:
    """Register a root authority public key."""
    global _active_root_authority
    fingerprint = compute_hash(public_key_hex)[:16]
    _active_root_authority = {
        "root_public_key": public_key_hex,
        "fingerprint": fingerprint,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "ACTIVE",
    }
    return _active_root_authority


def get_active_root_authority() -> Optional[dict]:
    return _active_root_authority


# ═══════════════════════════════════════════════════════════════
# 2. GOVERNANCE POLICY
# ═══════════════════════════════════════════════════════════════

def compute_policy_hash(policy_id: str, rules: dict) -> str:
    return compute_hash(canonical_json({"policy_id": policy_id, "rules": rules}))


def activate_policy(
    policy_id: str,
    rules: dict,
    policy_signature: str,
    root_public_key: str,
) -> dict:
    """Activate a signed governance policy."""
    global _active_policy
    policy_hash = compute_policy_hash(policy_id, rules)

    # Verify root signature (structural check — production uses Ed25519)
    if not policy_signature or len(policy_signature) < 10:
        raise ValueError("AUTHORITY_ERROR: Policy signature invalid")

    if _active_policy and _active_policy["status"] == "ACTIVE":
        _active_policy["status"] = "SUPERSEDED"

    _active_policy = {
        "policy_id": policy_id,
        "policy_hash": policy_hash,
        "policy_signature": policy_signature,
        "root_public_key": root_public_key,
        "rules": rules,
        "activated_at": datetime.now(timezone.utc).isoformat(),
        "status": "ACTIVE",
    }
    return _active_policy


def get_active_policy() -> Optional[dict]:
    return _active_policy


# ═══════════════════════════════════════════════════════════════
# 3. AUTHORIZATION TOKEN
# ═══════════════════════════════════════════════════════════════

def compute_args_hash(tool_name: str, args: dict) -> str:
    """Compute the args hash for an authorization token."""
    return compute_hash(canonical_json({"action": tool_name, "args": args}))


def _compute_canonical_token_payload(token: dict) -> str:
    """Compute the canonical payload for signing/verification."""
    return canonical_json({
        "token_id": token["token_id"],
        "intent_id": token["intent_id"],
        "approval_id": token["approval_id"],
        "tool_name": token["tool_name"],
        "args_hash": token["args_hash"],
        "environment": token["environment"],
        "issued_at": token["issued_at"],
        "expires_at": token["expires_at"],
        "max_executions": token["max_executions"],
        "nonce": token["nonce"],
    })


def _sign_token_payload(token: dict, signing_key: Optional[str] = None) -> str:
    """Sign a canonical token payload."""
    canonical = _compute_canonical_token_payload(token)
    payload_hash = compute_hash(canonical)
    return compute_gateway_signature(payload_hash, signing_key)


def _verify_token_signature(token: dict, signing_key: Optional[str] = None) -> bool:
    """Verify a token signature against its canonical payload."""
    if not token.get("signature") or len(token["signature"]) < 10:
        return False
    expected = _sign_token_payload(token, signing_key)
    return token["signature"] == expected


def issue_authorization_token(
    intent_id: str,
    action: str,
    tool_args: dict,
    approved_by: str,
    expiry_minutes: Optional[int] = None,
    max_executions: Optional[int] = None,
    environment: Optional[str] = None,
    signing_key: Optional[str] = None,
) -> dict:
    """Issue an authorization token after a valid approval."""
    policy = get_active_policy()
    if not policy:
        raise ValueError("AUTHORITY_ERROR: No active policy — no token without policy")

    now = datetime.now(timezone.utc)
    expiry = expiry_minutes or policy["rules"]["approval_expiry_minutes"]
    expires_at = now + timedelta(minutes=expiry)

    token_id = f"ATOK-{uuid.uuid4().hex[:16]}"
    nonce = str(uuid.uuid4())
    env = environment or ("test" if os.environ.get("TESTING") else "production")

    args_hash = compute_args_hash(action, tool_args)

    canonical_fields = {
        "token_id": token_id,
        "intent_id": intent_id,
        "approval_id": approved_by,
        "tool_name": action,
        "args_hash": args_hash,
        "environment": env,
        "issued_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "max_executions": max_executions or policy["rules"]["max_executions_per_approval"],
        "nonce": nonce,
    }

    signature = _sign_token_payload(canonical_fields, signing_key)

    token = {
        **canonical_fields,
        "execution_count": 0,
        "policy_hash": policy["policy_hash"],
        "signature": signature,
    }

    _authorization_tokens[token_id] = token
    return token


def get_authorization_token(token_id: str) -> Optional[dict]:
    return _authorization_tokens.get(token_id)


def burn_authorization_token(token_id: str) -> bool:
    """Burn (invalidate) a token after execution. Single-use enforcement."""
    if token_id in _authorization_tokens:
        del _authorization_tokens[token_id]
        return True
    return False


def validate_authorization_token(
    token: dict,
    action: str,
    tool_args: dict,
    kill_switch_active: bool = False,
    signing_key: Optional[str] = None,
) -> dict:
    """
    Validate an authorization token before execution.

    Gate verification order:
      1. Signature (cryptographic integrity)
      2. Expiry (temporal validity)
      3. Binding: tool_name, args_hash, policy_hash
      4. DB lifecycle: execution_count, kill_switch, token_exists
    """
    checks = []

    # Phase 1: Signature
    sig_valid = _verify_token_signature(token, signing_key)
    checks.append({
        "check": "token_signature_valid",
        "status": "PASS" if sig_valid else "FAIL",
        "detail": "Token signature verified" if sig_valid else "Token signature mismatch",
    })

    # Phase 2: Expiry
    now = datetime.now(timezone.utc)
    expires_at = datetime.fromisoformat(token["expires_at"].replace("Z", "+00:00"))
    not_expired = now < expires_at
    checks.append({
        "check": "token_not_expired",
        "status": "PASS" if not_expired else "FAIL",
        "detail": f"Expires at {token['expires_at']}" if not_expired else f"Expired at {token['expires_at']}",
    })

    # Phase 3: Binding
    tool_match = token["tool_name"] == action
    checks.append({
        "check": "token_tool_name_match",
        "status": "PASS" if tool_match else "FAIL",
        "detail": f"Tool name verified: {action}" if tool_match else f"Mismatch: token={token['tool_name']}, request={action}",
    })

    current_hash = compute_args_hash(action, tool_args)
    hash_match = token["args_hash"] == current_hash
    checks.append({
        "check": "token_parameters_hash_match",
        "status": "PASS" if hash_match else "FAIL",
        "detail": "Args hash verified" if hash_match else "Args hash mismatch",
    })

    policy = get_active_policy()
    policy_match = policy and token["policy_hash"] == policy["policy_hash"]
    checks.append({
        "check": "policy_hash_match",
        "status": "PASS" if policy_match else "FAIL",
        "detail": "Policy hash verified" if policy_match else "Policy hash mismatch",
    })

    # Phase 4: DB lifecycle
    stored = _authorization_tokens.get(token["token_id"])
    exists = stored is not None
    checks.append({
        "check": "token_exists",
        "status": "PASS" if exists else "FAIL",
        "detail": f"Token {token['token_id']} found" if exists else "Token not found in store",
    })

    under_max = token["execution_count"] < token["max_executions"]
    checks.append({
        "check": "execution_count_valid",
        "status": "PASS" if under_max else "FAIL",
        "detail": f"{token['execution_count']}/{token['max_executions']} executions" if under_max else "Max executions reached",
    })

    checks.append({
        "check": "kill_switch_off",
        "status": "FAIL" if kill_switch_active else "PASS",
        "detail": "Kill switch ACTIVE" if kill_switch_active else "Kill switch off",
    })

    valid = all(c["status"] == "PASS" for c in checks)

    if valid and stored:
        stored["execution_count"] += 1

    return {"valid": valid, "checks": checks}


# ═══════════════════════════════════════════════════════════════
# 4. CANONICAL RECEIPT
# ═══════════════════════════════════════════════════════════════

def generate_canonical_receipt(
    intent_id: str,
    proposer_id: str,
    approver_id: str,
    token_id: str,
    action: str,
    success: bool,
    result: Any,
    executor: str,
    ledger_entry_id: str,
    timestamp_proposed: str,
    timestamp_approved: str,
    gateway_signing_key: Optional[str] = None,
    snapshot_hash: Optional[str] = None,
) -> dict:
    """Generate a canonical receipt for a governed action."""
    global _last_receipt_hash

    policy = get_active_policy()
    if not policy:
        raise ValueError("AUTHORITY_ERROR: No active policy — cannot generate receipt")

    if snapshot_hash is None:
        snapshot_hash = compute_hash(canonical_json({
            "policy_id": policy["policy_id"],
            "policy_hash": policy["policy_hash"],
            "rules": policy["rules"],
            "root_public_key": policy["root_public_key"],
            "policy_signature": policy["policy_signature"],
            "activated_at": policy["activated_at"],
        }))

    receipt_id = f"RCPT-{uuid.uuid4().hex[:16]}"
    execution_hash = compute_hash(canonical_json(result or {}))
    previous_receipt_hash = _last_receipt_hash
    timestamp_executed = datetime.now(timezone.utc).isoformat()
    status = "SUCCESS" if success else "FAILED"

    # Decision delta
    try:
        t_proposed = datetime.fromisoformat(timestamp_proposed.replace("Z", "+00:00"))
        t_approved = datetime.fromisoformat(timestamp_approved.replace("Z", "+00:00"))
        decision_delta_ms = int((t_approved - t_proposed).total_seconds() * 1000)
    except Exception:
        decision_delta_ms = None

    receipt_hash = compute_hash(canonical_json({
        "receipt_id": receipt_id,
        "intent_id": intent_id,
        "proposer_id": proposer_id,
        "approver_id": approver_id,
        "token_id": token_id,
        "action": action,
        "status": status,
        "executor": executor,
        "execution_hash": execution_hash,
        "policy_hash": policy["policy_hash"],
        "snapshot_hash": snapshot_hash,
        "timestamp_proposed": timestamp_proposed,
        "timestamp_approved": timestamp_approved,
        "timestamp_executed": timestamp_executed,
        "decision_delta_ms": decision_delta_ms,
        "ledger_entry_id": ledger_entry_id,
        "previous_receipt_hash": previous_receipt_hash,
    }))

    gateway_signature = compute_gateway_signature(receipt_hash, gateway_signing_key)

    receipt = {
        "receipt_id": receipt_id,
        "intent_id": intent_id,
        "proposer_id": proposer_id,
        "approver_id": approver_id,
        "token_id": token_id,
        "action": action,
        "status": status,
        "executor": executor,
        "execution_hash": execution_hash,
        "policy_hash": policy["policy_hash"],
        "snapshot_hash": snapshot_hash,
        "timestamp_proposed": timestamp_proposed,
        "timestamp_approved": timestamp_approved,
        "timestamp_executed": timestamp_executed,
        "decision_delta_ms": decision_delta_ms,
        "ledger_entry_id": ledger_entry_id,
        "previous_receipt_hash": previous_receipt_hash,
        "receipt_hash": receipt_hash,
        "gateway_signature": gateway_signature,
    }

    _last_receipt_hash = receipt_hash
    return receipt


# ═══════════════════════════════════════════════════════════════
# 5. GENESIS RECORD
# ═══════════════════════════════════════════════════════════════

def create_genesis_record(
    root_public_key: str,
    policy_hash: str,
    root_signature: str,
) -> dict:
    """Create the genesis record — the anchor for the entire system."""
    created_at = datetime.now(timezone.utc).isoformat()
    genesis_hash = compute_hash(canonical_json({
        "record_type": "GENESIS",
        "system_id": "RIO",
        "root_public_key": root_public_key,
        "policy_hash": policy_hash,
        "created_at": created_at,
        "previous_hash": "0000000000000000",
    }))
    return {
        "record_type": "GENESIS",
        "system_id": "RIO",
        "root_public_key": root_public_key,
        "policy_hash": policy_hash,
        "created_at": created_at,
        "previous_hash": "0000000000000000",
        "signature": root_signature,
        "genesis_hash": genesis_hash,
    }


# ═══════════════════════════════════════════════════════════════
# 6. THE ONE RULE
# ═══════════════════════════════════════════════════════════════

def enforce_the_one_rule(
    has_authorization_token: bool,
    has_approval: bool,
    has_active_policy: bool,
    has_policy_root_signature: bool,
    will_generate_receipt: bool,
    will_write_ledger: bool,
) -> dict:
    """The six invariants that must hold for the system to be governed."""
    violations = []
    if not has_authorization_token:
        violations.append("No execution without authorization token")
    if not has_approval:
        violations.append("No authorization token without approval")
    if not has_active_policy:
        violations.append("No approval without policy")
    if not has_policy_root_signature:
        violations.append("No policy without root signature")
    if not will_generate_receipt:
        violations.append("No execution without receipt")
    if not will_write_ledger:
        violations.append("No receipt without ledger entry")
    return {"governed": len(violations) == 0, "violations": violations}


# ═══════════════════════════════════════════════════════════════
# RESET (for testing)
# ═══════════════════════════════════════════════════════════════

def reset_authority_state():
    """Reset all in-memory state. Used only in tests."""
    global _active_root_authority, _active_policy, _last_receipt_hash
    _active_root_authority = None
    _active_policy = None
    _authorization_tokens.clear()
    _last_receipt_hash = "0" * 64
