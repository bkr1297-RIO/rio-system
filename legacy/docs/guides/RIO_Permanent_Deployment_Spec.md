# RIO Protocol — Permanent Deployment Specification

## 1. Overview

This document outlines the exact steps required to take the RIO Protocol from a temporary prototype to a permanent, secure, 24/7 runtime environment. It is written for a systems engineer (e.g., Todd) to execute.

The goal is to establish a permanent gateway server that enforces the RIO invariants, hosts the immutable ledger, and serves the public-facing demo site.

## 2. Current State vs. Target State

| Component | Current State (Prototype) | Target State (Permanent) |
|:---|:---|:---|
| **Hosting** | Temporary Replit/Manus sandbox | Azure App Service (24/7 uptime) |
| **Database (Ledger)** | Local SQLite file (`gateway.db`) | Azure Database for PostgreSQL |
| **Domain** | Temporary `.manus.space` URL | Custom domain (e.g., `rioprotocol.com`) |
| **Authentication** | Hardcoded API keys | Azure Entra ID (OAuth) |
| **Code Source** | GitHub (`bkr1297-RIO/rio-system`) | GitHub (Continuous Deployment) |

## 3. Architecture

The permanent deployment consists of three primary layers:

1. **The Frontend (Demo & Approval UI):** A static site that explains the protocol and provides the interface for the human root authority to approve or deny intents.
2. **The Gateway (Backend API):** A FastAPI Python server that receives intents, verifies cryptographic signatures, executes actions via connectors, and generates receipts.
3. **The Ledger (Database):** An append-only database storing the hash-chained receipts.

## 4. Deployment Steps (Azure)

### Step 1: Provision Azure Resources
The engineer must provision the following resources in the Azure portal:
- **Azure App Service (Linux, Python 3.11):** To host the FastAPI backend and serve the frontend static files.
- **Azure Database for PostgreSQL (Flexible Server):** To replace the local SQLite database for the ledger.
- **Azure Key Vault (Optional but recommended):** To securely store the ECDSA private keys and API tokens.

### Step 2: Configure Environment Variables
The App Service must be configured with the following environment variables:
- `RIO_ECDSA_PUBLIC_KEY`: The PEM-encoded secp256k1 public key used to verify human approvals.
- `RIO_RECEIPT_KEY`: The HMAC signing key for generating receipts.
- `DATABASE_URL`: The connection string for the PostgreSQL database.
- `GMAIL_OAUTH_TOKEN` / `DRIVE_OAUTH_TOKEN`: Tokens for the execution connectors.

### Step 3: Database Migration
The current codebase uses SQLite (`_init_db` in `execution_gate.py`). The engineer must update the database connection logic to use PostgreSQL via SQLAlchemy or asyncpg, ensuring the append-only, hash-chained schema is preserved.

### Step 4: Continuous Deployment (GitHub Actions)
Set up a GitHub Action in the `bkr1297-RIO/rio-system` repository to automatically deploy to the Azure App Service whenever changes are pushed to the `main` branch.

### Step 5: Custom Domain and SSL
Map a custom domain to the Azure App Service and enable Managed Certificates to ensure all traffic is encrypted via HTTPS.

## 5. Security Model

The permanent deployment must maintain the strict security guarantees of the RIO protocol:

- **Fail-Closed Execution:** The gateway must return HTTP 403 if an execution token is missing, invalid, or expired.
- **Single-Use Approvals:** The nonce registry must prevent replay attacks.
- **Tamper-Evident Ledger:** Every receipt must include a `previous_hash` linking it to the prior receipt.
- **Authentication:** Only the root authority (Brian Kent Rasmussen) can sign intents. The private key must remain secure and never be uploaded to the server.

## 6. Future Milestone: The Browser Extension Gate

Once the permanent server is running, the next architectural step is building a Chrome Extension. This extension will act as the ubiquitous approval UI. Whenever an AI agent attempts an action, the extension will intercept the intent, display it to the user, and generate the ECDSA signature upon approval, sending it directly to the permanent Azure gateway.
