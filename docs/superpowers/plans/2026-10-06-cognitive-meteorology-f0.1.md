# Cognitive Meteorology F0.1 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. The user supplied the complete build contract, confirmed the division, and authorized continuous implementation. One builder active at a time.

**Goal:** Expose bounded cross-domain Calendar and Git conditions with attributable readings and zero consequential authority.

**Architecture:** A timing-only Calendar edge and metadata-only Git edge emit closed FieldSignal records. A pure evaluator receives only these signals; a separate pure renderer produces the four-section Metascope. The existing LocalField authority, ledger, Sentinel, execution, and Return owners remain the boundary against which zero effect is checked.

**Tech Stack:** Existing Node.js 24 ES modules, declaration files, node:test, JSON Schema Draft 2020-12. No new production dependency.

**Spec:** The user's BUILDER PROMPT — COGNITIVE METEOROLOGY F0.1, preserved at `docs/implementation/cognitive-meteorology/BUILDER-PROMPT.md`.

## Global Constraints

- Calendar and Git only; source retains raw content; the core reads derived signals only.
- Difference must remain addressable. Transformation must remain answerable. Progression must not manufacture promotion.
- No artifact gains standing merely by successful transformation.
- FieldoscopyReading != ConstitutionalDisposition. Observation != Authorization. FieldoscopyReading != MetascopeProjection.
- No scheduling, alerts, messages, leases, branch mutation, ADMIT/HOLD/DENY, or standing mutation from detection.
- Pressure differential classification remains an implementation question; comparative fixtures supply bounded evidence.
- Base: `bkr1297-RIO/rio-system` #208 head `5df28c0e4262616bf560787a3a365583370351da`, tree `30007788b966ad16e0af7e237abef83aa0fb24ba`. No merge or deployment.

## Review Focus

- NaN, Infinity, unknown fields, getters, and extra sensor domains must be rejected at the signal boundary before projection.
- Saturated normalization must retain the measured change direction and velocity.
- Missing, stale, duplicated, or nonmatching observation windows must not look like a confident cross-domain condition.
- Empty calendars and unavailable commit baselines must preserve missingness instead of inventing measurements.
- Zero-effect tests must compare actual LocalField records/standing and actual Git refs/files, not constant-zero counters.

### Task 1: Scoped signals and source edges

**Files:** `gateway/local-field/meteorology/{signals.mjs,types.d.ts,calendar-edge.mjs,git-edge.mjs}`; `gateway/tests/cognitive-meteorology/{fixtures.mjs,edges.test.mjs}`.

**Interfaces:** `fieldSignal(spec, previousMagnitude): FieldSignal`; `extractCalendarSignals({current, previous}): FieldSignal[]`; `extractGitSignals({current, previous, rolling_daily_commit_median}): FieldSignal[]`. Samples carry timestamp windows and timing metadata; other source fields never enter outputs.

- [x] Write tests for the 0.12 calendar margin, three consecutive meetings, Git 84-hour age, 4x rolling median velocity, signed rates, saturation, and raw-content sentinels.
- [x] Run `node --test gateway/tests/cognitive-meteorology/edges.test.mjs`; expect assertions for missing exports before implementation.
- [x] Implement strict data-only signals and bounded timing/metadata extractors. Rate unit: normalized units per hour; comparison window is explicit provenance. Empty unavailable metrics are omitted.
- [x] Run the same command; expect all edge tests to pass; commit.

### Task 2: Reading, comparative regimes, and projection

**Files:** `gateway/local-field/meteorology/{evaluator.mjs,projection.mjs}`; `schemas/metascope-fieldoscopy-reading.json`; `gateway/tests/cognitive-meteorology/reading.test.mjs`.

**Interfaces:** `evaluate(signals, {timestamp}): FieldoscopyReading`; `projectMetascope(reading): MetascopeProjection`; `renderMetascope(projection): string`. Manifest carries exact signal identity, direction, signed rate, current/comparison windows, and extractor lineage. Confidence is explicit uncalibrated support, not forecast probability.

- [x] Write tests for pressure differential, every candidate regime, missing/stale/misaligned conditions, duplicate metrics, unknown fields/domains, lineage references, deterministic reading identity, projection separation, and safe HTML.
- [x] Run the reading tests; expect missing evaluator assertions before implementation.
- [x] Implement the pure rule evaluator, closed reading schema, and separate four-section renderer. Near-term movement is a candidate with explicit unknown forecast validation.
- [x] Run edge and reading tests; independently validate schema and generated artifacts with Draft 2020-12; commit.

### Task 3: Real boundary conformance and evidence

**Files:** `gateway/tests/cognitive-meteorology/boundary.test.mjs`; `gateway/scripts/run-cognitive-meteorology.mjs`; `gateway/package.json`; `.github/workflows/cognitive-meteorology.yml`; `docs/{implementation,evidence}/cognitive-meteorology-f0.1/*`.

**Interfaces:** Runner receives a file of FieldSignal records or uses the synthetic timing-only fixture; emits reading and four-section HTML on an explicit pull invocation. It never receives a LocalField runtime or executor capability.

- [x] Write tests comparing all actual LocalField SQLite tables, runtime standing, real Calendar data, Git refs/working tree and artifact directories before/after repeated readings; verify effect channels are denied in a restricted Node subprocess.
- [x] Run boundary/runner tests before runner implementation; expect missing runner assertions.
- [x] Implement the pull runner and CI test command. Retain comparative case results and real boundary snapshots as evidence.
- [x] Run `npm run test:meteorology`, inherited LocalField/CCM/waist/SI/projection/execution-binding/Prime tests, the real specimen, bare gateway `npm test`, and root typecheck. Record every unavailable wider check by name.
- [x] Review the final change; prepare Pressure Differential implementation note and full build report with files, passing tests, gaps, conformance observations, and next bounded experiment; commit and preserve as a draft candidate.
