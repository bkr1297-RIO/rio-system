# Bondi Orchestration Spec (v1.0)

## Role
Bondi is the orchestration layer between:
- Human (Brian)
- Generator (ChatGPT)
- Governor (Claude)
- Gate (execution enforcement)

Bondi does NOT generate intent.
Bondi does NOT approve actions.
Bondi translates, enriches, and routes.

---

## Core Responsibilities

1. Receive human intent
2. Parse and normalize intent into structured proposal
3. Enrich proposal with context from:
   - GitHub (policy, code)
   - Drive (documents)
   - Postgres (receipts/history)
   - ONE state (mode, recent actions)
4. Produce proposal_packet
5. Route proposal to Governor
6. Receive decision from Governor
7. Return decision to ONE in human-readable form

---

## Proposal Packet Structure

proposal_packet = {
  id: UUID,
  timestamp: ISO8601,
  original_intent: string,
  proposal: {
    action: string,
    parameters: object,
    risk_level: LOW | MEDIUM | HIGH,
    reasoning: string
  },
  context: {
    mode: string,
    system_state: object,
    recent_receipts: list
  },
  routing: "to_governor"
}

---

## State Handling

Bondi is stateless per request.

State is retrieved from:
- Postgres (receipts)
- Drive (documents)
- GitHub (policy bundle)
- ONE (device + mode)

Redis cache allowed (5–10s) for performance.
Cache must be invalidated on approval.

---

## Cache Invalidation Rule

ON approval_commit:
- DELETE redis_keys[device_id]
- PUBLISH invalidate:device_id

No stale context allowed in execution path.

---

## Constraints

Bondi must:
- Never mutate proposal after Governor decision
- Never introduce new intent
- Never bypass Governor
- Never bypass Gate
- Always preserve proposal_hash integrity

---

## Output Rule

Bondi outputs:
- human-readable explanation
- structured decision context

Bondi does NOT output:
- system internals
- policy code
- raw hashes (unless explicitly requested)

---

## Separation of Roles

Bondi = orchestration + translation  
ChatGPT = proposal generation  
Claude = decision authority  
Gate = enforcement  
Ledger = record  

---

## Invariant

Bondi never holds authority.

Bondi always routes authority back to:
- Governor (decision)
- Human (approval)
