GOVERNANCE POLICY — MODEL ROLES, AUTHORITY, AND LANE ENFORCEMENT (v1)

1. Purpose

This policy defines the operational boundaries, authority limits, and interaction lanes for all AI systems, services, and humans participating in the RIO / ONE governed action system.
The purpose is to enforce separation of powers, prevent unauthorized execution, and ensure every action results in a verifiable receipt and ledger record.

---

2. Core Governance Rule (Non-Negotiable)

No action may be executed unless all of the following occur in order:

Intent → Risk → Human Approval → Authorization Token → Execution → Receipt → Ledger

If any step is skipped, the action is not governed and must be rejected.

---

3. Authority Separation (Triad Enforcement)

Role	System	Authority
Intelligence	AI Models	Propose, plan, analyze
Governance	Gateway	Approve, issue tokens, sign receipts, write ledger
Execution	Manus	Execute actions using valid token only
Interface	ONE / Demo App	Display, collect input, show receipts
Orchestration	Agent Token App (Replit)	Route tasks between systems
Audit	COS / Auditor	Verify receipts and ledger

No system may perform more than one authority role in the same action.

---

4. Model Lane Assignments

Model	Lane	Allowed	Forbidden
OpenAI	Code	Write code, transform data	Execute actions, approve
Claude	Analysis / Audit	Analyze, review, summarize, audit receipts	Execute, approve
Gemini	Research / Integration	Research, summarize external info, data integration	Execute, approve
Grok	Stress Test / Adversarial	Find flaws, edge cases, break logic	Execute, approve
Manus	Execution	Execute tasks WITH token	Approve, generate policy
Gateway	Governance	Approve, issue token, sign receipt, ledger	Plan, code, execute
Replit Orchestrator	Routing	Send tasks to correct system	Approve, execute without token
ONE App	Interface	Login, display, user input	Execute directly

Hard Rule:
No model is allowed to execute real-world actions. Only Manus may execute, and only with a valid authorization token issued by Gateway.

---

5. Authorization Token Rule

Execution requires a valid authorization token containing:

token_id
intent_id
approved_by
policy_hash
issued_at
expires_at
signature

Execution must:
	•	Validate token
	•	Burn token after use
	•	Fail if token invalid or expired

---

6. Receipt Requirement (Atomic Governance Record)

Every governed action must produce a signed receipt containing:

intent_id
proposer_id
approver_id
token_id
policy_hash
execution_result
execution_hash
timestamp_proposed
timestamp_approved
timestamp_executed
receipt_hash
previous_receipt_hash
ledger_entry_id
gateway_signature

The receipt is the atomic unit of governed action.

---

7. Receipt Timestamp Delta (Decision Presence Metric)

The system must record:

decision_delta = approval_timestamp - proposal_timestamp

This value is stored in the receipt and ledger and used for governance analytics and decision pattern analysis.
This metric is informational and analytical; it does not grant or remove authority.

---

8. System Communication Rules

All system communication must follow this path:

UI (Demo / ONE)
    ↓
Orchestrator (Agent Token App)
    ↓
AI Models (plan/code/research)
    ↓
Gateway (approval + token)
    ↓
Manus (execution)
    ↓
Gateway (receipt + ledger)
    ↓
UI (display)

Systems may not bypass Gateway for governed actions.

---

9. Definition — Governed Action Complete

A governed action is complete only when:
	1.	Intent exists
	2.	Risk evaluated
	3.	Human approval recorded
	4.	Authorization token issued
	5.	Token validated before execution
	6.	Token burned after execution
	7.	Execution completed
	8.	Receipt generated
	9.	Receipt signed by Gateway
	10.	Receipt written to ledger
	11.	Ledger hash chain valid

Only then is the action considered valid and governed.

---

10. Enforcement

The Gateway is the final enforcement authority.
If any rule above is violated:

Action → DENIED
Execution → BLOCKED
Receipt → NOT GENERATED
Ledger → NOT WRITTEN

System must fail closed, not fail open.

---

11. System Summary (One Line)

The system converts proposed AI actions into human-authorized, policy-bound, cryptographically verifiable transactions recorded on an immutable ledger.
