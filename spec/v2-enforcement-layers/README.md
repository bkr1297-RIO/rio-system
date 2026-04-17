# RIO System Specification

> No change to the world or system state can occur unless it passes through the RIO pipeline and is recorded in the ledger.

> Receipts never grant authority. Authority must always be explicitly re-issued.

This repository contains the canonical specification for the RIO governed execution system, extracted directly from the implementation with zero interpretation. Every schema, constant, validation rule, and failure condition is traced to its source file.

---

## Repository Structure

```
specs/
├── 01_commit_chain/
│   ├── README.md                  ← Enforcement layer spec
│   └── schema.json                ← JSON Schema + validation rules + failure conditions
├── 02_governance_decision/
│   ├── README.md
│   └── schema.json
├── 03_execution_token/
│   ├── README.md
│   └── schema.json
├── 04_witness_receipt/
│   ├── README.md
│   └── schema.json
├── 05_delegation_boundary/
│   ├── README.md
│   └── schema.json
└── 06_cross_substrate/           ← NEW
    ├── README.md
    └── CROSS_SUBSTRATE_SPEC.json
flows/
└── cross_substrate_flow.md       ← NEW
docs/
├── SYSTEM_OVERVIEW.md
├── INVARIANT.md                  ← NEW
├── TWO_QUESTION_PATTERN.md       ← NEW
├── BREAK_TESTS.md
└── IMPLEMENTATION_GUIDE.md
```

---

## Six Enforcement Layers

| # | Layer | What It Enforces |
|---|---|---|
| 01 | **Commit Chain** | Append-only hash-linked ledger. WAL discipline. Integrity substrate. Nonce persistence. Genesis record. |
| 02 | **Governance Decision** | Intent envelope. 6-check verification. Risk assessment. Human authorization. Expression isolation. Learning loop. |
| 03 | **Execution Token** | Single-use token (5s TTL). 6-check preflight gate. Tool sandbox. Kernel execution order. |
| 04 | **Witness Receipt** | Chain-of-custody artifact. Hash binding. Receipt chaining (64-zero genesis). |
| 05 | **Delegation Boundary** | Constrained delegation (120s cooldown). Gateway identity evaluation. Authority model labels. Role enforcement. |
| 06 | **Cross-Substrate Handoff** | Receipt validation + fresh authorization at every substrate boundary. No implicit authority flow. |

---

## Critical Refinement: Receipt ≠ Authorization

Every spec in this repo enforces the same rule:

> Execution requires a locally issued authorization. Upstream receipts may be consumed but never grant permission.

At every execution boundary, two questions must be answered:

1. **Is the upstream output trustworthy?** — Validate the receipt (signature, timing, identity, measurement).
2. **What is allowed to happen next?** — Issue a new authorization (DTT).

See `docs/TWO_QUESTION_PATTERN.md` and `docs/INVARIANT.md` for the full specification.

---

## How to Read This Repo

Each enforcement layer has two files:

- **`README.md`** — Human-readable spec. Describes purpose, schemas, validation rules, constants, and failure conditions.

- **`schema.json`** (or `CROSS_SUBSTRATE_SPEC.json`) — Machine-readable spec. JSON Schema definitions for every type, plus `validation_rules` and `failure_conditions` sections with source file attribution. Every spec includes an `authority_boundary_rule` section enforcing the receipt ≠ authorization invariant.

The `flows/` directory provides execution flow documentation:

- **`cross_substrate_flow.md`** — Step-by-step cross-substrate handoff: validate receipt, issue new DTT, execute, generate receipt, repeat.

The `docs/` directory provides cross-cutting documentation:

- **`SYSTEM_OVERVIEW.md`** — Full pipeline flow, design principles, execution surface, constants summary, final refinement.
- **`INVARIANT.md`** — The core invariant: no action without valid receipt + fresh authorization. Authority properties.
- **`TWO_QUESTION_PATTERN.md`** — The two-question pattern applied at every execution boundary.
- **`BREAK_TESTS.md`** — 8 attack vectors (including cross-substrate authority leak), 140+ tests, 0 bypasses.
- **`IMPLEMENTATION_GUIDE.md`** — Build order (5 phases), acceptance criteria from all test suites, source file map.

---

## Source Attribution

Every schema, rule, and constant traces to its source file:

| Source File | What It Provides |
|---|---|
| `controlPlane.ts` | A1-A8 schemas, verification, governance, approval, execution token, receipt, ledger, expression isolation, learning loop |
| `kernelExecutor.ts` | Kernel execution membrane, WAL discipline, tool sandbox, nonce consumption, startup verification |
| `constrainedDelegation.ts` | Delegation policy, cooldown, role permissions |
| `gatewayProxy.ts` | Gateway identity evaluation, authority model labels |
| `integritySubstrate.ts` | 4-check substrate gate |
| `authorityLayer.ts` | Root authority, signed policy, authorization token, canonical receipt, genesis record |

---

## Design Principles

| Principle | Meaning |
|---|---|
| Fail closed | Every unknown state resolves to HOLD. |
| Silence equals refusal | No implied authority. Missing approval = rejection. |
| No implicit authority | Every action requires explicit authorization. |
| No dual role | No component may both approve and execute the same action. |
| Learning is advisory | Never mutates live policy until human promotes it. |
| Receipt ≠ Authorization | Receipts are proof. Authorization is permission. They are never the same thing. |

---

## Audit Status

140 tests across 4 suites. 0 bypasses found.

| Section | Status |
|---|---|
| §1.1 Execution Membrane | PASS |
| §1.2 Approval Membrane | PASS |
| §1.3 Expression Layer | PASS |
| §2.A Execution Isolation | PASS |
| §2.B Write-Ahead Ledger | PASS |
| §2.C Atomic Approval (CAS) | PASS |
| §2.D Global Entry Enforcement | PASS |
| §2.E Expression Isolation | PASS |
| §3 Security Primitives | PASS |
| §7 Tool Sandbox | PASS |
| §8 Failure Semantics | PASS |
| §9 Ledger Integrity | PASS |
| §10 Acceptance Tests | PASS (63/63) |
| §11 Red-Team Audit | PASS (140/140) |
| §12 Final Invariant | PASS |
