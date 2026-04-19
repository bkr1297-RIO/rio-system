"""
RIO Drive Adapter — Governed Google Drive Execution
════════════════════════════════════════════════════
Reference implementation (Python) of the TypeScript DriveAdapter
in the live RIO system (rio-proxy/server/adapters/DriveAdapter.ts).

Pattern: Gate → Pending → Execute → Verify → Receipt
- Single public method: execute_drive_op(proposal, token)
- Private execution: _perform(), _verify(), _write_receipt()
- Module-scoped credentials: _get_drive_token() (not exported)
- PhaseTracker enforces: INIT → GATE_PASSED → PENDING_WRITTEN → EXECUTED → VERIFIED → RECEIPT_WRITTEN

Credential Isolation:
  Drive OAuth tokens are accessed ONLY through _get_drive_token(),
  which is module-private and never exported.
"""

import os
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

def _get_drive_token() -> Optional[str]:
    """Module-private credential accessor. Never exported."""
    return os.environ.get("GOOGLE_DRIVE_TOKEN")


# Test mode support
_test_mode = False
_virtual_drive: dict[str, dict] = {}


def _enable_test_mode():
    global _test_mode
    _test_mode = True


def _disable_test_mode():
    global _test_mode, _virtual_drive
    _test_mode = False
    _virtual_drive.clear()


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
    def __init__(self):
        self._current = Phase.INIT

    def advance(self, target: Phase) -> None:
        current_idx = _PHASE_ORDER.index(self._current)
        target_idx = _PHASE_ORDER.index(target)
        if target_idx != current_idx + 1:
            raise RuntimeError(
                f"PHASE_VIOLATION: Cannot advance from {self._current.value} "
                f"to {target.value}"
            )
        self._current = target

    @property
    def current(self) -> Phase:
        return self._current


# ═══════════════════════════════════════════════════════════════
# TYPES
# ═══════════════════════════════════════════════════════════════

@dataclass
class DriveProposal:
    intent_id: str
    action: str          # "create" | "read" | "update" | "delete"
    file_name: str
    content: str = ""
    file_id: Optional[str] = None
    tool_name: str = "drive_operation"
    tool_args: dict = field(default_factory=dict)

    def __post_init__(self):
        if not self.tool_args:
            self.tool_args = {
                "action": self.action,
                "file_name": self.file_name,
                "content": self.content,
            }
            if self.file_id:
                self.tool_args["file_id"] = self.file_id


@dataclass
class DriveAdapterReceipt:
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

def _perform(proposal: DriveProposal) -> dict:
    """Private execution — performs Drive operation."""
    if _test_mode:
        return _perform_virtual(proposal)

    # Production: use Google Drive API with _get_drive_token()
    token = _get_drive_token()
    if not token:
        raise RuntimeError("DRIVE_ERROR: No Drive token available")

    # Real implementation would use requests/httpx to call Drive API
    raise NotImplementedError("Production Drive execution requires HTTP client")


def _perform_virtual(proposal: DriveProposal) -> dict:
    """Virtual Drive for testing — no real API calls."""
    if proposal.action == "create":
        file_id = f"VFILE-{uuid.uuid4().hex[:8]}"
        _virtual_drive[file_id] = {
            "name": proposal.file_name,
            "content": proposal.content,
        }
        return {"file_id": file_id, "name": proposal.file_name, "action": "created"}

    elif proposal.action == "read":
        fid = proposal.file_id or ""
        entry = _virtual_drive.get(fid)
        if not entry:
            return {"error": "File not found", "action": "read"}
        return {"file_id": fid, "name": entry["name"], "content": entry["content"], "action": "read"}

    elif proposal.action == "update":
        fid = proposal.file_id or ""
        if fid not in _virtual_drive:
            return {"error": "File not found", "action": "update"}
        _virtual_drive[fid]["content"] = proposal.content
        return {"file_id": fid, "name": _virtual_drive[fid]["name"], "action": "updated"}

    elif proposal.action == "delete":
        fid = proposal.file_id or ""
        if fid in _virtual_drive:
            del _virtual_drive[fid]
        return {"file_id": fid, "action": "deleted"}

    return {"error": f"Unknown action: {proposal.action}"}


def _verify(proposal: DriveProposal, result: dict) -> bool:
    """Verify execution output matches the proposal."""
    if "error" in result:
        return False
    if proposal.action == "create":
        return result.get("action") == "created" and result.get("name") == proposal.file_name
    elif proposal.action == "read":
        return result.get("action") == "read" and result.get("file_id") == proposal.file_id
    elif proposal.action == "update":
        return result.get("action") == "updated"
    elif proposal.action == "delete":
        return result.get("action") == "deleted"
    return False


def _write_receipt(proposal: DriveProposal, result: dict, token_id: str) -> DriveAdapterReceipt:
    """Write a receipt for the governed Drive action."""
    receipt_id = f"DRCPT-{uuid.uuid4().hex[:16]}"
    receipt_hash = compute_hash(canonical_json({
        "receipt_id": receipt_id,
        "intent_id": proposal.intent_id,
        "token_id": token_id,
        "result": result,
    }))
    return DriveAdapterReceipt(
        receipt_id=receipt_id,
        intent_id=proposal.intent_id,
        adapter="DriveAdapter",
        action=proposal.tool_name,
        status="SUCCESS",
        receipt_hash=receipt_hash,
        timestamp=datetime.now(timezone.utc).isoformat(),
        details=result,
    )


# ═══════════════════════════════════════════════════════════════
# PUBLIC API — Single method
# ═══════════════════════════════════════════════════════════════

def execute_drive_op(proposal: DriveProposal, token: dict) -> DriveAdapterReceipt:
    """
    Governed Drive operation — the ONLY public entry point.

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
    tracker.advance(Phase.PENDING_WRITTEN)

    # ── EXECUTE ──
    result = _perform(proposal)
    tracker.advance(Phase.EXECUTED)

    # ── VERIFY ──
    if not _verify(proposal, result):
        raise RuntimeError("VERIFICATION_FAILED: Drive output does not match proposal")
    tracker.advance(Phase.VERIFIED)

    # ── RECEIPT ──
    receipt = _write_receipt(proposal, result, token["token_id"])
    burn_authorization_token(token["token_id"])
    tracker.advance(Phase.RECEIPT_WRITTEN)

    return receipt
