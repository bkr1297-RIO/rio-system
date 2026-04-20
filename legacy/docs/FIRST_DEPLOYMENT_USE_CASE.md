# First Deployment Use Case — Recommendation

**Date:** 2026-04-03
**Author:** Chief of Staff
**Status:** Recommendation — awaiting Brian's decision

---

## Recommendation: Governed AI Email with Receipt

**Use case:** An AI agent drafts and sends email on behalf of a human, with human approval required before send, and a cryptographic receipt generated after execution.

**Why this one:**

1. **Already built.** The Gmail connector is live in ONE. The approval flow is live. Receipts are live. The ledger is live. This use case requires zero new engineering — only packaging and documentation.

2. **Universally understood.** Every organization sends email. Every organization worries about AI sending email without oversight. "AI can draft it, but a human must approve it, and there is a permanent receipt" is a value proposition that requires no explanation.

3. **Demonstrates the full loop.** Intent (draft email) → Risk assessment (LOW/MEDIUM depending on recipient and content) → Approval (human reviews and signs) → Execution (email sent via Gmail) → Receipt (SHA-256 hash, Ed25519 signature, ledger entry). Every component of the system is exercised.

4. **Compliance-ready.** Email governance maps directly to regulatory requirements in finance (SEC), healthcare (HIPAA), and legal (attorney-client privilege). The receipt is the audit trail regulators want.

5. **Expandable.** Once email works, the same pattern extends to: calendar invites, document access, API calls, file sharing. The governance layer is the same — only the connector changes.

---

## What the Deployment Package Looks Like

| Component | What Ships | Format |
|-----------|-----------|--------|
| **ONE Command Center** | Web app — the human control surface | Hosted SaaS or Docker self-host |
| **RIO Gateway** | Governance engine — policy, approval, execution, ledger | Docker container |
| **Receipt Protocol** | Open standard — verify receipts independently | npm/PyPI package (already published) |
| **Gmail Connector** | OAuth-authenticated email send/read | Built into Gateway |
| **Policy Template** | Pre-configured rules for email governance | JSON file (Protocol Pack) |

---

## End-to-End Demo Script

1. User opens ONE on their phone
2. User says: "Send an email to [recipient] about [topic]"
3. Jordan (AI) drafts the email and creates an intent
4. RIO assesses risk (checks recipient, content, policy rules)
5. ONE shows the pending approval with the full email preview
6. User taps APPROVE (biometric + Ed25519 signature)
7. Gateway sends the email via Gmail API
8. Receipt generated: hash of email content + approval signature + timestamp
9. Ledger entry written: hash-chained to previous entry
10. ONE shows the receipt in the activity feed
11. User (or auditor) can verify the receipt independently using the open protocol

---

## Alternative Use Cases Considered

| Use Case | Why Not First |
|----------|--------------|
| AI API calls with receipts | Too abstract for a demo — "API call" doesn't resonate with non-technical buyers |
| AI document access with approval | Requires Google Drive OAuth scoping — adds setup complexity |
| AI SMS with approval | Already works (Twilio connector live) but SMS is less enterprise-relevant than email |
| AI calendar management | Lower stakes — calendar errors are annoying but not compliance-critical |

---

## Decision Needed

Brian: Is governed AI email the right first deployment use case? If yes, Manny packages it, Andrew builds the sales materials around it, Damon writes the integration guide for it, and the Chief of Staff coordinates the timeline.
