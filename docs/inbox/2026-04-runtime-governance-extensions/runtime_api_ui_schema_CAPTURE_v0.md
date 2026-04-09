# Runtime API + UI Schema (Captured Draft)

**Status:** CAPTURE ONLY — NOT ACTIVE BUILD SCOPE

**Purpose:**
Preserve extended runtime concepts, API structures, UI schemas, and system flow so they are not lost.

**Important:**
- Not current build scope
- Not canonical architecture
- Raw capture layer
- Use later

Core invariants remain unchanged:
- SAS (Atlas) = Observation (zero authority)
- RIO (Aegis) = Governance + execution
- Human = Final authority
- No automatic SAS → RIO coupling

---

## Contents

1. API Specification — Governed Execution
2. Engine Architecture
3. Replit Build Prompt
4. UI Schema — ONE Dashboard
5. Runtime Flow Model
6. System Positioning + Mapping

---

## 1. API Specification — Governed Execution

### POST /intake/state-eval

Request:

```json
{
  "intent": {
    "id": "uuid",
    "type": "action",
    "description": "Send client contract email",
    "origin": "user",
    "timestamp": "ISO-8601"
  },
  "state": {
    "activation_level": "medium",
    "stability": "stable",
    "coherence": "aligned",
    "confidence": 0.82
  },
  "integrity": {
    "authority_drift_risk": "low",
    "dependency_risk": "low",
    "ambiguity_level": "medium",
    "override_attempt": false
  },
  "risk": {
    "impact": "medium",
    "reversibility": "reversible",
    "domain": "communication",
    "sensitivity": "medium"
  },
  "context": {
    "source": "conversation",
    "cross_domain": false,
    "history_used": true
  },
  "policy": {
    "policy_pack": "default"
  }
}
```

Response:

```json
{
  "decision": "allow_with_confirmation",
  "reason": "medium impact with medium ambiguity",
  "required_actions": ["human_confirmation"],
  "state_snapshot_id": "state_123",
  "risk_score": 0.58
}
```

---

### POST /proposals

```json
{
  "intent_id": "uuid",
  "proposal_type": "action",
  "action_name": "send_email",
  "payload": {},
  "origin_actor": "bondi",
  "context_refs": ["state_123"]
}
```

---

### POST /governance/evaluate

```json
{
  "proposal_id": "prop_123",
  "policy_pack": "default",
  "state_snapshot_id": "state_123"
}
```

---

### POST /approvals

```json
{
  "proposal_id": "prop_123",
  "decision": "approve",
  "approver_id": "human_brian",
  "signature": "ed25519"
}
```

---

### POST /execution-tokens

```json
{
  "proposal_id": "prop_123",
  "approval_id": "appr_123"
}
```

---

### POST /execute

```json
{
  "proposal_id": "prop_123",
  "execution_token_id": "tok_123"
}
```

---

### POST /receipts

```json
{
  "proposal_id": "prop_123",
  "approval_id": "appr_123",
  "execution_id": "exec_123"
}
```

---

### GET /ledger/{receipt_id}

Returns full receipt + ledger chain proof

---

## 2. Engine Architecture

Modules:
- state_engine.py
- proposal_engine.py
- governance_engine.py
- approval_engine.py
- execution_engine.py
- receipt_engine.py
- ledger.py

---

### Core Logic

State → Integrity → Risk → Policy → Approval → Execution → Receipt → Ledger

---

### Deterministic Rules

- High ambiguity + medium risk → HOLD
- High drift → REQUIRE APPROVAL
- Irreversible → REQUIRE APPROVAL
- High sensitivity → REQUIRE APPROVAL
- Fragmented state → HOLD

---

## 3. Replit Build Prompt (Reference Only)

System must:
- Fail closed
- Require approval for high-risk
- Use single-use execution tokens
- Maintain append-only ledger
- Hash-chain receipts
- No arbitrary execution

---

## 4. UI Schema — ONE Dashboard

Panels:
- Chief of Staff (Bondi)
- Current State (Atlas)
- Active Work
- Pending Approvals
- Receipts
- Ledger
- Memory (MANTIS)

---

### Current State Panel

- activation_level
- stability
- coherence
- integrity flags

---

### Approvals Panel

- proposal
- risk
- approve / deny

---

### Ledger Panel

- hash chain
- verification

---

## 5. Runtime Flow Model

```
User Input
→ SAS (pattern detection)
→ State Mapping
→ Reflection (no authority)
→ User decides
→ RIO governance
→ Approval
→ Execution
→ Receipt
→ Ledger
```

---

## 6. System Mapping

| Component | Role |
|-----------|------|
| SAS / Atlas | Pattern observation |
| Bondi | Planning + structuring |
| AI | Generation |
| RIO / Aegis | Governance |
| Human | Authority |
| ONE | Interface |
| MANTIS | Memory |
| Ledger | Proof |

---

**Tags:** #runtime #api #governance #ui #future #capture
