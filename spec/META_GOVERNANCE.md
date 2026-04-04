# Meta-Governance Specification — Layer 5 Operational Manual

**Version:** 1.0
**Date:** 2026-04-04
**Authority Level:** High — operational manual for Layer 5
**Origin:** Bondi (Scribe / OpenAI ChatGPT), formalized by Manny (Builder / Manus)
**Status:** Canonical
**Supersedes:** `META_GOVERNANCE_SPEC.md`, `RIO_META_GOVERNANCE.md` (both moved to `spec/archive/`)

---

## 1. Purpose

This document is the operational manual for Layer 5 (Meta-Governance). It defines how the system's own rules change — the quorum requirements, the change control process, the governance change receipt format, the learning classification rules, and the system control modes. The constitutional principles that Layer 5 enforces are defined in `CONSTITUTION.md`. This document defines how those principles are operationalized.

> Meta-Governance controls how the system itself changes. It governs policy updates, learning, authority, and system invariants. It does not execute actions and does not approve individual tasks; it governs the rules under which approvals and executions occur.

---

## 2. Core Invariant

> **The system must not be allowed to change its own rules automatically.**

This invariant is defined in the Constitution (Section 6) and enforced by this specification. Learning flows through Meta-Governance before returning to Cognition. The complete control loop is:

```
Cognition → Governance → Execution → Receipt → Ledger → Mantis → Meta-Governance → Governance
```

---

## 3. Meta-Governance Controls

Layer 5 governs the following domains. Each domain requires explicit human authorization before any change takes effect.

| Domain | Description |
|---|---|
| Policy changes | Risk thresholds, auto-approval rules, blast radius calculations, tool-level risk classifications |
| Risk threshold changes | What constitutes LOW, MEDIUM, HIGH, and CRITICAL risk |
| Model retraining approval | Whether to retrain, fine-tune, or modify AI models in the Cognition layer |
| Connector permissions | Adding, removing, or modifying connectors (tools the system can use) |
| Human role permissions | Adding new humans with approval rights, revoking access, changing role assignments |
| Emergency stop | Freezing the entire system; restarting after emergency stop |
| Rollback | Reverting policy changes, connector changes, or authority changes |
| Audit review | Periodic review of Mantis observations, ledger integrity, and system behavior patterns |
| Incident review | Response to failed executions, security events, or unexpected behaviors |
| Versioning | Changes to protocol version, receipt schema version, or API version |
| System constitution | Changes to invariants — the non-negotiable rules that define what RIO is |

---

## 4. Quorum Model

Meta-Governance actions require multi-party approval according to the following table. The quorum prevents four failure modes: unilateral rule changes, silent safety reduction, privilege escalation, and gradual system drift.

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

The initial Meta-Governance authority set consists of the Human Root Authority (Brian / I-1). As the organization scales, additional authorities will be added (requiring 3-of-3 approval to add). The emergency stop is deliberately set at 1-of-3 because the ability to halt the system must never be blocked by quorum unavailability.

---

## 5. Change Control Protocol

Any Meta-Governance change must produce a **Governance Change Receipt** before the change takes effect. If this receipt does not exist, the rule cannot change. This is how the system prevents silent rule changes.

### 5.1 Governance Change Receipt Format

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

### 5.2 Storage and Verification

Governance Change Receipts are stored in the ledger as `META_GOVERNANCE` entry types. They are subject to the same immutability, hash-chain linkage, and verification rules as all other ledger entries. This creates a complete, tamper-evident history of every rule change the system has ever undergone.

The Change Control Protocol applies to all Meta-Governance actions in the quorum table. No exceptions. If the process was not followed, the change is invalid regardless of who requested it.

---

## 6. Audit Outcome Classification — The "Do Not Learn" Rule

Audit outcomes must be classified before the system is allowed to learn from them. The system must not automatically incorporate feedback, incidents, or behavioral patterns into its models or policies without first determining what kind of event occurred and what the correct response is.

