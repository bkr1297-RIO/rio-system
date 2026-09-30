# Projection Runtime v0.1 independent review

One fresh whole-change review, read-only, against the authorized contract and existing owners. The reviewer reran the configured 71-case integration suite and reproduced three material findings. No second reviewer or delegated implementation was used.

| Finding | Reproduction | Resolution / verification |
| --- | --- | --- |
| P1: carried history lost unresolved Return | Execute on A, expire with pending account, carry complete signed view to B, renew incorrectly succeeds | Inherited accounts and open admissions reconstruct as obligations while grants/bindings stay inactive. Two carriage regression cases RED→GREEN. |
| P1: admitted-but-unreturned operations escaped guards and could strand multiple accounts | Admit, expire, renew; or admit/suspend/redelegate/operate before prior account closes | Explicit open passage tracking blocks redelegation/binding/renewal until closure. Exact correlated acknowledgements can close each residual account; final closure alone marks RETURNED. Expiry/renewal and suspension/redelegation regressions RED→GREEN. |
| P2: schema rejected real null-receipt HOLD acknowledgement | Suspend after admission, execute held, acknowledge native Return with no receipt | Portable command permits null receipt; real HTTP HOLD/acknowledgement export rejected before schema fix and passes afterward. |

All 75 final relevant Local Field/Open Arrow/Projection cases passed; 23 are Projection cases. The real final driver additionally exercised successful file consequence, original Holo Return/successor, denied Host B admission, a receipt-less held successor episode, and SIGKILL/restart reconstruction. No effect adapter, signature or persistence mock was used for that run.

No critical/important finding remains in the declared profile. No minor finding was deferred. Review declined production provisioning, federation latest-head/revocation guarantees, privileged host/root compromise and unrelated legacy gateway failures; the build makes no claims in those areas. Broader gateway results and exact unchanged failure/cancellation locations are recorded separately.

Rulings: compose with existing carrier-subject grants rather than introduce a principal/root; signed JSON controls/query are the existing Helm equivalent; engineering credentials demonstrate actual runtime effects without fabricating Brian's production identity; acceptance O applies to all relevant tests, while unrelated baseline failures remain disclosed. Costs/limits: externally authorized provisioning and a graphical client remain later deployment/interface work; federation/witnessing/host containment need their own governed implementation; an estate-wide release needs unrelated service repairs. Review findings did not justify widening this build or merging the review stack.
