# TO: andrew@example.com, "riomethod5@gmail.com" <riomethod5@gmail.com>
# SUBJECT: Directive — Foundational Specs (Identity → Policy → Storage)

Andrew,  
  
Phase 1 is locked. You own the Foundational Specs.  
  
DELIVERY ORDER (Non-negotiable):  
1\. IDENTITY\_AND\_ROLES\_SPEC.md  
2\. POLICY\_SCHEMA\_SPEC.md  
3\. STORAGE\_ARCHITECTURE\_SPEC.md  
  
Each spec must be completed, reviewed, and locked before the next begins.  
  
CRITICAL REQUIREMENTS:  
  
IDENTITY\_AND\_ROLES\_SPEC.md must define:  
  ✓ Cryptographically distinct roles (proposer, policy\_engine, approver, executor, auditor, meta\_governance)  
  ✓ signer\_id model (how identities are bound to Ed25519 keys)  
  ✓ Public key registration and rotation  
  ✓ Role-to-capability mapping (which roles can perform which actions)  
  ✓ Permission model (what needs to be checked at each gate)  
  ✓ Impact on receipt schema (how roles appear in cryptographic proofs)  
  
POLICY\_SCHEMA\_SPEC.md must define:  
  ✓ Machine-readable policy representation (JSON schema)  
  ✓ Risk levels and how they map to approval requirements  
  ✓ Policy evaluation rules (which actions require what approvals)  
  ✓ Quorum models (single approval vs dual control vs sequential)  
  ✓ Policy expiration and versioning  
  ✓ Allowed executors per action  
  ✓ Scope constraints (environment, action type, risk level)  
  
STORAGE\_ARCHITECTURE\_SPEC.md must define:  
  ✓ Clear boundary: CAS (Content-Addressable Storage) vs Ledger  
  ✓ What is stored in full (intent, plan, execution details)  
  ✓ What is stored as hashes/references (receipts, links)  
  ✓ What lives in MANTIS/context storage vs append-only ledger  
  ✓ Artifact lifecycle (intent → plan → execution → receipt → ledger)  
  ✓ Deduplication strategy (how to avoid storing identical artifacts twice)  
  ✓ Verifier requirements (can auditor reconstruct artifact → receipt → ledger chain?)  
  ✓ Hash chain design (what gets hashed, in what order)  
  
REVIEW GATES:  
  - Romney reviews IDENTITY\_AND\_ROLES\_SPEC for receipt/ledger compatibility  
  - Romney reviews STORAGE\_ARCHITECTURE\_SPEC for CAS/ledger boundary clarity  
  - Brian approves each spec before you move to the next  
  
RATIONALE:  
These specs define the data structures and schemas that Manny will enforce in code.  
Manny will not begin enforcement implementation until these specs are finalized and locked.  
This ensures the code is built on a solid architectural foundation, not assumptions.  
  
Deliver by \[DATE\].  
  
— Brian