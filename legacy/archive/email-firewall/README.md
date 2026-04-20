# Email Action Firewall

Policy engine and receipt system for governed email actions in the RIO system.

## Overview

The Email Action Firewall scans outbound email content against a configurable rule set before allowing delivery. Every scan decision (BLOCK, WARN, PASS, OVERRIDE) produces a cryptographic receipt that can be independently verified.

## Architecture

```
Email Body + Subject
        │
        ▼
┌─────────────────────┐
│  Rule-Based Scanner  │  ← 12 pattern rules across 5 categories
│  (scanWithRules)     │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  LLM Enhancement    │  ← Optional: catches subtle violations
│  (invokeLLM)        │     rules miss
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Decision Engine     │  ← BLOCK > WARN > PASS priority
│  (scanEmail)         │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Receipt Generator   │  ← JSON receipt with SHA-256 hash
│  (generateReceipt)   │     (email body NEVER stored)
└─────────────────────┘
```

## Categories

| Category | Description | Default Action |
|----------|-------------|----------------|
| INDUCEMENT | Financial kickbacks, quid pro quo | BLOCK |
| THREAT | Coercion, intimidation, blackmail | BLOCK |
| PII | SSN, credit cards, personal data | BLOCK |
| COMPLIANCE | Concealment, insider trading, record destruction | BLOCK |
| CONFIDENTIAL | Unauthorized sharing of confidential info | WARN |

## Strictness Modes

| Mode | Behavior |
|------|----------|
| strict | All WARNs upgraded to BLOCKs |
| standard | Rules applied as configured |
| permissive | WARN-level rules skipped; only BLOCKs enforced |

## Receipt Schema

```json
{
  "receipt_id": "uuid",
  "timestamp": "ISO-8601",
  "event_type": "BLOCK | WARN | PASS | OVERRIDE",
  "email_context": {
    "subject": "string | null",
    "hash": "SHA-256 of email body",
    "to": "string | null"
  },
  "policy": {
    "rule_id": "string",
    "category": "string",
    "confidence": "high | medium | low"
  },
  "decision": {
    "action": "BLOCK | WARN | PASS | OVERRIDE",
    "reason": "string"
  },
  "human": {
    "approved": false,
    "approved_by": null,
    "approval_text": null
  },
  "system": {
    "engine_version": "v1",
    "policy_mode": "standard",
    "strictness": "standard"
  }
}
```

## Privacy

Email body content is **never stored**. Only a SHA-256 hash is recorded in the receipt, allowing verification that a specific email was scanned without retaining the content itself.

## Files

| File | Purpose |
|------|---------|
| `emailFirewall.ts` | Policy engine, receipt generator, in-memory store |
| `tests/emailFirewall.test.ts` | 28 vitest tests covering all categories and modes |
| `receipts/` | Sample receipt JSON files |

## Tests

```bash
npx vitest run email-firewall/tests/emailFirewall.test.ts
```

28 tests covering rule-based scanning, LLM integration, receipt generation, receipt store, sample generation, and strictness modes.

## Integration

The firewall is integrated into the ONE Command Center at `/email-firewall` as a public demo page. It can also be called programmatically via tRPC:

```ts
// Scan an email
const result = await trpc.emailFirewall.scan.mutate({
  body: "email content",
  subject: "Subject line",
  to: "recipient@example.com",
  strictness: "standard",
  useLLM: true,
});

// Get receipts
const receipts = await trpc.emailFirewall.receipts.query({ limit: 50 });
```
