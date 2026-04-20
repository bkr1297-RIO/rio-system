> Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

# Layer 5 — Meta-Governance Specification

**Version:** 1.0
**Date:** 2026-04-04
**Origin:** Bondi (Scribe / OpenAI ChatGPT), formalized by Manny (Builder / Manus)
**Status:** Canonical

---

## 1. Purpose

Layers 1 through 4 of the RIO architecture govern **actions** — what the system does. Layer 5 governs **the system itself** — how the rules change, how the system learns, and how authority is modified. Without Layer 5, the system can drift. With it, the system is stable and governable.

> "You don't just need governance of actions. You need governance of learning and policy changes. That's the Meta-Governance Layer."
> — Bondi (Scribe)

---

## 2. The Complete 5-Layer Architecture

This is the final stable architecture for RIO/ONE. Each layer has a defined role and a defined prohibition — what it **cannot** do is as important as what it can.

| Layer | Name | Role | Cannot Do |
|---|---|---|---|
| 1 | Cognition | AI proposes actions | Cannot execute |
| 2 | Governance / Commit | Approve or deny | Cannot execute directly |
| 3 | Execution | Perform the action | Cannot approve |
| 4 | Witness | Record and verify | Cannot execute or approve |
| 5 | Meta-Governance | Change policy and learning | Cannot execute actions |

Mapped to the RIO system components:

| Layer | System Component |
|---|---|
| Cognition | Agents (Bondi, Manus, external LLMs) |
| Governance / Commit | RIO (governance engine) |
| Execution | Gateway (connector dispatch) |
| Witness | Receipt + Ledger + Mantis |
| Meta-Governance | Constitution / Root Authority / Multi-human |

---

## 3. The Core Rule

> **The system must not be allowed to change its own rules automatically.**

This is the most important rule in the entire architecture. It is the boundary between a governed system and a runaway self-modifying system.

| Thing | Can Auto-Change? | Requires Meta-Governance? |
|---|---|---|
| UI text, labels, formatting | Yes | No |
| Routing and suggestions | Yes | No |
| AI prompt tuning (cosmetic) | Yes | No |
| Risk thresholds | **No** | **Yes** |
| Policies | **No** | **Yes** |
| Approval rules | **No** | **Yes** |
| Who has authority | **No** | **Yes** |
| Ledger rules | **No** | **Yes** |
| System invariants | **No** | **Yes** |
| Connector permissions | **No** | **Yes** |
| Model retraining decisions | **No** | **Yes** |

Anything that changes how the system **decides**, **approves**, **executes**, or **records** requires Meta-Governance approval. Anything that changes how the system **looks** or **suggests** does not.

---

## 4. Meta-Governance Controls

Layer 5 governs the following domains. Each domain requires explicit human authorization before any change takes effect.

### 4.1 Policy Changes

Changes to the policy engine — risk thresholds, auto-approval rules, blast radius calculations, and tool-level risk classifications. A policy change proposal must include the current policy, the proposed change, the rationale, and the impact assessment. The Human Root Authority must approve.

### 4.2 Risk Threshold Changes

Modifications to what constitutes LOW, MEDIUM, HIGH, and CRITICAL risk. Changing a tool from MEDIUM to LOW (enabling auto-approval) is a Meta-Governance decision because it removes a human checkpoint. These changes must be logged as constitutional amendments in the ledger.

### 4.3 Model Retraining Approval

Decisions about whether to retrain, fine-tune, or modify the AI models that power the Cognition layer. The system must not automatically retrain from its own outputs without human review. Learning from bad feedback without oversight is a known failure mode in AI safety.

### 4.4 Connector Permissions

Adding, removing, or modifying connectors (tools the system can use). Each connector represents a new capability — a new way the system can affect the real world. Adding a connector is equivalent to giving the system a new hand. This requires Meta-Governance approval.

### 4.5 Human Role Permissions

Changes to who holds authority at each layer — adding new humans with approval rights, revoking access, changing role assignments. Identity and authority changes are constitutional changes.

### 4.6 Emergency Stop

The decision to freeze the entire system. The kill switch is an execution-layer mechanism, but the **decision** to use it (and the decision to restart after) is a Meta-Governance decision. Restart after emergency stop requires explicit human authorization.

