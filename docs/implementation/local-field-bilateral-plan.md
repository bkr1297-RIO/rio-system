# Local Field bilateral completion implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. The supplied controlling packet and explicit instruction to continue supersede additional design/plan approval pauses.

**Goal:** Complete the existing bounded Local Field runtime against the exact 19 A–S gates and 14 verification cases.

**Architecture:** Extend gateway/local-field with source-controlled dispatch and independent Return admission using the same canonical authority/policy, LocalStore, signatures and native receipt owners. Preserve independent node custody and an immutable versioned envelope. Record current execution authority separately from fidelity immediately before the existing real filesystem effect.

**Tech Stack:** Node 24, SQLite, Ed25519, native five-hash receipts, loopback HTTP.

**Spec:** docs/implementation/ONE-LOCAL-FIELD-v0.1-COMPLETE-BUILD-PACKET.md (exact retrieved version 2).

## Global constraints

- No merge, deploy, publish, release or canonize; development identities only.
- R-07 GAP / architecture #322; adjacent R-02, R-12, R-13, R-20. Bounded evidence does not close the wider estate route.
- Exactly 19 binary A–S gates and 14 engineering cases; Test It remains post-build EVIDENCE_ONLY.
- Reuse candidate lineage explicitly; do not modify unrelated candidates or a protected default branch.
- Linux create-only flat private artifact sandbox; no whole-machine egress containment or replicated authority claim.

## Review focus

- Untrusted Return bundles, contradictory native receipt contents and signed held paths must not acquire truth, evidence, settlement or authority.
- Delayed requests, expired/revoked nodes and concurrent/replayed dispatch must fail closed without replaying effects.
- HTTP redirects, peer configuration substitution and response-size abuse must not expand the loopback dispatch boundary.
- Restart across an unfinished dispatch must preserve residue, never regenerate execution permission.
- Unknown envelope versions/extensions must not bypass either node's independent decision.

### Task 1: Separate point-of-use authority from fidelity

**Files:** gateway/local-field/index.mjs; gateway/tests/local-field-bilateral.test.mjs.

**Interfaces:** Consumes LocalField.admit/execute/inspect; produces inspect(id).execution_authority as a durable result distinct from decision and fidelity, also exposed in status and native execution artifacts.

- [ ] Write tests asserting a successful effect has distinct ingress, current-authority and fidelity identifiers; post-admission revocation records DENIED current authority and no attempt/effect.
- [ ] Run `node --test gateway/tests/local-field-bilateral.test.mjs`; Expected: FAIL on missing execution-authority result.
- [ ] Extend existing pre-effect transaction; separately persist failed authority decisions outside the rolled-back effect transaction. Evaluate the immutable admitted action for current authority, then check submitted action fidelity; do not authorize a mutated request.
- [ ] Run `node --test gateway/tests/local-field*.test.mjs`; Expected: PASS, all existing cases preserved.
- [ ] Commit runtime and tests.

### Task 2: Controlled bilateral transport and typed Return ingress

**Files:** gateway/local-field/index.mjs; gateway/local-field/bilateral.mjs; gateway/local-field/http.mjs; gateway/local-field/cli.mjs; gateway/tests/local-field-bilateral.test.mjs.

**Interfaces:** Consumes Task 1 records. Produces LocalField.dispatch(signedPassage) asynchronously over configured loopback peers; receive(signedTransit) returns native chain; admitReturn(chain) independently records attributed Return, evidence NOT_ADMITTED and settlement UNSETTLED. Outgoing intent, egress decision, transit and Return ingress persisted in the existing LocalStore.

- [ ] Write real two-node tests: no grant => no emitted traffic; A egress cannot replace B authority; B requires signed controlled transit for bilateral profile; Return tampering/correlation/replay rejected; successful Return remains non-authoritative and unsettled; version/extension rejected; pending restart no retransmit.
- [ ] Run new tests; Expected: FAIL on missing bilateral APIs/records.
- [ ] Add optional pinned `local-field-bilateral-v0.1` root-defined profile. Keep predecessor APIs compatible only on predecessor profiles. Source node owns only its private key. Strict loopback configured peer routes, no redirects; peer-signed native proofs verified against local membership, correlation and persisted immutable origin.
- [ ] Run all Local Field tests; Expected: PASS.
- [ ] Commit runtime, tests and usage contract.

### Task 3: Real process acceptance and portable owner contracts

**Files:** gateway/scripts/run-local-field-bilateral-acceptance.mjs; gateway/package.json; rio-protocol/spec/local-field-v0.1.md and schemas; architecture docs/architecture/local-field build/runtime/Return maps; runtime docs/evidence/one-local-field-v0.1/bilateral-2026-09-30/.

**Interfaces:** Consumes Task 2 dispatch and signed root query; produces persisted real A→B→A trace, shutdown/restart reconstruction, 19-gate machine acceptance and explicit cross-repository lineage.

- [ ] Add driver test demanding two different service PIDs/custody roots, actual controlled dispatch, readback, native proof, Return admission, restart and cleanup; run RED before adding driver.
- [ ] Implement development-only driver with exact temp-root cleanup and public evidence export; schemas validate actual records, not expected simulation.
- [ ] Run driver, portable schemas, relevant Local Field/Open Arrow/Projection tests and bare project suites. Expected: new/relevant suites PASS; any pre-existing failure matched to unchanged baseline and named explicitly.
- [ ] Run fresh whole-branch review once; fix Important/Critical findings RED→GREEN and full relevant suite.
- [ ] Commit changed owner repositories, open draft PRs with exact predecessor pins/dependencies, verify no merge, and Return all 19 gate results. Expected: coherent reviewable commits and draft PRs only.
