# Deployment Architecture: Governed AI Email Sending

**Author:** Andrew (Solutions Architect)
**Date:** 2026-04-03
**Status:** Draft — awaiting Brian's review
**Use Case:** AI drafts and sends emails. Humans approve before sending. Every action produces a cryptographic receipt and ledger entry.

---

## 1. System Architecture — Components and Flow

The deployment consists of five components. Each runs as a separate process (or container). They communicate over HTTPS.

| Component | Role | Runtime |
|---|---|---|
| **AI Agent** | Drafts emails, submits intents to RIO | Customer's existing LLM (OpenAI, Anthropic, or custom) |
| **RIO Gateway** | Receives intents, enforces governance, controls execution | Express/Node.js server (Docker container) |
| **ONE Command Center** | Human approval interface — review, approve, deny, kill switch | React PWA (served by Gateway or standalone) |
| **Email Connector** | Executes approved email sends via Gmail API or SMTP | Module within Gateway (behind service boundary) |
| **Ledger** | Stores hash-chained receipts and audit entries | MySQL/TiDB database (managed or self-hosted) |

**Data flow (single action):**

```
AI Agent
  │
  ├─ POST /api/v1/intents
  │   { tool: "gmail_send", args: { to, subject, body }, agent: "openai-gpt4" }
  │
  ▼
RIO Gateway
  │
  ├─ Intent created (SHA-256 hash computed)
  ├─ Policy Engine evaluates risk → HIGH (email = side effect)
  ├─ Intent queued for human approval
  │
  ▼
ONE Command Center
  │
  ├─ Human sees: recipient, subject, body, risk tier, convergence score
  ├─ Human clicks Approve (Ed25519 signature generated)
  │   OR Human clicks Deny (denial receipt generated)
  │
  ▼
RIO Gateway
  │
  ├─ Signature verified
  ├─ Nonce checked (replay prevention)
  ├─ Execution token issued
  │
  ▼
Email Connector
  │
  ├─ Gmail API called (or SMTP relay)
  ├─ Send result captured (success/failure)
  │
  ▼
Receipt Generator
  │
  ├─ Receipt created (SHA-256 + Ed25519 signed)
  ├─ Receipt hash-chained to previous receipt
  │
  ▼
Ledger
  │
  └─ Block appended (intentId, action, decision, hashes, timestamp)
```

---

## 2. Where ONE Runs

ONE is a React Progressive Web App. It is served as static files by the RIO Gateway server.

**Pilot deployment:** ONE runs on the same server as the Gateway. The Gateway serves the PWA at the root URL (`https://rio.acme.internal/`). No separate hosting required.

**Scaled deployment:** ONE can be served from a CDN or separate static host for performance. The PWA connects to the Gateway API over HTTPS. Because ONE is a PWA, it is installable on desktop and mobile devices and works offline for viewing past receipts and audit logs (new approvals require connectivity).

**Access points for human approval:**
- ONE web dashboard (primary)
- Telegram bot (inline approve/reject buttons)
- Mobile PWA (installable, push notifications planned)

All three interfaces produce the same Ed25519 signature. The approval is cryptographically identical regardless of which interface the human uses.

---

## 3. Where the RIO Governance Layer Runs

The governance layer is the core of the Gateway server. It runs as a single Node.js process inside a Docker container.

**Components within the governance layer:**

| Sub-component | Function |
|---|---|
| Intent Intake | Receives and validates incoming intents, computes SHA-256 hash |
| Policy Engine (Bondi) | Evaluates risk tier (LOW/MEDIUM/HIGH/CRITICAL), applies custom rules |
| Authorization Gate | Verifies Ed25519 approval signature, checks nonce, issues execution token |
| Fail-Closed Gate | Default-blocks all execution; only opens with valid execution token |
| Receipt Generator | Creates SHA-256 hashed, Ed25519 signed receipts with hash chaining |

**Deployment location:**

| Model | Where It Runs |
|---|---|
| Pilot | Single Docker container on customer's server or VM |
| Scaled | Kubernetes pod or managed container service (Azure Container Apps, AWS ECS, GCP Cloud Run) |
| Air-gapped | On-premise server with no external network access (email connector uses internal SMTP) |

The governance layer makes no external network calls for its core function. All policy evaluation, signature verification, and receipt generation happen locally. The only external calls are from the email connector to the email service.

---

## 4. Where the Receipt Protocol Runs

