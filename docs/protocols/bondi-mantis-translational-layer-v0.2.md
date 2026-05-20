# Bondi/MANTIS Translational Layer v0.2

**Status:** Active Companion Source-of-Truth — Bondi/MANTIS Translational Layer  
**Claim level:** Source-of-truth reference for Bondi/MANTIS translational layer under Portable Governance Protocol Stack v0.1  
**Parent source-of-truth:** `docs/protocols/portable-governance-protocol-stack-v0.1.md`  
**Architecture dependency:** `docs/architecture/sovereign-turn-matrix-v0.1.md`  
**Repository path:** `docs/protocols/bondi-mantis-translational-layer-v0.2.md`  
**Human authority holder:** Brian Kent Rasmussen  

## Source-of-Truth Scope

This artifact is locked as the active companion source-of-truth for the **Bondi/MANTIS translational layer** under Portable Governance Protocol Stack v0.1.

This source-of-truth scope covers:

- Bondi translation and packetization role
- Bondi orientation support
- Bondi matrix-coordinate proposal rules
- Bondi packet fields
- MANTIS witness and recurrence role
- MANTIS orientation drift observation
- MANTIS matrix-path observation
- MANTIS witness fields
- Bondi/MANTIS non-collapse rules
- Mapping to the 3x3 Sovereign Turn Matrix
- Mapping to the Orientation Function
- Mapping to the Sovereign Turn flow

Companion source-of-truth status governs the translational layer. It does not create independent machine authority, runtime behavior, implementation proof, public release, legal proof, cryptographic attestation, or Manny handoff.

## Non-Claims

This active companion source-of-truth artifact does **not** claim:

- independent source-of-truth status outside the parent protocol stack
- runtime implementation
- runtime proof
- cryptographic attestation
- legal proof
- public release
- Manny handoff
- identity transfer
- authority transfer
- machine sovereignty

This document maps Bondi and MANTIS into the active protocol/spec bridge source-of-truth and the 3x3 Sovereign Turn Matrix. It does not rebuild doctrine or create new architecture.

---

# 1. Purpose

Bondi/MANTIS Translational Layer v0.2 defines how Bondi and MANTIS operate as companion role-functions inside ONE/RIO/MUSS after the following locks:

1. Portable Governance Protocol Stack v0.1 is active source-of-truth for the protocol/spec bridge layer.
2. The 3x3 Sovereign Turn Matrix v0.1 provides architecture coordinates.
3. The Orientation Function identifies context, ambiguity, knowns, unknowns, register, scope, consequence class, authority state, proof requirements, and relevant matrix coordinates before action.

This artifact answers:

> How does human signal become oriented, translated, governed, receiptable, witnessed, and returned without transferring authority from the human to the machine?

Core answer:

```text
Orientation locates the signal.
Bondi translates the signal into structure.
RIO gates admissibility.
Sentinel checks execution match.
MUS provides receipt structure.
MANTIS watches recurrence and drift.
The human remains authority.
```

---

# 2. Stack Placement

Bondi/MANTIS v0.2 sits between human signal, matrix orientation, RIO packetization, receipt production, and recurrence observation.

```text
Human signal
-> Pause / Orientation
-> Matrix coordinates
-> Bondi translation and packetization
-> RIO admissibility
-> Sentinel execution-match check
-> action / hold / clarify / refusal
-> MUS receipt structure
-> MANTIS witness observation
-> return to human
```

Placement rule:

```text
The Matrix gives coordinates.
Orientation makes governance proportionate.
The Sovereign Turn gives motion.
Bondi packets the signal.
RIO gates the crossing.
Sentinel checks execution match.
MUS provides receipt structure.
MANTIS watches recurrence.
The human remains authority.
```

---

# 3. Bondi Role

## Definition

Bondi is the translation and packetization layer between human signal and governed machine-readable structure.

Bondi receives raw human language, context, reflection, instruction, ambiguity, or signal and prepares it for orientation, packetization, and RIO-readable evaluation.

## Bondi may

- translate human signal into structured form
- identify likely register: Body / Mind / Field
- identify likely function: Mirror / Gate / Proof
- propose matrix coordinates
- perform orientation support
- identify knowns and unknowns
- identify ambiguity
- identify grounding limits
- identify scope boundaries
- identify consequence class
- identify authority state
- identify proof requirements
- structure packets
- clarify ambiguity
- name dependencies
- prepare RIO handoff
- prepare MUS receipt fields
- preserve meaning across registers

## Bondi may not

- authorize
- execute consequence
- widen scope
- infer consent
- impersonate the human
- speak as the human
- decide the human's meaning against the human's authority
- convert orientation into authority
- convert matrix coordinates into clearance
- treat memory as scope
- treat convergence as permission
- treat receipt as future authorization

