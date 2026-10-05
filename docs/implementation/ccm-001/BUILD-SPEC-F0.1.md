# CCM-001 — Constitutional Computational Medium
## Builder Packet F0.1

**Build lane:** Implement now. Do not reopen ONE's frozen identity or the frozen double-arrow geometry absent contradiction or implementation evidence.

## 1. Build Objective

Build the smallest functioning Constitutional Computational Medium that can maintain many independently constituted relational intervals and answer, deterministically and reconstructably:

- What presently stands between A and B?
- Why does it stand?
- Whose is it?
- Under what standing?
- What passages are open?
- What changed?
- What may rightfully follow?

The medium must preserve addressable difference and answerable relation without synthesizing a sovereign master interpretation of participants.

**Candidate realization name:** OneField. The implementation earns the name; CCM-001 is the neutral build identifier.

## 2. Frozen Reference Geometry

### Outbound — Governed Actualization

Meaning  
→ Standing Transformation  
→ World

Checksum: **May this become consequential?**

### Inbound — Governed Integration

World  
→ Standing Transformation  
→ Meaning′

Checksum: **May this become orienting?**

Both arrows move forward in time. Return is the hinge / phase boundary opening the inbound passage. The arrows are independently typed but form one circulation.

Invariant: **PRESERVE ANSWERABILITY THROUGH TRANSFORMATION.**

Underlying operator: **What presently stands, under what standing, and what may rightfully follow?**

Anti-laundering separations:

- Prediction ≠ Permission.
- Observation ≠ Truth.
- Outcome ≠ Retroactive Authorization.
- Authorization ≠ Evidentiary Conclusion.
- Progression does not confer promotion.

Technical reading of PACK THE INTERVAL:

**Represent the standing transformations that an opaque arrow would otherwise hide.**

## 3. Kernel Model

### 3.1 Participant

```text
Participant {
  participant_id
  participant_kind
  root_lineage
  status
}
```

Participant identity does not imply standing, authority, jurisdiction, or inheritance in any interval.

### 3.2 ConstitutedInterval

```text
ConstitutedInterval {
  interval_id
  endpoint_a
  endpoint_b
  relation_type

  standing
  authority_source
  scope
  boundaries

  lineage_head
  dependencies[]
  open_passages[]
  commitments[]
  returns[]
  residue[]

  created_at
  superseded_by?
  status
}
```

Standing belongs to the interval. Shared endpoints do not create shared standing.

Canonical morphology:

```text
A  I_AB,t[R_AB,t]  B
```

### 3.3 Passage

```text
Passage {
  passage_id
  interval_id
  direction: OUTBOUND | INBOUND | CROSS_INTERVAL

  source
  referent
  relation_type
  authority
  scope
  payload_ref
  uncertainty
  dependencies[]
  predecessor_binding
  return_contract

  standing
  disposition: ADMIT | HOLD | DENY
  created_at
  completed_at?
}
```

Every promotion requires its own warrant. Stage order never grants standing.

### 3.4 ReturnArtifact

```text
ReturnArtifact {
  return_id
  passage_id
  occurrence_ref
  witness_refs[]
  observation_refs[]
  evidence_refs[]
  residue[]
  lineage_hash
  returned_at
}
```

Return is a hinge, not a promotion operator. Return does not confer truth, evidence, orientation, authority, or retroactive legitimacy.

### 3.5 StandingTransition

```text
StandingTransition {
  transition_id
  subject_ref
  from_standing
  to_standing
  warrant_ref
  dependency_hash
  predecessor_hash
  disposition
  timestamp
}
```

No standing mutation without an attributable transition artifact.

## 4. Required Query Contract

Implement deterministic query surfaces equivalent to:

```text
WhatStands(A, B, t?)
WhyDoesItStand(interval_id, t?)
UnderWhoseAuthority(interval_id, t?)
OpenPassages(interval_id, t?)
WhatMayRightfullyFollow(interval_id, candidate_operation, t?)
ShowLineage(subject_ref)
WhatChanged(return_id)
CrossIntervalAdmissibility(source_interval, target_interval, payload_ref)
```

Responses must distinguish **unknown / absent / denied / held** states. Do not collapse them.

Every consequential answer must be reconstructable to source artifacts and transition lineage.

## 5. Isolation Rules

