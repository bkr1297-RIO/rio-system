# RIO — One Pager

## What It Is

RIO is a governed execution system. It sits between AI agents, humans, and real-world actions. It converts AI-proposed actions into human-authorized, policy-controlled, cryptographically verifiable transactions.

## The Problem

AI systems can propose and execute actions — send emails, move files, call APIs, transfer funds. Without governance, there is no way to verify what was authorized, what was executed, or whether the two match.

## The Solution

RIO enforces a fixed execution loop for every real-world action:

```
Intent → Governance → Authorization → Execution → Receipt → Ledger
```

No action with real-world consequences occurs without policy evaluation, human authorization (when required), and cryptographic proof.

## Core Protocols

| Protocol | What It Governs |
|----------|----------------|
| **CS-03: Authorization** | Token issuance, binding, validation, and single-use consumption. |
| **CS-04: Execution Boundary** | Gate enforcement, adapter pattern, credential isolation, phase ordering. |
| **CS-05: Receipt and Ledger** | Cryptographic receipts, hash-chained ledger, independent verification. |

## Three-Power Separation

No single component can both decide and act.

| Power | Role | Can Do | Cannot Do |
|-------|------|--------|-----------|
| Governor | Decide | Evaluate policy, classify risk, issue approval | Execute |
| Gate | Enforce | Validate token, dispatch to adapter | Approve |
| Ledger | Record | Write receipts, chain hashes, prove history | Decide or execute |

## System Guarantee

Every governed action produces:

1. An authorization token bound to the approved intent.
2. A cryptographic receipt covering the full chain of custody.
3. A hash-chained ledger entry linking to the previous entry.

If any condition cannot be met, the action does not execute. The system fails closed.

## Compliance

| Metric | Result |
|--------|--------|
| PGTC Core 1.0 | 20/20 PASS |
| Governance Tests | 148/148 PASS |
| Test Suite | TS-01 |
| Reference Implementation | RIO |

## Links

| Resource | Location |
|----------|----------|
| Constitution | [`RIO-CONSTITUTION.md`](../RIO-CONSTITUTION.md) |
| Protocols | [`protocols/`](../protocols/) |
| Compliance Kit | [`compliance/`](../compliance/) |
| Live Demo | [rio-one.manus.space](https://rio-one.manus.space) |
| White Paper | [`docs/white_paper.md`](white_paper.md) |
