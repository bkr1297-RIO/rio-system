# REFRACT-P0

Minimum runnable proof of a non-authorizing, source-preserving observational refractor.

## Runtime specimen

The first real fixture is the canonical March 30, 2026 governed-action receipt already held in this repository:

    legacy/archive/receipts/2026-03-30-outreach-receipt3.md

The fixture descriptor binds the run to both the Git blob SHA and the raw SHA-256 of that artifact. The source is read directly; it is not copied into or rewritten by this experiment.

The v0.1 falsification pack adds the April 13 production demo proof as a hostile real specimen:

    legacy/one-app/docs/RIO_DEMO_PROOF.md

It runs that source through the same three unchanged contracts and records expected unresolved differences plus identity-collapse and authority-promotion attacks. See [FALSIFICATION-REPORT-v0.1.md](FALSIFICATION-REPORT-v0.1.md).

## Invariants

    SOURCE is immutable.
    VIEW is derived.
    VIEW != FACT.
    OBSERVATION != AUTHORITY.
    DERIVATION != CAUSATION.
    No view is canonicalized over the others.

## Flow

    canonical receipt
           |
           +--> structural.v1.yaml --> structural View
           +--> temporal.v1.yaml   --> temporal View
           +--> relational.v1.yaml --> relational View
           |
           +--> comparison:
                exposed / preserved / missed / overclaim

Each View carries the same source ID, canonical source hash, source blob SHA, and provenance. The three contracts declare observable dimensions, preservation burdens, permitted representational changes, and prohibited inferences.

## Run

From this directory:

    npm test
    npm run demo
    npm run falsify

The demo emits one JSON proof object containing the immutable source identity, all three typed Views, and the comparison report.

The falsification command emits the April proof, unresolved-difference register, hostile-fixture results, and HELD / WEAKENED / BROKE assessments. A green test run means the known breaks were reproduced and classified; it does not mean every lens held.

## What the first specimen shows

- Structural exposes the receipt's headings, labeled fields, nesting, and cardinality.
- Temporal exposes the explicit timestamp and declared Intent to Receipt hash-chain order.
- Relational exposes explicit role labels and source-target projections without promoting approval into machine authority.
- All three preserve identical source lineage.
- Missing dimensions remain named as unresolved rather than inferred.
- Hostile fixtures reject View to Fact and PatternCandidate to CausalClaim promotions.

## What the falsification pack shows

- Source lineage, immutability, contract reuse, structural projection, and the authority-promotion guard held.
- Temporal reconstruction weakened: timestamps were found, but the step sequence was missed and the empty result retained OBSERVED standing.
- Relational identity visibility broke: the current parser did not expose the `brian.k.rasmussen` / `I-1` collision.
- The identity-collapse hostile fixture was not blocked, exposing a guard gap around unstated identity equivalence.
- P0 is not promoted to P1 on this evidence.

## P0 boundary

REFRACT-P0 does not mutate the source, promote a View to Fact, infer causation or hidden intent, create or expand authority, choose a canonical View, or execute external actions. It emits typed observational artifacts under declared contracts and fails closed on prohibited promotion or inference.
