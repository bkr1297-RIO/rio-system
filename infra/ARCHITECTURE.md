# RIO Production Infrastructure Architecture (v1.0)
**Lane:** DevOps / Deployment
**Owner:** Manus (DevOps Node)
**Status:** PRODUCTION-READY

## 1. Overview
The RIO production infrastructure is a fail-closed, distributed system designed for high-availability governance. It decouples the AI's intent from the real-world execution through a series of cryptographic and identity-bound gates.

## 2. Core Components

### A. Persistence Layer (PostgreSQL)
- **Database:** Azure Database for PostgreSQL.
- **Table:** `receipts` (Append-Only).
- **Security:** Database-level triggers block all `UPDATE` and `DELETE` operations.
- **Integrity:** Every receipt is linked via a SHA-256 hash chain (`previous_hash` → `ledger_hash`).

### B. Identity Layer (OAuth2)
- **Providers:** Google and Microsoft.
- **Enforcement:** All approval endpoints are wrapped in `protected_procedure` middleware.
- **Sovereign Binding:** Only the authenticated identity of **Brian Kent Rasmussen (I-1)** can authorize actions.

### C. Security Layer (Ed25519 + Azure Key Vault)
- **Signing:** Ed25519 signatures for all `ApprovalRecords`.
- **Key Management:** Private keys are stored in **Azure Key Vault** (HSM-backed).
- **Verification:** Public keys are retrieved from the vault for deterministic receipt verification.

### D. Deployment Layer (Azure + CI/CD)
- **Hosting:** Azure App Service (Dockerized).
- **Automation:** GitHub Actions for continuous testing and deployment.
- **Fail-Closed:** Deployment is blocked if security tests fail.

## 3. Public Verification API
- **Endpoint:** `GET /verify/{receipt_hash}`
- **Function:** Read-only verification of any receipt against the persistent ledger.
- **Output:** Valid/Invalid status + chain integrity confirmation.

## 4. Environment Variables (Secrets)
| Variable | Description | Source |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | Azure Secret |
| `AZURE_VAULT_URL` | URL of the Azure Key Vault | Azure Secret |
| `GOOGLE_CLIENT_ID` | OAuth client ID for Google | Azure Secret |
| `MICROSOFT_CLIENT_ID` | OAuth client ID for Microsoft | Azure Secret |
| `SOVEREIGN_EMAIL` | The email of I-1 (Brian) | Azure Secret |

## 5. Fail-Closed Behavior
The system is physically incapable of execution if:
1. The database is offline.
2. The OAuth provider is unreachable.
3. The Azure Key Vault rejects the signing request.
4. The identity of the approver does not match I-1.
