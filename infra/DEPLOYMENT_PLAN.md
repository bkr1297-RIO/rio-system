# RIO Infrastructure & Deployment Plan (v1.0)
**Lane:** DevOps / Deployment
**Owner:** Manus (DevOps Node)
**Status:** INITIALIZED

## 1. Objective
Transition the RIO prototype into a production-capable, persistent, and secure infrastructure.

## 2. Priority Roadmap

### Phase 1: Persistent Ledger (PostgreSQL)
- **Goal:** Move from in-memory/JSON to a permanent database.
- **Implementation:**
  - Deploy PostgreSQL instance.
  - Create `receipts` table with strict append-only constraints.
  - Ensure SHA-256 hash chain integrity is maintained in the DB schema.
  - **Fail-Closed:** Database connection failure must block all execution.

### Phase 2: Authentication & Identity
- **Goal:** Bind approvals to authenticated human identity (I-1).
- **Implementation:**
  - Integrate OAuth2 (Google + Microsoft).
  - Update `ApprovalRecord` to include `ctx.user` metadata.
  - Enforce login for all `/approve` and `/deny` endpoints.

### Phase 3: Cryptographic Security (Ed25519 + Azure Key Vault)
- **Goal:** Secure the "Skeleton Gate" with industry-standard signing.
- **Implementation:**
  - Migrate from RSA/ECDSA to **Ed25519** for approval signatures.
  - Store private keys in **Azure Key Vault** (HSM-backed).
  - Implement public key retrieval for receipt verification.

### Phase 4: Azure Deployment & CI/CD
- **Goal:** Permanent, scalable hosting.
- **Implementation:**
  - Containerize the RIO Gateway (Docker).
  - Deploy to **Azure App Service**.
  - Configure **GitHub Actions** for automated testing and deployment.
  - Set up Environment Secrets (DB_URL, OAUTH_CLIENT_ID, AZURE_VAULT_URL).

### Phase 5: Public Verification
- **Goal:** Independent proof of truth.
- **Implementation:**
  - Create `/verify` endpoint.
  - Input: Receipt Hash.
  - Output: Full chain validation (Success/Failure).

## 3. Communication Bridge
- All infrastructure changes will be submitted via PRs.
- **HANDOFF.md** will be updated for the Backend and Docs agents to integrate.
