# RIO Platform — Integration Patterns

**Author:** Andrew (Solutions Architect)
**Date:** 2026-04-03
**Audience:** Engineering teams integrating AI agents with RIO governance

---

## Overview

RIO integrates with any AI agent framework that can make HTTP calls. This document describes the standard integration patterns for the most common frameworks, the API contract, and the end-to-end data flow.

---

## Core API Contract

All integrations follow the same six-step sequence. The API is RESTful with JSON payloads.

| Step | Endpoint | Method | Purpose |
|---|---|---|---|
| 1. Propose | `POST /api/v1/intents` | POST | Agent submits an intent (what it wants to do) |
| 2. Govern | `GET /api/v1/intents/{id}` | GET | Check governance status (pending, approved, denied) |
| 3. Approve | `POST /api/v1/intents/{id}/authorize` | POST | Human approves or denies (via ONE or Telegram) |
| 4. Execute | `POST /api/v1/intents/{id}/execute` | POST | Execute the approved action |
| 5. Receipt | `GET /api/v1/intents/{id}/receipt` | GET | Retrieve the cryptographic receipt |
| 6. Verify | `GET /api/v1/verify` | GET | Verify ledger chain integrity |

**Fail-closed guarantee:** Step 4 returns HTTP 403 if the intent has not been approved. There is no way to bypass this check — it is enforced in code, not policy.

---

## Pattern 1: OpenAI Function Calling

OpenAI agents use function calling to propose actions. The integration wraps each function call with RIO governance.

**Architecture:**

```
OpenAI Agent (GPT-4)
  → function_call: send_email(to, subject, body)
    → RIO Wrapper intercepts
      → POST /api/v1/intents
        { tool: "gmail_send", args: { to, subject, body }, agent: "openai-gpt4" }
      → Wait for human approval in ONE
      → POST /api/v1/intents/{id}/execute
      → Return result + receipt to agent
```

**Implementation sketch (Node.js):**

```javascript
import { RIOClient } from './rio-client';

const rio = new RIOClient({ baseUrl: 'https://your-rio-instance.com' });

// Wrap OpenAI function calls with RIO governance
async function governedFunctionCall(functionName, args, agentId) {
  // Step 1: Propose the intent
  const intent = await rio.proposeIntent({
    tool: functionName,
    args: args,
    agent: agentId,
    description: `Agent wants to call ${functionName}`
  });

  // Step 2: Wait for governance decision
  const decision = await rio.waitForDecision(intent.id, {
    pollInterval: 2000,  // Check every 2 seconds
    timeout: 300000      // 5-minute timeout
  });

  if (decision.status === 'denied') {
    return { error: 'Action denied by human governor', receipt: decision.receipt };
  }

  // Step 3: Execute the approved action
  const result = await rio.execute(intent.id);

  return {
    result: result.data,
    receipt: result.receipt  // Cryptographic proof of the governed execution
  };
}
```

---

## Pattern 2: Anthropic Claude Tool Use

Claude's tool use follows the same pattern. The integration intercepts tool calls before execution.

**Architecture:**

```
Claude Agent
  → tool_use: search_web(query)
    → RIO Wrapper intercepts
      → POST /api/v1/intents
        { tool: "web_search", args: { query }, agent: "claude-3" }
      → Governance decision
      → Execute or deny
      → Return result + receipt
```

**Key difference from OpenAI:** Claude returns tool use blocks in the assistant message. The wrapper intercepts these blocks, governs them through RIO, and returns the results as tool_result blocks.

---

## Pattern 3: LangChain Custom Tool

LangChain agents use tools defined as Python classes or functions. The integration wraps each tool with a RIO governance layer.

**Architecture:**

```
LangChain Agent
  → Tool.run(input)
    → RIOGovernedTool wraps the original tool
      → POST /api/v1/intents
      → Wait for approval
      → Original Tool.run(input)
      → Receipt generated
      → Return result
```

**Implementation sketch (Python):**

