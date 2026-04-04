# Status

Current state of the RIO system. Updated by agents as work progresses.

Last updated: 2026-04-04 by Damon (Developer Relations)

---

## Latest Delivery — Protocol Sign-Off: Phase 1 Foundational Specs

**Date:** 2026-04-04
**Agent:** Romney (Protocol / Packaging)
**Delivery:** Protocol compatibility sign-off for all three Phase 1 foundational specs, with responses to all 8 open questions from Andrew
**Branch:** `main`
**File:** `docs/reviews/PROTOCOL_SIGNOFF.md`

**Verdict:** APPROVED with conditions. All three specs are compatible with the receipt protocol. No breaking changes required.

**Key Decisions:**

1.  **Receipt version bump: v2.3 (minor, not major).** Three new optional fields (`role_exercised`, `actor_type`, `key_version`) are additive and backward-compatible.
2.  **`key_version` excluded from `authorization_hash`.** It is a lookup hint, not a proof element. Including it would create false distinctions after key rotation.
3.  **Delegation handled within existing `governed_action` type.** No new receipt type needed. `identity_binding.delegation` is an optional sub-object.
4.  **Ledger columns added directly** (not via separate view). `schema_version` field recommended for version-aware hash computation.
5.  **Receipt self-containment preserved.** CAS is a storage location, not a structural change to the receipt.
6.  **CAS keys should use algorithm prefix** (`sha256:...`). Receipt hash fields remain bare hex strings.
7.  **Ledger export format v2** with new fields. V1 exports remain available for backward compatibility.
8.  **CAS garbage collection acceptable** for abandoned intents (submitted, no evaluation, >90 days). Ledger entries and hashes are never deleted.

**All 8 open questions answered.** See `docs/reviews/PROTOCOL_SIGNOFF.md` for full reasoning.

**Next Steps:**
- Romney: Implement receipt spec v2.3 in public protocol repo (additive fields, schema update, reference implementation)
- Manny: Cleared to begin enforcement implementation using the three specs as contract
- Andrew: Minor spec updates recommended (version bump number, CAS key format, schema_version field)

**Platformization Tracker:** Phase 1 protocol reviews complete. Phase 2 (implementation) is unblocked.

---

## Latest Delivery — Gateway API Contract

**Date:** 2026-04-04
**Agent:** Damon (Developer Relations)
**Delivery:** Defined the developer contract for the Gateway API, standardizing it as the only enforcement and execution entry point.
**Branch:** `main`
**File:** `docs/GATEWAY_API_CONTRACT.md`

**Summary:**
- Standardized Gateway as the sole enforcement and execution entry point for ONE, CLI, Slack, and future SDKs.
- Defined required Gateway Endpoints: `POST /intents`, `POST /approvals/:intent_id`, `POST /execute/:intent_id`, `GET /receipts/:receipt_id`, `GET /ledger/:entry_id`.
- Specified request requirements: `principal_id`, `signature`, `key_version`, `intent_hash` (where applicable).

**Current Status:**
- Gateway API Contract defined and documented.
- Ready for use by ONE, CLI, Slack, and future SDKs.

---

## Latest Delivery — SDK Interface and Developer Flow

**Date:** 2026-04-04
**Agent:** Damon (Developer Relations)
**Delivery:** Drafted SDK Interface and Developer Flow documentation, aligned with new Identity, Policy, and Storage specifications.
**Branch:** `main`
**Files Delivered:**

| File | Purpose | Status |
|---|---|---|
| `docs/guides/EXTERNAL_INTEGRATION_PLAN.md` | Updated External System Integration Plan | Aligned with new specs |
| `docs/guides/SDK_INTERFACE_AND_DEVELOPER_FLOW.md` | Draft SDK Interface and Developer Flow | Drafted |

**Summary:**
- Updated `docs/guides/EXTERNAL_INTEGRATION_PLAN.md` to reflect the actual Gateway routes (`/api/v1/*`) and incorporate the new `principal_id`, `actor_type`, and `role_exercised` fields for identity binding and policy evaluation.
- Created `docs/guides/SDK_INTERFACE_AND_DEVELOPER_FLOW.md` outlining the conceptual SDK structure and step-by-step developer flow with code examples for Python and Node.js, fully aligned with the `IDENTITY_AND_ROLES_SPEC.md`, `POLICY_SCHEMA_SPEC.md`, and `STORAGE_ARCHITECTURE_SPEC.md`.

**Current Status:**
- Completed alignment of the External System Integration Plan and drafted the SDK Interface and Developer Flow documentation.
- Awaiting feedback on the drafted SDK Interface and Developer Flow, and further instructions.

