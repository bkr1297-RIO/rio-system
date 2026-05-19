# Adaptive Formation Pause v0.1

## 1. Purpose

Adaptive Formation Pause is a right-sized checkpoint before meaning becomes form, form becomes commitment, or capability becomes consequence. It selects the least pause needed to preserve authority, coherence, and proof, and it must always name the missing condition, the resolving authority, and the least consequential next step.

## 2. Stack Placement

- Bondi / Mirror forms candidate meaning.
- Adaptive Formation Pause orients before form hardens.
- RIO governs consequence.
- Sentinel checks execution match.
- MUS proves.
- Ledger preserves.
- MANTIS / Relationship Coherence Monitor witnesses.
- ONE surfaces/routes as the operating environment.
- Tool / substrate layer executes only after governance permits.
- Human remains the bridge and crossing authority.

## 3. Relationship to Existing Primitives

- Governed Intelligence Grammar defines packet meaning, scope, register, and authority semantics.
- UGIP carries pause packets across governed interaction surfaces.
- RIO evaluates admissibility and consequence boundaries after formation orientation.
- Sentinel checks execution matches permitted path and constraints.
- MUS Receipts prove pause state, verdict, rationale, and crossing where required.
- MANTIS / Relationship Coherence Monitor is a witness-only signal layer for drift, pacing, collusion risk, and readiness.
- Send Buffer is the publication-stage outward buffer; Publication Pause may route through it.
- Non-Collapse Harness / APTS preserves separation, disagreement, and non-collusive multi-model structure.
- MUS Quantum Adapter routes quantum-capable work through the same authority and receipt rails.

## 4. Core Invariants

- Pause is governance before form.
- Pause is not avoidance; pause is orientation before motion.
- Use the least pause needed to preserve authority, coherence, and proof.
- Friction should be precise, not constant.
- Flow is allowed when scope is clear.
- Familiarity is not authorization.
- Convergence is evidence, not authority.
- Quantum output is capability output, not authority output.
- Authority to discuss does not imply authority to form; authority to form does not imply authority to execute; authority to execute does not imply authority to publish.
- Every pause must have an exit path.
- The system may suggest a pause; it may not become authority.
- The human remains the bridge and the crossing authority.

## 5. Mode vs Verdict Distinction

- `mode` = how much friction is needed.
- `verdict` = what happens next.

Examples:

```yaml
mode: FLOW
verdict: CONTINUE_FLOW
```

```yaml
mode: FORMATION_HOLD
verdict: SANDBOX_ONLY
```

```yaml
mode: PUBLICATION_PAUSE
verdict: STAGE_NOT_PUBLISH
```

```yaml
mode: AUTHORIZATION_PAUSE
verdict: EXECUTE_WITH_RECEIPT
```

## 6. Pause Modes

Use these mode values only:

- `FLOW`
- `CHECKPOINT`
- `FORMATION_HOLD`
- `AUTHORIZATION_PAUSE`
- `PUBLICATION_PAUSE`

## 7. Verdicts

Use these verdict values only:

- `CONTINUE_FLOW`
- `DRAFT_ONLY`
- `SANDBOX_ONLY`
- `CREATE_ISSUE_ONLY`
- `REVIEW_REQUIRED`
- `HOLD_FOR_HUMAN_RETURN`
- `DENY`
- `EXECUTE_WITH_RECEIPT`
- `STAGE_NOT_PUBLISH`
- `PUBLISH_WITH_RECEIPT`

## 8. Trigger Signals

- Stakes rising.
- Consequence class increasing.
- Reversibility decreasing.
- Scope unclear or drifting.
- Prior authorization missing or partial.
- Novel artifact or new category forming.
- Category drift.
- Model momentum.
- Over-agreement or convergence without separated provenance.
- Disagreement not surfaced.
- Relationship coherence degradation.
- Public/private register mismatch.
- Durable artifact formation.
- Downstream dependency risk.
- Sandbox likely to become de facto architecture.
- Public claim forming too soon.
- Weak provenance.
- Quantum job or hardware-coupled task detected.

## 9. Exit Criteria

Proceed only when required criteria for the current mode are satisfied:

- Scope clarified.
- Register identified.
- Artifact type declared.
- Authority-to-form satisfied.
- Consequence class known.
- Receipt path available where required.
- Disagreement surfaced.
- Provenance separated.
- Human approval recorded where required.
- Allowed path/tool/environment confirmed for execution cases.

