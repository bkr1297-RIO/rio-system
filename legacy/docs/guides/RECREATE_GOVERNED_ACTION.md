# How to Recreate a Governed Action — Agent Guide

> **Audience:** Any Manus agent working on the RIO system  
> **Prerequisite:** Read `docs/GOLDEN_PATH.md`, `docs/BASELINE_GOVERNED_ACTION.md`, and `docs/directives/SYSTEM_FREEZE.md` first  
> **Last verified:** 2026-04-07  
> **Author:** Manny (ONE Agent)

---

## What This Document Is

This is a step-by-step guide for any agent to recreate the proven governed action flow. It covers the exact API calls, the correct field names, the authentication sequence, and the common pitfalls that will waste your time if you don't know about them.

The governed action loop is the core proof of the RIO system. If you can't reproduce it, something is broken. If you can, the system works.

---

## Architecture Overview

There are three components involved:

| Component | URL | Role |
|-----------|-----|------|
| Gateway | https://rio-gateway.onrender.com | Governance engine, execution boundary, ledger |
| ONE | https://rio-one.manus.space | Human control surface (PWA) |
| SMTP | bkr1297@gmail.com | Email delivery via Gmail App Password |

The Gateway is the single execution boundary. ONE displays and facilitates human decisions. The Gateway sends. No other component sends. No fallback paths. No second execution path.

---

## Principals

| Principal | Role | Purpose |
|-----------|------|---------|
| I-1 | Proposer + Root Authority | Submits intents, can execute |
| I-2 | Approver | Reviews and approves intents |

Both principals authenticate with the same passphrase: `rio-governed-2026`

Separation of duties is enforced: the proposer and the approver must be different principals.

---

## The Pipeline

The governed action flow has exactly 8 steps:

```
Login → Submit Intent → Govern → Authorize → Execute → Receipt → Ledger → Delivery
```

Every step produces a cryptographic artifact. The receipt chains all artifacts together. The ledger entry links to the previous entry via hash chain.

---

## Step-by-Step API Calls

### Step 0: Health Check

```
GET https://rio-gateway.onrender.com/health
```

Verify `gmail.configured`, `gmail.user_set`, and `gmail.pass_set` are all `true`. If any are `false`, the SMTP credentials are not set on Render — fix that first (see Troubleshooting section).

### Step 1: Login as I-1 (Proposer)

```
POST https://rio-gateway.onrender.com/login
Content-Type: application/json

{
  "user_id": "I-1",
  "passphrase": "rio-governed-2026"
}
```

Response contains `token`. Save it as `TOKEN_I1`.

### Step 2: Login as I-2 (Approver)

```
POST https://rio-gateway.onrender.com/login
Content-Type: application/json

{
  "user_id": "I-2",
  "passphrase": "rio-governed-2026"
}
```

Response contains `token`. Save it as `TOKEN_I2`.

### Step 3: Submit Intent

```
POST https://rio-gateway.onrender.com/intent
Authorization: Bearer {TOKEN_I1}
Content-Type: application/json

{
  "agent_id": "bondi",
  "action": "send_email",
  "parameters": {
    "to": ["recipient@example.com"],
    "subject": "Test governed email",
    "body": "This email was sent through the RIO governance pipeline."
  },
  "request_nonce": "<random 16-char hex>",
  "request_timestamp": "<ISO 8601 UTC>"
}
```

**Critical:** The Gateway generates its own `intent_id` and returns it in the response. You MUST use the Gateway's returned `intent_id` for all subsequent calls. Do NOT send your own `intent_id` and expect it to be used — the Gateway may ignore it and generate a new one.

Save the returned `intent_id` from the response.

### Step 4: Govern

```
POST https://rio-gateway.onrender.com/govern
Authorization: Bearer {TOKEN_I1}
Content-Type: application/json

{
  "intent_id": "<intent_id from Step 3 response>",
  "request_nonce": "<random 16-char hex>",
  "request_timestamp": "<ISO 8601 UTC>"
}
```

Expected response for `send_email`: `decision: REQUIRE_HUMAN`, `risk_tier: HIGH`, `matched_class: send_new_contact`.

### Step 5: Authorize

