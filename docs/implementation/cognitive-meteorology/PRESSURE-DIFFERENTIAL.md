# Pressure Differential — F0.1 implementation evidence

The implementation supports a `PRESSURE_DIFFERENTIAL` candidate regime **and** instruments a separate measured relation. Evidence favors keeping those types separate in F0.1. Permanent classification remains open.

| Typed object | Implementation |
|---|---|
| Candidate regime | `FieldoscopyReading.atmospheric_regime` or `candidate_regimes[]` value `PRESSURE_DIFFERENTIAL` |
| Experimental measured relation | `evaluation.pressure_differential = commit_velocity.magnitude - (1 - review_latency.magnitude)` when those windows align |

The relation compares normalized production load with review headroom inferred from review waits. It is a bounded provisional feature, not a stress/energy score, measured human capacity, or constitutional disposition. The evaluator exposes it independently of whichever regime is selected.

The required fixture produces relation value **0.875**, increasing production, lengthening review waits and falling calendar margin **0.12**. It selects `PRESSURE_DIFFERENTIAL` and also retains candidate `COLD_FRONT` and `HIGH_PRESSURE`.

A comparative fixture holds the **same current magnitudes and the same relation value 0.875**, but makes their movement stable. It selects `HIGH_PRESSURE` without `PRESSURE_DIFFERENTIAL`. Thus a large measured differential is not sufficient for the named moving-front regime. The same relation is available beneath multiple candidate classifications; the classification also depends on direction and Calendar context.

Other comparative fixtures demonstrate each of the seven additional candidate labels, plus empty, missing-domain and stale cases. Inputs and actual readings are in [comparative-cases.json](../../evidence/cognitive-meteorology-f0.1/comparative-cases.json).

**Bounded conclusion:** F0.1 evidence supports an underlying relational feature distinct from the regime label, which is compatible with interpretation B as an implementation factoring. It does not establish a permanent underlying operator, prove that all other regimes derive from it, or eliminate interpretation A as a display taxonomy. The implementation deliberately returns both constructions and their separation for review.

**Next experiment:** Keep Calendar and Git fixed. Predeclare matched pairs with the same current differential but different signed movement and available time; compare full-signal and differential-only classification against later observed review waits. Record misses as well as hits. Add no domain or actuation.
