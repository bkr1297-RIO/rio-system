"""
RIO Orchestrator — Governed Execution Orchestration
════════════════════════════════════════════════════
Reference implementation (Python) of the governed execution flow
as implemented in the live RIO system (rio-proxy/server/routers.ts).

This orchestrator coordinates:
  1. Intent proposal (propose)
  2. Approval with token issuance (approve)
  3. Gate-checked execution (execute)
  4. Receipt generation and ledger append

The orchestrator does NOT hold credentials.
Credentials live ONLY in adapter modules.
The orchestrator dispatches to adapters through the Gate.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from server.security.tokens import (
    issue_authorization_token,
    validate_authorization_token,
    burn_authorization_token,
    generate_canonical_receipt,
    compute_args_hash,
    extract_denial_reasons,
    DENIAL_REASONS,
)


# ═══════════════════════════════════════════════════════════════
# INTENT STORE (in-memory — production uses DB)
# ═══════════════════════════════════════════════════════════════

_intents: dict[str, dict] = {}


def propose(
    tool_name: str,
    tool_args: dict,
    proposer_id: str,
    risk_level: str = "low",
    justification: str = "",
) -> dict:
    """
    Propose an intent for governed execution.
    Returns the intent record with status 'pending_approval'.
    """
    intent_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    intent = {
        "intent_id": intent_id,
        "tool_name": tool_name,
        "tool_args": tool_args,
        "proposer_id": proposer_id,
        "risk_level": risk_level,
        "justification": justification,
        "status": "pending_approval",
        "created_at": now,
        "approved_at": None,
        "executed_at": None,
        "approval_id": None,
        "authorization_token_id": None,
        "receipt_id": None,
    }

    _intents[intent_id] = intent
    return intent


def approve(
    intent_id: str,
    approver_id: str,
    expiry_minutes: int = 5,
) -> dict:
    """
    Approve an intent and issue an authorization token.
    Enforces: proposer cannot approve their own intent.
    Returns the intent with authorization token ID.
    """
    intent = _intents.get(intent_id)
    if not intent:
        raise ValueError(f"Intent not found: {intent_id}")

    if intent["status"] != "pending_approval":
        raise ValueError(f"Intent not pending: status={intent['status']}")

    # Separation of duties
    if intent["proposer_id"] == approver_id:
        raise PermissionError("SELF_APPROVAL_BLOCKED: Proposer cannot approve own intent")

    now = datetime.now(timezone.utc).isoformat()
    approval_id = f"APPR-{uuid.uuid4().hex[:12]}"

    # Issue authorization token
    token = issue_authorization_token(
        intent_id=intent_id,
        action=intent["tool_name"],
        tool_args=intent["tool_args"],
        approved_by=approval_id,
        expiry_minutes=expiry_minutes,
    )

    intent["status"] = "approved"
    intent["approved_at"] = now
    intent["approval_id"] = approval_id
    intent["authorization_token_id"] = token["token_id"]

    return intent


def execute(
    intent_id: str,
    executor_id: str,
    adapter_fn=None,
) -> dict:
    """
    Execute a governed intent through the Gate → Adapter path.

    The orchestrator:
      1. Retrieves the intent and its authorization token
      2. Validates the token (Gate check)
      3. Dispatches to the adapter (which holds credentials)
      4. Generates a canonical receipt
      5. Burns the token (single-use)

    If adapter_fn is None, returns a dry-run result.
    """
    intent = _intents.get(intent_id)
    if not intent:
        raise ValueError(f"Intent not found: {intent_id}")

    if intent["status"] != "approved":
        raise ValueError(f"Intent not approved: status={intent['status']}")

    token_id = intent.get("authorization_token_id")
    if not token_id:
        raise PermissionError(f"DENIED: {DENIAL_REASONS['NO_TOKEN']}")

    from server.security.tokens import get_authorization_token
    token = get_authorization_token(token_id)
    if not token:
        raise PermissionError(f"DENIED: {DENIAL_REASONS['TOKEN_ALREADY_CONSUMED']}")

    # Gate check
    validation = validate_authorization_token(
        token=token,
        action=intent["tool_name"],
        tool_args=intent["tool_args"],
    )

    if not validation["valid"]:
        denial_reasons = extract_denial_reasons(validation)
        intent["status"] = "denied"
        raise PermissionError(
            f"GATE_DENIED: {', '.join(denial_reasons)} — "
            f"Failed checks: {[c['check'] for c in validation['checks'] if c['status'] == 'FAIL']}"
        )

    # Dispatch to adapter
    now = datetime.now(timezone.utc).isoformat()
    if adapter_fn:
        result = adapter_fn(intent, token)
    else:
        result = {"dry_run": True, "intent_id": intent_id}

    # Generate receipt
    ledger_entry_id = f"LE-{uuid.uuid4().hex[:12]}"
    receipt = generate_canonical_receipt(
        intent_id=intent_id,
        proposer_id=intent["proposer_id"],
        approver_id=intent["approval_id"],
        token_id=token_id,
        action=intent["tool_name"],
        success=True,
        result=result,
        executor=executor_id,
        ledger_entry_id=ledger_entry_id,
        timestamp_proposed=intent["created_at"],
        timestamp_approved=intent["approved_at"],
    )

    # Burn token
    burn_authorization_token(token_id)

    # Update intent
    intent["status"] = "executed"
    intent["executed_at"] = now
    intent["receipt_id"] = receipt["receipt_id"]

    return {
        "intent": intent,
        "receipt": receipt,
        "validation": validation,
    }


# ═══════════════════════════════════════════════════════════════
# RESET (for testing)
# ═══════════════════════════════════════════════════════════════

def reset_orchestrator_state():
    """Reset all in-memory state. Used only in tests."""
    _intents.clear()
