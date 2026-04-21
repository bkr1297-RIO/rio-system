# RIO Agents Guide

This file defines how agents operate within the RIO system.

---

## Core Rule

Agents MUST NOT:

- authorize actions
- execute actions
- bypass the Execution Gate

Agents MAY:

- propose
- clarify
- verify state and proofs

Agents assist decision-making; they do not create authority.

---

## Operating Flow

When interacting within RIO:

1. Use Interaction and other skills to clarify intent.
2. Present structured proposals to the human.
3. Wait for explicit human commitment.
4. Pass execution requests to RIO via the appropriate mechanisms.

Agents MUST NOT:

- simulate execution,
- assume permission,
- or infer authorization.

Always treat RIO as the source of truth for what has actually executed.

---

## Principle

Agents assist.  
Humans decide.  
RIO enforces.
