---
type: handoff
state: reconciliation_candidate
claim_level: repo_docs_reconciliation
authority: Brian Rasmussen
source: Internal Canonical v0.1
runtime_status: not_active
---

# Repo Reconciliation — Internal Canonical v0.1

## Purpose

This handoff reconciles the approved ONE/RIO/MUSS Internal Canonical v0.1 with the current repository state using a narrow docs-only pass.

The goal is to align the repo shelf before adding new architecture material. This file records what was inspected, what already exists, what is missing from the expected architecture-spine packet, and what should remain deferred until Brian approves the next packet.

This handoff transfers context only. It does not transfer authority, authorize runtime behavior, or promote any implementation claim.

## Files Inspected

Codex inspected these files directly during this reconciliation pass:

| File | Receipt |
|---|---|
| `AGENTS.md` | Present and read. |
| `profiles/brian-profile-v0.1.json` | Present, read, and parsed. |
| `schemas/sovereign-interaction-profile.schema.json` | Present, read, and parsed. |
| `README.md` | Present and read. |
| `docs/OVERVIEW.md` | Present and read as the current docs overview. |
| `docs/ARCHITECTURE.md` | Present and read as a system architecture overview. |
| `docs/SOURCE_MAP.md` | Present and read as the current navigation/status index. |
| `docs/ONE_RIO_MUSS_MODULE_MAP.md` | Present and read as current ONE/RIO/MUSS module mapping. |
| `docs/architecture/one-architecture-migration-index-v0.1.md` | Present and read as migration/placement index material. |
| `docs/architecture/constitutional-grammar-plane-v0.1.md` | Present and read as architecture context. |
| `docs/architecture/cross-stack-mapping-v0.1.md` | Present and read as architecture context. |
| `docs/architecture/tier1-triadic-registers-v0.1.md` | Present and read as architecture context. |
| `docs/method/master-runtime-method-v0.1.md` | Present and read as method-stack candidate material. |
| `docs/protocols/portable-governance-protocol-stack-v0.1.md` | Present and read as active protocol/spec bridge source-of-truth material. |
| `docs/protocols/bondi-mantis-translational-layer-v0.2.md` | Present and read as active Bondi/MANTIS companion source-of-truth material. |
| `docs/protocols/semantic-crossing-governance-addendum-v0.1.md` | Present and read as semantic-crossing candidate material requiring careful register separation. |
| `docs/engines/engine-stack-v0.1.md` | Present and read as engine-stack material. |
| `docs/engines/rio-engine-v0.1.md` | Present and read as RIO engine material. |
| `docs/engines/muss-engine-v0.1.md` | Present and read as MUS engine material. |
| `docs/governance/RIO_Control_Plane_Boundary_v1_0.md` | Present and read as RIO control-plane boundary material. |
| `docs/governance/RIO_Fiduciary_Invariants_v1_0.md` | Present and read as RIO fiduciary invariants material. |
| `docs/boundaries/pattern-source-boundary-v0.1.md` | Present and read as pattern-source boundary material. |
| `RIO-CONSTITUTION.md` | Present and read as the current constitutional authority document. |
| `SYSTEM_RUNTIME_MAP.md` | Present and read as the current runtime/status map. |
| `SYSTEM-LAYERS.md` | Present and read as the current layer/status map. |
| `KNOWN_ISSUES.md` | Present and read as current ledger/state caveat material. |
| `protocols/rio-cs-03-authorization.md` | Present and read as authorization-boundary material. |
| `protocols/rio-cs-04-execution-boundary.md` | Present and read as execution-boundary material. |
| `protocols/rio-cs-05-receipt-ledger.md` | Present and read as receipt/ledger material. |
| `gateway/README.md` | Present and read as the gateway runtime map. |
| `gateway/spgm/GOVERN_REQUEST_BRIDGE.md` | Present and read as SPG-M/RIO govern bridge material. |
| `gateway/spgm/POLICY_CONTEXT_BRIDGE.md` | Present and read as SPG-M policy-context boundary material. |
| `gateway/spgm/API_V1_GOVERN_BRIDGE.md` | Present and read as API v1 govern bridge material. |
| `gateway/spgm/CI_VERIFICATION.md` | Present and read as CI verification boundary material. |

The integration packet requested inspection of these exact paths; their current status is:

| Requested file | Status |
|---|---|
| `README.md` | Present and inspected. |
| `docs/repo-state-map-v0.1.md` | Missing; not invented. |
| `docs/00_index/architecture_index_v0_1.md` | Missing; not invented. |
| `docs/00_index/status_register_v0_1.md` | Missing; not invented. |
| `docs/handoffs/handoff-template-v0.1.md` | Missing; not invented. |
| `docs/handoffs/bondi-to-manny-architecture-repo-handoff-v0.1.md` | Missing; not invented. |
| `docs/specs/LANGUAGE_CROSSING_CLASSIFIER_v0_1.md` | Missing; not invented. |
| `docs/specs/rio-to-sentinel-handoff-trace-v0.1.md` | Missing; not invented. |
| `docs/proof/receipt-types.md` | Missing; not invented. |
| `docs/enterprise/email-policy-guard-receipt-backed-communication-gate-v0.1.md` | Missing; not invented. |
| `docs/architecture/dual-return-governed-intelligence-architecture-v0.1.md` | Missing; not invented. |
| `docs/architecture/muss-custody-container-v0.1.md` | Missing; not invented. |