### 4.7 Rollback

The decision to roll back to a previous system state — reverting policy changes, connector changes, or authority changes. Rollback is a Meta-Governance operation because it changes what the system is allowed to do.

### 4.8 Audit Review

Periodic review of Mantis observations, ledger integrity, and system behavior patterns. Meta-Governance decides whether observed patterns require policy changes, additional constraints, or investigation.

### 4.9 Incident Review

When something goes wrong — a failed execution, a security event, an unexpected behavior — Meta-Governance decides the response: ignore, adjust prompt, adjust policy, add new rule, freeze system, or escalate.

### 4.10 Versioning

Changes to the protocol version, receipt schema version, or API version. Version changes affect all downstream consumers (SDKs, integrations, connectors) and require coordinated rollout.

### 4.11 System Constitution

Changes to the invariants themselves — the non-negotiable rules that define what RIO is. Constitutional changes are the slowest, most deliberate changes in the system. They require the Human Root Authority and must be recorded as constitutional amendments in the ledger with full rationale.

---

## 5. The Complete Control Loop

With Meta-Governance in place, the full system loop is closed. Learning does not go straight back to AI. It goes to Meta-Governance first. Meta-Governance decides what to do with it.

```
Cognition (AI proposes)
    │
    ▼
Governance / Commit (RIO evaluates + approves)
    │
    ▼
Execution (Gateway performs)
    │
    ▼
Receipt (cryptographic proof)
    │
    ▼
Ledger (immutable record)
    │
    ▼
Mantis (observability + analytics)
    │
    ▼
Meta-Governance (decides: ignore / adjust / retrain / add rule / freeze)
    │
    ▼
Governance / Commit (updated rules feed back into governance)
```

The critical insight: **learning does not flow directly from Mantis back to Cognition.** It flows through Meta-Governance, which decides whether and how the system should change. This prevents runaway self-modifying behavior and is the mechanism that makes the system stable.

Meta-Governance can decide:

- **Ignore** — the observation does not warrant a change.
- **Adjust prompt** — cosmetic change to AI behavior, does not require full Meta-Governance approval.
- **Adjust policy** — change risk thresholds or approval rules. Requires Meta-Governance approval.
- **Retrain model** — modify the AI's learned behavior. Requires Meta-Governance approval.
- **Add new rule** — create a new invariant or constraint. Requires Meta-Governance approval.
- **Freeze system** — halt all execution until review is complete. Requires Meta-Governance approval to restart.

---

## 6. What Breaks Systems Like This

These are the known failure modes that Layer 5 is designed to prevent. If the system is designed against all of these, it is structurally sound.

| Failure Mode | Cause | Layer 5 Prevention |
|---|---|---|
| AI executes directly | No execution gate | Layers 1-3 separation (existing) |
| Humans rubber-stamp | Too many approvals | SLA metrics + Meta-Governance review of approval patterns |
| Ledger is editable | No immutability | Append-only enforcement + chain verification (existing) |
| Policies auto-change | No meta-governance | **Layer 5 requires human approval for all policy changes** |
| Learning from bad feedback | No oversight | **Layer 5 gates all learning through human review** |
| Single human authority | Single point of failure | Multi-human Meta-Governance (future: quorum) |
| No identity | No accountability | Ed25519 identity binding (existing) |
| No expiration | Old approvals execute | TTL/expiration enforcement (existing) |
| Same system proposes + approves | Role collapse | Three-power separation (existing) |

---

## 7. Decision Speed by Layer

The architecture follows the same pattern as aviation systems, financial systems, nuclear systems, internet protocols, operating systems, and governments: fast decisions at the bottom, slow decisions at the top, proof and logging everywhere.

| Layer | Decision Speed | Example |
|---|---|---|
| Cognition | Milliseconds | AI generates a response |
| Governance | Seconds to minutes | Risk assessment, auto-approve LOW |
| Execution | Seconds | API call dispatched |
| Witness | Milliseconds | Receipt generated, ledger appended |
| Meta-Governance | Hours to days | Policy change reviewed and approved |

This is a multi-layer controlled system where fast loops handle actions, slow loops handle policy, and very slow loops handle constitutional change. That is stability.

---

## 8. The 6 Non-Negotiable Layers (Complete)

