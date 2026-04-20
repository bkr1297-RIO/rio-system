# Appendix: Witness Isolation Specification

**Version:** 0.1
**Status:** Draft

---

## Overview

Witness isolation ensures that the observation layer (Mantis/Witness) cannot influence the execution layer. The witness records what happened but cannot change what happens.

---

## Isolation Boundaries

| Boundary | Rule |
|----------|------|
| Witness → Gate | Witness cannot issue, modify, or revoke authorization tokens |
| Witness → Adapter | Witness cannot call adapter execution methods |
| Witness → Ledger | Witness can read the ledger but cannot write to it (except audit entries) |
| Witness → Credentials | Witness has zero access to execution credentials |

---

## Witness Capabilities

The witness CAN:
- Read the ledger (all entries)
- Read receipts (all receipts)
- Verify the hash chain
- Verify receipt signatures
- Verify the authority chain (genesis → policy → token → receipt)
- Generate audit reports
- Trigger alerts to the root authority

The witness CANNOT:
- Propose, approve, or execute intents
- Issue or burn authorization tokens
- Access SMTP credentials, Drive tokens, or API keys
- Modify ledger entries or receipts
- Override Gate decisions

---

## Implementation

In the live system, the witness role is implemented as the "Chief of Staff" (auditor principal). The `verifyAuthorityChain()` function in `authorityLayer.ts` is the primary audit tool.

The witness isolation is enforced by:
1. **Module-private credentials** — Adapters hold credentials in module scope, not exported
2. **Role-based procedure access** — Auditor role cannot call execution procedures
3. **Read-only ledger access** — Audit queries use SELECT, never INSERT/UPDATE/DELETE
