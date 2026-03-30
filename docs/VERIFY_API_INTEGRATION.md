# RIO Verification API — Integration Guide

**Base URL:** `https://riodemo-ux2sxdqo.manus.space/api/verify`
**Authentication:** None required (public, read-only)
**CORS:** Enabled for all origins (`Access-Control-Allow-Origin: *`)
**Protocol:** HTTPS only

---

## Overview

The RIO Verification API allows any external system to independently verify that an action was governed, authorized, executed, and recorded in the tamper-evident ledger. This endpoint is intentionally separate from the tRPC router so that external sites (including the protocol site at `rioprotocol-q9cry3ny.manus.space`) can call it cross-origin without authentication.

Every response includes the `fail_mode: "CLOSED"` field, confirming that the system cannot verify what it cannot find — it never returns a false positive.

---

## Endpoints

### 1. Verify a Receipt

```
GET /api/verify/:identifier
```

Looks up a receipt by any of the following identifiers:

| Identifier Type | Format | Example |
|---|---|---|
| Receipt ID | `RIO-XXXXXXXX` | `RIO-e76156e6` |
| Receipt Hash | 64-char hex SHA-256 | `a1b2c3d4e5f6...` |
| Intent ID | `INT-XXXXXXXX` | `INT-abc12345` |

**Response (200 — Verified):**

```json
{
  "status": "VERIFIED",
  "identifier": "RIO-e76156e6",
  "receipt_valid": true,
  "hash_valid": true,
  "signature_valid": true,
  "ledger_recorded": true,
  "ledger_signature_valid": true,
  "chain_position": 1,
  "fully_verified": true,
  "receipt": {
    "receipt_id": "RIO-e76156e6",
    "intent_id": "INT-abc12345",
    "intent_hash": "...",
    "action": "send_email",
    "action_hash": "...",
    "requested_by": "Bondi AI",
    "approved_by": "Brian Rasmussen",
    "decision": "approved",
    "execution_status": "EXECUTED",
    "timestamp_request": "2026-03-29T22:44:00.000Z",
    "timestamp_approval": "2026-03-29T22:44:15.000Z",
    "timestamp_execution": "2026-03-29T22:44:16.000Z",
    "verification_status": "verified",
    "verification_hash": "...",
    "risk_score": 30,
    "risk_level": "Low",
    "receipt_hash": "...",
    "previous_hash": "0000000000000000",
    "protocol_version": "v2"
  },
  "ledger_entry": {
    "block_id": "BLK-...",
    "receipt_hash": "...",
    "previous_hash": "...",
    "current_hash": "...",
    "protocol_version": "v2",
    "timestamp": "2026-03-29T22:44:16.000Z"
  },
  "intent": {
    "action": "send_email",
    "description": "Send email to jane@company.com",
    "requested_by": "Bondi AI",
    "status": "executed",
    "created_at": "2026-03-29T22:44:00.000Z"
  },
  "approval": {
    "decision": "approved",
    "decided_by": "Brian Rasmussen",
    "decided_at": "2026-03-29T22:44:15.000Z"
  },
  "verified_at": "2026-03-30T01:00:00.000Z",
  "system": "RIO Governance Gateway v2.0",
  "fail_mode": "CLOSED",
  "algorithm": "Ed25519",
  "note": "This receipt is independently verifiable..."
}
```

**Response (404 — Not Found):**

```json
{
  "status": "NOT_FOUND",
  "identifier": "RIO-invalid",
  "message": "No receipt found matching this identifier.",
  "receipt_valid": false,
  "ledger_valid": false,
  "signature_valid": false
}
```

**Response (503 — System Offline):**

```json
{
  "status": "SYSTEM_OFFLINE",
  "message": "Verification system is offline. Fail-closed: cannot verify.",
  "receipt_valid": false,
  "ledger_valid": false,
  "signature_valid": false
}
```

**Status values:**

| Status | Meaning |
|---|---|
| `VERIFIED` | Receipt hash valid, Ed25519 signature valid, ledger entry found and signed |
| `PARTIALLY_VERIFIED` | Receipt signature valid but ledger entry could not be fully verified |
| `INVALID` | Verification failed — receipt may have been tampered with |
| `NOT_FOUND` | No receipt matches the identifier |
| `SYSTEM_OFFLINE` | Database unavailable — fail-closed, no verification possible |
| `ERROR` | Internal error — fail-closed |

---

### 2. Get Ledger Chain

```
GET /api/verify/ledger/chain?limit=50
```

Returns the full ledger chain with integrity verification. Each entry links to the previous via `previous_hash → current_hash`, forming a tamper-evident chain.

**Query Parameters:**

| Parameter | Type | Default | Max | Description |
|---|---|---|---|---|
| `limit` | integer | 50 | 200 | Number of entries to return |

**Response:**

```json
{
  "status": "ONLINE",
  "entries": [
    {
      "block_id": "BLK-genesis",
      "intent_id": "INT-...",
      "action": "send_email",
      "decision": "approved",
      "receipt_hash": "...",
      "previous_hash": "0000000000000000",
      "current_hash": "...",
      "signature_valid": true,
      "protocol_version": "v2",
      "timestamp": "2026-03-29T22:44:16.000Z",
      "recorded_by": "RIO System"
    }
  ],
  "total": 1,
  "chainValid": true,
  "signaturesValid": true,
  "chainErrors": [],
  "verifiedAt": "2026-03-30T01:00:00.000Z",
  "system": "RIO Governance Gateway v2.0",
  "failMode": "CLOSED"
}
```

