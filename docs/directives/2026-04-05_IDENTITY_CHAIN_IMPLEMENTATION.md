# Directive: Identity Chain Implementation

**Date:** 2026-04-05
**Author:** Bondi (Chief of Staff)
**Authority:** Brian Kent Rasmussen (I-1, root_authority)
**Status:** LOCKED — no scope expansion until Definition of Done is met

---

## Decision (locked by Brian)

ONE maps login email to principal_id. The ONE server-side proxy sends `X-Principal-ID` to the Gateway. The Gateway treats principal_id as the immutable authority identity for policy, approvals, receipts, and ledger. Email is only for login and lookup — never for authority or audit.

## Definition of Done

Two different users complete one governed action end-to-end with receipt and ledger entry.

Nothing else matters until this works.

---

## Current State (verified 2026-04-05)

### What exists and works

| Component | Status | Evidence |
|-----------|--------|----------|
| Gateway POST /login (passphrase) | Working | Returns JWT with sub=principal_id |
| Gateway POST /intent | Working | Creates intent, writes ledger entry |
| Gateway POST /govern | Working | Policy engine evaluates, returns decision |
| Gateway GET /approvals | Fixed (commit 0d10f3f, needs redeploy) | Now queries in-memory store |
| Gateway resolvePrincipal | Working | Reads X-Principal-ID header (line 376-383 of principals.mjs) |
| Gateway resolvePrincipalByEmail | Working | Maps email to principal via cache + aliases |
| Gateway principal registry | Working | 6 principals seeded in PostgreSQL |
| ONE PWA passphrase login | Partially working | Sends passphrase but missing user_id field |
| ONE PWA intent submission | Working | Submits via tRPC proxy to Gateway |
| ONE PWA approvals page | Exists at /approvals | Has Approve/Deny buttons, polls every 10s |

### What is broken or missing

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Passphrase login returns "Missing required field: user_id" | ONE sends `{passphrase}` but Gateway expects `{user_id, passphrase}` | Add user_id field to login form and request |
| GET /approvals returns empty | Was querying empty PostgreSQL table instead of in-memory store | Fixed in commit 0d10f3f, needs Gateway redeploy |
| No bottom navigation tabs | Manny stripped UI during rebuild | Restore tab bar |
| Only one human principal registered | Need I-2 for two-user test | Register second principal |
| No email-to-principal mapping in ONE session | ONE session has openId/appId/name, no principal_id | Add lookup after login |

---

## Implementation Steps (critical path only)

### Step 1: Email-to-Principal Mapping Table

This already exists in the Gateway. The `principals` table in PostgreSQL has an `email` column, and `resolvePrincipalByEmail()` in principals.mjs does the lookup. The mapping is:

| Email | Principal ID | Role | Actor Type |
|-------|-------------|------|------------|
| bkr1297@gmail.com | I-1 | root_authority | human |
| riomethod5@gmail.com | I-1 (alias) | root_authority | human |
| rasmussenbr@hotmail.com | I-1 (alias) | root_authority | human |
| (needs registration) | I-2 | approver | human |

**Action for Brian:** Decide who is I-2. Provide their email. They need the `approver` role so they can approve intents that I-1 submits.

**Note on proposer != approver:** The Gateway enforces that the person who submits an intent cannot approve their own intent. So:
- I-1 submits → I-2 approves (or vice versa)
- Both need `proposer` and `approver` roles, but the Gateway blocks self-approval

### Step 2: ONE Login Flow — Add Principal ID to Session

**Current session payload:** `{ openId, appId, name }`

**Required session payload:** `{ openId, appId, name, principalId, email }`

**Implementation (in ONE server code):**

File: `server/_core/oauth.ts` — after Manus OAuth callback:

```typescript
// After getting userInfo from Manus OAuth:
const email = userInfo.email;

// Look up principal_id from the mapping
const PRINCIPAL_MAP: Record<string, string> = {
  "bkr1297@gmail.com": "I-1",
  "riomethod5@gmail.com": "I-1",
  "rasmussenbr@hotmail.com": "I-1",
  // Add I-2 email here when registered
};

const principalId = email ? PRINCIPAL_MAP[email.toLowerCase()] : null;

if (!principalId) {
  // Fail closed — no principal mapping means no access
  res.status(403).json({ 
    error: "No Gateway principal mapped for this email.",
    email: email,
    hint: "Contact the system administrator to register your email."
  });
  return;
}

// Store principalId in the session token
const sessionToken = await sdk.createSessionToken(userInfo.openId, {
  name: userInfo.name || "",
  principalId,  // NEW
  email,        // NEW
  expiresInMs: ONE_YEAR_MS,
});
```

