# RIO SDK Interface and Developer Flow

## 1. Introduction
This document outlines the proposed SDK interface and developer flow for interacting with the RIO Gateway, incorporating the finalized Identity, Policy, and Storage specifications. The goal is to provide a clear, developer-friendly guide for building applications that leverage RIO's governed execution capabilities.

## 2. Core Principles for SDK Design
*   **Abstraction**: Hide the complexity of cryptographic operations, API calls, and underlying data structures.
*   **Type Safety**: Provide clear data models for intents, receipts, and other RIO objects.
*   **Identity-Aware**: Explicitly handle RIO's unified identity model (principal_id, actor_type, role_exercised).
*   **Policy-Guided**: Facilitate intent construction and submission in alignment with RIO's policy engine.
*   **Verifiable**: Support independent verification of receipts and ledger entries.

## 3. SDK Structure (Conceptual)

SDKs will be provided for Python and Node.js, offering a consistent interface.

```
rio-sdk/
├── python/
│   ├── rio_sdk/
│   │   ├── __init__.py
│   │   ├── identity.py     # Identity management, key generation, delegation
│   │   ├── intents.py      # Intent creation, submission, status polling
│   │   ├── execution.py    # Execution triggering
│   │   ├── receipts.py     # Receipt retrieval
│   │   ├── verifier.py     # Local receipt and ledger verification
│   │   └── models.py       # Data models (Intent, Receipt, Principal, Policy)
│   └── setup.py
├── nodejs/
│   ├── src/
│   │   ├── index.ts
│   │   ├── identity.ts
│   │   ├── intents.ts
│   │   ├── execution.ts
│   │   ├── receipts.ts
│   │   ├── verifier.ts
│   │   └── models.ts
│   └── package.json
└── docs/
    └── README.md
```

## 4. Developer Flow with SDK Examples

This section details the step-by-step developer experience, with conceptual code examples for both Python and Node.js.

### 4.1. Initialize SDK and Authenticate Principal

Before any interaction, the SDK needs to be initialized with the principal's credentials. This will typically involve an API key for AI agents or an OAuth token for humans, along with the principal's registered `principal_id`.

**Python Example:**
```python
from rio_sdk import RIOClient
from rio_sdk.identity import Principal

# For an AI Agent
agent_principal = Principal(
    principal_id="bondi",
    actor_type="ai_agent",
    primary_role="proposer",
    api_key="YOUR_BONDI_API_KEY"
)
rio_client = RIOClient(principal=agent_principal, gateway_url="https://gateway.rio.org/api/v1")

# For a Human Approver (example - actual human auth is via ONE PWA OAuth)
human_principal = Principal(
    principal_id="I-1",
    actor_type="human",
    primary_role="approver",
    private_key_hex="YOUR_I1_PRIVATE_KEY_HEX" # Used for signing approvals
)
rio_client_human = RIOClient(principal=human_principal, gateway_url="https://gateway.rio.org/api/v1")
```

**Node.js Example:**
```typescript
import { RIOClient, Principal } from '@rio-org/sdk';

// For an AI Agent
const agentPrincipal: Principal = {
  principalId: 'bondi',
  actorType: 'ai_agent',
  primaryRole: 'proposer',
  apiKey: 'YOUR_BONDI_API_KEY',
};
const rioClient = new RIOClient(agentPrincipal, 'https://gateway.rio.org/api/v1');

// For a Human Approver (example - actual human auth is via ONE PWA OAuth)
const humanPrincipal: Principal = {
  principalId: 'I-1',
  actorType: 'human',
  primaryRole: 'approver',
  privateKeyHex: 'YOUR_I1_PRIVATE_KEY_HEX', // Used for signing approvals
};
const rioClientHuman = new RIOClient(humanPrincipal, 'https://gateway.rio.org/api/v1');
```

### 4.2. Submit an Intent

An external system constructs an `Intent` object, specifying the action, parameters, and context. The SDK will automatically inject the `principal_id`, `actor_type`, and `role_exercised` from the initialized `Principal`.

**Python Example:**
```python
from rio_sdk.models import Intent

intent = Intent(
    action="send_email",
    payload={
        "to": "recipient@example.com",
        "subject": "Meeting Reminder",
        "body": "Don't forget our meeting tomorrow at 10 AM."
    },
    risk_level="MEDIUM", # Policy will evaluate this
    metadata={"campaign_id": "xyz123"}
)

submitted_intent = rio_client.intents.submit(intent)
print(f"Intent submitted: {submitted_intent.intent_id} with status {submitted_intent.status}")
# Expected status: PENDING_APPROVAL or APPROVED (if auto-approved by policy)
```

