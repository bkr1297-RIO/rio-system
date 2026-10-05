# CCM-001 F0.1 conformance

This report concerns the opt-in, single-SourcePoint LocalField interval kernel. Its supported inbound standing is a separately warranted **SourcePoint-qualified claim for a declared orienting use**. It does not establish independent MANTIS truth, settled evidence, succession, HOME mutation, whole-host containment or whole-system conformance.

| Criterion | Implementation and observed evidence |
|---|---|
| 1. Interval-specific standing | `WhatStands` pair index returns independently constituted parallel intervals; H-01/H-07 use byte-identical payloads with different standing. Network-position fixture tests authority into unrelated I_BC. |
| 2. Warrant and predecessor for every transition | Exact native root command, content-hash source retrieval, subject/dependency/predecessor binding; stale commands and appended old signed warrants rejected. |
| 3. Explicit cross-interval information | `cross.open` requires both predecessor heads, source Return hash, independent source/target, scope, uncertainty, dependencies and Return contract; H-02/H-08. |
| 4. No authority inheritance | Target standing unchanged after notification; H-09, centrality control, exact native interval grant binding. |
| 5. Independently typed arrows | Native outbound ADMIT/DENY and separate root-qualified inbound ADMIT/HOLD; all four quadrants with actual sandbox effects/observations. |
| 6. Return cannot rewrite outbound | No receipt-rewrite operator; immutable judgment per exact Return; H-05/H-11. Native denial/decision remain separate owners. |
| 7. Authorization cannot manufacture truth | Bad-signature observation held after lawful execution; truth remains UNESTABLISHED even after valid provenance and root judgment; H-06. |
| 8. Dependency invalidation | Native current checks, CCM signed revision snapshots, point-of-use guard, ABA/change-restore, deleted dependency-index and duplicated native revision controls; H-10. |
| 9. Exact subject/replay binding | Signed passage content hash, interval-purpose/source/target constraints, command coverage and nonces; H-12 and stale predecessor tests. |
| 10. Historical reconstruction | Append-only native custody and exact source-warrant event coverage; authority, refresh, supersession and open-passage historical views; exact ordinal cursor; restart heads match. |
| 11. H-01..H-12 before S3 | Sequential harness runs S1 then S2, aborting on assertion failure; 15 recorded checks per stage include the 12 required hostiles, centrality, fourth quadrant and stale detection. |
| 12. Field-scale queries without master sovereignty | S3: 1,000 participants / 100,000 active intervals; all eight query examples, source warrants and reconstructable lineage recorded. No participant identity/centrality-to-standing constructor. |

## Review repairs

The fresh read-only review reported eight reproducible defects: replayed standing warrant, malformed observation persistence, dependency-index deletion/ABA, incomplete historical state, permanently admitted stale crossing, revoked-node query, revoked-observer provenance, and unverified receipt-less Return. The repaired suite tests each case. Additional controls cover self-supersession, timestamp ties, old native dependency-warrant replay and authenticated transport.

Replay now reconstructs exact signed batches once and rejects missing/extra/repeated applications. Observation shape is checked before transaction commit. Native dependency source custody drives revisions. Earlier valid observation provenance is reconstructed at native ledger position so later revocation cannot alter history. Current preflight delegates to the native decision owner, and standalone failure/restart Returns reuse the native verifier.

## Verification reading

Raw final CCM/regression logs and final scale JSON are in `docs/evidence/ccm-001/`. The machine-readable acceptance report records commands, source digests and bounded disposition. A scoped candidate CI workflow runs CCM, native regressions and S1; no branch protection or mandatory global gate was changed.

The default PostgreSQL-backed gateway suite is separately recorded: 13/13 tests failed with localhost:4401 ECONNREFUSED in this environment. It is not reported green and is not bypassed. This suite's service setup is separate from the tested LocalField runtime.

Measurements are one local execution per reported run, with Node 24, a 4 GiB heap ceiling, 64 KiB commands, 128-item batches and 1,000 query samples. Constitution throughput counts interval writes; storage is SQLite plus WAL/SHM; RSS is the process reading at the end of population. Zero failure counters mean no failure observed in the executed assertions, not universal proof against every architecture or compromised host.
