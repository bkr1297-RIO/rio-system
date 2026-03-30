# RIO Infrastructure Handoff (v1.0)
**Lane:** DevOps / Deployment
**Owner:** Manus (DevOps Node)
**Status:** DEPLOYED / LIVE

## 1. Gateway Information
- **Production URL:** `https://rio-protocol-gateway.azurewebsites.net`
- **Verification API:** `https://rio-protocol-gateway.azurewebsites.net/verify/{receipt_hash}`
- **Status:** LIVE (Fail-Closed Mode Active)

## 2. Integration for Backend Agent
- **Client Config:** Set `GATEWAY_URL=https://rio-protocol-gateway.azurewebsites.net`.
- **Auth:** All `/approve` and `/deny` calls must include a `Bearer` OAuth token in the `Authorization` header.
- **Provider:** Specify `X-RIO-Provider: google` or `microsoft` in the headers.

## 3. Integration for Docs Agent
- **Verify Button:** Wire the "Verify" button on the protocol site to the `/verify/{receipt_hash}` endpoint.
- **Architecture:** Refer to `infra/ARCHITECTURE.md` for the full production stack details.

## 4. Database & Security
- **Ledger:** PostgreSQL (Append-Only).
- **Signatures:** Ed25519 (Azure Key Vault HSM).
- **Identity:** Bound to I-1 (Brian Kent Rasmussen).

## 5. Fail-Closed Protocol
If the Gateway returns a 401, 403, or 500, the Nervous System must block all execution. No receipt = No action.
