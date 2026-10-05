# CCM-001 F0.1 / OneField candidate

This optional LocalField profile maintains interval-local standing and addressable cross-interval relations. It reuses the existing SourcePoint key, native grants, RIO, Sentinel, filesystem adapter, ledger and receipt/Return verification. Participant metadata does not enroll a node or grant authority.

Enable it only in a new development field's signed definition with `dependencies['ccm-001'] = 'ccm-001.f0.1'`. Existing fields remain unchanged. This is an opt-in build profile, not a migration or deployment instruction.

## Commands

`LocalField.ccmCommand(record)` and the existing authenticated `control` transport accept the same native `{body, signature}` record. The body has exactly:

```text
field_id, record_id, issued_at, expires_at, type=ccm_command,
profile=ccm-001.f0.1, issuer=<pinned SourcePoint>, operation,
subject_ref, predecessor_hash, dependencies, dependency_hash, data
```

Use existing native canonical hashing and Ed25519 signing. `dependency_hash` comes from `ccmQuery('DependencySnapshot', dependencies)`. `predecessor_hash` is `ShowLineage(subject_ref).head`, or 64 zeroes for an absent subject. Maximum signed command size is 64 KiB; registration/constitution batches contain at most 128 items. A batch signs every item and produces one event per item plus a command coverage event.

Supported operations are declared in `types.mjs`. SourcePoint alone constitutes intervals, refreshes dependencies, records standing, binds native passages, captures Return, supplies scoped orientation judgments, opens explicit cross-interval passages, or records supersession. Each admitted command remains retrievable by its content hash. Unknown operations, exact-field mismatches and stale predecessors are rejected.

To permit an outbound action: issue an existing native grant with purpose `ccm:<interval_id>:outbound`, exact source/receiver/action/resource; record `standing.transition` to `ELIGIBLE` using that grant; bind the existing node-signed passage via `passage.open`; then use the native admission/execution or bilateral transport. CCM eligibility never issues an execution token. Native admission and point-of-use release recheck current grant, enrollment, scope, dependencies and fidelity.

## Queries and claim ceiling

Use `ccmQuery(name, ...args)` locally, or the existing root-authenticated query record with `view: 'ccm'`, `query` and `args`. All responses are copies. Required query names are implemented, with `KNOWN`, `UNKNOWN`, `ABSENT`, `ADMIT`, `HOLD`, and `DENY` kept distinct.

Standing/authority/open-passage history accepts an event-hash cursor or ISO timestamp, optionally wrapped as `{at: cursor}`. Hash cursors preserve exact event order even when timestamps tie. `WhatMayRightfullyFollow` evaluates the existing non-mutating native decision path against current state. It does not mint a token, reserve capacity or execute. Historical execution eligibility explicitly returns `UNKNOWN`; it is not silently treated as current permission. Bilateral transport admission still requires its own transit warrant.

An observation is an attributable signed claim bound to the exact native passage and interval. Revoked/expired observer enrollment is invalid at capture. Later revocation does not rewrite an earlier validated claim. Return arrival is `UNASSESSED`; only a separate SourcePoint-signed `orientation.judge` may admit that claim for an interval's declared use. This is human-qualified orientation, not independent MANTIS truth. `truth_status=UNESTABLISHED`, `settlement_status=UNSETTLED`, and `home_mutation=NOT_INVOKED` remain explicit.

A `cross.open` names both interval predecessors, immutable Return payload hash, source, target, relation, dependency snapshot, uncertainty and Return contract. It permits the declared notification, never a transfer of standing. Its original admission remains historical after expiry/dependency drift; current admissibility becomes `HOLD`.

## Persistence and recovery

No tables or dependencies are added. Native `LocalStore` tables (`records`, `state`, `nonces`, `ledger`) retain ownership. New record kinds are `ccm_command` and `ccm_event`; the nonce domain is `ccm_command`. Native dependency values/revisions are reconstructed from authenticated ledger entries rather than mutable indexes. CCM interval/participant/lineage views are rebuilt in memory from source-bound events.

Restart verifies native ledger custody, every root signature, exact command predecessor/subject/item coverage, one application per warrant, event hashes and relevant native receipt/Return proof. Invalid custody fails startup. Past disposition is not updated in place; successor and refresh events are new facts. Whole-ledger rollback without an independent external checkpoint remains outside this local profile's guarantee.

## Development verification

From `gateway/`:

```sh
npm run test:ccm
npm run field:ccm -- /tmp/ccm-evidence.json --s1
node --max-old-space-size=4096 scripts/run-ccm-001.mjs /tmp/ccm-all-stages.json
```

The development harness creates temporary fields/keys, real bounded file effects and signed artifacts, then removes its owned temporary directories. Runtime core never imports the harness or test helpers. The specimen demonstrates profile-interface confinement, not containment of a compromised physical host or autonomous truth verification.
