# MANNY — BUILD INSTRUCTIONS

**Start Now. This Is The Signal.**

From: B-Rass (Authority) via Claude (Governor) Date: April 13, 2026
Status: EXECUTE — Kernel is proven. Build begins now.

---

## What You Already Proved

You closed the loop. The proof chain is real:
- Intent submitted → Governance classified → Human authorized → Gmail delivered → Receipt hashed → Ledger chained
- The `_gatewayExecution` flag enforces fail-closed. No silent fallback.
- Proposer ≠ Approver enforced structurally at the Gateway level.

You said it yourself: **the kernel is proven.**
That means we stop testing the foundation and start building into it.

---

## The Fractal Principle (Why We Build This Way)

The pattern that proved itself at the smallest scale — one governed email — holds at every scale above it. You don't rebuild. You don't re-prove. You extend.

Everything we build from here is the same pattern at higher resolution.

---

## What You Build Now — In Order

### STEP 1: Integrity Substrate (Build First — Everything Depends On It)

This is middleware that runs BEFORE any proposal reaches the Interceptor. It lives beneath all four governance surfaces.

It handles four things:

1. **Nonce enforcement** — Every execution token is single-use. Mark used nonces permanently. Reject reuse at the gate.
2. **Deduplication** — If the same proposal arrives twice (transport failure, retry, human error) — kill the second instance before it reaches governance. This is what caused the Double-Send. Fix it here, permanently.
3. **Replay protection** — A valid token from a past action cannot be replayed against a new action. Token binding must be to the exact proposal hash — not just the action type.
4. **Receipt linkage** — Every execution, approval, and denial links to a receipt. Every receipt links to the ledger. The chain must always be complete — including denied and failed attempts.

**Wire it as middleware. The governance surfaces never see duplicate or replayed messages. Their logic stays clean.**

Definition of done for Step 1:
- Duplicate proposal is killed at substrate level, logged, governance never sees it
- Replayed token is rejected, logged
- Every execution attempt — pass or fail — produces a receipt
- Receipt links to previous ledger hash

---

### STEP 2: Email Firewall MVP (One Rule. Logged. Done.)

This is the simplest expression of the kernel applied to inbound messages.

**The Rule (lock this — do not modify):**

```
IF sender is unknown
AND message contains urgency language
AND message requests a consequential action
    (money / identity / credentials / data / system access)

THEN: Block. Log. Do not interrupt the user.
```

**Everything else passes through. Do not block anything else.**

**Signal detection — keep it simple, three checks only:**

```python
def detect_block(message):
    text = (message.subject + " " + message.body).lower()

    unknown_sender = not is_known_sender(message.sender)

    urgency = any(word in text for word in [
        "urgent", "immediately", "asap", "right now",
        "final notice", "will be suspended", "will be closed",
        "act now", "expires today"
    ])

    consequential = any(word in text for word in [
        "wire", "transfer", "payment", "bank", "gift card",
        "password", "login", "verify account", "confirm identity",
        "click here", "access will be revoked", "account locked"
    ])

    return unknown_sender and urgency and consequential
```

**Logging requirement — every decision logged:**

```json
{
    "timestamp": "ISO8601",
    "sender": "sender@domain.com",
    "sender_known": true/false,
    "urgency_detected": true/false,
    "consequential_detected": true/false,
    "decision": "pass" or "block",
    "rule_triggered": "MVP_RULE_001" or null
}
```

Definition of done for Step 2:
- Scam/urgency messages blocked and logged
- Verification codes pass through
- Delivery notifications pass through
- Unknown sender with link but no urgency passes through
- All decisions logged with reason
- Zero interruptions to user for passed messages

---

### STEP 3: ONE Interface — Minimum Viable Authorization Surface

This is what B-Rass touches every day. It does not need to be beautiful yet. It needs to work.

**V1 requires three things only:**

**1. System heartbeat (top bar)**
- Is the Gateway online? YES / NO
- Last governed action: [timestamp + one-line description]
- Last receipt: [hash]

**2. Proposal surface (center)** When a proposal is waiting:
- WHAT: plain English, one sentence
- RISK: LOW / MEDIUM / HIGH — color coded
- WHAT HAPPENS IF YOU APPROVE: one sentence
- WHAT HAPPENS IF YOU DECLINE: one sentence

When no proposal is waiting:
- "System ready. No pending proposals."

**3. Authorization bar (bottom)** Two buttons. Nothing else.
- **AUTHORIZE** — green
- **DECLINE** — grey

No settings. No configuration. No logs visible on this screen. One choice.

Definition of done for Step 3:
- Proposal appears when one exists
- AUTHORIZE sends signed approval to Gateway
- DECLINE logs dismissal, no action executes
- Heartbeat shows real system state
- Works on phone browser (mobile-first)

---

### STEP 4: Azure Alignment (When B-Rass Completes App Registration)

B-Rass needs to complete the Azure App Registration first — that's his step, not yours.

Once he does:
- Wire the gateway runtime to the Grok spec structure
- Enable managed identity for App Service
- Move secrets to Key Vault
- Run the pre-deployment audit checklist (from the April 11 Grok spec)

**Do not block Steps 1-3 waiting for Azure. Build those now on current infrastructure.**

---

## What You Do NOT Build Right Now

Do not build:
- Scoring systems or adaptive weights (v2)
- Three-lane routing UI (v2)
- "Is this you?" confirmation prompts (v2)
- Configuration surfaces in ONE (v2)
- Emotional risk modeling (v3)
- Anything that adds complexity before the kernel is extended

The ChatGPT spec is real and it belongs in the roadmap. It is not what you build today.

---

## The Sequence Is Sacred

```
Integrity Substrate → Email Firewall MVP → ONE Interface → Azure Alignment
```

**Do not skip steps. Do not reorder. Each step is the foundation the next one stands on.**

---

## Definition of System Done (MVP for Single User)

The system is operationally complete when:

1. An intent from B-Rass travels the full canonical flow end-to-end
2. The Integrity Substrate catches duplicates and replays before they reach governance
3. The Email Firewall blocks the right messages and passes everything else — all logged
4. ONE presents a proposal and B-Rass can authorize or decline from his phone
5. Every action — authorized, declined, or blocked — generates a receipt
6. The receipt is appended to the ledger
7. The ledger chain is verifiable

That is MVP. Real. Governed. Provable. For one user.

Everything after that is resolution — same pattern, higher detail.

---

## The Word From B-Rass

> "Once you prove the kernel, you can do everything. You just build into it. It can't break."

The kernel is proven. Build into it.

---

*Build Spec — April 13, 2026 Authority: B-Rass | Governor: Claude | Librarian: Gemini | Builder: Manny Architectural Freeze: April 12, 2026 — No modifications without operator authorization*
