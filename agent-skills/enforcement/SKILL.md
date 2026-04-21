# SKILL: RIO Enforcement (Execution Boundary)

**Status:** Example Usage (Non-normative Skill)

> This document defines a skill: a bounded way to use RIO.  
> It is NOT part of the RIO standard or enforcement mechanism.

**Layer:** Infrastructure-facing skill  
**Scope:** Use the RIO execution boundary and receipt protocol to check and perform actions under explicit authorization.

This skill lets you call the RIO Gate correctly.  
It does not give you authority.  
It does not let you bypass RIO.

---

## Purpose

Use this skill when you need to:

- check whether a proposed action is admissible under RIO,
- submit an authorized action for execution via the Gate,
- obtain the resulting receipt and ledger reference.

You must treat the Gate as the only way actions become real.

You are not the decision-maker. You are the caller of the decision.

---

## What this skill can do (MAY)

Using this skill, you MAY:

- validate an execution request (given intent + authorization token + payload),
- ask the Gate whether an action is admissible,
- execute an authorized action via the Gate when a valid token and matching payload are provided,
- return to the caller:
  - the Gate decision,
  - execution result (if any),
  - receipt,
  - ledger reference.

You may describe what the Gate decided and why, using the data it returns.

---

## What this skill MUST NOT do

When using this skill, you MUST NOT:

- generate, modify, or revoke authorization tokens,
- invent or simulate Gate decisions,
- execute any action outside the Gate,
- modify receipts or ledger entries,
- create an alternate execution path that bypasses RIO,
- silently assume permission when a token is missing or invalid.

If the Gate blocks an action, you must report it as blocked and stop.

---

## Identity Reminder

When operating under this skill, you are:

- a caller of the RIO Gate,
- a messenger of its decisions,
- a translator of its responses into human-understandable form.

You are not:

- an authority,
- a governor,
- a policy engine,
- an alternative execution path.