A system that learns from bad feedback becomes a system that encodes bad behavior.

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

## 7. System Control Modes

Meta-Governance must be able to place the system into restricted operational modes. These modes provide graduated response to incidents and are standard in safety-critical systems.

| Mode | Effect | Trigger | Recovery |
|---|---|---|---|
| Normal | All layers operational | Default state | N/A |
| Elevated | All actions require human approval (no auto-approve) | Suspicious pattern detected | Meta-Governance review (2 of 3) |
| Freeze Cognition | AI cannot propose new actions | Model behavior concern | Meta-Governance review (2 of 3) |
| Freeze Execution | Nothing executes, approvals still possible | Execution layer incident | Meta-Governance review (2 of 3) |
| Disable Connector | Specific tool/API disabled | Connector failure or abuse | Meta-Governance review (2 of 3) |
| Rollback Policy | Revert to previous policy version | Bad policy change detected | Meta-Governance review (2 of 3) |
| Safe Mode | Read-only system, no actions, no proposals | Serious incident | Meta-Governance review (2 of 3) |
| Full Stop | Everything halted, kill switch engaged | Critical emergency | Any 1 authority triggers; 2 of 3 to restart |

These modes are ordered by severity. The system can be in exactly one mode at a time. Transitioning to a more restrictive mode requires fewer approvals than transitioning to a less restrictive mode. It must always be easier to stop the system than to start it.

The kill switch (Full Stop) is the most extreme mode. Any single Meta-Governance authority can trigger it. Restarting from Full Stop requires 2-of-3 quorum approval and a Governance Change Receipt documenting the incident, root cause, and remediation.

---

## 8. Meta-Governance Decision Options

When Mantis observes a pattern, incident, or anomaly and escalates it to Meta-Governance, the following decision options are available:

| Decision | Description |
|---|---|
| Ignore | The observation does not warrant a change |
| Adjust prompt | Cosmetic change to AI behavior, does not require full Meta-Governance approval |
| Adjust policy | Change risk thresholds or approval rules — requires Meta-Governance approval |
| Retrain model | Modify the AI's learned behavior — requires Meta-Governance approval |
| Add new rule | Create a new invariant or constraint — requires Meta-Governance approval |
| Freeze system | Halt all execution until review is complete — requires Meta-Governance approval to restart |

---

## 9. Restrictions

Meta-Governance cannot:

- Execute actions
- Modify receipts or ledger history
- Bypass Governance or Execution layers
- Change invariants without full quorum (3 of 3)
- Learn from unclassified audit outcomes
- Restart from Full Stop without quorum approval and a Governance Change Receipt

---

## 10. Implementation Status

| Control | Status | Notes |
|---|---|---|
| Policy changes | **Designed** | Policy stored in DB, changes require human action in ONE |
| Risk threshold changes | **Designed** | Risk tiers in tool_registry, changes require DB update |
| Model retraining approval | **Documented** | Architecture defined, not yet automated |
| Connector permissions | **Implemented** | Tool registry with risk classification |
| Human role permissions | **Implemented** | Role field on user table, admin/user separation |
| Emergency stop | **Implemented** | Kill switch in ONE, revokes all access |
| Rollback | **Designed** | Architecture defined in ENTERPRISE_ROADMAP.md |
| Audit review | **Partial** | Mantis observes, SLA metrics on Dashboard |
| Incident review | **Designed** | Architecture defined, formal process TBD |
| Versioning | **Implemented** | Protocol version on every receipt (semver 2.2.0) |
| System constitution | **Documented** | Invariants in CONSTITUTION.md |
| Quorum model | **Documented** | Architecture defined, multi-human TBD |
| Change control protocol | **Documented** | Governance Change Receipt format defined |
| Learning classification | **Documented** | "Do Not Learn" rule defined |
| System control modes | **Partial** | Kill switch implemented, graduated modes TBD |
