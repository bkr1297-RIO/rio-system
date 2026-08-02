# Claim Governance — Start Here

This directory holds the repo-safe integration rules for the ONE / RIO / MUSS
claim governance surface.  It is not a complete copy of any Drive artifact.

Drive remains the working and control location for the full Rosetta Introduction
(`ONE_RIO_MUSS_Rosetta_Introduction_v0.1.docx`) and the Claim Registry
(`ONE_RIO_MUSS_Claim_Registry_v0.1.xlsx`).  The files in this directory contain
integration rules and crosswalk references only — no private claim text is
reproduced here.

---

## Files in this directory

| File | What it does |
|---|---|
| `ROSETTA-LAYER-INGEST-001_v0.1.md` | Records the Rosetta Introduction as the public orientation and translation layer; defines the four register boundaries (private meaning, personal protocol, public proposition, runtime evidence); states what GitHub may and may not absorb from Drive |
| `CLAIM-REGISTRY-CONTROL-SURFACE-001_v0.1.md` | Defines the Claim Registry as the claim posture and control surface; documents verified workbook structure and current counts; states hard rules on pending claims; defines the registry's authority boundary |
| `CLAIM-GOVERNANCE-BUILD-ADAPTER-CANDIDATE-001_v0.1.md` | Candidate design for how future build systems may consume the registry; defines required read operations and mandatory blocking rules; records implementation prerequisites; explicitly not a live integration |
| `CLAIM-GOVERNANCE-RUNTIME-CROSSWALK-001_v0.1.md` | Maps claim governance concepts to existing runtime surfaces; defines boundaries between the registry, Typed Intake, UIF, RIO Gateway, and receipts/ledger |

---

## Operating rule

Claim governance may:

- **Classify** claims by register and maturity level.
- **Track** evidence associated with a claim.
- **Recommend** language for use in documentation and onboarding.
- **Block** language use when a claim is pending human review or below required maturity.

Claim governance may not:

- **Publish** a claim autonomously (make it product-facing without human review).
- **Authorize** promotion of a claim to a higher maturity level.
- **Execute** any system action on the basis of a claim.
- **Canonize** a claim (establish it as settled truth) without formal review.
- **Promote** a claim in place of a human reviewer.

These limits are permanent constraints of the governance role, not temporary
restrictions to be lifted by a future version.

---

## Drive / GitHub boundary

| Location | Contents |
|---|---|
| **Drive** | Full Rosetta Introduction; full Claim Registry workbook including all claim text, evidence, and promotion history |
| **GitHub (`docs/claim-governance/`)** | Integration rules, register boundary definitions, adapter candidate design, runtime crosswalk — no private or personal claim text |

Any substantive update to either Drive artifact must originate in Drive and be
reflected here by amendment, not by pasting Drive content into the repo.
