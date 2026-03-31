# WS-011: RIO Roles and Permissions Specification v1.0

**Date:** 2026-03-31  
**Status:** Ready for Implementation  
**Author:** Andrew (Analyst/Auditor)  
**Target Implementer:** Romney (Governance Engine Developer)

---

## Overview

The RIO Roles and Permissions system defines:

- **Who can do what** (role-to-capability mapping)
- **Under what conditions** (approval policies)
- **With what constraints** (denial rules)

This specification is a JSON schema and policy rule framework that Romney will implement as extensions to the governance policy engine.

---

## Role Definitions

### ROLE 1: ADMIN (Owner)

**Identity:** `brian-sovereign` (or any user granted admin role)

**Capabilities:** Register new signers and assign roles, modify governance policies and approval rules, approve any action (no restrictions), revoke other users' access, view all ledger entries and receipts, override approval requirements (if needed), manage kill switch and emergency procedures, audit any action or user.

**Constraints:** Admin approval must be cryptographically signed (Ed25519). Admin cannot audit their own approvals (conflict of interest). Policy changes require audit trail (logged in ledger). Irrevocable actions (deletion, deployment) require confirmation.

```json
{
  "role": "admin",
  "capabilities": [
    "register_signer", "modify_policy", "approve_any_action",
    "revoke_access", "view_ledger", "view_receipts",
    "override_approval", "emergency_halt", "audit_system"
  ],
  "signer_id": "brian-sovereign",
  "ed25519_required": true,
  "constraints": {
    "cannot_self_audit": true,
    "policy_changes_logged": true
  }
}
```

### ROLE 2: APPROVER

Scoped approval authority. Can approve/deny intents within their scope. Cannot modify policies, register signers, or override approval policies.

```json
{
  "role": "approver",
  "capabilities": ["approve_intent", "deny_intent", "view_scoped_ledger", "comment_on_intent"],
  "scope": {
    "action_types": ["send_email"],
    "environments": ["staging", "demo"],
    "risk_levels": ["low", "medium"],
    "max_daily_approvals": 50
  }
}
```

### ROLE 3: AUDITOR (Viewer)

Read-only access. Can view full ledger, all receipts, verify hash chain, generate audit reports. Cannot approve, deny, modify, or delete anything.

```json
{
  "role": "auditor",
  "capabilities": ["view_ledger", "view_receipts", "verify_chain", "generate_audit_report", "comment_findings"],
  "constraints": { "read_only": true }
}
```

### ROLE 4: POLICY MANAGER

Can create and modify approval policies within constraints set by Admin. Cannot override Admin-locked policies or reduce approval requirements. All policy changes require Admin signature.

```json
{
  "role": "policy_manager",
  "capabilities": ["create_policy", "modify_policy", "define_scope", "set_thresholds", "view_policy_history"],
  "scope": {
    "can_modify": ["approval_thresholds", "role_scopes"],
    "cannot_modify": ["invariants", "fail_closed_gates"],
    "requires_admin_signature": true
  }
}
```

---

## Role-to-Capability Matrix

| Capability | Admin | Approver | Auditor | Policy Mgr |
|---|---|---|---|---|
| Register signer | Yes | No | No | No |
| Modify policy | Yes | No | No | Scoped |
| Approve intent | Yes | Yes | No | No |
| Deny intent | Yes | Yes | No | No |
| View ledger | Yes | Scoped | Yes | Yes |
| View all receipts | Yes | Scoped | Yes | Yes |
| Verify hash chain | Yes | Scoped | Yes | Yes |
| Override approval | Yes | No | No | No |
| Revoke access | Yes | No | No | No |
| Emergency halt | Yes | No | No | No |

---

## Approval Policies by Action Type

| Action Type | Risk Level | Required Approvals | Who Can Approve | Special Constraints |
|---|---|---|---|---|
| send_email | MEDIUM | 1 | Approver or Admin | Domain allowlist, blocklist |
| transfer_funds / process_payment | HIGH | 2 (1 Admin + 1 Approver) | Sequential, dual control | Max amount per single approval: $10,000, 1h window |
| deploy_code / update_infrastructure | HIGH | 2 (1 Dev + 1 Manager) | Sequential | Staging approval first, testing required |
| delete_data / purge_records | CRITICAL | 1 Admin only | Admin only | 24h cooling period, backup confirmation, 2FA |
| modify_policy / update_governance | CRITICAL | 1 Admin only | Admin only | Cannot weaken invariants, audit trail required |

---

## Approval Enforcement Gates

All gates must PASS for action to proceed. Any gate FAIL = action BLOCKED.

| Gate | Question | Check | Fail Mode |
|---|---|---|---|
| IDENTITY_GATE | Is the agent recognized? | agent_id in registered_agents | CLOSED |
| POLICY_GATE | Does action match a policy? | action_type in policy_rules | CLOSED |
| CONFIDENCE_GATE | Is AI confident enough? | confidence >= 80% | ESCALATE |
| APPROVAL_GATE | Has qualified approver signed? | valid Ed25519 signatures collected | CLOSED |
| SCOPE_GATE | Is action within approver's scope? | action in approver.scope | CLOSED |

---

## Implementation JSON Schema for Romney

```json
{
  "version": "1.0",
  "roles": [
    {
      "role_id": "admin",
      "display_name": "Administrator",
      "capabilities": ["register_signer", "modify_policy", "approve_any_action"],
      "constraints": { "ed25519_required": true }
    },
    {
      "role_id": "approver",
      "display_name": "Approver",
      "capabilities": ["approve_intent", "deny_intent"],
      "scope": {
        "action_types": ["send_email"],
        "environments": ["staging"],
        "risk_levels": ["low", "medium"]
      }
    }
  ],
  "approval_policies": [
    {
      "action": "send_email",
      "risk_level": "medium",
      "approval_policy": {
        "required_approvals": 1,
        "approval_sources": ["approver", "admin"],
        "requires_signature": true
      }
    },
    {
      "action": "transfer_funds",
      "risk_level": "high",
      "approval_policy": {
        "required_approvals": 2,
        "approval_sources": [
          { "role": "admin", "count": 1 },
          { "role": "approver", "count": 1 }
        ],
        "requires_signature": true
      }
    }
  ],
  "gates": [
    { "gate": "IDENTITY_GATE", "check": "is_agent_recognized", "fail_mode": "closed" },
    { "gate": "POLICY_GATE", "check": "is_action_in_policy", "fail_mode": "closed" },
    { "gate": "CONFIDENCE_GATE", "check": "confidence_score >= 80", "fail_mode": "escalate" },
    { "gate": "APPROVAL_GATE", "check": "has_required_approvals", "fail_mode": "closed" }
  ]
}
```

---

## Safety Guarantees

- NO ACTION without approval (fail-closed)
- NO APPROVAL without signature (cryptographic binding)
- NO POLICY CHANGE that weakens invariants (semantic validation)
- NO APPROVER BYPASS (scope enforcement)
- NO SILENT DENIALS (all blocks are logged)
- NO ROLE ESCALATION (roles are immutable per user)

---

**Version:** 1.0 | **Date:** 2026-03-31 | **Author:** Andrew | **Status:** Ready for Implementation
