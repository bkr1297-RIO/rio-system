# v1.0 — Execution Boundary + Receipt Protocol

## RIO v1.0

This is the first public release of RIO.

RIO is a sovereign execution standard that defines how digital actions become real.

It ensures that no action is executed unless it is:
- explicitly authorized
- exactly bound to the approved intent
- provably recorded

---

## What this release includes

This repository provides the core enforcement layer of the system:

- Execution Boundary (fail-closed gate)
- Token-based authorization (DTT)
- Exact payload binding (no drift)
- Receipt Protocol (verifiable records)
- Hash-chained ledger (immutable history)

---

## What is demonstrated

This release proves the core claim:

- invalid actions are blocked before execution
- valid actions execute exactly as approved
- all outcomes are recorded and verifiable
- no execution path bypasses the gate

You can run the included examples to see this behavior directly.

---

## What this is

This is the verification and enforcement layer of RIO.

It demonstrates how to:
- gate execution deterministically
- bind authorization to exact intent
- produce cryptographic proof of outcomes

---

## What this is not

This repository does not:
- authorize actions
- execute real-world integrations
- make decisions

It enforces and proves what is allowed to become real.

---

## Why this matters

As systems gain the ability to act, the risk is not failure.

The risk is unintended success.

RIO ensures that nothing becomes real without explicit authorization—and proof.

---

## Status

Phase 1 complete:
- execution boundary implemented
- invariant enforced
- behavior validated under test

---

## Getting started

npm install rio-receipt-protocol  
node examples/signing/generate_receipt.js  
npm run verify:all  

---

## One line

RIO makes unauthorized consequences impossible—and proves it.
