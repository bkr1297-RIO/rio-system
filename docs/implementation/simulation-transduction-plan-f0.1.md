# Simulation Transduction F0.1 Implementation Plan

> For agentic workers: use superpowers:executing-plans. Execute this authorized slice inline; an independent whole-branch review follows implementation.

**Goal:** Carry bounded model-dependent possibilities through burden-preserving compression into existing RIO/native consequence/Return without authority accretion.
**Architecture:** Pure formation modules extend the existing relation area. Native LocalField guards bind a reviewed candidate at egress, ingress and point of use; existing grants, policy, tokens, adapter and receipt/Return remain the owners.
**Tech Stack:** Existing Node 24 ESM, native test runner, SQLite, Ed25519 and canonical hash machinery. No new dependency.
**Spec:** `docs/implementation/SIMULATION-TRANSDUCTION-BUILD-F0.1.md`.
**Baseline:** `b164cc8693ceab564c3f5b5c6ce5d3085ccc57dc`, clean `build/si-specimen-001`; continue the existing draft #206 to avoid a parallel branch family.

## Global constraints

- Exactly the six bounded artifacts in the spec; reuse constitutional infrastructure.
- Required K_d dimensions cannot be removed by a model or compression request.
- UNKNOWN / CONFLICTING never imply known equivalence or absent burden.
- All raw simulation artifacts and context must remain reconstructable.
- Formation review != action authority; a signed valid grant != execution.
- Native Return != evidence, settlement or HOME mutation.
- No assay, adaptive morphology, new runtime, UI, merge, deploy, publish or canonize.

## Review focus

- Tampered class membership or representative must be detected by recomputation before admission.
- A different context or reordered branch set must not silently change the meaning of an existing compression.
- Authority-looking generative content must never enter privileged constructors or bypass current grant checks.
- Review expiry/revocation/dependency drift after ingress must fail before any adapter effect.
- A receiver-signed Return must not replace the source's local candidate or contradict its prepared decision surface.

### Task 1: Typed formation and conservative compression

Files: add `gateway/local-field/relations/possibility.mjs`, `compression.mjs`; test `gateway/tests/si-specimen/possibility.test.mjs`; helper `gateway/tests/helpers/simulation.mjs`.
Interfaces: `DecisionContext(value)`, `SimulationArtifact(value)`, `compressPossibilities(context, artifacts)` returns immutable `CompressedPossibilitySet` with exact context/set/class hashes and raw member references.

- [x] Write tests for complete K_d, forbidden output types, missing information, all nine burden distinctions, unknown/conflict isolation, set-order invariance, provenance and bounded resources.
- [x] Run the focused tests; require the missing implementation assertion to fail.
- [x] Implement strict runtime validators and exact declared-burden partitioning using existing hash/immutable/type helpers.
- [x] Run the focused suite; expected all pass.

### Task 2: Pure transduction and native crossing guard

Files: add `relations/transduction.mjs`; extend `relations/index.mjs`, `relations/types.mjs`, `local-field/index.mjs`; test `si-specimen/transduction.test.mjs` and existing compiler tests.
Interfaces: `transducePossibilities({context,artifacts,compression,selected_class_id,human_review})` returns canonical candidate content. `guardSimulationCandidate(p,candidate,{anchor,field})` reconstructs and verifies the exact reviewed surface, then returns a non-authoritative binding for existing RIO records.

- [x] Write failing tests for loss/tampering, review substitution/expiry, missing real grant, claimed ADMIT, forbidden conversions and point-of-use refusals.
- [x] Implement the pure builder and narrow native hook; no new authority, signature or receipt system.
- [x] Verify current egress/ingress/execution decisions carry distinct recorded bindings and that Return recomputes against local formation material.
- [x] Run formation, compiler and native integration tests; expected all pass.

### Task 3: Real two-process specimen and Return

Files: extend existing `gateway/scripts/run-si-specimen-001.mjs` with explicit `--simulation` mode; existing process test, package scripts and CI; add bounded docs/evidence and implementation Return.
Interfaces: `node scripts/run-si-specimen-001.mjs OUTPUT --simulation` exports public native proof with declared simulation inputs separately identified.

- [x] Add and observe a failing process test for the new mode.
- [x] Reuse the existing two-process lifecycle, real create-only adapter, independent readback, signed receipt/Return, restart and key cleanup.
- [x] Run the full relevant suite and default gateway command; report every failure by name.
- [x] Validate native records with the unchanged protocol schema and independent receipt verifier.
- [x] Perform independent review; repair material findings with rejection tests.
- [x] Commit scoped changes, update existing draft PR, verify remote hashes/draft state, and return files, tests, evidence, reuse map, limits and disposition.

## Execution ledger

- Authorization: Brian's explicit go-ahead follows the agreed bounded six-artifact packet; no additional architecture or Class 3 action is inferred.
- Preflight: Task 1 validators feed Task 2 recomputation; Task 2 binding feeds Task 3 native trace. Same canonical hash owner throughout.
- Ruling: continue the existing isolated development checkout and draft branch. A new worktree or architecture branch adds no necessary isolation for this clean, dedicated workspace.
- Ruling: supplied possibilities are explicitly model-dependent declarations, not a newly built simulator. Acceptance observes real file creation; simulation correctness is outside this slice.
- Task 1: complete; 17/17 formation tests pass after observed missing-validator/compressor failures. Baseline 110/110 passed.
- Ruling: the native adapter's 4096-byte limit remains unchanged. The output report omits repeated member/provenance hash lists and binds the complete retained RIO surface by hash; every alternative burden remains visible. Oversized reports refuse, rather than increasing the adapter limit or silently dropping a burden.
- Ruling: an untrusted profile tag cannot select its own enforcement boundary. Reuse the existing root field/dependency owner to pin mandatory formation checks, including tag removal, profile activation and configuration revocation. This closes three observed red tests without adding an authority owner.
- Task 2: complete; 43/43 initial formation/compiler/integration cases passed; three additional pinned-boundary cases were observed failing before repair. Full integrated verification then passed 145/145, including the retained 110-case baseline and the new two-process mode.
- Task 3: implementation complete; observed missing simulation mode failure, then both Direct and simulation process specimens passed. Independent review and final validation are complete; public proof and Return are included in this packet.

- Review repair: two Important defects (optional candidate IDs and receiver-resealed contradictory receipt intent) and one Minor egress audit gap were independently reproduced. Their regression assertions failed for the actual issues, then passed after repairs in the existing native owners. An initial test fixture shape typo was corrected before observing the actual receipt-admission failure.
- Review repair: native Return admission/verification binds top-level and receipt intents exactly; optional-ID lookups preserve the existing contract; signed egress now retains the simulation binding. Independent repair review reports no remaining findings and passes all three focused regressions.
- Final verification: 147/147 required tests, zero failures/skips/cancellations. The actual regenerated two-process proof uses final implementation hash e4136f7934fb923ab4d80e951f6022314c5ffbc47eb394bc4faf5616de4763e3. Eight records validate against the unchanged protocol schema; the unchanged independent native receipt verifier returns valid, authorization_created false.
- Default command: npm test retains the same thirteen pre-existing localhost:4401 ECONNREFUSED cases; exact names match the previous delivery baseline and are recorded individually in verification.json. The user's bounded Return permits reporting non-blocking defects; this does not authorize unrelated gateway deployment or weaken a gate.
- Delivery ruling: the authorized disposition is the existing draft branch/PR, with no merge, deployment, publication or canonization. This overrides a generic finishing-skill integration menu; no new approval round or branch is required. This packet is delivered as a scoped commit; final remote hash/draft-state readback is reported by the builder.
