# Self-Hosted Deployment Guide

Deploy the RIO Governance Gateway on your own infrastructure using Docker Compose. This guide covers everything from prerequisites to verification.

## Prerequisites

Before you begin, ensure your host machine has the following installed.

| Requirement | Minimum Version | Purpose |
|---|---|---|
| Docker Engine | 24.0+ | Container runtime |
| Docker Compose | 2.20+ (V2 plugin) | Multi-container orchestration |
| 2 GB RAM | — | Gateway + PostgreSQL |
| 10 GB disk | — | Database storage + container images |

You will also need a terminal with `curl` or `wget` for verification.

## Quick Start

The entire system starts with three commands.

```bash
# 1. Clone the repository
git clone https://github.com/bkr1297-RIO/rio-system.git
cd rio-system

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum, set JWT_SECRET:
#   openssl rand -hex 32
# Paste the output as your JWT_SECRET value.

# 3. Start all services
docker compose up -d
```

The gateway will be available at **http://localhost:4400** within 15 seconds.

## What Gets Deployed

Docker Compose starts two services.

| Service | Container | Port | Purpose |
|---|---|---|---|
| PostgreSQL 16 | `rio-postgres` | 5432 | Append-only ledger, intents, receipts, signers, API keys |
| RIO Gateway | `rio-gateway` | 4400 | Governance engine, policy enforcement, receipt generation |

PostgreSQL data is persisted in a Docker volume (`rio-pgdata`), so data survives container restarts.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Docker Compose                     │
│                                                      │
│  ┌──────────────┐       ┌──────────────────────┐    │
│  │  PostgreSQL   │◄──────│   RIO Gateway        │    │
│  │  rio-postgres │       │   rio-gateway         │    │
│  │  :5432        │       │   :4400               │    │
│  │               │       │                       │    │
│  │  Tables:      │       │  Pipeline:            │    │
│  │  - intents    │       │  Intent → Govern →    │    │
│  │  - ledger     │       │  Authorize → Execute  │    │
│  │  - receipts   │       │  → Receipt → Ledger   │    │
│  │  - signers    │       │                       │    │
│  │  - api_keys   │       │  Auth: JWT + Ed25519  │    │
│  └──────────────┘       └──────────────────────┘    │
│                                                      │
└─────────────────────────────────────────────────────┘
         ▲                          ▲
         │                          │
    Direct DB access           API clients
    (admin only)           (ONE, agents, tools)
```

## Configuration

All configuration is done through environment variables in the `.env` file. See `.env.example` for the complete list with documentation.

### Required Settings

These must be changed before running in production.

| Variable | Description | How to Generate |
|---|---|---|
| `JWT_SECRET` | Signs authentication tokens | `openssl rand -hex 32` |
| `PG_PASSWORD` | PostgreSQL password | Choose a strong password |

### Optional Settings

These have sensible defaults but can be customized.

| Variable | Default | Description |
|---|---|---|
| `RIO_GATEWAY_PORT` | 4400 | Gateway listen port |
| `PG_EXTERNAL_PORT` | 5432 | PostgreSQL host port |
| `ED25519_MODE` | required | Signature enforcement |
| `RIO_LOGIN_PASSPHRASE` | rio-governed-2026 | MVP login passphrase |
| `TOKEN_EXPIRY_HOURS` | 24 | JWT token lifetime |
| `RATE_LIMIT_GLOBAL` | 100 | API rate limit per window |

## Verification

After starting the system, verify that everything is working.

### Step 1: Check container health

```bash
docker compose ps
```

Both services should show `healthy` status.

### Step 2: Hit the health endpoint

```bash
curl http://localhost:4400/health | jq .
```

Expected response includes `"status": "operational"` with governance configuration loaded and ledger connected.

### Step 3: Verify the full pipeline

```bash
# Authenticate
TOKEN=$(curl -s -X POST http://localhost:4400/login \
  -H "Content-Type: application/json" \
  -d '{"user_id": "admin", "passphrase": "rio-governed-2026"}' \
  | jq -r '.token')

