> Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

# RIO Intake Specification v1

**Author:** Brian K. Rasmussen  
**Formalized by:** Manus Agent  
**Date:** 2026-03-30  
**Schema:** `spec/intake-schema.json`

## Principle

Every request entering the RIO system must follow a standard intake structure so governance is consistent. No exceptions. No shortcuts. The intake structure is the constitutional form that every agent, connector, and UI must speak.

## The Flow

```
Identity → Intent → Context → Authorization → Execution → Receipt → Ledger
```

The intake schema covers the first four stages. Execution, Receipt, and Ledger are handled by the gateway pipeline after authorization.

## The Four Fields

### 1. Identity — WHO is requesting

Establishes the human or agent behind this action. Without identity, the system cannot evaluate trust, apply policies, or attribute actions.

| Field | Required | Description |
|---|---|---|
| `subject` | Yes | Unique ID (e.g., `brian.k.rasmussen` or `agent:manus`) |
| `auth_method` | Yes | How identity was verified (`google_oauth`, `microsoft_oauth`, `jwt_session`, `ed25519_signature`, `api_key`) |
| `email` | No | Associated email address |
| `role` | No | System role: `owner`, `agent`, `delegate`, `viewer` |
| `on_behalf_of` | No | If agent acts for a human, the human's ID goes here |

### 2. Intent — WHAT action is requested

The specific operation the system should perform. This is what gets hashed for the cryptographic receipt.

| Field | Required | Description |
|---|---|---|
| `action` | Yes | Action name (e.g., `send_email`, `github_commit`) |
| `target` | No | Primary target (email address, file path, repo) |
| `parameters` | No | Action-specific parameters (varies by action type) |

### 3. Context — WHY this action is needed

Provides the governance layer with information to evaluate risk and apply policy. The richer the context, the smarter the governance decision.

| Field | Required | Description |
|---|---|---|
| `reason` | Yes | Human-readable explanation |
| `risk_scope` | No | Risk category: `internal`, `external`, `financial`, `destructive`, `irreversible` |
| `urgency` | No | Time sensitivity: `low`, `normal`, `high`, `critical` |
| `source_session` | No | Originating session/conversation ID |
| `related_intents` | No | IDs of related previous intents |

### 4. Authorization — APPROVAL decision

Null on intake. Filled by the governance pipeline after a human approves/denies or a delegation policy auto-approves. The requester never fills this field — only the governor does.

| Field | Required | Description |
|---|---|---|
| `decision` | No | `approved`, `denied`, `auto_approved`, `pending` |
| `decided_by` | No | Human subject ID or `delegation_policy:<id>` |
| `signature` | No | Ed25519 signature of the intent hash |
| `decided_at` | No | ISO 8601 timestamp |
| `reason` | No | Reason for the decision |

## Example: Full Intake

```json
{
  "identity": {
    "subject": "agent:manus",
    "auth_method": "jwt_session",
    "role": "agent",
    "on_behalf_of": "brian.k.rasmussen"
  },
  "intent": {
    "action": "send_email",
    "target": "alice@example.com",
    "parameters": {
      "subject": "Quick sync",
      "body": "Alice, can you review the PR?"
    }
  },
  "context": {
    "reason": "Follow up on pull request review from yesterday",
    "risk_scope": "external",
    "urgency": "normal"
  },
  "authorization": null
}
```

After governance evaluates and Brian approves:

```json
{
  "authorization": {
    "decision": "approved",
    "decided_by": "brian.k.rasmussen",
    "signature": "a1b2c3d4...ed25519_sig",
    "decided_at": "2026-03-30T12:00:00Z",
    "reason": "Approved — known contact, routine follow-up"
  }
}
```

## Invariant

The intake schema enforces the constitutional guarantee:

> No action may execute without Identity, Intent, and Context. Authorization must be present and non-null before execution proceeds. The system is fail-closed: missing any field means the request is rejected.

## Integration

All agents, connectors, and UIs must submit intakes conforming to `spec/intake-schema.json`. The gateway validates every incoming request against this schema. Non-conforming requests are rejected with a clear error indicating which field is missing or malformed.

## Relationship to Other Specs

- **Claude's Corpus Layer Spec** — The `calibration_events` table extracts patterns from the `intent` and `context` fields of completed intakes. The learning loop reads from this schema.
- **Gateway Routes** — `POST /intent` accepts the intake schema. `POST /authorize` fills the `authorization` field. `POST /execute` requires authorization to be non-null and approved.
- **Demo Site UI** — The Inbox view displays `identity`, `intent`, and `context`. The approval button fills `authorization`.
