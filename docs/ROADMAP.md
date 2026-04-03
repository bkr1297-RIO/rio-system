# Roadmap

Build plan for the RIO system. Phases are sequential but may overlap.

Last updated: 2026-04-03 by Manny

---

## Phase 0 — Protocol (Complete)

Establish the open proof standard.

| Item | Status | Owner |
|------|--------|-------|
| Receipt protocol specification | Done | Romney |
| Reference implementations (Node.js + Python) | Done | Romney |
| npm and PyPI package publishing | Done | Romney |
| Docker quickstart and REST API | Done | Romney |
| README and documentation restructure | Done | Romney |
| Public/private repo boundary | Done | Romney |

---

## Phase 1 — Control Plane (Complete)

Build the governance engine: risk assessment, policy enforcement, approval flow, execution, receipts, ledger.

| Item | Status | Owner |
|------|--------|-------|
| Bondi AI orchestrator (OpenAI + Claude routing) | Done | Manny |
| Intent creation + 4-tier risk classification | Done | Manny |
| Policy engine with editable custom rules | Done | Manny |
| Human-in-the-loop approval flow (Ed25519 signed) | Done | Manny |
| Execution gateway (Gmail, Search, SMS, Drive) | Done | Manny |
| Receipt generation + verification | Done | Manny |
| Hash-chained ledger with integrity verification | Done | Manny |
| Kill switch (emergency stop) | Done | Manny |
| Constitutional invariants (fail-closed) | Done | Manny |
| Telegram bot integration (approve/reject inline) | Done | Manny |
| 298+ tests passing | Done | Manny |

---

## Phase 2 — ONE Command Center (Current)

Build the human control surface for the RIO system.

| Item | Status | Owner |
|------|--------|-------|
| PWA with manifest + service worker | Done | Manny |
| Action approval screen (approve/deny) | Done | Manny |
| Action queue (pending approvals) | Done | Manny |
| Receipts viewer | Done | Manny |
| Ledger viewer | Done | Manny |
| System status dashboard | Done | Manny |
| Editable policy rules UI | Done | Manny |
| In-app notification center | Done | Manny |
| Activity feed + audit views | Done | Manny |
| Learning events tracking | Done | Manny |
| Multi-agent coordination structure | Done | Romney |
| Agent skills (5 roles in repo) | Done | Manny |
| Agent onboarding | In Progress | Brian |
| Protocol Packs (domain-specific policies) | Not Started | Manny |
| Learning Loop feedback (events improve Bondi) | Not Started | Manny |
| PWA push notifications (VAPID keys) | Not Started | Manny |

---

## Phase 3 — Packaging and Distribution (Starting)

Make the system deployable and adoptable.

| Item | Status | Owner |
|------|--------|-------|
| Gateway server for self-hosted deployment | In Progress | Manny |
| Cloud deployment (CI/CD) | Not Started | Romney |
| Developer documentation and tutorials | Not Started | Damon |
| Solution architecture examples | Not Started | Andrew |
| Compliance and regulatory mapping | Not Started | TBD |

---

## Phase 4 — Witness and Verification (Future)

Independent verification network and trust anchoring.

| Item | Status | Owner |
|------|--------|-------|
| Witness service (independent verifier) | Not Started | TBD |
| Blockchain/timestamp anchoring | Not Started | TBD |
| Cross-organizational receipt verification | Not Started | TBD |

---

## Future Vision

- Multi-tenant governance
- Connector marketplace
- Industry-specific compliance packages (Protocol Packs)
- MANTIS observation and learning system (awareness layers)
- Context dynamics (session observation)
- Mosaic layer (cross-session pattern detection)
- Meta layer (system self-observation)
- Robotics and physical-world action governance
