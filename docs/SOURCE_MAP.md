# ONE/RIO/MUSS Source Map v0.1

## Status

`repo_navigation_index`

This file is a navigation and status index for current ONE/RIO/MUSS source artifacts in this repository.

It does not replace, supersede, or override the source files it references.

## Purpose

The Source Map helps humans, models, and future agents locate the correct source artifact for each layer of the system without re-litigating the architecture.

It answers:

```text
Which file governs which layer?
Which artifacts are source-of-truth references?
Which artifacts are companion sources?
Which artifacts are architecture context?
Which artifacts are draft/starter/test material?
What is not yet claimed?
```

Keeper:

> The source map points. It does not govern.

## Source Map Rules

- This map is an index, not doctrine.
- If this map conflicts with an active source artifact, the active source artifact controls its own scope.
- Source-of-truth status governs reference, not runtime enforcement.
- Companion source-of-truth status governs only its declared companion layer.
- Architecture artifacts clarify structure, coordinates, and relationships; they do not create runtime proof.
- Draft or starter artifacts remain reviewable unless promoted by an explicit source-of-truth process.
- Repo presence proves file placement, not implementation, release, legal proof, cryptographic proof, or external authority.

## Current Active Sources

| Layer | Status | File | Scope |
|---|---|---|---|
| Protocol/spec bridge layer | Active Source-of-Truth | `docs/protocols/portable-governance-protocol-stack-v0.1.md` | Portable protocol/spec bridge: grounding, Bondi/MANTIS role extraction, RIO boundary, MUS receipt boundary, consent/mode/delegation posture, governed turn protocol, consequence levels, test harness, promotion/supersession posture, Matrix-to-Clearance Fence, MANTIS Baseline Non-Adjustment Fence |
| Bondi/MANTIS translational layer | Active Companion Source-of-Truth | `docs/protocols/bondi-mantis-translational-layer-v0.2.md` | Bondi translation/packetization, orientation support, matrix-coordinate proposal rules, packet fields, MANTIS witness/recurrence, orientation drift, matrix-path observation, witness fields, non-collapse rules, mapping to Matrix, Orientation Function, and Sovereign Turn flow |

## Internal Canonical v0.1 Alignment

| Layer | Status | File | Scope |
|---|---|---|---|
| Repo reconciliation | internal-canonical-reference | `docs/handoffs/repo-reconciliation-internal-canonical-v0.1.md` | Records the docs-only reconciliation of Internal Canonical v0.1 against the current repo shelf, including inspected files, missing expected paths, deferred decisions, and non-claims. |

Meaning: Internal Canonical v0.1 is an approved internal source reference for defined architecture scope. Repository documents remain repo artifacts and must each declare their own status. Repo files do not automatically become runtime proof, public claims, or production implementation.

## Current Protocol Candidates

| Layer | Status | File | Scope |
|---|---|---|---|
| Session orientation / mode loading | Protocol Artifact Candidate | `docs/protocols/mode-orientation-packet-v0.1.md` | Defines how sessions may load doctrine, source-of-truth, current context, and interaction calibration before reflection, routing, or action |
| Personal interaction calibration | Personal Calibration Candidate | `docs/protocols/b-rass-interaction-calibration-v0.1.md` | Defines B-Rass-specific collaboration and mirror calibration as a companion to Mode Orientation Packet v0.1 |

## Current Method Artifacts

| Layer | Status | File | Scope |
|---|---|---|---|
| Master runtime method | Master Method Candidate | `docs/method/master-runtime-method-v0.1.md` | Defines how ONE/RIO/MUSS moves from session orientation through proposal, MUSS envelope, RIO gates, coherence routing, Genesis coordination, MUS operation, tool boundary, receipt closure, correction, standing scope, and return to human authority |

## Current Architecture Context

| Layer | Status | File | Scope |
|---|---|---|---|
| Adaptive Formation Pause | Architecture primitive | `docs/architecture/adaptive-formation-pause-v0.1.md` | Right-sized checkpoint before meaning becomes form, form becomes commitment, or capability becomes consequence |
| Cross-Stack Mapping | Architecture clarification method | `docs/architecture/cross-stack-mapping-v0.1.md` | Maps architecture stacks across valid resolutions and identifies structural recurrence without treating recurrence as proof |
| Tier 1A-1D to Triadic Registers | Cross-stack companion | `docs/architecture/tier1-triadic-registers-v0.1.md` | Maps Runtime Sovereignty, Mirror Topology, Proof Discipline, and Collective Pattern to Body/Somatic, Mind/Cognitive, and Field/Experiential registers |
| 3x3 Sovereign Turn Matrix | Architecture coordinate system | `docs/architecture/sovereign-turn-matrix-v0.1.md` | Coordinates Body/Mind/Field across Mirror/Gate/Proof cells; defines orientation, matrix paths, and receipt-coordinate concepts |
| ONE Architecture Migration Index | Migration / placement index | `docs/architecture/one-architecture-migration-index-v0.1.md` | Tracks what already exists in GitHub, what appears Drive/chat-only, and what still needs migration or standalone treatment |