```
POST https://rio-gateway.onrender.com/authorize
Authorization: Bearer {TOKEN_I2}
Content-Type: application/json

{
  "intent_id": "<intent_id from Step 3 response>",
  "decision": "approved",
  "authorized_by": "I-2",
  "request_nonce": "<random 16-char hex>",
  "request_timestamp": "<ISO 8601 UTC>"
}
```

**Critical:** This MUST be called with `TOKEN_I2` (the approver), not `TOKEN_I1` (the proposer). Separation of duties is enforced.

### Step 6: Execute

```
POST https://rio-gateway.onrender.com/execute-action
Authorization: Bearer {TOKEN_I1}
Content-Type: application/json

{
  "intent_id": "<intent_id from Step 3 response>",
  "request_nonce": "<random 16-char hex>",
  "request_timestamp": "<ISO 8601 UTC>"
}
```

The response contains `execution`, `receipt`, and the intent status should be `receipted`.

Key fields in the response:
- `execution.result.status` → should be `sent`
- `execution.result.connector` → should be `gmail_smtp`
- `execution.result.message_id` → the SMTP message ID
- `receipt.receipt_id` → the receipt ID
- `receipt.hash_chain` → the full 5-link hash chain
- `receipt.ledger_entry_id` → the ledger entry ID

### Step 7: Verify

Check the intent status:

```
GET https://rio-gateway.onrender.com/intent/{intent_id}
Authorization: Bearer {TOKEN_I1}
```

Status should be `receipted`. The `execution`, `receipt`, `governance`, and `authorization` sections should all be populated.

---

## Common Pitfalls

These are real problems that cost hours to debug. Read them before you start.

### 1. Gateway generates its own intent_id

If you send `intent_id` in the submit request body, the Gateway may ignore it and generate its own UUID. Always use the `intent_id` from the `/intent` response for all subsequent calls. If you use your own UUID for `/govern`, `/authorize`, or `/execute-action`, you'll get `404: Intent not found`.

### 2. Gateway uses in-memory storage

The Gateway on Render's free tier restarts periodically. When it restarts, all intents are lost. You must complete the entire pipeline (submit → govern → authorize → execute) in one session without long delays. If the Gateway restarts between your submit and your execute, the intent will be gone.

### 3. The email field is `parameters`, not `payload`

The intent body uses `parameters` for the email data (`to`, `subject`, `body`). If you put it in `payload`, the Gateway will accept the intent but the execution step won't find the email fields.

### 4. GMAIL_USER must be clean

The `GMAIL_USER` env var on Render must be exactly the email address with nothing appended. A previous bug had a hash string appended to the email address (`bkr1297@gmail.comba7f143ec19d2a6d376d214666c6c721`), which caused SMTP authentication to fail silently. The Gateway would then fall back to `external_fallback` mode instead of sending directly.

### 5. Passphrase changed

The passphrase was previously `governed-by-rio`. It is now `rio-governed-2026`. The Gateway reads from `process.env.RIO_PASSPHRASE` first, then falls back to the hardcoded default. Check the Gateway code (`gateway/server.mjs`) if login fails.

### 6. Separation of duties is enforced

The proposer (I-1) and the approver (I-2) must be different principals. If you try to authorize with the same principal that submitted, the Gateway will reject it.

### 7. Every request needs nonce + timestamp

The `request_nonce` and `request_timestamp` fields are required on `/govern`, `/authorize`, and `/execute-action` calls. Without them, the Gateway may reject the request for replay protection.

---

## The ONE UI Flow (Human Path)

When a human uses the ONE app (rio-one.manus.space), the flow is:

1. Open rio-one.manus.space
2. Select principal (I-1 or I-2)
3. Enter passphrase: `rio-governed-2026`
4. Click "Authenticate"
5. Navigate to the compose/action page
6. Fill in the email details (to, subject, body)
7. Submit — this creates the intent and governs it
8. If governance requires approval, switch to I-2 and approve
9. Execute the approved intent
10. Receipt and ledger entry are generated automatically
11. Email is delivered by the Gateway via SMTP

The ONE app calls the same Gateway API endpoints listed above. It is a UI wrapper, not an execution path.

---

## Verification Checklist

