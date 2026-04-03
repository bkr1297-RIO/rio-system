# Deployment Packaging Checklist

**Phase 3: Packaging and Distribution**
**Owner:** Manny (Engineering) / Chief of Staff (Coordination)

This checklist defines the requirements for turning the RIO system from a custom build into a deployable product that another organization can install.

---

## 1. The Deployment Model (Self-Hosted)

To deploy RIO, an organization needs to run three components. Manny must package these:

- [ ] **Gateway Container:** Dockerfile for the Express.js governance engine.
- [ ] **Ledger Database:** Docker Compose setup for MySQL/TiDB.
- [ ] **ONE Command Center:** Dockerfile or static build for the React PWA.
- [ ] **Environment Template:** A clean `.env.example` file listing all required keys (OpenAI, Anthropic, Twilio, Google OAuth, VAPID).

## 2. ONE as the Control Center

ONE is no longer just a testing UI; it is the product interface. Manny must ensure these views are polished and demo-ready:

- [ ] **Agent Interface:** Clean chat/intent creation view.
- [ ] **Pending Approvals (HITL):** Clear risk tier, payload preview, and Approve/Deny buttons.
- [ ] **Receipt Viewer:** Cryptographic proof display with hash verification status.
- [ ] **Ledger Viewer:** Append-only chain view showing sequential integrity.
- [ ] **Policies:** UI to view and toggle active governance rules.
- [ ] **Activity Feed:** Chronological log of all system events.

## 3. The First Use Case: Governed Email

We are optimizing the first deployment around a single, universally understood use case: AI drafting and sending email with human approval and a cryptographic receipt.

- [ ] **Connector:** Gmail OAuth flow is robust and documented.
- [ ] **Policy:** A default "Email Governance" protocol pack is included in the deployment.
- [ ] **Demo Data:** The system boots with sample data or a clear "first run" wizard.

## 4. External Documentation (Agent Output)

The system must be documented for external buyers and developers.

- [ ] **Integration Guide:** How to connect internal tools to the Gateway (Damon - *Done*).
- [ ] **Deployment Guide:** Step-by-step Docker Compose instructions (Manny).
- [ ] **Architecture Diagrams:** Visuals for technical buyers (Andrew - *Done*).
- [ ] **Compliance Explanations:** How RIO maps to SOC2/HIPAA/SEC requirements (TBD).
- [ ] **Pilot Documentation:** A 30-day evaluation plan for new customers (TBD).

---

*Note: The Receipt Protocol is already packaged and published (npm/PyPI). This checklist focuses exclusively on the licensed governance platform (rio-system).*
