# Constitutional Becoming Spine F0.1

| Field | Value |
|---|---|
| Artifact type | Frozen estate reconciliation and conformance view |
| Standing | `FROZEN_ESTATE_RECONCILIATION` |
| Runtime effect | `NONE` |
| Authority effect | `NONE` |
| Canon effect | `NONE` |
| Machine crosswalk | `becoming-spine-crosswalk.json` |

## 1. Disposition

The thirteen-burden Becoming Spine is adopted here as a frozen conformance view
over the existing technical estate:

\[
\begin{aligned}
&\text{Possibility}
\to \text{Preparation}
\to \text{Choice}
\to \text{Commitment}
\to \text{Attempt}
\to \text{Occurrence}
\to \text{Consequence}\\
&\to \text{Witness}
\to \text{Evidence}
\to \text{Return}
\to \text{Reconstruction}
\to \text{Settlement}
\to \text{Inheritance}.
\end{aligned}
\]

This is not a from-scratch ontology. The types, operators, non-conversions,
causal joins, failure states, and bounded executable paths already exist across
CM-Core/ONE-RCC, TOP, RGCB, Golden Crossing, CHR, PBR, and the ONE V1 bounded
assemblies. This artifact makes their common temporal surface explicit.

The freeze fixes:

- the thirteen burden names and their human-facing display order;
- their mapping to existing carriers;
- the rule that the underlying topology is a typed causal hypergraph, not a
  thirteen-state linear automaton;
- the eight-surface projection in Section 7;
- the conservation pair in Section 4.

It does not overwrite an existing carrier, rename a repository type, install a
runtime, grant authority, or claim production or mathematical-proof standing.

## 2. What already exists

The corpus already supplies all of the following:

- a candidate minimum artifact spine whose stages may be composed only when
  their responsibilities remain separately recoverable;
- an operator inventory with explicit signatures, typed failure results,
  standing-change records, retry/replay semantics, and non-promotion laws;
- an admitted and frozen single-edge runtime profile with an explicit causal
  join and a 102-test reference specimen;
- an executable transition-occurrence protocol with zero-to-many cardinality,
  independent evidence admission, typed succession judgment, and 16 tests;
- a frozen seven-operator grammar for becoming, reconstruction, and succession;
- executable SourcePoint authorship, return, reconstruction, open-settlement,
  inheritance, and same-endpoint/different-history specimens;
- a stacked bounded assembly that begins at exact `AuthoredIntent`, reaches
  conditional successor context, and records 590/590 combined finite tests.

The result of this pass is therefore consolidation and an exact binding
specification—not a decision to wait for temporal structure to be invented.

## 3. The thirteen burdens and their carriers

| # | Burden | Strongest existing carriers | Current binding |
|---:|---|---|---|
| 1 | Possibility | `ScenarioSet`, `PreparedPossibilityField`, `RENEWED(P)` | Explicit candidate semantics; front edge is documentation-only |
| 2 | Preparation | `RehearsalRun`, `ProspectiveCommitment`, PREPARE/PRESERVE/CORRESPOND/REVALIDATE/ORIENT | Explicit candidate semantics; front edge is documentation-only |
| 3 | Choice | `SourcePointAuthorshipDeclaration`, `CandidateIntent` | Executable bounded join |
| 4 | Commitment | `Intent`, `SourcePointAuthorshipReceipt`, `TranslationCommitment`, `ViewBoundCrossingCommit` | Executable distributed bindings; types remain distinct |
| 5 | Attempt | `AttemptAdmission`, `TranslationAttempt`, `ExecutionAttempt`, lineage bundles | Executable; one cardinality collision is recorded below |
| 6 | Occurrence | `TranslationOccurrence`, `OccurrenceBinding`, `TransitionOccurrence` | Executable bounded profiles |
| 7 | Consequence | actual/authorized/observed delta surfaces, `DeltaSettlementInput`, `BoundedConsequenceReturn` | Executable distributed profiles |
| 8 | Witness | `TranslationObservation`, TOP `Observation` | Executable bounded profiles |
| 9 | Evidence | `TranslationEvidenceAssessment`, TOP `EvidenceAssessment`, `StageEvidenceBundle` | Executable bounded profiles |
| 10 | Return | semantic/runtime/occurrence receipts, `ReturnObject`, `RemainderAccount`, `ProofReturnBundle` | Executable distributed profiles |
| 11 | Reconstruction | attempt/runtime lineage bundles, CHR `ReconstructionObject`, PBR causal hypergraph | Executable distributed profiles |
| 12 | Settlement | destination/standing decisions, TOP `SuccessionDecision`, open settlement, SourcePoint disposition, MUS settlement | Executable distributed profiles with one validator gap |
| 13 | Inheritance | `StandingEffectSpec`, `StandingRecord`, `SuccessorStateRef`, `InheritanceRecord`, successor context | Executable bounded `ASSIGN`/`ADMIT` profiles; conditional on independent admission |

