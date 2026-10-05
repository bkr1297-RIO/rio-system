# CCM-001 F0.1 implementation Return

**Disposition: PASS WITH RECORDED SCOPE LIMITS; candidate for Brian / SourcePoint review.**

The bounded interval kernel is implemented in the existing LocalField runtime. It supports independent interval-local standing, root-warranted transitions, explicit cross-interval notification, separately admitted inbound orientation, reconstructable source lineage and field queries. The source-backed circulation creates and reads back actual files in development-owned temporary state. No new constitutional runtime, root, receipt system or settlement/HOME owner was installed.

## Source lineage and routing

Base: `rio-system` #206, `build/si-specimen-001`, commit `3d8eb2016fc60a2f04c65a39cf8b21fd483fe7e1`. Candidate branch: `build/ccm-001-f0.1`; implementation checkpoint: `0d1ad06af7aca271bc2394fa9736ce3c399a8934`. Final candidate pins are carried by the enclosing commit/PR and standalone Return. Exact tested source SHA-256 values are in `docs/evidence/ccm-001/acceptance.json`.

Loom: R-07 / architecture #322; adjacent R-24, R-18 and existing proof/Return routes. Registry state stays GAP/PARTIAL. See OWNER-MAP.md. No route was invented or closed.

## Verification

- CCM: 34/34.
- Existing LocalField: 55/55.
- Existing SI/HLSI: 80/80.
- Existing execution-binding: 12/12.
- Total applicable automated tests: 181/181.
- S1, S2, S3: all 15 executed hostile/control checks pass per stage; restart reconstructs exact recorded heads; native receipt proof valid.
- Node syntax and `git -c core.whitespace=-blank-at-eol diff --check <base>`: pass. This per-command check permits intentional Markdown line breaks and byte-preserved native stdout trailing whitespace.
- Default full gateway: 0/13; localhost:4401 connection refused. Recorded separately, not bypassed or described as green.

Commands: `node --test gateway/tests/ccm-001/*.test.mjs` from repository root; `npm run test:local-field`, `npm run test:si-specimen`, `npm run test:execution-binding`, and `npm test` from gateway. Scale: `node --max-old-space-size=4096 gateway/scripts/run-ccm-001.mjs <output.json>` from repository root. The raw logs, benchmark JSON, query examples and source warrants are checked in under docs/evidence/ccm-001.

| Stage | Participants / intervals | Query p50 / p95 / p99 ms | Constitution s | Restart s | SQLite MiB | RSS MiB |
|---|---:|---:|---:|---:|---:|---:|
| S1 | 10 / 100 | 0.071 / 0.258 / 0.466 | 0.07 | 0.69 | 0.65 | 61.60 |
| S2 | 100 / 10,000 | 0.778 / 1.281 / 2.329 | 4.11 | 3.10 | 38.51 | 153.62 |
| S3 | 1,000 / 100,000 | 0.868 / 1.434 / 2.467 | 37.85 | 29.77 | 342.28 | 500.04 |

These are local single-run measurements, not SLOs. The harness enforces 64 KiB commands, 128-item batches and 1,000 query samples; Node receives a 4 GiB heap ceiling. Zero counters mean no failure observed in the asserted test cases.

## End-to-end examples

`scale.json` supplies all eight required query examples per stage. `ShowLineage` binds event hash -> exact signed source warrant -> native grant -> original signed Passage -> native RIO -> Sentinel/release -> file occurrence -> receipt/Return. `source_warrants`, `native_proof` and `native_proof_verification` permit cold reconstruction with the included development public anchor. No private keys are included.

Crossing example: I_AB's immutable Return payload reference -> explicitly signed notification passage -> I_AC. Both interval predecessor heads, independent source/target/scope, uncertainty, dependencies and Return contract are recorded. Target outbound standing remains OBSERVE_ONLY. The current admissibility query becomes HOLD after corpus drift while original admission remains historical.

Double-arrow example: an observe-only passage is denied by LocalField, a test-owned exterior file is nevertheless created, an attributable observation arrives, and SourcePoint separately admits the qualified claim for orientation. Outbound remains DENY. The other three quadrants are recorded independently. Arrival alone never invokes judgment or HOME mutation.

## Repairs and unresolved findings

The fresh review found eight concrete defects; repair tests now cover old signed event replay, malformed observation atomicity, missing dependency index custody, incomplete history, stale crossing admission, revoked-source query, revoked observer and receipt-less Return verification. Additional native dependency-warrant replay and self-supersession controls pass. See CONFORMANCE.md and review evidence.

OPEN_ISSUES.md records default-service failures, current-only execution preflight, local resource measurements, physical-principal/whole-host claim limits, external checkpoint limitations and the wider independent-evidence/settlement/successor joins. The earlier unrelated canonical HLSI simulation-binding schema gap remains open.

## Claim ceiling and next disposition

Inbound ADMIT means a native-root-attributed, scoped human-qualified claim with validated provenance. Truth remains UNESTABLISHED; settlement remains UNSETTLED; HOME is NOT_INVOKED. This result does not promote ONE doctrine, install the whole executable successor, establish independent MANTIS truth or resolve the entire runtime succession estate.

No merge, deployment, public endpoint, personal-account consequence, constitutional canon change or unrelated file edit occurred. The unrelated original-worktree NavBar change was preserved. No dependency was added. The draft PR is the candidate Return for human disposition, not a merge warrant.

Next concrete slice, only after disposition: bind this candidate into the selected successor lineage and supply the existing native evidence/settlement integration required for stronger inbound claims. Do not build a parallel authority or Return owner.
