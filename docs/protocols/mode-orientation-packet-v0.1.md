# Mode Orientation Packet v0.1

**Status:** Protocol Artifact Candidate  
**Claim level:** Session orientation protocol candidate  
**Parent context:** `docs/SOURCE_MAP.md`  
**Related sources:**  
- `docs/protocols/portable-governance-protocol-stack-v0.1.md`
- `docs/protocols/bondi-mantis-translational-layer-v0.2.md`
- `docs/architecture/sovereign-turn-matrix-v0.1.md`

**Runtime claim:** false  
**Source-of-truth lock:** false until separately authorized  
**Human authority holder:** Brian Kent Rasmussen

## Purpose

Mode Orientation Packet v0.1 defines how a session loads the correct operating frame before reflection, routing, or action.

A session is not just chat history. A session is a governed operating frame composed of:

```text
Doctrine
Source of Truth
Current Context
```

Core keeper:

```text
Mode orients the machine to the human before the machine reflects, routes, or acts.
```

This protocol candidate helps a human or system declare:

- what mode is active,
- which rules of engagement apply,
- which source files govern the mode,
- what current context has changed,
- what interaction calibration should be used,
- what boundaries apply before reflection, routing, or action,
- and what should be treated as stale, uncertain, or out of scope.

## Non-Claims

This file does **not** claim:

- runtime implementation,
- active session-loading automation,
- source-of-truth promotion,
- public release,
- cryptographic attestation,
- legal proof,
- Manny handoff,
- identity transfer,
- authority transfer,
- machine sovereignty,
- or automatic agent memory behavior.

Repo placement makes the packet candidate visible for review. It does not make it active runtime behavior.

## Core Distinction

Mode Orientation Packet is not memory by itself.

It is a human-declared orientation object that tells a model or agent how to use memory, current sources, current context, and rules of engagement for a specific session mode.

```text
Memory is not scope.
Context is not authority.
Mode is not permission.
Orientation is not authority.
```

## Session Orientation Triad

### 1. Doctrine

Doctrine is the enduring orientation layer.

It answers:

- What does not collapse?
- Who holds authority?
- What relationship is active?
- What invariants govern this mode?
- What boundaries apply before action?

Doctrine may include:

- constitutional invariants,
- mode-level rules,
- human authority rules,
- consent boundaries,
- tone and interaction rules,
- non-collapse rules,
- and current operating posture.

### 2. Source of Truth

Source of Truth is the current reference layer for the mode.

It answers:

- Which repo files matter?
- Which Drive docs, packets, receipts, or prior decisions govern this mode?
- Which personal rules are active?
- Which financial, project, emotional, operational, or strategic states are relevant?
- Which sources are active, candidate, stale, or superseded?

Source of Truth is mode-specific.

Examples:

- Architecture Mode may use repo architecture files.
- Business Mode may use business plans, finances, deadlines, and current strategy.
- Personal Reflection Mode may use Personal Constitution and human-declared reflection rules.
- Implementation Mode may use GitHub source map, issues, PRs, tests, and repo state.

### 3. Current Context

Current Context is the living update layer.

It answers:

- What changed recently?
- What is active now?
- What constraints exist?
- What stressors, deadlines, family realities, money realities, energy levels, or strategic pressures matter?
- What is stale from previous sessions?
- What does the human want the machine to know before responding?

The machine can only self-calibrate against context it has been given.

Keeper:

```text
Clean sources produce a clean mirror. Stale sources produce distorted assistance.
```

## Operating Calibration

A Mode Orientation Packet may define how the machine should interact with the human in a specific mode.

Example calibration:

```text
Report cleanly.
Do not negate.
Do not artificially dampen belief.
Stay grounded without flattening momentum.
Reflect the architecture as it is.
```

Balanced form:

```text
Belief without inflation.
Friction without negation.
Precision without collapse.
Momentum with governance.
```

This calibration is not a permission to exaggerate, overclaim, flatter, or suppress risk.

It is a rule to avoid distortion in either direction.

## Agent Memory Correction

Agent memory should define a lens, not a recurring checklist.

Incorrect pattern:

```text
Answer these ten questions every turn.
```

Correct pattern:

```text
Use this operating lens, expertise, source stack, posture, and boundary discipline when relevant.
```

Examples:

| Agent / role | Mode lens | Not this |
|---|---|---|
| Quantum Agent | Quantum-substrate realism and capability analysis | Do not answer quantum questions every turn if not relevant |
| Architecture Agent | Coherence, non-collapse, source discipline, relationship between layers | Do not create endless new doctrine |
| Implementation Agent | Repo reality, tests, smallest useful build, failure modes | Do not ship everything by default |
| Bondi | Translation, packetization, mode loading, structure carrying | Do not authorize or execute |
| MANTIS | Drift, recurrence, stale-source detection, witness observation | Do not judge or recalibrate human authority |

