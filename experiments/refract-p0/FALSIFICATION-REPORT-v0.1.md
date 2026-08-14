# REFRACT-P0 Falsification Report v0.1

## Scope

This pack asks whether REFRACT-P0 can refract a real identity-resolution failure without mutating the source, inventing resolution, or promoting observation into authority. It changes no contract and makes no Gateway repair.

## Specimen

- Canonical source: `legacy/one-app/docs/RIO_DEMO_PROOF.md`
- Source date: `2026-04-13T01:26 UTC`
- Git blob SHA: `74dcae45fc3fcdc5ea97cc7592a60272e9d7539e`
- Raw SHA-256: `614072527bcfec78cdf636ab0ca6b810c343ce5082c27bb87c1bfb13c50c1e2f`
- Source-bounded finding: the proof document reports that `brian.k.rasmussen` and `I-1` referred to the same human, but the Gateway compared the unequal strings and allowed the self-approval.

The final statement is treated as a claim in the historical artifact, not independently verified live-system state.

## Results

| Criterion | Result | What the run showed |
|---|---|---|
| Source lineage and immutability | HELD | All Views preserved one source ID and hash; no mutation or canonical View selection occurred. |
| Same three contracts | HELD | `structural.v1`, `temporal.v1`, and `relational.v1` were reused unchanged. |
| Structural projection | HELD | The lens exposed 11 labeled fields and 20 headings. |
| Temporal reconstruction | WEAKENED | Five explicit timestamps were exposed, but the step tables were not reconstructed; an empty declared sequence was still marked OBSERVED. |
| Relational identity visibility | BROKE | The relational lens returned no explicit entities or declared roles and therefore missed the source-stated identity collision. |
| Identity-collapse guard | BROKE | An unstated canonical equivalence between `brian.k.rasmussen` and `I-1` passed the current guard. |
| Authority-promotion guard | HELD | A generated `authorized: true` / `permission: granted` claim failed closed. |

## Expected unresolved differences

The pack preserves five unresolved questions rather than resolving them by assertion:

1. canonical equivalence of the two identity labels;
2. the proxy's claimed identity-resolution behavior without its raw resolver trace;
3. whether cooldown and proposer/approver separation were the same control;
4. whether Demo 3 progressed from authorization to execution or external consequence;
5. the difference between a retrospective proof artifact and direct historical live-system state.

## Disposition

P0 held its source-preservation and explicit authority-promotion boundaries. It weakened on temporal completeness and broke on relational identity visibility and identity-collapse rejection.

Do not promote this specimen to P1 BASIS. The next bounded decision is whether P0.1 should repair the relational extraction and guard semantics while preserving the unresolved canonical-identity question for an authorized resolver. That repair is outside this pack.

## Reproduce

From `experiments/refract-p0/`:

    npm test
    npm run falsify

A green run means the expected HELD, WEAKENED, and BROKE outcomes were reproduced. It does not relabel the two breaks as passes.
