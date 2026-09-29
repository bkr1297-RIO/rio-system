# Customer Zero — Open Arrow v0.1

The optional constituted profile adds explicit human approval and typed promotion to the existing Local Field receiver. It copies Report 17 from a Lab context into the create-only Commons artifact directory. The receiving control store remains within Lab custody; sending a proposal to that private boundary is not publication to Commons.

## Run

Requires the Local Field Node 24/Linux profile and an authorized checkout of private `bkr1297-RIO/rio-reference-impl`, branch `build/one-open-arrow-v0.1`. The native compiler and Transition Occurrence Protocol are private library dependencies. They are not copied into this public repository and the service never calls a test or acceptance driver.

The verified library pin is `73ccc41e99433513fbe8ca03d599d2ba2717b6ab`, [reference draft PR #224](https://github.com/bkr1297-RIO/rio-reference-impl/pull/224). Check out that commit for the recorded acceptance run.

In the root-signed field definition add:

```json
{"open_arrow":{"profile":"one.open-arrow.customer-zero.v0.1","rule":"Nothing leaves this Lab without my explicit approval."}}
```

In the server configuration add `open_arrow_library`, an absolute path to that checkout's `extensions/compiled-occurrence-return/open-arrow/index.mjs`. Then use the existing `npm run field -- serve CONFIG.json` command from `gateway/`. An enabled profile with a missing dependency fails closed. Human/source keys remain outside the service; only the receiver private key is configured.

Verification from `gateway/`:

```sh
ONE_REFERENCE_ROOT=/absolute/path/rio-reference-impl npm run test:open-arrow
npm run field:open-arrow-acceptance -- ../docs/evidence/one-open-arrow-v0.1/customer-zero-trace.json /absolute/path/rio-reference-impl
```

The acceptance driver creates real temporary Lab/Commons files, distinct engineering principals, HTTP requests, SQLite history and native receipts. It is not a production identity provisioning tool. A real operator supplies their externally constituted root and exact signed dispositions.

## Requests

Use signed `{body,signature}` records and the existing Ed25519/canonical JSON profile. `POST /arrow` accepts:

| Type | Signer | Exact content |
| --- | --- | --- |
| `arrow_propose` | Enrolled proposer | `arrow_id`, `source_node`, root-signed `human_expression`, exact bounded `request` |
| `arrow_commit` | Constituted human root | `arrow_id`, `proposal_hash`, `decision: APPROVE/DENY`, `basis`, `adjudication`; approval also binds `grant_id` and `passage_id` |
| `arrow_promote` | Constituted human root | `arrow_id`, `operation`, `source_ref`, `source_hash`, `basis`, `adjudication` |

All records require field identity, unique record ID, issued/expiry instants. The only source expression accepted is `Take Report 17 to the Commons.` and only target is `Report-17.txt`. Unknown natural language does not become approval. The native source/AST/ONE-IR remain unchanged objects; conservation sidecars retain fields outside their frozen schemas. Planned compiler authority references and timestamps are obligations, never actual decisions.

Before approving, submit an ordinary existing Local Field grant through `/control`: exact subject, target, target node, action, scope, purpose, dependencies and payload hash; root-issued, nondelegable, single-use. This grant alone cannot dispatch an Open Arrow passage. The independent `arrow_commit` must bind the precise proposal hash. The accepted passage through `/passages` also needs `origin.arrow_id` and `origin.commitment_id`. All generic passage endpoints enforce this check when the field profile is enabled; live grant resolution and Sentinel still run.

Promotions are `QUALIFY` Observation→Evidence, `JUDGE` Evidence→Judgment, `SETTLE` Judgment→Settlement and `RECOGNIZE` Settlement→Successor. Each creates a new artifact and a signed-disposition provenance edge. No arbitrary standing setter or artifact-update endpoint exists. Recognition recomputes the existing Transition Occurrence Protocol and has no installation or future authority effect.

Root-signed `/query` with `view: arrow, arrow_id` reconstructs the full immutable chain; default status includes a compact Open Arrow feed. Query is read-only. Restart may append recovery accounts as part of startup, never redispatch an old attempt.

## Boundaries

Successor standing is the bounded delivered report state; it does not install new software, policy, model or authority. The compiler accepts a closed Customer Zero grammar. Filesystem and receiver observation share custody; no independent witness or public delivery claim is made. Failed creation leaves effect UNKNOWN, not absent; human settlement may preserve UNSETTLED with open obligations. Root signatures authorize specific stages, while receipts and evidence do not create future permission. Host administrator tampering is outside this single-host continuity profile.

The portable schema/spec live in `rio-protocol` on the same branch. The existing `rio-receipt-protocol` Local Field verifier validates the unchanged execution receipt chain. Architecture ownership and acceptance live under `docs/language/open-arrow/` in `one-rio-muss-architecture`; #322/R-07 remains the umbrella, #318 retains K0/CM and successor installation.
