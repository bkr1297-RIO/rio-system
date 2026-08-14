# REFRACT-P0

Minimum runnable proof of a non-authorizing, source-preserving observational refractor.

## Runtime specimen

The first real fixture is the canonical March 30, 2026 governed-action receipt already held in this repository:

    legacy/archive/receipts/2026-03-30-outreach-receipt3.md

The fixture descriptor binds the run to both the Git blob SHA and the raw SHA-256 of that artifact. The source is read directly; it is not copied into or rewritten by this experiment.

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

The demo emits one JSON proof object containing the immutable source identity, all three typed Views, and the comparison report.

## What the first specimen shows

- Structural exposes the receipt's headings, labeled fields, nesting, and cardinality.
- Temporal exposes the explicit timestamp and declared Intent to Receipt hash-chain order.
- Relational exposes explicit role labels and source-target projections without promoting approval into machine authority.
- All three preserve identical source lineage.
- Missing dimensions remain named as unresolved rather than inferred.
- Hostile fixtures reject View to Fact and PatternCandidate to CausalClaim promotions.

## P0 boundary

REFRACT-P0 does not mutate the source, promote a View to Fact, infer causation or hidden intent, create or expand authority, choose a canonical View, or execute external actions. It emits typed observational artifacts under declared contracts and fails closed on prohibited promotion or inference.