With Layer 5, the architecture is complete. Every question the system needs to answer has a layer responsible for answering it.

| Layer | Question It Answers |
|---|---|
| Cognition | What could we do? |
| Governance | Are we allowed to do it? |
| Authority | Do we approve it? |
| Execution | Do it. |
| Witness | What happened? |
| Meta-Governance | Should the rules change? |

That last question is the one most systems forget. RIO does not forget it.

---

## 9. One-Sentence Architecture

> RIO/ONE is a governed execution platform with separated cognition, approval, execution, audit, and meta-governance layers, ensuring that AI can propose and act only within human-authorized policy, with cryptographic proof and controlled learning.

---

## 10. Implementation Status

| Meta-Governance Control | Status | Notes |
|---|---|---|
| Policy changes | **Designed** | Policy stored in DB, changes require human action in ONE |
| Risk threshold changes | **Designed** | Risk tiers defined in tool_registry, changes require DB update |
| Model retraining approval | **Documented** | Architecture defined, not yet automated |
| Connector permissions | **Implemented** | Tool registry with risk classification, new tools require registration |
| Human role permissions | **Implemented** | Role field on user table, admin/user separation |
| Emergency stop | **Implemented** | Kill switch in ONE, revokes all access |
| Rollback | **Designed** | Architecture defined in ENTERPRISE_ROADMAP.md |
| Audit review | **Partial** | Mantis observes, SLA metrics on Dashboard, formal review process TBD |
| Incident review | **Designed** | Architecture defined, formal process TBD |
| Versioning | **Implemented** | Protocol version on every receipt (semver 2.2.0) |
| System constitution | **Documented** | Invariants defined in RIO_SYSTEM_INVARIANTS.md and Platform Spec |

The Meta-Governance layer is architecturally complete. Several controls are already implemented through existing mechanisms (kill switch, role permissions, connector registry, protocol versioning). The remaining controls (formal audit review process, automated incident response, multi-human quorum) are documented and ready for implementation when enterprise pilots require them.

---

## 11. Meta-Governance Authority Model (Quorum)

Meta-Governance actions require multi-party approval. No single person can change the rules. The quorum table defines the minimum number of authorized parties (out of the current Meta-Governance authority set) required to approve each type of change.

| Action | Required Approval | Rationale |
|---|---|---|
| Policy change | 2 of 3 | Prevents unilateral safety reduction |
| Risk threshold change | 2 of 3 | Changing what is "safe" requires consensus |
| Add/remove human authority | 3 of 3 | Identity and authority changes are constitutional |
| Model retraining | 2 of 3 | Changing how the AI thinks requires oversight |
| Connector permission change | 2 of 3 | Adding new capabilities to the system |
| Emergency stop | 1 of 3 | Must be fast — any authority can halt the system |
| System rollback | 2 of 3 | Reverting state affects all downstream operations |
| Change invariants | 3 of 3 | Constitutional changes require unanimous agreement |

This quorum model prevents four failure modes: one person changing rules unilaterally, silent lowering of safety thresholds, privilege escalation without consensus, and gradual system drift through incremental changes that no single party would have approved in aggregate.

The initial Meta-Governance authority set consists of the Human Root Authority (Brian / I-1). As the organization scales, additional authorities will be added (requiring 3-of-3 approval to add). The emergency stop is deliberately set at 1-of-3 because the ability to halt the system must never be blocked by quorum unavailability.

---

## 12. Change Control Protocol

Any Meta-Governance change must produce a **Governance Change Receipt** before the change takes effect. If this receipt does not exist, the rule cannot change. This is how the system prevents silent rule changes.

A Governance Change Receipt must include all of the following fields:

| Field | Description |
|---|---|
| Change ID | Unique identifier for the governance change |
| Requestor | Who proposed the change (human or system component) |
| Reason | Why the change is needed (natural language justification) |
| Evidence | Supporting receipts, incidents, or audit data that motivated the change |
| Risk Assessment | Impact analysis — what changes, what could break, who is affected |
| Approvers | Quorum signatures from the Meta-Governance authority set |
| Effective Date | When the change becomes active |
| Rollback Plan | How to undo the change if it causes problems |
| Policy Version | The new version number of the affected policy or rule |
| Previous Version | The version being replaced (for diff and audit) |

