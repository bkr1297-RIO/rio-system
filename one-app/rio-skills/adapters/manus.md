# Manus Adapter

**Platform:** Manus
**Version:** 1.0.0
**invariants_ref:** "_invariants.md"
**invariants_version:** "1.0.0"

---

## Purpose

Translates RIO skills into the Manus agent SKILL.md format. This is the native format — Manus agents read SKILL.md files directly from the skills directory.

---

## Translation Rules

### Format
- Skills are stored as Markdown files in `/home/ubuntu/skills/{name}/SKILL.md`
- The agent reads SKILL.md on task start
- Constraints are expressed as Markdown sections with bold emphasis
- Error conditions are expressed as code blocks

### Governance Loading
```
On task start:
  1. Agent reads /home/ubuntu/skills/rio-governance/SKILL.md
  2. Agent computes governance_hash = SHA-256(file contents)
  3. Agent verifies invariants_version matches _invariants.md
  4. If any step fails → refuse all tasks
```

### Role Loading
```
After governance loads:
  1. Agent reads /home/ubuntu/skills/rio-{role}/SKILL.md
  2. Agent verifies governance_loaded == true
  3. Agent sets active_role = "{role}"
  4. Agent confirms role_count == 1
```

### Constraint Expression
Manus agents understand Markdown natively. Constraints are expressed as:
- **Bold text** for emphasis on absolute prohibitions
- Code blocks for error conditions and protocols
- Tables for capability matrices
- Blockquotes for critical rules

### Tool Restrictions
When a role skill says "Execute actions: NO", the Manus adapter translates this as:
- Do NOT use shell commands that modify external state
- Do NOT use browser tools to submit forms or make purchases
- Do NOT call APIs that produce side effects
- Only use tools for reading, analyzing, and producing proposals

---

## Tool Mapping

Manus agents use function calling. The adapter maps role capabilities to tools:

- Roles with `Can Propose: Yes` → agent may call `submit_proposal` function
- No role gets an `execute_action` function — it does not exist in the Manus adapter
- Tool descriptions must state "This does NOT execute the action"

---

## Error Handling

The adapted skill MUST include these error responses:

- `ERR_FATAL: EXECUTION_BOUNDARY` — if the agent is asked to execute an action directly
- `ERR_FATAL: ROLE_VIOLATION` — if the agent is asked to operate outside its role
- `ERR_FATAL: GOVERNANCE_NOT_LOADED` — if governance skill was not loaded first
- `FLAG_DRIFT` — if the agent detects it is drifting from its role constraints

---

## Adapted Skill Template

When deploying a RIO skill to Manus, the adapter produces:

```markdown
# RIO {Role} Agent

**governance_hash:** {computed hash}
**invariants_ref:** _invariants.md
**invariants_version:** 1.0.0
**active_role:** {role}

## Constraints
{All constraints from governance + role skill}

## Capabilities
{Capability table from role skill}
The only tool available is submit_proposal. No execution tools exist.

## Behavior
{What the role does / does not do}

## Error Handling
If asked to execute: ERR_FATAL: EXECUTION_BOUNDARY
If asked to approve: ERR_FATAL: ROLE_VIOLATION
If governance not loaded: ERR_FATAL: GOVERNANCE_NOT_LOADED
If drift detected: FLAG_DRIFT

## Drift Detection
{Self-monitoring rules}
```

---

## Validation Checklist

Before deploying an adapted skill to Manus:

- [ ] governance_hash is present and valid
- [ ] invariants_version matches _invariants.md
- [ ] All "NEVER" constraints preserved as bold prohibitions
- [ ] All ERR_FATAL conditions preserved as code blocks
- [ ] Capability table matches source skill exactly
- [ ] No new capabilities added
- [ ] No constraints weakened or removed
