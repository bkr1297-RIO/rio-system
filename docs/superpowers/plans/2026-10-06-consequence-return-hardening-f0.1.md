# Consequence / Return Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Prove the permission/attempt/occurrence/outcome/Return/settlement and revocation boundaries through one existing native path.
**Architecture:** An opt-in account owner alongside LocalField invokes only existing signed operations. Nominal runtime-issued records prohibit structural conversion; an independent projection carries claim references and control limits. Evidence admission is a bounded descriptor-readback policy, not constitutional Evidence standing.
**Tech Stack:** Node 24 ESM, native SQLite, existing Ed25519 and LocalField, no new dependency.
**Spec:** docs/implementation/consequence-return-hardening/SPEC.md

## Global Constraints
- Frozen architecture unchanged; below-cut candidate evidence only.
- Native authority revalidation remains the sole release owner.
- No autonomous execution, remediation or notifications.
- Fixture irreversibility means no compensation through this control, not a physical impossibility proof.
- Exact base: #208 head 5df28c0e4262616bf560787a3a365583370351da. Sibling of meteorology.

## Review Focus
- Foreign/copied artifacts must not be accepted as issued capabilities.
- Old evidence cannot establish substituted effects or future authorization.
- Missing or mismatched readback must retain UNKNOWN, not failure inferred from absence.
- Revocation scope cannot silently extend to other executors or physical cessation.
- Rendered claims must retain lineage and escape all displayed values.

### Task 1: Native lifecycle account and tests
**Files:** gateway/local-field/consequence/{account.mjs,types.d.ts}; gateway/tests/consequence-return-hardening/lifecycle.test.mjs
**Interfaces:** Consumes native signed candidate, commitment, invocation and observation requests. Produces ConsequenceSpecimen with admit/commit/invoke/observe/admitEvidence/assessOutcome/composeReturn/revoke/acknowledge/snapshot operations; issued records remain distinct.
- [x] Write failing tests for ADMIT zero effect, explicit crossing burdens, foreign records, partition UNKNOWN, complete Return with unresolved outcome, successful effect/failed objective, native revocation and independent assay coordinates.
- [x] Run node --test gateway/tests/consequence-return-hardening/lifecycle.test.mjs. Expected FAIL missing module.
- [x] Implement opaque immutable records with native binding validation and explicit evidence/objective/reporting burdens.
- [x] Run the task tests. Expected all pass; commit implementation and tests.

### Task 2: Truthful compact projection and hostile fixture runner
**Files:** gateway/local-field/consequence/projection.mjs; gateway/scripts/run-consequence-return-hardening.mjs; gateway/tests/consequence-return-hardening/projection.test.mjs; gateway/package.json; .github/workflows/consequence-return-hardening.yml
**Interfaces:** Consumes issued account snapshot; produces separate display claims with artifact refs, rendered HTML and machine fixture evidence.
- [x] Write failing tests for all justified statuses, no blanket stopped/undo, exact claim reconstruction, escaping and rejecting forged snapshots.
- [x] Run projection tests. Expected FAIL missing module.
- [x] Implement four fixture exports and explicit pull runner. No auto invocation or live integration.
- [x] Run all new tests and runner. Expected pass with four exported fixture accounts; commit.

### Task 3: Conformance Return and review
**Files:** docs/implementation/consequence-return-hardening/{BUILD-REPORT.md,REVIEW.md}; docs/evidence/consequence-return-hardening-f0.1/*
**Interfaces:** Consumes test logs and actual fixture artifacts. Produces A–N build evidence and comparative morphology note.
- [x] Run inherited 271-test scope plus new tests with ONE_REFERENCE_ROOT configured. Expected pass; report wider pre-existing setup gaps separately.
- [x] Fresh read-only whole-branch review; fix Critical/Important once with observed RED→GREEN. No second review claim.
- [x] Export final evidence, hashes, type verification and exact claim ceiling; commit and prepare candidate draft handoff.
