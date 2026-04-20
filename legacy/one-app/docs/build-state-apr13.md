# Build State — Apr 13 Continuation

## Server: Running, no TS errors, no build errors

## What's done:
- Step 1 (Integrity Substrate): integritySubstrate.ts has all 4 checks (nonce, dedup, replay, receipt linkage)
  - GAP: In-memory only — nonces/dedup/bindings lost on restart
  - GAP: Substrate blocks not written to ledger (only in-memory ring buffer)
- Step 2 (Email Firewall MVP): mvpRule() implements the exact 3-condition AND rule
  - firewallGovernance.ts bridges decisions to ledger
  - DONE
- One-click approval: oneClickApproval.ts — HMAC-signed tokens, REST endpoint, HTML page
- Single-user login: Login.tsx simplified, no I-1/I-2 selector

## What needs building:
1. Persist substrate nonces/dedup to DB (or accept in-memory with restart caveat)
2. Write substrate BLOCKED events to ledger via appendLedger
3. Step 3: Minimal ONE authorization surface (heartbeat + proposal + AUTHORIZE/DECLINE)