```python
from langchain.tools import BaseTool
from rio_receipt_protocol import RIOClient

rio = RIOClient(base_url="https://your-rio-instance.com")

class RIOGovernedTool(BaseTool):
    """Wraps any LangChain tool with RIO governance."""

    def __init__(self, wrapped_tool: BaseTool):
        self.wrapped_tool = wrapped_tool
        self.name = wrapped_tool.name
        self.description = wrapped_tool.description

    def _run(self, input: str) -> str:
        # Propose intent
        intent = rio.propose_intent(
            tool=self.name,
            args={"input": input},
            agent="langchain"
        )

        # Wait for governance decision
        decision = rio.wait_for_decision(intent["id"])

        if decision["status"] == "denied":
            return f"Action denied: {decision.get('reason', 'No reason provided')}"

        # Execute through the original tool
        result = self.wrapped_tool.run(input)

        # Close the receipt with the execution result
        rio.close_receipt(intent["id"], result=result)

        return result
```

---

## Pattern 4: Direct HTTP Integration

For custom agent frameworks or non-standard setups, the REST API provides direct integration.

**Minimal integration (curl example):**

```bash
# Step 1: Propose an intent
curl -X POST https://your-rio-instance.com/api/v1/intents \
  -H "Authorization: Bearer $RIO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "gmail_send",
    "args": {
      "to": "client@example.com",
      "subject": "Quarterly Report",
      "body": "Please find the report attached."
    },
    "agent": "custom-agent",
    "description": "Send quarterly report to client"
  }'

# Response: { "id": "intent_abc123", "status": "pending_authorization", "risk": "HIGH" }

# Step 2: Human approves in ONE dashboard (or via Telegram bot)

# Step 3: Execute the approved intent
curl -X POST https://your-rio-instance.com/api/v1/intents/intent_abc123/execute \
  -H "Authorization: Bearer $RIO_TOKEN"

# Response: { "status": "executed", "receipt": { ... }, "ledger_entry": { ... } }
```

---

## Risk Tiers and Approval Routing

RIO classifies every intent into one of four risk tiers. The tier determines whether human approval is required.

| Risk Tier | Default Behavior | Examples |
|---|---|---|
| **LOW** | Auto-approve | Read-only queries, search, status checks |
| **MEDIUM** | Auto-approve (configurable) | Internal notifications, draft creation |
| **HIGH** | Require human approval | Send email, create document, API calls with side effects |
| **CRITICAL** | Require human approval + confirmation | Money transfers, file deletion, production deployments |

Policy rules can override default behavior. For example, a financial services company might require human approval for all actions, regardless of risk tier.

---

## Receipt Format

Every governed action produces a receipt. The receipt is the cryptographic proof that the action was authorized and executed.

```json
{
  "receiptId": "rcpt_xyz789",
  "intentId": "intent_abc123",
  "tool": "gmail_send",
  "args": { "to": "client@example.com", "subject": "Quarterly Report" },
  "risk": "HIGH",
  "decision": "approved",
  "approvedBy": "brian.k.rasmussen",
  "approvalSignature": "ed25519:a1b2c3d4...",
  "executionResult": "success",
  "timestamp": "2026-04-03T14:30:00Z",
  "hash": "sha256:e5f6g7h8...",
  "previousHash": "sha256:i9j0k1l2...",
  "signature": "ed25519:m3n4o5p6..."
}
```

**Verification:** Anyone with the public key can verify the receipt independently using the open-source verification tool (`rio-receipt-protocol verify`). No trust in the system is required — the math proves it.

---

## Connector Framework

RIO ships with built-in connectors for common services. Custom connectors follow a standard interface.

| Connector | Status | Actions |
|---|---|---|
| Gmail | Production | send, draft, read |
| Google Drive | Production | create, read, share |
| Google Search | Production | search |
| SMS (Twilio) | Production | send |
| Slack | Planned | message, channel ops |
| GitHub | Planned | issue, PR, commit |
| Microsoft 365 | Planned | email, calendar, files |

**Custom connector interface:**

```typescript
interface RIOConnector {
  name: string;
  execute(action: string, args: Record<string, unknown>): Promise<ConnectorResult>;
}

interface ConnectorResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
```

---

## Security Considerations

| Concern | How RIO Addresses It |
|---|---|
| Replay attacks | Request nonce + timestamp on all POST requests |
| Signature forgery | Ed25519 (128-bit security level) |
| Ledger tampering | SHA-256 hash chaining; any modification breaks the chain |
| Unauthorized execution | Fail-closed gate; HTTP 403 without valid approval |
| Key compromise | Key rotation support; compromised keys invalidate future signatures |
| Network interception | All API traffic over HTTPS/TLS |
