# RIO Governance Framework

This document formalizes three foundational principles of the RIO system.
These are not aspirational — they describe what the system already enforces at runtime.

---

## 1. The Sandbox Invariant

**Everything is safe until it crosses the boundary between idea and real-world consequence.**

| Activity | Status |
|---|---|
| Thinking | Safe |
| Drafting | Safe |
| Planning | Safe |
| Mapping | Safe |
| Generating | Safe |
| Sending | **Not safe without authorization** |
| Executing | **Not safe without authorization** |
| Writing to live systems | **Not safe without authorization** |
| Touching real money, real relationships, real communications | **Not safe without authorization** |

Inside the sandbox, everything can move fast, be generative, be exploratory.
The gate only has to be hard at one place — the moment something tries to leave
the sandbox and touch the real world.

RIO does not govern ideas. It governs consequences.

---

## 2. The Two-Gate Architecture

Every action that leaves the sandbox must pass through two independent gates:

### Content Gate

Validates **what** is being proposed. Checks policy compliance, risk assessment,
and alignment with declared intent. This gate answers: *"Is this action
permissible under current policy?"*

- Policy rules are evaluated before any execution
- Content that violates compliance rules is blocked at this gate
- No human intervention required for clear violations (fail-closed)

### Execution Gate

Validates **whether** the action should proceed into the real world. This gate
requires explicit human authorization. It answers: *"Does the sovereign
authority approve this specific action at this specific time?"*

- Every real-world action requires human approval
- Approval is recorded as a cryptographic receipt
- No model can bypass this gate — the architecture enforces it structurally

The Content Gate can reject autonomously. The Execution Gate cannot approve
autonomously. This asymmetry is by design: the system can protect you without
your involvement, but it cannot act for you without your permission.

---

## 3. Role Assignments

The RIO system operates through separated roles. No single entity holds
end-to-end capability. The only entity that can close the full loop — from
idea to real-world consequence — is the human sovereign.

| Role | Entity | Capability | Boundary |
|---|---|---|---|
| **Sovereign Authority** | Brian (Human) | Authorization, final approval, bridge between all roles | Only entity that can close the full loop |
| **Architect** | Claude | System design, structural reasoning, convergence analysis | Cannot push code, cannot access Drive |
| **Strategist** | Bondi (OpenAI) | Strategic proposals, policy reasoning, language gate | Cannot access GitHub or Drive programmatically |
| **Librarian** | Gemini | Context organization, knowledge filing, Drive management | Cannot push to GitHub |
| **Builder** | Manny (Manus) | Code execution, GitHub commits, Drive writes, deployment | Acts only on human instruction |

### Why This Separation Matters

No model talks to another directly. Every handoff goes through the human bridge
or the shared corpus. This is not a limitation of the models — it is the
governance architecture enforcing itself naturally.

The system is fail-closed by default: not because someone coded a restriction,
but because the models literally cannot bypass the human bridge. Each model
has capability within its domain but none has the authority to act in the
real world without the sovereign's authorization.

This separation means the system can be copied and formalized as a replicable
governance pattern — because the constraints are structural, not behavioral.

---

*Governance is the floor, not the ceiling.*

*Filed by Manny (Manus/Builder) on instruction from Brian (Sovereign Authority).*
*Source: Librarian's Directive S1-GENESIS, Convergence Analysis, Runtime Architecture.*
