# RIO Solutions Architect — Common Questions & Answers

## Table of Contents
1. Architecture & Design
2. Integration & Deployment
3. Open vs Licensed
4. Security & Compliance
5. Technical Details
6. Business & Pricing

---

## 1. Architecture & Design

### "What is RIO exactly?"

RIO (Runtime Intelligence Operation) is a governance layer for AI agent actions. It sits between AI agents and the real world. When an AI agent wants to do something — send an email, delete a file, transfer money, call an API — RIO assesses the risk, routes it for human approval if needed, executes it with authorization, and generates a cryptographic receipt proving what happened. Think of it as the compliance and audit layer for AI operations.

### "How is this different from just adding approval workflows?"

Traditional approval workflows are manual, unverifiable, and don't scale. RIO provides automatic risk assessment (so low-risk actions flow through without bottlenecks), cryptographic proof of authorization (Ed25519 signatures, not just a checkbox), and a tamper-evident ledger (hash-chained, so you can prove the record hasn't been altered). It's the difference between "we have a process" and "we have mathematical proof."

### "What does the architecture look like?"

Six layers, bottom to top: Proof (receipts and ledger), Execution (connectors and APIs), Agents (thinking and planning), Governance (RIO — policy, risk, HITL), Interface (ONE command center), and Authority (human decision maker). The key insight is that governance sits between agents and execution — agents can think freely, but they can't act without going through RIO.

### "Can we use just the receipts without the governance?"

Yes. The receipt protocol is open source and free. You can generate and verify receipts in your own system without using the RIO governance platform at all. Many companies start there — adding receipts to their existing AI workflows for auditability — and then adopt the governance layer when they need enforced Human-in-the-Loop.

---

## 2. Integration & Deployment

### "How long does integration take?"

Typical timeline is two to four weeks. Week one is receipt integration (install SDK, wrap existing agent actions). Week two is governance setup (connect to RIO API, configure risk levels, set up approval workflows). Weeks three and four are customization (policy rules, custom connectors, compliance integration). Simple integrations with a single agent type can be done in a few days.

### "What AI frameworks do you support?"

RIO works with any system that can make HTTP calls. Specific integrations exist for OpenAI (function calling), Anthropic Claude (tool use), and LangChain (custom tool wrapper). If your agents can call an API, they can use RIO. The receipt protocol SDKs are available in Node.js and Python.

### "Can we self-host?"

Yes. RIO supports hosted (we run it), self-hosted (you run it on your infrastructure via Docker), and hybrid (receipts local, governance cloud) deployment models. Self-hosted gives you full control over data and governance policies.

### "How does it connect to our existing systems?"

RIO uses a connector framework. Out of the box, it supports email (Gmail), web search, SMS (Twilio), and Google Drive. Custom connectors can be built for any API — the pattern is: receive action request, execute via your API, return result, generate receipt. The connector interface is straightforward and documented.

---

## 3. Open vs Licensed

### "What's free and what costs money?"

The receipt protocol is completely free and open source — receipt generation, verification, ledger format, signing, SDKs, CLI tools, integration examples, and documentation. The licensed RIO platform includes the governance engine, policy engine, HITL enforcement, risk assessment, authorization service, ONE command center, enterprise deployment, and multi-tenant support.

### "Why make receipts free?"

Adoption and standardization. We want receipts to become the standard for AI action accountability — like how HTTPS became the standard for web security. The more companies using the receipt format, the more valuable the ecosystem becomes. Companies that want enforced governance on top of those receipts license the platform.

### "Can someone build their own governance on top of the free receipts?"

Technically yes — the receipt protocol is open. But building a production governance engine with risk assessment, policy management, HITL enforcement, and a control center is significant engineering work. Most companies would rather license a proven solution than build from scratch.

---

## 4. Security & Compliance

### "How do you ensure receipts can't be tampered with?"

Two mechanisms. First, each receipt is a SHA-256 hash of all its fields (intent, tool, arguments, risk, approval, result, timestamp), signed with Ed25519. Changing any field changes the hash, invalidating the signature. Second, receipts are appended to a hash-chained ledger where each entry references the previous entry's hash. Altering any entry breaks the chain, and the break is detectable by anyone with the verification tool.

### "What happens if the system goes down?"

Fail-closed. If RIO is unavailable, no actions execute. This is a deliberate design choice — it's safer to stop than to proceed without governance. The kill switch can also be triggered manually to immediately halt all pending actions.

### "How does this help with compliance?"

RIO provides a complete, cryptographically verifiable audit trail of every AI action. For each action, you can prove: what was proposed, who approved it (with their cryptographic signature), what was executed, and what the result was. This satisfies audit requirements for SOC 2, GDPR (data processing records), HIPAA (access logging), and financial regulations (transaction authorization).

### "Is the approval process secure?"

Approvals use Ed25519 cryptographic signatures. When a human approves an action, their private key signs the approval. This signature is embedded in the receipt. You can mathematically verify that the specific human approved the specific action — it's not just a button click in a UI, it's a cryptographic commitment.

---

## 5. Technical Details

### "What's the receipt format?"

JSON with these fields: intentId, toolName, toolArgs, riskTier (LOW/MEDIUM/HIGH/CRITICAL), approvalSignature, executionResult, timestamp, hash (SHA-256), and signature (Ed25519). The hash is computed over all content fields, and the signature is the hash signed with the system's private key.

### "What databases/infrastructure does it require?"

ONE runs as a Node.js application with a TiDB (MySQL-compatible) database. The receipt protocol itself is stateless — you can store receipts anywhere. For self-hosted deployment, Docker Compose handles the full stack. Minimum infrastructure is a single server with Node.js and MySQL.

### "Can we use our own signing keys?"

Yes. The receipt protocol supports custom Ed25519 keypairs. In the RIO platform, each user has their own keypair for approval signatures, and the system has a keypair for receipt signing. Multi-signer support is built in.

---

## 6. Business & Pricing

### "How much does it cost?"

Brian handles pricing discussions directly. The receipt protocol is free and open source. The RIO platform licensing depends on deployment model, scale, and support requirements. I can connect you with Brian for specifics.

### "Is there a trial or pilot program?"

Brian can discuss pilot arrangements. The typical approach is to start with the free receipt protocol to validate the integration pattern, then pilot the governance platform with a limited scope before full deployment.

### "Who else is using this?"

The system is in active development and early deployment. Brian can share specific case studies and reference conversations. The architecture is designed for enterprise scale from day one.
