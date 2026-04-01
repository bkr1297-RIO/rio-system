"""
RIO Execution Middleware — Intercepts All Tool Endpoints
=========================================================
Version: 1.0.0

This middleware wraps every tool endpoint in the RIO Gateway so that
no external action (AI calls, email, HTTP requests) can execute without
passing through execute_action() with a valid ECDSA execution token.

Integration:
  Import and call wrap_tool_endpoints(app) after all routes are defined.
  It replaces each tool handler with a gated version.

Endpoints wrapped:
  POST /intent              → AI model routing
  POST /tools/call_anthropic → Claude API
  POST /tools/call_openai    → GPT API
  POST /tools/call_gemini    → Gemini API
  POST /tools/http_request   → Outbound HTTP
  POST /tools/send_email     → Gmail API
  POST /store_message        → Cloud Bridge store
  POST /send_link_email      → Cloud Bridge email
  POST /recall_message       → Cloud Bridge recall
"""

import functools
import json
from datetime import datetime, timezone

from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse


# ---------------------------------------------------------------------------
# The middleware enforcement decorator
# ---------------------------------------------------------------------------

def require_execution_gate(original_handler, action_name: str):
    """
    Decorator that wraps a FastAPI endpoint handler with execution gate enforcement.

    The wrapper:
    1. Extracts the execution token from the request headers or body
    2. Calls execute_action() to verify authorization
    3. If blocked → returns 403 with audit trail
    4. If authorized → calls the original handler and attaches the receipt
    """

    @functools.wraps(original_handler)
    async def gated_handler(request: Request, *args, **kwargs):
        from execution_gate import execute_action, verify_token

        # --- Extract execution token from request ---
        # Token can be in:
        #   1. X-RIO-Execution-Token header (JSON-encoded)
        #   2. Request body "execution_token" field
        #   3. Derived from the /intake flow (signature in body)

        token = None

        # Try header first
        token_header = request.headers.get("X-RIO-Execution-Token")
        if token_header:
            try:
                token = json.loads(token_header)
            except json.JSONDecodeError:
                pass

        # Try body if no header token
        if not token:
            try:
                body = await request.json()
                if "execution_token" in body:
                    token = body["execution_token"]
                elif "signature" in body and "timestamp" in body:
                    # This is a signed intake request — extract token fields
                    token = {
                        "intent": body.get("intent", ""),
                        "signature": body.get("signature", ""),
                        "timestamp": body.get("timestamp", ""),
                        "nonce": body.get("nonce", ""),
                        "intent_id": body.get("intent_id", f"AUTO-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"),
                        "approver": body.get("approver", "human"),
                        "agent": body.get("agent", body.get("source", "unknown")),
                    }
            except Exception:
                pass

        # --- Extract parameters for logging ---
        try:
            parameters = await request.json()
        except Exception:
            parameters = {}

        # --- Call the execution gate ---
        gate_result = execute_action(
            action_name=action_name,
            parameters=parameters,
            execution_token=token,
        )

        if gate_result["status"] == "blocked":
            # BLOCKED — Return 403 with audit information
            return JSONResponse(
                status_code=403,
                content={
                    "status": "blocked",
                    "error": "Execution gate: unauthorized",
                    "reason": gate_result["reason"],
                    "action": action_name,
                    "ledger_entry": {
                        "timestamp": gate_result["ledger_entry"]["timestamp"],
                        "result": "blocked",
                        "entry_hash": gate_result["ledger_entry"]["entry_hash"],
                    },
                    "message": "No action executes without human approval. "
                               "This attempt has been logged to the tamper-evident ledger.",
                },
            )

        # AUTHORIZED — Call the original handler
        try:
            response = await original_handler(request, *args, **kwargs)

            # Attach receipt to response if possible
            if hasattr(response, "body"):
                try:
                    response_data = json.loads(response.body)
                    response_data["execution_receipt"] = gate_result["receipt"]
                    response_data["execution_ledger"] = {
                        "entry_hash": gate_result["ledger_entry"]["entry_hash"],
                        "prev_hash": gate_result["ledger_entry"]["prev_hash"],
                    }
                    return JSONResponse(
                        status_code=response.status_code,
                        content=response_data,
                    )
                except (json.JSONDecodeError, AttributeError):
                    pass

            return response

        except Exception as e:
            # Even if the handler fails, the gate already logged the attempt
            raise

    return gated_handler


