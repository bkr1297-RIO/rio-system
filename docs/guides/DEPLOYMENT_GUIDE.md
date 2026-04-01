# RIO Gateway — Deployment Guide

## Overview

This guide covers deploying the RIO Governance Gateway to a permanent URL. The gateway requires two services:

1. **RIO Gateway** — Node.js Express server (port 4400)
2. **PostgreSQL** — Persistent ledger database (port 5432)

---

## Option 1: Docker Compose (Recommended for VPS/VM)

### Prerequisites
- Docker and Docker Compose installed
- A server with a public IP or domain

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/bkr1297-RIO/rio-system.git
cd rio-system

# 2. Create environment file
cp .env.example .env
# Edit .env with your secrets:
#   JWT_SECRET=<generate with: openssl rand -hex 32>
#   POSTGRES_PASSWORD=<strong password>
#   RIO_LOGIN_PASSPHRASE=<your passphrase>

# 3. Start the stack
docker-compose up -d

# 4. Verify
curl http://localhost:4400/health

# 5. Generate Brian's Ed25519 keypair (first time only)
docker exec rio-gateway node -e "
  import('./security/ed25519.mjs').then(m => m.generateAndSaveKeypair('brian.k.rasmussen'))
"
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl;
    server_name rio.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/rio.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rio.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:4400;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Option 2: Azure App Service (Container)

### Prerequisites
- Azure CLI installed and logged in
- Azure Container Registry (ACR) or Docker Hub

### Steps

```bash
# 1. Build and push the image
docker build -t rio-gateway ./gateway
docker tag rio-gateway <your-registry>/rio-gateway:latest
docker push <your-registry>/rio-gateway:latest

# 2. Create Azure resources
az group create --name rio-rg --location westus2

# Create PostgreSQL
az postgres flexible-server create \
  --resource-group rio-rg \
  --name rio-ledger-db \
  --admin-user rio \
  --admin-password <strong-password> \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --version 16

# Create App Service
az webapp create \
  --resource-group rio-rg \
  --plan rio-plan \
  --name rio-gateway \
  --deployment-container-image-name <your-registry>/rio-gateway:latest

# 3. Configure environment variables
az webapp config appsettings set \
  --resource-group rio-rg \
  --name rio-gateway \
  --settings \
    PGHOST=rio-ledger-db.postgres.database.azure.com \
    PGPORT=5432 \
    PGDATABASE=rio_ledger \
    PGUSER=rio \
    PGPASSWORD=<strong-password> \
    JWT_SECRET=<generate-random> \
    RIO_LOGIN_PASSPHRASE=<your-passphrase> \
    ED25519_MODE=optional \
    NODE_ENV=production
```

### Result
Your gateway will be live at: `https://rio-gateway.azurewebsites.net`

---

## Option 3: Railway / Render / Fly.io (Simplest)

These platforms support Docker deployments with managed PostgreSQL:

1. Connect your GitHub repo
2. Set the Dockerfile path to `gateway/Dockerfile`
3. Add a PostgreSQL addon
4. Set environment variables
5. Deploy

---

## Post-Deployment Checklist

| Step | Command | Expected |
|------|---------|----------|
| Health check | `curl https://your-url/health` | `{"status":"operational"}` |
| Login | `curl -X POST https://your-url/login -d '...'` | JWT token returned |
| Whoami | `curl https://your-url/whoami -H "Authorization: Bearer ..."` | User info returned |
| Submit intent | `curl -X POST https://your-url/intent -d '...'` | Intent ID returned |
| Check ledger | `curl https://your-url/ledger` | Entries in PostgreSQL |
| Verify chain | `curl https://your-url/verify` | `chain_valid: true` |

---

## Security Notes

- **Never commit `.env` to Git** — it contains secrets
- **Rotate JWT_SECRET** periodically
- **Use HTTPS** in production (TLS termination via reverse proxy or cloud provider)
- **Restrict database access** to the gateway container only
- **Back up the PostgreSQL database** regularly
- **Ed25519 private keys** should only exist on Brian's device in production
