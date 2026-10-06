# Cognitive Meteorology F0.1 — build report

**The bounded reference specimen is implemented and its scoped conformance checks passed.** It makes the Calendar/Git divergence visible while producing no new disposition, standing, execution authority, scheduled timer, outbox entry, branch change or source mutation in the tested boundary. It remains an implementation candidate below the Conformance Cut.

Exact predecessor: `bkr1297-RIO/rio-system` draft #208, `5df28c0e4262616bf560787a3a365583370351da`, tree `30007788b966ad16e0af7e237abef83aa0fb24ba`. Local candidate branch: `build/cognitive-meteorology-f0.1`, stacked on `build/constitutional-waist-f0.1`. Tested code commit: `ff788ce824c3fd9de2ce7be647e37c340766ff71`. Report/evidence commits follow it; the local branch head is available through `git rev-parse HEAD`.

**Publication status:** automatic approval review blocked pushing this new code and evidence to the public `bkr1297-RIO/rio-system` repository. Connected account ownership/admin/push permissions were verified, but explicit permission to publish this payload is still required. The source, tests, reports and evidence are committed locally. No remote candidate branch or draft PR has been created.

## Result

The primary synthetic fixture measures available time margin **0.12**, meeting density **0.88**, complete compression between three consecutive meetings, mean open-PR age **84 hours**, commit activity **four times the supplied rolling seven-day median**, and worsening review waits. The evaluator selects candidate `PRESSURE_DIFFERENTIAL` and retains `COLD_FRONT` and `HIGH_PRESSURE` as overlapping candidate readings.

The Metascope renders Current Conditions, What’s Driving It, What’s Forming, and What We Can’t See Yet. Its possible 24–48-hour review bottleneck is plainly marked as unvalidated. It has no notification, command or remediation control.

## Required deliverables

| Contract | Delivered |
|---|---|
| A — Schema | `schemas/metascope-fieldoscopy-reading.json`, Draft 2020-12, closed nested fields and declared enums |
| B — Typed FieldSignal | `gateway/local-field/meteorology/signals.mjs` and `types.d.ts`; state, signed movement, rate, current/comparison windows and extractor lineage |
| C — Calendar stub | `calendar-edge.mjs`; available margin, unioned meeting density, buffer compression; timing reads only |
| D — Git stub | `git-edge.mjs`; mean open-PR age, review waits, commit velocity; PR/commit timing reads only |
| E — Evaluator | `evaluator.mjs`; pure cross-domain classification, all eight candidate regime labels, matched rules and signal references |
| F — Projection | `projection.mjs`; separate attributed four-section projection and escaped static HTML |
| G — Zero actuation | `gateway/tests/cognitive-meteorology/boundary.test.mjs`; actual native state and Git/files comparisons, plus restricted-process/timer test |
| H — Data minimization | Edge, reading, boundary and independent schema tests; forbidden bodies/code/traces, extra domains, getters, boxed carriers and executable prototypes reject |
| I — Pressure Differential note | [PRESSURE-DIFFERENTIAL.md](PRESSURE-DIFFERENTIAL.md), with twelve saved comparative cases |
| J — Build report | This file, verification record, source hashes, test logs, primary reading/projection/HTML and zero-effect proof |

## Files added and modified

Added runtime files: `gateway/local-field/meteorology/signals.mjs`, `types.d.ts`, `calendar-edge.mjs`, `git-edge.mjs`, `evaluator.mjs`, `projection.mjs`, `fixture-signals.json`; pull runner `gateway/scripts/run-cognitive-meteorology.mjs`; schema `schemas/metascope-fieldoscopy-reading.json`; workflow `.github/workflows/cognitive-meteorology.yml`.

Added tests: `gateway/tests/cognitive-meteorology/edges.test.mjs`, `reading.test.mjs`, `boundary.test.mjs`, independent `schema.py`, and shared timing-only `fixtures.mjs`.

Added documentation: the exact supplied [BUILDER-PROMPT.md](BUILDER-PROMPT.md), [README.md](README.md), [PRESSURE-DIFFERENTIAL.md](PRESSURE-DIFFERENTIAL.md), [REVIEW.md](REVIEW.md), this report, and `docs/superpowers/plans/2026-10-06-cognitive-meteorology-f0.1.md`.

Added implementation evidence: `docs/evidence/cognitive-meteorology-f0.1/` contains the primary specimen, twelve comparative cases, actual zero-effect table hashes/counts, verification/source manifest, full final test output, and retained RED/GREEN/failure logs.

**Only existing file modified:** `gateway/package.json`, adding `test:meteorology` and the pull-only `field:weather` command. No existing runtime authority, Gate Zero, Sentinel, ledger, receipt, Return, medium or standing implementation was modified. No new production dependency.

## Verification