The receipt protocol runs inside the Gateway server. It is not a separate service.

**What it does:**
- Generates a receipt for every action (approved, denied, or blocked)
- Signs each receipt with Ed25519 (private key stored on the Gateway server)
- Hashes each receipt with SHA-256
- Chains each receipt to the previous receipt's hash (tamper-evident)

**Key storage:**

| Environment | Key Storage |
|---|---|
| Pilot | Ed25519 key pair generated at first boot, stored in `/etc/rio/keys/` on the container |
| Production | Azure Key Vault, AWS KMS, or HashiCorp Vault |

**Verification:** The receipt protocol includes a verification function. Anyone with the public key can verify any receipt independently. The verification tool is open source and does not require access to the RIO server.

```bash
# Verify a receipt (open source tool)
npx rio-receipt-protocol verify --receipt receipt.json --pubkey rio-public.pem
```

---

## 5. Where the Ledger Runs

The ledger is a database table with hash chaining. Each row references the previous row's hash.

**Schema (simplified):**

```sql
CREATE TABLE ledger (
  block_id    INT AUTO_INCREMENT PRIMARY KEY,
  intent_id   VARCHAR(64) NOT NULL,
  action      VARCHAR(128) NOT NULL,
  decision    ENUM('approved', 'denied', 'blocked') NOT NULL,
  receipt_hash VARCHAR(128) NOT NULL,
  previous_hash VARCHAR(128),
  current_hash VARCHAR(128) NOT NULL,
  timestamp   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_intent (intent_id),
  INDEX idx_hash (current_hash)
);
```

**Deployment location:**

| Model | Database | Notes |
|---|---|---|
| Pilot | SQLite or single MySQL instance on same server | Simplest setup; sufficient for <1000 actions/day |
| Production | Managed MySQL (Azure Database for MySQL, AWS RDS, GCP Cloud SQL) | Automated backups, point-in-time recovery |
| High-compliance | TiDB or CockroachDB | Distributed, strongly consistent, horizontal scaling |
| Air-gapped | PostgreSQL on-premise | Customer manages backups and replication |

**Integrity verification:** The Gateway exposes a `/api/v1/ledger/verify` endpoint that walks the hash chain and reports any breaks. This can be run on a schedule (cron) or on demand by auditors.

**Retention:** Ledger entries are append-only. There is no delete operation. Retention period is configurable but defaults to indefinite. For compliance, entries can be archived to cold storage after a configurable period.

---

## 6. How the Email Connector Works

The email connector is a module inside the Gateway server. It sits behind the fail-closed gate — it can only be invoked after the Authorization Gate issues a valid execution token.

**Execution flow:**

```
Authorization Gate
  │
  ├─ Execution token issued (contains intentId, nonce, expiry)
  │
  ▼
Fail-Closed Gate
  │
  ├─ Verifies execution token
  ├─ Checks token has not expired
  ├─ Checks nonce has not been used (replay prevention)
  │
  ▼
Email Connector
  │
  ├─ Reads intent args: { to, subject, body, cc, bcc, attachments }
  ├─ Calls Gmail API (OAuth2) or SMTP relay
  ├─ Captures result: { messageId, status, timestamp }
  │
  ▼
Receipt Generator
  │
  └─ Generates receipt with execution result embedded
```

**Gmail API integration:**

| Requirement | Detail |
|---|---|
| Authentication | OAuth2 service account or user-delegated credentials |
| Scopes | `gmail.send` (minimum), `gmail.compose` (if drafts needed) |
| Rate limits | 100 emails/second per user (Gmail API default) |
| Credentials storage | Environment variable or secrets manager (never in code) |

**SMTP integration (alternative):**

For organizations that use Exchange, Outlook, or other email systems, the connector supports standard SMTP relay. Configuration:

```env
EMAIL_CONNECTOR=smtp
SMTP_HOST=smtp.acme.internal
SMTP_PORT=587
SMTP_USER=rio-service@acme.com
SMTP_PASS=<from secrets manager>
SMTP_TLS=true
```

**Security boundary:** The Gmail API credentials (or SMTP credentials) exist only inside the email connector module. The AI agent never has access to these credentials. The agent can only propose an intent — it cannot send email directly.

---

## 7. HITL Approval Flow — Step by Step

This is the complete sequence for a single governed email send.

