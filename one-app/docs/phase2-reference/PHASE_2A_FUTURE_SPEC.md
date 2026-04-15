# FUTURE BUILD SPEC — PHASE 2A (REFERENCE ONLY)

> **Status:** REFERENCE ONLY — Do NOT begin implementation without explicit "Build Phase 2A" instruction.
> **Source:** Bondi (Observer) via Brian, Apr 14 2026

## Context

Phase 1 is complete:
- Governed execution loop (intent → approval → execution → receipt → ledger)
- Notion Decision Log operational
- Sentinel visibility layer in place

We are now designing the next layer: real-world operational use.

## Objective

Enable the system to:
- generate meaningful work (research, planning, proposals)
- present structured decision packets
- route everything through the existing governance loop

No change to core invariants.

## Scope: Phase 2A (Proposer Expansion Only)

This phase introduces:
- structured proposal packets
- threshold-triggered intents
- scoped "fiduciary" agents (proposers only)

NO autonomous execution. NO spending. NO delegation yet.

## 1. Proposal Packet System

Define a standardized structure for all non-trivial work output.

```json
{
  "packet_type": "RESEARCH_PROPOSAL",
  "task_id": "task_123",
  "principal_id": "agent_x",
  "summary": "Top 10 companies in X space",
  "findings": [...],
  "recommendations": [...],
  "confidence": 0.72,
  "risk_flags": ["market volatility"],
  "next_actions": ["draft outreach email", "schedule follow-up"],
  "created_at": "ISO8601"
}
```

Requirements:
- consistent schema
- human-readable
- attachable to Notion rows
- no execution capability

## 2. Threshold Watchers (Intent Generators)

Input: condition (e.g., account balance, metric threshold)
Behavior: monitor passively, when condition met → emit intent

Requirements:
- read-only data access
- no execution
- emits standard intent to gateway

## 3. Fiduciary Agent Template (Proposer Only)

Properties: mission, budget_context (informational only), allowed_domains (research, drafting)
Capabilities: research, simulate outcomes, produce proposal packets
Constraints: cannot spend, cannot execute, must route all actions through RIO

## 4. Conversational Approval Support

Enhance proposal handling: allow iterative questioning before approval (clarification, modification, risk acknowledgment). No change to approval mechanism — still requires signature + gateway.

## 5. Integration Points

All new outputs must integrate with: Notion (proposal packets visible in Decision Log), Gateway (all actions still require authorization), Sentinel (anomaly + drift monitoring continues), Ledger (only executed actions recorded).

## Out of Scope

- automatic delegation
- spending authority
- autonomous execution
- multi-agent orchestration engine
- learning loop automation

## Open Questions (Do Not Resolve Yet)

- packet schema variations
- watcher scheduling model
- agent scaling patterns