1. **Relation ≠ Inheritance.**
2. Same participant ≠ same relationship ≠ same standing.
3. Participant identity never implies interval authority.
4. Information propagation ≠ standing propagation.
5. Cross-interval movement requires its own typed passage.
6. A shared endpoint does not permit context leakage.
7. No global participant model may silently become a source of standing.
8. No endogenous coronation operator exists.

At field scale:

**GLOBAL ADDRESSABILITY WITHOUT GLOBAL SOVEREIGNTY.**

## 6. Double-Arrow Independence

The implementation must permit all four quadrants:

| Outbound standing | Inbound standing | Required behavior |
|---|---|---|
| lawful | supported | consequence may be lawful; orientation may be admitted |
| lawful | unsupported | outbound remains lawful; inbound HOLD/DENY |
| unlawful | supported | occurrence may be truthfully evidenced; outbound remains unlawful |
| unlawful | unsupported | neither side earns promotion |

Required non-conversions:

```text
prediction !-> permission
observation !-> truth
outcome !-> retroactive_authorization
authorization !-> evidentiary_conclusion
```

Inbound evidence must never rewrite outbound disposition. Outbound authorization must never force inbound adjudication.

## 7. Cross-Interval Passage

Given:

```text
I_AB
I_AC
```

sharing participant A:

```text
Standing(I_AB) !-> Standing(I_AC)
```

If information must move:

```text
I_AB --P_cross--> I_AC
```

`P_cross` must have independent source, referent, relation type, authority, scope, payload, uncertainty, dependencies, and Return contract.

A permitted notification may cross while authority does not.

## 8. Event and Persistence Model

Use an append-only event ledger for constitutional facts. Materialized/indexed views are permitted for speed, but must be derivable from the ledger.

Minimum event families:

```text
ParticipantRegistered
IntervalConstituted
IntervalSuperseded
StandingProposed
StandingAdmitted
StandingHeld
StandingDenied
AuthorityGranted
AuthorityRevoked
ScopeChanged
DependencyChanged
PassageOpened
PassageCommitted
AttemptRecorded
OccurrenceRecorded
ReturnOpened
WitnessRecorded
ObservationRecorded
EvidenceAdmitted
JudgmentRecorded
OrientationAdmitted
CrossIntervalPassageOpened
ResidueRecorded
```

Past disposition is immutable. Successor facts supersede; they do not rewrite.

## 9. Lineage and Integrity

Every consequential artifact must bind:

- exact subject
- predecessor
- dependencies
- authority/warrant
- interval
- passage
- source
- Return contract where applicable

Use deterministic canonical serialization plus cryptographic hashes for specimen integrity.

Changing a dependency invalidates stale decisions bound to the previous dependency set.

## 10. Hostile Fixture Suite

Implement at minimum:

### H-01 Same Participant, Different Standing
A participates in I_AB and I_AC. Same payload; one interval authorized, one observe-only. No standing leakage.

### H-02 Explicit Information Passage, No Authority Passage
A notification is admissible from I_AB to I_AC. Authority remains local.

### H-03 Stale Delegation
Authority valid at t1, revoked at t2, stale commitment arrives at t3. Must not execute.

### H-04 Out-of-Order Return
Returns arrive in non-creation order. Each binds to exact passage and cannot mutate unrelated interval state.

### H-05 Unauthorized Occurrence, Valid Evidence
Outbound DENY; event nevertheless occurs externally. Inbound may admit evidence that occurrence happened without retroactive authorization.

### H-06 Authorized Action, Bad Evidence
Outbound lawful; observation provenance invalid. Inbound HOLD/DENY.

### H-07 Identical Payload, Different Standing
Byte-identical payloads in different intervals produce different admissibility based on interval standing.

### H-08 Context Leakage Attempt
Model/context from I_AB attempts to influence I_AC without a cross-interval passage. Reject or HOLD.

### H-09 Authority Inheritance Attempt
Shared human, model, Office, or institution is used to infer authority in another interval. DENY.

### H-10 Dependency Drift
Change a bound dependency after commitment. Stale decision invalidates.

### H-11 Receipt Rewrite Attempt
Return/receipt attempts to rewrite prior disposition. Reject.

### H-12 Cross-Thread / Cross-Interval Subject Drift
Artifact valid for one exact subject is replayed against another. Reject.

