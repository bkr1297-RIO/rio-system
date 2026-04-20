# Quick Start: Your First RIO Workflow

**Time:** 10 minutes  
**Goal:** Understand how RIO works through a real example

## Scenario

You want AI to update GitHub documentation with these constraints:
- Specific files only (not entire repo)
- Bounded changes (max 200 lines)
- Time-limited (expires in 10 minutes)
- Audit trail (proof of what happened)

## The Workflow

### Step 1: You Define Intent

```json
{
  "intent": "Update API docs with OAuth 2.0 details"
}
```

System creates intent hash: `sha256("Update API...")`

### Step 2: AI Proposes Actions

```json
{
  "proposal": {
    "actions": [
      {
        "type": "github_file_edit",
        "file": "docs/api/authentication.md",
        "operation": "append",
        "estimated_lines": 120
      },
      {
        "type": "github_file_edit",
        "file": "docs/api/oauth-flow.md",
        "operation": "modify",
        "estimated_lines": 80
      }
    ]
  }
}
```

System creates proposal hash and links to intent.

### Step 3: Policy Evaluates Risk

```json
{
  "risk_tier": 2,
  "requires_approval": true,
  "constraints": {
    "max_files": 2,
    "max_lines": 200,
    "allowed_operations": ["append", "modify"],
    "time_limit_minutes": 15
  }
}
```

### Step 4: You Approve

You sign the decision hash:

```json
{
  "approval": {
    "decision_hash": "sha256(...)",
    "signature": "ed25519_sig",
    "timestamp": "2026-04-17T18:15:00Z"
  }
}
```

### Step 5: System Issues Token

*(Note: This example shows the target architecture. Current implementation uses time-limited tokens with action-class scoping.)*

```json
{
  "token_id": "tok_a1b2c3",
  "expires_at": "2026-04-17T18:30:00Z",
  "agent": "docs_agent_01",
  "scope": {
    "files": ["docs/api/authentication.md", "docs/api/oauth-flow.md"],
    "operations": ["append", "modify"],
    "remaining_caps": {
      "steps": 2,
      "lines": 200
    }
  }
}
```

### Step 6: Agent Executes

**First action:**
- Edits `authentication.md` (120 lines)
- Caps updated: steps=1, lines=80

**Second action:**
- Edits `oauth-flow.md` (75 lines)
- Caps updated: steps=0, lines=5

Token exhausted → authority disappears

### Step 7: System Generates Receipt

```json
{
  "receipt_id": "rcpt_x9y8",
  "intent_hash": "sha256(...)",
  "proposal_hash": "sha256(...)",
  "execution_hash": "sha256(...)",
  "verification_status": "PASSED",
  "action": {
    "type": "github_file_edit",
    "file": "docs/api/authentication.md",
    "result": "SUCCESS"
  }
}
```

### Step 8: Ledger Append

```json
{
  "block_index": 42,
  "receipt_hash": "sha256(receipt)",
  "previous_hash": "sha256(block_41)",
  "cumulative_state": {
    "steps_used": 2,
    "lines_changed": 195
  }
}
```

## What Just Happened

1. You defined intent → System recorded
2. AI proposed actions → System hashed
3. Policy evaluated → Decision created
4. You approved → Token issued (time-limited)
5. AI executed → Within bounds
6. Token exhausted → Authority disappeared
7. Receipts generated → Cryptographic proof
8. Ledger recorded → Immutable trail

**Your involvement:** 30 seconds to review + 1 click to approve

## What This Prevented

**Without RIO, AI could have:**
- Edited files you didn’t approve
- Made unlimited changes
- Kept authority after task
- Modified audit trail

**With RIO:**
- Only touched approved files
- Stayed within limits
- Authority expired automatically
- Audit trail tamper-proof

## Try It Yourself

1. Review enforcement specs: `spec/v2-enforcement-layers/`
2. Explore use cases: `USECASES.md`
3. Deploy: `guides/DEPLOYMENT_GUIDE.md`

## Common Questions

**Q: What if I need AI to do more than approved?**  
A: Issue new token. Previous authority doesn’t extend.

**Q: What if two agents need to coordinate?**  
A: Multi-agent layer enforces global caps across all agents.

**Q: Can AI bypass these limits?**  
A: No. Enforcement is cryptographic. Would require breaking Ed25519 (computationally infeasible).

---
*You’re ready to build your first RIO workflow.*