echo "Token: $TOKEN"

# Submit an intent
INTENT=$(curl -s -X POST http://localhost:4400/intent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "action": "send_email",
    "agent_id": "test-agent",
    "parameters": {
      "to": "test@example.com",
      "subject": "RIO Deployment Test",
      "body": "This is a test of the governed execution pipeline."
    }
  }')

INTENT_ID=$(echo $INTENT | jq -r '.intent_id')
echo "Intent: $INTENT_ID"

# Run governance
curl -s -X POST http://localhost:4400/govern \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"intent_id\": \"$INTENT_ID\"}" | jq .

# Check the ledger
curl -s http://localhost:4400/ledger | jq '.entries | length'

# Verify hash chain integrity
curl -s http://localhost:4400/verify | jq .
```

### Step 4: Verify ledger integrity

```bash
curl http://localhost:4400/verify | jq .
```

The response should show `"chain_valid": true`.

## Operations

### View logs

```bash
# All services
docker compose logs -f

# Gateway only
docker compose logs -f gateway

# PostgreSQL only
docker compose logs -f postgres
```

### Stop the system

```bash
docker compose down
```

Data is preserved in the `rio-pgdata` volume. To remove data as well:

```bash
docker compose down -v
```

### Restart after configuration changes

```bash
docker compose down
docker compose up -d
```

### Backup the database

```bash
docker compose exec postgres pg_dump -U rio rio_ledger > backup_$(date +%Y%m%d).sql
```

### Restore from backup

```bash
cat backup_20260403.sql | docker compose exec -T postgres psql -U rio rio_ledger
```

## Connecting the ONE Command Center

The ONE Command Center (PWA) is the human control surface for the gateway. It is currently hosted at **rio-one.manus.space** and connects to the Manus-hosted gateway.

To connect ONE to your self-hosted gateway, you would need to build ONE from source and configure `VITE_GATEWAY_URL` to point to your gateway instance. Self-hosted ONE packaging is planned for a future release.

For now, you can interact with your self-hosted gateway through the API directly (see the verification steps above) or build a custom client using the OpenAPI documentation at `http://localhost:4400/api/v1/docs`.

## Troubleshooting

### Gateway fails to start

Check that PostgreSQL is healthy first:

```bash
docker compose ps postgres
docker compose logs postgres
```

The gateway will not start without a healthy database connection (fail-closed design).

### "FATAL: Missing required config file"

The governance configuration files must be present in `gateway/config/rio/`. These are included in the repository and should be copied into the container automatically. If you see this error, ensure the Docker build context includes the `config/` directory.

### Port conflicts

If port 4400 or 5432 is already in use, change the external ports in `.env`:

```bash
RIO_GATEWAY_PORT=4401
PG_EXTERNAL_PORT=5433
```

### Reset everything

To start completely fresh:

```bash
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

## Security Considerations

For production deployments, review the following.

1. **Change all default passwords** in `.env` before first run.
2. **Generate a strong JWT_SECRET** using `openssl rand -hex 32`.
3. **Restrict PostgreSQL access** — do not expose port 5432 externally unless needed.
4. **Use a reverse proxy** (nginx, Caddy, Traefik) with TLS termination in front of the gateway.
5. **Set ED25519_MODE=required** to enforce cryptographic signatures on all approvals.
6. **Monitor the health endpoint** at `/health` for operational status.
7. **Back up the database regularly** — the ledger is append-only and cannot be reconstructed.

## Next Steps

After verifying the deployment, you can:

1. **Register Ed25519 signers** via `POST /api/signers/generate-keypair`
2. **Create API keys** for external integrations via `POST /api/v1/keys`
3. **Submit intents** through the full governance pipeline
4. **Verify receipts** and ledger integrity at any time via `/verify`
5. **Connect the ONE PWA** for a visual control surface (see above)
