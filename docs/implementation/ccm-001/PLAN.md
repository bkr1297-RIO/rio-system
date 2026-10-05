# CCM-001 Implementation Plan

> **For agentic workers:** Execute inline using superpowers:executing-plans and test-driven-development. The supplied build packet is the approved spec.

**Goal:** Implement the bounded CCM-001 interval medium in the existing LocalField runtime.
**Architecture:** A root-pinned optional LocalField profile shares LocalStore, canonical hashing, current grant resolution, native RIO and native execution/Return. The medium indexes independently constituted intervals and records attributable transitions; it creates no authority root, receipt system, MANTIS owner, settlement owner or successor installer.
**Tech stack:** Existing Node 24 ES modules, node:sqlite LocalStore, existing Ed25519 and canonical hashing. No dependency additions.
**Spec:** BUILD-SPEC-F0.1.md plus Cross-Boundary Relation Preservation and network-position hostile control.

## Global constraints

- No merge, deployment, canonization or historical rewrite. One candidate branch stacked on system #206.
- Preserve independent outbound/inbound disposition; Return arrival does not install orientation or HOME state.
- Root-attributed inbound judgment is a bounded supplied SourcePoint disposition, not independent MANTIS truth verification.
- All standing mutations bind exact interval, predecessor, dependencies and native signed SourcePoint warrant.
- S1: 10/100; S2: 100/10,000; S3: 1,000/100,000. Parallel intervals per endpoint pair remain distinct.
- Differentiation does not cancel relation. Cross-interval information requires explicit source/target passage; it never transfers standing.

## Review focus

- Restart from tampered event/source/index data: refuse corruption; regenerate indexes from ledger events.
- Duplicate/out-of-order commands and stale predecessors: no unrelated or duplicate mutation.
- Equal payloads/shared endpoints/high graph centrality: no authority inference.
- Invalid observation or arriving Return: cannot promote evidence or orientation.
- Concurrent writers and dependency changes: serialized ledger mutation and current authority recheck.

### Task 1: Types and ledger-backed interval/query core
Files: gateway/local-field/medium/{types,index}.mjs; gateway/tests/ccm-001/{helpers,medium.test}.mjs; narrow LocalField profile wiring.
Interfaces: LocalField.ccmCommand(signedRootRecord), LocalField.ccmQuery(query,...args). Query names mirror the packet.
- [x] Write missing-profile/interval/query/history tests; observe missing API failures.
- [x] Implement root-native verification callback, bounded exact runtime types, existing LocalStore events and derived interval indexes.
- [x] Verify identity, parallel intervals, deterministic absent/unknown, predecessor, replay, restart and tamper refusal.

### Task 2: Crossing, current standing and Return independence
Files: medium/index.mjs and LocalField.#request profile guard; medium.test.mjs.
Interfaces: root-pinned passage binding; native LocalField.receive executes unchanged guarded adapter; typed Return capture; explicit SourcePoint orientation judgment.
- [x] Write H-01..H-12 and centrality/cross-boundary controls first and observe missing behavior.
- [x] Preserve native current grant/policy/fidelity checks and existing native proof verification.
- [x] Implement explicit cross-interval passage without authority propagation; separately qualify inbound claims.
- [x] Verify all four double-arrow quadrants, actual file effect, Return arrival and bounded external observation.

### Task 3: Scale, concurrency and examples
Files: gateway/scripts/run-ccm-001.mjs; tests/ccm-001/{scale,concurrency}.test.mjs; package scripts; optional scoped CI.
- [x] Verify durable serialized writes, stale dependency rechecks and reconstructable view generation.
- [x] Implement S1/S2/S3 harness using exact root-signed batched constitution; each batch bounds every record and does not grant execution standing.
- [x] Measure real timings/storage and run hostile controls against each populated stage; produce query/crossing/lineage/double-arrow examples.

### Task 4: Review, conformance and Return
Files: docs/implementation/ccm-001/{CONFORMANCE,OPEN_ISSUES,RETURN,OWNER-MAP}.md and docs/evidence/ccm-001/*.
- [x] Run new suite and existing LocalField/SI/execution-binding suites; record default service-dependent suite failures.
- [x] Run a fresh whole-branch review; fix consequential defects with reproductions.
- [x] Return exact code pins, benchmark results, changed files, raw outputs, routing and claim ceiling; coherent commits and draft PR only.
