# Open Arrow Customer Zero implementation plan

Spec: architecture `docs/language/open-arrow/ONE-OPEN-ARROW-BUILD-SPEC-v0.1.md`.
Branch: `build/one-open-arrow-v0.1`, stacked on Local Field #202. No merge.

1. Reconcile (complete): native compiler F0.1, TOP, existing Local Field, receipt verifier; bind #322/R-07 with R-08/R-18 dependencies. No private source copied into public runtime.
2. RED→GREEN: pure Customer Zero compiler adapter at the existing private compiled-occurrence owner. Reuse native parser/IR/checks, preserve the eight-field conservation vector; typed immutable envelope/promotion graph. Run native compiler and new tests.
3. RED→GREEN: Local Field profile integration. Persist Proposal/HOLD, authenticate explicit HumanCommit against existing grant; enforce commitment in every admission/use path. Expose signed /arrow requests and query projection. Real create-only filesystem path unchanged.
4. RED→GREEN: existing TOP bridge for observation qualification, judgment, settlement, successor standing. Each promotion root-signed, exact and append-only. Unknown cannot establish success. Reconstruct persisted history.
5. Run actual Customer Zero in a receiver process over HTTP. Export actual IDs, signatures, file readback, denial/failure, restart and separate success fields. Validate portable schema and existing independent receipt verifier.
6. Run affected/full suites and baseline comparison. One fresh whole-change review; fix material findings with regressions. Commit each changed repository and open crosslinked draft PRs. Return binary gate and exact limitations.

Interfaces: compiler consumes authenticated expression plus constituted field/proposal request; emits pure checked source/AST/IR/OA-IR. Runtime consumes that immutable output; authority remains the existing grant resolver. TOP consumes only reconstructed real receipt/attempt/observation and authenticated disposition projections. No native fixture generator is a runtime dependency.

Review focus: caller-selected profile/dependency escape; commitment omitted through generic endpoints; current authority after admission; record/hash splice; same-key pseudo-human approvals; TOP root substitution; unknown→non-occurrence; successor recognition→installation; mutation hidden by object aliasing; partial persistence/restart; private-code/public-source boundary.
