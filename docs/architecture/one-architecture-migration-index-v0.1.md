# ONE Architecture Migration Index v0.1

**Status:** Repo-visible migration index  
**Claim level:** Architecture placement / migration tracking  
**Repository:** `bkr1297-RIO/rio-system`  
**Scope:** Cross-repo architecture visibility, Drive/chat migration tracking, and missing-artifact queue  
**Runtime claim:** false  
**Source-of-truth lock:** false  
**Human authority holder:** Brian Kent Rasmussen / B-Rass

## Purpose

This index records where the current ONE architecture materials already exist in GitHub, what appears to live only in Drive/chat, and what still needs migration.

It exists to prevent loss, duplication, stale-thread drift, and accidental rebuilding of artifacts that are already repo-visible.

Keeper:

> Find what exists. Name what is missing. Migrate only what needs migration.

## Non-Claims

This file does not claim:

- runtime implementation,
- production deployment,
- public release,
- source-of-truth promotion,
- legal proof,
- cryptographic proof,
- Manny handoff,
- authority transfer,
- identity transfer,
- machine sovereignty,
- or implementation completeness.

Repo presence proves file placement, not runtime enforcement.

## Current Finding

A meaningful portion of the ONE Cell / Personal ONE Cell / Sovereign Turn thread is already repo-visible, especially in `rio-proxy-manus` and `rio-system`.

However, several named artifacts still appear to be Drive/chat-only or missing as standalone repo artifacts.

## Already Repo-Visible

| Artifact / concept | Repo location | Current status | Notes |
|---|---|---|---|
| ONE Cell Runtime & Ecosystem Map v0.1 | `rio-proxy-manus/docs/constitution/00-wave-0-constitutional-intake/03-action-consequence-constitution-candidates/one-cell-runtime-ecosystem-map-v0.1.txt` | Repo-visible working copy | Contains Excel-to-ONE Cell analogy, role map, runtime path, ecosystem/tool mapping, critical boundary rules, and Gemini review prompt. |
| Repo Estate & Runtime Placement Update | Same ONE Cell map, Appendix A | Repo-visible appendix | Maps `rio-protocol`, `rio-receipt-protocol`, `rio-system`, `language-intake-mvp`, `rio-proxy`, and `rio-proxy-manus` into current role lanes. |
| Personal ONE Cell / Constitutional Context Engine Intake | Same ONE Cell map, Appendix B | Repo-visible appendix | Captures personal context as governed context and defines six personal layers. |
| Personal ONE Cell — Lineage & Doctrine Lock v0.1 | Same ONE Cell map, Appendix C | Repo-visible appendix | Captures provenance, keeper-line lock, and claim discipline. |
| 3x3 Sovereign Turn Matrix v0.1 | `rio-system/docs/architecture/sovereign-turn-matrix-v0.1.md` | Repo-visible architecture artifact | Defines Body/Mind/Field x Mirror/Gate/Proof and Sovereign Turn motion. |
| Source Map | `rio-system/docs/SOURCE_MAP.md` | Repo-visible navigation index | Lists active sources, protocol candidates, architecture context, and non-claims for `rio-system`. |
| Mode Orientation Packet v0.1 | `rio-system/docs/protocols/mode-orientation-packet-v0.1.md` | Repo-visible protocol candidate | Session orientation / mode loading candidate. |
| B-Rass Interaction Calibration v0.1 | `rio-system/docs/protocols/b-rass-interaction-calibration-v0.1.md` | Repo-visible personal calibration candidate | Personal collaboration calibration companion to Mode Orientation Packet. |
| Pattern Atlas v0.2 | `rio-proxy-manus/docs/patterns/pattern-atlas-v0.2.md` | Repo-visible pattern index | Contains pattern-level entries, including private/house/public layer discipline. |
| Agent Safety Cell | ONE Cell map and Pattern Atlas references | Repo-visible as draft concept | Present as draft cell example / pattern material, not proven runtime cell. |
| State Surface framing | ONE Cell map and related pattern docs | Repo-visible concept | Tools such as Docs, Sheets, Calendar, GitHub, Excel are framed as state surfaces/connectors, not authority. |

## Partially Repo-Visible / Needs Consolidation

| Artifact / concept | Current repo evidence | Gap |
|---|---|---|
| Cell & Surface Architecture v0.1 | Concept appears across ONE Cell map, State Surface language, Pattern Atlas, and repo topology materials | No clean standalone repo artifact found by exact title. Needs migration or consolidation. |
| Portable Human-Sovereignty Runtime & Sovereign Turn v0.1 | Sovereign Turn Matrix exists in `rio-system`; related Source Map entries exist | Exact standalone title not found. Likely Drive/chat-only or not yet migrated. |
| Personal ONE Cell / Constitutional Context Engine | Present as Appendix B inside ONE Cell map | May need standalone file if it is to become easier to cite, review, or build from. |
| Personal ONE Cell — Lineage & Doctrine Lock | Present as Appendix C inside ONE Cell map | May need standalone file if it is to become reviewable independently. |
| Agent Safety Cell | Present as draft concept | Needs MVP charter / cell template / first governed turn test if it becomes build target. |
| ONE MVP v0.1 / one governed turn | Present as thread decision / build direction | No standalone repo artifact found yet. |

