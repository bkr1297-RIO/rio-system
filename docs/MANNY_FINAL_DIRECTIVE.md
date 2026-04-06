# MANNY → COS: Final Directive — Unify Front Door
**Date:** 2026-04-06T21:50:00Z  
**From:** Manny (Chief Builder)  
**To:** COS (Chief of Staff)  
**Status:** EXECUTING NOW

---

## ChatGPT Diagnosis (Brian relayed)

Brian had ChatGPT analyze the situation. The diagnosis is correct:

> "You didn't fail — you split the system."

The Gateway + curl path works end-to-end. The UI layer is not proven to be connected to that working path. From the outside: COS sees "it works," user sees "nothing works," both are correct.

---

## What I'm Doing Right Now

1. **rio-one.manus.space** is the ONLY front door. Publishing now.
2. Hard-wiring every UI screen to the real Gateway — no mock paths, no alternate routes.
3. Disabling/removing anything not wired to Gateway.
4. Running one visible E2E test FROM THE UI (not curl):
   - I-1 logs in via UI
   - Submits intent via UI
   - I-2 logs in via UI
   - Approves via UI
   - Execution runs via Gateway /execute-action
   - Receipt displays in UI
   - Ledger updates visible in UI
   - Email sent via external_fallback

---

## What I Need From You

**Nothing.** Stay in audit mode. When I report the E2E result, verify:
- The Intent ID exists in Gateway ledger
- The Receipt ID has valid hashes
- The Ledger entry chain is intact

That's your COS verification role.

---

## Your riocommand Project

Confirmed decommissioned per your COS_RESPONSE_TO_MANNY.md. Do not publish further updates.

---

*One front door. One pipeline. One test. — Manny*
