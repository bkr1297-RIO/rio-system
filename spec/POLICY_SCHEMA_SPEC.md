# RIO Policy Schema Specification

**Version:** 1.0
**Date:** 2026-04-04
**Authority Level:** High — defines the machine-readable policy schema for the platform
**Origin:** Andrew (Solutions Architect / Manus)
**Status:** Draft
**Supersedes:** `spec/policy-v1.0.json`, hardcoded policy logic in `gateway/governance/policy.mjs` and `gateway/governance/config.mjs`
**Depends On:** `IDENTITY_AND_ROLES_SPEC.md` (principal_id, roles, actor_types)

---

## 1. Purpose

This document defines the formal, machine-readable policy schema for the RIO governed execution system. A policy is a declarative document that tells the Governance Engine how to evaluate intents, what risk levels to assign, what approval requirements to enforce, which principals may execute which actions, and when approvals expire.

The current system uses a static JSON file (`policy-v1.0.json`) with hardcoded evaluation logic in `gateway/governance/policy.mjs`. This specification replaces that approach with a versioned, schema-validated, auditable policy format that can be evaluated programmatically without hardcoded assumptions.

The constitutional invariant this specification enforces:

> **No Execution Without Approval: No AI action proceeds without explicit human authorization, verified cryptographically.** (Constitution, Invariant 2)

Policy is the mechanism that determines what "explicit human authorization" means for each action class: which actions require human approval, which are auto-approved, which are auto-denied, and what quorum is required.

---

## 2. Policy Document Structure

A policy document is a JSON object with the following top-level structure. Every field is required unless marked optional.

```json
{
  "policy_version": "2.0.0",
  "policy_id": "uuid",
  "policy_hash": "sha256hex",
  "previous_policy_hash": "sha256hex or null",
  "created_at": "ISO 8601",
  "created_by": "principal_id",
  "approved_by": ["principal_id", ...],
  "approval_signatures": [...],
  "status": "active | draft | superseded | revoked",
  "scope": { ... },
  "risk_tiers": { ... },
  "action_classes": [ ... ],
  "approval_requirements": { ... },
  "delegation_rules": { ... },
  "expiration_rules": { ... },
  "system_modes": { ... }
}
```

---

## 3. Policy Versioning

Policies are versioned using semantic versioning (MAJOR.MINOR.PATCH). Every policy change produces a new policy document with a new `policy_id` and an incremented version number. The old policy is marked `superseded` and its `policy_hash` is recorded as `previous_policy_hash` in the new policy, forming a hash chain.

| Version Component | When to Increment | Example |
|---|---|---|
| MAJOR | Constitutional change, new invariant, structural schema change | 1.0.0 → 2.0.0 |
| MINOR | New action class, new risk tier, new approval requirement | 2.0.0 → 2.1.0 |
| PATCH | Threshold adjustment, description update, scope expansion | 2.1.0 → 2.1.1 |

### 3.1 Policy Hash Chain

Every policy document includes a `policy_hash` (SHA-256 of the policy content excluding the hash fields) and a `previous_policy_hash` (the hash of the policy it supersedes). This creates a tamper-evident chain of policy versions.

```
policy_hash = SHA-256(canonical_json(policy_document excluding policy_hash and previous_policy_hash))
```

The genesis policy has `previous_policy_hash: null`.

### 3.2 Policy Change Authorization

Policy changes require Meta-Governance quorum as defined in the Constitution:

| Change Type | Required Quorum | Receipt Type |
|---|---|---|
| PATCH (threshold adjustment) | 2-of-3 Meta-Governance | `POLICY_CHANGE` |
| MINOR (new action class) | 2-of-3 Meta-Governance | `POLICY_CHANGE` |
| MAJOR (structural change) | 3-of-3 Meta-Governance | `GOVERNANCE_CHANGE` |

Every policy change produces a `POLICY_CHANGE` or `GOVERNANCE_CHANGE` receipt that is written to the ledger. The receipt includes the old policy hash, the new policy hash, and the quorum signatures.

---

## 4. Scope

The scope section defines which principals, environments, and systems are governed by this policy.

```json
{
  "scope": {
    "agents": ["bondi", "manny", "andrew", "romney"],
    "environments": ["local", "sandbox", "production"],
    "systems": ["gmail", "google_drive", "github", "google_workspace", "calendar"],
    "principals": {
      "included": ["*"],
      "excluded": []
    }
  }
}
```

