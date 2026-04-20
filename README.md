# RIO — Governed Execution Standard

RIO is a governed execution system. It sits between AI agents, humans, and real-world actions. Every action with real-world consequences passes through a fixed sequence: governance, authorization, execution, receipt, ledger. The system enforces the rules — not the AI.

---

## System Definition

RIO converts AI-proposed actions into human-authorized, policy-controlled, cryptographically verifiable transactions.

```
Intent → Governance → Authorization → Execution → Receipt → Ledger
```

No action with real-world consequences occurs without:

1. **Governance** — policy evaluation and risk classification.
2. **Authorization** — human approval when required by policy.
3. **Proof** — cryptographic receipt written to a hash-chained ledger.

If any condition cannot be met, the action does not execute. The system fails closed.

---

## Core Flow

| Step | What Happens | Enforcement |
|------|-------------|-------------|
| 1 | Intent proposed | Structured envelope with identity, nonce, parameters. |
| 2 | Verification | Six-check gate: schema, auth, signature, TTL, nonce, replay. |
| 3 | Governance | Risk assessment. APPROVE, DENY, or REQUIRE_HUMAN_APPROVAL. |
| 4 | Authorization | Token issued after approval. Single-use, time-limited, hash-bound. |
| 5 | Execution | Gate validates token. Adapter performs side effect. |
| 6 | Receipt | SHA-256 hash over full chain of custody. Gateway-signed. |
| 7 | Ledger | Hash-chained entry. Append-only. Independently verifiable. |

---

## Three-Power Separation

No single component can both decide and act.

| Power | Role | Can Do | Cannot Do |
|-------|------|--------|-----------|
| **Governor** | Decide | Evaluate policy, classify risk, issue approval | Execute |
| **Gate** | Enforce | Validate token, dispatch to adapter | Approve |
| **Ledger** | Record | Write receipts, chain hashes, prove history | Decide or execute |

---

## Compliance

```
PGTC Core 1.0
Test Suite: TS-01
Compliance: 20/20 PASS
Governance Tests: 148/148 PASS
Reference Implementation: RIO
Checkpoint: 2e193690
```

Full compliance report: [`compliance/PGTC-COMPLIANCE-REPORT.md`](compliance/PGTC-COMPLIANCE-REPORT.md)

---

## Protocols

| Protocol | Scope | Document |
|----------|-------|----------|
| **CS-03** | Authorization | [`protocols/rio-cs-03-authorization.md`](protocols/rio-cs-03-authorization.md) |
| **CS-04** | Execution Boundary | [`protocols/rio-cs-04-execution-boundary.md`](protocols/rio-cs-04-execution-boundary.md) |
| **CS-05** | Receipt and Ledger | [`protocols/rio-cs-05-receipt-ledger.md`](protocols/rio-cs-05-receipt-ledger.md) |

---

## Repository Structure

```
/
  README.md                              ← This file
  RIO-CONSTITUTION.md                    ← System constitution (highest authority)

  protocols/
    rio-cs-03-authorization.md           ← Token issuance, binding, validation
    rio-cs-04-execution-boundary.md      ← Gate enforcement, adapter pattern
    rio-cs-05-receipt-ledger.md          ← Receipts, hash-chained ledger

  spec/
    RIO-STANDARD-v1.0.md                ← System architecture standard
    UNIFIED_ARCHITECTURE.md              ← Unified architecture reference

  compliance/
    PGTC-COMPLIANCE-REPORT.md            ← Full compliance report
    CONFORMANCE.md                       ← Conformance surface
    spec/                                ← PGTC specification (5 files)
    schemas/                             ← JSON schemas (5 files)
    test-suite/                          ← Core test suite
    harness/                             ← Test harness
    rio_adversarial_test_suite_v0.1/     ← Adversarial tests (10 files)
    runtime/                             ← Runtime concurrency tests
    authority/                           ← Authority chain tests
    evidence/                            ← Test evidence artifacts

  demo/
    demo.html                            ← Redirect → rio-one.manus.space
    timeline.html                        ← Redirect → riodigital-cqy2ymbu.manus.space
    DEMO_WALKTHROUGH.md                  ← Demo walkthrough guide

  docs/
    white_paper.md                       ← White paper
    one_pager.md                         ← One-page summary
    FAQ.md                               ← Frequently asked questions

  verifier/
    verify.py                            ← Independent compliance verifier

  assets/
    (architecture diagrams)

  legacy/
    (all prior work — preserved, not part of release surface)
```

---

## Live Demo

| Demo | URL |
|------|-----|
| RIO ONE (command center) | [rio-one.manus.space](https://rio-one.manus.space) |
| RIO Timeline | [riodigital-cqy2ymbu.manus.space](https://riodigital-cqy2ymbu.manus.space) |

---

## Quick Links

| Resource | Path |
|----------|------|
| Constitution | [`RIO-CONSTITUTION.md`](RIO-CONSTITUTION.md) |
| System Standard | [`spec/RIO-STANDARD-v1.0.md`](spec/RIO-STANDARD-v1.0.md) |
| White Paper | [`docs/white_paper.md`](docs/white_paper.md) |
| One Pager | [`docs/one_pager.md`](docs/one_pager.md) |
| FAQ | [`docs/FAQ.md`](docs/FAQ.md) |
| Compliance Report | [`compliance/PGTC-COMPLIANCE-REPORT.md`](compliance/PGTC-COMPLIANCE-REPORT.md) |
| Verifier | [`verifier/verify.py`](verifier/verify.py) |

---

## License

All rights reserved. Contact the author for licensing inquiries.
