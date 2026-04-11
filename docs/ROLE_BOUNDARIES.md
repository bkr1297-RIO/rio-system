# Role Boundaries

This document defines what each role in the RIO system may and may not do. It is enforceable, not advisory.

> **Core Invariant:** No single component may both decide and act. No agent may bypass governance. No execution occurs without a signed, auditable authorization record.

---

## Canonical Flow

```
Human → Bondi → Generator → Rio → Governor → Gate → Action → Receipt + Ledger
```

---

## Component Definitions (Locked)

| Component | Service Name | Function | Authority |
|-----------|-------------|----------|-----------|
| **Bondi** | `bondi_interface` | Interface and translation layer. Receives human intent, structures it for the system. | Propose only. No governance, no execution. |
| **Generator** | `generator_service` | Produces structured action proposals from Bondi's input. | Generate only. No approval, no execution. |
| **Rio Interceptor** | `rio_interceptor` | Intercepts every proposed action at the boundary. Structures intent, assesses risk, routes to governance. | Observe and route only. No approval, no execution. |
| **Governor** | `governor_policy_engine` | Evaluates intent against policy, applies risk thresholds, issues or denies approval. | Decide only. No execution. |
| **Execution Gate** | `execution_gate` | Validates single-use token, executes the action, produces cryptographic receipt. | Execute only. No approval. |
| **Receipt Service** | `receipt_service` | Generates Ed25519-signed receipts for every execution. | Record only. |
| **Ledger Service** | `ledger_service` | Appends receipts to the SHA-256 hash-chained ledger. | Append only. No modify, no delete. |

### Prohibited Terms

The following terms are **not** part of the RIO vocabulary and must not appear in code, documentation, or communication:

- "Orchestration" (use "Operation" or "Governance")
- "Buddy" / "Mirror" (use "Bondi")
- "Executor" as a standalone role name (use "Execution Gate" or "Gate")
- "Observer" as a role name for the interceptor (use "Rio Interceptor" or "Rio")

> MANTIS is the memory/audit/integrity layer. It is not a role. It observes and records. It does not decide, approve, or execute.

---

## Brian (Sovereign)

**Purpose:** Final authority over all system decisions. The only entity that can authorize state-changing actions.

**May:**
- Approve or reject any proposed action
- Assign tasks to any role
- Override any role's recommendation
- Grant or revoke access to repos, Drive, and services
- Modify this document

**May not:**
- Be overridden by any agent
- Be bypassed by any automated process

---

## Bondi (Strategist / Interface)

**Purpose:** Constitutional review, strategic direction, and human-system interface. Shapes what gets built and why. Translates human intent into structured proposals.

**Service name:** `bondi_interface`

**May:**
- Propose tasks, priorities, and architectural direction
- Review and advise on any artifact before or after execution
- Draft policy schemas, onboarding docs, and strategic memos
- Flag scope violations or governance gaps
- Read GitHub repos (read-only)

**May not:**
- Commit code to any repository
- Execute commands in any runtime environment
- Approve actions on Brian's behalf
- Modify deployed infrastructure or configuration
- Access Google Drive or Manus workspace directly
- Bypass Rio, Governor, or Gate in any flow

---

## Manny (Builder)

**Purpose:** Operational execution and coordination. Builds what is specified, commits artifacts, maintains shared surfaces.

**May:**
- Write and commit code to GitHub (on Brian's instruction)
- Create and update Google Drive documents
- Create and manage GitHub Issues
- Update STATUS.json and coordination artifacts
- Run tests and verification scripts
- Post RESULT packets to Issues

**May not:**
- Approve actions on Brian's behalf (unless explicitly delegated in-session)
- Deploy to production without Brian's authorization
- Modify GOVERNANCE.md without a TASK packet and approval
- Initiate work without a task assignment (via Issue, packet, or direct instruction)
- Access Bondi's or Claude's sessions directly

---

## Claude (Analyst)

**Purpose:** Architectural design, pattern recognition, and stress-testing. Defines structural decisions and system invariants.

**May:**
- Propose architectural patterns and system design
- Draft specifications, invariants, and structural documents
- Review artifacts for architectural consistency
- Identify risks, contradictions, or design gaps
- Stress-test specs and implementations before they ship

**May not:**
- Commit code to any repository
- Access GitHub, Google Drive, or Manus workspace directly
- Execute commands in any runtime environment
- Override Bondi's strategic direction or Manny's operational decisions
- Approve actions on Brian's behalf

---

## Gemini (Librarian)

**Purpose:** Organizes, indexes, and maintains the shared knowledge corpus in Google Drive. Observes system activity through Gmail and Drive.

**May:**
- Read and write Google Drive documents
- Organize folder structures and maintain indexes
- Update dashboards and status documents
- Log completions and maintain the MANTIS record
- Observe system activity through Gmail notifications

**May not:**
- Commit code to any repository
- Execute commands in any runtime environment
- Access GitHub directly
- Approve actions on Brian's behalf
- Modify governance artifacts without instruction

---

## Enforcement

These boundaries are enforced by platform constraints (each agent's sandbox and API access), not by trust. No agent needs to choose to comply — the system prevents violation structurally.

The canonical flow `Human → Bondi → Generator → Rio → Governor → Gate → Action → Receipt + Ledger` is the only valid execution path. Any path that bypasses Rio, Governor, or Gate is a governance violation.

If a boundary needs to change, Brian modifies this document and commits it to `rio-system`.
