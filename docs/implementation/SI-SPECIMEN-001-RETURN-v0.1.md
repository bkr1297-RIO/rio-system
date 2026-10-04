# SI-SPECIMEN-001 — ResearchSynthesis.Direct Return

HLSI = Human-Led Synthetic Intelligence. This delivers the bounded first slice: RelationType → MatrixType → RelationCompiler → ResearchSynthesis.Direct. Direct compiled, received explicit configuration admission, circulated source-grounded artifacts through the existing LocalField owners, produced an actual bounded filesystem occurrence, and returned an attributed record to its initiating node.

**Disposition: PASS WITH NON-BLOCKING DEFECTS.** The required runtime/conformance checks pass: 96/96 tests, 10 canonical protocol records validated, and independent native receipt verification. The pre-existing default gateway suite still requires its unavailable localhost:4401 service; its baseline had 13 connection failures before these changes.

Repository: `bkr1297-RIO/rio-system`. Delivery branch: `build/si-specimen-001`, stacked on `build/one-local-field-frontier-v0.1` at `4436ede584c4c0c3938a75feccc632d4edceb24b`. The prerequisite candidate is [rio-system#205](https://github.com/bkr1297-RIO/rio-system/pull/205). The dedicated specimen branch isolates this later HLSI slice without rewriting the existing Local Field build branch. No merge, deployment, publication, release, or canonization is performed.

Delivery: [draft rio-system#206](https://github.com/bkr1297-RIO/rio-system/pull/206), verified draft and unmerged. Implementation/evidence commit: `b13db3074e11daba082b3c4b20ffc47d4112e231`. Its tree exactly matches the verified local index. The following delivery-record commit changes documentation/metadata only.

Engine Loom binding: **R-07 GAP / [architecture#322](https://github.com/bkr1297-RIO/one-rio-muss-architecture/issues/322)**. This is a bounded contribution to Formation → Crossing → Return, not route closure. Architecture, protocol and receipt repositories were inspected but did not require duplicate objects or changes for this slice. The existing Local Field 19-gate register is unchanged and is not reissued as an HLSI certificate.

## D1 — Runtime type definitions

The gateway uses ECMAScript modules. These are executable runtime validators and immutable data objects, following its existing conventions; no new language/build system is introduced.

| Required type | Exact owner | Representation |
|---|---|---|
| RelationType / Relation | `gateway/local-field/relations/types.mjs` | Same validated contract; relation ID, typed source/target roles, artifact type, permitted use, provenance, forbidden conversions, temporal scope, Return requirement, constitutional coordinates. |
| MatrixType / Matrix | `gateway/local-field/relations/types.mjs` | Same validated contract; profile, matrix ID/name, substrate hash, eight typed capability nodes and eight individually addressable relations. |
| RelationalPlan | `gateway/local-field/relations/compiler.mjs` | Validated immutable proposed plan; matrix/substrate/content hashes, compilation stages, typed operations, `authority_effect: none`. |
| Supporting structures | `gateway/local-field/relations/types.mjs` | Fixed capability list, Direct edge declarations, prohibited conversions, temporal binding and constitutional coordinate references. |

Node typing describes logical capability roles; these do not create principals. Actual source/target machines are separately bound by the native passage, enrollment, keys and custody declarations. Edge typing checks artifact type and permitted operation against the Direct morphology. Relation time limits reference the native passage's issued/expiry times, enforced by existing freshness and point-of-use owners; they confer no independent duration of authority.

## D2 — Minimal Relation Compiler

Entry point: `compileRelations(input, substrate)` in `gateway/local-field/relations/compiler.mjs`, exported from `relations/index.mjs`. Input is a Matrix object or bounded JSON string plus the fixed substrate manifest. Output is an immutable, self-hashed `RelationalPlan` with `configuration_status: PROPOSED`.

The path is Parse → Resolve → TypeCheck → ConstitutionCheck → Plan. Resolution checks the eight known roles; type checking checks the eight Direct relations and artifacts. ConstitutionCheck checks the profile's required coordinates, prohibitions, Return path and operational-only standing. It does not interpret or amend doctrine or evaluate current action authority. It produces no installation, grant, network dispatch or filesystem effect.

Compiler reuse: `security/token-manager.mjs` canonicalization and `security/local-field-authority.mjs` canonical hashing/requireValue. Authorization/admission owners are invoked later by LocalField, not impersonated by the compiler. Failure representation remains the existing thrown Error contract, plus JSON SyntaxError for malformed JSON. Relevant codes include `MATRIX_*`, `RELATION_*`, `SUBSTRATE_DRIFT`, and `PLAN_FIELDS` / `PLAN_STATUS` / `PLAN_HASH`. No parallel authority decision type is created.

Assumptions: Direct is the only supported morphology; the Reasoner is a bounded deterministic lexical extractive provider over explicitly supplied source artifacts. Unsupported graphs fail closed. Configuration admission uses an existing root-signed dependency control binding `relation-plan:<matrix_id>` to the exact plan hash. That admission is distinct from the action grant and is rechecked at ingress and point of use.

## D3 — ResearchSynthesis.Direct Matrix

The executed declaration is inspectable in [matrix.json](../evidence/si-specimen-001/matrix.json); its output is [relational-plan.json](../evidence/si-specimen-001/relational-plan.json). `directMatrix()` generates this data independently of effect orchestration.

| Relation ID suffix | Source role | Target role | Artifact type | Permitted use |
|---|---|---|---|---|
| r1 | HMI | CCI | HumanIntent | orient |
| r2 | CCI | Sensorium | ResearchRequest | collect |
| r3 | Sensorium | Memory | SourceBundle | retain |
| r4 | Memory | Reasoner | ResearchContext | synthesize |
| r5 | Reasoner | Tool | SynthesisCandidate | propose |
| r6 | Tool | Witness | ExecutionChain | observe |
| r7 | Witness | ReturnEngine | WitnessRecord | return |
| r8 | ReturnEngine | HMI | SynthesisReturn | receive |

Full relation IDs are `si-specimen-001-direct:r1` through `:r8`. All declared nodes retain `standing: operational-role-only`. Matrix participation cannot grant jurisdiction or inheritance.

## D4 — End-to-end executable specimen

From `gateway/`, using Node 24 on Linux:

```sh
npm ci
npm run test:si-specimen
npm run field:si-specimen -- /tmp/si-specimen-001-trace.json
```

`gateway/scripts/run-si-specimen-001.mjs` starts two actual production LocalField CLI processes with separate development identities, private keys and custody directories. It reads the existing Local Field README and BILATERAL source artifacts, forms signed Human Intent, compiles the declared Matrix, stores native candidates, and submits a root-signed exact configuration disposition. A separate scoped one-use action grant authorizes consequence.

The native flow is controlled source egress → independent receiver ingress → current execution authority → Sentinel point-of-use fidelity → create-only filesystem adapter → descriptor-based occurrence observation → native five-hash receipt → Return egress → source Return ingress. The driver independently reads the created artifact outside both runtimes, verifies the native records, restarts both nodes, and reconstructs the same history with only one execution attempt. Runtime operation does not depend on the driver.

The first five traversals are actual recorded formation artifacts, explicitly distinguished from external occurrence. The receiver's final edge records Return formation with admission PENDING. Only the source's actual Return ingress completes that edge as an attributed record. Evidence remains NOT_ADMITTED; truth remains UNESTABLISHED; settlement remains UNSETTLED.

## D5 — Constitutional reuse map

| Concern | Existing owner reused | Mapping classification |
|---|---|---|
| Authority | SourcePoint anchor; canonical grants/delegation; `security/local-field-authority.mjs`; existing Ed25519 signed records | EXISTING_EXACT |
| Admission | LocalField root-only dependency controls, native ingress and current execution-authority decisions; `governance/policy-engine.mjs` | EXTEND_EXISTING with exact plan/substrate binding |
| Passage | Existing signed candidate, grant and passage structures; `local-field/bilateral.mjs` | EXISTING_EXACT |
| Witness | Existing `local-field/index.mjs` occurrence capture and `execution/filesystem-executor.mjs` readback; native receipts/ledger | EXISTING_EXACT; receiver observation is not independent MANTIS evidence |
| Return | Existing `receipts/receipts.mjs` and Bilateral Return egress/ingress; signed `relation_run` ledger event adds reconstruction | EXTEND_EXISTING; no competing receipt system |
| Settlement / HOME mutation | Existing Return ingress enforces the attributed-record / NOT_ADMITTED / UNSETTLED ceiling; no successor or HOME mutation is invoked | NOT_REQUIRED_FOR_V0_1; future executable HOME binding must be reconciled before use |

No ReturnAdjudicator or Boolean sovereign-clearance field is installed. Configuration validation delegates consequential judgments to the existing typed owners. A signed relation record is checked against locally stored formation artifacts and the separately verified native chain before Return admission commits; a receiver signature cannot make contradictory linkage acceptable.

The executable HOME/successor mutation binding is deferred, not replaced. This slice establishes the absence of automatic promotion, not an implementation of HOME settlement. This future integration gap is recorded under D11.

## D6 — Relation trace and reconstruction evidence

The full public development proof is [direct-trace.json.gz](../evidence/si-specimen-001/direct-trace.json.gz). The readable traversal extraction is [relation-trace.json](../evidence/si-specimen-001/relation-trace.json); it points back to the signed source relation record rather than acting as a second proof owner.

| Executed identifier | Value |
|---|---|
| Matrix | `si-specimen-001-direct` |
| Run | `2bc8f308-cf0c-4b55-b31d-216a9e34a2f0` |
| Passage A → B | `ec1ce88c-a867-41f7-8a8c-c3d71fa34853` |
| Receipt | `a15dc956-447b-48ed-b74d-6fb19a4b6812` |
| Return B → A | `d4c5d7ab-14d7-4fc5-a4e9-094d1f3d91a8` |
| Native participants | `node-a` → `node-b`; Return to `node-a` |

Each traversal exposes its relation ID, source/target role, typed artifact hash/reference, provenance, witness event and Return linkage. The signed record binds Matrix/plan/substrate, candidates, configuration disposition, native occurrence, receipt and Return. Source/receiver private keys are distinct. Both ledgers and both relation records verify; restart preserves the same chain and does not regenerate permission or repeat consequence.

The exported [research-synthesis.txt](../evidence/si-specimen-001/research-synthesis.txt) is a copy of the independently read output. The original occurrence was inside the exact development sandbox, which was removed after verification. The export is not presented as a new occurrence. [root-public-key.txt](../evidence/si-specimen-001/root-public-key.txt) is the separate development trust-anchor artifact; no private keys are exported.

## D7 — Compiler and boundary rejection tests

| Required rejection | Test owner / evidence |
|---|---|
| Unknown capability node | `compiler.test.mjs`: unknown endpoints cannot enter a plan. |
| Forbidden relation | `compiler.test.mjs`: unsupported Direct topology / permitted use rejected. |
| Artifact-type mismatch | `compiler.test.mjs`: SynthesisCandidate cannot be changed to Occurrence. |
| Missing constitutional relation information | `compiler.test.mjs`: missing fidelity coordinates, Return obligations, temporal scope or fields rejected. |
| Authority accretion | `compiler.test.mjs`: authorize use / node jurisdiction rejected; proposed plan cannot become authority or ADMITTED. |
| Inheritance accretion | `compiler.test.mjs`: inherit_authority use, node inheritance and Boolean clearance rejected. |
| Topology installation without valid admission | `runtime.test.mjs`: stored proposal cannot self-install; non-root dependency disposition rejected; absent configuration causes no effect. |
| Missing Return path | `compiler.test.mjs`: removal of required ReturnEngine → HMI relation fails compilation. |

Runtime tests additionally refuse current configuration revocation, substrate drift, altered synthesis/provenance, wrong Human Intent attribution, disabled profile, missing/revoked action grants, and re-signed contradictory Return records. Malformed relation signatures are held before Return admission commits and cannot poison restart. An original valid Return may subsequently be admitted without another execution.

## D8 — Positive conformance and success criteria

| F0.1 success criterion | Observed evidence |
|---|---|
| Preserve node identity | Real-process before/after signed-control snapshots and restart compare enrolled IDs, keys, standing and custody unchanged. |
| Preserve relation identity | Compiler enforces unique addressable IDs; process test compares actual traversed IDs with the declared Matrix. |
| Preserve provenance | Exact source-grounded extracts, source hashes and signed Human Intent survive native passage and signed Return reconstruction; altered provenance is rejected. |
| Preserve authority boundaries | Exact root configuration admission plus independent scoped action grant, native RIO/current authority and fidelity; participation cannot self-install or widen standing. |
| Reconstructable circulation | Eight completed source traversals with artifact/provenance/witness/Return links; independently verified ledger/native chain; identical restart reconstruction and one attempt. |
| Typed Return | Native signed Return and SynthesisReturn traversal; receiver formation distinguished from source ingress. |
| ReturnArrival != HomeMutation | Signed field/enrollment/configuration/grant controls before and after actual Return are identical; no successor/HOME mutation; evidence NOT_ADMITTED and settlement UNSETTLED. |
| No parallel constitutional runtime | Profile is a collaborator inside the existing LocalField process/store; code review confirms existing authority/signature/passage/receipt/Return owners. |

HOME, NOW, WORLD and RETURN remain positions of relation: **HOME holds. NOW attends. WORLD answers. RETURN carries home.** No UI modules or navigation ontology are introduced.

## D9 — Experimental substrate manifest

[substrate-manifest.json](../evidence/si-specimen-001/substrate-manifest.json) exposes components, component versions/implementation hashes, settings, required and observed initial state, source/query burden, resource budgets, runtime version and matrix ID. The exact canonical substrate also remains inside the full signed candidate trace. The readable manifest is an inspection view, not a new protocol object.

The runtime refuses code/version/settings/state-policy/budget drift from its root-pinned substrate. A later comparison must replay the same burden, enrolled identities, controls and equivalent fresh state while holding the environmental/resource controls constant. This slice records that boundary; it does not compare configurations or make a Synthetic Intelligence capability claim.

## D10 — Changed files and commands

All paths below are relative to rio-system. No runtime dependencies were added.

| Added file | Purpose |
|---|---|
| `gateway/local-field/relations/types.mjs` | Runtime relation/Matrix contracts and mandatory constraints. |
| `gateway/local-field/relations/compiler.mjs` | Direct data declaration, pure compiler and proposed-plan validator. |
| `gateway/local-field/relations/substrate.mjs` | Fixed controls and actual implementation/infrastructure fingerprints. |
| `gateway/local-field/relations/direct.mjs` | Bounded source-grounded formation and artifact traversals. |
| `gateway/local-field/relations/profile.mjs` | Existing-owner configuration checks and signed circulation reconstruction. |
| `gateway/local-field/relations/index.mjs` | Public specimen API. |
| `gateway/local-field/relations/README.md` | Usage, owner bindings, temporal/inhabitation boundaries and evidence ceilings. |
| `gateway/scripts/run-si-specimen-001.mjs` | Actual two-process development-safe specimen and independent readback. |
| `gateway/tests/si-specimen/compiler.test.mjs` | Twelve declaration/compiler conformance and rejection tests. |
| `gateway/tests/si-specimen/direct.test.mjs` | Five formation/provenance/budget/version-text tests. |
| `gateway/tests/si-specimen/runtime.test.mjs` | Ten real LocalField authority/configuration/effect/recovery tests. |
| `gateway/tests/si-specimen/process.test.mjs` | Real process circulation, identity/control preservation and restart. |
| `gateway/tests/si-specimen/return-boundary.test.mjs` | Two re-signed/malformed Return boundary and recovery regressions. |
| `docs/implementation/si-specimen-001-plan-v0.1.md` | Authorized scope, reconciliation and execution record. |
| `docs/implementation/SI-SPECIMEN-001-RETURN-v0.1.md` | This D1–D12 implementation packet. |
| `docs/evidence/si-specimen-001/matrix.json` | The actual executed Matrix as data. |
| `docs/evidence/si-specimen-001/relational-plan.json` | The actual proposed compiler artifact. |
| `docs/evidence/si-specimen-001/substrate-manifest.json` | Readable substrate/control/burden manifest. |
| `docs/evidence/si-specimen-001/relation-trace.json` | Extracted reconstructable source traversal example. |
| `docs/evidence/si-specimen-001/direct-trace.json.gz` | Exact complete public development trace, compressed losslessly. |
| `docs/evidence/si-specimen-001/root-public-key.txt` | Separate development verifier anchor. |
| `docs/evidence/si-specimen-001/research-synthesis.txt` | Copy of independently read occurrence output. |
| `docs/evidence/si-specimen-001/verification.json` | Machine-readable conformance, proof, baseline failures and execution limits. |

| Modified file | Purpose |
|---|---|
| `gateway/local-field/index.mjs` | Optional profile integration at ingress/use/capture/inspection/recovery. |
| `gateway/local-field/bilateral.mjs` | Profile conformance hook before existing Return ingress commits. |
| `gateway/package.json` | Specimen/conformance commands using existing dependencies. |
| `.github/workflows/local-field-bilateral.yml` | Run new conformance alongside existing LocalField CI. |

No new parallel fixture subsystem is added. Compiler/runtime tests use real development records and the existing LocalField fixture owner. The specimen uses actual repository source artifacts. The evidence files are exported runtime records; none substitutes fabricated effect for occurrence.

Verification commands executed:

```sh
# gateway/
npm ci
npm test
node --test tests/si-specimen/*.test.mjs tests/local-field*.test.mjs tests/execution-binding-repair.test.mjs
node scripts/run-si-specimen-001.mjs /workspace/scratch/1cf97914ef3d/final-direct-trace.json
node scripts/run-local-field-bilateral-acceptance.mjs /workspace/scratch/1cf97914ef3d/bilateral-regression-trace.json

# independent receipt repository, unchanged at 8cb49727e98690f9f0dfb66625e3a182f321a6e9
node verifier/local-field.js /workspace/scratch/1cf97914ef3d/final-direct-trace.json /workspace/scratch/1cf97914ef3d/final-direct-trace.json.root-public-key.txt

# rio-system/
git diff --cached --check
```

The complete required test command passed **96/96**: specimen 30, LocalField 54, execution binding 12; zero failures/skips/cancellations. The default `npm test` baseline had **0/13** passing because its expected localhost server was absent, before modifications. Existing bilateral acceptance driver passed. Python jsonschema validated the repository interaction profile and ten actual records against rio-protocol schema at `0449f2dd135d93791b9b4ce3f96093d1aca463cf`. Independent native receipt/Return verification returned `valid: true`, `authorization_created: false`. A fresh code review found no remaining findings after the Return conformance/recovery fixes and the bounded D1–D12 delta.

## D11 — Defects, gaps and execution boundary

**Blocking:** None for the bounded F0.1 success condition.

**Non-blocking:** The pre-existing default gateway API suite requires its unavailable localhost:4401 service. Its thirteen named connection failures are retained in verification.json. This slice neither changes that suite nor claims it passed.

**Architectural / future integration:** No executable HOME/successor mutation owner is exercised or established by this slice. A later settled Return/HOME mutation must be reconciled to its declared existing typed authority/admission owner before becoming reachable. Until then the existing Return ingress remains attributed, unevidenced and unsettled. No replacement owner has been installed, and this gap does not prevent the required non-mutation property.

Two important defects found during review were repaired and tested: receiver-signed relation claims previously needed full local/native-chain reconstruction before admission; malformed relation signatures needed rejection before committing incoming Return state to preserve restart availability. The bounded extractor also now preserves version tokens such as v0.1 as exact source text.

Implemented boundaries: LocalField interfaces and separate keyed local processes/custody directories. This is not a claim of containment under physical-host compromise. Receiver observation is not independently admitted evidence or an independent MANTIS witness. Direct is the only supported morphology and uses a deterministic extractive provider. No assay, alternative morphology, adaptive topology, external model integration, new runtime or UI redesign was added.

Class 1: repository/source inspection and reconciliation. Class 2: isolated build-branch source/tests/docs; temporary development keys/state/processes; root-signed development controls and scoped grants; bounded create-only artifact/readback; restart; exact sandbox cleanup; public evidence export; coherent build commit and draft PR. **Class 3 performed: none.** No real personal accounts, private data transmission, production state or constitutional canon was changed.

## D12 — Builder disposition

The machine-readable disposition and artifact hashes are in [verification.json](../evidence/si-specimen-001/verification.json). Each F0.1 criterion is supported under D8. Implementation success conveys no constitutional ratification or merge/deploy authority. Brian / SourcePoint retains disposition.

The next concrete slice, if separately ordered, is ProvenanceFirst declaration/conformance under the same controlled substrate and burden before any comparative assay. It is not part of this delivery.

**PASS WITH NON-BLOCKING DEFECTS** — ResearchSynthesis.Direct satisfies the bounded success condition through existing owners; the pre-existing service-dependent gateway suite remains unavailable.
