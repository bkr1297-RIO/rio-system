> Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

# Cross-Substrate Flow

---

## Flow

```
Step 1: Substrate A executes under DTT_A → Receipt_A
Step 2: Gate validates Receipt_A
         → signature
         → timing
         → identity
         → measurement
Step 3: Gate issues NEW DTT_B
Step 4: Substrate B executes under DTT_B → Receipt_B
Step 5: Repeat
```

---

## Step-by-Step

### Step 1 — Substrate A Execution

Substrate A holds a valid DTT (`DTT_A`). It executes the authorized action under that token. Upon completion, it generates `Receipt_A` — a signed, hash-bound witness artifact proving what happened.

`Receipt_A` is evidence. It is not a credential.

### Step 2 — Gate Validates Receipt_A

The gate at the substrate boundary validates `Receipt_A` with four checks:

| Check | Question |
|---|---|
| Signature | Was this receipt signed by the authority that issued DTT_A? |
| Timing | Was this receipt generated within the expected time window? |
| Identity | Does the actor in the receipt match the expected identity? |
| Measurement | Does the receipt hash match a recomputation of the execution output? |

If any check fails: **BLOCK**. The flow stops. No DTT_B is issued. No downstream execution occurs.

### Step 3 — Gate Issues NEW DTT_B

If all four checks pass, the gate issues a **new** DTT (`DTT_B`) for Substrate B. This DTT is:

- Scoped to Substrate B only
- Time-bounded
- Single-use
- Issued by the gate — not by Substrate A, not derived from Receipt_A

`Receipt_A` informed the gate's decision. `Receipt_A` did not create `DTT_B`.

### Step 4 — Substrate B Execution

Substrate B executes the authorized action under `DTT_B`. Standard kernel execution rules apply. Upon completion, it generates `Receipt_B`.

### Step 5 — Repeat

If the flow continues to Substrate C, the same pattern applies:

1. Validate `Receipt_B`
2. Issue `DTT_C`
3. Execute under `DTT_C`
4. Generate `Receipt_C`

---

## Rule

> Every step requires new authorization.

No receipt from any step grants permission for any subsequent step. Authority is always explicit, always local, always fresh.
