# RIO Solutions Architect — Knowledge Base

## Table of Contents
1. Product Positioning
2. The Two-Layer Model
3. Receipt Protocol (Open Standard)
4. RIO Platform (Licensed)
5. ONE Command Center
6. Competitive Differentiation
7. Target Customers
8. Implementation Approach

## 1. Product Positioning

RIO is the governance layer for AI agent actions. It sits between AI agents and the real world, ensuring every action is authorized, auditable, and reversible.

**One-liner:** "RIO makes AI agents accountable — every action gets a receipt."

**Elevator pitch:** "As companies deploy AI agents that send emails, move money, delete files, and call APIs, they need a way to ensure humans stay in control. RIO provides that control layer — with cryptographic receipts that prove what happened, who approved it, and when. The receipt protocol is open and free. The governance platform that enforces human approval is licensed."

## 2. The Two-Layer Model

**Layer 1: Receipt Protocol (Open)**
- Free, open-source standard
- Any developer can generate and verify receipts
- Receipts are SHA-256 hashed, Ed25519 signed
- Hash-chained ledger for tamper evidence
- SDKs in Node.js and Python
- Goal: become the standard for AI action accountability

**Layer 2: RIO Platform (Licensed)**
- Governance engine that enforces Human-in-the-Loop
- Policy engine with configurable rules
- Risk assessment (LOW / MEDIUM / HIGH / CRITICAL)
- Authorization service with cryptographic approval
- ONE Command Center (dashboard, approvals, audit)
- Enterprise features (multi-tenant, deployment configs)

**Why this split matters:** The receipt protocol creates adoption and standardization. Companies start using receipts for free, then realize they need governance enforcement — that's when they license RIO.

## 3. Receipt Protocol (Open Standard)

A receipt contains:
- **Intent ID** — unique identifier for the proposed action
- **Tool name** — what was called (e.g., "gmail_send")
- **Tool arguments** — parameters (e.g., recipient, subject, body)
- **Risk tier** — assessed risk level
- **Approval signature** — Ed25519 signature from the human approver
- **Execution result** — what actually happened
- **Timestamp** — when it occurred
- **Hash** — SHA-256 of all fields above
- **Signature** — Ed25519 signature of the hash

Receipts are appended to a hash-chained ledger where each entry references the previous entry's hash, making the chain tamper-evident.

**Verification:** Anyone with the public key can verify a receipt independently. No need to trust the system — the math proves it.

## 4. RIO Platform (Licensed)

The governance engine provides:
- **Risk assessment** — automatic classification of actions by risk level
- **Policy rules** — configurable rules that override default risk levels
- **Approval queue** — pending actions waiting for human decision
- **Kill switch** — emergency stop that rejects all pending actions
- **Audit ledger** — complete history of all actions, approvals, and rejections
- **Connector framework** — pluggable execution layer (email, search, SMS, APIs)

## 5. ONE Command Center

ONE is the human interface for the RIO platform:
- **Approvals page** — review and approve/deny pending actions
- **Receipts viewer** — inspect individual receipts with client-side verification
- **Ledger viewer** — browse the hash-chained audit trail
- **Policy editor** — create and manage governance rules
- **System status** — monitor system health and components
- **Notification center** — in-app alerts for pending approvals and executions
- **Bondi chat** — conversational interface to the AI orchestrator

ONE is a Progressive Web App (PWA) — installable on mobile devices, works offline for cached content.

## 6. Competitive Differentiation

**vs. "Just add logging":** Logging records what happened after the fact. RIO prevents unauthorized actions before they happen. Receipts provide cryptographic proof, not just text logs.

**vs. "Manual approval workflows":** Manual workflows don't scale and aren't cryptographically verifiable. RIO automates risk assessment and provides mathematical proof of authorization.

**vs. "AI safety frameworks":** Most AI safety focuses on model behavior (alignment, guardrails). RIO focuses on action governance — what the AI is allowed to DO, not what it's allowed to SAY.

**vs. "Enterprise AI platforms":** Platforms like LangChain, CrewAI, etc. orchestrate agents but don't govern them. RIO adds the governance layer on top of any orchestration framework.

## 7. Target Customers

**Primary:** Companies deploying AI agents that take real-world actions
- Financial services (money transfers, trading, compliance)
- Healthcare (patient communications, record access)
- Legal (document filing, client communications)
- Enterprise IT (system administration, deployments)
- Any regulated industry where AI actions need audit trails

**Secondary:** AI platform companies that want to offer governance as a feature
- Could white-label or integrate RIO into their platforms

## 8. Implementation Approach

**Phase 1 (Week 1-2):** Receipt integration
- Install SDK (`npm install rio-receipt-protocol`)
- Wrap existing AI agent actions with receipt generation
- Set up ledger storage
- Verify receipts are generating correctly

**Phase 2 (Week 2-4):** Governance integration
- Connect to RIO governance API
- Configure risk levels for each action type
- Set up approval workflows
- Deploy ONE for human operators

**Phase 3 (Week 4+):** Customization
- Custom policy rules
- Integration with existing compliance systems
- Custom connectors for proprietary APIs
- Multi-tenant setup (if needed)
