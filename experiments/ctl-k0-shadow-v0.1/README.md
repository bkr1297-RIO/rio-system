# CTL K0.1 read-only shadow observer

This experiment observes completed RIO gateway records after the fact, projects only
explicit source facts into a K0.1 shadow request, and optionally invokes the separately
packaged K0.1 runner. It is not imported, called, awaited, or supervised by the gateway.

The observer has no decision authority. Its output is always:

```text
NON_AUTHORITATIVE_SHADOW
NOT_FOR_DECISION_USE
```

It cannot authorize, block, route, execute, settle, write a receipt, write the ledger,
or alter an intent. A K0 `PASS` is not an `ALLOW`. Semantic denial or breach is data,
not a process failure.

## Hard boundary

Allowed source requests:

- `GET /api/v1/ledger`
- `GET /api/v1/intents/:id`

The API key must have `read` scope and resolve to an `auditor` principal. The observer
contains no POST, PUT, PATCH, or DELETE path and no imports from `gateway/`.

The ledger and intent endpoints are cache-backed and are not an atomic snapshot. Each
capture reads the ledger tip, hydrates intents, and reads the tip again. A changed tip
or total produces `NON_ATOMIC_SNAPSHOT`; the data is not submitted to K0. A lower total
or a changed tip at the same total is returned as a possible source rewind/epoch rupture.

Ledger status is only an observation. It is never projected as `ActualHistory`, an
authorization basis, lawful succession, outcome support, or settlement. Raw intent
parameters and ledger detail are discarded; only a deterministic parameter digest is
retained.

## One-shot use

This package is deliberately not deployed by this PR. Run it as an independent process:

```bash
RIO_GATEWAY_BASE_URL=http://127.0.0.1:4400 \
RIO_SHADOW_AUDITOR_API_KEY='read-only-key' \
node experiments/ctl-k0-shadow-v0.1/src/main.mjs
```

Without `K0_SHADOW_RUNNER_BIN`, it emits canonical K0 shadow request envelopes only.
With a pinned runner binary, it pipes each envelope to that separate process:

```bash
K0_SHADOW_RUNNER_BIN=/opt/one/one-k0-shadow \
RIO_GATEWAY_BASE_URL=http://127.0.0.1:4400 \
RIO_SHADOW_AUDITOR_API_KEY='read-only-key' \
node experiments/ctl-k0-shadow-v0.1/src/main.mjs
```

Activation requires a separate deployment decision, a pre-provisioned read-only
credential, independent resource limits, a shadow-only sink, and a kill switch that
stops only this observer. The gateway must not depend on observer health.

## Promotion boundary

This observer uses the admitted reference evaluator and therefore does not satisfy the
independent-implementation gate. Its purpose is bounded reality contact: compare K0
judgments, human dispositions, and later consequences without granting K0 control.
