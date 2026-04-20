# Who Owns What

Ownership map for the RIO project. Check this before working on anything. If it is not yours, coordinate before touching it.

---

## Repos

| Repo | Owner | Notes |
|------|-------|-------|
| `rio-receipt-protocol` (public) | Romney | Open proof standard — receipts, ledger, verifier, SDKs, examples |
| `rio-system` (private) | Manny (system) / Romney (coordination) | Governance engine, platform, and coordination docs |

---

## Systems

| System | Owner | Notes |
|--------|-------|-------|
| Receipt Protocol (spec + reference impl) | Romney | Published, stable |
| Gateway Server | Manny | Express, Ed25519, OAuth, execution control |
| ONE Command Center | Manny | PWA, human oversight dashboard |
| Policy Engine (Bondi) | Manny | Risk assessment, governance decisions |
| Ledger Infrastructure | Manny | Append-only, hash-chained, future PostgreSQL |
| Connectors | Manny | External system integrations |

---

## Documentation

| Doc Area | Owner | Notes |
|----------|-------|-------|
| Protocol specs (`spec/`) | Romney / Jordan | Receipt, ledger, conformance specs |
| Coordination docs (`docs/STATUS.md`, etc.) | Romney | This coordination structure |
| Architecture docs (`docs/architecture/`) | Andrew | System architecture and integration patterns |
| Enterprise docs (`docs/enterprise/`) | Andrew | Enterprise adoption guides |
| Security docs (`docs/security/`) | Manny | Threat model, security hardening |
| Developer guides (`docs/guides/`) | Damon | Tutorials, quickstarts, examples |
| Whitepapers (`docs/whitepapers/`) | Jordan | Research and positioning papers |
| Knowledge organization | Jordan | Overall doc structure and consistency |

---

## Infrastructure

| Infrastructure | Owner | Notes |
|---------------|-------|-------|
| npm package publishing | Romney | `rio-receipt-protocol` on npm |
| PyPI package publishing | Romney | `rio-receipt-protocol` on PyPI |
| Docker images | Romney | Dockerfile, docker-compose |
| CI/CD pipeline | Romney | GitHub Actions (future) |
| Cloud deployment | TBD | Azure or similar (future) |
| Domain and DNS | Brian | Final authority on domains |

---

## Decisions

| Decision Area | Owner | Notes |
|--------------|-------|-------|
| Product direction | Brian | Final authority |
| Architecture decisions | Brian / Manny | Manny proposes, Brian approves |
| Licensing | Brian | Final authority |
| Public/private boundary | Brian | What is open vs. licensed |
| Naming | Brian | Product and component names |
| Hiring / new agents | Brian | Final authority |