| Step | Actor | Action | System State |
|---|---|---|---|
| 1 | AI Agent | Calls `POST /api/v1/intents` with `{ tool: "gmail_send", args: { to: "client@example.com", subject: "Q1 Report", body: "..." } }` | Intent created, status: `pending_governance` |
| 2 | RIO Gateway | Computes SHA-256 hash of intent payload | `intentHash` stored |
| 3 | Policy Engine | Evaluates risk: `gmail_send` → **HIGH** (side effect, external recipient) | Risk tier assigned |
| 4 | Policy Engine | Checks custom rules (e.g., "block all emails to @competitor.com") | Rules evaluated |
| 5 | RIO Gateway | Routes intent to human approval queue | Status: `pending_approval` |
| 6 | ONE Dashboard | Displays to human: recipient, subject, body preview, risk tier, convergence score | Human sees full proposal |
| 7 | Human | Reviews the email. Clicks **Approve**. | — |
| 8 | ONE Dashboard | Generates Ed25519 signature over `{ intentId, decision: "approved", timestamp }` | Signature created client-side |
| 9 | RIO Gateway | Receives approval. Verifies Ed25519 signature against stored public key. | Signature verified |
| 10 | RIO Gateway | Checks nonce (prevents replay of old approvals). | Nonce validated |
| 11 | RIO Gateway | Issues execution token `{ intentId, nonce, expiry: +60s }` | Status: `authorized` |
| 12 | Fail-Closed Gate | Verifies execution token. Opens gate. | Gate open for this intent only |
| 13 | Email Connector | Calls Gmail API: `gmail.users.messages.send()` | Email sent |
| 14 | Email Connector | Captures result: `{ messageId: "abc123", status: "sent" }` | Execution result stored |
| 15 | Receipt Generator | Creates receipt: SHA-256 hash of `{ intentId, action, decision, result }` | Receipt hash computed |
| 16 | Receipt Generator | Signs receipt with Ed25519 server key | Receipt signed |
| 17 | Receipt Generator | Chains receipt to previous receipt hash | Hash chain extended |
| 18 | Ledger | Appends block: `{ blockId, intentId, action, decision, receiptHash, previousHash, currentHash }` | Ledger updated |
| 19 | ONE Dashboard | Updates UI: intent shows as "Executed — Receipt Available" | Human sees confirmation |

**If the human denies (Step 7 → Deny):**

| Step | Actor | Action |
|---|---|---|
| 7b | Human | Clicks **Deny** |
| 8b | ONE | Generates Ed25519 signature over `{ intentId, decision: "denied" }` |
| 9b | Gateway | Records denial. No execution token issued. |
| 10b | Receipt Generator | Generates denial receipt (the denial itself is recorded) |
| 11b | Ledger | Appends block with `decision: "denied"` |

**If the AI agent tries to execute without approval:**

| Step | Actor | Action |
|---|---|---|
| — | AI Agent | Calls `POST /api/v1/intents/{id}/execute` directly |
| — | Fail-Closed Gate | No valid execution token → returns **HTTP 403** |
| — | Receipt Generator | Generates blocked receipt (the attempt itself is recorded) |
| — | Ledger | Appends block with `decision: "blocked"` |

Every path — approved, denied, or blocked — produces a receipt and a ledger entry. There is no silent failure.

---

## 8. What the Organization Needs to Install

### Pilot (Single Server)

