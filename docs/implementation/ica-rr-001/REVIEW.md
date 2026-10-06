# ICA-RR-001 whole-branch review

Fresh read-only reviewer, GPT-6 Astra, reviewed `2b966f1..2c1b7b1b38d40bbd3d66e7228bd02d9d121d31ad`. Independently ran the new suite: 26 passed, zero failures/skips. No Critical or Minor findings. Two Important findings, both accepted by user effect and repaired below the Cut in one author fix pass.

1. Equal JavaScript character lengths could hide unequal UTF-8 lengths in credential comparison, throwing before authentication and rendering the private view from the generic error handler. Unicode entry-key and session-cookie regressions, plus malformed URL handling, reproduced disclosure RED. Buffer-length-safe comparison and an account-free pre-authentication error response made all three GREEN.
2. Missing or changed note bytes caused Evidence admission to throw after the native observation transition, leaving Return unreachable. Two authenticated native-form regressions reproduced the dead end RED. The journey now records unestablished evidence and composes a complete reporting account with occurrence UNKNOWN and outcome UNRESOLVED; no Evidence or success is invented. Both became GREEN.

All five regression tests passed. Post-fix combined suite: **367/367 passed, zero failures/skips**, at production-fix commit `4749642af9f574132e5ecedcfc1220bd8967d0e7`. Existing nominal type consumer passed under TypeScript 5.9.3; three Fieldoscopy schema tests passed. No second reviewer or re-review is claimed. Additional evidence-export changes only capture those already-tested readback faults.

The reviewer found native authority ownership, separate lifecycle coordinates, fixture qualifications, revocation limits and zero authority on GET/retention sound. Dependency/checklist/controller/lived-assay rulings were judged reasonable when their limits remain disclosed.

Declined-to-judge items and author rulings are exhaustively preserved in BUILD-REPORT.md: production authentication; travelling continuity/key migration; distributed revocation/physical control; live source/forecast calibration; physical partition proof; browser/human acceptance; inherited legacy integration; final publication/tree parity. The final author verification addresses publication parity; the other claims remain explicitly outside this bounded evidence.
