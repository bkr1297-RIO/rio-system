# DIRECTIVE: Fix Gateway SMTP — No New Paths

**Date:** 2026-04-06T21:30:00Z
**From:** Brian (Principal)
**To:** Manny (Chief Builder)
**CC:** COS (Chief of Staff) — for audit trail
**Priority:** IMMEDIATE
**Status:** ISSUED

---

## Decision (No Debate)

**Fix Gateway SMTP using Gmail App Password.** That is the only path.

### DO NOT:
- Add nodemailer
- Introduce a second execution path
- Move execution out of Gateway

### WHY:
- Gateway is already the execution boundary
- SMTP was already attempted there
- It failed due to credentials, not design
- Adding nodemailer = duplication + more drift

> "We unify, not split."

---

## Exact Steps

1. Gmail App Password (16-char) already exists for sending account
2. Set on Render:
   ```
   GMAIL_USER=riomethod5@gmail.com
   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   ```
3. Redeploy Gateway (fresh deploy, no cache)
4. Test: `intent → approval → /execute-action → SMTP send → receipt → ledger`
5. If it fails again: log exact SMTP error, do NOT change approach, fix credentials/config until it works

---

## Critical Rule

No new execution paths. No fallback logic. No moving responsibility to ONE or Replit.

**Gateway sends. Period.**

---

## Definition of Done

Manny returns:
- Intent ID
- Receipt ID
- Ledger Entry ID
- Email received in inbox

COS verifies all four against the Gateway ledger.

---

> "You are one inch away. Do not redesign the system at the last inch."

*— Brian, Principal*
