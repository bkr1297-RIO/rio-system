# Whole-branch review and author fix verification

One fresh, read-only whole-branch review compared #208 `5df28c0e4262616bf560787a3a365583370351da` with `f2aa0de1347a877e0db5a6806fadaef79493d16d`. Reviewer independently ran all 30 then-existing tests and additional native/TypeScript probes. Verdict: changes requested; five Important findings, no Critical or Minor findings, and an empty Declined to judge list.

| Finding | Observable RED | Fix and GREEN burden |
|---|---|---|
| Unqualified identifiers collide between Permission and Revocation | A valid signed revocation uses the Permission UUID; reconstruction returns Permission for a revocation claim | Projection references include artifact kind and ID; all four revocation claims reconstruct the actual Revocation |
| Completed capture loses executor receipt account | Captured native execution is COMPLETED while Return says receipt ABSENT and display omits it | `captureAttempt` separately reconstructs its OccurrenceClaim from retained native execution; Return reports PRESENT and screen exposes report without inferring occurrence |
| Revocation prose and Interrupt scope are too broad | A second lawful grant through the same executor succeeds while screen promises executor-wide disablement | Text, machine scope and assay explicitly name the revoked grant/affected lineage; other grants are not disabled by this claim |
| Expired no-attempt lease cannot close reporting | Native expiry rejection with attempt:null; Return composer rejects the lease | Permission/lease/attempt are explicit reporting bases; a no-attempt Return reports NOT_ATTEMPTED, EXPIRED, receipt ABSENT, UNKNOWN occurrence and UNRESOLVED objective, with COMPLETE reporting |
| Nominal declarations are disconnected from runtime import | TypeScript 5.9.3 NodeNext import reports TS7016 and unused expected-error checks | Associated `account.d.mts` forwards the declarations; strict compile consumer accepts valid uses and rejects seven prohibited substitutions/conversions |

The author reproduced all five findings before fixing them. The first grant-scope reproduction used `other.txt`, outside the fixture interval; it was corrected to the already lawful `lawful.txt` and failed on the actual overbroad text before the fix. Both raw reproduction logs remain attributable rather than substituting the unrelated scope failure for the defect.

All five are fixed in one author pass, with runtime regression tests and strict compiler checks. Final suite results are in the build report and verification artifact. No second independent review was requested or claimed. The compiler-location follow-up retrieved only the already used dependency path; it did not re-review the patch.

No declined behaviors or deferred minor findings remain. The same-receiver readback, declared partition stub, qualified local Evidence and control-specific irreversibility remain explicitly bounded. This review does not certify a deployed system, physical-world truth, remote cessation or constitutional standing.
