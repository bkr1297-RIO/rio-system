# System Layers Map

This document explains how the RIO ecosystem is organized.

It distinguishes between:

- Standards (what is specified)
- Infrastructure (what is implemented)
- Skills (how the system is used)
- Systems (applications built on top of RIO)

---

## Layer 0 – Standards

**Status:** Normative

Defines how governance and proof must work.

Examples:

- RIO specification
- Receipt protocol specification
- Any formal schemas or RFC-style documents that define behavior, not code

---

## Layer 1 – Infrastructure

**Status:** Reference Implementation

Implements the execution boundary, receipts, and ledger in code that conforms to the standards.

Examples:

- Execution Gate implementation
- Receipt and ledger implementation
- Core libraries and services providing the governed execution boundary

---

## Layer 2 – Skills

**Status:** Example Usage (Non-normative)

Defines how humans and agents use RIO safely.

Skills describe bounded capabilities such as:

- clarifying intent
- checking admissibility via the Gate
- querying receipts and ledger
- building and operating within constraints

**Key points:**

- Skills guide behavior; they do not grant authority.
- Skills must not bypass or replace the Execution Gate.
- Skills are not required for RIO conformance.
- Each skill document should clearly state it is a non-normative usage document.
- Some deployments may also use patterns like multi-agent review for high-stakes decisions (e.g., multiple skills/agents review a proposal, the human observes convergence, then commits). These patterns improve decision quality but remain non-normative and are not required for RIO conformance.

---

## Layer 3 – Systems

**Status:** Built on RIO

Applications that use:

- the standards (Layer 0),
- the infrastructure (Layer 1),
- and skills (Layer 2)

to deliver capabilities in the world.

Examples (conceptual):

- ONE
- MANTIS
- fiduciary systems and agents built on RIO

---

## One line

Standards define how governance and proof must work.  
Infrastructure enforces those rules.  
Skills guide how the system is used.  
Systems express purpose within those boundaries.