| Check | Result |
|---|---|
| New Node conformance: edges 9, readings 14, boundaries 8 | **31 passed; zero failed/skipped** |
| Independent Draft 2020-12 conformance | **3 passed**; additionally validated all 12 comparative readings and the saved primary artifact |
| Inherited LocalField, CCM, waist, SI, projection, binding and Prime suites | **258 passed** |
| Configured inherited Open Arrow suite | **13 passed**, using the predecessor's authorized reference checkout |
| Final combined Node run on repaired code | **302 passed; zero failed/skipped** |
| Scoped total, including schema tests | **305 passed**, with baseline checks not double counted |
| Syntax checks for all new/changed `.mjs`; code/document diff checks | Passed; original captured log whitespace is retained |
| Bare gateway `npm test` | **13 failed**: existing service at port 4401 unavailable, `ECONNREFUSED`; matches the predecessor's recorded setup gap |
| Root `npm run typecheck` | Unavailable: `tsc: not found`; matches the predecessor's recorded setup gap |

The wider suite is not claimed universally green. Those two setup gaps did not arise from this isolated subsystem and were not repaired by expanding the task.

The thirteen legacy gateway failures are: operational status; POST intent; POST govern; POST authorize; POST execute; POST receipt; receipt/chain verify; full intent pipeline; block ungoverned execution; block denied execution; block unknown-agent governance; GET ledger; full-chain verify. Full named output is retained in `legacy-gateway-test.log`.

## Actual zero-effect evidence

After **100** pull evaluations and projections, all four actual SQLite tables — records, state, nonces, ledger — have unchanged digests. Native ledger rows remain **24 → 24**. New dispositions: **0**. Preexisting native HOLD and ADMIT traces and standing remain unchanged. Execution authorities, attempts and outgoing records remain **0**. Native artifact files remain **0 → 0**. Calendar fixture bytes, actual Git refs, HEAD, working-tree status and source file content remain unchanged.

A separate Node process successfully evaluates/renders with filesystem writes and subprocesses denied. Actual async-resource monitoring observes **no Timeout or Immediate resources created**. The engine has no scheduler, runtime, gate, transport or execution capability parameter. These tests inspect actual boundaries; there are no constant-zero application counters.

See [zero-effect.json](../../evidence/cognitive-meteorology-f0.1/zero-effect.json) and [boundary-proof.tap](../../evidence/cognitive-meteorology-f0.1/boundary-proof.tap).

## Review repairs

Independent read-only review found boxed metric values and insufficient received-array validation could carry hidden data or executable behavior. Both were reproduced RED and corrected. A third reproduced case showed property-order differences could suppress equivalent-window classification; it was regraded Important and repaired in the same pass. [REVIEW.md](REVIEW.md) preserves scope and verification limits. Author tests verify repairs; no second independent review is claimed. No deferred Minor finding.

## Known gaps

- Calendar/Git edges are stubs; no live connector, credential, source attestation or source-side deployment is supplied. The caller provides one project's scoped timing data and rolling baseline.
- Atmospheric thresholds and the 24–48-hour movement window are provisional fixture semantics, not calibrated real-world forecasts. Review latency approximates capacity and includes pending/censored waits.
- Comparing aggregate windows does not establish task size, task identity, reviewer commitments or causal cross-domain meaning. Calendar free time is not an authorization or a review commitment.
- Content hashes support attributable reconstruction; they do not authenticate raw source truth, establish Evidence, authorize action or mutate standing.
- Zero effect is proved for the implemented pull interface, ordinary/hostile declared carriers and the tested native environment. Arbitrary executable programs, all possible network channels and future integrations are outside that proof.
- Pressure differential's permanent regime/operator status remains open; the implementation separates a measured relation from its candidate regime label without promoting either.
- The existing legacy-service and root-TypeScript setup gaps remain recorded above. GitHub CI has not run for this new candidate while public publication is blocked; no new remote CI result is claimed.

## Constitutional and conformance observations

**Difference remains addressable:** exact signal IDs, domains, extractor versions, windows, signed direction/rate, rule matches and driver references remain inspectable.

**Transformation remains answerable:** the machine reading reconstructs from its bounded signal manifest and evaluator version. The human projection carries the reading reference and is validated separately before display.

**Progression does not manufacture promotion:** detection changes visible conditions; it produces no constitutional disposition, grant, execution lease or world action. `FieldoscopyReading`, `MetascopeProjection` and constitutional dispositions remain different types. No successful normalization, classification, projection, persistence or test result confers standing.

Frozen architecture and Constitutional Minimum were not amended. This build neither merges nor deploys nor canonizes the candidate.

## Recommended next experiment

Keep the same two domains. Preregister matched cases holding the measured differential constant while varying signed movement and Calendar margin; compare full-signal and differential-only detection against later observed review waits, including misses. Keep the interaction pull-only and return the resulting implementation evidence before proposing expansion.
