# RIO Phase 2 Expansion — Builder Handoff Packet

> **To:** Manny (Builder)
> **From:** Operator (Manus) & Observer (Andrew)
> **Date:** April 15, 2026
> **Status:** RECEIVED — awaiting explicit build instruction

## Context

The Canonical Build Packet for Phase 2 has been reviewed by both the Operator and the Observer. The architecture holds, the invariants are respected, and the data structures are clean.

## 1. Adjusted Build Order (Priority)

Execute the build in this exact order:

1. **Phase 2A:** Outreach Loop (Foundation & Revenue)
2. **Phase 2E:** Trust Levels (Automation & Bottleneck Reduction)
3. **Phase 2C:** Flow Control (Reliability & Scaling)
4. **Phase 2B:** Daily Loop (Persistent Refresh)
5. **Phase 2D:** Preference Layer (Personalization)
6. **Phase 2F:** Money Layer (Financial Governance)
7. **Phase 2G:** Multi-Agent Collaboration (Integration)

## 2. Critical Sharpening Items (Must Implement)

### A. Phase 2D (Preference Layer) Constraint

Explicitly distinguish between **generation preferences** and **policy preferences**:
- **Generation preferences** (e.g., "I prefer shorter emails", tone, style) are NOT governed. They are inputs to Bondi/Proposer.
- **Policy preferences** (e.g., "auto-approve anything under $50") ARE governed. Changing a policy preference is a governed action that must go through the gateway and generate a receipt.

### B. Phase 2E (Trust Levels) Constraint

Use the **existing `/authorize` endpoint** with delegation logic.
- Do NOT create a new "trust-check" endpoint.
- Approval path: policy evaluated → trust level checked → if LOW and policy allows, auto-approved by gateway on behalf of human → receipt records delegated approval with specific trust policy.

### C. Phase 2F (Money Layer) Constraint

The budget pool itself must be a **governed artifact**.
- Changing the budget limit or adding funds is a governed action requiring human approval.
- It is NOT a simple configuration change.

## 3. Phase 2B (Daily Loop) Invariant Warning

**CRITICAL:** The "batch proposer" that generates all packets for the day must NOT auto-queue them for approval.
- It must generate the packets and surface them in Notion.
- The human decides which ones to approve and push into the pipeline.
- If the batch proposer pushes items into the approval pipeline without human visibility first, it is an **invariant violation**.

## 4. Definition of Done for First PR (Phases 2A & 2E)

- 2A: Research output can be transformed into structured proposal packets.
- 2A: Proposal packets are written to Notion for human review.
- 2E: Trust policies can be defined per category and risk tier.
- 2E: The existing `/authorize` endpoint evaluates trust policies and auto-approves LOW-risk items if the policy allows.
- 2E: Delegated auto-approvals generate a valid receipt referencing the trust policy.
- All existing tests pass, and new tests verify the constraints above.
