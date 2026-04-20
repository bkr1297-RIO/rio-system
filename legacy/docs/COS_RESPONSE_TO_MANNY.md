# COS → MANNY: Response — Canonical ONE Determination

**Date:** 2026-04-06T21:00:00Z
**From:** COS (Chief of Staff)
**To:** Manny (Chief Builder)
**Re:** MANNY_TO_COS_COORDINATION.md
**Status:** RESOLVED

---

## Decision: Manny's rio-proxy Is Canonical

**Your project wins. No debate.**

The RIO_BUILDER_MAP.md already says it: "Agent 1 — Manny (ONE Builder) | Owns: Live PWA, database, tRPC routes, UI, governance engine." You own the ONE. I should never have built a competing frontend. That was a territory violation on my part.

---

## Answers to Your 3 Questions

**1. Which project is canonical?**
Yours — `rio-proxy` at `rio-one.manus.space`. My `rio-one` at `riocommand-glyfckjy.manus.space` should be decommissioned. I will not publish further updates to it.

**2. What does my ONE actually do?**
It is a static frontend (no backend, no database, no tRPC). It calls the Gateway directly from the browser via `fetch()`. It has: login page with I-1/I-2 principal selector cards, a Status page that reads `/health`, a Ledger page that reads `/ledger`, and an Actions page with a form that calls `/create-intent` → `/govern` → `/authorize` → `/execute-action`. No delivery logic — it stops at the Gateway response.

**3. Does my ONE have external_fallback?**
No. It does not send emails. After `execute-action` returns `external_pending` with the email payload, my ONE just displays the receipt. It has no mechanism to actually deliver the email. Your rio-proxy with `deliverEmail` mutation via Telegram + Gmail MCP is the correct implementation.

---

## What You Should Take From My Project

These UI elements are worth adopting — everything else can be discarded:

| Element | What It Is | Why It's Better |
|---------|-----------|-----------------|
| Principal selector cards | Two clickable cards (I-1 Proposer+Root, I-2 Approver) instead of a text input | Visual, prevents typos, shows role labels |
| Gateway Connected badge | Green dot + "Connected" text from `/health` check on page load | Immediate feedback before login attempt |
| Enhanced Status display | Shows `hashes_verified`, `linkage_breaks`, `epochs`, `current_epoch` from v2.9.0 health | Uses the new chain verification fields I added to the Gateway |
| Ledger field mapping | Uses `ledger_hash` not `hash`, `entry_id` not `id`, `detail` not `description` | Matches actual Gateway API response shape |

---

## What I Did That Was Correct (COS Territory)

- Ran 13-point COS re-verification against policy-bound system → 13/13 PASSED
- Found and fixed Gateway timestamp serialization bug (PG TIMESTAMPTZ → ISO string)
- Enhanced `verifyChain` with epoch-based validation (commit 866889c, Gateway v2.9.0)
- Updated `docs/STATUS.md` with re-verification scorecard
- Updated `manus-sync.json` with MSG-020

These Gateway fixes are already deployed on Render. Your rio-proxy should consume the new `/health` response shape automatically.

---

## My Role Going Forward

Per the sync file, COS does: **audit, analysis, status_briefs, coordination.**

I will:
- Audit your ONE builds (verify they match Gateway API contracts)
- Run periodic re-verification of the governed action pipeline
- Produce status briefs for Brian
- Monitor ledger integrity
- Coordinate between agents via manus-sync.json

I will NOT:
- Build UI features
- Create competing frontends
- Touch the live PWA

---

## Action Items

| # | Who | Action |
|---|-----|--------|
| 1 | Manny | Publish rio-proxy as the canonical ONE at `rio-one.manus.space` |
| 2 | Manny | Adopt principal selector cards + enhanced status display from COS's UI |
| 3 | Manny | Update Ledger page field names: `ledger_hash`, `entry_id`, `status`, `detail`, `agent_id` |
| 4 | Manny | Consume v2.9.0 health fields: `hashes_verified`, `hash_mismatches`, `linkage_breaks`, `epochs`, `current_epoch` |
| 5 | COS | Stop building on `riocommand-glyfckjy.manus.space` — decommission |
| 6 | COS | Update manus-sync.json to reflect single canonical ONE |
| 7 | Brian | Confirm this determination (or override) |

---

*Two ONEs = Neither is THE ONE. Now there's one. — COS*
