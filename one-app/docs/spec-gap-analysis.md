# Canonical Build Spec v1.0 — Gap Analysis

## What Already Exists (Done)

| Spec Item | Status | Where |
|-----------|--------|-------|
| 0. Core Invariant | ✅ DONE | Gateway → Execute → Receipt → Drive already enforced |
| 1. ActionEnvelope (basic) | ✅ DONE | standardReceipt.ts — but missing: actor object, resource, constraints, state_ref |
| 2. Gateway (control point) | ✅ DONE | authorityLayer.ts + intentPipeline.ts |
| 3. Execution Layer (_gatewayExecution) | ✅ DONE | connectors.ts enforces _gatewayExecution |
| 4. Receipt System (basic) | ✅ DONE | standardReceipt.ts — but missing: action_envelope_hash, policy_version |
| 5. Drive Persistence (anchor + ledger) | ✅ DONE | librarian.ts + driveRestore.ts |
| 5. Drive Startup Restore | ✅ DONE | driveRestore.ts |
| 9. Telegram | ✅ DONE | telegramInput.ts + telegramStatusCommand.ts |
| 14. Read APIs | ✅ DONE | readApis.ts + routers.ts rio.* |
| 18. Tests (partial) | ✅ DONE | expansion.test.ts + many existing tests |

## What Needs Work (Gaps)

### 1. ActionEnvelope — Expand to Full Spec Shape
Current: `{ envelope_id, actor: string, intent: {type, target, parameters}, source, timestamp, policy_ref }`
Spec requires:
- `actor` as object: `{ id, type: "human|ai|system", source, role? }`
- `resource`: `{ type, id }`
- `payload`: `{ content, metadata }`
- `constraints`: `{ policies: [], risk_level }`
- `state_ref`: `{ state_hash }`
- `policy_ref`: `{ version }` (object, not string)

### 2. Gateway — Envelope Validation + Decision Output
Need: validate envelope structure, reject invalid, return structured decision:
`{ action_id, result: "ALLOW|WARN|REQUIRE_CONFIRMATION|BLOCK", message, cooldown_ms, requires_confirmation }`

### 4. Receipt — Add action_envelope_hash + policy_version
Current StandardReceipt missing: action_envelope_hash, policy_version

### 5. Drive — Additional Files
Current: anchor.json, ledger.json
Spec requires: 02_ENVELOPES/envelopes.json, 03_DECISIONS/decisions.json, 04_ERRORS/errors.json, 05_APPROVALS/approvals.json

### 6. Input Surfaces — Outlook Required
Telegram ✅, Gmail ✅ (existing), Gemini/AI ✅
Missing: Outlook (required by spec)

### 7. Adapter Layer — toActionEnvelope/fromDecision
Need formal adapter interface per surface

### 8. Outlook Integration
Inbound + outbound through envelope → Gateway → receipt

### 10. Approval System — Multi-User Ready
Need: approvals.json on Drive, POST /rio/approve endpoint, proposer != approver enforcement

### 11. State System — Expand state.json
Current state.json has: version, system_status, active_channels, etc.
Spec requires: cooldowns, sessions, userBehavior

### 12. Duplicate Protection
Need: action_id dedup check before Gateway processing

### 13. System Health — Structured Exposure
Need: { system_status, chain_integrity, last_action_timestamp, last_error }

### 15. UI — Minimal Dashboard
Need: last 10 actions, system state, approval queue, action trace
(GovernanceDashboard.tsx exists but may need updates)

### 16. Second Action Surface
After Outlook, add ONE: SMS or API endpoint or DevOps action
(SMS connector exists but needs full envelope flow)

### 17. Config — config.json
Need: { cooldown_default, policy_version, rate_limit }

## Implementation Priority (Top to Bottom)

1. Expand ActionEnvelope to full spec shape
2. Add envelope validation in Gateway
3. Add action_envelope_hash + policy_version to receipts
4. Add Drive sub-files (envelopes.json, decisions.json, errors.json, approvals.json)
5. Create adapter interface + implement for existing surfaces
6. Implement Outlook integration (MCP-based)
7. Add approval system (approvals.json + /rio/approve)
8. Expand state.json (cooldowns, sessions, userBehavior)
9. Add duplicate protection
10. Add structured system health endpoint
11. Update UI dashboard
12. Add config.json
13. Add second action surface (SMS full flow)
14. Comprehensive tests for all new items
