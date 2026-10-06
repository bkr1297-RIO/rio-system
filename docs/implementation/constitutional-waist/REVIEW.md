# Independent review and bounded repairs

One read-only independent review examined the original unstaged candidate against `fc9c9382f3420691c94c8ec9f9a16be15495d3bb`. Its original waist suite passed 27/27. The reviewer found two Important defects and one Minor reporting defect; no Critical defect was demonstrated. The later native-candidate carrier migration and final repairs were verified by the implementing coordinator, not claimed as a second independent review.

| Finding | Reproduction | Repair and final evidence |
|---|---|---|
| Invocation expiry checked at entry but not at final release | Real 50/75/100 ms invocation leases expired before a durable attempt and still created an artifact. | Reauthenticate the stored invocation and its exact bindings at the descriptor guard; recheck temporal burdens after cryptographic work. The final regression rejects an invocation expiring after entry. |
| Unchecked derived invocation history could be sealed into a receipt | Change stored `request.body.source_node` after execution without changing its signature or ledger; observation sealed the substituted history. | Validate native ledger custody, original signatures and exact stage links before readback/sealing. Altered invocation history produces no observation or receipt. |
| Related CCM startup ordering skipped waist validation during native Return replay | The waist profile was enabled after CCM constructed its replay verifier. | Enable the profile before CCM replay. A completed captured Return with a subsequently substituted invocation index prevents startup. |
| Repeated ADMIT looked current after authority revocation | Retry returned the original immutable ADMIT although current eligibility was DENY. | Label the decision `HISTORICAL_RECORDED_DECISION` and report current eligibility separately. Commitment and invocation still require fresh checks. |

The expiry and trace-custody regression tests were first run against narrowly restored defective logic and failed 2/2 as expected. The startup and historical-label tests likewise failed 2/2 before their repairs. Those temporary defect reproductions were removed; they are not committed implementation. Raw evidence is in `docs/evidence/constitutional-waist-f0.1/review-reproductions-red.log` and `review-startup-red.log`.

The final waist suite passed 33/33, the expanded inherited suite passed 225/225, and configured Open Arrow tests passed 13/13. The real CLI specimen passed after these repairs. The review identified custody defects within the existing derived-record corruption model; these repairs do not establish containment of a fully compromised host.

The semantic carrier was reconciled into the existing signed native candidate and canonical `origin.candidate_id`. Its formation hash is bound into disposition and native receipt material, with live source/signature/freshness checks at consequential gates. Explicit bilateral dispatch/receive rejection prevents convenience paths from bypassing this profile's sequence. No second envelope or signature system was added.