Keeper:

```text
Agent memory defines how to read, not what to repeat.
```

## Bondi / MANTIS Relationship

Mode Orientation Packet connects directly to the Bondi/MANTIS Translational Layer.

Bondi may:

- load or reference the active mode packet,
- identify source stack requirements,
- translate human signal into structured packet form,
- propose matrix coordinates,
- surface missing context,
- and route toward RIO-readable structure.

Bondi may not:

- authorize,
- execute,
- infer consent,
- widen scope,
- impersonate the human,
- or convert orientation into authority.

MANTIS may:

- watch whether the current mode still matches the situation,
- detect stale context,
- flag repeated friction,
- surface drift between map and terrain,
- notice when a mode packet may need revision,
- and request human review.

MANTIS may not:

- recalibrate the human,
- change consent state,
- change authority state,
- define identity,
- execute,
- authorize,
- or turn recurrence into permission.

Keeper:

```text
Bondi updates the map. MANTIS watches whether the map still matches the terrain.
```

## Minimal Packet Shape

```yaml
mode_orientation_packet_v0_1:
  packet_id: "mode-orientation-example"
  mode_name: "Architecture Mode"
  status: active | draft | stale | superseded
  human_authority_holder: "human_id_or_name"

  doctrine:
    invariants:
      - "human authority remains primary"
      - "orientation is not authority"
      - "memory is not scope"
      - "receipt is not future authorization"
    relationship_posture: "builder / collaborator / reviewer / witness"
    interaction_calibration:
      - "report cleanly"
      - "do not negate"
      - "stay grounded without flattening momentum"

  source_of_truth:
    active_repo_files:
      - "docs/SOURCE_MAP.md"
      - "docs/protocols/portable-governance-protocol-stack-v0.1.md"
    active_drive_docs: []
    active_receipts: []
    stale_sources: []
    unresolved_source_questions: []

  current_context:
    timestamp: "iso8601"
    current_reality_update: "what changed since last session"
    active_constraints: []
    emotional_or_energy_state: "optional_human_declared"
    financial_or_operational_constraints: "optional_human_declared"
    current_goal: "what this session is for"

  routing:
    allowed_operations:
      - reflect
      - draft
      - packetize
      - map
    require_human_approval_for:
      - repo_mutation
      - external_send
      - public_release
      - runtime_execution
    receipt_expectation: none | lightweight | required

  non_claims:
    runtime_implementation: false
    public_release: false
    authority_transfer: false
    machine_sovereignty: false
```

## Example Invocation

A human may invoke a packet by saying:

```text
Load Architecture Mode. Check the Source Map. Use builder calibration. Apply current repo state. No public-claim expansion. Proceed with implementation mapping.
```

Or:

```text
Load Money Stress Mode. Use current finance reality. Be direct but calming. Do not suggest expensive actions. Focus on the next controllable move.
```

These invocations do not create authority by themselves. They orient the session.

## Non-Collapse Rules

```text
Mode is not authority.
Mode is not permission.
Memory is not scope.
Context is not consent.
Source map points; it does not govern.
Personal calibration is not universal doctrine.
Agent lens is not recurring checklist.
Orientation is not execution.
Clean mirror requires current sources.
Human remains authority.
```

## Relationship to Existing Sources

Mode Orientation Packet depends on:

- `docs/SOURCE_MAP.md` for repo navigation,
- `docs/protocols/portable-governance-protocol-stack-v0.1.md` for protocol/spec bridge discipline,
- `docs/protocols/bondi-mantis-translational-layer-v0.2.md` for Bondi/MANTIS role boundaries,
- `docs/architecture/sovereign-turn-matrix-v0.1.md` for matrix coordinates and orientation function.

It does not replace any of them.

## Current Recommended Placement

This file is a protocol artifact candidate.

Recommended future companion:

```text
docs/protocols/b-rass-interaction-calibration-v0.1.md
```

That future companion may define a personal calibration packet for Brian/B-Rass specifically.

The current file remains general.

## Close State

Mode Orientation Packet v0.1 is a repo-visible protocol candidate.

It defines how sessions may load doctrine, source-of-truth, current context, and interaction calibration before reflection, routing, or action.

It does not claim runtime implementation, source-of-truth promotion, public release, or machine authority.

Final keeper:

```text
Mode orients the machine to the human before the machine reflects, routes, or acts.
```