These are burdens, not thirteen required peer record classes. An implementation
may carry one burden through several typed records, and one record may sit on an
edge between burdens. In particular, `AuthoredIntent`,
`RegisterCrossingProposal`, `AttemptAdmission`, `OccurrenceBinding`,
`RuntimeCandidateGate`, and `StandingEffectSpec` remain visible as guards or
interstitial artifacts.

## 4. The conservation pair

### 4.1 No Silent Promotion — EXISTING rule, NEW notation

The architecture and runtime profiles already implement the semantic rule. The
arrow notation below is introduced by this reconciliation:

\[
a \not\xRightarrow[\Gamma]{\pi} b
\quad\Longrightarrow\quad
\operatorname{Promote}_{\Gamma}(a,b)\text{ is forbidden}.
\]

The typed transition \(\pi\) must carry the authority, context, identity,
standing, time, evidence, and trace required by the governing profile. This is
already visible in O-LAW-002, the minimum artifact spine, ONE-RCC
non-conversions, TOP promotion barriers, and the executable hostile suites.

### 4.2 No Premature Collapse — EXISTING core, NEW action-relative form

O-LAW-004 and O-LAW-005 already require predecessor stages and compressed
operations to remain separately recoverable. PBR supplies one finite
same-endpoint/different-assessment pair for which endpoint recovery does not
repair the breached path.

The Closure Atlas contributes the action-relative adequacy test. For a coarse
view \(\alpha:X_K\to M\), take \(M=\operatorname{im}(\alpha)\) (or require
\(\alpha\) to be surjective onto the declared view space). For exact
consequential semantics \(F_{K,a}:X_K\to Y_a\), suppressing a distinction is
adequate for action \(a\) only when

\[
F_{K,a}=\bar F_{K,a}\circ\alpha,
\qquad\text{equivalently}\qquad
\ker(\alpha)\subseteq\ker(F_{K,a}).
\]

### 4.3 Paired statement — NEW DERIVATION

\[
\boxed{
\begin{aligned}
&\text{Standing may not increase without an explicit typed transition;}\\
&\text{consequential differentiation may not decrease without}\\
\text{ action-relative adequacy.}
\end{aligned}}
\]

The non-promotion and recoverable-compression cores are existing. The
action-relative refinement and their statement as one conservation pair are
new derivations in this reconciliation.

## 5. The actual topology

The display spine is linear because it is a legibility surface. The machine is
not.

Its native object is a typed causal hypergraph with:

- joins: ONE-RCC joins the semantic candidate branch and the runtime
  evidence/receipt branch at `RuntimeCandidateGate`;
- forks: one attempt may yield several occurrences, observations, or receipts
  under TOP;
- retries and reruns: deliberate rerun creates a fresh attempt identity and
  reconstructible lineage;
- recurrent regions: return and reconstruction can recur as evidence changes;
- open states: settlement may remain `OPEN` or `UNSETTLED`;
- conditional succession: inheritance exists only after an independent
  admitting disposition.

Accordingly:

\[
\text{thirteen-burden display order}
\ne
\text{thirteen atomic runtime states}.
\]

The former is frozen here. The latter is not claimed.

## 6. Non-conversions preserved by the spine

The consolidation is valid only while at least these distinctions survive:

```text
PreparedPossibilityField != Intent
Preparation != Choice
Choice != Authorization
Proposal != Commitment
Commitment != AttemptAdmission
AttemptAdmission != Attempt
Attempt != Occurrence
Occurrence != Observation
Observation != EvidenceAssessment
SemanticReceipt != RuntimeReceipt
Receipt != Settlement
ReturnObject != ReconstructionObject
Reconstruction != Standing
SettlementRecord != Settlement
Persistence != Inheritance
Inheritance != FuturePermission
EndpointEquality != PathEquivalence
```

## 7. Eight-surface projection

The source proposal is retained:

\[
\chi_t=(P_t,C_t,X_t,O_t,E_t,R_t,D_t,I_t).
\]

Its technical meaning is now fixed as the following projection over the
thirteen-burden causal hypergraph:

\[
\operatorname{BecomingView}_t=
\left(
\begin{array}{l}
\operatorname{PossibilityPreparation}_t,\\
\operatorname{ChoiceCommitment}_t,\\
\operatorname{Realization}_t,\\
\operatorname{WitnessObservation}_t,\\
\operatorname{Evidence}_t,\\
\operatorname{ReturnReconstruction}_t,\\
\operatorname{SettlementDisposition}_t,\\
\operatorname{Inheritance}_t
\end{array}
\right).
\]