An intent from an agent not listed in `scope.agents` is blocked with reason `AGENT_NOT_IN_SCOPE`. An intent targeting a system not listed in `scope.systems` is blocked with reason `SYSTEM_NOT_IN_SCOPE`.

---

## 5. Risk Tiers

Risk tiers classify actions by their potential impact. Each tier has a name, a numeric severity (used for programmatic comparison), and a description.

```json
{
  "risk_tiers": {
    "NONE": {
      "severity": 0,
      "description": "No external effect. Internal computation or read-only.",
      "examples": ["summarize_text", "list_files", "read_email"]
    },
    "LOW": {
      "severity": 1,
      "description": "Internal effect only. Reversible. No external communication.",
      "examples": ["draft_email", "organize_files", "create_local_document"]
    },
    "MEDIUM": {
      "severity": 2,
      "description": "External effect but reversible or limited scope.",
      "examples": ["send_email_to_known_contact", "update_existing_document"]
    },
    "HIGH": {
      "severity": 3,
      "description": "External effect with significant scope or limited reversibility.",
      "examples": ["send_email_to_new_contact", "modify_github_repo", "share_document_externally"]
    },
    "CRITICAL": {
      "severity": 4,
      "description": "Irreversible external effect, financial impact, or authority change.",
      "examples": ["delete_repository", "send_payment", "revoke_access", "change_policy"]
    }
  }
}
```

---

## 6. Action Classes

Action classes are the core of the policy. Each action class defines a pattern of actions, the risk tier assigned to matching actions, and the governance decision (auto-approve, require human, auto-deny).

```json
{
  "action_classes": [
    {
      "class_id": "read_operations",
      "pattern": "read_*|list_*|get_*|summarize_*",
      "risk_tier": "NONE",
      "governance_decision": "AUTO_APPROVE",
      "description": "Read-only operations with no external effect."
    },
    {
      "class_id": "draft_operations",
      "pattern": "draft_*|organize_*|create_local_*",
      "risk_tier": "LOW",
      "governance_decision": "AUTO_APPROVE",
      "description": "Internal creation operations. Reversible, no external effect."
    },
    {
      "class_id": "send_known_contact",
      "pattern": "send_email",
      "conditions": {
        "recipient_in": "known_contacts",
        "attachment_count": { "max": 3 },
        "body_length": { "max": 5000 }
      },
      "risk_tier": "MEDIUM",
      "governance_decision": "REQUIRE_HUMAN",
      "description": "Sending email to a known contact. Requires human approval."
    },
    {
      "class_id": "send_new_contact",
      "pattern": "send_email",
      "conditions": {
        "recipient_not_in": "known_contacts"
      },
      "risk_tier": "HIGH",
      "governance_decision": "REQUIRE_HUMAN",
      "description": "Sending email to a new contact. Higher risk, requires human approval."
    },
    {
      "class_id": "github_write",
      "pattern": "github_commit|github_push|github_create_*|github_delete_*",
      "risk_tier": "HIGH",
      "governance_decision": "REQUIRE_HUMAN",
      "description": "Write operations to GitHub repositories."
    },
    {
      "class_id": "destructive_operations",
      "pattern": "delete_*|revoke_*|destroy_*",
      "risk_tier": "CRITICAL",
      "governance_decision": "REQUIRE_HUMAN",
      "description": "Destructive operations. Irreversible. Requires human approval."
    },
    {
      "class_id": "financial_operations",
      "pattern": "send_payment|transfer_*|purchase_*",
      "risk_tier": "CRITICAL",
      "governance_decision": "REQUIRE_HUMAN",
      "description": "Financial operations. Requires human approval."
    },
    {
      "class_id": "policy_changes",
      "pattern": "update_policy|change_constitution|modify_invariant",
      "risk_tier": "CRITICAL",
      "governance_decision": "REQUIRE_QUORUM",
      "description": "Changes to governance rules. Requires Meta-Governance quorum."
    },
    {
      "class_id": "invariant_violations",
      "pattern": "self_authorize|bypass_governance|execute_without_approval",
      "risk_tier": "CRITICAL",
      "governance_decision": "AUTO_DENY",
      "description": "Actions that violate constitutional invariants. Always denied."
    }
  ]
}
```

