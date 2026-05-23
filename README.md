# RIO System

**Governed AI execution runtime for accountable action under human authority.**

RIO sits between intelligent systems and consequential action. It provides policy review, authorization boundaries, execution gating, receipt generation, and ledger-backed proof.

This repository now contains the active RIO gateway runtime plus SPG-M pattern-governance integration.

---

## Current Runtime Status

The active runtime is the gateway in:

```text
gateway/
```

Core pipeline:

```text
Signal → Proposal → Policy → Authorization → Execution Gate → Execute → Receipt → Ledger
```

SPG-M integration:

```text
Pattern signal → SPG-M intake/review → RIO governance context → authorization boundary
```

---

## What RIO Does

- accepts proposed intents,
- evaluates policy and risk,
- requires human authorization when needed,
- blocks unauthorized execution,
- issues bounded execution tokens,
- generates cryptographic receipts,
- writes audit events to a persistent ledger,
- exposes public API v1 endpoints,
- verifies receipt/ledger lineage.

---

## What SPG-M Adds

SPG-M — Symbolic Pattern Governance Module — is a non-executing pattern-governance layer.

It can:

- receive ambiguous pattern signals,
- classify consequence class,
- produce gate and routing metadata,
- preview RIO policy review,
- pass optional review metadata into live governance,
- increase review weight when needed.

It cannot:

- approve,
- execute,
- issue tokens,
- generate receipts,
- create memory,
- bypass the Execution Gate.

Implemented SPG-M surfaces:

```text
GET /spgm/status
POST /spgm/intake
POST /spgm/policy-review
POST /govern
POST /api/v1/intents/:id/govern
```

---

## Key Runtime Docs

Read in this order:

1. [`SYSTEM_RUNTIME_MAP.md`](./SYSTEM_RUNTIME_MAP.md)
2. [`gateway/README.md`](./gateway/README.md)
3. [`docs/SPG_M_RUNTIME_PLACEMENT.md`](./docs/SPG_M_RUNTIME_PLACEMENT.md)
4. [`docs/SPG_M_GATEWAY_INTAKE_CONTRACT.md`](./docs/SPG_M_GATEWAY_INTAKE_CONTRACT.md)
5. [`docs/SPG_M_POLICY_CONTEXT_BRIDGE.md`](./docs/SPG_M_POLICY_CONTEXT_BRIDGE.md)
6. [`gateway/spgm/VERIFY_INTAKE.md`](./gateway/spgm/VERIFY_INTAKE.md)
7. [`gateway/spgm/VERIFY_POLICY_REVIEW.md`](./gateway/spgm/VERIFY_POLICY_REVIEW.md)
8. [`gateway/spgm/GOVERN_REQUEST_BRIDGE.md`](./gateway/spgm/GOVERN_REQUEST_BRIDGE.md)
9. [`gateway/spgm/API_V1_GOVERN_BRIDGE.md`](./gateway/spgm/API_V1_GOVERN_BRIDGE.md)
10. [`gateway/spgm/CI_VERIFICATION.md`](./gateway/spgm/CI_VERIFICATION.md)

---

## Verification

From `gateway/`:

```bash
npm test
npm run test:spgm
npm run test:spgm:policy-review
npm run test:spgm:govern
npm run test:spgm:openapi
```

SPG-M tests are also covered by GitHub Actions:

```text
.github/workflows/spgm-gateway-tests.yml
```

---

## Related Repositories

| Repository | Role |
|---|---|
| `rio-protocol` | protocol specification |
| `rio-receipt-protocol` | receipt proof layer |
| `rio-system` | active gateway/runtime |
| `language-intake-mvp` | language governance / crossing detection |

---

## One-Line Summary

Human-led. Machine-operated. Governed by protocol. Proven by receipts.