## Current Repo Findings

The checked-out repository is not an empty architecture-spine repo. It currently reads as an active RIO system repository with runtime, gateway, protocol, compliance, receipt, and SPG-M bridge material.

Current findings:

- `README.md` presents the repo as an active RIO gateway runtime and identifies the runtime pipeline, SPG-M integration, key runtime docs, verification commands, and related repositories.
- `RIO-CONSTITUTION.md` already preserves the core separation model: AI proposes, RIO governs, human approves, system executes, receipts record, ledger proves, and verification audits.
- `SYSTEM_RUNTIME_MAP.md` identifies implemented gateway surfaces, SPG-M bridge status, current verification paths, known gaps, and canonical runtime reading order.
- `SYSTEM-LAYERS.md` separates standards, infrastructure, skills, and systems. This is compatible with the Internal Canonical v0.1 requirement that authority, operation, proof, memory, and learning remain separated.
- `protocols/` contains existing authorization, execution-boundary, and receipt-ledger protocol material that should be cross-referenced before adding new proof or execution docs.
- `gateway/` contains executable runtime code and gateway documentation. This reconciliation PR intentionally does not modify that code.
- `gateway/spgm/` contains non-executing SPG-M intake/review/govern bridge documentation. These docs already state that SPG-M metadata may increase review requirements but may not create authority, tokens, execution, receipts, or memory.
- `docs/SOURCE_MAP.md` already functions as a navigation and status index for current ONE/RIO/MUSS source artifacts. It should be cross-referenced before creating a parallel `docs/00_index/` hierarchy.
- `docs/architecture/one-architecture-migration-index-v0.1.md` already records migration/placement status and should be used before creating duplicate architecture-spine inventory.
- `docs/protocols/portable-governance-protocol-stack-v0.1.md` and `docs/protocols/bondi-mantis-translational-layer-v0.2.md` already cover much of the internal canon's repo-safe protocol, method, role-boundary, register-separation, and promotion discipline.
- `docs/OVERVIEW.md`, `docs/ARCHITECTURE.md`, and `docs/ONE_RIO_MUSS_MODULE_MAP.md` exist as overview/module mapping material, but they are not exact replacements for the requested architecture index, status register, language crossing classifier, or proof receipt-type docs named in the integration packet.
- Some candidate/formation docs contain register-specific language that should remain staged or be human-reviewed before promotion into repo-facing canonical architecture language.
- `KNOWN_ISSUES.md` records current ledger caveats and preserves development history instead of rewriting it.

## Reconciliation Map