## 11. Scale Stages

Do not optimize prematurely. Preserve correctness first.

### Stage S1
10 participants / 100 active intervals.

Goal: every hostile fixture inspectable by hand.

### Stage S2
100 participants / 10,000 active intervals.

Goal: preserve invariants under concurrency and indexing.

### Stage S3
1,000 participants / 100,000 active intervals.

Goal: field-scale queryability and reconstruction.

Measure:

- p50 / p95 / p99 query latency
- ledger write throughput
- lineage reconstruction latency
- index/storage overhead
- stale-state detection latency
- cross-interval isolation failures (must be zero)
- unauthorized standing inheritance (must be zero)
- historical rewrite failures (must be zero)

## 12. Acceptance Criteria

CCM-001 passes F0.1 when:

1. `WhatStands(A,B)` returns interval-specific standing without deriving it from participant identity.
2. Every standing transition has attributable warrant and predecessor lineage.
3. Cross-interval information moves only through explicit passages.
4. No cross-interval authority inheritance occurs.
5. Outbound and inbound dispositions remain independently typed.
6. Return cannot rewrite outbound standing.
7. Authorization cannot manufacture inbound truth.
8. Dependency changes invalidate stale commitments/decisions.
9. Exact-subject binding blocks replay/drift.
10. Historical state can be reconstructed from append-only events.
11. All hostile fixtures pass at S1 and S2 before S3 scaling.
12. At S3, the medium answers the core field queries without constructing a sovereign master interpretation of participants.

## 13. Explicit Non-Goals for F0.1

Do not add unless required to satisfy the kernel:

- new AI model
- semantic omniscience layer
- quantum implementation
- photonic implementation
- cognitive economy
- public commons
- rich UI
- autonomous self-amendment
- global participant ontology
- implicit cross-context memory
- new constitutional authority source

Keep the specimen boring.

## 14. Suggested Implementation Shape

Use the existing HLSI/ONE build stack where practical.

Reference shape:

```text
domain/
  participant
  interval
  passage
  standing
  return
  lineage

ledger/
  append_only_events
  canonical_serialization
  hashing

index/
  participant_to_intervals
  interval_by_relation
  active_passages
  standing_by_interval
  dependency_reverse_index

engine/
  transition_gate
  cross_interval_gate
  double_arrow_gate
  stale_dependency_invalidator

query/
  what_stands
  why
  authority
  lineage
  open_passages
  may_follow
  changed_after_return

tests/
  hostile/
  scale/
  property/
```

Prefer deterministic pure transition functions around the constitutional kernel. Keep model/LLM inference outside the authority-bearing transition core.

## 15. Builder Sequence

1. Create domain types and canonical serialization.
2. Implement append-only ledger.
3. Implement interval constitution and standing transitions.
4. Implement outbound/inbound passage typing.
5. Implement Return hinge.
6. Implement cross-interval passage.
7. Implement query contract.
8. Implement H-01 through H-12.
9. Run S1 and repair.
10. Run S2 and repair.
11. Add indexes only where measurements require them.
12. Run S3.
13. Produce conformance report with failures, repairs, timings, and invariant results.

Do not silently broaden scope during implementation.

## 16. Builder Deliverables

Return:

1. Source code for CCM-001.
2. Machine-readable schemas/types.
3. Migration/storage schema if persistent storage is used.
4. H-01–H-12 fixture definitions.
5. Automated test suite and raw test output.
6. S1/S2/S3 benchmark harness and results.
7. Query examples for every required query surface.
8. One lineage reconstruction example end-to-end.
9. One cross-interval passage example end-to-end.
10. One double-arrow independence example end-to-end.
11. `CONFORMANCE.md` mapping every acceptance criterion to implementation evidence.
12. `OPEN_ISSUES.md` containing only unresolved implementation findings; do not reopen frozen ontology without a demonstrated contradiction.

## 17. Builder Instruction

**Build; do not rename.**

Treat ONE's frozen ontology and double-arrow geometry as supplied requirements. Instantiate them. Surface contradictions with reproducible evidence. Do not promote implementation convenience into architectural authority.

The implementation question is:

> Can the medium preserve addressable difference and answerable relation through transformation at field scale?

If yes, the candidate realization name **OneField** has earned operational standing.
