# CCM-001 changed-file inventory

Compared with system #206 at 3d8eb2016fc60a2f04c65a39cf8b21fd483fe7e1.

| File | Purpose |
|---|---|
| `.github/workflows/ccm-001.yml` | Scoped candidate CCM CI workflow; no branch-protection change |
| `docs/evidence/ccm-001/acceptance.json` | Machine-readable counts and tested-source integrity |
| `docs/evidence/ccm-001/ccm-tests.log` | Raw local verification output (success or failure preserved) |
| `docs/evidence/ccm-001/default-gateway-tests.log` | Raw local verification output (success or failure preserved) |
| `docs/evidence/ccm-001/execution-binding-tests.log` | Raw local verification output (success or failure preserved) |
| `docs/evidence/ccm-001/local-field-tests.log` | Raw local verification output (success or failure preserved) |
| `docs/evidence/ccm-001/review-repairs-green.log` | Raw local verification output (success or failure preserved) |
| `docs/evidence/ccm-001/review-reproductions-red.log` | Raw local verification output (success or failure preserved) |
| `docs/evidence/ccm-001/scale.json` | S1-S3 timings, query/source/lineage/crossing/double-arrow artifacts |
| `docs/evidence/ccm-001/scale.log` | Raw local verification output (success or failure preserved) |
| `docs/evidence/ccm-001/si-tests.log` | Raw local verification output (success or failure preserved) |
| `docs/implementation/ccm-001/BUILD-SPEC-F0.1.md` | Unchanged supplied build contract |
| `docs/implementation/ccm-001/CONFORMANCE.md` | Twelve criterion evidence mapping and tested scope |
| `docs/implementation/ccm-001/OPEN_ISSUES.md` | Only unresolved defects and claim limits |
| `docs/implementation/ccm-001/OWNER-MAP.md` | Native owner mapping and existing Loom Return route |
| `docs/implementation/ccm-001/PLAN.md` | Approved bounded implementation plan/checklist |
| `docs/implementation/ccm-001/PROGRESS.md` | Implementation rulings, review repairs and verification |
| `docs/implementation/ccm-001/RETURN.md` | Human-readable candidate implementation Return |
| `gateway/local-field/index.mjs` | Opt-in CCM guard, shared native preflight/control/query/Return callbacks |
| `gateway/local-field/medium/README.md` | Profile, signed API, persistence and claim ceiling |
| `gateway/local-field/medium/index.mjs` | Interval/event/lineage engine and deterministic queries |
| `gateway/local-field/medium/types.d.ts` | Machine-readable domain, command, event and crossing declarations |
| `gateway/local-field/medium/types.mjs` | Exact runtime validators and bounded operation/event registry |
| `gateway/package.json` | Two repository-local CCM scripts; no dependency addition |
| `gateway/scripts/run-ccm-001.mjs` | Runnable development scale/evidence harness |
| `gateway/tests/ccm-001/helpers.mjs` | Development-only real signed LocalField fixtures |
| `gateway/tests/ccm-001/integrity.test.mjs` | Custody, concurrency, warrant replay, dependency and Return tamper tests |
| `gateway/tests/ccm-001/medium.test.mjs` | Interval/hostile/current/historical/Return conformance tests |
| `gateway/tests/ccm-001/scale-fixture.mjs` | Real S1-S3 population and fifteen controls per stage |
| `gateway/tests/ccm-001/transport.test.mjs` | Existing authenticated transport reuse and root boundary test |
| `docs/implementation/ccm-001/CHANGED-FILES.md` | This inventory |