### 6.1 Pattern Matching

Action patterns use a simple glob syntax:

| Pattern | Matches |
|---|---|
| `send_email` | Exact match: `send_email` only |
| `send_*` | Prefix match: `send_email`, `send_payment`, `send_notification` |
| `read_*\|list_*` | Multiple prefixes: `read_email`, `list_files` |
| `*` | Wildcard: matches any action |

Patterns are evaluated in order. The first matching action class determines the governance decision. If no pattern matches, the default governance decision is `REQUIRE_HUMAN` (fail-closed).

### 6.2 Conditions

Conditions are optional constraints that narrow when an action class applies. If conditions are present, the action must match both the pattern and all conditions. If the pattern matches but conditions do not, the evaluator falls through to the next action class.

| Condition | Type | Description |
|---|---|---|
| `recipient_in` | String (list reference) | The recipient must be in the named contact list |
| `recipient_not_in` | String (list reference) | The recipient must not be in the named contact list |
| `attachment_count.max` | Integer | Maximum number of attachments |
| `body_length.max` | Integer | Maximum body length in characters |
| `confidence.min` | Integer (0-100) | Minimum AI confidence score |
| `risk_scope` | String | Must match the intent's `risk_scope` field |

---

## 7. Approval Requirements

Approval requirements define how many approvals are needed and from whom, based on the risk tier of the action.

```json
{
  "approval_requirements": {
    "AUTO_APPROVE": {
      "approvals_required": 0,
      "description": "No approval needed. Action proceeds immediately."
    },
    "REQUIRE_HUMAN": {
      "approvals_required": 1,
      "required_roles": ["approver", "root_authority"],
      "description": "One human approval required from an authorized approver."
    },
    "REQUIRE_QUORUM": {
      "approvals_required": 2,
      "quorum_size": 3,
      "required_roles": ["meta_governor", "root_authority"],
      "description": "2-of-3 Meta-Governance quorum required."
    },
    "REQUIRE_UNANIMOUS": {
      "approvals_required": 3,
      "quorum_size": 3,
      "required_roles": ["meta_governor", "root_authority"],
      "description": "3-of-3 unanimous Meta-Governance quorum required."
    },
    "AUTO_DENY": {
      "approvals_required": -1,
      "description": "Action is denied immediately. No approval path exists."
    }
  }
}
```

### 7.1 Quorum Rules

Quorum rules apply when `governance_decision` is `REQUIRE_QUORUM` or `REQUIRE_UNANIMOUS`. The quorum is drawn from the set of principals with role `meta_governor` or `root_authority`.

| Rule | Value | Description |
|---|---|---|
| Quorum size | 3 (configurable) | Total number of quorum members |
| Operational quorum | 2-of-3 | Required for policy changes (MINOR, PATCH) |
| Constitutional quorum | 3-of-3 | Required for constitutional changes (MAJOR) |
| Emergency quorum | 1-of-3 | Required for emergency stop (any single root_authority) |
| Quorum timeout | 72 hours | If quorum is not reached within this period, the request expires |
| Quorum members | Defined in `principals` table with role `meta_governor` | Members are registered, not ad-hoc |

### 7.2 Approval Expiration

Approvals are not permanent. Each approval has a time-to-live (TTL) after which it expires and the intent must be re-approved.

| Risk Tier | Approval TTL | Rationale |
|---|---|---|
| NONE | N/A (auto-approved) | No approval needed |
| LOW | N/A (auto-approved) | No approval needed |
| MEDIUM | 1 hour | Short-lived approval for moderate-risk actions |
| HIGH | 30 minutes | Tighter window for high-risk actions |
| CRITICAL | 15 minutes | Minimal window for critical actions |

If an execution is attempted after the approval TTL has expired, the Gateway returns HTTP 403 with reason `APPROVAL_EXPIRED`. The intent must be re-submitted and re-approved.

---

## 8. Delegation Rules

Delegation rules define the constraints on delegated authority (see IDENTITY_AND_ROLES_SPEC.md, Section 7).

```json
{
  "delegation_rules": {
    "enabled": true,
    "max_duration_hours": 24,
    "risk_ceiling": "LOW",
    "allowed_delegators": ["root_authority", "approver"],
    "allowed_delegates": ["ai_agent"],
    "requires_receipt": true,
    "auto_revoke_on_violation": true
  }
}
```