File: `server/_core/sdk.ts` — update SessionPayload:

```typescript
export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
  principalId?: string;  // NEW — Gateway principal ID
  email?: string;        // NEW — login email for audit
};
```

### Step 3: ONE tRPC Proxy — Send X-Principal-ID Header

**Implementation (in ONE server tRPC router):**

Every tRPC procedure that calls the Gateway must include the header:

```typescript
// In the gateway tRPC router (the server-side proxy)
const gatewayHeaders = {
  "Content-Type": "application/json",
  "X-Principal-ID": ctx.session.principalId,  // From session
};

// Example: submitIntent procedure
const response = await fetch(`${GATEWAY_URL}/intent`, {
  method: "POST",
  headers: gatewayHeaders,
  body: JSON.stringify(intentBody),
});
```

### Step 4: Gateway — Trust X-Principal-ID

**This already works.** Lines 376-383 of `gateway/security/principals.mjs`:

```javascript
// 3. Try X-Principal-ID header (for service-to-service calls)
const headerPrincipalId = req.headers["x-principal-id"];
if (headerPrincipalId) {
  const principal = principalCache.get(headerPrincipalId);
  if (principal && principal.status === "active") {
    return principal;
  }
}
```

The Gateway already reads `X-Principal-ID`, looks it up in the principal cache, checks that the principal is active, and sets `req.principal`. No Gateway changes needed for this step.

### Step 5: Register I-2

**Waiting on Brian** to provide the second user's email and name.

Once provided, register via Gateway API:

```bash
curl -X POST https://rio-gateway.onrender.com/principals \
  -H "Authorization: Bearer <I-1-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "principal_id": "I-2",
    "actor_type": "human",
    "display_name": "<name>",
    "email": "<email>",
    "primary_role": "approver",
    "secondary_roles": ["proposer"],
    "registered_by": "I-1"
  }'
```

Then add their email to the PRINCIPAL_MAP in Step 2.

### Step 6: Test the Full Flow

1. I-1 logs into ONE → session includes principalId: "I-1"
2. I-1 submits a send_email intent → ONE proxy sends X-Principal-ID: I-1 to Gateway
3. Gateway creates intent, runs governance → REQUIRE_HUMAN
4. I-2 logs into ONE → session includes principalId: "I-2"
5. I-2 navigates to Approvals → sees the pending intent
6. I-2 approves → Gateway verifies I-2 != I-1, records approval
7. Gateway executes the email via Gmail API
8. Gateway generates receipt with cryptographic hash
9. Gateway writes ledger entry
10. Both users can see the receipt and ledger entry

---

## What Manny Must Do (ordered, no scope expansion)

1. **Fix passphrase login** — add user_id field to login form and request body
2. **Add principalId to session** — look up email→principal after Manus OAuth, store in session
3. **Send X-Principal-ID header** — on all tRPC proxy calls to Gateway
4. **Restore bottom navigation** — at minimum: Actions, Approvals, Ledger, Status tabs
5. **Redeploy Gateway** on Render (commits de51fbc and 0d10f3f are on main)
6. **Redeploy ONE PWA** with all the above changes
7. **Test with I-1** — submit intent, verify it appears in Approvals

## What Manny Must NOT Do

- Do not build dashboards
- Do not build Oracle
- Do not build visualizations
- Do not add new features
- Do not refactor architecture
- Do not expand scope

---

## Commits Already Pushed (need Gateway redeploy)

| Commit | File | Fix |
|--------|------|-----|
| de51fbc | gateway/governance/intake.mjs | agent_id no longer overridden by JWT sub |
| 0d10f3f | gateway/routes/index.mjs | GET /approvals queries in-memory store, adds `pending` alias |

---

## Blocking Question for Brian

Who is I-2? Provide:
- Full name
- Email address
- This person needs to be available to test the approval flow

Without I-2, we cannot complete the Definition of Done.
