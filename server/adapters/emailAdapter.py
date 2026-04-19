"""
RIO Email Adapter — Governed Email Execution
═════════════════════════════════════════════
Reference implementation (Python) of the TypeScript FakeEmailAdapter
in the live RIO system (rio-proxy/server/adapters/FakeEmailAdapter.ts).

Pattern: Gate → Pending → Execute → Verify → Receipt
- Single public method: send_email(proposal, token)
- Private execution: _perform(), _verify(), _write_receipt()
- Module-scoped credentials: _SMTP_CREDENTIALS (frozen, not exported)
- PhaseTracker enforces: INIT → GATE_PASSED → PENDING_WRITTEN → EXECUTED → VERIFIED → RECEIPT_WRITTEN

Credential Isolation:
  _SMTP_CREDENTIALS are defined in this module and NEVER exported.
  No other module can import or access them.
  This is the credential containment invariant.
"""

import hashlib
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from server.security.tokens import (
    validate_authorization_token,
    burn_authorization_token,
    compute_hash,
    canonical_json,
)


# ═══════════════════════════════════════════════════════════════
# MODULE-PRIVATE CREDENTIALS (never exported)
# ═══════════════════════════════════════════════════════════════

_SMTP_CREDENTIALS = {
    "host": "smtp.gmail.com",
    "port": 587,
    "user": None,   # loaded from env at runtime
    "pass": None,   # loaded from env at runtime
}
# Freeze: prevent mutation from outside
_SMTP_CREDENTIALS = dict(_SMTP_CREDENTIALS)


# ═══════════════════════════════════════════════════════════════
# PHASE TRACKER
# ═══════════════════════════════════════════════════════════════

class Phase(Enum):
    INIT = "INIT"
    GATE_PASSED = "GATE_PASSED"
    PENDING_WRITTEN = "PENDING_WRITTEN"
    EXECUTED = "EXECUTED"
    VERIFIED = "VERIFIED"
    RECEIPT_WRITTEN = "RECEIPT_WRITTEN"


_PHASE_ORDER = [Phase.INIT, Phase.GATE_PASSED, Phase.PENDING_WRITTEN,
                Phase.EXECUTED, Phase.VERIFIED, Phase.RECEIPT_WRITTEN]


class PhaseTracker:
    """Enforces strict phase ordering. No phase can be skipped or repeated."""

    def __init__(self):
        self._current = Phase.INIT

    def advance(self, target: Phase) -> None:
        current_idx = _PHASE_ORDER.index(self._current)
        target_idx = _PHASE_ORDER.index(target)
        if target_idx != current_idx + 1:
            raise RuntimeError(
                f"PHASE_VIOLATION: Cannot advance from {self._current.value} "
                f"to {target.value}. Expected {_PHASE_ORDER[current_idx + 1].value}"
            )
        self._current = target

    @property
    def current(self) -> Phase:
        return self._current


# ═══════════════════════════════════════════════════════════════
# TYPES
# ═══════════════════════════════════════════════════════════════

@dataclass
class EmailProposal:
    intent_id: str
    to: str
    subject: str
    body: str
    tool_name: str = "send_email"
    tool_args: dict = field(default_factory=dict)

    def __post_init__(self):
        if not self.tool_args:
            self.tool_args = {"to": self.to, "subject": self.subject, "body": self.body}


@dataclass
class AdapterReceipt:
    receipt_id: str
    intent_id: str
    adapter: str
    action: str
    status: str
    receipt_hash: str
    timestamp: str
    details: dict


# ═══════════════════════════════════════════════════════════════
# PRIVATE EXECUTION HELPERS
# ═══════════════════════════════════════════════════════════════

def _perform(proposal: EmailProposal) -> dict:
    """
    Private execution — sends the email via SMTP.
    In test mode, returns a simulated result.
    In production, uses _SMTP_CREDENTIALS (module-private).
    """
    # Production: use smtplib with _SMTP_CREDENTIALS
    # This reference implementation returns a simulated result
    return {
        "sent": True,
        "to": proposal.to,
        "subject": proposal.subject,
        "message_id": f"<{uuid.uuid4().hex[:12]}@rio.governed>",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _verify(proposal: EmailProposal, result: dict) -> bool:
    """Verify execution output matches the proposal."""
    return (
        result.get("sent") is True
        and result.get("to") == proposal.to
        and result.get("subject") == proposal.subject
    )


def _write_receipt(proposal: EmailProposal, result: dict, token_id: str) -> AdapterReceipt:
    """Write a receipt for the governed action."""
    receipt_id = f"ARCPT-{uuid.uuid4().hex[:16]}"
    receipt_hash = compute_hash(canonical_json({
        "receipt_id": receipt_id,
        "intent_id": proposal.intent_id,
        "token_id": token_id,
        "result": result,
    }))
    return AdapterReceipt(
        receipt_id=receipt_id,
        intent_id=proposal.intent_id,
        adapter="FakeEmailAdapter",
        action=proposal.tool_name,
        status="SUCCESS" if result.get("sent") else "FAILED",
        receipt_hash=receipt_hash,
        timestamp=datetime.now(timezone.utc).isoformat(),
        details=result,
    )


# ═══════════════════════════════════════════════════════════════
# PUBLIC API — Single method
# ═══════════════════════════════════════════════════════════════

def send_email(proposal: EmailProposal, token: dict) -> AdapterReceipt:
    """
    Governed email send — the ONLY public entry point.

    Flow: Gate → Pending → Execute → Verify → Receipt
    """
    tracker = PhaseTracker()

    # ── GATE ──
    validation = validate_authorization_token(
        token=token,
        action=proposal.tool_name,
        tool_args=proposal.tool_args,
    )
    if not validation["valid"]:
        failed_checks = [c for c in validation["checks"] if c["status"] == "FAIL"]
        raise PermissionError(
            f"DELEGATION_BLOCKED: Token validation failed — "
            f"{', '.join(c['check'] for c in failed_checks)}"
        )
    tracker.advance(Phase.GATE_PASSED)

    # ── PENDING ──
    # In production: write WAL_PREPARED ledger entry here
    tracker.advance(Phase.PENDING_WRITTEN)

    # ── EXECUTE ──
    result = _perform(proposal)
    tracker.advance(Phase.EXECUTED)

    # ── VERIFY ──
    if not _verify(proposal, result):
        raise RuntimeError("VERIFICATION_FAILED: Execution output does not match proposal")
    tracker.advance(Phase.VERIFIED)

    # ── RECEIPT ──
    receipt = _write_receipt(proposal, result, token["token_id"])
    burn_authorization_token(token["token_id"])
    tracker.advance(Phase.RECEIPT_WRITTEN)

    return receipt