When `risk_ceiling` is `LOW`, delegated agents can only auto-approve `NONE` and `LOW` risk actions. Any action above the ceiling requires the delegator's explicit approval, regardless of delegation.

---

## 9. System Modes

System modes define the operational state of the Gateway. The mode affects which governance decisions are available.

```json
{
  "system_modes": {
    "NORMAL": {
      "description": "Standard operation. All governance decisions available.",
      "auto_approve_enabled": true,
      "delegation_enabled": true
    },
    "ELEVATED": {
      "description": "Heightened security. All actions require human approval.",
      "auto_approve_enabled": false,
      "delegation_enabled": false,
      "override": "All governance_decision values are overridden to REQUIRE_HUMAN except AUTO_DENY."
    },
    "LOCKDOWN": {
      "description": "Emergency mode. Only root_authority can approve. All delegation revoked.",
      "auto_approve_enabled": false,
      "delegation_enabled": false,
      "override": "Only root_authority can approve. All other approvers are suspended.",
      "trigger": "Emergency kill switch or constitutional violation detected."
    },
    "MAINTENANCE": {
      "description": "System maintenance. All execution paused. Intents accepted but not processed.",
      "auto_approve_enabled": false,
      "delegation_enabled": false,
      "execution_paused": true
    }
  }
}
```

Mode changes are governed actions themselves. Changing from `NORMAL` to `ELEVATED` requires `root_authority`. Changing to `LOCKDOWN` can be triggered by any single `root_authority` (emergency). Returning from `LOCKDOWN` to `NORMAL` requires 2-of-3 quorum.

---

## 10. Policy Evaluation Algorithm

The Governance Engine evaluates an intent against the active policy using the following algorithm. This replaces the hardcoded logic in `gateway/governance/policy.mjs`.

```
FUNCTION evaluateIntent(intent, policy, principal):

  1. VERIFY policy.status == "active"
     IF NOT → BLOCK("NO_ACTIVE_POLICY")

  2. VERIFY intent.agent_id IN policy.scope.agents
     IF NOT → BLOCK("AGENT_NOT_IN_SCOPE")

  3. VERIFY intent.target_system IN policy.scope.systems
     IF NOT → BLOCK("SYSTEM_NOT_IN_SCOPE")

  4. SET matched_class = NULL
     FOR EACH class IN policy.action_classes (in order):
       IF intent.action MATCHES class.pattern:
         IF class.conditions IS EMPTY OR intent SATISFIES class.conditions:
           SET matched_class = class
           BREAK

  5. IF matched_class IS NULL:
       SET governance_decision = "REQUIRE_HUMAN"  // fail-closed default
       SET risk_tier = "HIGH"
     ELSE:
       SET governance_decision = matched_class.governance_decision
       SET risk_tier = matched_class.risk_tier

  6. CHECK system_mode overrides:
     IF mode == "ELEVATED" AND governance_decision != "AUTO_DENY":
       SET governance_decision = "REQUIRE_HUMAN"
     IF mode == "LOCKDOWN" AND governance_decision != "AUTO_DENY":
       SET governance_decision = "REQUIRE_HUMAN"
       SET required_roles = ["root_authority"]

  7. CHECK confidence threshold:
     IF intent.confidence < 80 AND governance_decision == "AUTO_APPROVE":
       SET governance_decision = "REQUIRE_HUMAN"
       SET reason = "LOW_CONFIDENCE"

  8. CHECK delegation:
     IF principal is a delegate AND risk_tier.severity > delegation.risk_ceiling.severity:
       SET governance_decision = "REQUIRE_HUMAN"
       SET reason = "EXCEEDS_DELEGATION_CEILING"

  9. RETURN {
       governance_decision,
       risk_tier,
       matched_class: matched_class.class_id or "default",
       approval_requirement: policy.approval_requirements[governance_decision],
       approval_ttl: policy.expiration_rules[risk_tier],
       checks: [...all checks performed],
       policy_version: policy.policy_version,
       policy_hash: policy.policy_hash
     }
```

---

## 11. Governance Hash

The governance evaluation result is hashed and included in the receipt as `governance_hash`. This proves that the governance decision was computed from a specific policy version and a specific intent.

