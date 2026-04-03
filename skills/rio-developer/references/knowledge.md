# RIO Developer Agent — Technical Knowledge Base

## Receipt Protocol SDK

The receipt protocol is available as an npm package and a Python package. Both implement the same canonical rules defined in `spec/canonical-rules.md` in the public repo.

### Installation

**Node.js:**
```bash
npm install rio-receipt-protocol
```

**Python:**
```bash
pip install rio-receipt-protocol
```

### Canonical Rules

These rules are normative — every implementation must follow them:

1. All field names use snake_case
2. Hash algorithm is SHA-256
3. Signing algorithm is Ed25519
4. Timestamps are Unix milliseconds (UTC)
5. Hash input is deterministic JSON serialization of content fields
6. Ledger entries are hash-chained (each entry's `prev_hash` references the previous entry's `hash`)
7. Genesis entry has `prev_hash` of all zeros
8. Receipt verification requires: hash matches content, signature matches hash, chain is unbroken

### Error Handling Patterns

```javascript
try {
  const receipt = createReceipt(intentData);
  const signed = signReceipt(receipt, privateKey);
  await appendToLedger(signed);
} catch (error) {
  if (error.code === 'INVALID_SIGNATURE') {
    // Key mismatch — check keypair
  } else if (error.code === 'CHAIN_BROKEN') {
    // Ledger integrity issue — investigate
  } else if (error.code === 'MISSING_FIELD') {
    // Required field not provided
  }
}
```

### Ledger Operations

```javascript
// Append to ledger
const entry = {
  ...receipt,
  prev_hash: lastEntry.hash,
  sequence: lastEntry.sequence + 1,
};

// Verify chain integrity
function verifyChain(entries) {
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].prev_hash !== entries[i-1].hash) {
      return { valid: false, brokenAt: i };
    }
  }
  return { valid: true };
}
```

## RIO Governance API Reference

### Authentication

All API calls require a bearer token in the Authorization header. For development, use the JWT token from the OAuth flow. For service-to-service, use API keys configured in the RIO platform.

### Risk Tiers

| Tier | Description | Default Behavior |
|---|---|---|
| LOW | Read-only, no side effects | Auto-approved |
| MEDIUM | Reversible side effects | Requires approval |
| HIGH | Irreversible or sensitive | Requires approval + reasoning |
| CRITICAL | Financial, legal, safety | Requires approval + kill switch check |

### Custom Connector Template

```typescript
import { ConnectorResult } from '../types';

interface MyServiceConfig {
  apiKey: string;
  baseUrl: string;
}

interface MyServiceArgs {
  action: string;
  params: Record<string, unknown>;
}

export function createMyServiceConnector(config: MyServiceConfig) {
  return async function execute(args: MyServiceArgs): Promise<ConnectorResult> {
    const response = await fetch(`${config.baseUrl}/${args.action}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args.params),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `API returned ${response.status}: ${await response.text()}`,
      };
    }

    return {
      success: true,
      data: await response.json(),
      metadata: {
        statusCode: response.status,
        timestamp: Date.now(),
      },
    };
  };
}
```

### Testing Receipts

```javascript
import { createReceipt, verifyReceipt, generateKeypair } from 'rio-receipt-protocol';

// Generate test keypair
const { publicKey, privateKey } = generateKeypair();

// Create and sign
const receipt = createReceipt({ /* ... */ });
const signed = signReceipt(receipt, privateKey);

// Verify
const result = verifyReceipt(signed, publicKey);
assert(result.valid === true);
assert(result.hashMatch === true);
assert(result.signatureValid === true);
```

## Database Schema (for ONE integrations)

Key tables that developers may need to understand when building integrations:

- `intents` — proposed actions with status, risk tier, tool name, arguments
- `executions` — completed actions with results and receipt data
- `ledger_entries` — hash-chained audit trail
- `policy_rules` — custom governance rules (tool patterns, risk overrides)
- `notifications` — in-app alerts for approvals, executions, policy changes

All timestamps are stored as Unix milliseconds (UTC). IDs use nanoid format.
