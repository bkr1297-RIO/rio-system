# RIO — Governed Execution

## What this is

RIO is a control plane for how software takes real-world actions — giving you confidence that nothing happens without you knowing, approving it, and a clear record of who approved it and when.

It does not generate output.
It does not make decisions.
It does not act on its own.

It sits between your systems and the real world, watching and enforcing what is allowed to happen.

RIO is both a governed execution architecture and a published governance standard — the specifications in `/docs/` define the rules the code enforces.

It is built on one rule that does not change:

> **Authority stays with the human. Always.**

If something is not explicitly approved, it cannot happen.

---

## Standard and Verification

| Document | Location | Role |
|----------|----------|------|
| RIO Standard | [spec/RIO-STANDARD-v1.0.md](spec/RIO-STANDARD-v1.0.md) | Authoritative specification |
| Conformance Spec | [rio-protocol: spec/RIO_CONFORMANCE_v1.0.md](https://github.com/bkr1297-RIO/rio-protocol/blob/main/spec/RIO_CONFORMANCE_v1.0.md) | How compliance is verified |
| Runtime Map | [SYSTEM_RUNTIME_MAP.md](SYSTEM_RUNTIME_MAP.md) | What is running, what is planned, how to verify |

---

## The problem it solves

AI systems are no longer just suggesting. They are acting.

They can:

- send emails
- trigger workflows
- move files
- call APIs
- change systems

The problem is simple:

It's easy for something to happen that you didn't fully intend, didn't clearly define, or can't clearly account for afterward.

You approve something quickly.
The system interprets it slightly differently.
Something happens.

Or worse — something happens without clear, traceable approval.

Most systems try to reduce mistakes or log what happened after the fact.

RIO takes a different approach.

**It makes unapproved or unverifiable action not possible within the system.**

---

## How it works

There is only one way an action can happen.

Your system attempts to take a real-world action — for example, updating a record or sending data to another system.
RIO intercepts it and checks it against your rules.

If it falls outside what's already allowed, it's stopped and surfaced to you as a clear, reviewable request.

You approve it. That approval applies only to that specific action.

RIO verifies nothing has changed and keeps execution within what you approved.

Only then does the action run.

A record is written before it runs, and a durable receipt is created after.

If anything is unclear, incomplete, or doesn't match:

**the system stops.**

RIO enforces whatever rules you define — and as those rules evolve, the system applies them in real time.

---

## What this means

You don't have to constantly watch your systems.

Because they are structurally constrained from acting without your approval.

- No accidental actions
- No hidden behavior
- No silent interpretation
- No "close enough" execution

Every action is:

- explicit
- approved
- verified
- recorded

Not just logs.

**Verifiable records.**

---

## Who this is for

- Teams using AI or automation to take real-world actions
- Organizations that need to demonstrate that actions were explicitly authorized
- Compliance and audit functions that require more than "we think it was approved"
- Anyone who wants powerful systems without giving up control
- Anyone who worries a system might act in a way they didn't intend — and create real-world consequences

---

## Why it matters

As software moves from "helping" to "doing," the risk changes.

It's no longer about bad outputs.

It's about real-world consequences.

RIO addresses a core problem:

**How to use powerful systems while staying in control of what they actually do.**

In a landscape where AI systems can act but cannot be verified, RIO provides a way to prove exactly what was authorized and what actually happened.

---

## What comes next

Systems built with RIO can get better at helping you.

They can learn patterns, suggest better options, and reduce friction over time.

But that learning never expands what the system is allowed to do.

It can improve how decisions are prepared.
It cannot act outside defined and approved boundaries.

---

## Final principle

**You stay in control.**

Nothing happens without your approval, and everything that does is accounted for.

---

## Architecture Layers

### 1. RIO Standard (this repository)

**Scope:** Execution Boundary + Receipt Protocol

This layer defines:

- how digital actions become eligible for execution
- how authorization is bound to exact intent (no payload drift)
- how outcomes are recorded as verifiable receipts and ledger entries

It proves that:

- invalid actions are blocked before execution
- valid actions execute exactly as approved
- all outcomes are recorded and verifiable
- no execution path bypasses the gate

> This repo is the enforcement and proof layer: it makes unauthorized consequences impossible—and proves it.

### 2. Application Layer (separate specifications)

Above the RIO Standard, application-layer systems interpret intent, model patterns, and assist decision-making. They do not have direct execution authority.

Examples (published as separate documents):

- **Digital Fiduciary Specification (v1.0)**  
  `applications/DIGITAL_FIDUCIARY_SPEC_v1.0.md`  
  Defines how a "Digital Fiduciary" acts as a pattern-aware, governance-bound assistant that:
  - models a principal's behavior and preferences
  - detects deviations from expected patterns
  - emits structured recommendations and signals
  - never issues authorization or executes actions directly
  All real execution still flows through the RIO boundary.

- Future application specs may define other roles, such as observers, explainers, or domain-specific copilots. These also remain above the RIO Standard and depend on it, but do not modify it.

Application-layer specifications (e.g., Interaction Monitor) extend the system by improving interaction clarity, but do not modify execution authority or enforcement.

### 3. Operating Environments (other repos)

Systems like **ONE** and **MANTIS** are higher-level environments and ecosystems that:

- host application-layer agents (including Digital Fiduciaries)
- provide interfaces for humans and other systems
- consume the RIO Standard as the underlying execution boundary and receipt protocol

They are intentionally not part of this repository. This keeps:

- the RIO Standard small, testable, and implementation-independent
- the application and environment layers free to evolve without changing the enforcement core

---

## Governance Specifications

The following documents define the constitutional rules enforced by the RIO runtime.

| Document | Description |
|----------|-------------|
| [Fiduciary Invariants v1.0](docs/governance/RIO_Fiduciary_Invariants_v1_0.md) | The seven non-negotiable invariants governing any agent or proxy acting on behalf of a human. |
| [Control Plane Boundary v1.0](docs/governance/RIO_Control_Plane_Boundary_v1_0.md) | Absolute prohibitions and permitted functions for the control plane, witness layer, and learning system. |
| [Role Calibration v0.2](docs/governance/RIO_Role_Calibration_v0_2.md) | Functional roles inside a live RIO loop — model-agnostic, permanently separated. |
| [Governed Corpus v1.0](docs/governance/RIO_Governed_Corpus_v1_0.md) | The unified observation and memory substrate combining witness and ledger functions. |
| [Bondi Operational Definition v1.0](docs/bondi/Bondi_Operational_Definition_v1_0.md) | Defines Bondi as an interaction-level intelligence pattern that exists only within a live RIO-governed loop. |
| [Bondi Failure Conditions v1.0](docs/bondi/Bondi_Failure_Conditions_v1_0.md) | The eight conditions under which Bondi is not present — compliance is binary. |

---

## Where to go next

- [System Runtime Map](SYSTEM_RUNTIME_MAP.md) — what is running, what is planned, how to verify
- [Run the demo](demo/)
- [Read the spec](spec/)
- [Read the governance specifications](docs/governance/)
- [Use it with your own systems](docs/)
