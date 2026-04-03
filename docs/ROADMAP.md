# Roadmap

Build plan for the RIO system. Phases are sequential but may overlap.

---

## Phase 1 — Foundation (Current)

Establish the open proof standard and core governance infrastructure.

| Item | Status | Owner |
|------|--------|-------|
| Receipt protocol specification | Done | Romney |
| Reference implementations (Node.js + Python) | Done | Romney |
| npm and PyPI package publishing | Done | Romney |
| Docker quickstart and REST API | Done | Romney |
| README and documentation restructure | Done | Romney |
| Public/private repo boundary | Done | Romney |
| Gateway server (Express, Ed25519, OAuth) | In Progress | Manny |
| ONE command center (PWA) | In Progress | Manny |
| Multi-agent coordination structure | In Progress | Romney |
| Agent onboarding | Not Started | Brian |

---

## Phase 2 — Governed Execution Loop

Complete one end-to-end governed action: intent enters, gets evaluated, approved, executed, receipted, and ledgered.

| Item | Status | Owner |
|------|--------|-------|
| One closed-loop governed action demo | Not Started | Manny |
| Policy engine (Bondi) integration | Not Started | Manny |
| Human-in-the-loop approval flow | Not Started | Manny |
| Ledger persistence (PostgreSQL) | Not Started | TBD |
| Public verification endpoint | Not Started | TBD |

---

## Phase 3 — Production and Adoption

Make the system production-capable and drive developer adoption.

| Item | Status | Owner |
|------|--------|-------|
| Cloud deployment (CI/CD) | Not Started | TBD |
| Enterprise security hardening | Not Started | TBD |
| Developer documentation and tutorials | Not Started | Damon |
| Solution architecture examples | Not Started | Andrew |
| Compliance and regulatory mapping | Not Started | TBD |

---

## Future Vision

- Multi-tenant governance
- Connector marketplace
- Cross-organizational receipt verification
- Industry-specific compliance packages
- MANTIS observation and learning system
- Robotics and physical-world action governance
