BUILDER PROMPT — COGNITIVE METEOROLOGY F0.1

Build the first bounded reference implementation of Cognitive Meteorology inside the existing ONE/RIO/MUSS architecture.

STATUS

This work is below the Conformance Cut.

It is an:

IMPLEMENTATION + CONFORMANCE + TESTING

task.

Do not modify or reinterpret frozen constitutional architecture.

The governing research rule is:

Freeze above the cut. Experiment below it. Return evidence across it. Amend only through standing.

The relevant frozen Constitutional Minimum remains:

* Difference must remain addressable.
* Transformation must remain answerable.
* Progression must not manufacture promotion.

Compiler law:

No artifact gains standing merely by successful transformation.

This implementation must conform to those commitments. It does not define or amend them.

⸻

SUBSYSTEM

Cognitive Meteorology — F0.1

Purpose:

Cognitive Meteorology reads changing conditions across connected systems and shows people what may be forming.

Operating law:

The radar maps the front. The radar does not move the ship.

Intake law:

Source Retains the Data. The Field Reads the Delta.

Visibility/authority law:

The radar may change what is visible. It does not change what is authorized.

⸻

PHASE 1 SCOPE

Implement only two source domains:

1. Calendar
2. Git

Do not add Mail, Slack, banking, biometrics, health, external sensors, or additional domains in this phase.

Do not ingest raw source content into OneField or the Cognitive Meteorology engine.

⸻

1. EDGE-SCOPED EXTRACTION

Raw source data remains inside the source boundary.

Implement bounded feature extractors that emit only normalized field signals.

Calendar extractor

Produce at minimum:

* available_time_margin
* meeting_density
* buffer_compression

Git extractor

Produce at minimum:

* open_pr_age
* review_latency
* commit_velocity

No raw calendar event contents.

No attendee names unless required by an existing authorized test fixture.

No commit contents.

No source code.

No PR bodies.

No repository secrets.

The meteorology core receives only derived signals.

⸻

2. FIELD SIGNAL TYPE

Do not represent a delta as an unsigned scalar alone.

Create a typed signal similar to:

FieldSignal {
    signal_id
    metric
    magnitude          // normalized 0.0–1.0
    direction          // RISING | FALLING | STABLE
    rate_of_change
    observation_window
    source_domain
    extractor_id
    extractor_version
    timestamp
}

Exact implementation language may vary, but preserve these distinctions:

state + direction + velocity + observation window

Do not erase directionality during normalization.

⸻

3. COGNITIVE METEOROLOGY ENGINE

The engine receives only FieldSignal artifacts.

It may:

* compare signals across domains;
* calculate gradients;
* identify converging or diverging conditions;
* classify candidate atmospheric regimes;
* produce a structured Fieldoscopy Reading.

It may not:

* schedule tasks;
* send messages;
* modify calendars;
* modify Git branches;
* merge PRs;
* create execution leases;
* authorize action;
* issue ADMIT/HOLD/DENY;
* mutate standing.

Observation must remain distinct from disposition.

Formally preserve:

FieldoscopyReading != ConstitutionalDisposition

and:

Observation != Authorization

⸻

4. ATMOSPHERIC PRIMITIVES

Support the following candidate regimes for F0.1:

HIGH_PRESSURE
LOW_PRESSURE
COLD_FRONT
WARM_FRONT
WIND_SHEAR
INVERSION
CLEAR_HORIZON
PRESSURE_DIFFERENTIAL

Important:

Do not assume yet that PRESSURE_DIFFERENTIAL is permanently the same kind of object as the other regimes.

Treat this as an implementation question.

Instrument whether pressure differential behaves as:

A. a peer atmospheric regime;

or

B. an underlying relational operator from which other regimes may be derived.

Return evidence from implementation. Do not resolve this by naming preference.

⸻

5. F0.1 PRIMARY TEST CONDITION

Create a synthetic fixture with approximately these conditions.

Calendar

available_time_margin = 0.12
three consecutive meetings with no meaningful buffer
high meeting density

Git

open_pr_mean_age = 84 hours
commit_velocity = +300% relative to rolling 7-day median
review capacity / turnaround deteriorating

The system should detect the divergence:

production activity ↑
review capacity ↓
available time ↓

and identify a candidate:

PRESSURE_DIFFERENTIAL

The human-readable interpretation may resemble:

Development activity is rising faster than available review capacity. Calendar space is also tightening. Conditions are forming for a possible review bottleneck over the next 24–48 hours.

Do not hard-code that sentence if the architecture already has an appropriate projection mechanism.

⸻

6. FIELDOSCOPY READING ARTIFACT

Create:

/schemas/metascope-fieldoscopy-reading.json

