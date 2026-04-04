# RIO System Invariants

This document defines the non-negotiable architectural and operational rules of the RIO system. These invariants must always be true, regardless of deployment, feature, or use case. They form the foundation of the product, the architecture, and the trust story.

## The Core Model

The RIO system is a governed execution system with three functional roles. The core model is:

**AI proposes → RIO governs → Human approves → System executes → Receipts record → Ledger proves → Verification audits**

## The 7 System Invariants

### 1. Human Authority
A human is always the final approval authority for governed actions. The system cannot override or bypass human intent.

### 2. No Execution Without Approval
High-risk or governed actions cannot execute without explicit approval. The system must enforce this at the execution boundary, not just in policy.

### 3. Receipt Required
Every governed action must produce a cryptographic receipt. If an action occurs, a receipt must exist. No receipt = did not happen.

### 4. Ledger Required
Every receipt must be written to an append-only, hash-chained ledger. The ledger provides the immutable history of the system.

### 5. Fail Closed
If approval, signing, receipt generation, or ledger write fails, the action must not execute. The system defaults to safety and inaction when any part of the governance loop fails.

### 6. Independent Verification
Receipts and the ledger must be independently verifiable by a third party. Trust is established through cryptography, not just system claims.

### 7. Separation of Roles
The system must maintain strict separation between:
- **Intelligence:** AI proposes actions.
- **Authority:** Human approves actions.
- **Execution:** Gateway executes actions.
- **Witness:** Receipt + Ledger verify actions.

These roles cannot be collapsed or combined. Intelligence cannot execute; execution cannot approve.

---

*These invariants guide all architecture decisions, security models, compliance documentation, pilot designs, licensing boundaries, and future connector implementations.*
