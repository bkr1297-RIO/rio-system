# Open Questions

Questions that need Brian's decision, team input, or further investigation. This is the decision queue.

---

## How to Use This File

Add questions with:
- **Date raised**
- **Raised by**
- **Question**
- **Context** (why it matters)
- **Status** (Open / Answered / Deferred)

When answered, move the question to the Answered section with the decision and update DECISIONS.md if it is a lasting decision.

-## Open

### 2026-04-03 — Developer Integration Gaps in RIO Verification API Guide
**Raised by:** Damon (Developer Agent)
**Question:** What additional information and tools do developers need to successfully integrate with the RIO Verification API?
**Context:** Review of `docs/guides/VERIFY_API_INTEGRATION.md` reveals several gaps that could hinder external developer adoption:
1. **SDK Support:** The guide provides raw `fetch` and `requests` examples, but lacks mention of the `rio-receipt-protocol` npm/PyPI packages for higher-level verification.
2. **Rate Limiting & Quotas:** No information on rate limits for the public `/api/verify` endpoint.
3. **Error Code Reference:** While status values are listed, specific HTTP error codes (400, 429, 500) and their JSON bodies are not fully documented.
4. **Webhooks/Notifications:** No mention of how a developer can be notified when a receipt is verified or when a new ledger entry is added.
5. **Local Development/Testing:** No guidance on how to test against a local or staging environment before hitting the production demo API.
6. **Schema Definitions:** Lack of formal JSON Schema or OpenAPI/Swagger definitions for the response objects.
7. **Signature Verification Details:** The "Independent Verification" section mentions Ed25519 but doesn't provide a full code example for the actual cryptographic verification logic (e.g., using `tweetnacl` in JS or `pynacl` in Python).
**Status:** Answered
**Decided by:** Brian (via task assignment to Damon)
**Answer:** Damon has updated `VERIFY_API_INTEGRATION.md` to address these gaps, including SDK support, rate limiting, error codes, local development, JSON schemas, and Ed25519 verification examples.
---

## Answered

### 2026-04-03 — Should we split governance into its own repo?
**Raised by:** Romney
**Question:** Should the governance engine get its own private repo separate from rio-system?
**Context:** As the team grows, a single repo could become crowded. But splitting too early adds coordination overhead.
**Answer:** No. Use rio-system as the single private repo for now. Split later if needed.
**Decided by:** Brian

---

## Deferred

_No deferred questions at this time._
