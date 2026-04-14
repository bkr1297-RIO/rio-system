# RIO — CANONICAL BUILD SPEC (v1.0)

Single Source of Truth for Manny.

This document defines the complete system. No phases, no branching, no parallel architectures.

---

## 0. CORE INVARIANT (ABSOLUTE)

The following must NEVER change:

```
Generate / Receive
→ ActionEnvelope
→ Gateway (policy + authorization)
→ Execute (_gatewayExecution required)
→ StandardReceipt
→ Drive (anchor.json + ledger.json)
```

Rules:
- No bypass paths
- No direct execution
- No silent failures
- Every action must produce a receipt
- Drive is the persistent source of truth

---

## 1. ACTION ENVELOPE (MANDATORY INPUT STANDARD)

All inputs must be wrapped into this structure before Gateway.

```json
{
  "action_id": "uuid",
  "timestamp": "iso8601",
  "actor": {
    "id": "string",
    "type": "human | ai | system",
    "source": "string",
    "role": "optional"
  },
  "intent": {
    "type": "string",
    "description": "optional"
  },
  "resource": {
    "type": "string",
    "id": "string"
  },
  "payload": {
    "content": "string",
    "metadata": {}
  },
  "constraints": {
    "policies": ["string"],
    "risk_level": "low | medium | high"
  },
  "state_ref": {
    "state_hash": "string"
  },
  "policy_ref": {
    "version": "string"
  }
}
```

Gateway must:
- validate envelope
- reject invalid inputs
- no fallback

---

## 2. GATEWAY (CONTROL POINT)

Responsibilities:
- validate envelope
- evaluate policy
- enforce authorization
- return decision

Decision output:

```json
{
  "action_id": "uuid",
  "result": "ALLOW | WARN | REQUIRE_CONFIRMATION | BLOCK",
  "message": "string",
  "cooldown_ms": 0,
  "requires_confirmation": false
}
```

---

## 3. EXECUTION LAYER

All execution must go through:

```
dispatchExecution(..., _gatewayExecution = true)
```

Any call without `_gatewayExecution === true`:
→ HARD REJECT

---

## 4. RECEIPT SYSTEM (STANDARDIZED)

Every action produces:

```json
{
  "receipt_id": "uuid",
  "prev_receipt_hash": "hash",
  "action_id": "uuid",
  "actor": {...},
  "intent": {...},
  "decision": "...",
  "execution_status": "...",
  "timestamp": "iso8601"
}
```

Also store:
- action_envelope_hash
- policy_version

---

## 5. DRIVE PERSISTENCE (SOURCE OF TRUTH)

Paths:

```
/RIO/
  anchor.json
  ledger.json
  02_ENVELOPES/envelopes.json
  03_DECISIONS/decisions.json
  04_ERRORS/errors.json
  05_APPROVALS/approvals.json
```

### Behavior

On every action:
- append to ledger.json
- update anchor.json
- log envelope
- log decision
- log errors (if any)

### Startup

On boot:
- read anchor.json
- read ledger.json
- verify receipt chain
- restore state

---

## 6. INPUT SURFACES (ALL MUST CONVERT TO ENVELOPE)

Supported:
- Gemini / AI
- Telegram
- Outlook (required)
- Gmail (existing)
- API endpoint (future)

All must:

```
Native Event → Adapter → ActionEnvelope → Gateway
```

---

## 7. ADAPTER LAYER

Each system must implement:

```
toActionEnvelope(event)
fromDecision(decision, context)
```

Adapters do NOT:
- evaluate policy
- make decisions

They only translate + enforce.

---

## 8. OUTLOOK INTEGRATION (REQUIRED)

Outbound:
- intercept send
- wrap into envelope
- call Gateway
- enforce decision

Inbound:
- new email → envelope → Gateway → receipt

---

## 9. TELEGRAM (ALREADY BUILT — KEEP)

Ensure:
- all commands → envelope
- no direct execution
- receipts generated

---

## 10. APPROVAL SYSTEM (MULTI-USER READY)

If decision = REQUIRE_APPROVAL:
- create entry in approvals.json
- block execution

Approval API:
```
POST /rio/approve
```

Execution resumes after approval.

### Constraint

Prefer:
- proposer_id != approver_id

If same:
- enforce cooldown or second step

---

## 11. STATE SYSTEM

state.json must track:

```json
{
  "cooldowns": {},
  "sessions": {},
  "userBehavior": {}
}
```

Used for:
- cooldowns
- overrides
- escalation

---

## 12. DUPLICATE PROTECTION

All envelopes must include action_id.

If duplicate:
→ reject

---

## 13. SYSTEM HEALTH

Expose:

```json
{
  "system_status": "ACTIVE | DEGRADED | BLOCKED",
  "chain_integrity": true,
  "last_action_timestamp": "...",
  "last_error": "..."
}
```

---

## 14. READ APIs

Expose:
- getLastAction()
- getActionHistory()
- getSystemState()

Reads from Drive.

---

## 15. UI (MINIMAL)

Provide:
- last 10 actions
- system state
- approval queue
- action trace

No heavy framework required.

---

## 16. SECOND ACTION SURFACE

After Outlook, add ONE:
- SMS OR
- API endpoint OR
- DevOps action

Must:
- pass Gateway
- produce receipt

---

## 17. CONFIG

config.json:

```json
{
  "cooldown_default": 120000,
  "policy_version": "v1",
  "rate_limit": 10
}
```

---

## 18. TEST REQUIREMENTS

System must pass:
- no bypass execution
- envelope validation
- duplicate rejection
- chain integrity
- Drive restore
- multi-surface flow

---

## 19. FINAL SYSTEM STATE

The system must be:
- governed
- structured
- persistent
- observable
- multi-surface
- extensible

---

## 20. FINAL RULE

Everything must:

→ pass through Gateway
→ be authorized
→ execute via controlled path
→ emit receipt
→ persist to Drive

---

## FINAL STATEMENT

This is a single governed runtime where all actions—across any system—are standardized, evaluated, authorized, executed, and recorded through one control path.
