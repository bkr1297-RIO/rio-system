"""
RIO Execution Gate — Hard Enforcement Layer
============================================
Version: 1.0.0
Purpose: No AI-initiated action executes unless it passes through execute_action()
         with a valid ECDSA execution token from the RIO control plane.

This module provides:
  - execute_action(action_name, parameters, execution_token)
  - verify_token(token)
  - generate_receipt(action_name, parameters, result, token_data)
  - verify_receipt(receipt)
  - view_audit_log(intent_id)

Enforcement is structural, not advisory. The agent cannot bypass this.
"""

import hashlib
import hmac
import json
import os
import sqlite3
import threading
import time
from datetime import datetime, timezone
from typing import Any, Optional

# ---------------------------------------------------------------------------
# ECDSA imports (secp256k1 — same curve as the sovereign gate)
# ---------------------------------------------------------------------------
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.exceptions import InvalidSignature
import base64


# ===========================================================================
# Configuration
# ===========================================================================

DB_PATH = os.environ.get("RIO_LEDGER_DB", "gateway.db")
ECDSA_PUBLIC_KEY_PEM = os.environ.get("RIO_ECDSA_PUBLIC_KEY", "")
RECEIPT_SIGNING_KEY = os.environ.get("RIO_RECEIPT_KEY", "rio-receipt-signing-key-v1")

# Thread lock for ledger writes (SQLite is not fully thread-safe)
_ledger_lock = threading.Lock()


# ===========================================================================
# Database Initialization
# ===========================================================================

def _init_db():
    """Create the execution_ledger table if it doesn't exist.
    This is a separate table from the gateway's existing ledger,
    specifically for execution-layer events."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS execution_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            action TEXT NOT NULL,
            agent TEXT DEFAULT 'unknown',
            approver TEXT DEFAULT 'unknown',
            executed_by TEXT DEFAULT 'RIO Control Plane',
            intent_id TEXT,
            parameters_hash TEXT NOT NULL,
            result TEXT NOT NULL CHECK(result IN ('executed', 'blocked')),
            reason TEXT,
            receipt_hash TEXT,
            prev_hash TEXT NOT NULL,
            entry_hash TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


def _get_last_hash() -> str:
    """Get the hash of the last ledger entry for hash-chain continuity."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.execute(
        "SELECT entry_hash FROM execution_ledger ORDER BY id DESC LIMIT 1"
    )
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else "GENESIS"


