# ONE Local Field v0.1 Implementation Plan

> Execution: superpowers:executing-plans, inline implementation followed by one fresh whole-branch review.

Goal: a real differentiated-node passage through RIO, Sentinel, filesystem consequence, native receipt and durable Return.

Architecture: extend existing gateway security, policy, execution, receipt and ledger owners. Local Field coordinates these owners through transport-independent signed records and a loopback HTTP adapter.

Tech stack: gateway ES modules; Node 22.13+ local profile; native SQLite, Ed25519, HTTP and filesystem; existing gateway dependencies.

Spec: architecture repository `docs/architecture/local-field/ONE-LOCAL-FIELD-BUILD-SPEC-v0.1.md`; user gates A–P are controlling acceptance criteria.

## Global constraints

- Branch build/one-local-field-v0.1; draft PRs; no merge.
- SourcePoint identity is externally supplied and pinned; no runtime-generated human root.
- Model candidates have no authority. Enrollment has no delegated execution standing.
- Signed exact subject/action/target/payload/field/correlation; current lineage and dependencies checked at admission and execution.
- Native receipts and ledger owners reused. Receipt cannot change a prior decision.
- Real effect, read-back observation, persistent state and fresh-process reconstruction required.

## Review focus

Concurrent replay and ancestor grant consumption; control-message replay; root/key substitution on restart; crash between attempt and receipt; path traversal/symlink/overwrite. Tests below exercise each explicitly.

## Task 1: portable profile and owner reconciliation

Files: rio-protocol `spec/local-field-v0.1.md`, `schemas/local-field-v0.1.schema.json`; architecture three required maps; receipt protocol `spec/LOCAL_FIELD_RECEIPT_PROFILE_v0.1.md`.

- [x] Define field/enrollment/grant/candidate/passage/Return signed record profile and native schema mapping.
- [x] Validate schema and representative real runtime records with Draft 2020-12.

## Task 2: durable identities and lineage

Files: gateway/ledger/local-store.mjs, gateway/security/local-field-authority.mjs; tests/local-field.test.mjs.

Interface: LocalField({root, anchor, receiver, signingKey, definition}); control(signedRecord); candidate(signedRecord); admit(signedPassage); execute(passageId, signedPassage); status(); inspect(passageId); close(). Authority uses existing principal constants and Ed25519 functions. Store provides transactions and durable native ledger records.

- [x] Write failing cases for enrollment, invalid signatures, unknown nodes, absent standing, ancestor revocation, expiry, spent grants and root substitution.
- [x] Run tests and confirm expected failures.
- [x] Implement scoped signed controls, pinned field definition, registry, lineage and dependency checks.
- [x] Run tests and relevant existing gateway suites.

## Task 3: governed consequence and Return

Files: gateway/local-field/index.mjs, gateway/execution/filesystem-executor.mjs; extend native receipt/ledger owners where necessary.

- [x] Write failing cases 01–14 plus confinement, concurrent replay, unsupported conditions and interrupted attempts.
- [x] Implement existing RIO policy evaluation, exact token issue/burn, point-of-use recheck, create-only effect and independent read-back.
- [x] Persist separately typed decision, fidelity, attempt, occurrence, receipt, ledger and correlated Return.
- [x] Run mandatory cases and baseline regression suites; commit coherent implementation.

## Task 4: transport and real acceptance trace

Files: gateway/local-field/http.mjs, gateway/local-field/cli.mjs, gateway/tests/local-field-http.test.mjs, gateway/scripts/run-local-field-acceptance.mjs.

- [x] Write failing HTTP identity, signed-query and end-to-end/restart cases.
- [x] Implement bounded HTTP transport; CLI starts configured receiver; signed HTTP query inspects persisted state.
- [x] Run actual HTTP acceptance path with independent keys and sandbox authority provisioned for this engineering run; retain real IDs and file evidence.
- [x] Run whole-branch review and fix material findings with regression tests.
- [x] Commit and open cross-linked draft PRs: architecture#331, runtime#202, protocol#38, receipt#33.
- [x] Record gate A–P results in the architecture Return packet with exact runtime evidence; no mandatory blocker remains.

Verification checkpoint: 39 Local Field cases pass; receipt profile 9 cases pass; real run aedf7a91-0a7d-4719-86d9-229c44c876a3. Full gateway: 222 pass, 16 fail, 51 cancelled; untouched baseline: 183 pass, same 16 fail and 51 cancelled at identical test locations. See docs/evidence/one-local-field-v0.1/VERIFICATION.md.
