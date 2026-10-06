# Constitutional Waist + Active HOLD F0.1 — implementation Return

Disposition: **PASS WITH RECORDED SCOPE LIMITS — candidate for SourcePoint review.**

Exact predecessor: `fc9c9382f3420691c94c8ec9f9a16be15495d3bb`, rio-system draft #207 / `build/ccm-001-f0.1`, stacked on #206 and #205. Candidate branch: `build/constitutional-waist-f0.1`, targeting #207's branch. The final candidate commit and tree are pinned in the draft PR description; they are not recursively embedded in their own committed content.

## What was built

An opt-in `constitutional-waist.f0.1` profile extends the existing LocalField owner. Native signed candidate content carries the interval, uncertainty and obligations; canonical Passage carries source, subject, consequence, grant, scope, dependencies and Return contract. Existing policy/authority/CCM gates produce independently recorded ADMIT, HOLD or DENY. ADMIT creates no token or effect.

An existing root-signed control constructs a commitment bound to the exact admitted decision and passage hash. A separate original-source signature invokes it. Native Sentinel and descriptor-bound execution recheck current standing, dependencies, exact bindings and expiry at use. Invocation, durable native attempt and executor result are distinct records. Separate real descriptor readback supplies an observation and the native occurrence account before native receipt and Return completion.

PROBE performs bounded local CCM/eligibility inspection. Other HOLD actions record local next-step intents; WITHDRAW ends the held candidate. SourcePoint-signed existing controls perform actual standing repair. Only a fresh native decision can admit a repaired HOLD. DENY remains terminal for the exact candidate. HOLD and DENY both map to actuator 0 while retaining distinct reason, identity and lineage.

The runtime imports no specimen harness. There is no new authority, RIO, ledger, receipt, Return, settlement or HOME owner. [OWNER-MAP.md](OWNER-MAP.md) identifies every reused owner; [CONFORMANCE.md](CONFORMANCE.md) defines the enforcement boundary. All changed files and their purposes are in [CHANGED-FILES.md](CHANGED-FILES.md).

## Executable evidence

Run from `gateway`:

```sh
npm run test:waist
npm run field:waist -- /tmp/constitutional-waist-evidence.json
```

The checked specimen started the existing LocalField CLI in a separate process, called authenticated HTTP endpoints, created a real development-owned `hello.txt`, read it back, captured native Return into existing CCM custody, stopped/restarted the CLI and reconstructed the unchanged trace. Development keys and state were generated in a temporary directory and cleaned after execution. Archived evidence retains public keys, signatures, artifact content/hashes and the native ledger; it contains no private signing keys or bearer tokens.

Full trace: [specimen.json](../../evidence/constitutional-waist-f0.1/specimen.json). Raw runner output: [specimen.log](../../evidence/constitutional-waist-f0.1/specimen.log).

| Stage | Actual record identity / result |
|---|---|
| Native formation | `74e8912f-23ff-412b-9adf-53589991b45f` |
| Candidate passage | `ada56aae-f4fd-4c81-827f-405fc33c0045` |
| HOLD | `3b7a76bc-5da3-4496-932f-6ee485dc2b9c`, `CCM_INTERVAL_OBSERVE_ONLY`, actuator 0 |
| PROBE and repair | Signed non-consequential local inspection; existing root `standing.transition` changes eligibility, leaving HOLD intact until reconsideration. |
| Fresh ADMIT | `7e0b7256-269c-48a2-8e54-b43161bcd1ff`, linked to the prior HOLD |
| Commitment | `9f0a31a2-590c-4c1e-bfca-dedc9a86aa7f`, root-signed exact decision/passage warrant |
| Invocation | `56624e12-eed6-41c3-a63c-66ad904a85bd`, original-source signature |
| Native attempt | `3a1f467e-d1fd-403a-8be9-46beb2f86d0a`, durable before create |
| Execution | `b1a285e0-5f48-4700-b89f-daeb05944879`, COMPLETED; no observation/occurrence/Return yet |
| Observation | `76972f11-d854-4464-b5b1-f70b5938d0ac`, separate descriptor read |
| Occurrence account | `b01e2c49-787b-4a33-a64d-5616c56fd38b`, OBSERVED |
| Native receipt | `8ddc2f44-7e83-4c52-ae63-f96df017b8c1`; all four native hashes verified |
| Native Return | `84cd933b-5c1d-4edc-95c8-6afb984762b3`, RETURNED/OBSERVED |
| CCM custody | `63678296-5d60-420b-9d50-62bdda755775`, KNOWN, valid provenance; inbound UNASSESSED, settlement UNSETTLED, HOME NOT_INVOKED |
| Restart | Full waist trace hash and CCM lineage head unchanged; no replayed effect or regenerated permit |

The same specimen records `Candidate → DENY → no actuation` under decision `d66b1d2f-f885-4e22-890d-752003a4d0e1`. `examples.compress` records HOLD→0 and DENY→0 alongside their unequal decisions. This is local actuator compression with preserved constitutional reconstruction, not a general decision-equivalence assay.

## Verification

Node v24.19.0, Linux. Every result below is attached to raw output in `docs/evidence/constitutional-waist-f0.1/`; [verification.json](../../evidence/constitutional-waist-f0.1/verification.json) records counts, hashes and commands. The 181-test predecessor baseline is additional evidence, not added to the 271 final-test total.

