# If You're New — Read This First

You only need to understand one thing:

> **This system turns AI actions into authorized transactions.**

Instead of:

```
AI → Action
```

It becomes:

```
AI → Proposal → Governance → Approval → Execution → Receipt → Ledger
```

That is the entire system. Everything else is detail.

---

## The 2-Minute Path

### Step 1: Understand the Loop

Every action in RIO follows the same sequence:

```
Intent → Govern → Approve → Execute → Receipt → Ledger
```

An AI proposes an intent. A policy engine evaluates risk. A human approves if required. The gateway executes. A receipt is generated. The ledger records it. There are no shortcuts and no alternative paths.

### Step 2: Check the Live System

The Gateway is running. You can verify it:

```bash
curl https://rio-gateway.onrender.com/health
```

This returns the current system status: version, connectors, ledger size, and epoch validity.

### Step 3: Verify Live Receipts

Using the receipt protocol CLI:

```bash
git clone https://github.com/bkr1297-RIO/rio-receipt-protocol.git
cd rio-receipt-protocol
npm install
node cli/verify.mjs remote https://rio-gateway.onrender.com
```

This pulls recent receipts from the live Gateway and verifies their hash chains. This proves the system is not theoretical — it is running and producing verifiable receipts.

### Step 4: Run a Local Example

```bash
node examples/basic-usage.mjs
```

This generates a receipt locally, chains it to a ledger, and verifies both. You will see the full hash chain in the output.

---

## Why Three Models Exist (7 / 9 / 8)

You will see references to 7 invariants, 9 lifecycle stages, and 8 layers. They are not different systems. They are three views of the same system:

| Model | What It Describes | Purpose |
|-------|------------------|---------|
| 7 Invariants | Rules | What can never be violated |
| 9 Stages | Flow | How an action moves through the system |
| 8 Layers | Structure | What components exist and their roles |

Together, they describe the same system completely. You do not need to memorize all three. Start with the loop (Step 1 above) and refer to the models when you need specifics.

---

## If You Ignore Everything Else

Understand this:

> If an action cannot be approved, recorded, and verified — it is not allowed to happen.

That is the system guarantee. Everything in this repository exists to enforce it.

---

## Where to Go Next

| Goal | Resource |
|------|----------|
| Understand the full system | [System Overview](SYSTEM_OVERVIEW.md) |
| See the architecture | [Architecture v2.7](ARCHITECTURE_v2.7.md) |
| Read the receipt protocol spec | [Receipt Protocol](https://github.com/bkr1297-RIO/rio-receipt-protocol) |
| See the live demo | [RIO Demo](https://riodemo-ux2sxdqo.manus.space) |
| Ask implementation questions | [Ask Bondi](https://riodemo-ux2sxdqo.manus.space/ask) |
| Check Gateway status | [Gateway Health](https://rio-gateway.onrender.com/health) |