```
governance_hash = SHA-256(canonical_json({
  intent_hash: intent.intent_hash,
  policy_hash: policy.policy_hash,
  policy_version: policy.policy_version,
  governance_decision: result.governance_decision,
  risk_tier: result.risk_tier,
  matched_class: result.matched_class,
  timestamp: evaluation_timestamp
}))
```

The `governance_hash` is part of the 5-hash chain defined in Receipt Specification v2.1:

```
intent_hash → governance_hash → authorization_hash → execution_hash → receipt_hash
```

---

## 12. JSON Schema

The complete JSON Schema for policy documents is provided below for programmatic validation.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://rio-protocol.org/spec/policy/v2",
  "title": "RIO Policy Schema v2.0",
  "type": "object",
  "required": [
    "policy_version", "policy_id", "policy_hash", "status",
    "scope", "risk_tiers", "action_classes", "approval_requirements"
  ],
  "properties": {
    "policy_version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    },
    "policy_id": {
      "type": "string",
      "format": "uuid"
    },
    "policy_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "previous_policy_hash": {
      "type": ["string", "null"],
      "pattern": "^[0-9a-f]{64}$"
    },
    "created_at": {
      "type": "string",
      "format": "date-time"
    },
    "created_by": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": ["active", "draft", "superseded", "revoked"]
    },
    "scope": {
      "type": "object",
      "required": ["agents", "environments", "systems"],
      "properties": {
        "agents": { "type": "array", "items": { "type": "string" } },
        "environments": { "type": "array", "items": { "type": "string" } },
        "systems": { "type": "array", "items": { "type": "string" } }
      }
    },
    "risk_tiers": {
      "type": "object",
      "patternProperties": {
        "^[A-Z_]+$": {
          "type": "object",
          "required": ["severity", "description"],
          "properties": {
            "severity": { "type": "integer", "minimum": 0, "maximum": 10 },
            "description": { "type": "string" },
            "examples": { "type": "array", "items": { "type": "string" } }
          }
        }
      }
    },
    "action_classes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["class_id", "pattern", "risk_tier", "governance_decision"],
        "properties": {
          "class_id": { "type": "string" },
          "pattern": { "type": "string" },
          "conditions": { "type": "object" },
          "risk_tier": { "type": "string" },
          "governance_decision": {
            "type": "string",
            "enum": ["AUTO_APPROVE", "REQUIRE_HUMAN", "REQUIRE_QUORUM", "REQUIRE_UNANIMOUS", "AUTO_DENY"]
          },
          "description": { "type": "string" }
        }
      }
    },
    "approval_requirements": {
      "type": "object",
      "patternProperties": {
        "^[A-Z_]+$": {
          "type": "object",
          "required": ["approvals_required"],
          "properties": {
            "approvals_required": { "type": "integer" },
            "quorum_size": { "type": "integer" },
            "required_roles": { "type": "array", "items": { "type": "string" } },
            "description": { "type": "string" }
          }
        }
      }
    }
  }
}
```

---

## 13. Migration from policy-v1.0.json

The existing `policy-v1.0.json` maps to the new schema as follows:

| v1 Field | v2 Equivalent | Notes |
|---|---|---|
| `policy_version: "1.0"` | `policy_version: "2.0.0"` | Semantic versioning |
| `owner` | `created_by: "I-1"` | References principal_id |
| `core_invariants` | Moved to `CONSTITUTION.md` | Invariants are constitutional, not policy |
| `operational_protocols.policy_object.states` | `action_classes[].governance_decision` | Declarative per action class |
| `operational_protocols.informed_consent_gate` | `approval_requirements.REQUIRE_HUMAN` | Formalized |
| `operational_protocols.ambiguity_scoring` | `action_classes[].conditions.confidence.min` | Per-class threshold |
| `allowed_actions.AUTO_APPROVE` | Action classes with `governance_decision: "AUTO_APPROVE"` | Pattern-based |
| `allowed_actions.REQUIRE_HUMAN` | Action classes with `governance_decision: "REQUIRE_HUMAN"` | Pattern-based |
| `allowed_actions.AUTO_DENY` | Action classes with `governance_decision: "AUTO_DENY"` | Pattern-based |
| `ledger_settings` | Moved to `STORAGE_ARCHITECTURE_SPEC.md` | Separate concern |

The migration is a one-time operation. The new policy document is created, hashed, signed by the root authority, and written to the ledger as the genesis policy (v2.0.0) with `previous_policy_hash: null`.
