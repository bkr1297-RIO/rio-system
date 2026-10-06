# ICA-RR-001 Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Inline implementation; one fresh final reviewer.

**Goal:** Complete the missing bounded contracts in the existing Observatory Research Return specimen.

**Architecture:** Preserve native authority owners. Add opaque Research contracts and a pure history comparison, then connect typed Return/residue/attention to the existing journey and human surface.

**Tech Stack:** Node 24 native SQLite, existing Ed25519 signing and authenticated HTML forms; no new runtime dependencies.

**Spec:** `docs/implementation/ica-rr-001/RECONCILIATION-SPEC.md`

## Global Constraints

- One existing Observatory → Research → Return journey; Calendar/Git only.
- Frozen identity, constitutional owners and the Constitutional Minimum are unchanged.
- Synthetic timing history, no live-source or forecast-accuracy claim.
- Successful transformation supplies no standing; no merge, deployment or automatic successor mutation.
- Actual human/browser acceptance remains open.

## Review Focus

- A serialized contract or foreign journey must not grant dispatch rights.
- Replacing an inhabitant must invalidate its old delegation without deleting its history.
- A dependency lost after permission must stop the relevant dispatch and explain clearance.
- Moving residue must not delete it, rewrite lineage or alter authority.
- Research findings must not inherit truth from note-byte readback.

### Task 1: Research contracts and explicit dispatch

**Files:** Create `gateway/local-field/ica/research.mjs`, `dispatch.mjs`, `contracts.d.ts`; create `gateway/tests/ica-rr-001/research-contracts.test.mjs`.

**Interfaces:** Produce `investigate(readings, delegation)` and `ResearchDispatch(workspace, account)` with `warrant`, `lease`, `invoke`; findings remain qualified data, dispatch contracts owner-issued capabilities.

- [ ] Write tests: two frame comparison has two ESTABLISHED findings and one UNKNOWN recurrence; foreign source/extra raw fields rejected; copied warrant/lease and wrong office/inhabitant/subject/target rejected without native attempt.
- [ ] Run `node --test gateway/tests/ica-rr-001/research-contracts.test.mjs`; expected RED for missing contracts.
- [ ] Implement pure comparison and native commitment adapter with closed contract fields, single-use, expiry, revocation and current delegation checks.
- [ ] Run the contract suite; expected all PASS. Commit the deliverable.

### Task 2: Journey, honest Research Return and residue

**Files:** Modify `journey.mjs`, `workspace.mjs`, `source-replay.mjs`; create `residue.mjs`; create `reconciliation.test.mjs`.

**Interfaces:** Existing `ICAJourney.dispatch` remains closed revisioned human commands. Add `research`, `research_return`, `perimeter`, `lumen` to the owned view. Add declared fixtures for A–G. Keep native Return inspectable separately.

- [ ] Write A–G real-boundary tests plus expiry, replacement, foreign-context, residue retention and attention/native-state equality tests.
- [ ] Run `node --test gateway/tests/ica-rr-001/reconciliation.test.mjs`; expected RED because view/contracts/fixtures are missing.
- [ ] Integrate Task 1; implement typed append-only residue and scoped relevance, revocation Return, source-frame contradiction and fresh replacement delegation.
- [ ] Run both new suites and existing ICA suites; expected PASS. Commit the deliverable.

### Task 3: Human surface, evidence and publication

**Files:** Modify `surface.mjs`, CLI fixture validation, evidence exporter and workflow; create reconciliation surface tests, report and captured evidence.

**Interfaces:** Existing authenticated native forms expose only legal actions; optional details carry machine basis. Perimeter and LUMEN never issue authorization.

- [ ] Write native form journeys asserting visible research findings, uncertainty, attention changes, fixture-specific HOLD/DENY explanations and replacement lineage.
- [ ] Run surface tests; expected RED for absent human controls/claims.
- [ ] Render Research Return, Perimeter, LUMEN and inspection depth in the same page. Extend exporter with A–G captures.
- [ ] Run new and inherited suites, schema/type checks, protected-owner comparison, native-form captures and diff checks; record all gaps. Commit.
- [ ] Obtain one fresh read-only whole-change review. Fix Important/Critical findings in one RED→GREEN author pass; record any rulings/minors.
- [ ] Publish a separate draft stacked on exact #211 head with exact tree parity; verify GitHub checks, report outcomes and stop.
