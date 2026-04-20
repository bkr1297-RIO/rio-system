# RIO Governance Gateway — Docker Image
# Governed AI Execution Runtime
#
# Build:  docker build -t rio-gateway .
# Run:    docker run -p 4400:4400 --env-file .env rio-gateway

FROM node:22-alpine

LABEL maintainer="Brian K. Rasmussen"
LABEL description="RIO Governance Gateway — Governed AI Execution Runtime"
LABEL version="2.2.0-hardened"

# Create app directory
WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy application code
COPY . .

# Create data directories
RUN mkdir -p data/keys data/ledger

# Expose the gateway port
EXPOSE 4400

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:4400/health || exit 1

# Environment variables (defaults — override in .env or docker-compose)
ENV NODE_ENV=production
ENV RIO_GATEWAY_PORT=4400
ENV ED25519_MODE=optional

# Start the gateway
CMD ["node", "server.mjs"]
