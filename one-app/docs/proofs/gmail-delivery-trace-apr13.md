# Gmail Delivery Breakpoint Trace — April 13, 2026

**Status:** Diagnostic only — no code changes  
**Traced by:** Manus (Engineering Mode)  
**Scope:** One email, end-to-end, through the RIO governance pipeline

---

## The Five Questions — Answered

### 1. Does the ActionEnvelope get created?

**YES.** The ONE UI (`NewIntent.tsx`) calls `submitIntent()` from `client/src/lib/gateway.ts`, which POSTs directly to the Gateway at `POST /intent`. The intent includes:

```
action: "send_email"
parameters: { to, subject, body, delivery_mode: "gmail" }
```

The `delivery_mode` field is correctly set to `"gmail"` — the UI defaults to `gmail` (line 188 of `NewIntent.tsx`: `useState<"notify" | "gmail">("gmail")`), and it is injected into parameters at line 261:

```ts
if (selectedAction === "send_email") {
  params.delivery_mode = deliveryMode;
}
```

The intent is created and stored **in the Gateway's PostgreSQL** — NOT in the proxy's local MySQL database. The Gateway returns an `intent_id`.

Governance (`POST /govern`) is then called by the ONE UI, also directly against the Gateway. This completes successfully.

**Verdict: PASS — envelope created, stored in Gateway.**

---

### 2. Does it reach the Gateway?

**YES.** The approval flow starts when the user clicks "Approve" in `GatewayApprovals.tsx` (line 270):

```ts
const result = await approveAndExecute.mutateAsync({ intentId });
```

This calls the tRPC mutation `gateway.approveAndExecute` on the proxy server (`server/routers.ts`, line 2240). The proxy then:

1. Logs in as **I-1** (proposer) to the Gateway — `POST /login` with `user_id: "I-1"` (line 2254)
2. Logs in as **I-2** (approver) to the Gateway — `POST /login` with `user_id: "I-2"` (line 2275)
3. Calls `POST /authorize` with the I-2 token (line 2405)
4. Calls `POST /execute-action` with the I-1 token (line 2480)

All four calls go to `GATEWAY_URL` (rio-gateway.onrender.com).

**Verdict: PASS — reaches Gateway for all four calls.**

---

### 3. Does authorization complete (I-1 → I-2)?

**YES.** The `/authorize` call uses the I-2 JWT. The `/execute-action` call uses the I-1 JWT. The Gateway enforces `proposer ≠ approver` at the `/authorize` boundary (the self-approval fix from commit `9993465`). Since I-1 ≠ I-2, authorization succeeds.

The Gateway returns a full governance receipt from `/execute-action` with:
- `receipt_id`, `receipt_hash`, Ed25519 signature
- `email_payload` (to, subject, body)
- `delivery_mode: "external"` (because the proxy sent `delivery_mode: "external"`)
- Ledger entry written to Gateway PostgreSQL

**Verdict: PASS — authorization completes, receipt generated.**

---

### 4. Does `_gatewayExecution=true` get passed to the connector?

**NO. This is the exact breakpoint.**

After receiving the Gateway receipt, the proxy must decide whether to trigger local Gmail SMTP delivery. The decision logic (lines 2437–2467) is:

```ts
const localIntent = await getIntent(input.intentId);          // ← reads proxy MySQL
let intentToolArgs = (localIntent?.toolArgs || {}) as Record<string, unknown>;
let intentToolName = localIntent?.toolName || "";

// Fallback: fetch from Gateway if local not found
if (!localIntent || Object.keys(intentToolArgs).length === 0) {
  // ... fetches GET /intent/:id from Gateway ...
  // ... populates intentToolArgs from gwIntent.parameters ...
  // ... populates intentToolName from gwIntent.action ...
}

const intentDeliveryMode = String(intentToolArgs.delivery_mode || "notify");
const isGmailDelivery = intentDeliveryMode === "gmail" && intentToolName === "send_email";
```

**With the Gateway fetch fix applied (from this session), `isGmailDelivery` now evaluates to `true`.** The Gateway returns `action: "send_email"` and `parameters.delivery_mode: "gmail"`, so both conditions are met.

**However, the code inside the `if (isGmailDelivery)` branch (lines 2515–2536) has a fatal problem:**

```ts
if (isGmailDelivery) {
  const approvalProof = {
    approvalId: `gw-auth-${input.intentId.slice(0, 8)}`,
    intentId: input.intentId,
    boundToolName: localIntent!.toolName,     // ← localIntent is NULL → CRASH
    boundArgsHash: localIntent!.argsHash,     // ← localIntent is NULL → CRASH
    ...
  };

  const connectorResult = await dispatchExecution(
    localIntent!.toolName,                     // ← localIntent is NULL → CRASH
    intentToolArgs,
    approvalProof,
    localIntent!.riskTier as "LOW" | "MEDIUM" | "HIGH",  // ← NULL → CRASH
    localIntent!.argsHash,                     // ← NULL → CRASH
  );
}
```

