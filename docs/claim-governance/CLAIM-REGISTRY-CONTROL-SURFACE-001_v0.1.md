# CLAIM-REGISTRY-CONTROL-SURFACE-001 v0.1

**Status:** CANDIDATE  
**Location of record:** Drive (ONE_RIO_MUSS_Claim_Registry_v0.1.xlsx)  
**Repo role:** Reference — claim posture and control surface  
**No runtime change. No private claim text reproduced here.**

---

## 1. Purpose

The Claim Registry is the posture and control surface for claims made within or about
the ONE / RIO / MUSS system.  This document defines the registry's verified structure,
its current state, its standing rules, and the boundary between what the registry may do
and what it may not do.

---

## 2. Verified Registry Structure

The workbook contains the following sheets:

| Sheet | Role |
|---|---|
| **CONTROL PANEL** | Summary view; current maturity distribution; active flags |
| **CLAIMS** | The canonical claim table: ID, register, text, maturity, evidence gate, public posture, review flag |
| **TAXONOMY** | Register and maturity level definitions |
| **PROMOTION RULES** | Conditions and authority required to advance a claim's maturity level |
| **SOURCES** | Evidence references attached to individual claims |
| **CHANGELOG** | Dated record of additions, edits, flag changes, and promotions |

---

## 3. Verified Counts (as of ingest)

| Metric | Value |
|---|---|
| Total claims | 36 |
| Structurally complete / prior corpus retained | 19 |
| Pending human review | 17 |

---

## 4. Registers

Claims are assigned to one of four registers:

| Register | Description |
|---|---|
| **Public proposition** | Stated positions open to examination and challenge |
| **Runtime evidence** | Observations produced by running systems |
| **Personal protocol** | Individual operating rules and self-governance conventions |
| **Private meaning** | Internally-held interpretations; furnace material |

---

## 5. Maturity Levels

| Level | Meaning |
|---|---|
| **Declared** | Claim has been stated; no supporting evidence required yet |
| **Documented** | Claim is accompanied by explanatory material |
| **Formalized** | Claim has been expressed in a structured, reviewable form |
| **Implemented** | Claim is reflected in working code or system behavior |
| **Verified** | Claim has been examined and confirmed against evidence |

---

## 6. Promotion Rules

Promotion of a claim to a higher maturity level requires **human review**.  Evidence may
support promotion; it does not authorize it.  No automated process, build system, or
agent action constitutes a promotion event.  All promotion events must be recorded in the
CHANGELOG sheet with date and reviewer.

---

## 7. Standing Rules for Pending Claims

Claims with a review flag of **PENDING HUMAN REVIEW** are subject to the following hard
constraints:

- Must not become product-facing claims in any UI, onboarding flow, or public document.
- Must not become technical claims in any specification, API contract, or schema.
- Must not become scientific claims in any research output or methodology statement.
- Must not become canonical claims in any policy, governance contract, or legal document.

A claim is pending until a human reviewer explicitly clears it.  Time passing, evidence
accumulating, or maturity advancing does not clear a pending flag.

---

## 8. What the Registry May Do

- Recommend classification of a claim by register and maturity.
- Track evidence associated with a claim.
- Flag claims for review.
- Record promotion decisions made by human reviewers.
- Produce summaries and views of claim posture.

---

## 9. What the Registry May Not Do

- **Publish** a claim (make it product-facing or externally visible) autonomously.
- **Authorize** promotion without human review.
- **Execute** any system action on the basis of a claim.
- **Canonize** a claim (establish it as settled truth) without formal review and
  acknowledgment.

These prohibitions are permanent constraints of the registry's role, not temporary
limitations to be lifted by a future version.

---

## 10. Drive Location

The canonical working copy of the Claim Registry lives in Drive.  Drive is the working
and control location.  No row from the CLAIMS sheet is reproduced verbatim in this
document.  Any substantive update to registry structure or counts must originate in Drive
and be reflected here by amendment, not by pasting workbook content into the repo.

---

*Docs only. No runtime code. No new dependency. No OpenAPI change.*