| Requirement | Specification |
|---|---|
| **Server** | 1 Linux VM or bare-metal server (2 vCPU, 4 GB RAM, 20 GB disk) |
| **Docker** | Docker Engine 24+ and Docker Compose v2 |
| **Database** | MySQL 8.0+ (can run in Docker alongside Gateway) |
| **TLS Certificate** | Valid HTTPS certificate (Let's Encrypt or internal CA) |
| **Network** | Outbound HTTPS to Gmail API (or internal SMTP access) |
| **DNS** | Internal DNS entry (e.g., `rio.acme.internal`) |

**Pilot deployment command:**

```bash
# Clone the deployment repo
git clone https://github.com/bkr1297-RIO/rio-deploy.git
cd rio-deploy

# Configure
cp .env.example .env
# Edit .env: set DATABASE_URL, GMAIL_CREDENTIALS, ED25519_KEY_PATH

# Start
docker compose up -d

# Verify
curl https://rio.acme.internal/api/v1/health
```

The pilot runs the Gateway, ONE, and MySQL in three containers on a single server. Total resource usage is under 2 GB RAM.

### Scaled (Production)

| Requirement | Specification |
|---|---|
| **Compute** | Kubernetes cluster or managed container service (2-4 pods) |
| **Database** | Managed MySQL (Azure Database for MySQL, AWS RDS) with automated backups |
| **Key Management** | Azure Key Vault, AWS KMS, or HashiCorp Vault for Ed25519 keys |
| **Load Balancer** | HTTPS termination with health checks |
| **Monitoring** | Prometheus/Grafana or cloud-native monitoring |
| **Backup** | Automated database backups with point-in-time recovery |

### What the Organization Does NOT Need

- No changes to their existing AI agent code (beyond adding RIO API calls)
- No replacement of their email system
- No new email accounts or domains
- No custom hardware
- No proprietary operating system

---

## 9. Open Source vs. Licensed

| Component | License | What It Includes |
|---|---|---|
| **Receipt Protocol** | MIT OR Apache-2.0 (open source) | Receipt generation, signing, verification, hash chaining, ledger format, Node.js SDK, Python SDK |
| **Verification Tool** | MIT OR Apache-2.0 (open source) | CLI and library for independent receipt verification |
| **RIO Gateway** | Commercial license (per-seat or per-instance) | Policy engine, risk assessment, authorization gate, fail-closed enforcement, execution control, connector framework |
| **ONE Command Center** | Commercial license (included with Gateway) | Human approval dashboard, kill switch, audit viewer, policy management, Telegram integration |
| **Email Connector** | Commercial license (included with Gateway) | Gmail API integration, SMTP relay, credential management |

**What this means for the customer:**

The customer can use the receipt protocol for free, forever, in any project. If they want to build their own governance layer on top of the receipt protocol, they can. The receipts they generate are compatible with the RIO verification tool regardless of whether they use the RIO Gateway.

The commercial license covers the governance enforcement — the part that ensures the AI cannot bypass human authority. This is the value the customer is paying for: structural enforcement, not just logging.

---

## 10. Non-Technical Stakeholder Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     YOUR ORGANIZATION                       │
│                                                             │
│   ┌──────────┐         ┌──────────────┐       ┌─────────┐  │
│   │          │  "I want │              │       │         │  │
│   │    AI    │──to send─▶     RIO      │       │  Human  │  │
│   │  Agent   │  email"  │  (Guardian)  │◀──────│ Manager │  │
│   │          │         │              │ "Yes,  │         │  │
│   └──────────┘         │              │  send  └─────────┘  │
│                        │              │  it"                │
│                        └──────┬───────┘                     │
│                               │                             │
│                          Only after                         │
│                          approval                           │
│                               │                             │
│                        ┌──────▼───────┐                     │
│                        │              │                     │
│                        │    Email     │──────▶ Recipient    │
│                        │   (Gmail)    │                     │
│                        │              │                     │
│                        └──────────────┘                     │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                    AUDIT TRAIL                       │   │
│   │  Every action — approved, denied, or blocked —      │   │
│   │  produces a signed receipt and a permanent record.   │   │
│   │  The record cannot be altered after the fact.        │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Three sentences for executives:**

1. The AI proposes an email. RIO shows it to a human manager for approval before it is sent.
2. If the human says no, the email is not sent. If the human says yes, the email is sent and a tamper-proof receipt is generated.
3. Every action — whether approved, denied, or blocked — is permanently recorded in an audit trail that cannot be altered.

---

## Pilot-to-Scale Progression

| Phase | Duration | Scope | Infrastructure |
|---|---|---|---|
| **Pilot** | 4-6 weeks | 1 team, 1 AI agent, email only | Single Docker server |
| **Expand** | 2-4 weeks | Multiple teams, multiple agents | Same server or small cluster |
| **Production** | Ongoing | Organization-wide, multiple connectors | Managed containers + managed database |
| **Compliance** | Ongoing | External auditor access to ledger verification | Verification endpoint exposed to auditors |

**Pilot success criteria:**
- 100+ governed email actions completed
- Zero unauthorized sends (fail-closed verified)
- Receipt chain integrity verified
- Human approval latency measured (target: <30 seconds for routine actions)
- Audit trail reviewed by compliance team

**What changes from pilot to production:**
- Database moves from local MySQL to managed service
- Ed25519 keys move from filesystem to key vault
- TLS certificate moves from Let's Encrypt to enterprise CA
- Monitoring and alerting added
- Backup and disaster recovery configured

The application code does not change. The same Docker image runs in pilot and production. Only the infrastructure configuration changes.
