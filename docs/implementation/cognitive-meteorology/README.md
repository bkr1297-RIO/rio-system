# Cognitive Meteorology F0.1

A bounded observational specimen below the Conformance Cut, built on rio-system draft #208 at `5df28c0e4262616bf560787a3a365583370351da`.

**The radar maps the front. The radar does not move the ship.**

## Run a pull reading

From `gateway`, choose a new output directory:

```sh
npm run field:weather -- --demo /tmp/metascope-f0.1
```

The demo uses the declared synthetic October 5 observation window. It produces three separate artifacts: `fieldoscopy-reading.json`, `metascope-projection.json`, and `metascope.html`. Existing files are never overwritten. The HTML has exactly four sections and no command, alert or remediation controls.

To read a file containing only the bounded FieldSignal array:

```sh
npm run field:weather -- --signals /path/to/field-signals.json /tmp/metascope-pull
```

Supplied signals are evaluated at current time; an explicit `--at <UTC-timestamp>` reconstructs a prior reading. No arguments perform no work. Unknown or raw fields are rejected before output files are created.

## Data and responsibility boundaries

| Owner | Input | Output | Available consequential interface |
|---|---|---|---|
| Calendar edge stub | Working window, event start/end times, previous comparison window | Three Calendar FieldSignals | None |
| Git edge stub | Open PR creation/first-review times, commit timestamps, caller-supplied rolling seven-day daily commit median | Three Git FieldSignals when measurements exist | None |
| Cognitive Meteorology evaluator | Closed FieldSignal array only | FieldoscopyReading | None |
| Metascope projection | Version/lineage-validated FieldoscopyReading | Four-section MetascopeProjection | None |
| HTML renderer | Human projection | Escaped static HTML | None |
| Existing LocalField | Its existing signed records and controls | Its existing decisions and native effects | Unchanged; the radar receives no runtime handle |

No source edge connector is installed. The stubs read timing metadata already present at the caller's source boundary. They never access calendar descriptions or attendees, Git bodies, diffs, source code or secrets. Other sensor domains have no extractor or accepted metric. Raw sources are neither stored in LocalField nor imported by the evaluator. The evaluation dependency graph contains only its closed signal utilities and Node's hashing module.

## Declared measurement meanings

| Signal | F0.1 magnitude | Movement basis |
|---|---|---|
| available_time_margin | Unoccupied share of the declared working window | Change from an equally sized prior working window |
| meeting_density | Occupied share after unioning overlapping events | Change from the prior window |
| buffer_compression | Mean shortfall below the declared minimum inter-meeting buffer | Change from the prior window; no meeting pairs means measured zero compression |
| open_pr_age | Mean current open-PR age divided by 168 hours, clipped at 1 | Change in mean age; no PR measurement is omitted |
| review_latency | Mean time to first review, or elapsed pending wait, divided by 96 hours, clipped at 1 | Change in review waits; pending waits are censored observations |
| commit_velocity | Daily commit rate divided by the supplied rolling seven-day daily median, then divided by 4, clipped at 1 | Change relative to the same fixed baseline; a zero baseline is unavailable |

The signal direction uses the **unclipped** measurements. `rate_of_change` is signed normalized units per hour between the current and comparison window ends. A magnitude at its ceiling can still rise or fall. Exact `comparison_window` provenance travels with the current window. Windows must be nonoverlapping, equally sized and no longer than seven days; Calendar comparisons also retain the same working-window duration and buffer target.

F0.1 freshness is 24 hours after observation-window end. Future observations fail validation. Missing and stale observations remain unresolved; source windows must align by their actual timestamp values before cross-domain classification. These are declared specimen choices, not constitutional rules.

## Readings and projections

The machine reading retains signal IDs, extractor identity/version, direction, velocity, windows, matched rule IDs, condition-to-signal references, uncertainty and evaluator identity/version. Signal and reading IDs are content hashes for reconstruction, **not source attestations or grants**. `validateReading` reconstructs the reading from its exact signals/version before human projection; it rejects hidden fields, accessors, executable array prototypes and manufactured dispositions.

`confidence` expresses uncalibrated rule support, not a probability. Regime names are candidate labels. The 24–48-hour outlook is illustrative and explicitly unvalidated. No forecast changes standing, creates a decision, obtains a lease, schedules work, sends a message or changes Git/Calendar state.

The F0.1 human projection belongs to this specimen. The later command/expression surface can call these projection/rendering functions and retain `reading_ref`; it need not build another interpretation engine.

## Verify

```sh
cd gateway
npm run test:meteorology
cd ..
python -m pip install jsonschema==4.26.0
python gateway/tests/cognitive-meteorology/schema.py
```

Node conformance compares actual LocalField SQLite records, state, nonces and ledger; existing HOLD and ADMIT records; current standing; actual Git refs and working-tree files; Calendar fixture bytes; and native artifact files before/after 100 readings. A separate restricted Node process denies filesystem writes and subprocesses and observes no new Timeout/Immediate resources. This is bounded implementation evidence, not a universal proof for arbitrary programs or future integrations.

See [BUILD-REPORT.md](BUILD-REPORT.md), [PRESSURE-DIFFERENTIAL.md](PRESSURE-DIFFERENTIAL.md), and [REVIEW.md](REVIEW.md).
