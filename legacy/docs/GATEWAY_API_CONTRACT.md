## Gateway API Contract for ONE and SDKs

We are standardizing on the Gateway as the only enforcement and execution entry point. The SDK and ONE must call the Gateway, not implement their own logic.

### Required Gateway Endpoints

*   `POST /intents` — create intent (proposer)
*   `POST /approvals/:intent_id` — approve/reject (approver)
*   `POST /execute/:intent_id` — execute approved intent (executor)
*   `GET /receipts/:receipt_id` — fetch receipt
*   `GET /ledger/:entry_id` — fetch ledger entry

### Request Requirements

Every request must include:

*   `principal_id`
*   `signature`
*   `key_version`
*   `intent_hash` (where applicable)
