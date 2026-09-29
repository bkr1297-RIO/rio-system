# ONE Local Field v0.1 — observed verification

Environment: Linux, Node v24.19.0. Scope: gateway Local Field profile; no production deployment or constitutional ratification.

| Command / check | Observed result |
|---|---|
| `npm run test:local-field` in gateway | 39 passed, 0 failed; all mandatory cases 01–14 plus hostile/recovery checks |
| `node --test tests/*.test.mjs` in gateway | 222 passed, 16 failed, 51 cancelled |
| Same full command on untouched `13f2f61281ffe0a51385ba27c68bf81080bdd8c8` | 183 passed, identical 16 failures and 51 cancellations at identical locations |
| `npm run typecheck` at runtime root | passed |
| Brian profile JSON Schema validation | passed; profile unchanged |
| Receipt `npm run test:local-field` | 9 passed, 0 failed |
| Receipt `npm test` after documented standalone initialization | passed: tamper6, chain15 assertions, SPG-M10, coherence checks |
| Protocol packet grammar validators (all five) | passed |
| Protocol Local Field schema validator against this trace | 7 real signed records, attributed Return and malformed-record checks passed |
| Architecture compiler, full matrix, Loom bindings, generated guide checks | passed |
| Architecture Loom/reconciliation Python suites | 38 + 17 passed |

The broad gateway failures are pre-existing: PostgreSQL-backed gateway/principal/governed-flow tests cannot connect to local PostgreSQL/servers; two SPG-M intake expectations fail (`refuses command-style use`, `holds when no literal signal is present`). All five failing files and their exact test locations match the untouched baseline. They were not rewritten. The initial receipt default run failed on an uninitialized/mismatched local standalone trust anchor; following its documented initialization made that existing suite pass. Generated standalone test keys/state were excluded from changes.

## Actual trace

Run `aedf7a91-0a7d-4719-86d9-229c44c876a3` at 2026-09-29T00:21:18.441Z. The receiver was a separate process, killed after completion and restarted with persisted identities and revoked standing. Engineering keys are explicitly isolated verification principals; they are not Brian's deployed signing key. No adapter, signature, database or successful observation was mocked.

| Transition | Real owner | Runtime artifact |
|---|---|---|
| SourcePoint intent / formation | `gateway/local-field/index.mjs` | intent `d95c4534-ee5a-4df8-b880-26da3de838f2`; origin text bound inside signed passage |
| Model artifact | `LocalField.candidate` | `bfa133cc-70b0-4684-9138-bb85a4467732`; authority_effect none |
| Enrolled source / receiver | `gateway/security/local-field-authority.mjs` | `field-node-a` / `field-node-b`, distinct keys and root-signed enrollment |
| Authority | same security owner | grant `8c74b84a-a4c0-46ef-8769-15dda879bd7e` |
| Typed passage | `gateway/local-field/http.mjs` + `LocalField.admit` | `dac2980f-88f0-45fe-ad95-e7f2e0eb1871` |
| RIO | `gateway/governance/policy-engine.mjs` | decision `88c89cc0-94d6-4154-ac03-de2e7d379e43` |
| Sentinel | `gateway/security/token-manager.mjs` + release binding | fidelity `c0b2dce6-d1f0-4b65-be6e-a0757ca34fa9` |
| Invocation | `gateway/execution/filesystem-executor.mjs` | `2d75b55f-f76a-4fb8-ad54-5430917c1e9d` |
| Durable attempt | `gateway/ledger/local-store.mjs` | `f2a0d5e7-4e31-4eb0-a688-93d5353e4204` |
| Actual occurrence | separate descriptor read | `9c830242-47e6-439c-a48b-10214a4965ac`, `OBSERVED` |
| Receipt | native gateway receipts | `1f7d28bd-6888-4da5-80fb-91705709a1a2` with receiver attestation |
| Proof ledger | native gateway ledger recipe, SQLite backend | 19 hash-linked entries in trace |
| Return | `LocalField` / existing receipt signer | `b9293441-1663-47d4-9cc1-ccdc456ebe78`; correlation `9b0462d3-140c-4ef4-9d03-9ed0c66a99b1` |

The independent driver read `one-local-field-return.txt`, 230 bytes, SHA-256 `2b247a9a43316d059f54677e564b013e49017dc7e233842df4655d67948ecf04`. The source machine-readable trace contains full signed artifacts, native receipt inputs, ledger entries, post-restart state, and runtime rejection results.

The separate crash regression invokes the real native write and then SIGKILL before observation/receipt. Restart produces a signed `UNSETTLED_ATTEMPT`, leaves occurrence unknown, and rejects replay. This test-only crash injection is not used in the successful acceptance trace.

A fresh independent review found and verified fixes for cross-node HOLD interference, missing native policy payload projection, incomplete Return proof binding, proposer-role checks, control-interface enforcement, PID reuse/namespaces, and wrong-key recovery. No unresolved review findings remained.

Limits: Linux/Node22.13+; loopback transport; exact create-only file profile; current v0.1 conditions must be empty; receiver-custody observation; externally supplied production trust anchor; no claim against host-admin compromise, complete storage rollback or unrelated legacy-route bypass. These are the implemented profile boundaries, not unimplemented claims of the accepted path.
