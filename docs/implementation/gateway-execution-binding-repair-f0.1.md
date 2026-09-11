# Gateway Execution Binding Repair F0.1

Status: PROPOSED FOR HUMAN REVIEW  
Promotion authority: human review  
Source census: rio-reference-impl PR #199, merged as `22256e811b67a846ea4859b42e5265c6b6dac977`  
Implementation base: rio-system `7be75d60c918d70b99e2aec3c302ad1edfeb5154`

## Result

This change repairs the four gateway findings prioritized by the accepted consequential-bypass census. It does not claim whole-gateway, deployment, distributed, or estate-wide closure.

| Census finding | Repair standing | Mechanical result |
|---|---|---|
| CB-005 nested argument loss | CLOSED in this token profile | Strict recursive canonical JSON binds every nested key/value and array position. Non-JSON, accessor, hidden, sparse and cyclic carriers fail before hashing. |
| CB-006 omitted checks reported valid | CLOSED in this token profile | Issuance requires exact tool, argument digest, environment, one-use limit and signature. Burn requires every binding, exact issued signature, stored-payload integrity and signature verification. |
| CB-007 two concurrent direct dispatches | CLOSED for one gateway process; distributed residue OPEN | `/execute-action` compare-and-sets `authorized -> executing` before its first connector await. One local caller reserves; later callers fail. PostgreSQL persistence is asynchronous and is not a cross-process or crash-recovery lock. |
| CB-008 unapproved fallback / premature receipt | CLOSED on `/execute-action` | Delivery mode comes from approved intent parameters. This direct route permits `gateway` only. SMTP/SMS failure or incomplete delivery blocks with no receipt, no external payload and no implicit fallback. |

The direct route also refuses unsupported actions instead of translating a simulation into an execution receipt. Replay prevention now covers `/execute-action` and the API v1 execute/confirm paths. Nonce uniqueness and per-intent admission remain distinct controls.

## Changed behavior

- `computeArgsHash` now accepts only a plain JSON object and uses recursive key ordering.
- `issueExecutionToken` rejects unsigned, unbound and multi-use issuance.
- `validateAndBurnToken` rejects missing checks without consuming the token.
- Internal and API v1 confirmation routes now supply the stored exact signature and gateway verifier.
- `updateIntentIfStatus` provides the existing process-local intent cache with a guarded transition.
- `/execute-action` validates delivery/action/recipient and current policy before reserving; it reserves before token issuance and connector use.
- Only connector status `sent` may advance to executed/receipted on this route.
- Connector error, trial restriction or another incomplete status becomes `blocked`, with no success receipt.

## Test evidence

Environment used locally: Node 24.19.0.

| Command | Result |
|---|---:|
| `npm run test:execution-binding --prefix gateway` | 12/12 |
| `npm run test:c2c --prefix gateway` | 14/14 |
| `npm run test:prime --prefix gateway` | 21/21 |
| `node --test gateway/tests/sms-executor.test.mjs gateway/tests/policy-engine.test.mjs` | 56/56 |
| Bounded passing total | 103/103 |

No SMTP, SMS, database, OAuth or live gateway request was made by the new suite. Connector behavior is dependency-isolated; cryptographic signatures, token lifecycle, route source and intent transitions use the implementation under review.

The main-branch SPG-M suite was also executed and returned 48/50. Its two failing tests are the already-open fact/symbol boundary residue addressed by draft PRs #198/#199 in this repository. The failing source and tests retained their exact main-branch Git blobs (`d4cae565ac4a74366c3165f7cc8b13774eb21a32` and `432fb051ee87a5e0eabf6e132b9f6d0bfe730d6e`). This repair does not touch, absorb or report those tests as passing.

## Remaining gaps

- The guarded intent reservation is not a PostgreSQL compare-and-set and does not coordinate multiple gateway processes.
- Token and nonce stores are process-local and do not survive restart.
- The external-agent `/execute -> /execute-confirm` path still treats agent confirmation as a report; it is not independent observation of the external effect.
- Exported SMTP/SMS adapters still rely on caller discipline outside the route.
- A successful external effect followed by receipt/database failure needs a separate post-effect recovery protocol.
- Login/signature-mode configuration, control-plane writes, other routes, apps and deployments remain outside this repair.
- Legacy Python findings CB-001 through CB-004 remain open in rio-reference-impl.

## Promotion recommendation

READY_FOR_HUMAN_REVIEW for the bounded gateway repair.

Acceptance should mean only that the named code paths and single-process profile have passed review and tests. It does not establish whole-estate no-bypass closure, production deployment, durable distributed admission, independent occurrence observation, or canonical standing.

