# CTL K0.1 read-only shadow observer

This experiment observes completed RIO gateway records after the fact, projects only
explicit source facts into a K0.1 shadow request, and optionally invokes the separately
packaged K0.1 runner. It is not imported, called, awaited, or supervised by the gateway.

Its exact research standing is `POST_FACTO_RETROSPECTIVE_SHADOW`. It cannot seal a K0
judgment before the human disposition, authorization, execution, or recorded gateway
status. Consequently, records from this lane are `promotionEligible = false` and must
not count toward Advisory or Enforcement promotion thresholds.

The observer has no decision authority. Its output is always:

```text
NON_AUTHORITATIVE_SHADOW
NOT_FOR_DECISION_USE
```

It cannot authorize, block, route, execute, settle, write a receipt, write the ledger,
or alter an intent. A K0 `PASS` is not an `ALLOW`. Semantic denial or breach is data,
not a process failure.

Every emitted request or result is wrapped in a shadow-owned `K0_EVALUATION` record.
The wrapper—not the runner—fixes the non-authority labels, `gatewayEffect = NONE`,
retrospective capture mode, input/report digests, and promotion ineligibility.

## Hard boundary

Allowed source requests:

- `GET /api/v1/ledger`

The observer contains no POST, PUT, PATCH, or DELETE path and no imports from
`gateway/`. The currently reviewed gateway cannot support the initially proposed
API-key lane: principal resolution runs before API-key authentication, and API-key
validation itself updates `last_used_at`. This draft therefore accepts only a
pre-provisioned auditor bearer token. Production activation remains blocked until a
separately reviewed least-privilege, read-only credential and rotation path exists.

The ledger endpoint is cache-backed and can change during pagination. Each capture
reads the page and chain tip, then reads the tip again. A changed tip or total produces
`CHAIN_TIP_CHANGED`; the data is not submitted to K0. Equal tips establish only a
`CHAIN_TIP_STABLE_NON_ATOMIC` observation window, not durable persistence or an atomic
database snapshot.

Ledger status is only an observation. It is never projected as `ActualHistory`, an
authorization basis, lawful succession, outcome support, or settlement. The observer
does not fetch full intents. Ledger detail is discarded, so raw intent parameters never
cross this source adapter.

## One-shot use

This package is deliberately not deployed by this PR. Run it as an independent process:

```bash
RIO_GATEWAY_BASE_URL=http://127.0.0.1:4400 \
RIO_SHADOW_AUDITOR_BEARER_TOKEN='pre-provisioned-auditor-token' \
node experiments/ctl-k0-shadow-v0.1/src/main.mjs
```

Without `K0_SHADOW_RUNNER_BIN`, it emits canonical K0 shadow request envelopes only.
With a pinned runner binary, it pipes each envelope to that separate process:

```bash
K0_SHADOW_RUNNER_BIN=/opt/one/one-k0-shadow \
RIO_GATEWAY_BASE_URL=http://127.0.0.1:4400 \
RIO_SHADOW_AUDITOR_BEARER_TOKEN='pre-provisioned-auditor-token' \
node experiments/ctl-k0-shadow-v0.1/src/main.mjs
```

Activation requires a separate deployment decision, a pre-provisioned read-only
credential, independent resource limits, a shadow-only sink, and a kill switch that
stops only this observer. The gateway must not depend on observer health.

Merge and local execution do not authorize attachment to a production endpoint,
issuance or use of production credentials, or processing of live data. Every live-data
connection requires a separately attributable activation, data-access, privacy,
security, resource, sink, and kill-switch disposition.

## Promotion boundary

This observer uses the admitted reference evaluator and therefore does not satisfy the
independent-implementation gate. The current PR also does not implement prospective
sealing, human-disposition ingestion, or consequence linkage. Their schemas and linkage
keys are frozen here so a later activation PR can add read-only adapters without
silently changing the experiment semantics.

Because authority/derivation material is deliberately withheld in this first source
projection, `NOT_ESTABLISHED` is expected. It must not be scored as disagreement with a
human approval; it is initially an `INPUT_TELEMETRY_GAP`.