**Node.js Example:**
```typescript
import { Intent } from '@rio-org/sdk/models';

const intent: Intent = {
  action: 'send_email',
  payload: {
    to: 'recipient@example.com',
    subject: 'Meeting Reminder',
    body: "Don't forget our meeting tomorrow at 10 AM.",
  },
  riskLevel: 'MEDIUM', // Policy will evaluate this
  metadata: { campaignId: 'xyz123' },
};

const submittedIntent = await rioClient.intents.submit(intent);
console.log(`Intent submitted: ${submittedIntent.intentId} with status ${submittedIntent.status}`);
// Expected status: PENDING_APPROVAL or APPROVED (if auto-approved by policy)
```

### 4.3. Poll for Approval Status

The external system can poll the Gateway for the status of a submitted intent. The response will include the current status and, if applicable, details about the governance evaluation and approval.

**Python Example:**
```python
# Assuming submitted_intent from previous step
current_status = rio_client.intents.get_status(submitted_intent.intent_id)
print(f"Current status of {submitted_intent.intent_id}: {current_status.status}")

if current_status.status == "APPROVED":
    print("Intent approved! Ready for execution.")
elif current_status.status == "PENDING_APPROVAL":
    print("Waiting for human approval...")
```

**Node.js Example:**
```typescript
// Assuming submittedIntent from previous step
const currentStatus = await rioClient.intents.getStatus(submittedIntent.intentId);
console.log(`Current status of ${submittedIntent.intentId}: ${currentStatus.status}`);

if (currentStatus.status === 'APPROVED') {
  console.log('Intent approved! Ready for execution.');
} else if (currentStatus.status === 'PENDING_APPROVAL') {
  console.log('Waiting for human approval...');
}
```

### 4.4. Trigger Execution

Once an intent is approved, the external system can trigger its execution. The Gateway will consume the approval and execute the action, generating a receipt.

**Python Example:**
```python
# Assuming intent is APPROVED
if current_status.status == "APPROVED":
    execution_result = rio_client.execution.trigger(submitted_intent.intent_id)
    print(f"Execution triggered. Receipt ID: {execution_result.receipt_id}")
```

**Node.js Example:**
```typescript
// Assuming intent is APPROVED
if (currentStatus.status === 'APPROVED') {
  const executionResult = await rioClient.execution.trigger(submittedIntent.intentId);
  console.log(`Execution triggered. Receipt ID: ${executionResult.receiptId}`);
}
```

### 4.5. Retrieve Receipt

After execution, the full cryptographic receipt can be retrieved from the Gateway. This receipt is stored in CAS and referenced by the ledger.

**Python Example:**
```python
# Assuming execution_result from previous step
receipt = rio_client.receipts.get(execution_result.receipt_id)
print(f"Retrieved Receipt for Intent {receipt.intent_id}:\n{receipt.to_json()}")
```

**Node.js Example:**
```typescript
// Assuming executionResult from previous step
const receipt = await rioClient.receipts.get(executionResult.receiptId);
console.log(`Retrieved Receipt for Intent ${receipt.intentId}:\n${JSON.stringify(receipt, null, 2)}`);
```

### 4.6. Verify Receipt (Local or via Gateway)

The SDK will provide utilities to verify receipts locally using the `rio-receipt-protocol` or via a Gateway endpoint. Local verification is crucial for independent auditability.

**Python Example (Local Verification):**
```python
from rio_sdk.verifier import verify_receipt_standalone

is_valid = verify_receipt_standalone(receipt)
print(f"Local Receipt Verification: {is_valid}")
```

**Node.js Example (Local Verification):**
```typescript
import { verifyReceiptStandalone } from '@rio-org/sdk/verifier';

const isValid = verifyReceiptStandalone(receipt);
console.log(`Local Receipt Verification: ${isValid}`);
```

**Python Example (Gateway Verification):**
```python
verification_status = rio_client.verifier.verify(receipt.receipt_id)
print(f"Gateway Receipt Verification Status: {verification_status.status}")
```

**Node.js Example (Gateway Verification):**
```typescript
const verificationStatus = await rioClient.verifier.verify(receipt.receiptId);
console.log(`Gateway Receipt Verification Status: ${verificationStatus.status}`);
```

## 5. References

1.  [RIO Identity and Roles Specification](/docs/specs/IDENTITY_AND_ROLES_SPEC.md)
2.  [RIO Policy Schema Specification](/docs/specs/POLICY_SCHEMA_SPEC.md)
3.  [RIO Storage Architecture Specification](/docs/specs/STORAGE_ARCHITECTURE_SPEC.md)

## 6. Conclusion
This SDK interface and developer flow provide a robust and clear pathway for external systems to integrate with the RIO Gateway, ensuring secure, governed, and verifiable AI actions. The SDKs will abstract much of the underlying complexity, allowing developers to focus on building intelligent applications.
