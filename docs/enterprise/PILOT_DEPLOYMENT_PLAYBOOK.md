# Pilot Deployment Playbook

**Phase 3: Packaging and Distribution**
**Author:** Chief of Staff
**Date:** 2026-04-03

This playbook defines the exact sequence for deploying the RIO system into a new organization for the first time. It is designed around the **Governed AI Email** use case.

---

## The Goal of the Pilot

The pilot is not a technology test; it is a trust test. The goal is to prove to the organization's compliance, security, and operational teams that AI can be safely deployed because RIO guarantees human oversight and cryptographic auditability. The pilot must demonstrate the 7 RIO System Invariants in action, specifically proving that **AI proposes, RIO governs, Humans approve, Systems execute, and Receipts prove.**

**Success Criteria:**
1. 100+ governed email actions completed.
2. Zero unauthorized sends (fail-closed verified).
3. Receipt chain integrity verified by the organization's own auditors.
4. Human approval latency measured (target: <30 seconds for routine actions).

---

## Phase 1: Pre-Deployment (Days 1-7)

Before any software is installed, the organization must define the boundaries of the pilot.

### 1. Define the Pilot Scope
- **Who is the AI?** Identify the specific AI agent or LLM application that will be drafting emails.
- **Who is the Human?** Identify the specific managers or operators who will hold the ONE Command Center approval authority.
- **What is the Domain?** Restrict the pilot to a specific type of email (e.g., customer support drafts, internal status reports, vendor inquiries).

### 2. Provision Infrastructure
The organization provisions a single Linux VM or bare-metal server (2 vCPU, 4 GB RAM, 20 GB disk) with Docker Engine 24+ installed.

### 3. Provision Credentials
The organization creates a dedicated service account or OAuth credential for the Gmail API (or SMTP relay) with `gmail.send` scope. This credential will be given to the RIO Gateway, *not* to the AI agent.

---

## Phase 2: Installation (Day 8)

The installation is performed using the Docker Compose package provided by the RIO team.

### 1. Deploy the Containers
The organization clones the deployment repository and runs the setup script. This spins up three containers:
- RIO Gateway (Governance Engine)
- ONE Command Center (PWA served by Gateway)
- MySQL Database (Ledger)

### 2. Configure the Environment
The organization populates the `.env` file with:
- Database connection string
- Gmail API credentials
- Ed25519 key pair (generated locally during setup)

### 3. Verify Health
The organization runs a health check against the Gateway API to confirm all components are communicating.

---

## Phase 3: Integration (Days 9-14)

The organization connects their existing AI agent to the RIO Gateway.

### 1. Update the AI Agent
The organization modifies their AI agent's code. Instead of calling the Gmail API directly, the agent now calls the RIO Gateway's `/api/v1/intents` endpoint with the proposed email payload.

### 2. Configure the Policy
The organization loads the "Email Governance" Protocol Pack into the RIO Gateway. This defines the risk tiers (e.g., internal emails = LOW risk, external emails = HIGH risk).

### 3. Onboard the Human Approvers
The designated human approvers log into the ONE Command Center, complete the biometric handshake, and establish their identity within the system.

---

## Phase 4: Operation (Days 15-30)

The system is live. The AI agent begins drafting emails and submitting them as intents.

### 1. The System Lifecycle Loop
The system operates on the standard 9-step lifecycle:
- **Observe/Analyze/Plan:** The AI agent determines an email is needed and submits a proposed intent.
- **Govern:** The RIO Gateway evaluates the policy and queues the intent.
- **Approve:** The human approver receives a notification in ONE, reviews the email, and provides cryptographic approval.
- **Execute:** The RIO Gateway verifies the signature and executes the send via Gmail (Fail Closed).
- **Record/Verify:** A cryptographic receipt is generated and logged to the immutable ledger.
- **Learn:** The organization reviews the ledger to refine future policies.

### 2. Monitor and Adjust
The organization monitors the approval queue. If certain types of emails are consistently approved without issue, the policy can be adjusted to lower their risk tier or automate approval under specific conditions.

---

## Phase 5: Audit and Review (Day 31)

The pilot concludes with a formal audit of the system's performance.

### 1. Verify the Ledger
The organization's compliance team uses the open-source RIO verification tool to walk the hash chain and confirm that no receipts have been altered or deleted.

### 2. Review the Receipts
The compliance team reviews a sample of receipts to confirm that every executed email has a corresponding human approval signature.

### 3. Evaluate Success
The organization evaluates the pilot against the success criteria defined in Phase 1. If successful, the deployment transitions from Pilot to Scaled Production.
