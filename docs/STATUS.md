# Status

Current state of the RIO system. Updated by agents as work progresses.

Last updated: 2026-04-06T13:50:00Z by Manus (DevOps/Infrastructure)

---

## CURRENT PRIORITY: FIRST GOVERNED ACTION

**Nothing else matters until 13/13 pass. Do not start new features.**

### 13-Point Governed Action Scorecard

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Intent created | PASS | Verified via API test — intent_id returned |
| 2 | Risk evaluated | PASS | /govern returns risk=HIGH, requires_approval=true |
| 3 | Proposer ≠ Approver enforced | PASS | Gateway rejects self-approval, tested |
| 4 | Approval recorded | PASS | I-2 approves, status=authorized |
| 5 | Authorization token issued | DONE | Manny commit c550bf4 — issueExecutionToken() called |
| 6 | Token validated before execution | DONE | Manny commit c550bf4 — validateAndBurnToken() before sendEmail() |
| 7 | Token burned after execution | DONE | Manny commit c550bf4 — burn-on-validate, replay blocked |
| 8 | Execution performed | BLOCKED | SMTP credential rejected by Gmail. Fix: external delivery mode (commit 12a12fd) awaiting deploy |
| 9 | Receipt generated | DONE | Manny commit c550bf4 — generateReceipt() called after execution |
| 10 | Receipt includes all fields | DONE | Manny commit c550bf4 — approver_id, token_id, policy_hash, execution_result, previous_receipt_hash, ledger_entry_id |
| 11 | Receipt signed by Gateway | DONE | Manny commit c550bf4 — Ed25519 signPayload() on receipt_hash |
| 12 | Receipt hash written to ledger | PASS | appendEntry() with receipt_hash field |
| 13 | Ledger hash chain verifies | PASS | /health shows chain_valid: true, 183+ entries |

### Score: 12/13 code-complete. 1 blocked on email delivery.

### Current Blocker

Gmail SMTP authentication fails on Render (`535-5.7.8 Username and Password not accepted`).

**Fix deployed (commit 12a12fd):** Gateway /execute-action now supports external delivery:
- Pass `delivery_mode: "external"` to skip SMTP
- Or if SMTP fails, Gateway auto-falls back to external mode
- Gateway completes ALL 13 governance steps regardless
- Returns `email_payload` for caller to send via OAuth/MCP
- **Awaiting Render redeploy to test**

### What Each Agent Must Do RIGHT NOW

| Agent | Action | Priority |
|-------|--------|----------|
| Manus | Run 13-point test after Render redeploy, send email via Gmail MCP | P0 |
| Manus | Build governance dashboard panels in ONE PWA | P1 |
| Manny | Confirm external delivery is acceptable OR fix SMTP credential | P0 |
| COS | Audit 13-point test results when available | P1 |
| Brian | Trigger "Deploy latest commit" on Render | P0 (done?) |

---

## WHAT'S DEPLOYED

| System | URL | Version | Status |
|--------|-----|---------|--------|
| Gateway | https://rio-gateway.onrender.com | v3.1.0-oauth | LIVE — needs redeploy for commit 12a12fd |
| ONE PWA | https://riocommand-glyfckjy.manus.space | c3ad3cfa | LIVE |
| HITL (Replit) | — | — | Built by Manny, not yet integrated |

---

## RECENT COMMITS (newest first)

| Commit | Date | Author | Description |
|--------|------|--------|-------------|
| 12a12fd | 2026-04-06 | Manus | feat: external delivery mode for /execute-action |
| c550bf4 | 2026-04-06 | Manny | feat: token issue/validate/burn + receipt fields + Ed25519 signing |
| 83d6d55 | 2026-04-06 | Manus | feat: gmail diagnostic in /health |
| earlier | 2026-04-06 | Manus | feat: POST /execute-action with nodemailer, package-lock fix |

---

## RESPONSIBILITY MATRIX

| Agent | Role | Owns | Does NOT Touch |
|-------|------|------|----------------|
| Manus | DevOps/Infrastructure | Gateway deployment, ONE PWA, coordination, testing | Governance logic |
| Manny (Replit) | Builder | Gateway wiring, token system, receipt schema, HITL | ONE PWA |
| COS (Chief of Staff) | Auditor | Verification, audit reports, governance chain validation | Code |
| Romney | Distribution Engineer | Receipt protocol, specs, documentation | Gateway runtime |
| Andrew | Solutions Architect | Architecture specs, identity spec | Runtime code |
| Brian | Root Authority | Decisions, approvals, credentials, direction | — |

---

## COMMUNICATION RULES

1. **Read STATUS.md before starting work.**
2. **Update STATUS.md after completing work.**
3. **If blocked, say so here with the exact error.**
4. **If you need something from another agent, write it in the "What Each Agent Must Do" table.**
5. **Commit messages must explain what changed and why.**
6. **No agent works on new features until 13/13 pass.**

---

## PREVIOUS STATUS ENTRIES

### 2026-04-04 — Romney (Distribution Engineer)

End-to-End Governed Email Directive + Receipt Readiness. Directive to Manny: complete governed email flow. Directive to Andrew: Gateway must resolve identity via email. Receipt readiness verified via simulation — all checks passed.

### 2026-04-04 — Manny (Builder)

First Platform Slice shipped: Approvals table, Google OAuth, ONE rewired to Gateway API, 3 screens (Login, Create Intent, Approvals). 339 tests, 0 failures.

### 2026-04-04 — Andrew (Solutions Architect)

Identity Spec v1.2 with email-based principal resolution. Section 9.5 added.
