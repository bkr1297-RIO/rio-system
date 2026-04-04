# RIO Gateway: External System Integration Plan

## 1. Introduction
This document outlines a high-level architectural plan for how external systems will integrate with the RIO Gateway to leverage its governance capabilities. The focus is on defining the developer flow from Intent submission to Receipt verification, ensuring all interactions route through the governed gateway.

## 2. Core Principles
*   **Gateway as Enforcement Point**: All external system interactions related to governed actions must pass through the RIO Gateway. No direct bypass to underlying services.
*   **Interface Layer Agnostic**: Approval and interaction surfaces (Slack, Email, Web UI, Mobile) are considered interface layers (ONE) and do not contain governance logic. They interact with the Gateway via its APIs.
*   **SDK-First Approach**: Provide SDKs in common languages (Python, Node.js) to simplify integration and abstract away cryptographic complexities.
*   **Clear Developer Flow**: Define a predictable sequence of API calls for developers to follow.

## 3. Developer Flow: Intent → Approval → Execution → Receipt → Verify

### 3.1. Intent Submission
*   **Description**: An external AI system or application proposes an action that requires governance.
*   **SDK Structure**: SDKs will provide helper functions to construct a canonical Intent object.
*   **API Endpoint**: `POST /api/intents`
    *   **Request Body**: JSON payload representing the Intent (e.g., `action`, `payload`, `risk_level`, `metadata`).
    *   **Response**: `intent_id`, `status` (e.g., `PENDING_APPROVAL`), and links to approval/status endpoints.

### 3.2. Approval Request & Notification
*   **Description**: The RIO Gateway, based on defined policies, determines if human approval is required and notifies the relevant human-in-the-loop (HITL) approvers.
*   **Interface Layer Interaction**: The Gateway pushes notifications to configured interface layers (e.g., Slack, Email, Web UI).
    *   **Slack**: Gateway sends a message with approval/rejection buttons.
    *   **Email**: Gateway sends an email with links to a web-based approval interface.
    *   **Web UI (ONE)**: Approvers log into the ONE Command Center to review and act on pending Intents.
*   **API Endpoint (for status polling)**: `GET /api/intents/:intent_id/status`
    *   **Response**: Current status of the Intent (`PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `EXECUTED`).

### 3.3. Execution Trigger
*   **Description**: Once an Intent is approved (either automatically by policy or manually by a human), the external system can trigger its execution via the Gateway.
*   **SDK Structure**: SDKs will provide functions to trigger execution.
*   **API Endpoint**: `POST /api/intents/:intent_id/execute`
    *   **Request Body**: Minimal, typically just the `intent_id`.
    *   **Response**: `receipt_id`, `status` (e.g., `EXECUTED`), and links to receipt retrieval.

### 3.4. Receipt Retrieval
*   **Description**: After successful execution, the RIO Gateway generates a cryptographic receipt and records it in the tamper-evident ledger. The external system can then retrieve this receipt.
*   **SDK Structure**: SDKs will offer functions to fetch receipts.
*   **API Endpoint**: `GET /api/receipts/:receipt_id` or `GET /api/intents/:intent_id/receipt`
    *   **Response**: Full RIO Receipt JSON.

### 3.5. Verification
*   **Description**: The external system can independently verify the integrity and authenticity of the RIO Receipt and its associated ledger entry.
*   **SDK Structure**: SDKs will include `verify_receipt_standalone` (Python) and `verifyReceiptStandalone` (Node.js) functions.
*   **API Endpoint**: `GET /api/verify/:identifier` (as per `VERIFY_API_INTEGRATION.md`)
    *   **Response**: Verification status and details.

## 4. SDK Structure

SDKs will be designed to encapsulate the API interactions and cryptographic operations, providing a developer-friendly interface.

```
rio-sdk/
├── python/
│   ├── rio_sdk/
│   │   ├── __init__.py
│   │   ├── intents.py      # Intent submission, status polling
│   │   ├── execution.py    # Execution triggering
│   │   ├── receipts.py     # Receipt retrieval
│   │   └── verifier.py     # Local receipt verification (re-uses rio-receipt-protocol)
│   └── setup.py
├── nodejs/
│   ├── src/
│   │   ├── index.ts
│   │   ├── intents.ts
│   │   ├── execution.ts
│   │   ├── receipts.ts
│   │   └── verifier.ts     # Local receipt verification (re-uses rio-receipt-protocol)
│   └── package.json
└── docs/
    └── README.md
```

## 5. API Endpoints Summary

| Endpoint                               | Method | Description                                     | Key Data Points                                   |
| :------------------------------------- | :----- | :---------------------------------------------- | :------------------------------------------------ |
| `/api/intents`                         | `POST` | Submit a new Intent for governance              | `action`, `payload`, `risk_level`, `intent_id`    |
| `/api/intents/:intent_id/status`       | `GET`  | Check the current status of an Intent           | `status`, `approval_details`                      |
| `/api/intents/:intent_id/execute`      | `POST` | Trigger execution of an approved Intent         | `receipt_id`, `execution_status`                  |
| `/api/receipts/:receipt_id`            | `GET`  | Retrieve a full RIO Receipt                     | Full Receipt JSON                                 |
| `/api/verify/:identifier`              | `GET`  | Verify a RIO Receipt or ledger entry            | `status`, `receipt_valid`, `hash_valid`, `signature_valid` |
| `/api/verify/ledger/chain`             | `GET`  | Retrieve a portion of the tamper-evident ledger | `entries`, `chainValid`                           |
| `/api/verify/ledger/stats`             | `GET`  | Get ledger statistics                           | `total_entries`, `latest_block`                   |
| `/api/verify/public-key`               | `GET`  | Retrieve the public key for Ed25519 verification| `public_key_hex`                                  |

## 6. Conclusion
This plan provides a structured approach for external systems to integrate with the RIO Gateway, ensuring that all AI-driven actions are subject to governance, human approval (when required), and verifiable audit trails. The SDK-first strategy and clearly defined API endpoints will facilitate developer adoption and maintain the integrity of the RIO platform.
