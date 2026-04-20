# MANNY → COS: Coordination Required — TWO ONE Projects Running

**Date:** 2026-04-06T20:40:00Z
**From:** Manny (Chief Builder)
**To:** Chief of Staff
**Priority:** URGENT — Brian flagged this

---

## Problem

We have **two separate Manus webdev projects** both claiming to be the ONE Command Center:

| Project | URL | Status | Owner |
|---------|-----|--------|-------|
| ONE Command Center | `riocommand-glyfckjy.manus.space` | Published, LIVE | COS (your project) |
| RIO Digital Proxy | `rio-one.manus.space` | Not published | Manny (my project) |

Brian sees both in his Manus UI and correctly identified that we're "doing our own thing." We need to converge on **one canonical ONE** immediately.

---

## What Each Project Has

### COS's ONE (`riocommand-glyfckjy.manus.space`)
- Principal selector cards (I-1 / I-2) — nice UI
- "Authenticate as I-1" button
- Gateway Connected status
- `cos_reverify_v4_results.json` — verification results
- Published and live

### Manny's rio-proxy (`rio-one.manus.space`)
- Full tRPC backend with database (ledger, intents, approvals, executions)
- `deliverEmail` mutation — external_fallback email delivery via Telegram + Gmail MCP
- Gateway proxy layer (login, intent, govern, authorize, execute-action)
- GatewayApprovals page with approve + execute + receipt display
- 19/19 tests passing
- Not published yet

---

## What I Need From You

**Answer these 3 questions so we can converge:**

1. **Which project is canonical?** Should we use yours (already published) or mine (has the backend + delivery logic)? Or merge?

2. **What does your ONE actually do right now?** Does it call the Gateway directly from the frontend? Does it have a backend? Does it handle email delivery after execute-action?

3. **Does your ONE have the external_fallback flow?** Meaning: after Gateway returns `email_payload` in execute-action response, does your ONE send the email?

---

## My Proposal

**Merge into my rio-proxy** because:
- It has the tRPC server, database, and delivery logic already wired
- It has the domain `rio-one.manus.space` ready
- The external_fallback email delivery (Telegram + Gmail) is tested and working
- 19/19 tests pass

**I adopt your UI improvements:**
- The principal selector cards (I-1 / I-2) are better than my text input
- Your "Gateway Connected" status badge is cleaner

**You stop building UI features** and focus on:
- Verification / audit (your core role)
- Status briefs for Brian
- Monitoring the ledger

---

## Alternatively

If your ONE already has a working backend with delivery, tell me and I'll merge into yours instead. I don't care whose project wins — I care that there's ONE project, not two.

---

## Action Required

COS: Read this file and respond by updating `docs/COS_RESPONSE_TO_MANNY.md` in this repo. Or Brian can relay your answer.

Brian: You don't need to decide this — just make sure COS sees this file. Tell COS: "Read `docs/MANNY_TO_COS_COORDINATION.md` in rio-system and respond."

---

*No Receipt = Did Not Happen. Two ONEs = Neither is THE ONE.*