| Existing file | Treatment | Reason |
|---|---|---|
| `README.md` | Cross-reference | Keep as runtime entrypoint; add only a small pointer to this reconciliation receipt. |
| `docs/OVERVIEW.md` | Keep | Serves as a current high-level overview, not a replacement for the requested architecture index. |
| `docs/SOURCE_MAP.md` | Update index | Current repo navigation/status index; add this reconciliation receipt and Internal Canonical v0.1 alignment reference. |
| `docs/ONE_RIO_MUSS_MODULE_MAP.md` | Cross-reference | Current module map should be reconciled before adding new role-boundary docs. |
| `docs/architecture/one-architecture-migration-index-v0.1.md` | Cross-reference | Existing migration/placement index should guide any later architecture-spine migration. |
| `docs/protocols/portable-governance-protocol-stack-v0.1.md` | Cross-reference | Active source-of-truth material for protocol/spec bridge; covers many governance and promotion invariants. |
| `docs/protocols/bondi-mantis-translational-layer-v0.2.md` | Cross-reference | Active companion source-of-truth for Bondi/MANTIS role boundaries. |
| `docs/protocols/semantic-crossing-governance-addendum-v0.1.md` | Leave staged | Candidate material; preserve for review without promoting register-specific language into public/runtime claims. |
| `RIO-CONSTITUTION.md` | Cross-reference | Already states the central authority separation model and should remain the constitutional anchor unless Brian approves amendments. |
| `SYSTEM_RUNTIME_MAP.md` | Cross-reference | Already distinguishes implemented runtime surfaces from known gaps and should not be overwritten by architecture-canon text. |
| `SYSTEM-LAYERS.md` | Cross-reference | Already separates standards, infrastructure, skills, and systems in a repo-safe way. |
| `KNOWN_ISSUES.md` | Keep | Preserves ledger caveats and development history; no reconciliation edits needed. |
| `protocols/rio-cs-03-authorization.md` | Cross-reference | Covers authorization tokens and the no-execution-without-token invariant. |
| `protocols/rio-cs-04-execution-boundary.md` | Cross-reference | Covers execution boundary constraints and should be used before deriving runtime changes. |
| `protocols/rio-cs-05-receipt-ledger.md` | Cross-reference | Covers receipt and ledger proof material already present in the repo. |
| `gateway/README.md` | Keep | Runtime-local entrypoint; no docs-only reconciliation change required. |
| `gateway/spgm/GOVERN_REQUEST_BRIDGE.md` | Cross-reference | Existing SPG-M-to-RIO bridge boundary aligns with the non-authorizing pattern-signal rule. |
| `gateway/spgm/POLICY_CONTEXT_BRIDGE.md` | Cross-reference | Existing policy-context boundary aligns with capability-is-not-permission and proof-is-not-authority. |
| `gateway/spgm/API_V1_GOVERN_BRIDGE.md` | Cross-reference | Existing API v1 bridge documentation preserves conservative governance behavior. |
| `gateway/spgm/CI_VERIFICATION.md` | Keep | Verification boundary material; no runtime claim added by this pass. |
| `docs/repo-state-map-v0.1.md` | Derive later | Requested path is missing; creating a full state map would exceed this narrow handoff unless Brian approves the next docs packet. |
| `docs/00_index/architecture_index_v0_1.md` | Derive later | Requested path is missing; should be created as a dedicated index/status PR if desired. |
| `docs/00_index/status_register_v0_1.md` | Derive later | Requested path is missing; should be created with repo status taxonomy instead of inferred ad hoc. |
| `docs/specs/LANGUAGE_CROSSING_CLASSIFIER_v0_1.md` | Human review needed | Requested path is missing; define scope before adding language-crossing classifier material to this runtime repo. |
| `docs/proof/receipt-types.md` | Derive later | Requested path is missing; existing receipt-ledger protocol should be reconciled first to avoid duplicate proof taxonomy. |
| `docs/enterprise/email-policy-guard-receipt-backed-communication-gate-v0.1.md` | Human review needed | Requested path is missing; enterprise/email product lane should not be introduced in this reconciliation PR. |
| `docs/architecture/dual-return-governed-intelligence-architecture-v0.1.md` | Human review needed | Requested path is missing; create only after deciding whether this repo should hold architecture-canon docs or link to a separate architecture repo. |
| `docs/architecture/muss-custody-container-v0.1.md` | Human review needed | Requested path is missing; MUS custody architecture should not be invented without the canonical source text. |

## Recommended Minimal Changes

This PR makes only these docs changes:

1. Adds this reconciliation handoff receipt at `docs/handoffs/repo-reconciliation-internal-canonical-v0.1.md`.
2. Updates `docs/SOURCE_MAP.md` with an Internal Canonical v0.1 alignment section and a pointer to this reconciliation receipt.
3. Adds a small README pointer to the reconciliation receipt so the repo shelf has a visible handoff marker.

No runtime files, executable code, schemas, tests, gateways, connectors, auth flows, payment flows, email behavior, or deployment configuration are changed.

## Deferred Work

Deferred until Brian approves a next PR:

- Decide whether `docs/SOURCE_MAP.md` is the repo-state map/status index for this repository, or whether a separate `docs/repo-state-map-v0.1.md` should be derived from it.
- Decide whether `docs/architecture/one-architecture-migration-index-v0.1.md` satisfies the architecture-index function, or whether `docs/00_index/architecture_index_v0_1.md` and `docs/00_index/status_register_v0_1.md` should be created as compatibility aliases or separate artifacts.
- Decide whether the requested architecture-spine paths belong in this runtime repo, in `one-rio-muss-architecture`, or as cross-references to another private architecture repository.
- Reconcile receipt taxonomy by comparing `protocols/rio-cs-05-receipt-ledger.md`, gateway receipt code, compliance schemas, and any canonical MUS receipt definitions.
- Define the RIO Proposal Packet / crossing object only after this reconciliation is reviewed.
- Review whether README runtime claims should remain as-is, be narrowed, or be split between runtime status and architecture status.

## Non-Claims

This PR does not claim:

- runtime implementation of Internal Canonical v0.1;
- production readiness;
- public release readiness;
- compliance certification;
- customer deployment;
- live connector behavior;
- autonomous agent authority;
- model personhood or machine sovereignty;
- that proof creates permission;
- that memory creates authority;
- that SPG-M, MANTIS, MUS, Ledger, Chronicle, Sentinel, Genesis, Zeus, Machine One, or Bondi can authorize consequential action;
- that any missing architecture-spine file was inspected.

## Questions for Brian

1. Should this repository become the architecture-spine repo named in the integration packet, or should it remain the active `rio-system` runtime repo with architecture references only?
2. Should the missing `docs/00_index/` and `docs/repo-state-map-v0.1.md` files be created in the next PR, or should the repo point to a separate private architecture repository?
3. Should the README's active-runtime language be preserved as the root framing, or split into separate runtime-status and architecture-status sections?
4. Should the next packet define the RIO Proposal Packet / crossing object, or first establish the architecture index and status register?

## Keeper

Reconciliation is not expansion. It aligns the shelf before the builder moves.

Reconcile before expanding. Index before building. Docs before schemas. Schemas before tests. Tests before runtime.