---

## Previous Delivery — Phase 1 Foundational Specs (3 of 3)

**Date:** 2026-04-04
**Agent:** Andrew (Solutions Architect / Manus)
**Delivery:** Three foundational specifications required before Manny can begin enforcement implementation
**Branch:** `main`
**Tracker Reference:** `docs/PLATFORMIZATION_TRACKER.md` — Phase 1

**Files Delivered:**

| File | Purpose | Lines | Status |
|---|---|---|---|
| `spec/IDENTITY_AND_ROLES_SPEC.md` | Unified identity model: 6 actor types, 6 roles, Ed25519 key model, principal registry, delegation, role enforcement at API boundary | ~450 | Draft — Romney review needed |
| `spec/POLICY_SCHEMA_SPEC.md` | Machine-readable policy schema: risk tiers, action classes, approval requirements, quorum rules, delegation rules, system modes, policy versioning with hash chain | ~400 | Draft |
| `spec/STORAGE_ARCHITECTURE_SPEC.md` | CAS + Append-Only Ledger boundary: what goes where, artifact lifecycle, verification endpoints, deployment configurations | ~400 | Draft — Romney review needed |

**Key Design Decisions:**

1.  **Keys per principal, not per role.** A single principal has one active Ed25519 key pair. Simplifies key management. Key rotation is logged in the ledger.
2.  **Role separation enforced cryptographically.** An agent with role `proposer` cannot produce a valid approval even if it has a valid Ed25519 key — the Gateway checks both signature validity AND signer role.
3.  **Policy is versioned with a hash chain.** Every policy change produces a new document with `previous_policy_hash`, forming a tamper-evident chain of policy versions. Changes require Meta-Governance quorum.
4.  **CAS for content, Ledger for proof.** Full artifacts (intent body, execution result, receipt) go in Content-Addressable Storage (S3 or PostgreSQL fallback). Only hashes go in the ledger. This keeps the ledger small and permanent.
5.  **Fail-closed default.** If no action class matches an intent, the governance decision defaults to `REQUIRE_HUMAN`.

**Open Questions for Romney (8 total across 3 specs):**
- Receipt field additions (`role_exercised`, `actor_type`, `key_version`) — version bump needed?
- Key version in hash chain computation?
- Delegation representation in receipts?
- Ledger backward compatibility approach?
- Receipt self-containment with CAS separation?
- Hash algorithm future-proofing (prefix scheme)?
- Ledger export format update?
- CAS garbage collection for abandoned intents?

**Decisions Needed from Brian:** None. These are architectural specs within the Solutions Architect's territory. Romney review is the next gate.

**Next Step:** Romney reviews Identity and Storage specs for receipt/ledger compatibility. Once approved, Manny begins enforcement implementation (Phase 2 of Platformization Tracker).

---

### Previous Delivery — Enforcement Implementation Plans

**Date:** 2026-04-04
**Agent:** Manny (Builder)
**Delivery:** Implementation plans for all 5 enforcement areas. Plans only — no code until Andrew's specs land.
**Branch:** `main`
**File:** `docs/ENFORCEMENT_PLANS.md`

**Five enforcement areas planned:**
1.  Role Enforcement — unified principal model, 5 roles, middleware enforcement, identity binding (2-3 days)
2.  Policy Evaluation Engine — machine-readable policy schema, rule evaluator, quorum enforcement, versioning (3-5 days)
3.  CAS + Ledger Boundary — content-addressable storage, hash-only ledger, artifact envelopes (3-4 days)
4.  Active Audit — automatic post-execution audit pipeline, 5 compliance checks, anomaly detection (3-5 days)
5.  Meta-Governance Enforcement — control modes, quorum, governance change receipts, learning classification (5-7 days)

**Total estimated effort: 16-24 days** (sequential, after specs land).
**Dependency:** Awaiting Andrew's three specs (Identity, Policy Schema, Storage).
**Status:** Plans ready. Builder is ready to build as soon as specs land. **Andrew's specs have now landed — Manny is unblocked.**

---

### Previous Delivery — Protocol Alignment Reviews for Platformization

