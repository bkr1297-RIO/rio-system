# RIO System Specification

> No change to the world or system state can occur unless it passes through the RIO pipeline and is recorded in the ledger.

This repository contains the canonical specification for the RIO governed execution system, extracted directly from the implementation with zero interpretation. Every schema, constant, validation rule, and failure condition is traced to its source file.

---

## Repository Structure

```
rio-spec/
├── README.md                          ← This file
├── specs/
│   ├── 01_commit_chain/
│   │   ├── README.md                  ← Enforcement layer spec
│   │   └── schema.json                ← JSON Schema + validation rules + failure conditions
│   ├── 02_governance_decision/
│   │   ├── README.md
│   │   └── schema.json
│   ├── 03_execution_token/
│   │   ├── README.md
│   │   └── schema.json
│   ├── 04_witness_receipt/
│   │   ├── README.md
│   │   └── schema.json
│   └── 05_delegation_boundary/
│       ├── README.md
│       └── schema.json
└── docs/
    ├── SYSTEM_OVERVIEW.md             ← Full system description
    ├── BREAK_TESTS.md                 ← 7 attack vectors, 140 tests, 0 bypasses
    └── IMPLEMENTATION_GUIDE.md        ← Build order + acceptance criteria
```

---

## Five Enforcement Layers

| # | Layer | What It Enforces |
|---|---|---|
| 01 | **Commit Chain** | Append-only hash-linked ledger. WAL discipline. Integrity substrate. Nonce persistence. Genesis record. |
| 02 | **Governance Decision** | Intent envelope. 6-check verification. Risk assessment. Human authorization. Expression isolation. Learning loop. |
| 03 | **Execution Token** | Single-use token (5s TTL). 6-check preflight gate. Tool sandbox. Kernel execution order. |
| 04 | **Witness Receipt** | Chain-of-custody artifact. Hash binding. Receipt chaining (64-zero genesis). |
| 05 | **Delegation Boundary** | Constrained delegation (120s cooldown). Gateway identity evaluation. Authority model labels. Role enforcement. |

---

## How to Read This Repo

Each enforcement layer has two files:

- **`README.md`** — Human-readable spec. Describes purpose, schemas, validation rules, constants, and failure conditions. Includes tables mapping every check, every constant, and every failure mode.

- **`schema.json`** — Machine-readable spec. JSON Schema definitions for every type, plus `validation_rules` and `failure_conditions` sections with source file attribution.

The `docs/` directory provides cross-cutting documentation:

- **`SYSTEM_OVERVIEW.md`** — Full pipeline flow, design principles, execution surface, constants summary.
- **`BREAK_TESTS.md`** — All 7 attack vectors, 140 tests, 0 bypasses. Extracted from the red-team audit.
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