using JSON Schema Draft 2020-12 unless repository conventions require another existing standard.

The machine-readable artifact should include at minimum:

reading_id
timestamp
atmospheric_regime
signal_manifest[]
    signal_type
    magnitude
    direction
    rate_of_change
    observation_window
    source_domain
    extractor_id
    extractor_version
visibility
confidence
current_conditions
primary_drivers[]
forming_fronts[]
unresolved_remainder

No raw source content belongs in this artifact.

The artifact must carry enough lineage to answer:

Why did the radar produce this reading?

⸻

7. KEEP MACHINE ARTIFACT AND HUMAN DISPLAY DISTINCT

Preserve:

FieldoscopyReading != MetascopeProjection

The FieldoscopyReading is the attributable machine artifact.

The MetascopeProjection is the human-facing rendering.

The first Metascope display should expose four clear sections:

Current Conditions

What appears to be happening now.

What’s Driving It

The strongest observable contributors.

What’s Forming

Possible near-term movement.

What We Can’t See Yet

Important missing or unresolved information.

Use plain human language.

Avoid composite “stress scores” such as:

Stress Index = 78/100

Prefer descriptive conditions.

⸻

8. ZERO-ACTUATION BOUNDARY

The core F0.1 conformance test must demonstrate that detection changes visibility only.

Do not assert:

gate_zero.current_standing() == "HOLD"

A meteorological reading must not itself generate HOLD or any other constitutional disposition.

Instead assert equivalent zero-effect properties such as:

reading = cognitive_meteorology_engine.evaluate(
    calendar_signals,
    git_signals
)
assert reading.atmospheric_regime == "PRESSURE_DIFFERENTIAL"
assert reading.unresolved_remainder is not None
assert gate_zero.new_dispositions_count() == 0
assert runtime.scheduled_tasks_count() == 0
assert runtime.outbox_messages_count() == 0
assert git.modified_branches_count() == 0

Adapt names to the actual codebase.

The invariant being tested is:

The radar may change what is visible. It does not change what is authorized.

⸻

9. CALM SKY PRINCIPLE

Do not build a notification engine in F0.1.

The subsystem should support a pull-style interaction equivalent to:

“What’s the weather around this project?”

No autonomous alerts are required except where an already-existing, separately authorized Class A safety mechanism explicitly consumes observational context.

Do not create such a mechanism as part of this task.

⸻

10. DATA BOUNDARY TESTS

Add tests proving that the Cognitive Meteorology core does not receive raw:

* calendar descriptions;
* email/message bodies;
* source code;
* PR body text;
* banking transaction descriptions;
* biometric traces.

For Phase 1, Calendar + Git are the only active sources.

At minimum, test that extractor output contains only the declared scoped fields and provenance needed for the reading.

⸻

11. REQUIRED DELIVERABLES

Return all of the following:

A. Schema

metascope-fieldoscopy-reading.json

B. Typed FieldSignal implementation

Including direction, rate-of-change and observation window.

C. Calendar extractor stub

Producing the three bounded Calendar signals.

D. Git extractor stub

Producing the three bounded Git signals.

E. Cognitive Meteorology evaluator

Capable of detecting the Phase 1 pressure differential.

F. Metascope projection

Rendering:

* Current Conditions
* What’s Driving It
* What’s Forming
* What We Can’t See Yet

G. Zero-actuation conformance test

Proving no disposition or world action follows merely from the reading.

H. Data-minimization tests

Proving raw source content does not cross into the meteorology core.

I. Pressure Differential implementation note

Report whether implementation evidence suggests:

PRESSURE_DIFFERENTIAL = regime

or:

PRESSURE_DIFFERENTIAL = underlying relational operator

Do not promote either conclusion beyond implementation evidence.

J. Build report

Include:

files added
files modified
tests added
tests passing
known gaps
constitutional/conformance observations
recommended next experiment

⸻

12. DO NOT EXPAND SCOPE

Do not:

* add additional sensor domains;
* redesign OneField;
* redesign Gate Zero;
* create new constitutional doctrine;
* change the Constitutional Minimum;
* add autonomous remediation;
* add task scheduling;
* add recommendations that automatically execute;
* create a generalized “energy score”;
* create a universal stress score;
* centralize source data;
* infer private raw content from normalized signals.

Keep F0.1 deliberately narrow.

⸻

SUCCESS CONDITION

F0.1 succeeds if the system can answer:

What is changing across Calendar and Git that neither system can see alone?

while proving simultaneously that:

Source retains the data.

The field reads only the bounded signal.

The Metascope makes the cross-domain condition visible.

No action or constitutional disposition is produced merely because the condition was observed.

Build that specimen first.

Return implementation evidence before proposing expansion.
