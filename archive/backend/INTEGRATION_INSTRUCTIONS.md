# RIO Execution Gate — Integration Instructions

## Overview

Two new files must be added to the RIO Router Gateway:

1. **`execution_gate.py`** — Core enforcement module with `execute_action()`, `verify_token()`, receipt generation, and hash-chained ledger
2. **`execution_middleware.py`** — FastAPI middleware that wraps all tool endpoints through the execution gate

## Integration Steps

### Step 1: Add both files to the project root

Place `execution_gate.py` and `execution_middleware.py` in the same directory as `main.py` (inside `artifacts/rio-gateway/`).

### Step 2: Add to main.py

At the end of `main.py`, after all routes are defined, add:

```python
# --- RIO Execution Gate Integration ---
from execution_gate import _init_db
from execution_middleware import wrap_tool_endpoints, add_gate_routes

# Initialize the execution ledger table
_init_db()

# Add management routes (/execution-gate/*)
add_gate_routes(app)

# Wrap all tool endpoints with the execution gate
# This MUST be called AFTER all routes are defined
wrap_tool_endpoints(app)
```

### Step 3: Install dependency (if not already present)

```bash
pip install cryptography
```

### Step 4: Set environment variables

The execution gate uses the same ECDSA key pair as the sovereign gate. Ensure these are set:

- `RIO_ECDSA_PUBLIC_KEY` — PEM-encoded secp256k1 public key
- `RIO_RECEIPT_KEY` — HMAC signing key for receipts (default provided)
- `RIO_LEDGER_DB` — Path to SQLite database (defaults to `gateway.db`)

### Step 5: Verify

After restart, check:
- `GET /execution-gate/status` — Should show all gated endpoints
- `POST /tools/send_email` without token — Should return 403
- `POST /intake` with valid signature — Should include execution receipt

## New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/execution-gate/verify-receipt` | Verify a cryptographic receipt |
| GET | `/execution-gate/audit-log` | View execution audit log |
| GET | `/execution-gate/audit-log/{intent_id}` | View log for specific intent |
| GET | `/execution-gate/integrity` | Verify ledger hash chain integrity |
| GET | `/execution-gate/status` | Gate status and statistics |