**Every reference inside the Gmail branch uses `localIntent!` (non-null assertion) — but `localIntent` is `null` because the intent was never stored in the proxy's local database.** The Gateway fetch populates `intentToolArgs` and `intentToolName`, but the code still dereferences `localIntent!.toolName`, `localIntent!.argsHash`, `localIntent!.riskTier` — all of which will throw a runtime TypeError.

**Even if we survived the null dereference**, the call to `dispatchExecution()` passes `intentToolArgs` — which does NOT contain `_gatewayExecution: true`. The `_gatewayExecution` flag is never injected anywhere. Search confirms: **zero occurrences of `_gatewayExecution` in `routers.ts`**.

The connector (`connectors.ts`, line 365) checks:

```ts
const isGatewayExecution = toolArgs._gatewayExecution === true;
if (!isGatewayExecution) {
  return { success: false, error: "REQUIRES_GATEWAY_GOVERNANCE: ..." };
}
```

So even if the null crash were fixed, the connector would **refuse execution** because `_gatewayExecution` is not in the args.

**Verdict: FAIL — two breakpoints:**
1. **`localIntent!` null dereference** — runtime crash before connector is reached
2. **`_gatewayExecution` never injected** — connector would refuse even if #1 were fixed

---

### 5. Does the connector receive the call?

**NO.** The connector is never reached due to breakpoint #4 above.

The `executeSendEmail` function in `connectors.ts` (line 299) is never called. Gmail SMTP (`sendViaGmail` in `gmailSmtp.ts`) is never invoked.

Instead, the flow falls through to the `else` branch (line 2594: "NON-GMAIL PATH"), which:
- Uses the Gateway receipt directly (no local delivery)
- Sets `deliveryMode = "external"`
- Calls `notifyOwner()` (Manus notification) at line 2623
- Calls Telegram at line 2644

This is why the user sees Manus-branded notifications instead of Gmail delivery.

**Verdict: FAIL — connector never receives the call.**

---

## Summary: The Exact Break Chain

| Step | Component | Status | Evidence |
|------|-----------|--------|----------|
| 1. Intent created | ONE UI → Gateway `/intent` | PASS | `submitIntent()` sends `delivery_mode: "gmail"` in parameters |
| 2. Reaches Gateway | Proxy → Gateway `/authorize` + `/execute-action` | PASS | Both calls succeed, receipt returned |
| 3. Authorization (I-1 → I-2) | Gateway `/authorize` | PASS | I-2 token used, proposer ≠ approver enforced |
| 4a. `localIntent` resolved | Proxy `getIntent()` | FAIL | Returns `null` — intent is in Gateway PG, not proxy MySQL |
| 4b. Gateway fallback fetch | Proxy `GET /intent/:id` | PASS (new) | Populates `intentToolArgs` and `intentToolName` |
| 4c. `isGmailDelivery` evaluates | Proxy decision logic | PASS (new) | `delivery_mode === "gmail" && intentToolName === "send_email"` |
| 4d. Gmail branch executes | `if (isGmailDelivery)` block | **CRASH** | `localIntent!.toolName` → null dereference |
| 4e. `_gatewayExecution` injected | `dispatchExecution()` call | **MISSING** | Never set — 0 occurrences in routers.ts |
| 5. Connector receives call | `executeSendEmail()` | NEVER REACHED | Blocked by #4d and #4e |

---

## Root Cause (Two Bugs, Sequential)

**Bug A — Null dereference:** The `isGmailDelivery` branch (lines 2520–2536) uses `localIntent!` for `toolName`, `argsHash`, and `riskTier`. When the intent was created via the ONE UI (directly to Gateway), `localIntent` is `null`. The Gateway fetch populates `intentToolArgs` and `intentToolName` but does NOT populate a full `localIntent` object. Every `localIntent!` access will throw.

**Bug B — Missing `_gatewayExecution` flag:** Even if Bug A were fixed, `dispatchExecution()` is called with `intentToolArgs` that come from the Gateway's `parameters` field. These parameters contain `{ to, subject, body, delivery_mode: "gmail" }` — but NOT `_gatewayExecution: true`. The connector checks `toolArgs._gatewayExecution === true` (line 365 of `connectors.ts`) and refuses execution without it.

**The fix requires two things:**
1. Use `intentToolName` (from Gateway fetch) instead of `localIntent!.toolName`, and synthesize `argsHash`/`riskTier` from available data
2. Inject `_gatewayExecution: true` into `intentToolArgs` before calling `dispatchExecution()`

---

*Diagnostic complete. No code was changed.*