---

### 3. Get Ledger Statistics

```
GET /api/verify/ledger/stats
```

Returns aggregate statistics about the ledger.

**Response:**

```json
{
  "status": "ONLINE",
  "ledger_entries": 42,
  "receipts": 42,
  "intents": 50,
  "latest_block": {
    "block_id": "BLK-...",
    "current_hash": "...",
    "timestamp": "2026-03-30T00:30:00.000Z"
  },
  "genesis_block": {
    "block_id": "BLK-genesis",
    "current_hash": "...",
    "timestamp": "2026-03-29T22:44:16.000Z"
  },
  "verifiedAt": "2026-03-30T01:00:00.000Z",
  "system": "RIO Governance Gateway v2.0",
  "failMode": "CLOSED"
}
```

---

### 4. Get Public Key

```
GET /api/verify/public-key
```

Returns the Ed25519 public key used to sign all receipts and ledger entries. External verifiers can use this to independently verify signatures without trusting the API.

**Response:**

```json
{
  "algorithm": "Ed25519",
  "format": "SPKI",
  "hex": "302a300506032b6570032100...",
  "pem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n",
  "usage": "Verify receipt and ledger signatures. Use crypto.verify(null, data, publicKey, signature) with Node.js crypto module.",
  "system": "RIO Governance Gateway v2.0",
  "failMode": "CLOSED"
}
```

---

## Integration Examples

### JavaScript (Browser — Protocol Site "Verify" Button)

```javascript
async function verifyReceipt(identifier) {
  const BASE = "https://riodemo-ux2sxdqo.manus.space/api/verify";
  
  const response = await fetch(`${BASE}/${encodeURIComponent(identifier)}`);
  const result = await response.json();
  
  if (result.status === "VERIFIED") {
    // Show green checkmark — receipt is valid and ledger-recorded
    console.log("Receipt verified:", result.receipt.receipt_id);
    console.log("Approved by:", result.approval.decided_by);
    console.log("Chain position:", result.chain_position);
  } else if (result.status === "NOT_FOUND") {
    // Show "not found" message
    console.log("No receipt found for:", identifier);
  } else {
    // Show warning — verification failed
    console.log("Verification failed:", result.note);
  }
}
```

### cURL (Command Line)

```bash
# Verify a specific receipt
curl https://riodemo-ux2sxdqo.manus.space/api/verify/RIO-e76156e6

# Get the full ledger chain
curl https://riodemo-ux2sxdqo.manus.space/api/verify/ledger/chain

# Get ledger statistics
curl https://riodemo-ux2sxdqo.manus.space/api/verify/ledger/stats

# Get the public key for independent verification
curl https://riodemo-ux2sxdqo.manus.space/api/verify/public-key
```

### Python (Independent Verifier)

```python
import requests
import json

BASE = "https://riodemo-ux2sxdqo.manus.space/api/verify"

# Verify by receipt ID
result = requests.get(f"{BASE}/RIO-e76156e6").json()
print(f"Status: {result['status']}")
print(f"Fully verified: {result['fully_verified']}")

# Get and display the ledger chain
chain = requests.get(f"{BASE}/ledger/chain").json()
print(f"Chain valid: {chain['chainValid']}")
print(f"Signatures valid: {chain['signaturesValid']}")
print(f"Total entries: {chain['total']}")
```

---

## Genesis Receipt

The first real governed action was executed at 4:44 PM MDT on March 29, 2026. An email was sent through the full RIO governance pipeline, generating a 5-link SHA-256 hash chain receipt.

**Receipt ID:** `e76156e6-34cc-43f0-83b0-69a85c86762a`

This receipt is seeded as the genesis entry in the persistent ledger with `previous_hash: "0000000000000000"` — the anchor of the entire chain.

To verify the genesis receipt:

```bash
curl https://riodemo-ux2sxdqo.manus.space/api/verify/e76156e6-34cc-43f0-83b0-69a85c86762a
```

---

## Security Properties

| Property | Implementation |
|---|---|
| **Fail-closed** | System returns `false` for all verification fields when offline or in error state |
| **No authentication** | Endpoint is public and read-only — anyone can verify |
| **CORS enabled** | `Access-Control-Allow-Origin: *` — callable from any domain |
| **Tamper-evident** | Hash chain links each entry to the previous; any modification breaks the chain |
| **Cryptographic signatures** | Ed25519 signatures on every receipt and ledger entry |
| **Independent verification** | Public key available at `/api/verify/public-key` for offline signature verification |
| **Append-only** | Ledger entries cannot be modified or deleted after creation |

---

## For Protocol Site Integration

The protocol site at `rioprotocol-q9cry3ny.manus.space` can wire its "Verify" button to this API:

1. Add an input field where users paste a receipt ID, receipt hash, or intent ID
2. On submit, call `GET https://riodemo-ux2sxdqo.manus.space/api/verify/{identifier}`
3. Display the verification result with status badges:
   - Green: `VERIFIED` — receipt is valid, signed, and ledger-recorded
   - Yellow: `PARTIALLY_VERIFIED` — receipt signature valid but ledger incomplete
   - Red: `INVALID` — verification failed
   - Gray: `NOT_FOUND` — no matching receipt
4. Optionally show the full receipt details, ledger entry, and chain position

No API key, authentication, or special headers required. The endpoint is designed for public, cross-origin access.
