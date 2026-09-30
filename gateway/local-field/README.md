# ONE Local Field v0.1

Production-oriented local runtime slice under the existing gateway owners. It coordinates differentiated nodes; it does not replace SourcePoint, the principal model, RIO policy, execution-token fidelity, or receipt/ledger semantics.

## Run

Linux with `/proc`, Node **22.13+** (verified with 24.19), and gateway dependencies:

```sh
cd gateway
npm ci
npm run test:local-field
npm run field:acceptance -- ../docs/evidence/one-local-field-v0.1/acceptance-trace.json
```

The acceptance command starts a real receiver process, signs enrollment/grants using isolated engineering keys, submits an actual model-authored candidate, performs and independently reads a filesystem effect, records receipt/Return, checks replay and revocation, kills/restarts the receiver, and verifies reconstruction. It writes a public-key-only evidence bundle. It does not provision Brian's deployed identity. The core runtime does not import or depend on the acceptance driver.

To operate an already constituted field, supply a configuration file:

```json
{
  "state_directory": "./field-state",
  "anchor": {
    "principal_id": "<existing human principal>",
    "actor_type": "human",
    "primary_role": "root_authority",
    "public_key_hex": "<externally pinned Ed25519 raw public key>"
  },
  "receiver_node": "<enrolled receiver node>",
  "receiver_key_file": "./receiver.key",
  "definition": {"body": "<root-signed field definition>", "signature": "<signature>"},
  "port": 4403
}
```

The example marks externally supplied values; it is not a usable authority credential. On first boot, `definition.body` is the field object specified in `rio-protocol/schemas/local-field-v0.1.schema.json`. On reconstruction, the existing definition is read from SQLite; the same configured root and receiver key are required. Relative paths resolve against the config file. The receiver key file contains only that node's existing raw Ed25519 secret key and must have private permissions (for example 0600). The human and source-node private keys remain with those participants.

```sh
npm run field -- serve /absolute/path/to/field-config.json
```

The service listens only on `127.0.0.1`. Mobile is a supported enrolled node type and uses the same signed records; remote connectivity needs a separately governed secure transport deployment. This slice has no phone application or discovery service.

## Transport-independent API and HTTP adapter

`LocalField` exposes `control`, `candidate`, `admit`, `execute`, `inspect`, `verify`, `status`, `query`, and `close`. Internal object APIs share the configured host custody boundary; remote callers use authenticated signed transport records.

| POST path | Record and behavior |
|---|---|
| `/control` | Signed root enrollment/dependency update; signed scoped grant/revocation/supersession. Non-root issuers must be enrolled and declare this interface. |
| `/candidates` | Signed non-authoritative model/proposal artifact; never executes. |
| `/admit` | Signed passage → existing RIO evaluator plus current authority → durable separate decision. |
| `/execute` | `{passage_id, record: <same signed passage>}` → original-signer check, point-of-use fidelity, actual adapter, receipt and signed Return. |
| `/passages` | The same admission and execution methods in one request, with separate durable artifacts. |
| `/query` | Root-signed `query` body: `passage_id` selects the full chain, `view: ledger` exports the native ledger, otherwise field status. Read-only. |

Records are bounded to 64 KiB; requests time out; browser Origin requests are rejected. The payload profile is a create-only UTF-8 file of at most 4096 bytes, with a flat filename. No overwrite, traversal or symlink following. A native intent projects actual `content` and `target` into RIO policy inputs while preserving the complete passage for exact binding.

The query result is machine-readable state for Helm/Mission Control. Query authentication does not turn visibility into authority. Full receipts and Returns carry receiver signatures; the surrounding status projection is not a separately signed attestation.

## Continuity and proof limits

SQLite WAL/FULL persists field definition, independently enrolled keys, grant lineage, revocations, nonces, decisions, attempts, observations, native receipts, signed Returns and the existing gateway ledger format. A process lease uses boot identity plus the proc-visible PID/start time; PID reuse is not treated as continuity. Startup verifies the pinned root and receiver key before recovery.

Every ancestor and dependency is checked at admission and at use. Single-use standing is consumed transactionally with the recorded attempt before the filesystem effect. Rejected traffic from a different node cannot HOLD someone else's admitted passage. A restart holds unfinished admissions and reports interrupted attempts as `UNSETTLED_ATTEMPT`; it does not regenerate permission, replay an effect or infer occurrence from a function result.

The receiver observes the file with a separate descriptor read. This is a bounded observation within receiver custody, not an independent MANTIS witness or proof against malicious host administrators, full-disk rollback, clock compromise or arbitrary imported host code. Storage retention and network deployment remain operational work. The accepted profile's adapter has a private release guard; this does not claim closure of every unrelated legacy gateway route.

Protocol: `rio-protocol/spec/local-field-v0.1.md`. Proof profile: `rio-receipt-protocol/spec/LOCAL_FIELD_RECEIPT_PROFILE_v0.1.md`. Architecture/routing: `one-rio-muss-architecture/docs/architecture/local-field/`. Primary existing route **R-07 GAP / architecture #322**; no route closure, merge or doctrine ratification is claimed.

## Open Arrow Customer Zero

The optional constituted approval/promotion profile is documented in [OPEN-ARROW.md](OPEN-ARROW.md). It uses the same receiver, grants, RIO, Sentinel, adapter, receipt and ledger.

## Projection Runtime

Persistent Holo lifecycle, explicit delegation and independent host admission are documented in [PROJECTION-RUNTIME.md](PROJECTION-RUNTIME.md). The optional signed field profile composes with these same owners and exposes existing signed human controls and field topology.
