# Independent review and repairs

Fresh read-only review covered `5df28c0e4262616bf560787a3a365583370351da..a422cdc1880c904b46ec11f6f4cdec8065ff133c`. The reviewer reran 28 Node tests successfully and identified two Important data-boundary defects. No Critical finding was reported. Python schema validation was independently executed by the implementation workbench with a scratch-installed Draft 2020-12 validator; the reviewer did not have that package in its default Python environment.

| Finding | Reproduction before repair | Repair and verification |
|---|---|---|
| Boxed metrics carried hidden raw content and coercion behavior into a signal | `new String('commit_velocity')` with a raw property passed hash/type validation and survived as `signal_type` | Require a primitive metric string before property lookup or coercion; regression rejects boxed content and confirms the coercion hook is never invoked |
| Received reading arrays admitted hidden fields and executable prototypes | Hidden `source_code` on a reading array passed; a custom prototype `.map()` could inject display content | Apply the strict prototype, complete-own-key and data-descriptor array envelope at every received reading array, including manifest, references and nested horizon arrays |
| Equivalent windows could fail alignment after object-key reordering | Valid signal generated from `{end,start}` timestamps suppressed the primary pressure fixture | Compare an explicit four-timestamp tuple; equivalent values now align regardless of property insertion order |

All three regressions failed against the reviewed code, then passed after the repairs. Combined Node suite: **31 passed, zero failed/skipped**. Independent schema suite: **3 passed**. No second independent review is claimed; repairs were verified through the reproducing tests and the full suite.

The reviewer graded the window-order case Minor. The workbench regraded it Important because independently serialized Calendar/Git windows can have different object-key order despite identical meaning, suppressing a legitimate cross-domain reading. It was fixed in the same review repair pass. No Minor issue is deferred.

## Scope judgments retained

- Partial observations remain SHADOWED/PARTIAL, with missingness and candidate wording. Exposing confidence more prominently is a later display choice, not a new F0.1 feature.
- Actually stale or mismatched observations cannot support confident cross-domain classification. Fresh individual observations can remain visible with explicit caveats.
- An explicit empty Calendar list within a declared working window measures available time. Unavailable sources are represented by missing signals. Empty PR sets/zero Git baselines omit unavailable measurements.
- Thresholds, illustrative 24–48-hour horizons, arbitrarily separated nonoverlapping comparison windows, event-buffer conventions and generic non-pressure driver selection are declared specimen limits; no calibrated alternative is claimed.
- JSON Schema constrains shape; executable validation additionally checks hashes, time ordering, freshness and reconstructable lineage. Those are intentionally distinct checks.
- Pressure feature/regime separation is implementation evidence. Neither permanent ontology nor derivation of all regimes from one operator is established.
- Real snapshots and restricted-process checks prove the implemented interface's bounded zero effect. No universal claim covers arbitrary executable programs, every network channel, or future integrations.
- External connectors, production calibration, deployment and constitutional change remain outside this specimen.
- Build-report completeness is checked by the workbench after review; it is not attributed to the reviewer's earlier committed range.

These judgments preserve the supplied F0.1 contract. Their cost if a later integration needs stronger behavior is further implementation/conformance work below the cut, not automatic authority or broader sensing.
