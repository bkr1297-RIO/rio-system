# RIO Docker Compose Deployment Guide
## "Getting Started in 5 Minutes"

This guide provides step-by-step instructions for developers to deploy a local instance of the RIO Governance Gateway using Docker Compose. This setup includes the RIO Gateway server and a PostgreSQL database for the tamper-evident ledger.

---

## 1. Prerequisites

Before you begin, ensure you have the following installed on your local machine:

- **Docker**: [Install Docker](https://docs.docker.com/get-docker/)
- **Docker Compose**: (Included with Docker Desktop on Windows and macOS)
- **Git**: To clone the repository

---

## 2. Quick Start (5 Minutes)

### Step 1: Clone the Repository
```bash
git clone https://github.com/bkr1297-RIO/rio-system.git
cd rio-system
```

### Step 2: Configure Environment Variables
Create a `.env` file in the root directory. You can use the following defaults for local development:

```bash
# PostgreSQL Configuration
POSTGRES_PASSWORD=rio_gateway_2026

# Gateway Configuration
JWT_SECRET=dev-secret-key-12345
RIO_LOGIN_PASSPHRASE=rio-governed-2026
ED25519_MODE=optional
```

### Step 3: Launch the Stack
Run the following command to build the gateway image and start the services in the background:

```bash
docker-compose up -d
```

### Step 4: Verify the Deployment
Check the status of the containers:

```bash
docker-compose ps
```

You should see two containers running: `rio-gateway` and `rio-ledger-db`.

### Step 5: Access the Gateway
The RIO Gateway is now accessible at `http://localhost:4400`. You can verify the health of the gateway by visiting:

```bash
curl http://localhost:4400/health
```

---

## 3. Common Operations

### Viewing Logs
To monitor the gateway and database logs in real-time:
```bash
docker-compose logs -f
```

### Stopping the Services
To stop the containers without removing them:
```bash
docker-compose stop
```

To stop and remove the containers (data in the ledger will persist in the `pgdata` volume):
```bash
docker-compose down
```

### Resetting the Ledger
If you need to wipe the ledger and start fresh:
```bash
docker-compose down -v
```

---

## 4. Architecture Overview

The Docker Compose stack consists of two primary services:

1.  **`gateway`**: The RIO Governance Gateway (Node.js/Express). It handles intent ingestion, policy enforcement, and receipt generation.
2.  **`postgres`**: A PostgreSQL 16 database that stores the append-only, hash-chained ledger. It is initialized with the schema defined in `gateway/ledger/init.sql`.

### Volumes
- **`pgdata`**: Persists the PostgreSQL database files.
- **`gateway-keys`**: Persists the Ed25519 keys used for signing receipts.

---

## 5. Troubleshooting

- **Port Conflicts**: If port `4400` or `5432` is already in use, you can modify the port mappings in `docker-compose.yml`.
- **Database Connection**: If the gateway fails to connect to the database, ensure the `POSTGRES_PASSWORD` in your `.env` matches the one in `docker-compose.yml`.
- **Build Errors**: If the build fails, try running `docker-compose build --no-cache` to ensure a clean build.

---

## 6. Next Steps

Now that your local RIO instance is running, you can:
- Integrate your AI agent using the [Verification API Integration Guide](./VERIFY_API_INTEGRATION.md).
- Explore the [RIO Receipt Protocol](https://github.com/bkr1297-RIO/rio-receipt-protocol) for independent verification.
- Configure custom policy rules via the ONE Command Center (if connected).
