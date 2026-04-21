# RIO — System Runtime Map
## Purpose
This document defines:
- what components are actively running
- how the system is structured at runtime
- how specification artifacts map to implementation
- how to verify the system end-to-end
This is the authoritative guide for understanding **what is real vs. what is specified vs. what is planned**.
---
## 1. System Definition
RIO is a **governed execution system** that enforces:
> No digital action occurs without explicit authorization, and all actions produce verifiable cryptographic proof.
The runtime structure is a single pipeline:
Signal → Proposal → Policy → Authorization → Execution Gate → Execute → Receipt → Ledger
---
## 2. Runtime Architecture (What is Running)
### Core Runtime System
| Component | Status | Location |
|----------|--------|----------|
| Gateway | Running | `gateway/server.mjs` |
| Execution Gate | Running | Gateway execution handler |
| Authorization Binding | Running | Token issuance + validation |
| Receipt System | Running | Receipt generation logic |
| Ledger (Hash Chain) | Running | PostgreSQL + receipt linkage |
| Connectors (Gmail, Twilio) | Running | Gateway adapter layer |
### Supporting Runtime Systems
| Component | Status | Location |
|----------|--------|----------|
| PostgreSQL Database | Running | External (Render) |
| Render Deployment | Running | Production gateway instance |
---
## 3. Specification vs Runtime Mapping
The following protocols and specifications define behavior that is **implemented in the gateway**:
### Execution Gate Protocol
- Spec Location: `protocols/rio-cs-04-execution-boundary.md`
- Runtime Implementation: Gateway execution handler
- Function:
  - Validates authorization token
  - Enforces single-use execution
  - Rejects invalid or replayed requests
---
### Authorization Binding Protocol
- Spec Location: `protocols/rio-cs-03-authorization.md`
- Runtime Implementation: Token generation + validation
- Function:
  - Binds approval to intent + parameters
  - Enforces expiry and scope
  - Prevents execution drift
---
### Receipt & Ledger Protocol
- Spec Location: `protocols/rio-cs-05-receipt-ledger.md`
- Runtime Implementation: Receipt generation + ledger write
- Function:
  - Produces cryptographic receipt
  - Links to previous receipt
  - Creates append-only hash chain
---
### Policy & Risk Layer
- Spec Location: `spec/RIO-STANDARD-v1.0.md`
- Runtime Implementation: Gateway risk classification logic
- Function:
  - Classifies intent risk
  - Determines approval requirement
  - Does NOT execute actions
---
## 4. System Invariants (Enforced)
At runtime, the system guarantees:
1. No execution without valid authorization
2. No authorization without binding to intent
3. No replay of executed actions
4. No execution without receipt
5. No receipt without ledger entry
6. All actions produce verifiable lineage
---
## 5. What Is NOT Running (Important)
The following components exist in specs but are NOT part of the current runtime system:
| Component | Status |
|----------|--------|
| Mantis (pattern detection) | Not implemented |
| Bondi (AI orchestration layer) | Not part of runtime |
| ONE (PWA interface) | Not deployed |
| Meta-Governance quorum system | Not implemented |
| Learning Loop | Not implemented |
These are **design or future components**, not active runtime features.
---
## 6. Legacy Directory
`legacy/` contains prior implementations of:
- Python server
- React app
- earlier architecture iterations
Status:
- Not used in current runtime
- Retained for historical reference only
---
## 7. Verification Path (How to Prove the System)
### Step 1 — Start Gateway
Run the gateway locally or via deployed instance.
---
### Step 2 — Execute Demo Scenarios
Reference:
`demo/DEMO_WALKTHROUGH.md`
---
### Step 3 — Validate Outcomes
For each action, verify:
- Execution requires authorization
- Replay is rejected
- Parameters cannot be mutated
- Receipt is generated
- Ledger entry is created
- Hash chain remains intact
---
### Step 4 — Validate Failure Modes
Attempt:
- execution without approval → must fail
- replay of token → must fail
- parameter mismatch → must fail
- missing ledger → execution must halt
---
## 8. Known Gaps (From Audit)
The following gaps were identified during audit. Status as of v2.9.0:
- ~~Demo walkthrough uses outdated endpoints and crypto references~~ — Fixed
- ~~Verifier script references legacy modules~~ — Fixed (HTTP-based verifier)
- No CI/CD pipeline enforcing tests — Open
- ~~Multiple overlapping architecture documents without a reading map~~ — Fixed (SYSTEM_RUNTIME_MAP.md)
- ~~No LICENSE file~~ — Fixed (MIT)
---
## 9. Canonical Reading Order
To understand the system correctly:
1. `README.md`
2. `SYSTEM_RUNTIME_MAP.md` (this file)
3. `gateway/README.md`
4. `protocols/` (execution, authorization, receipt)
5. `spec/RIO-STANDARD-v1.0.md`
6. `demo/DEMO_WALKTHROUGH.md`
---
## 10. Summary
This is a **single governed execution system**, not multiple systems.
- All actions pass through one enforcement boundary (Execution Gate)
- All preconditions prepare valid inputs to that boundary
- All postconditions prove what happened
There is no parallel execution path.
There is no dual authority.
There is one system.