| Working directory | Exact command | Result |
|---|---|---|
| gateway | `npm run test:waist` | 33 passed, 0 failed/skipped |
| gateway | `node --test tests/local-field*.test.mjs tests/ccm-001/*.test.mjs tests/si-specimen/*.test.mjs tests/execution-binding-repair.test.mjs tests/projection-runtime/*.test.mjs tests/prime-*.test.mjs` | 225 passed, 0 failed/skipped |
| gateway | `ONE_REFERENCE_ROOT=/workspace/scratch/1cf97914ef3d/reference-waist-check node --test tests/open-arrow/*.test.mjs` | 13 passed, 0 failed/skipped |
| gateway | `node scripts/run-constitutional-waist.mjs /workspace/scratch/1cf97914ef3d/waist-final-specimen.json` | Real effect, ledger/receipt/Return/hashes and restart checks passed |
| gateway at predecessor | `node --test tests/local-field*.test.mjs tests/ccm-001/*.test.mjs tests/si-specimen/*.test.mjs tests/execution-binding-repair.test.mjs` | Baseline 181 passed |
| gateway | `npm test` | 13 failed / 0 passed: existing service at port 4401 unavailable (`ECONNREFUSED`) |
| repo root | `npm run typecheck` | Not runnable: `tsc: not found` |
| repo root | `git diff --cached --check -- . ':(exclude)docs/evidence/constitutional-waist-f0.1/*.log'`; `node --check` for changed JS files | Code/document checks passed; unmodified raw log whitespace is retained and reported in the validation log |

Open Arrow initially lacked its reference owner checkout. Read-only retrieval of the required 37 source/schema files at reference commit `73ccc41e99433513fbe8ca03d599d2ba2717b6ab` resolved that setup dependency. The native Open Arrow source blob matches `d7539e85544e8a83cba8701d5e62f8a4d6e08354`. No reference repository change was made. Neither the legacy gateway suite nor root TypeScript check is claimed green.

The existing CCM candidate workflow now runs this suite and specimen alongside predecessor conformance. It remains a candidate workflow; no merge-blocking policy or branch protection was changed. Exact-head CI status is reported with the PR Return metadata separately from these local results.

## Twelve required hostile conditions

Tests live in `gateway/tests/constitutional-waist/runtime.test.mjs`.

| Required condition | Executable coverage |
|---|---|
| 1. ADMIT does not invoke | Admission leaves invocation, attempt and filesystem empty; public execute and convenience endpoint cannot bypass sequence. |
| 2. HOLD/DENY prevent actuation but differ | Reconstructable unequal decisions, both actuator 0. |
| 3. Expired/revoked commitment | Separate real expiry and revocation tests; original-source revocation and forged-root checks also reject. |
| 4. Changed dependency | Prevents commitment and invocation after ADMIT. |
| 5. Payload/subject/scope/target substitution | Four parameterized exact-binding rejection cases. |
| 6. Execution cannot manufacture occurrence | Successful create followed by failed real readback leaves execution COMPLETED and occurrence UNKNOWN. |
| 7. Occurrence cannot manufacture observation | Untrusted occurrence/control records and observation before execution reject. |
| 8. Observation cannot manufacture Evidence | No such native control/constructor; submitted untrusted promotion rejects. |
| 9. Active HOLD repair/probe | PROBE records non-consequential inspection; existing signed standing repair retains HOLD until reconsideration. |
| 10. Fresh decision required | Repaired HOLD requires a distinct fresh ADMIT through the native gates. |
| 11. DENY sticky | Retry and HOLD action cannot repair the same denied candidate into ADMIT. |
| 12. No SourcePoint manufactured | Root/grant state unchanged by candidate richness, HOLD, execution and Return; forged commitment rejects. |

The independent review exposed and repaired final-release invocation expiry and derived-trace custody defects, including CCM startup replay ordering. Historical ADMIT labeling was also repaired. [REVIEW.md](REVIEW.md) distinguishes independently reviewed code from coordinator-verified fixes and preserves the RED/GREEN reproductions.

## Route and execution-boundary ledger

Primary: existing R-07 / architecture #322. Adjacent dependencies: R-24/R-18 for standing and authority; R-12/R-13/R-20 for proof and Return. This candidate addresses the existing PARTIAL runtime burden: admission/commitment/invocation separation and accountable HOLD. Route closure, architecture ratification and SourcePoint disposition remain unestablished.

| Class | Actions actually taken |
|---|---|
| 1 — inspect | Existing repo/source-of-truth, draft ancestry, native owners, tests, reference source and review. |
| 2 — development | Isolated branch changes, bounded test artifacts/processes, development keys, real sandbox create/readback, local verification, candidate commit/branch/draft PR. |
| 3 — human disposition | None performed. No merge, deployment, production mutation, personal account action, HOME mutation or canon promotion. |

The original checkout's unrelated navigation modification and predecessor branches were preserved. No new package dependency or build-system replacement was introduced.

## Claim ceiling and remaining work

This proves the tested opt-in LocalField profile, not whole-host compromise containment, whole-system conformance, independent physical truth or a Synthetic Intelligence capability claim. Readback is attributable to the receiver under the existing filesystem owner; qualified Evidence, independent settlement, HOME and successor mutation remain unestablished. Automatic bilateral/projection convenience paths fail closed for this profile. The next integration should preserve explicit commitment/invocation and existing Return egress/ingress rather than silently restoring auto-execution. Post-crash reconciliation remains unsettled and is not replayed.

[OPEN_ISSUES.md](OPEN_ISSUES.md) records exact environmental and cross-owner limits. None is hidden by passing bounded tests. No merge or deployment was performed.

**PASS WITH RECORDED SCOPE LIMITS — returned for SourcePoint review.**
