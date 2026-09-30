# Projection Runtime v0.1

Persistent Holo lifecycle and independent host admission composed into the existing Local Field boundary. No second root, governor, receipt engine or identity principal is introduced. The runtime works as a service without the acceptance driver.

## Enable and run

Use the existing externally signed field/configuration from [README.md](README.md). The root-signed field definition includes `projection_runtime: {"profile":"one.projection-runtime.v0.1"}`. For Customer Zero also enable the existing Open Arrow profile and configure its authorized private library as described in [OPEN-ARROW.md](OPEN-ARROW.md). Runtime does not create Brian's production identity or copy human/node private keys into a shared pool.

Linux/Node24 verification commands from `gateway/`:

```sh
npm run test:projection
npm run test:local-field
ONE_REFERENCE_ROOT=/absolute/path/to/authorized/rio-reference-impl npm run test:open-arrow
npm run field:projection-acceptance -- ../docs/evidence/projection-runtime-v0.1/customer-zero-trace.json /absolute/path/to/authorized/rio-reference-impl
```

The last command starts two real receiver processes with distinct keys, stores and output roots; forms and holds the Customer Zero report; constitutes/delegates/binds a Holo; records exact human commitment; writes and separately reads the report; records native proof/Return; acknowledges Return; creates explicit successor standing; carries the prior Holo to Host B and records fresh denial; kills/restarts Host A and verifies identity/history/revocation/Return reconstruction. The evidence export contains public keys/signatures only. Temporary private receiver/root keys and filesystem roots are removed. Same-machine independent processes and same-custody observation are the declared profile; no public Commons delivery or production deployment is claimed.

## Existing Helm/control equivalent

Use the existing JSON HTTP interface; all routes are POST on the configured loopback receiver. SourcePoint signs human controls externally. Each command is `{body, signature}` using canonical JSON/Ed25519. Common body fields: `field_id`, fresh `record_id`, `issued_at`, `expires_at`, root `issuer`, `projection_id`, and `type`.

| Route/type | Additional fields and effect |
| --- | --- |
| `/projection` / `projection_constitute` | `projection` immutable core; creates CONSTITUTED identity without authority |
| `projection_delegate` | `grant_id`; affiliates an existing exact standing grant with this Holo and clears prior binding |
| `projection_bind` / `projection_rebind` | `binding_id`, `host_node`, `delegation_ref`, `conditions`, `dependencies`; receiver independently admits/denies and records separate binding |
| `projection_suspend` / `projection_expire` | `reason`; retains identity/history and prevents operation |
| `projection_return` | `passage_id`, `return_id`, `receipt_id`; acknowledges the exact pending native account |
| `projection_renew` | `successor` new core, distinct ID/constitution and predecessor; terminal prior episode with no pending Return required |
| `projection_carry` | `carriage` from authenticated projection query; validates core/history, imports lineage with no active delegation/binding |
| `/projection` / `passage` | Existing node-signed consequential passage with projection references; RIO → Sentinel → actual adapter → native receipt/Return |
| `/control` / existing revocation | Existing `grant_id` or node revocation controls; current resolver enforces at point of use |
| `/query` / `query` | Root-signed `view: projection`, `projection_id` selects full history; default field status shows Mission Control topology |

The core records `projection_id`, `sourcepoint_id`, `constitution_ref`, `lineage_ref`, `projection_class: Holo`, `purpose`, `carrier_node`, `conditions: {}`, dependencies, Return obligations, times, renewal conditions and nullable predecessor/Exobody references. Delegation, host admission, binding, model/expression refs, native effect account and successor are separately recorded. Model attribution is declared candidate-source metadata; no external model API is fabricated.

## Boundaries

Projection references never substitute for node signature or human authority. Generic `/admit`, `/execute` and `/passages` cannot bypass the enabled Projection profile. Source ≠ Projection ≠ Host ≠ Model ≠ Expression. Holo ≠ Exobody ≠ Host. No Exobody is needed for this file operation.

Current effective standing is separate from recorded lifecycle: revocation, spent grants, expiry and dependency drift disable admission/use and appear as conflicts. Admitted-but-unreturned passages remain explicit obligations through suspension/expiry and block redelegation, binding and renewal. Carriage preserves unresolved obligations while importing no permission. Each account is acknowledged by exact IDs, including `receipt_id: null` for a genuine pre-effect HOLD; residual obligations keep the episode open. A fresh delegation requires fresh host binding. Rebinding denial preserves identity/history. Renewal creates a separately identified successor; it does not rewrite old delegation.

Machine-readable `/query` is the Mission Control and current Helm equivalent. It exposes source/lifecycle/delegation/binding/admission, pending Return, dependency drift, conflicts and successors alongside existing Local Field operational records. Viewing cannot mutate standing; human operations travel through signed controls. No graphical UI is claimed.

Limits: loopback HTTP, 64 KiB records, bounded create-only filesystem operation, separately provided private Open Arrow library, no federation latest-head consensus or automatic cross-host revocation distribution. Root/host compromise, arbitrary deployment and public delivery are outside this slice. Projection successor standing is distinct from #318 software successor installation.

Shared semantics: `rio-protocol/spec/projection-runtime-v0.1.md`; architecture and existing Loom binding: `one-rio-muss-architecture/docs/architecture/projection-runtime/` / #322 R-07 GAP. Native proof owner remains `rio-receipt-protocol`.
