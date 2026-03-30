# RIO System — Agent Handoff & Parallel Development Plan

**Date:** 2026-03-29
**From:** Manus Agent (The Machine / Backend)
**To:** Manus Agent (The Proof / Frontend & Docs)
**Approver:** Brian K. Rasmussen

---

## The Situation

Brian has two Manus agents working on the RIO system. We cannot communicate directly, but we can coordinate through this GitHub repository (`bkr1297-RIO/rio-system`). 

We have successfully closed the loop. The first real governed action (sending an email via Gmail MCP) was executed, authorized by Brian, and a cryptographic receipt was generated and committed to this repo (`receipts/first-real-governed-action.json`).

To move faster without stepping on each other's toes, Brian has approved a parallel development model. We will divide the remaining work into two distinct lanes.

---

## Division of Labor

### Lane 1: The Machine (My Lane)
I am focusing on the backend infrastructure, security, and persistence. I will be working primarily in the `gateway/` and `backend/` directories.

**My current tasks:**
1. **Persistent Ledger:** Replacing the in-memory/JSON ledger with a real PostgreSQL database.
2. **Ed25519 Signatures:** Upgrading the authorization endpoint to require and verify cryptographic signatures from Brian, rather than just accepting a string name.
3. **OAuth Login:** Implementing identity verification for the gateway.
4. **Permanent Deployment:** Containerizing the gateway and preparing it for Azure deployment so it survives beyond sandbox sessions.

### Lane 2: The Proof & Documentation (Your Lane)
You built the demo site and have been precise about the documentation and protocol presentation. You should own the frontend, the connectors, and the protocol documentation.

**Your recommended tasks:**
1. **Connect the Protocol Site:** The site at `rioprotocol-q9cry3ny.manus.space` is currently a presentation. It needs to be wired to the live gateway (or at least updated to reflect the new architecture and the genesis receipt).
2. **Add GitHub Connector:** Build the second real connector (after Gmail) so the gateway can govern repository actions (e.g., creating issues, merging PRs).
3. **Update White Paper:** As I land the PostgreSQL and Ed25519 features, the white paper (`docs/RIO_White_Paper_Formal.md`) will need to be updated to reflect the production architecture.
4. **Demo Site Updates:** Update `riodemo-ux2sxdqo.manus.space` to point to the real gateway instead of running in-memory simulations.

---

## The Handshake Protocol

To avoid merge conflicts and ensure Brian stays in control:

1. **Stay in your lane:** I will not touch the frontend or docs (unless necessary for backend integration). You do not need to touch the core gateway routing or ledger implementation.
2. **Commit often:** Push changes to `main` frequently so we both have the latest state.
3. **Read before writing:** Always pull the latest `main` and read this doc and the commit history before starting a new session.
4. **Brian is the Governance:** If a decision crosses boundaries, we ask Brian.

---

## Architectural Update (Important)

During the first real governed action, I discovered a constraint: the `manus-mcp-cli` cannot be called directly from within a Node.js child process. 

I updated the architecture to fix this. It is now **more aligned** with the RIO philosophy:
1. The Gateway receives the intent, governs it, and authorizes it.
2. The Gateway **issues an execution token** to the Agent.
3. The Agent executes the action externally (via MCP).
4. The Agent calls `/execute-confirm` on the Gateway with the result.
5. The Gateway generates the receipt and writes to the ledger.

This enforces the rule: The Gateway governs, the Agent executes.

Good luck. I'm starting on the PostgreSQL ledger now.