After completing a governed action, verify all of the following:

- [ ] Intent created with unique ID and intent_hash
- [ ] Risk evaluated by policy engine (REQUIRE_HUMAN for send_email)
- [ ] Proposer ≠ Approver enforced
- [ ] Approval recorded with authorization_hash
- [ ] Execution only after authorization
- [ ] Gateway sends directly via gmail_smtp (no fallback, no second path)
- [ ] Receipt generated with receipt_id and 5-link hash chain
- [ ] Receipt signed by Gateway (Ed25519)
- [ ] Ledger entry written with ledger_entry_id
- [ ] Email arrives in recipient inbox

---

## Python Reference Script

```python
import requests, json, uuid
from datetime import datetime, timezone

GW = "https://rio-gateway.onrender.com"
s = requests.Session()

def ts(): return datetime.now(timezone.utc).isoformat()
def nonce(): return uuid.uuid4().hex[:16]

# Login both principals
tok_i1 = s.post(f"{GW}/login", json={
    "user_id": "I-1", "passphrase": "rio-governed-2026"
}).json()["token"]

tok_i2 = s.post(f"{GW}/login", json={
    "user_id": "I-2", "passphrase": "rio-governed-2026"
}).json()["token"]

# Submit intent
r = s.post(f"{GW}/intent",
    headers={"Authorization": f"Bearer {tok_i1}"},
    json={
        "agent_id": "bondi",
        "action": "send_email",
        "parameters": {
            "to": ["recipient@example.com"],
            "subject": "Governed email test",
            "body": "This email was sent through the RIO governance pipeline."
        },
        "request_nonce": nonce(),
        "request_timestamp": ts()
    })
intent_id = r.json()["intent_id"]  # USE THIS, not your own

# Govern
s.post(f"{GW}/govern",
    headers={"Authorization": f"Bearer {tok_i1}"},
    json={"intent_id": intent_id, "request_nonce": nonce(), "request_timestamp": ts()})

# Authorize (different principal!)
s.post(f"{GW}/authorize",
    headers={"Authorization": f"Bearer {tok_i2}"},
    json={"intent_id": intent_id, "decision": "approved", "authorized_by": "I-2",
          "request_nonce": nonce(), "request_timestamp": ts()})

# Execute
r = s.post(f"{GW}/execute-action",
    headers={"Authorization": f"Bearer {tok_i1}"},
    json={"intent_id": intent_id, "request_nonce": nonce(), "request_timestamp": ts()})

result = r.json()
print(f"Status: {result.get('status')}")
print(f"Receipt: {result.get('receipt', {}).get('receipt_id')}")
print(f"Ledger: {result.get('receipt', {}).get('ledger_entry_id')}")
print(f"Connector: {result.get('execution', {}).get('connector')}")
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `404: Intent not found` | Using your own intent_id instead of Gateway's | Use `intent_id` from `/intent` response |
| `404: Intent not found` after delay | Gateway restarted (in-memory store wiped) | Run all steps in rapid sequence |
| `535 Username and Password not accepted` | GMAIL_USER or GMAIL_APP_PASSWORD wrong on Render | Check Render env vars, ensure no trailing chars |
| `delivery_mode: external_fallback` | SMTP failed, Gateway fell back | Fix SMTP credentials, redeploy |
| `Invalid passphrase` | Passphrase changed | Use `rio-governed-2026` |
| `FORBIDDEN` on authorize | Same principal as proposer | Use I-2 token for authorize, I-1 for submit |

---

## Reference Documents

| Document | Path | Purpose |
|----------|------|---------|
| Golden Path | `docs/GOLDEN_PATH.md` | Canonical reference flow with proof artifacts |
| Baseline | `docs/BASELINE_GOVERNED_ACTION.md` | First proven actions with full hashes |
| System Freeze | `docs/directives/SYSTEM_FREEZE.md` | No new features directive |
| Gateway API | `docs/GATEWAY_API_CONTRACT.md` | Full API specification |
| Architecture | `docs/ARCHITECTURE_v2.7.md` | System architecture overview |

---

*If you can run this flow and get a receipt, the system works. If you can't, something is broken — fix it, don't redesign it.*
