# Projection Runtime v0.1 Implementation Plan

> For agentic workers: Use superpowers:executing-plans inline. Preserve signed owner boundaries and report the literal acceptance gate.

Goal: Persistent delegated Holo identity, lifecycle and independent host admission, integrated with Customer Zero.
Architecture: Compose existing Local Field identity, grants, RIO, Sentinel, store, receipts and signed control/query surfaces. Append immutable projection cores and signed transitions; live standing remains the existing grant resolver plus exact projection/host binding.
Tech Stack: Node24/Linux, existing SQLite/Ed25519/canonical JSON; existing private Open Arrow library.
Spec: one-rio-muss-architecture/docs/architecture/projection-runtime/PROJECTION-RUNTIME-BUILD-SPEC-v0.1.md

## Global constraints

Source ≠ Projection ≠ Host ≠ Model ≠ Expression. Holo ≠ Exobody ≠ Host. Carriage is not Admission. Returned/expired standing is renewed only by explicit successor creation. No new authority root/governor/receipt machinery. No merge/deployment/canonization.

## Review focus

Imported historical binding never activates permission; projection aliases cannot impersonate human/node; suspend/revoke/drift after admission stops actual effect; unfinished Return cannot be silently erased by renewal; host denial preserves core/history.

### Task 1: Core lifecycle and standing composition
Files: gateway/local-field/projection-profile.mjs, projection.mjs; tests/projection-runtime/runtime.test.mjs.
Consumes: LocalStore, existing signed root/node records and resolveGrant.
Produces: ProjectionRuntime.handle(record), guard(passage), admitted(passage,decision), capture(chain), view(id), status().
- [ ] Write hostile cases for immutable constitution, self-promotion, lifecycle, successor identity and revoked standing; run RED.
- [ ] Implement strict core/transition contract, signed append/reconstruction and exact grant affiliation.
- [ ] Run targeted suite; expected PASS.

### Task 2: Receiving boundary and host admission
Files: existing local-field/index.mjs/http.mjs; projection runtime module and tests.
Consumes: Task1 methods. Produces: LocalField.projection(record), operateProjection(passage); generic passage/use guard, /projection route, query projection view and telemetry.
- [ ] Write cases for generic-route bypass, post-admission suspend, host carriage/denial, fresh valid rebind, expiry/revocation and read-only status; run RED.
- [ ] Wire guard to current admission/use path, append actual accounts through native receipt/Return, and add authenticated host judgment.
- [ ] Run Local Field/Open Arrow/Projection suites; expected all targeted cases PASS.

### Task 3: Portable profile and actual Customer Zero
Files: rio-protocol canonical spec/schema/validator; runtime acceptance script/instructions/evidence.
Consumes: persisted objects and signed existing HTTP surfaces. Produces: actual two-host trace and portable validation.
- [ ] Add schema checks from real exports and rejected malformed standing; run RED.
- [ ] Implement real HTTP receiver subprocess run: Customer Zero report, root acknowledgement, successor, Host B denial and fresh restart reconstruction.
- [ ] Run native receipt verifier and protocol validator; expected PASS without mock effect.

### Task 4: Review and delivery
Files: architecture contract/Loom/Return; repository evidence and draft PR metadata.
- [ ] Run architecture/protocol/affected/full existing suites; compare exact baseline failures.
- [ ] One fresh whole-change review; fix material findings with RED→GREEN regressions.
- [ ] Commit changed repositories and open crosslinked draft PRs if authorized; no merge.
- [ ] Return A–P individually; O requires all relevant existing and new cases PASS, with unrelated baseline failures separately disclosed. No weighted acceptance.
