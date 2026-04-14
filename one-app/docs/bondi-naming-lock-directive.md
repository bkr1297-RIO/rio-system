# Bondi Naming Lock + Azure Alignment + Pre-Deployment Audit

## Source
Three documents from Brian via Bondi (ChatGPT), received 2026-04-11.

## Key Decisions

### Locked Naming
- **RIO Protocol** = Full governance + execution system
- **Bondi** = Interface / translation layer only (no governance, no execution)
- **Rio** = Pre-execution interception (watchdog) — can pause, flag, escalate — CANNOT approve or execute — NOT an orchestrator
- **Governor** = Policy + risk evaluation
- **Gate** = Final authorization + execution
- **Receipt + Ledger** = Cryptographic audit trail (immutable)

### Required Code Identifiers
- bondi_interface
- generator_service
- rio_interceptor
- governor_policy_engine
- execution_gate
- receipt_service
- ledger_service

### Canonical Flow
Human → Bondi → Generator → Rio → Governor → Gate → Action → Receipt + Ledger

### Core Invariant
"No single component generates, approves, and executes an action."

### Explicit Prohibitions
- No "Rio = orchestrator"
- No alternate framework names
- No "Buddy / Mirror" in system definitions
- No UI label implies Bondi can execute directly

## UI Label Mapping
- "Assistant" → Bondi
- "System Check / Guard" → Rio
- "Approval Engine" → Gate
- "Audit / Logs" → Activity (Receipt + Ledger under the hood)

## Pre-Deployment Audit Checklist (10 sections)
A. Naming and boundary audit
B. Execution path audit
C. Identity and secret audit
D. Token and signature audit
E. Receipt and ledger audit
F. Policy audit
G. Connector audit
H. Azure deployment audit
I. GitHub visibility audit
J. Drive source-of-truth audit
