# RIO Verification API — Integration Guide

**Base URL:** `https://riodemo-ux2sxdqo.manus.space/api/verify`
**Authentication:** None required (public, read-only)
**CORS:** Enabled for all origins (`Access-Control-Allow-Origin: *`)
**Protocol:** HTTPS only

---

## 1. Overview

The RIO Verification API is designed to provide transparent and auditable proof of AI actions. It allows any external system to independently verify the 7 RIO System Invariants, specifically proving that an action was governed, authorized by a human, executed safely, and recorded in the tamper-evident ledger. This endpoint is intentionally separate from the tRPC router so that external sites (including the protocol site at `rioprotocol-q9cry3ny.manus.space`) can call it cross-origin without authentication.

Every response includes the `fail_mode: "CLOSED"` field, confirming that the system cannot verify what it cannot find — it never returns a false positive.

---

## 2. SDK Support

For a higher-level, more robust integration, developers are encouraged to use the official RIO Receipt Protocol SDKs, which handle canonicalization, hashing, and Ed25519 signature verification automatically.

### Node.js / JavaScript

```bash
npm install rio-receipt-protocol
```

```javascript
import { verifyReceiptStandalone } from 'rio-receipt-protocol';

async function verifyWithSdk(receiptJson) {
  try {
    const isValid = await verifyReceiptStandalone(receiptJson);
    console.log('Receipt SDK verification result:', isValid);
    return isValid;
  } catch (error) {
    console.error('Receipt SDK verification error:', error);
    return false;
  }
}
```

### Python

```bash
pip install rio-receipt-protocol
```

```python
from rio_receipt_protocol.verifier import verify_receipt_standalone

def verify_with_sdk(receipt_json):
    try:
        is_valid = verify_receipt_standalone(receipt_json)
        print(f"Receipt SDK verification result: {is_valid}")
        return is_valid
    except Exception as e:
        print(f"Receipt SDK verification error: {e}")
        return False
```

---

## 3. Endpoints

### Rate Limiting & Quotas

The public `/api/verify` endpoint is subject to rate limiting to ensure fair usage and system stability. Currently, the rate limit is **100 requests per minute per IP address**. Exceeding this limit will result in a `429 Too Many Requests` HTTP status code. For higher throughput requirements, please contact `support@rioprotocol.org`.

### Local Development & Testing

For local development and testing, you can run a local instance of the RIO Gateway. Refer to the `rio-system` repository for instructions on setting up a local development environment. This allows you to test integrations without hitting the production demo API.

### JSON Schema Definitions

Formal JSON Schema definitions for the request and response objects are available in the `rio-receipt-protocol` repository under `spec/`. These schemas provide a normative definition of the data structures and can be used for validation in your applications.

---

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

**Response (400 — Bad Request):**

```json
{
  "status": "ERROR",
  "message": "Invalid identifier format. Expected RIO-XXXXXXXX, 64-char hex, or INT-XXXXXXXX."
}
```

**Response (429 — Too Many Requests):**

```json
{
  "status": "ERROR",
  "message": "Rate limit exceeded. Please try again later."
}
```

**Response (500 — Internal Server Error):**

```json
{
  "status": "ERROR",
  "message": "An unexpected error occurred on the server."
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

## 4. Get Ledger Chain

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

## 5. Get Ledger Statistics

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

## 6. Get Public Key

```
GET /api/verify/public-key
```

Retrieve the public key used for Ed25519 signature verification.

**Response (200):**
```json
{
  "public_key_hex": "64-char-hex",
  "algorithm": "Ed25519"
}
```

---

## 7. Independent Ed25519 Signature Verification

While the `/api/verify` endpoint provides a convenient way to check signatures, you can also perform independent Ed25519 signature verification using the public key obtained from `/api/verify/public-key`. This is crucial for trustless verification, where you don't rely on the API for cryptographic proof.

### JavaScript (Web Crypto API)

```javascript
async function verifyEd25519Signature(receipt, publicKeyHex) {
  const identityBinding = receipt.identity_binding;
  if (!identityBinding || !identityBinding.ed25519_signed || identityBinding.verification_method !== 'ed25519-nacl') {
    console.warn('Receipt not Ed25519 signed or unsupported verification method.');
    return false;
  }

  try {
    const signature = hexToUint8Array(receipt.signature);
    const publicKey = hexToUint8Array(publicKeyHex);
    const algorithm = { name: 'Ed25519' };
    const key = await crypto.subtle.importKey(
      'raw',
      publicKey,
      algorithm,
      true,
      ['verify']
    );

    // Reconstruct the payload that was signed (receipt_hash)
    const payloadStr = identityBinding.signature_payload_hash;
    const payload = new TextEncoder().encode(payloadStr);

    const isValid = await crypto.subtle.verify(
      algorithm,
      key,
      signature,
      payload
    );
    return isValid;
  } catch (error) {
    console.error('Ed25519 verification error:', error);
    return false;
  }
}

function hexToUint8Array(hexString) {
  return new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}
```

### Python (using `pynacl`)

```python
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError

def verify_signature(receipt, public_key_hex):
    identity_binding = receipt.get("identity_binding", {})
    if not identity_binding.get("ed25519_signed") or identity_binding.get("verification_method") != "ed25519-nacl":
        print("Receipt not Ed25519 signed or unsupported verification method.")
        return False

    try:
        verify_key = VerifyKey(bytes.fromhex(public_key_hex))
        # Reconstruct the payload that was signed (receipt_hash)
        payload = identity_binding.get("signature_payload_hash")
        signature = bytes.fromhex(receipt.get("signature"))
        
        verify_key.verify(payload.encode(), signature)
        return True
    except BadSignatureError:
        return False
    except Exception as e:
        print(f"Ed25519 verification error: {e}")
        return False
```

---

## 8. Local Development & Testing

To test your integration locally without hitting the production API:

1. **Docker Compose**: Run a local instance of the RIO Gateway.
   ```bash
   git clone https://github.com/bkr1297-RIO/rio-system.git
   cd rio-system
   docker-compose up -d
   ```
2. **Health Check**: Verify your local instance is running.
   ```bash
   curl http://localhost:4400/health
   ```
3. **Mocking**: Use the [JSON Schema](../../spec/receipt-schema.json) to generate mock receipts for your test suite.

Refer to the [Deployment Guide](./DEPLOYMENT_GUIDE.md) for more details on local setup.
