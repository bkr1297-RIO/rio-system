# Gateway Self-Approval Fix — Manual Patch

## Target File

```
gateway/routes/index.mjs
```

## No env/config changes required

All functions used (`generateReceipt`, `hashAuthorization`, `hashGovernance`, `hashIntent`, `appendEntry`, `storeReceipt`, `getCurrentHash`, `getGatewayKeypair`, `buildSignaturePayload`, `signPayload`, `hashPayload`) are already imported at the top of the file. No new dependencies.

## Insertion Point

Find this block inside `router.post("/authorize", ...)` (around line 291-296 in the original file):

```js
    if (intent.status !== "governed") {
      return res.status(409).json({
        error: `Intent is in status "${intent.status}", expected "governed".`,
      });
    }

    const timestamp = new Date().toISOString();
```

## What to insert

Insert the following block **between** the `}` closing the governed-status check and the `const timestamp = new Date().toISOString();` line:

```js
    // ---------------------------------------------------------------
    // INVARIANT: Proposer ≠ Approver (fail-closed, governed denial)
    // The authenticated principal's ID must differ from the intent's
    // principal_id. If they match, the authorization is DENIED and a
    // governed denial receipt is generated, signed, written to the
    // ledger, and persisted to PostgreSQL. This is not a bare 403 —
    // it is a governed event with full audit trail.
    // ---------------------------------------------------------------
    const approverId = req.principal?.principal_id;
    const proposerId = intent.principal_id || intent.agent_id;
    if (approverId && proposerId && approverId === proposerId) {
      const denialTimestamp = new Date().toISOString();

      // Build authorization record for the denial
      const denialAuthorization = {
        intent_id,
        decision: "denied",
        authorized_by: approverId,
        signer_id: approverId,
        timestamp: denialTimestamp,
        conditions: null,
        expires_at: null,
        ed25519_signed: false,
        signature_payload_hash: null,
        principal_id: approverId,
        principal_role: req.principal?.primary_role || null,
        denial_reason: "self-approval blocked: proposer_id equals approver_id",
      };
      const denialAuthHash = hashAuthorization(denialAuthorization);

      // Update intent status to denied
      updateIntent(intent_id, {
        status: "denied",
        authorization: { ...denialAuthorization, authorization_hash: denialAuthHash },
      });

      // Generate governed denial receipt
      const denialReceipt = generateReceipt({
        receipt_type: "governed_denial",
        intent_id,
        action: intent.action,
        agent_id: intent.agent_id,
        authorized_by: approverId,
        intent_hash: hashIntent(intent),
        governance_hash: hashGovernance(intent.governance || {}),
        authorization_hash: denialAuthHash,
        execution_hash: "NONE_DENIED",
      });

      // Add denial-specific fields
      denialReceipt.decision = "DENIED";
      denialReceipt.denial_reason = "self-approval blocked: proposer_id equals approver_id";
      denialReceipt.invariant = "proposer_ne_approver";
      denialReceipt.proposer_id = proposerId;
      denialReceipt.approver_id = approverId;
      denialReceipt.previous_receipt_hash = getCurrentHash() || null;

      // Sign the denial receipt with Gateway Ed25519 key
      const gatewayKeypair = getGatewayKeypair();
      if (gatewayKeypair) {
        const sigPayload = buildSignaturePayload({
          intent_id,
          action: intent.action,
          decision: "denied",
          signer_id: "gateway",
          timestamp: denialTimestamp,
        });
        denialReceipt.receipt_signature = signPayload(sigPayload, gatewayKeypair.secretKey);
        denialReceipt.gateway_public_key = gatewayKeypair.publicKey;
        denialReceipt.signature_payload_hash = hashPayload(sigPayload);
      }

      // Write denial receipt to ledger (hash-chained)
      const ledgerEntry = appendEntry({
        intent_id,
        action: intent.action,
        agent_id: intent.agent_id,
        status: "denied",
        detail: `SELF-APPROVAL DENIED: proposer ${proposerId} attempted to approve own intent. Governed denial receipt: ${denialReceipt.receipt_id}`,
        receipt_hash: denialReceipt.hash_chain.receipt_hash,
        authorization_hash: denialAuthHash,
        intent_hash: hashIntent(intent),
      });

      // Set ledger_entry_id on receipt
      denialReceipt.ledger_entry_id = ledgerEntry?.entry_id || ledgerEntry?.id || null;

      // Persist full receipt to PostgreSQL (survives redeploys)
      storeReceipt(denialReceipt).catch(err => {
        console.error(`[RIO Gateway] Failed to persist denial receipt: ${err.message}`);
      });

      console.log(`[RIO Gateway] SELF-APPROVAL DENIED: ${intent_id} — proposer ${proposerId} == approver ${approverId}. Receipt: ${denialReceipt.receipt_id}, Ledger entry: ${denialReceipt.ledger_entry_id}`);

      return res.status(403).json({
        intent_id,
        status: "denied",
        decision: "DENIED",
        invariant: "proposer_ne_approver",
        denial_reason: "self-approval blocked: proposer_id equals approver_id",
        proposer_id: proposerId,
        approver_id: approverId,
        receipt: {
          receipt_id: denialReceipt.receipt_id,
          receipt_type: denialReceipt.receipt_type,
          receipt_hash: denialReceipt.hash_chain.receipt_hash,
          hash_chain: denialReceipt.hash_chain,
          receipt_signature: denialReceipt.receipt_signature || null,
          gateway_public_key: denialReceipt.gateway_public_key || null,
          ledger_entry_id: denialReceipt.ledger_entry_id,
          previous_receipt_hash: denialReceipt.previous_receipt_hash,
        },
        timestamp: denialTimestamp,
      });
    }
```

## After (the file should read)

```js
    if (intent.status !== "governed") {
      return res.status(409).json({
        error: `Intent is in status "${intent.status}", expected "governed".`,
      });
    }

    // ---------------------------------------------------------------
    // INVARIANT: Proposer ≠ Approver (fail-closed, governed denial)
    // ... (116 lines of the block above)
    // ---------------------------------------------------------------
    ...
    }

    const timestamp = new Date().toISOString();
    let signatureVerified = false;
    let signaturePayloadHash = null;
```

## Commit message

```
fix: enforce proposer≠approver on /authorize with governed denial receipt
```

## What it does (5 things)

1. Compares `req.principal.principal_id` (authenticated caller) against `intent.principal_id` (who created the intent)
2. On match: generates a `governed_denial` receipt with full hash chain
3. Signs the receipt with the Gateway Ed25519 key
4. Writes the receipt hash to the ledger via `appendEntry()` (hash-chained)
5. Persists the full receipt to PostgreSQL via `storeReceipt()`

## What it does NOT do

- No new imports (all functions already imported)
- No new dependencies
- No env/config changes
- No changes to `/approvals/:intent_id` (already has the check)
- No changes to any other endpoint
- Does not touch the happy path (cross-approval still works identically)