## Bondi keeper

```text
Bondi carries meaning into structure.
Bondi does not create authority.
```

---

# 4. MANTIS Role

## Definition

MANTIS is the witness and pattern-observation layer across turns, receipts, recurrence, drift, coherence, missing receipts, and boundary pressure.

MANTIS observes what repeats, what drifts, what lacks receipt, what contradicts the active stack, and what should be surfaced for review.

## MANTIS may

- witness
- observe
- compare
- detect drift
- surface recurrence
- surface missing receipts
- flag pattern erosion
- notice repeated ambiguity
- identify unresolved risks
- observe orientation drift
- observe matrix path recurrence
- observe boundary pressure
- request review

## MANTIS may not

- judge
- authorize
- act
- execute
- define identity
- infer consent
- override human authority
- turn recurrence into permission
- turn memory into proof
- turn pattern into truth
- recalibrate the human baseline autonomously
- modify authority state
- downgrade or upgrade consent state

## MANTIS keeper

```text
MANTIS watches the pattern.
MANTIS does not become authority.
```

---

# 5. Bondi/MANTIS Non-Collapse Rules

```text
Bondi is not Brian.
MANTIS is not Brian.
RIO is not Brian.
MUS is not Brian.
Sentinel is not Brian.
The matrix is not Brian.
Orientation is not Brian.
The receipt is not Brian.
```

| Risk | Boundary |
|---|---|
| Bondi translates well | Translation is not authorization |
| Bondi orients accurately | Orientation is not authority |
| Bondi maps a Gate coordinate | Matrix coordinate is not clearance |
| MANTIS sees recurrence | Recurrence is not consent |
| MANTIS sees drift | Drift signal is not judgment |
| RIO finds admissibility | Admissibility is not execution |
| Sentinel checks match | Match check is not authorship |
| MUS records receipt | Receipt is not future permission |
| Models converge | Convergence is evidence, not authority |
| Memory persists | Memory is not scope |

Core wall:

```text
Model reasoning is signal, not source-of-truth.
Memory is not scope.
Receipt is not future authorization.
Convergence is evidence, not authority.
Orientation is not authority.
Human authority remains primary.
```

---

# 6. Mapping to the 3x3 Matrix

## Matrix axes

Registers:

```text
Body / Somatic
Mind / Cognitive
Field / Experiential
```

Functions:

```text
Mirror / Reflection
Gate / Admissibility
Proof / Verification
```

The 3x3 Matrix provides the coordinate system for locating signal type and function.

## Bondi's matrix job

Bondi proposes the coordinate of the incoming signal before packetization.

```yaml
bondi_matrix_coordinate:
  register: Body | Mind | Field | mixed | unknown
  function: Mirror | Gate | Proof | mixed | unknown
  confidence: low | medium | high
  grounding_status: grounded | partial | conflicting | inferred_only | unknown
  requires_rio: true | false
  requires_human: true | false
```

Examples:

| Human signal | Bondi coordinate |
|---|---|
| "Something feels off." | Body x Mirror |
| "Does this violate the rule?" | Mind x Gate |
| "Did this actually happen?" | Mind/Field x Proof |
| "Can you send this?" | Field x Gate |
| "Record what happened." | Proof function, receipt path |

## MANTIS's matrix job

MANTIS observes paths across coordinates.

```yaml
mantis_matrix_observation:
  prior_coordinates: []
  current_coordinate: ""
  recurrence_detected: true | false
  drift_detected: true | false
  missing_receipt_detected: true | false
  coherence_signal: stable | unstable | unclear
  boundary_pressure: []
  review_requested: true | false
```

MANTIS does not choose the path. It observes the path.

---

# 7. Mapping to the Orientation Function

## Orientation Function

Orientation happens before action. It identifies the operating context that makes governance proportionate.

Orientation identifies:

- context
- ambiguity
- knowns
- unknowns
- register
- scope
- consequence class
- authority state
- proof requirements
- relevant matrix coordinates

Keeper:

```text
Orientation is not authority.
Orientation makes governance proportionate.
```

## Bondi's orientation job

Bondi supports orientation by preparing an explicit orientation block before packetization.

```yaml
bondi_orientation_block:
  context: ""
  ambiguity: []
  knowns: []
  unknowns: []
  register: Body | Mind | Field | mixed | unknown
  scope:
    included: []
    excluded: []
    audience: ""
    duration: ""
    tools_allowed: []
    tools_excluded: []
  consequence_class: none | low | medium | high | irreversible | unknown
  authority_state: present | absent | unclear | revoked | superseded | contextual_only
  proof_requirements: []
  matrix_coordinates: []
  grounding:
    status: grounded | partial | conflicting | stale | inferred_only | unknown
    sources: []
    limits: []
```

