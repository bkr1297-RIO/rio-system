# CLAIM-GOVERNANCE-RUNTIME-CROSSWALK-001 v0.1

**Status:** CANDIDATE  
**Depends on:** CLAIM-REGISTRY-CONTROL-SURFACE-001_v0.1.md, ROSETTA-LAYER-INGEST-001_v0.1.md  
**No runtime change. No OpenAPI change. No package change.**

---

## 1. Purpose

This document maps claim governance concepts to existing and proposed runtime surfaces
in the ONE / RIO / MUSS system.  It defines how each surface relates to the registry's
classification, tracking, and blocking functions — and where each surface's authority
ends.

This is not a claim that any integration is currently live.

---

## 2. Surface Map

### 2.1 Rosetta Layer

| Dimension | Detail |
|---|---|
| **Role** | Public orientation and translation layer |
| **Registry relationship** | Rosetta language may be sourced from public-proposition claims at Formalized or above; pending claims must not appear in Rosetta-derived explanatory text |
| **What it provides** | Register-boundary vocabulary; cross-domain orientation for readers without requiring them to hold every hypothesis |
| **What it does not provide** | Proof of any research hypothesis; authority to promote any claim; a replacement for the registry as control surface |
| **Boundary** | Rosetta explains the architecture; it does not authorize actions within it |

---

### 2.2 Claim Registry

| Dimension | Detail |
|---|---|
| **Role** | Claim posture and control surface |
| **Registry relationship** | Is the registry |
| **What it provides** | Classification by register and maturity; evidence tracking; review flag management; promotion record |
| **What it does not provide** | Runtime enforcement; publication authority; execution capability |
| **Boundary** | The registry can block or flag language use in future systems; it cannot authorize execution or prove runtime behavior |

---

### 2.3 Typed Intake

| Dimension | Detail |
|---|---|
| **Role** | Content-plane intake gate; prevents unevaluated content from acquiring standing through submission alone |
| **Registry relationship** | Typed Intake enforces the content/control plane separation; it prevents content from being treated as a governed intent before explicit authenticated adoption |
| **What it provides** | A structural boundary between content received and intent authorized |
| **What it does not provide** | Claim promotion; evidence of claim truth; a channel for surfacing pending claims |
| **Boundary** | Typed Intake prevents content standing promotion; it does not classify claims or interact with the registry at runtime |

---

### 2.4 UIF Facade

| Dimension | Detail |
|---|---|
| **Role** | Proposed public API and product doorway over the existing RIO Gateway |
| **Registry relationship** | Onboarding and public-facing language at the UIF surface must gate on registry maturity and review flag per the build adapter candidate rules |
| **What it provides** | A public product entry point; a surface where language governance is most directly user-visible |
| **What it does not provide** | New authority; new runtime behavior; a bypass of existing gateway governance |
| **Boundary** | UIF is a public doorway, not a new authority layer; it does not change what the gateway authorizes or executes |

---

### 2.5 RIO Gateway

| Dimension | Detail |
|---|---|
| **Role** | Evaluates authenticated consequential intent through the six-stage flow (`submitted → governed → authorized → executing → executed → receipted`) |
| **Registry relationship** | Runtime-evidence register claims at Implemented or above may describe gateway behavior; they do not alter it |
| **What it provides** | Authoritative execution path for governed intent |
| **What it does not provide** | Claim promotion; registry authority; a channel to surface pending claims |
| **Boundary** | The gateway evaluates intent; it does not read or enforce the Claim Registry at runtime |

---

### 2.6 Receipts / Ledger

| Dimension | Detail |
|---|---|
| **Role** | Proves that bounded runtime events occurred within the system |
| **Registry relationship** | A receipt or ledger entry may constitute supporting evidence for a runtime-evidence register claim; it does not automatically promote that claim |
| **What it provides** | Tamper-evident, bounded proof of a specific execution event |
| **What it does not provide** | Proof of any claim beyond the bounded event it actually records |
| **Boundary** | Runtime evidence supports a claim only within the bounded event it actually proves; a receipt for event X is not evidence for any broader hypothesis about X's class of events |

---

### 2.7 MANTIS / MUS / ONE / Sentinel

| Dimension | Detail |
|---|---|
| **Role** | Related system offices within the ONE / RIO / MUSS architecture |
| **Registry relationship** | Claims may reference these offices by name in public-proposition or runtime-evidence register entries; no implementation claim is made here |
| **What this document does not claim** | That any of these offices implement claim governance; that enforcement by these offices is currently live; that these offices have been verified against any registry claim |
| **Boundary** | These offices are named as related context only; this crosswalk does not constitute a specification of their behavior |

---

## 3. Cross-Cutting Boundaries

The following rules apply across all surfaces above:

| Rule | Applies to |
|---|---|
| **Pending block** — claims with `PENDING HUMAN REVIEW` remain internal/held and must not appear on any product-facing, public, technical, or canonical surface | All surfaces |
| **Registry cannot authorize execution** — no surface may treat a registry classification as authorization to execute a system action | All surfaces |
| **Evidence is bounded** — a piece of runtime evidence proves only the specific event it records, not a general claim about the system | Receipts/Ledger, RIO Gateway, runtime-evidence register entries |
| **Private and personal registers are not repo material** — private-meaning and personal-protocol claim text must not appear in any file in this repository | All surfaces |
| **Promotion requires human review** — no automated process, build step, or agent action constitutes a claim promotion event | Claim Registry, all surfaces that surface claim language |

---

## 4. Non-Claims

- This document does not claim any crosswalk mapping is currently enforced at runtime.
- This document does not claim any claim has been promoted or verified.
- This document does not claim the Claim Registry is currently machine-readable or
  integrated with any build system.
- This document does not claim Rosetta proves any research hypothesis.
- This document does not claim implementation status for MANTIS, MUS, ONE, or Sentinel
  in relation to claim governance.

---

*Docs only. No runtime code. No live integration. No new dependency. No OpenAPI change.*
