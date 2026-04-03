# RIO Platform — Deployment Options

**Author:** Andrew (Solutions Architect)
**Date:** 2026-04-03
**Audience:** Prospects, partners, and engineering teams evaluating RIO

---

## Overview

RIO supports three deployment models. Each provides the same governance guarantees — the difference is where the infrastructure runs and who manages it. All models enforce the same core invariant: no high-risk action executes without human authority, cryptographic proof, and an immutable record.

---

## Option 1: Hosted (Managed by RIO)

The simplest path to production. RIO runs the infrastructure; the customer connects their AI agents via API.

| Aspect | Detail |
|---|---|
| **Infrastructure** | Managed by RIO team |
| **ONE Command Center** | Hosted at customer subdomain (e.g., `acme.rio-one.io`) |
| **Governance Engine** | Runs as a managed service |
| **Ledger Storage** | Managed TiDB/MySQL with automated backups |
| **Data Residency** | US by default; EU available on request |
| **Setup Time** | 1-2 weeks |
| **Maintenance** | Zero — updates, patches, and scaling handled by RIO |

**Best for:** Teams that want governance without infrastructure overhead. Companies in early AI adoption that need to move fast.

**What the customer provides:** API credentials for their AI agent framework (OpenAI, Anthropic, LangChain, or custom). Connector credentials for target services (Gmail, Slack, etc.).

**What RIO provides:** Fully operational ONE dashboard, governance engine, receipt generation, ledger, and monitoring.

---

## Option 2: Self-Hosted (On Customer Infrastructure)

Full control. The customer runs the entire RIO stack on their own infrastructure using Docker.

| Aspect | Detail |
|---|---|
| **Infrastructure** | Customer-managed (Azure, AWS, GCP, or on-premise) |
| **ONE Command Center** | Runs as a Docker container on customer servers |
| **Governance Engine** | Runs locally — no external calls for governance decisions |
| **Ledger Storage** | Customer's own MySQL/PostgreSQL instance |
| **Data Residency** | Wherever the customer deploys |
| **Setup Time** | 2-4 weeks (includes infrastructure provisioning) |
| **Maintenance** | Customer-managed with RIO support for updates |

**Best for:** Regulated industries (financial services, healthcare, government) where data cannot leave the organization's network. Companies with existing DevOps teams and cloud infrastructure.

**What the customer provides:** Cloud or on-premise infrastructure, database instance, DevOps team for deployment and maintenance.

**What RIO provides:** Docker images, deployment documentation, configuration guides, and ongoing support. The standalone gateway server (currently in development) will be the primary distribution artifact for this model.

**Infrastructure requirements:**

| Component | Minimum | Recommended |
|---|---|---|
| Compute | 2 vCPU, 4 GB RAM | 4 vCPU, 8 GB RAM |
| Database | MySQL 8.0+ or PostgreSQL 14+ | TiDB or managed MySQL/PostgreSQL |
| Storage | 10 GB for application + ledger growth | 50 GB with automated backup |
| Network | HTTPS with valid TLS certificate | Load balancer with health checks |

---

## Option 3: Hybrid

The receipt protocol runs locally; governance connects to the RIO cloud. This model lets companies start generating receipts immediately while the governance layer is configured.

| Aspect | Detail |
|---|---|
| **Receipt Protocol** | Runs locally via npm/PyPI SDK — fully open source |
| **Governance Engine** | Connects to RIO cloud service |
| **ONE Command Center** | Hosted or self-hosted (customer choice) |
| **Ledger** | Local ledger for receipts; cloud ledger for governance events |
| **Setup Time** | Days for receipts; 1-2 weeks for governance |

**Best for:** Companies that want to start with the free receipt protocol to validate the integration pattern, then add governance enforcement incrementally.

**Typical progression:**
1. Install receipt SDK (`npm install rio-receipt-protocol`)
2. Wrap existing AI agent actions with receipt generation
3. Validate receipts are generating correctly
4. Connect to RIO governance API for HITL enforcement
5. Deploy ONE for human operators

---

## Comparison

| Factor | Hosted | Self-Hosted | Hybrid |
|---|---|---|---|
| Setup time | 1-2 weeks | 2-4 weeks | Days to weeks |
| Infrastructure management | RIO | Customer | Split |
| Data residency control | Limited | Full | Split |
| Governance latency | Cloud round-trip | Local | Cloud round-trip |
| Cost structure | Subscription | License + infra | Incremental |
| Compliance suitability | Standard | Regulated industries | Transitional |
| Offline capability | No | Yes | Partial |

---

## Integration Architecture

Regardless of deployment model, the integration pattern is the same:

```
Customer AI Agent
  → POST /api/v1/intents (propose action)
    → RIO Governance Engine
      → Policy Engine (risk assessment)
        → LOW risk: auto-approve
        → MEDIUM/HIGH/CRITICAL: route to human
      → Human approves in ONE (Ed25519 signature)
    → POST /api/v1/intents/{id}/execute
      → Execution via connector
      → Receipt generated (SHA-256 + Ed25519)
      → Ledger entry appended (hash-chained)
```

The customer's AI agents interact with RIO through a standard REST API. No changes to the agent's core logic are required — RIO wraps the execution layer.

---

## Next Steps for Prospects

1. **30-minute discovery call** — Understand requirements, compliance needs, and current AI stack
2. **Technical deep dive** — Architecture walkthrough with the Solutions Architect
3. **Pilot proposal** — Scoped deployment plan with timeline and success metrics
4. **Pilot deployment** — 4-6 weeks with a single team or use case

Brian handles pricing discussions and pilot agreements directly.