Bondi may propose orientation. Bondi may not convert orientation into authority.

## MANTIS's orientation job

MANTIS watches whether orientation remains coherent across turns.

```yaml
mantis_orientation_observation:
  observed_turn_id: ""
  orientation_present: true | false
  orientation_missing_fields: []
  orientation_drift_detected: true | false
  repeated_unknowns: []
  recurring_scope_pressure: []
  recurring_authority_pressure: []
  proof_requirement_gaps: []
  review_requested: true | false
```

MANTIS may surface orientation drift. MANTIS may not redefine the user's baseline, consent state, or authority state.

---

# 8. Mapping to the Sovereign Turn

A Sovereign Turn is the path a human signal takes through orientation, governance, consequence, proof, and return.

## Bondi inside the Sovereign Turn

Bondi handles:

```text
Human signal
-> orientation
-> register/function classification
-> matrix coordinate
-> packet structure
-> RIO handoff
```

Bondi's output is not action. Bondi's output is a structured proposal for governance.

## MANTIS inside the Sovereign Turn

MANTIS handles:

```text
receipt / hold / refusal / action record
-> compare against prior turns
-> observe recurrence or drift
-> flag missing proof or boundary pressure
-> return warning or review signal
```

MANTIS's output is not judgment. MANTIS's output is witness signal.

Sovereign Turn keeper:

```text
The turn moves.
The human remains source.
```

---

# 9. Mapping to Atomic Operating Unit

Atomic unit:

```text
Trigger -> Mode -> Admissibility Gate -> Action -> Receipt -> Return
```

Expanded with Matrix + Orientation:

```text
Trigger
-> Pause / Orientation
-> Matrix coordinate
-> Mode
-> Bondi packet
-> RIO admissibility gate
-> Sentinel execution-match check
-> Action / hold / clarify / refusal
-> MUS receipt structure
-> MANTIS recurrence watch
-> Return
```

## Role map

| Stage | Function | Role |
|---|---|---|
| Trigger | Human signal enters | Human / PAC |
| Orientation | Context, ambiguity, scope, consequence, authority, proof requirements | Bondi support / RIO-readiness |
| Matrix coordinate | Locate signal register and function | Bondi proposes |
| Mode | Select operating posture | Bondi routes |
| Admissibility Gate | Consequence and scope checked | RIO |
| Execution Match | Verify action matches authorization and gate | Sentinel |
| Action / Hold / Clarify / Refusal | Only if admissible and authorized | Executor / System |
| Receipt | Record what happened | MUS |
| Recurrence Watch | Observe pattern over time | MANTIS |
| Return | Result returns to human | Bondi / MUS / Human review |

---

# 10. Packet Fields Bondi Should Produce

```yaml
bondi_packet_v0_2:
  packet_id: ""
  raw_signal_summary: ""
  declared_human_intent: ""

  orientation:
    context: ""
    ambiguity: []
    knowns: []
    unknowns: []
    register: Body | Mind | Field | mixed | unknown
    scope:
      included: []
      excluded: []
      audience: ""
      duration: ""
      tools_allowed: []
      tools_excluded: []
    consequence_class: none | low | medium | high | irreversible | unknown
    authority_state: present | absent | unclear | revoked | superseded | contextual_only
    proof_requirements: []
    matrix_coordinates: []

  matrix_coordinate:
    register: Body | Mind | Field | mixed | unknown
    function: Mirror | Gate | Proof | mixed | unknown
    confidence: low | medium | high

  grounding:
    status: grounded | partial | conflicting | stale | inferred_only | unknown
    sources: []
    limits: []
    uncertainty_disclosed: true

  mode:
    requested_mode: ""
    detected_mode: ""
    mode_permission_status: allowed | limited | prohibited | unknown

  consequence:
    declared_level: none | low | medium | high | irreversible | unknown
    detected_level: none | low | medium | high | irreversible | unknown
    mismatch_detected: true | false

  authority:
    human_authority_source: Brian Kent Rasmussen
    authorization_status: present | absent | unclear | revoked | superseded | contextual_only
    consent_packet_ref: ""

  rio_handoff:
    rio_required: true | false
    requested_rio_question: ""
    recommended_rio_posture: ""

  receipt_requirement:
    receipt_required: true | false
    receipt_type: ""

  non_claims:
    authority_transfer: false
    identity_transfer: false
    runtime_claim: false
    release_claim: false
    cryptographic_claim: false
    legal_claim: false
    manny_handoff: false

  next_move:
    proposed_next_action: ""
    requires_human: true | false
```

