# CLAIM-GOVERNANCE-BUILD-ADAPTER-CANDIDATE-001 v0.1

**Status:** CANDIDATE — not runtime code; not a live integration  
**Depends on:** CLAIM-REGISTRY-CONTROL-SURFACE-001_v0.1.md  
**No runtime change. No OpenAPI change. No package change.**

---

## 1. Purpose

This document defines the candidate design for how future build systems may consume the
Claim Registry as a governance gate.  It is a design specification only.  Nothing
described here is currently implemented.  Authorization is required before any build
integration is attempted.

---

## 2. Candidate Consumption Points

Future build systems may read registry state to govern the following surfaces:

| Surface | Registry role |
|---|---|
| **Onboarding language** | Source framing language from public-proposition claims at Formalized or above; block use of any claim flagged PENDING HUMAN REVIEW |
| **Doctrine / reference pages** | Surface claims at Documented or above; annotate claims below Verified with maturity indicator |
| **Public / private register separation** | Never surface personal-protocol or private-meaning register content on any public-facing page |
| **RIO / Scribe language gates** | Require runtime-evidence register and Implemented or above before including a claim in system-level documentation |
| **Admin review workflow** | Expose PENDING HUMAN REVIEW flag count and individual flag status to admins; do not auto-clear flags |
| **Claim metadata** | Display claim ID, register, maturity, evidence gate, and public posture alongside any surfaced claim |

---

## 3. Required Adapter Interface (Candidate)

A conforming build adapter must support the following read operations against the
registry:

| Operation | Description |
|---|---|
| `read_claim_id` | Return the stable identifier for a claim row |
| `read_register` | Return the register assignment: `public_proposition`, `runtime_evidence`, `personal_protocol`, or `private_meaning` |
| `read_maturity` | Return the maturity level: `declared`, `documented`, `formalized`, `implemented`, or `verified` |
| `read_evidence_gate` | Return whether sufficient evidence is recorded to support the current maturity level |
| `read_public_posture` | Return whether the claim is designated as surface-able on public-facing pages |
| `read_review_flag` | Return the current review flag: `PENDING HUMAN REVIEW`, `CLEARED`, or `NOT FLAGGED` |

---

## 4. Required Blocking Rules

An adapter must enforce the following blocking rules; no workaround or override may be
implemented at the build layer:

| Rule | Trigger | Consequence |
|---|---|---|
| **Pending block** | `read_review_flag` returns `PENDING HUMAN REVIEW` | Block product-facing use of the claim on all surfaces without exception |
| **Runtime/security gate** | Claim is used in a runtime or security context AND (`read_maturity` < `implemented` OR `read_evidence_gate` = false) | Block inclusion; log the claim ID and failure reason |
| **Private register block** | `read_register` returns `personal_protocol` or `private_meaning` | Block all public-facing use unconditionally |
| **Uncleared scientific claim** | Claim describes a research hypothesis or empirical result AND `read_maturity` < `verified` | Block use in any scientific or technical output |

---

## 5. What the Adapter Must Not Do

- Auto-promote a claim (change its maturity) based on build outputs.
- Clear a PENDING HUMAN REVIEW flag programmatically.
- Write to the registry (the registry is read-only from the build adapter's perspective).
- Surface a claim's personal-protocol or private-meaning text on any public page.
- Treat evidence accumulation as equivalent to human review.
- Assert that any claim is "proven" or "verified" without the registry's own Verified
  maturity level being present.

---

## 6. Relationship to Existing Governance

| Existing surface | Adapter relationship |
|---|---|
| SPG-M intake | SPG-M governs system prompts at intake; the claim adapter governs documentation surfaces. They operate at different layers and must not be conflated. |
| UIF facade | UIF governs what intent is accepted at the public facade; claim governance governs what claims may appear in documentation. No coupling at runtime. |
| RIO intent flow | A claim in the `runtime_evidence` register at `implemented` or above may describe RIO intent behavior; it does not alter that behavior. |

---

## 7. Implementation Prerequisites

Before any build adapter is implemented:

1. The Claim Registry must be published to a machine-readable format (CSV, JSON, or API)
   that the build system can consume without a human manually exporting the workbook.
2. A review workflow must be defined so that PENDING HUMAN REVIEW claims can be cleared
   by an identified, accountable reviewer without requiring a full registry export.
3. A claim ID stability guarantee must exist: IDs must not change between registry
   versions, or the adapter will produce incorrect blocks on renamed claims.
4. Authorization from the project owner is required before any live integration is
   attempted.

This is not a request for those prerequisites to be built.  It is a record of what must
exist before the adapter can be implemented.

---

## 8. Non-Claims

- This document does not claim the adapter exists.
- This document does not claim the registry is currently machine-readable.
- This document does not claim any claim has been verified.
- This document does not claim build governance is currently enforced.

---

*Docs only. No runtime code. No live integration. No new dependency. No OpenAPI change.*
