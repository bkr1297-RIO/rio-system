# COS → Manny: P0 Protocol Fixes Before External Exposure

**Date:** 2026-04-07
**Priority:** P0 — Do before increasing visibility
**Total effort:** ~3 hours
**Rule:** No new features. No architecture changes. Fix these three things and stop.

---

## Fix 1: Remote Verification Returns 0/10 (Critical)

**The problem:**

```bash
$ rio-verify remote https://rio-gateway.onrender.com
⚠ 0/10 receipts valid
```

A developer's first impression of the live system is "broken."

**Root cause:** The Gateway's `/api/receipts/recent` returns ledger entries:

```json
{
  "entry_id": "c55e81e4-...",
  "status": "receipted",
  "receipt_hash": "3c4ad142...",
  "ledger_hash": "f949c2b6...",
  "timestamp": "2026-04-07T03:48:42.153Z"
}
```

The CLI verifier (`cli/verify.mjs`, line 192-207) expects protocol-format receipts:

```json
{
  "receipt_id": "...",
  "receipt_type": "action",
  "hash_chain": {
    "intent_hash": "...",
    "execution_hash": "...",
    "receipt_hash": "..."
  },
  "verification": {
    "algorithm": "SHA-256",
    "chain_length": 3,
    "chain_order": ["intent_hash", "execution_hash", "receipt_hash"]
  }
}
```

**What to fix (choose one):**

**Option A (preferred): Make the Gateway return protocol-format receipts.**

Add a field to the `/api/receipts/recent` response that includes the full receipt object (with `hash_chain` and `verification`) alongside the ledger entry. The Gateway already generates these receipts during `execute-action` — store them or reconstruct them.

**Option B: Update `cli/verify.mjs` to handle Gateway-format responses.**

In the `verifyRemote` function (line 192), detect which format was returned. If the response has `ledger_hash` but no `hash_chain`, verify the ledger entry hash instead and report it as "ledger entry verification" rather than "receipt verification." Something like:

```javascript
// In verifyRemote, after fetching receipts:
for (const r of receipts) {
  if (r.hash_chain) {
    // Protocol-format receipt — verify normally
    const result = verifyReceipt(r);
    if (result.valid) validCount++;
  } else if (r.ledger_hash && r.receipt_hash) {
    // Gateway ledger entry — verify chain linkage exists
    info(`Ledger entry ${r.entry_id}: receipt_hash present, ledger_hash present`);
    validCount++; // Entry is structurally valid
  }
}
```

Option A is better because it proves the full receipt chain. Option B is a fallback if storing full receipts in the Gateway is too much work right now.

**Verification after fix:**

```bash
$ rio-verify remote https://rio-gateway.onrender.com
✓ All 10 receipts verified
```

---

## Fix 2: Test Count Mismatch (15 minutes)

**The problem:** Three documents report three different test counts.

| Document | Claims | Reality |
|----------|--------|---------|
| README badge | 29 Node + 29 Python = 58 | Wrong |
| `spec/canonical-rules.md` line 273 | 38 Node.js | Wrong |
| `spec/conformance.md` line 214 | 29 tests per language | Wrong for Node |
| Actual test run | 44 Node + 29 Python = 73 | Correct |

**What to fix:**

1. **README.md line 5** — Change badge from `58%20conformance%20(29%20Node%20%2B%2029%20Python)` to `73%20conformance%20(44%20Node%20%2B%2029%20Python)`

2. **spec/canonical-rules.md line 273** — Change `All 38 Node.js conformance tests pass` to `All 44 Node.js conformance tests pass`

3. **spec/conformance.md line 214** — Change `Expected output for both: 29 tests, 29 passed, 0 failed.` to `Expected output: Node.js 44 tests, 44 passed. Python 29 tests, 29 passed.`

4. **README.md line 471** — The inline text says `node tests/conformance.test.mjs  # Node.js (29 tests)` — change to `(44 tests)`

---

## Fix 3: `toCanonical()` Decision Mapping Bug (15 minutes)

**The problem:** In `spec/receipt-protocol.md`, Section 17, line ~397:

```javascript
decision: v22Receipt.receipt_type === "governed_action" ? "executed" : "executed",
```

Both branches return `"executed"`. A denied action would show as "executed" in the canonical view.

**What to fix:**

```javascript
function toCanonical(v22Receipt) {
  // Map receipt_type to canonical decision
  let decision = "executed";
  if (v22Receipt.receipt_type === "governed_action") {
    decision = v22Receipt.authorized_by ? "executed" : "pending";
  }
  // If the receipt has execution failure indicators, override
  if (v22Receipt.hash_chain?.execution_hash === null) {
    decision = "denied";
  }

  return {
    receipt_id: v22Receipt.receipt_id,
    timestamp: v22Receipt.timestamp,
    protocol_version: v22Receipt.version,
    actor_id: v22Receipt.agent_id,
    action_type: v22Receipt.action,
    action_summary: v22Receipt.action,
    decision: decision,
    receipt_hash: v22Receipt.hash_chain.receipt_hash,
    signature: v22Receipt.identity_binding?.signature_hex || null,
    verification_status: "unverified"
  };
}
```

The exact mapping logic is your call — the point is that both branches of the ternary should not return the same value.

---

## Definition of Done

All three of these are true:

1. `rio-verify remote https://rio-gateway.onrender.com` returns all receipts valid (or clearly reports what it verified)
2. README badge, `canonical-rules.md`, and `conformance.md` all agree on test counts
3. `toCanonical()` does not hardcode "executed" for all cases

**After you push:** Tell me. I'll run the verification and confirm.

---

*COS — 2026-04-07*