# ---------------------------------------------------------------------------
# Endpoint wrapping function
# ---------------------------------------------------------------------------

# List of endpoints that MUST go through the execution gate
GATED_ENDPOINTS = {
    "/intent": "submit_intent",
    "/tools/call_anthropic": "call_anthropic",
    "/tools/call_openai": "call_openai",
    "/tools/call_gemini": "call_gemini",
    "/tools/http_request": "http_request",
    "/tools/send_email": "send_email",
    "/store_message": "store_message",
    "/send_link_email": "send_link_email",
    "/recall_message": "recall_message",
}


def wrap_tool_endpoints(app):
    """
    Wrap all tool endpoints with the execution gate middleware.

    Call this after all routes are defined in the FastAPI app.
    It replaces each matching route handler with a gated version.
    """
    for route in app.routes:
        if hasattr(route, "path") and route.path in GATED_ENDPOINTS:
            action_name = GATED_ENDPOINTS[route.path]
            original_endpoint = route.endpoint
            route.endpoint = require_execution_gate(original_endpoint, action_name)
            print(f"[RIO Execution Gate] Wrapped {route.path} → execute_action('{action_name}')")

    print(f"[RIO Execution Gate] {len(GATED_ENDPOINTS)} endpoints enforced. "
          f"No action executes without human approval.")


# ---------------------------------------------------------------------------
# FastAPI route additions for receipt verification and audit log
# ---------------------------------------------------------------------------

def add_gate_routes(app):
    """
    Add execution gate management routes to the FastAPI app.

    Routes added:
      POST /execution-gate/verify-receipt  — Verify a cryptographic receipt
      GET  /execution-gate/audit-log       — View execution audit log
      GET  /execution-gate/audit-log/{id}  — View log for specific intent
      GET  /execution-gate/integrity       — Verify ledger hash chain
      GET  /execution-gate/status          — Gate status and stats
    """
    from execution_gate import (
        verify_receipt,
        view_audit_log,
        verify_ledger_integrity,
    )

    @app.post("/execution-gate/verify-receipt")
    async def api_verify_receipt(request: Request):
        """Verify a cryptographic execution receipt."""
        try:
            receipt = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")

        result = verify_receipt(receipt)
        return result

    @app.get("/execution-gate/audit-log")
    async def api_audit_log(intent_id: str = None):
        """View the execution audit log."""
        entries = view_audit_log(intent_id)
        return {
            "entries": entries,
            "count": len(entries),
            "intent_id_filter": intent_id,
        }

    @app.get("/execution-gate/audit-log/{intent_id}")
    async def api_audit_log_by_id(intent_id: str):
        """View audit log entries for a specific intent."""
        entries = view_audit_log(intent_id)
        return {
            "entries": entries,
            "count": len(entries),
            "intent_id": intent_id,
        }

    @app.get("/execution-gate/integrity")
    async def api_verify_integrity():
        """Verify the hash chain integrity of the execution ledger."""
        result = verify_ledger_integrity()
        return result

    @app.get("/execution-gate/status")
    async def api_gate_status():
        """Execution gate status and statistics."""
        import sqlite3
        import os

        db_path = os.environ.get("RIO_LEDGER_DB", "gateway.db")
        conn = sqlite3.connect(db_path)

        total = conn.execute("SELECT COUNT(*) FROM execution_ledger").fetchone()[0]
        executed = conn.execute(
            "SELECT COUNT(*) FROM execution_ledger WHERE result='executed'"
        ).fetchone()[0]
        blocked = conn.execute(
            "SELECT COUNT(*) FROM execution_ledger WHERE result='blocked'"
        ).fetchone()[0]
        conn.close()

        integrity = verify_ledger_integrity()

        return {
            "status": "active",
            "version": "1.0.0",
            "enforcement": "hard — no bypass possible",
            "gated_endpoints": list(GATED_ENDPOINTS.keys()),
            "statistics": {
                "total_events": total,
                "executed": executed,
                "blocked": blocked,
                "block_rate": f"{(blocked/total*100):.1f}%" if total > 0 else "N/A",
            },
            "ledger_integrity": integrity,
        }

    print("[RIO Execution Gate] Management routes added at /execution-gate/*")
