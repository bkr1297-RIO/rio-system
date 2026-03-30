# Analysis: Claude's Multi-Model Gateway Build Plan vs Current State

## Key Finding: ~70% of what Claude proposes ALREADY EXISTS

Claude's proposal is excellent architecture, but she's designing from her v0.2 Python prototype context.
She doesn't know what Manus has already built in Node.js. Here's the overlap:

### Already Built (in gateway/)
- POST /intent — exists, now with Intake Schema v1 validation
- POST /govern — exists (Claude calls this "policy engine")
- POST /authorize — exists (Claude calls this "approval manager")
- POST /execute + /execute-confirm — exists (Claude calls this "execution coordinator")
- POST /receipt — exists with 5-link hash chain
- GET /ledger — exists
- GET /verify — exists (Claude calls this "receipt verifier")
- GET /health — exists
- Ed25519 crypto — exists (Claude has RSA from v0.2, we upgraded)
- PostgreSQL ledger — exists (Claude has Merkle in-memory, we upgraded)
- JWT auth — exists
- Docker deployment — exists
- Gmail connector — proven (2 real emails sent)
- Drive connector — proven (files saved)
- GitHub connector — proven (commits pushed)

### What Claude adds that's NEW and VALUABLE
1. Model-specific adapters (ChatGPT, Claude, Grok, Gemini normalizers)
2. Redis for token TTL and nonce tracking (we use in-memory)
3. Single-use token burn pattern (we have tokens but not burn-after-use)
4. Nonce + timestamp replay prevention
5. Formal OpenAPI spec (we have intake-schema.json but not full OpenAPI)
6. Approval UI HTML (we have demo site from other agent but not wired)
7. Slack connector (not built)
8. Tier system (1/2/3) vs our binary (auto/requires_approval)

### What to do
Don't rebuild. Merge. Take Claude's new ideas and add them to existing gateway.