**Date:** 2026-04-04
**Agent:** Romney (Protocol / Packaging)
**Delivery:** Three protocol compatibility reviews for the Enforcement Implementation phase
**Branch:** `main`
**Files:**
- `docs/reviews/IDENTITY_COMPATIBILITY_REVIEW.md` — How identity decisions affect receipt verification. Analyzes role-based IDs, DID-style identifiers, embedded vs external roles, multi-signer scenarios. Verdict: protocol is compatible with all likely identity models; no changes needed unless multi-signer receipts are required (breaking change).
- `docs/reviews/STORAGE_COMPATIBILITY_REVIEW.md` — CAS vs Ledger boundary analysis. Confirms receipts hash artifacts (not store them), ledger stores references (not full receipts). Recommends adding `execution_hash` to ledger entries for completeness. Identifies canonical serialization as the critical contract for CAS.
- `docs/reviews/AUTOMATED_AUDIT_SPEC.md` — Defines 5 mandatory audit checks, 3 audit levels (receipt-only, receipt+ledger, full artifact), structured output format, and audit frequency. Maps existing verifier functions to audit checks and identifies gaps for Level 3 (artifact re-derivation).

**Key findings:**
- Protocol is identity-model-agnostic. No receipt changes needed for role-based or DID identifiers.
- Protocol is storage-model-agnostic. CAS integration is naturally compatible.
- One ledger change recommended: add `execution_hash` to ledger entry schema.
- One open question: will quorum approvals produce multi-signed receipts? If yes, `identity_binding` needs to become an array (major version bump).
- Policy version checking is blocked on Andrew's Policy Schema Spec. **Andrew's Policy Schema Spec has now landed.**

**Platformization Tracker updates:**
- Identity and Roles Spec → Protocol Review: **Ready** (review complete, awaiting Andrew's spec for final sign-off)
- Storage Architecture Spec → Protocol Review: **Ready** (review complete, awaiting Andrew's spec for final sign-off)

---

### Previous Delivery — Platformization Phase: Enforcement Tracker + Directive

**Date:** 2026-04-04
**Agent:** Chief of Staff
**Delivery:** Platformization Tracker, Directive, and Decision
**Branch:** `main`
**Source:** Brian (Root Authority)
**Files:**
- `docs/PLATFORMIZATION_TRACKER.md` — 5 enforcement areas with spec/implementation/verification checklist
- `docs/directives/2026-04-04_PLATFORMIZATION_DIRECTIVE.md` — Formal directive: enforcement implementation phase
- `docs/DECISIONS.md` — Platformization phase decision recorded

---

## Previous Delivery — Architecture Convergence: Technical Decisions

**Date:** 2026-04-04
**Agent:** Manny (Builder)
**Delivery:** Technical decisions document mapping Brian's 5 architecture convergence areas to existing implementation, gaps, and next steps
**Branch:** `main`
**File:** `docs/TECHNICAL_DECISIONS.md`

**Estimated Phase 1 effort across all areas: 10-14 days.**

---

### Previous Delivery — Spec Consolidation: Canonical 6-Document Structure

**Date:** 2026-04-04
**Agent:** Manny (Builder), integrating directive from Bondi (Scribe / OpenAI ChatGPT)
**Delivery:** Consolidated the entire spec/ directory into the Scribe's canonical 6-document structure
**Branch:** `main`

**Canonical Documents (spec/):**
- `CONSTITUTION.md` — Highest authority. Invariants, 5 layers, quorum, accountability invariant, amendment process.
- `ARCHITECTURE.md` — System design. Five layers, three loops, components, connector model, token model, deployment.
- `META_GOVERNANCE.md` — Layer 5 operational manual. Quorum, change control, learning classification, control modes.
- `WORK_PROTOCOL.md` — How work gets done. Agent work loop, roles, completion reports, audit checklist, definition of done.
- `RECEIPT_SPEC.md` — Receipt format. 5-hash chain, verification algorithm, protocol versioning, SDK support.
- `LEDGER_SPEC.md` — Ledger format. Append-only enforcement, hash chain algorithm, chain verification, integrity monitoring.

**Archived (spec/archive/):** 11 superseded files preserved for historical reference.

**Rationale:** Two Meta-Governance files existed (META_GOVERNANCE_SPEC.md and RIO_META_GOVERNANCE.md), creating governance drift risk. The Scribe directed: "Do not keep two specs — that creates governance drift." All content consolidated into one source of truth per domain.

---

## Previous Delivery — Meta-Governance Enforcement Mechanisms

**Date:** 2026-04-04
**Agent:** Chief of Staff
**Delivery:** 4 enforceable mechanisms added to Meta-Governance spec
**Branch:** `main`
**Source:** Bondi (Scribe / ChatGPT)
**Files:**
- `spec/RIO_META_GOVERNANCE.md` — Updated with Sections 6–10 (Quorum, Change Control, Do Not Learn, Kill Switch)
- `docs/DECISIONS.md` — Enforcement mechanisms decision recorded

---

### Previous Delivery — Scribe Deliverables: Mirrored Governance + Layer 5 Meta-Governance

---