If all required criteria for the current mode are satisfied, the system must return the next permitted step rather than remain paused.

## 10. Anti-Paralysis Rule

Every pause must have an exit path.

A pause must name:

- what is missing,
- who can resolve it,
- the least consequential next step.

Default unresolved actions:

- return to discussion,
- draft only,
- sandbox only,
- create issue not commit,
- stage artifact not publish,
- human review not execution,
- hold if authority is missing.

Pause should not remain indefinitely open unless the human explicitly chooses longer reflection.

## 11. Receipt / Meta-Receipt Requirements

Receipt when pause affects artifact formation, routing, authorization state, or execution permission.

Minimum fields:

- `mode`
- `verdict`
- `reason_signals`
- `missing_conditions`
- `resolving_authority`
- `least_consequential_next_step`
- `provenance_state`
- `approval_state`
- `timestamp`
- `reviewer`

Meta-receipt required when pause level changes, is overridden, or transitions from internal formation to external consequence.

## 12. Quantum-Specific Handling

Quantum-capable tasks do not bypass Adaptive Formation Pause or RIO.

- Quantum output is capability output, not authority output.
- Hardware quantum jobs default to `mode: AUTHORIZATION_PAUSE`.
- Exploratory quantum/QI reasoning may remain in `FLOW`, `CHECKPOINT`, or `FORMATION_HOLD` depending on stakes.
- Outward quantum/QI claims should route through `PUBLICATION_PAUSE`.

## 13. Minimal YAML Packet

```yaml
adaptive_formation_pause:
  version: "0.1"
  mode: FORMATION_HOLD
  verdict: SANDBOX_ONLY
  artifact_type: spec
  register: internal
  consequence_class: low
  scope_clarity: partial
  prior_authorization: partial
  reversibility: high
  durability: staged
  relationship_coherence: YELLOW
  reason_signals:
    - category_drift
    - durable_artifact_formation
  missing_conditions:
    - authority_to_form
    - separated_provenance
  resolving_authority: human
  least_consequential_next_step: "draft local spec only; do not commit"
  receipt_required: true
```

## 14. Conformance Test Table

| Case | Expected mode | Expected verdict |
|---|---|---|
| Low-stakes familiar draft, exact scope, reversible | `FLOW` | `CONTINUE_FLOW` |
| Repeated familiar workflow with exact scope | `FLOW` | `CONTINUE_FLOW` |
| New label/category forming around architecture | `CHECKPOINT` | `DRAFT_ONLY` or `CONTINUE_FLOW` |
| Repo branch or schema about to be created | `FORMATION_HOLD` | `SANDBOX_ONLY`, `CREATE_ISSUE_ONLY`, or `REVIEW_REQUIRED` |
| Public claim about quantum intelligence forming | `PUBLICATION_PAUSE` | `STAGE_NOT_PUBLISH` or `REVIEW_REQUIRED` |
| Hardware quantum job | `AUTHORIZATION_PAUSE` | `HOLD_FOR_HUMAN_RETURN`, `DENY`, or `EXECUTE_WITH_RECEIPT` only if approval is satisfied |
| Three models agree but provenance is not separated | `FORMATION_HOLD` | `REVIEW_REQUIRED` |
| Coherence monitor detects over-agreement | `CHECKPOINT` or `FORMATION_HOLD` | non-`CONTINUE_FLOW` unless resolved |
| Prior successful collaboration but current scope missing | `FORMATION_HOLD` | `HOLD_FOR_HUMAN_RETURN` or `DENY` |
| Preauthorized task within exact scope/path/tool | `FLOW` or `CHECKPOINT` | `CONTINUE_FLOW` |
| Preauthorized task outside approved path/tool/scope | `AUTHORIZATION_PAUSE` | `DENY` or `HOLD_FOR_HUMAN_RETURN` |
| Pause has no remaining missing conditions | current mode | must advance to next permitted verdict |
| Low-stakes uncertainty remains | `CHECKPOINT` or `FORMATION_HOLD` | `DRAFT_ONLY` or `SANDBOX_ONLY` |
| High-stakes uncertainty remains | `AUTHORIZATION_PAUSE` | `HOLD_FOR_HUMAN_RETURN` or `DENY` |

## 15. Suggested Repo Placement

- `docs/architecture/adaptive-formation-pause-v0.1.md`
- `schemas/adaptive-formation-pause-v0.1.schema.json`
- `tests/adaptive-formation-pause/test-cases-v0.1.md`