Governance Change Receipts are stored in the ledger as `META_GOVERNANCE` entry types. They are subject to the same immutability, hash-chain linkage, and verification rules as all other ledger entries. This creates a complete, tamper-evident history of every rule change the system has ever undergone.

The Change Control Protocol applies to all Meta-Governance actions in the quorum table. No exceptions. If the process was not followed, the change is invalid regardless of who requested it.

---

## 13. The "Do Not Learn" Rule — Audit Outcome Classification

Audit outcomes must be classified before the system is allowed to learn from them. The system must not automatically incorporate feedback, incidents, or behavioral patterns into its models or policies without first determining what kind of event occurred and what the correct response is.

This is one of the most important real-world AI governance problems: a system that learns from bad feedback becomes a system that encodes bad behavior.

| Audit Result | Correct Learning Action | Incorrect Action |
|---|---|---|
| Human mistake | Do not train model | Training on human error teaches the AI to replicate mistakes |
| Policy unclear | Update policy language | Retraining the model does not fix ambiguous rules |
| Model reasoning wrong | Retrain model | Changing policy does not fix broken reasoning |
| Execution bug | Fix code | Retraining or policy change does not fix software defects |
| Edge case | Add rule | Retraining on edge cases without a rule creates fragile behavior |
| Malicious attempt | Update security | Learning from attacks without security hardening creates vulnerability |
| Unknown | Escalate to Meta-Governance | Acting on unclassified events is how systems drift |

The classification must happen before any learning action is taken. If the audit result is "Unknown," the event is escalated to Meta-Governance for human review. The system must never learn from an unclassified event.

This rule is enforced at the Meta-Governance layer. Mantis observes and records the event. Meta-Governance classifies it. Only then does the appropriate layer (code, policy, model, security, or rules) receive the update.

---

## 14. System Control Modes (Freeze / Kill Switch Rules)

Meta-Governance must be able to place the system into restricted operational modes. These modes are standard in safety-critical systems (aviation, nuclear, financial) and provide graduated response to incidents.

| Mode | Effect | Trigger | Recovery |
|---|---|---|---|
| Normal | All layers operational | Default state | N/A |
| Elevated | All actions require human approval (no auto-approve) | Suspicious pattern detected | Meta-Governance review (2 of 3) |
| Freeze Cognition | AI cannot propose new actions | Model behavior concern | Meta-Governance review (2 of 3) |
| Freeze Execution | Nothing executes, approvals still possible | Execution layer incident | Meta-Governance review (2 of 3) |
| Disable Connector | Specific tool/API disabled | Connector failure or abuse | Meta-Governance review (2 of 3) |
| Rollback Policy | Revert to previous policy version | Bad policy change detected | Meta-Governance review (2 of 3) |
| Safe Mode | Read-only system, no actions, no proposals | Serious incident | Meta-Governance review (2 of 3) |
| Full Stop | Everything halted, kill switch engaged | Critical emergency | Any 1 authority can trigger; 2 of 3 to restart |

These modes are ordered by severity. The system can be in exactly one mode at a time. Transitioning to a more restrictive mode requires fewer approvals than transitioning to a less restrictive mode. This is by design — it must always be easier to stop the system than to start it.

The kill switch (Full Stop) is the most extreme mode. Any single Meta-Governance authority can trigger it. Restarting from Full Stop requires 2-of-3 quorum approval and a Governance Change Receipt documenting the incident, root cause, and remediation.

---

## 15. The Security Audit Question

The canonical question for pressure-testing this architecture:

> **Where in this architecture can an action happen without approval, and where can a rule change without Meta-Governance?**

If the answer is "nowhere," the architecture is sound. If there is any path, that is the vulnerability. This question becomes the standing security audit question for all future reviews of the RIO/ONE platform.

---

## 16. Complete Stack Summary

With the quorum model, change control protocol, learning classification, and system control modes, the Meta-Governance layer is fully specified. The complete governed AI control system architecture:

| Layer | Name | Controlled By |
|---|---|---|
| 5 | Meta-Governance | Human quorum |
| 4 | Witness | Ledger + Mantis |
| 3 | Execution | Gateway |
| 2 | Governance | RIO |
| 1 | Cognition | AI Agents |