| Source symbol | Canonical coordinate | Spine burdens |
|---|---|---|
| \(P_t\) | `PossibilityPreparation_t` | Possibility, Preparation |
| \(C_t\) | `ChoiceCommitment_t` | Choice, Commitment |
| \(X_t\) | `Realization_t` | Attempt, Occurrence, Consequence |
| \(O_t\) | `WitnessObservation_t` | Witness |
| \(E_t\) | `Evidence_t` | Evidence |
| \(R_t\) | `ReturnReconstruction_t` | Return, Reconstruction |
| \(D_t\) | `SettlementDisposition_t` | Settlement |
| \(I_t\) | `Inheritance_t` | Inheritance |

This is a structured macro-view, not a claim that the coordinates are
independent scalars or a replacement for runtime records. The unabbreviated
names are normative inside this artifact because the corpus already uses
\(\chi_t^\Gamma\), \(P_t\), and several other letters for different objects.

## 8. Two concrete reconciliation defects

### 8.1 `AttemptAdmission` cardinality collision

ONE-RCC F0.1 binds one `AttemptAdmission` to one exact
`authorized_attempt_ref`; a deliberate rerun requires a fresh admission.

TOP F0.1 calls `AttemptAdmission` an entitlement to one bounded attempt, but its
cardinality section and passing multi-attempt fixture permit:

```text
one AttemptAdmission -> zero or many ExecutionAttempt records
```

These cannot be treated as the same type merely because the label matches.
The binding must either use profile-qualified names such as
`ExactAttemptAdmission` and `MultiAttemptEnvelope`, or supply an explicit
refinement adapter with cardinality and replay semantics.

### 8.2 MUS generated-receipt validation gap

The MUS return-settlement harness reports 17/17 checks. Those checks validate
the schema itself, four canned examples, and twelve decision fixtures. The
function `write_mock_settlement_receipt()` then emits a flat payload, but the
schema requires `schema_version`, `settlement_decision`,
`mus_settlement_receipt`, and `created_at`. The generated file is never passed
to the schema validator.

Therefore:

\[
17/17\text{ checks pass}
\not\Rightarrow
\text{generated settlement receipt conforms to its schema}.
\]

This is a bounded validator defect. It does not erase the settlement
architecture or the twelve decision-fixture results. It should be repaired by
emitting the required nested shape and validating the exact emitted artifact.

## 9. Evidence ledger

| Surface | Recorded finite evidence | Ceiling |
|---|---:|---|
| ONE-RCC single-edge runtime | 102 tests | Admitted bounded profile; no production or external-effect proof |
| Transition Occurrence Protocol | 16 tests | Candidate reference protocol fixtures |
| RGCB frozen grammar | 55 recorded test nodes | Internal reference consistency; no minimality proof |
| CHR reconstruction | 70 tests | Bounded implementation assurance only |
| PBR same-endpoint/different-becoming | 33 tests | Finite trace-sensitive witness; no general theorem |
| ONE V1 stacked bounded assembly | 590 combined tests | Begins at `AuthoredIntent`; component suites overlap |
| MUS return-settlement | 17 checks | Does not validate the generated mock receipt |

Tests are computational evidence, not mathematical proof. Here they establish
that the crosswalk is attached to real executable surfaces rather than invented
terminology.

## 10. Whole-path attacks

The following attack family is now bound into the Closure Atlas:

- type-name cardinality laundering;
- preparedness-as-intent;
- endpoint redemption;
- retroactive knowledge rewrite;
- persistence-as-inheritance;
- generated settlement receipt escaping schema validation.

The larger estate already contains bounded attacks against authority
substitution, stale admission, observation inflation, receipt inflation,
reconstruction inflation, and inheritance without independent admission. The
new fixtures do not pretend those prior tests never happened; they make the
cross-stack seams explicit.

## 11. Exact remaining work

The spine is frozen. The remaining work is binding and repair:

1. bind `PreparedPossibilityField/BearingOffer` through exact SourcePoint
   authorship into `RegisterCrossingProposal` and `TranslationCommitment`;
2. split or adapt the two `AttemptAdmission` profiles;
3. bind `RuntimeReceipt` into `ReturnObject`/`ProofReturnBundle` and settlement
   through exact identity and digest-preserving adapters;
4. repair and test the generated MUS settlement receipt;
5. execute one hostile route spanning all thirteen burdens.

The current estate already executes the path from exact `AuthoredIntent` to
conditional successor context. The first item is therefore the smallest front
edge required to turn the whole frozen view into one end-to-end specimen.
The mapped inheritance profiles do not establish general `REPLACE` or `REMOVE`
semantics, a universal successor-head rule, merge/fork closure, or a general
path-composition theorem.

## 12. Standing statement

This artifact establishes that the corpus already contains distributed typed
temporal artifacts and substantially executable bounded paths, and freezes one
exact thirteen-burden conformance view over them. It does not claim that every
burden is implemented by one service, that all profiles share identical types,
that one test harness covers the entire front-to-back route, or that finite
tests prove a universal calculus theorem.

The correct work state is:

\[
\boxed{
\text{Freeze the view}
\to \text{bind the carriers}
\to \text{repair the two defects}
\to \text{run the whole path}.
}
\]