def _compute_entry_hash(entry: dict) -> str:
    """Compute SHA-256 hash of a ledger entry for tamper detection."""
    canonical = json.dumps(entry, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


# ===========================================================================
# Token Verification (ECDSA secp256k1)
# ===========================================================================

def verify_token(token: dict) -> dict:
    """
    Verify an execution token from the RIO control plane.

    Token structure:
    {
        "intent_id": "INT-xxx",
        "intent": "action description",
        "signature": "base64-encoded ECDSA signature",
        "timestamp": "ISO-8601 timestamp",
        "nonce": "unique nonce",
        "approver": "human approver identity",
        "agent": "AI agent name"
    }

    Returns:
        {
            "valid": True/False,
            "reason": "explanation",
            "intent_id": "...",
            "approver": "...",
            "agent": "..."
        }
    """
    result = {
        "valid": False,
        "reason": "",
        "intent_id": token.get("intent_id", "UNKNOWN"),
        "approver": token.get("approver", "unknown"),
        "agent": token.get("agent", "unknown"),
    }

    # --- Check 1: Token must exist and have required fields ---
    required_fields = ["intent", "signature", "timestamp"]
    for field in required_fields:
        if field not in token or not token[field]:
            result["reason"] = f"Missing required field: {field}"
            return result

    # --- Check 2: Timestamp freshness (300-second window) ---
    try:
        token_time = datetime.fromisoformat(
            token["timestamp"].replace("Z", "+00:00")
        )
        now = datetime.now(timezone.utc)
        age_seconds = abs((now - token_time).total_seconds())
        if age_seconds > 300:
            result["reason"] = f"Token expired: {age_seconds:.0f}s old (max 300s)"
            return result
    except (ValueError, TypeError) as e:
        result["reason"] = f"Invalid timestamp format: {e}"
        return result

    # --- Check 3: ECDSA signature verification ---
    if not ECDSA_PUBLIC_KEY_PEM:
        result["reason"] = "No ECDSA public key configured — fail closed"
        return result

    try:
        public_key = serialization.load_pem_public_key(
            ECDSA_PUBLIC_KEY_PEM.encode()
        )
        # The signed message is: intent + timestamp (matching the gateway's signing)
        message = f"{token['intent']}|{token['timestamp']}"
        signature_bytes = base64.b64decode(token["signature"])

        public_key.verify(
            signature_bytes,
            message.encode(),
            ec.ECDSA(hashes.SHA256())
        )
        result["valid"] = True
        result["reason"] = "Signature verified — execution authorized"
    except InvalidSignature:
        result["reason"] = "ECDSA signature verification failed — forged or tampered"
    except Exception as e:
        result["reason"] = f"Signature verification error — fail closed: {e}"

    return result


# ===========================================================================
# Ledger Write (Append-Only, Hash-Chained)
# ===========================================================================

def _write_ledger_entry(
    action: str,
    agent: str,
    approver: str,
    intent_id: str,
    parameters_hash: str,
    result: str,
    reason: str = "",
    receipt_hash: str = "",
) -> dict:
    """Write a single entry to the execution ledger with hash chaining."""
    with _ledger_lock:
        prev_hash = _get_last_hash()
        timestamp = datetime.now(timezone.utc).isoformat()

        entry = {
            "timestamp": timestamp,
            "action": action,
            "agent": agent,
            "approver": approver,
            "executed_by": "RIO Control Plane",
            "intent_id": intent_id,
            "parameters_hash": parameters_hash,
            "result": result,
            "reason": reason,
            "receipt_hash": receipt_hash,
            "prev_hash": prev_hash,
        }
        entry_hash = _compute_entry_hash(entry)
        entry["entry_hash"] = entry_hash

        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            """INSERT INTO execution_ledger 
               (timestamp, action, agent, approver, executed_by, intent_id,
                parameters_hash, result, reason, receipt_hash, prev_hash, entry_hash)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                timestamp, action, agent, approver, "RIO Control Plane",
                intent_id, parameters_hash, result, reason, receipt_hash,
                prev_hash, entry_hash,
            ),
        )
        conn.commit()
        conn.close()

        return entry


# ===========================================================================
# Receipt Generation & Verification
# ===========================================================================

def generate_receipt(
    action_name: str,
    parameters: dict,
    execution_result: Any,
    token_data: dict,
) -> dict:
    """
    Generate a cryptographic receipt after successful execution.

    The receipt is HMAC-signed and includes all execution metadata
    so it can be independently verified.
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    intent_id = token_data.get("intent_id", "UNKNOWN")

    receipt_body = {
        "intent_id": intent_id,
        "action": action_name,
        "timestamp": timestamp,
        "approver": token_data.get("approver", "unknown"),
        "agent": token_data.get("agent", "unknown"),
        "executed_by": "RIO Control Plane",
        "policy_result": "APPROVED — signature verified, token valid",
        "parameters_hash": hashlib.sha256(
            json.dumps(parameters, sort_keys=True).encode()
        ).hexdigest(),
        "result_hash": hashlib.sha256(
            json.dumps(str(execution_result)).encode()
        ).hexdigest(),
    }

    # Get the latest ledger hash to anchor the receipt
    ledger_hash = _get_last_hash()
    receipt_body["ledger_hash"] = ledger_hash

    # Sign the receipt with HMAC-SHA256
    receipt_canonical = json.dumps(receipt_body, sort_keys=True, separators=(",", ":"))
    signature = hmac.new(
        RECEIPT_SIGNING_KEY.encode(),
        receipt_canonical.encode(),
        hashlib.sha256,
    ).hexdigest()

    receipt = {**receipt_body, "signature": signature}
    return receipt


def verify_receipt(receipt: dict) -> dict:
    """
    Verify a cryptographic receipt.

    Returns:
        {"valid": True/False, "reason": "..."}
    """
    if not receipt or not isinstance(receipt, dict):
        return {"valid": False, "reason": "Receipt is empty or malformed"}

    # Extract and remove the signature for verification
    provided_sig = receipt.get("signature")
    if not provided_sig:
        return {"valid": False, "reason": "Receipt has no signature"}

    receipt_body = {k: v for k, v in receipt.items() if k != "signature"}
    receipt_canonical = json.dumps(receipt_body, sort_keys=True, separators=(",", ":"))

    expected_sig = hmac.new(
        RECEIPT_SIGNING_KEY.encode(),
        receipt_canonical.encode(),
        hashlib.sha256,
    ).hexdigest()

    if hmac.compare_digest(provided_sig, expected_sig):
        return {"valid": True, "reason": "Receipt signature verified — authentic"}
    else:
        return {"valid": False, "reason": "Receipt signature mismatch — tampered or forged"}


# ===========================================================================
# Audit Log Viewer
# ===========================================================================

def view_audit_log(intent_id: Optional[str] = None) -> list:
    """
    View the execution audit log.

    If intent_id is provided, returns entries for that specific intent.
    Otherwise returns the most recent 50 entries.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    if intent_id:
        cursor = conn.execute(
            "SELECT * FROM execution_ledger WHERE intent_id = ? ORDER BY id ASC",
            (intent_id,),
        )
    else:
        cursor = conn.execute(
            "SELECT * FROM execution_ledger ORDER BY id DESC LIMIT 50"
        )

    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def verify_ledger_integrity() -> dict:
    """
    Verify the hash chain integrity of the entire execution ledger.

    Returns:
        {"valid": True/False, "entries_checked": N, "first_broken": index or None}
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.execute("SELECT * FROM execution_ledger ORDER BY id ASC")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()

    if not rows:
        return {"valid": True, "entries_checked": 0, "first_broken": None}

    prev_hash = "GENESIS"
    for i, row in enumerate(rows):
        # Check prev_hash chain
        if row["prev_hash"] != prev_hash:
            return {
                "valid": False,
                "entries_checked": i + 1,
                "first_broken": i + 1,
                "reason": f"Entry {i+1}: prev_hash mismatch",
            }

        # Recompute entry hash
        entry = {k: v for k, v in row.items() if k not in ("id", "entry_hash")}
        expected_hash = _compute_entry_hash(entry)
        if row["entry_hash"] != expected_hash:
            return {
                "valid": False,
                "entries_checked": i + 1,
                "first_broken": i + 1,
                "reason": f"Entry {i+1}: entry_hash tampered",
            }

        prev_hash = row["entry_hash"]

    return {"valid": True, "entries_checked": len(rows), "first_broken": None}


# ===========================================================================
# CORE: execute_action() — The Hard Gate
# ===========================================================================

def execute_action(
    action_name: str,
    parameters: dict,
    execution_token: dict,
    executor_fn: callable = None,
) -> dict:
    """
    THE EXECUTION GATE.

    No AI-initiated action may execute unless it passes through this function
    with a valid execution token from the RIO control plane.

    Args:
        action_name:      Name of the action (e.g., "send_email", "call_anthropic")
        parameters:       Action parameters (e.g., {"to": "...", "subject": "..."})
        execution_token:  Token from the control plane containing ECDSA signature
        executor_fn:      The actual function to call if authorized (callable)

    Returns:
        {
            "status": "executed" | "blocked",
            "reason": "...",
            "receipt": {...} | None,
            "ledger_entry": {...}
        }
    """
    parameters_hash = hashlib.sha256(
        json.dumps(parameters, sort_keys=True).encode()
    ).hexdigest()

    # -----------------------------------------------------------------------
    # STEP 1: Verify the execution token
    # -----------------------------------------------------------------------
    if not execution_token:
        # NO TOKEN — BLOCK IMMEDIATELY
        ledger_entry = _write_ledger_entry(
            action=action_name,
            agent="unknown",
            approver="NONE",
            intent_id="NONE",
            parameters_hash=parameters_hash,
            result="blocked",
            reason="No execution token provided — unauthorized",
        )
        return {
            "status": "blocked",
            "reason": "No execution token provided. All actions require human approval.",
            "receipt": None,
            "ledger_entry": ledger_entry,
        }

    verification = verify_token(execution_token)

    if not verification["valid"]:
        # INVALID TOKEN — BLOCK AND LOG
        ledger_entry = _write_ledger_entry(
            action=action_name,
            agent=verification.get("agent", "unknown"),
            approver="NONE",
            intent_id=verification.get("intent_id", "UNKNOWN"),
            parameters_hash=parameters_hash,
            result="blocked",
            reason=f"Token verification failed: {verification['reason']}",
        )
        return {
            "status": "blocked",
            "reason": f"Execution blocked: {verification['reason']}",
            "receipt": None,
            "ledger_entry": ledger_entry,
        }

    # -----------------------------------------------------------------------
    # STEP 2: Token is valid — execute the action
    # -----------------------------------------------------------------------
    execution_result = None
    try:
        if executor_fn and callable(executor_fn):
            execution_result = executor_fn(parameters)
        else:
            execution_result = {
                "status": "simulated",
                "message": f"Action '{action_name}' would execute with verified token",
            }
    except Exception as e:
        # Execution error — still log it
        ledger_entry = _write_ledger_entry(
            action=action_name,
            agent=verification["agent"],
            approver=verification["approver"],
            intent_id=verification["intent_id"],
            parameters_hash=parameters_hash,
            result="blocked",
            reason=f"Execution error: {str(e)}",
        )
        return {
            "status": "blocked",
            "reason": f"Execution failed: {str(e)}",
            "receipt": None,
            "ledger_entry": ledger_entry,
        }

    # -----------------------------------------------------------------------
    # STEP 3: Generate cryptographic receipt
    # -----------------------------------------------------------------------
    receipt = generate_receipt(
        action_name=action_name,
        parameters=parameters,
        execution_result=execution_result,
        token_data=execution_token,
    )

    # -----------------------------------------------------------------------
    # STEP 4: Write to ledger
    # -----------------------------------------------------------------------
    ledger_entry = _write_ledger_entry(
        action=action_name,
        agent=verification["agent"],
        approver=verification["approver"],
        intent_id=verification["intent_id"],
        parameters_hash=parameters_hash,
        result="executed",
        reason="Authorized execution — token verified",
        receipt_hash=receipt["signature"],
    )

    return {
        "status": "executed",
        "reason": "Action executed with valid human approval",
        "result": execution_result,
        "receipt": receipt,
        "ledger_entry": ledger_entry,
    }


# ===========================================================================
# Initialization
# ===========================================================================

# Initialize the database on import
_init_db()
