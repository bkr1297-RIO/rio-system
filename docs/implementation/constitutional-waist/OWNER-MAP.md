# Native owner reuse

| Responsibility | Existing owner | Bounded extension |
|---|---|---|
| SourcePoint and standing | `gateway/security/local-field-authority.mjs`, signed native field/grant controls | No new root, grant, lease authority or keyring. Root signs the invocation commitment against an existing decision and grant. |
| Interval standing and relation | `gateway/local-field/medium/index.mjs` | Reuses CCM passage binding, UnderWhoseAuthority, WhatMayRightfullyFollow, lineage and Return custody. Scope is checked before recoverable standing so HOLD cannot conceal a scope violation. |
| RIO/admission | `gateway/governance/policy-engine.mjs`, `LocalField.#decision` and native admission | Retains policy result on errors; a closed mapping of native recoverable burdens distinguishes HOLD from DENY. ADMIT remains separate from invocation. |
| Open Arrow formation | `gateway/local-field/open-arrow.mjs`, existing reference compiler | Its HumanCommit and Commitment remain upstream formation owners; this slice neither replaces them nor installs evidence/settlement/successor promotions. |
| Consequential commitment | `LocalField.control`, existing Ed25519 root verification and `gateway/security/token-manager.mjs` | Explicit post-admission root command binds exact passage hash and decision; existing single-use token is issued here for the opt-in profile. This runtime record derives no SourceAuthority. |
| Invocation and Sentinel | Existing LocalField current-authority recheck, token burn and descriptor guard | Signed invocation binds complete passage, source, subject, scope, target and lease; current dependencies/standing and commitment are rechecked at use. |
| Attempt, execution, observation | `gateway/execution/filesystem-executor.mjs`, LocalField, LocalStore | Native durable attempt before mutation; distinct execution record; explicit observation request invokes the existing separate descriptor read. |
| Occurrence account | Native `occurrence` record and adapter readback | Retains native naming. Identifies the observation supplying this bounded account. UNKNOWN remains possible after COMPLETED execution. Physical world truth is not created by a constructor. |
| HOLD behavior | Existing CCM queries and native root controls | PROBE performs local standing/eligibility inspection. Other actions record bounded next-step intents or withdrawal. Repair is performed only by existing authorized native controls; every reconsideration runs fresh gates. |
| Receipt and Return | `gateway/receipts/receipts.mjs`, native LocalField completion and CCM `return.capture` | Adds the waist trace to the existing execution hash material. Native receipt/Return and root-attributed CCM custody remain the owners. |
| Settlement, HOME, succession | Existing owners outside this slice | Not invoked; no replacement adjudicator or authority owner is added. |

`waist.mjs` contains closed field validation and conformance constants only. `waist.d.ts` describes record data; it does not claim that interface annotations enforce authority. All operative constructors are methods of the existing LocalField owner and call native gates. The original profiles retain their earlier admission/token behavior. The new stronger commitment requirement applies only to the externally signed waist profile.

Source routing: R-07 / architecture #322, adjacent R-24/R-18/R-12/R-13/R-20. This branch carries implementation evidence and does not amend route standing or canon.