## Not Found as Repo Artifacts by Exact Name

These names were searched and not found as standalone GitHub artifacts during this pass:

- `one-runtime` repo
- `ONE MVP Charter v0.1`
- `Cell Registry`
- `Cell & Surface Architecture v0.1`
- `Portable Human-Sovereignty Runtime & Sovereign Turn v0.1`
- `Topology Register v0.1`

They may exist in Drive, chat, PDFs, or under different file names, but they were not found by exact repo search.

## Drive / Chat-Only Candidates

Based on the thread summary, these appear to remain outside GitHub or not cleanly migrated as standalone files:

| Artifact | Likely current location | Migration recommendation |
|---|---|---|
| Cell & Surface Architecture v0.1 | Manny/thread draft | Migrate as standalone architecture candidate. |
| Portable Human-Sovereignty Runtime & Sovereign Turn v0.1 | Google Doc / thread summary | Migrate or cross-link to Sovereign Turn Matrix. |
| Topology Register v0.1 | Google Doc / internal formation layer | Migrate only with clear private/house boundary; do not publicize as proof. |
| ONE MVP Charter v0.1 | Thread decision / build direction | Create as implementation charter, not doctrine. |
| one-runtime repo decision | Thread recommendation | Do not create repo automatically; decide whether to extend `rio-proxy` first. |
| Cell Registry | Thread / MVP plan | Create only when runtime build path requires it. |

## Migration Rules

1. Do not duplicate artifacts that are already repo-visible.
2. If an artifact exists only as an appendix, decide whether it needs standalone treatment before copying it.
3. Preserve claim boundaries: architecture language is not runtime proof.
4. Private symbolic material may be preserved, but it must not be imposed as public proof.
5. Runtime build artifacts should go where the runtime actually lives, currently `rio-proxy` unless separately changed.
6. Protocol/source navigation should stay in `rio-system` and its Source Map unless a better canonical home is explicitly selected.
7. Do not create `one-runtime` until repo strategy is explicitly confirmed.

## Recommended Migration Queue

### 1. Cell & Surface Architecture v0.1

Reason: The concept is central and repeatedly referenced, but no clean standalone repo artifact was found.

Suggested home:

`rio-system/docs/architecture/cell-and-surface-architecture-v0.1.md`

Boundary:

Architecture candidate only. No runtime claim.

### 2. ONE MVP Charter v0.1

Reason: The thread ended with a clear build priority: one governed turn that proves the OS wants to exist.

Suggested home:

`rio-proxy/docs/implementation/one-mvp-charter-v0.1.md`

Boundary:

Implementation charter only. Not proof of working runtime.

### 3. Agent Safety Cell MVP v0.1

Reason: Agent Safety Cell was identified as the first cell candidate.

Suggested home:

`rio-proxy/docs/implementation/agent-safety-cell-mvp-v0.1.md`

Boundary:

Build plan / test plan only until implemented.

### 4. Portable Human-Sovereignty Runtime Crosswalk

Reason: Sovereign Turn Matrix already exists, but the portable runtime framing may need a bridge file.

Suggested home:

`rio-system/docs/architecture/portable-human-sovereignty-runtime-crosswalk-v0.1.md`

Boundary:

Crosswalk only; do not duplicate the matrix.

### 5. Topology Register Placement Note

Reason: Topology Register is internally important but needs private/public boundary discipline.

Suggested home:

`rio-system/docs/architecture/topology-register-placement-note-v0.1.md`

Boundary:

Internal formation witness only. Symbolic layer is witnessed, not imposed.

## Build Direction Preserved

Current build priority from the thread:

> Do not build the whole ONE operating system first. Build one governed turn that proves the OS wants to exist.

First MVP candidate:

- Cockpit
- Cell Registry
- Personal Constitution
- Proposal Packet
- RIO adapter
- Receipt viewer
- one safe connector

Suggested first cell:

- Agent Safety Cell

Suggested first connector/action:

- GitHub issue creation

Suggested first governed turn:

1. Human asks to create an issue for Cell & Surface Architecture review.
2. Bondi/Scribe creates proposal packet.
3. RIO evaluates admissibility.
4. Human approves.
5. Sentinel checks exact match.
6. GitHub issue is created.
7. MUS receipt is issued.
8. Ledger/Chronicle store proof.
9. ONE shows state surface and receipt side-by-side.

## Current Safe Summary

Already in GitHub:

- ONE Cell Runtime & Ecosystem Map
- Repo Estate & Runtime Placement Update
- Personal ONE Cell intake
- Lineage & Doctrine Lock
- Sovereign Turn Matrix
- Mode Orientation Packet
- B-Rass Interaction Calibration
- Pattern Atlas material
- Agent Safety Cell as draft concept

Still needing migration or standalone treatment:

- Cell & Surface Architecture
- Portable Human-Sovereignty Runtime standalone framing
- Topology Register
- ONE MVP Charter
- Agent Safety Cell MVP build artifact
- Cell Registry / one-runtime decision

Final keeper:

> The repo already holds the seed. The migration task is to stop losing the branches, not to replant the tree.