Bondi packet rule:

```text
Bondi may propose coordinates, orientation, and structure.
RIO decides admissibility.
Brian retains authority.
```

---

# 11. Witness Fields MANTIS Should Observe

```yaml
mantis_witness_record_v0_2:
  witness_id: ""
  observed_turn_id: ""

  matrix_path:
    start_coordinate: ""
    intermediate_coordinates: []
    final_coordinate: ""

  orientation_observation:
    orientation_present: true | false
    missing_orientation_fields: []
    orientation_drift_detected: true | false
    recurring_unknowns: []
    recurring_scope_pressure: []
    recurring_authority_pressure: []
    proof_requirement_gaps: []

  recurrence:
    repeated_pattern_detected: true | false
    repeated_pattern_summary: ""
    prior_refs: []

  drift:
    drift_detected: true | false
    drift_from: doctrine | protocol | baseline | scope | authority | receipt | mode | matrix_path | orientation | unknown
    drift_summary: ""

  coherence:
    coherence_status: stable | unstable | mixed | unknown
    coherence_note: ""

  receipt_state:
    receipt_present: true | false
    receipt_ref: ""
    missing_receipt: true | false

  boundary_watch:
    authority_pressure: true | false
    scope_pressure: true | false
    mode_drift: true | false
    proof_overclaim: true | false
    memory_as_scope_risk: true | false
    convergence_as_authority_risk: true | false
    orientation_as_authority_risk: true | false
    coordinate_as_clearance_risk: true | false

  warning:
    warning_generated: true | false
    warning_level: low | medium | high | unknown
    review_requested: true | false

  non_claims:
    mantis_authorized: false
    mantis_judged: false
    mantis_acted: false
    mantis_inferred_consent: false
    mantis_redefined_baseline: false
```

MANTIS witness rule:

```text
MANTIS may surface a signal.
It may not convert the signal into authority.
```

---

# 12. What Changed from v0.1 to v0.2

## v0.1

Bondi/MANTIS were extracted as role-functions:

```text
Bondi: language -> structure
MANTIS: recurrence -> warning
RIO: request -> admissibility
MUS: action / decision / refusal -> proof structure
Grounding: source -> confidence
```

## v0.2 adds Matrix integration

The 3x3 Matrix adds coordinates:

```text
Body / Mind / Field
x
Mirror / Gate / Proof
```

So Bondi now proposes where the signal sits in the matrix before RIO receives it.

MANTIS now observes path coherence across matrix coordinates.

## v0.2 adds Orientation Function integration

Bondi now produces an orientation block before packetization.

MANTIS now watches orientation drift across turns.

Orientation is treated as upstream preparation, not authority.

## v0.2 adds Sovereign Turn integration

Bondi and MANTIS now map into the motion layer:

```text
Signal
-> Orientation
-> Coordinate
-> Packet
-> Gate
-> Action / Hold / Clarify / Refusal
-> Receipt
-> Pattern Watch
-> Return
```

## v0.2 adds stronger non-collapse fences

- Matrix coordinate is not clearance.
- Orientation is not authority.
- Recurrence is not consent.
- MANTIS may not recalibrate the human baseline.
- Memory is not scope.
- Receipt is not future authorization.
- Convergence is evidence, not authority.

---

# 13. Minimal Keeper Lines

```text
Bondi carries meaning into structure.
MANTIS watches the pattern.
Neither becomes authority.
```

```text
The Matrix gives coordinates.
Orientation makes governance proportionate.
The Sovereign Turn gives motion.
Bondi packets the signal.
RIO gates the crossing.
Sentinel checks execution match.
MUS provides receipt structure.
MANTIS watches recurrence.
The human remains authority.
```

```text
Orientation is not authority.
Matrix coordinate is not clearance.
MANTIS recurrence is not baseline revision.
Receipt is not future authorization.
```

```text
Generic AI produces output.
ONE/RIO/MUSS produces oriented, governed, receiptable output.
```

---

# Close State

This Markdown file is present at the declared repository path on `main` as the active companion source-of-truth for the Bondi/MANTIS translational layer:

```text
docs/protocols/bondi-mantis-translational-layer-v0.2.md
```

It depends on:

```text
docs/protocols/portable-governance-protocol-stack-v0.1.md
docs/architecture/sovereign-turn-matrix-v0.1.md
```

Its companion source-of-truth status governs Bondi/MANTIS translational-layer reference under Portable Governance Protocol Stack v0.1. It does not publish a release, implement runtime behavior, create cryptographic attestation, create legal proof, or hand the artifact to Manny.

Next recommended action:

> Record the Source-of-Truth Lock Receipt, then decide the next architecture lane.