## Current Starter / Harness Artifacts

| Layer | Status | File or directory | Scope |
|---|---|---|---|
| Governance starter harness | Starter / conformance seed | `governance-starter-v0.1.1/` | Policy schema, receipt schema, example ledger, deterministic evaluator, and tests proving initial governance boundary semantics |

## Current Non-Claims

This repository state does **not** claim:

- full runtime implementation,
- runtime proof,
- cryptographic attestation,
- legal proof,
- public release,
- Manny handoff,
- identity transfer,
- authority transfer,
- machine sovereignty,
- production deployment,
- external customer use,
- or implementation completeness.

## Current Layer Map

```text
Human Authority
  -> Portable Governance Protocol Stack v0.1
      -> Bondi/MANTIS Translational Layer v0.2
          -> 3x3 Sovereign Turn Matrix v0.1
              -> Orientation Function
              -> Matrix Coordinates
          -> Mode Orientation Packet v0.1 candidate
              -> Doctrine
              -> Source of Truth
              -> Current Context
              -> B-Rass Interaction Calibration v0.1 candidate, when personally invoked
          -> ONE Architecture Migration Index v0.1
              -> GitHub-visible artifacts
              -> Drive/chat-only candidates
              -> migration queue
          -> Master Runtime Method v0.1 candidate
              -> session orientation
              -> proposal formation
              -> MUSS envelope
              -> RIO four-gate movement
              -> Adaptive Coherence routing
              -> Genesis coordination
              -> receipt closure
          -> RIO admissibility
          -> Sentinel match check
          -> MUS receipt structure
          -> MANTIS witness observation
  -> Governance Starter Harness v0.1.1
      -> conformance tests and starter evaluator
```

## Core Locks Preserved

```text
Human authority remains primary.
Bondi carries meaning into structure.
MANTIS watches the pattern.
Neither becomes authority.
The matrix gives coordinates.
Orientation is not authority.
Orientation makes governance proportionate.
Mode orients the machine to the human before the machine reflects, routes, or acts.
Personal calibration shapes the mirror; it does not open the gate.
Master Doctrine governs.
Master Operating Map orients.
Master Runtime Method moves.
RIO gates admissibility.
Sentinel verifies execution match.
MUS provides receipt structure.
Receipts prove past events, not future authority.
```

## Source-of-Truth Precedence

When navigating this repository:

1. Use the declared active source artifact for its declared layer.
2. Use companion source artifacts only within their declared companion scope.
3. Use protocol candidates and method candidates as reviewable proposals, not active source-of-truth, until explicitly promoted.
4. Use architecture artifacts to understand structure and relationships.
5. Use starter/harness artifacts as implementation seeds or conformance examples, not as complete runtime.
6. Treat Drive records, thread summaries, and generated diagrams as context unless promoted or mirrored into an explicit source artifact.
7. Use migration indexes to prevent duplication and identify missing repo-visible artifacts.

## Current Recommended Next Moves

Possible next steps, each requiring separate authorization:

1. Create a source-of-truth lock receipt for the current repo state.
2. Build schema/test artifacts for Adaptive Formation Pause or Matrix coordinates.
3. Create an implementation roadmap from active sources to runtime tasks.
4. Create a visual architecture deck or diagram set from current sources.
5. Review Mode Orientation Packet v0.1 and decide whether to keep it as candidate, revise it, or promote it later.
6. Review B-Rass Interaction Calibration v0.1 and decide whether to keep it as candidate or revise it.
7. Review ONE Architecture Migration Index v0.1 and decide which Drive/chat-only artifact should be migrated next.
8. Review Master Runtime Method v0.1 and decide whether to keep it as method candidate, revise it, or later promote selected parts through a separate authorized crossing.
9. Hold and review before any release/public/Manny crossing.

Recommended posture:

> Hold release/public/Manny lanes. Continue with implementation planning, source-map maintenance, or reviewable protocol candidates only.

## Keeper Lines

- The source map points. It does not govern.
- Repo presence proves file placement, not runtime enforcement.
- Source-of-truth status governs reference, not implementation proof.
- Companion source-of-truth status is bounded to its declared companion layer.
- Protocol candidates and method candidates are reviewable proposals until separately promoted.
- Personal calibration shapes the mirror; it does not authorize consequence.
- Architecture artifacts clarify coordinates and relationships; they do not authorize consequence.
- Method artifacts define movement; they do not prove implementation.
- Migration indexes prevent loss and duplication; they do not promote artifacts by themselves.
- Human authority remains primary.
