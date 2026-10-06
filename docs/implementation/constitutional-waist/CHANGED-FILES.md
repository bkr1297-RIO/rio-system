# Changed files

Changes are limited to rio-system on `build/constitutional-waist-f0.1` from `fc9c9382f3420691c94c8ec9f9a16be15495d3bb`. No other repository or unrelated original-checkout file is modified.

| File | Change | Purpose |
|---|---|---|
| `.github/workflows/ccm-001.yml` | Modified | Extend the existing candidate workflow with waist tests/specimen; no mandatory gate or protection change. |
| `gateway/package.json` | Modified | Add test:waist and field:waist commands; no dependency change. |
| `gateway/local-field/index.mjs` | Modified | Implement opt-in native admission, commitment, invocation, HOLD, observation, custody and restart enforcement. |
| `gateway/local-field/http.mjs` | Modified | Expose authenticated explicit invoke/observe/hold operations through the existing server. |
| `gateway/local-field/medium/index.mjs` | Modified | Check interval scope before recoverable standing so HOLD cannot conceal out-of-scope DENY. |
| `gateway/tests/ccm-001/helpers.mjs` | Modified | Allow scoped signed field/policy fixture overrides while preserving defaults. |
| `gateway/local-field/waist.mjs` | Added | Closed profile constants and field validators; no runtime/authority owner. |
| `gateway/local-field/waist.d.ts` | Added | Describe distinct native stage records; interfaces do not manufacture permission. |
| `gateway/tests/constitutional-waist/helpers.mjs` | Added | Reuse native CCM fixture with signed candidate/commitment/invocation helpers. |
| `gateway/tests/constitutional-waist/runtime.test.mjs` | Added | 33 behavioral cases covering the 12 hostiles, positive flow, restart and review regressions. |
| `gateway/scripts/run-constitutional-waist.mjs` | Added | Drive the real existing CLI over authenticated HTTP and export verified development-safe evidence. |
| `docs/implementation/constitutional-waist/PLAN.md` | Added | Record approved bounded contract, owner decisions, route and action classes. |
| `docs/implementation/constitutional-waist/OWNER-MAP.md` | Added | Map every concern to its native owner and bounded extension. |
| `docs/implementation/constitutional-waist/CONFORMANCE.md` | Added | State operative distinctions, enforcement scope, HOLD semantics and claim ceiling. |
| `docs/implementation/constitutional-waist/OPEN_ISSUES.md` | Added | Record environmental, integration and architectural limits without hiding failed checks. |
| `docs/implementation/constitutional-waist/REVIEW.md` | Added | Record independent findings, reproduction/repair evidence and review coverage limits. |
| `docs/implementation/constitutional-waist/RETURN.md` | Added | Return exact predecessor, implementation, trace, tests, routing, action ledger and limitations. |
| `docs/implementation/constitutional-waist/CHANGED-FILES.md` | Added | Provide this exhaustive file-purpose inventory. |
| `docs/evidence/constitutional-waist-f0.1/baseline.log` | Added | Raw 181-test exact-predecessor baseline. |
| `docs/evidence/constitutional-waist-f0.1/waist-tests.log` | Added | Raw final 33-test waist result. |
| `docs/evidence/constitutional-waist-f0.1/inherited-tests.log` | Added | Raw final 225-test inherited regression result. |
| `docs/evidence/constitutional-waist-f0.1/open-arrow-tests.log` | Added | Raw 13-test configured native Open Arrow result. |
| `docs/evidence/constitutional-waist-f0.1/legacy-gateway-tests.log` | Added | Raw 13 ECONNREFUSED legacy service failures. |
| `docs/evidence/constitutional-waist-f0.1/root-typecheck.log` | Added | Raw missing root TypeScript compiler result. |
| `docs/evidence/constitutional-waist-f0.1/specimen.log` | Added | Raw final real CLI specimen command output and IDs. |
| `docs/evidence/constitutional-waist-f0.1/specimen.json` | Added | Full attributable real effect/Return/ledger/restart trace, with public verification material. |
| `docs/evidence/constitutional-waist-f0.1/review-reproductions-red.log` | Added | Expected failing expiry/custody reproductions with defective logic restored temporarily. |
| `docs/evidence/constitutional-waist-f0.1/review-startup-red.log` | Added | Expected failing CCM startup and historical-ADMIT regressions before repairs. |
| `docs/evidence/constitutional-waist-f0.1/verification.json` | Added | Machine-readable measured counts, commands, source/evidence hashes and claim limits. |
| `docs/evidence/constitutional-waist-f0.1/validation.log` | Added | Raw final diff/syntax, reference and artifact validation results. |

30 files: 6 modified and 24 added. Commands and exact results are in [RETURN.md](RETURN.md) and the evidence manifest. Runtime dependency/lock files are unchanged. No generated secret is committed.
