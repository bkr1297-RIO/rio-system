# SI-SPECIMEN-001 — ResearchSynthesis.Direct

HLSI means Human-Led Synthetic Intelligence. This optional LocalField profile compiles one typed relational configuration over eight logical capability roles. These roles do not create new principals or widen enrolled node standing. The fixed Reasoner is a deterministic extractive provider: it ranks matching source sentences and returns their exact text and source hashes. It makes no model-quality or relational-capability claim.

The public API is exported from `index.mjs`:

- `RelationType(value)` / `Relation(value)` and `MatrixType(value)` / `Matrix(value)` validate the same immutable runtime declarations. `RelationalPlan(value)` validates a proposed compiler artifact.
- `fixedSubstrate()` records components, implementation hashes, Node version, settings, per-run initial-state requirements and budgets.
- `directMatrix(id, substrate)` declares ResearchSynthesis.Direct.
- `compileRelations(matrix, substrate)` returns an immutable proposed plan through Parse → Resolve → TypeCheck → ConstitutionCheck → Plan.
- `prepareDirect({matrix, substrate, human_intent, sources, run_id})` forms a bounded synthesis candidate. It performs no network or consequential tool operation.

The compiler intentionally accepts only Direct. This is a fixed lowering, not a topology optimizer or generalized scheduler. All declaration fields are checked; unsupported topology, unknown endpoints, artifact-type mismatches, missing coordinates and authority-converting uses fail closed.

## Existing owner bindings

| Specimen concern | Existing owner | Integration |
|---|---|---|
| Human authority, identity, attribution | SourcePoint anchor, enrollments, `security/ed25519.mjs` | Human Intent uses the existing signed-record representation inside candidate content; it is not an action grant. |
| Matrix proposal and synthesis | LocalField candidate | Canonical `kind: proposal` and `kind: recommended_action`; `authority_effect: none`. |
| Profile and substrate pin | Root-signed field dependencies | `dependencies['si-specimen-001'] = fingerprint(fixedSubstrate())`. |
| Configuration admission | Root-only dependency control | `name: relation-plan:<matrix_id>`, `value: plan.plan_hash`. The signed disposition is independently checked at ingress and point of use. |
| Configuration revocation | Same dependency control | Replace the value with `REVOKED`; no permission is regenerated on restart. |
| Consequential action | Canonical grant and passage | `origin.candidate_id` links synthesis; existing exact scoped authority remains mandatory. |
| Admission and current authority | `governance/policy-engine.mjs`, `security/local-field-authority.mjs` | Relation binding supplements the existing ingress decision and separately recorded execution-authority decision. |
| Fidelity and effect | Existing execution token and filesystem executor | Point-of-use checks precede a create-only, bounded artifact operation. |
| Observation, receipt, ledger | Existing occurrence capture, native five-hash receipts, LocalStore | No alternative receipt, ledger or signature algorithm. |
| Return egress and ingress | Existing Bilateral collaborator | Receiver formation and source admission remain separate; truth/evidence/settlement are not inferred. |
| Settlement / successor / HOME mutation | Existing Bilateral Return ingress holds settlement `UNSETTLED` | This slice never invokes a successor or HOME mutation. No settlement or HOME owner is invented. A later mutation requires an existing typed admission owner to be reconciled before use. |

Relations carry identity, source/target role binding, artifact type, declared provenance, permitted use, forbidden conversions, temporal scope, Return obligation and constitutional coordinates. Temporal scope refers to the canonical passage's issued/expiry times; existing freshness and point-of-use owners enforce them. It creates no independent clock or permission duration. Provenance identifies an assertion and its source; it does not make the assertion authoritative. `fingerprint` wraps values in an object for the existing canonical hash owner, which requires an object at the root.

The sealed inhabitation topology remains: **HOME holds. NOW attends. WORLD answers. RETURN carries home.** These are positions of relation. They add no product modules, navigation tabs, runtime principals or UI vocabulary. `ReturnArrival != HomeMutation`: the specimen compares signed field, node, configuration and authority controls before and after actual Return, while existing ingress records remain attributed, unevidenced and unsettled.

## Admission and circulation

Create and sign a root-pinned field using the existing field schema. Store a node-signed matrix proposal as a canonical candidate. After reviewing the compiled plan, submit a root-signed existing dependency control admitting its exact hash. A candidate cannot submit that control or self-install its topology.

Human Intent must bind the field, source/target nodes, action, target, scope, purpose, query, source-bundle hash, plan hash and substrate hash. It uses the existing `{body, signature}` representation with `type: research_intent` inside opaque candidate content. This is a formation artifact, not an additional protocol control type. Sign the prepared content as a canonical recommended-action candidate, adding `matrix_candidate_id` to link the stored proposal. Supply an independent action grant and canonical passage with `origin.candidate_id`.

The receiver reconstructs Direct and compares the entire signed candidate content with that result. It checks current configuration, substrate, initiating intent, source provenance and exact payload in addition to the existing RIO and Sentinel gates. Configuration re-admission after ingress is recorded as a distinct point-of-use basis.

The first five traversals are recorded formation events. The next two link real native execution/observation/receipt artifacts. The receiver's eighth edge records **Return formation with admission PENDING**. Only the source's actual native Return ingress completes that edge with `RETURN_INGRESS_EVENT`. Both records are persisted in each node's existing ledger and reconstructed on restart. A held attempt retains its missing execution/witness stages; receipt success or absence is never invented to fill them.

Before Return admission commits, the source reconstructs the entire receiver relation record from its own stored formation artifacts and the native incoming chain. Even a receiver-signed contradiction is refused through the existing Return ingress hold owner. Invalid relation signatures cannot commit an incoming Return or poison restart recovery. A subsequently supplied valid Return may be admitted without another execution.

`relation_run` is a signed ledger event, not a second receipt. Its signed body binds the candidate, configuration disposition, native chain and relation events. Queries use the existing root-signed status/passage/ledger query surfaces. Return admission remains an attributed record, evidence `NOT_ADMITTED`, truth `UNESTABLISHED`, settlement `UNSETTLED`. Receiver observation is not an independent MANTIS witness.

## Run and inspect

From `gateway/`, on Node 24 with Linux filesystem facilities:

```sh
npm ci
npm run test:si-specimen
npm run field:si-specimen -- /tmp/si-specimen-001-trace.json
```

The driver starts two production LocalField CLI processes under separate temporary custody directories and development keys. It reads actual repository artifacts, uses bilateral controlled dispatch, reads the created synthesis outside both processes, verifies native signatures and ledger integrity, and checks restart recovery without a second attempt. It removes its exact temporary sandbox and keys; its export contains only public development proof material. The runtime does not import or depend on the driver.

## Comparison boundary

Components, implementation/version hashes, settings, per-run initial-state requirements and budgets are fixed and checked. Human Intent additionally pins the actual source bundle. This supplies comparison controls, not an assay result. A later comparison must also replay the same query and source artifacts from equivalent fresh runtime state and hold environmental/resource controls constant. ProvenanceFirst, adaptive morphology, external models and HLSI assay are not implemented in this slice.

Changing a provider implementation or runtime version changes the substrate hash and requires an explicit new root-pinned configuration. The profile does not silently migrate old runtime state or admit it under a new substrate. Whole-host compromise containment, hardware custody isolation, external deployment and constitutional ratification are outside the implemented evidence boundary.
