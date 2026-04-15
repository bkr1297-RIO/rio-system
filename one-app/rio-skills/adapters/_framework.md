# RIO Adapter Framework

**Version:** 1.0.0
**invariants_ref:** "_invariants.md"
**invariants_version:** "1.0.0"

---

## Purpose

Adapters translate RIO skills into platform-specific formats. They convert the canonical skill structure into prompts, system messages, or configuration that each platform understands. Adapters NEVER change meaning. They change format.

---

## The Adapter Contract

Every adapter MUST:

1. **Include governance_hash** — proof that governance was loaded
2. **Include invariants_ref** — reference to the canonical invariants document
3. **Include invariants_version** — version of invariants being enforced
4. **Preserve all constraints** — no constraint may be weakened, removed, or reinterpreted
5. **Preserve all capabilities** — no capability may be added that the skill does not grant
6. **Preserve all boundaries** — role boundaries must be identical in adapted output

Every adapter MUST NOT:

1. Add authority not present in the source skill
2. Remove constraints present in the source skill
3. Reinterpret ambiguous constraints in favor of permissiveness
4. Translate "NEVER" as "usually not" or "avoid"
5. Omit error codes or halt conditions

---

## Adapter Output Structure

Every adapted skill MUST produce output containing these sections:

```
1. IDENTITY
   - Role name
   - Version
   - Governance hash
   - Invariants reference and version

2. CONSTRAINTS
   - All constraints from governance skill
   - All constraints from role skill
   - Platform-specific constraint formatting

3. CAPABILITIES
   - Allowed actions (from role skill)
   - Denied actions (explicit)
   - Boundary definitions

4. BEHAVIOR
   - What the role does (from role skill)
   - What the role does NOT do (from role skill)
   - Drift detection rules

5. ERROR HANDLING
   - All ERR_FATAL conditions
   - All FLAG_DRIFT conditions
   - Halt behavior
```

---

## Validation

An adapted skill is valid if and only if:

1. `governance_hash` matches the hash of `governance/skill.md`
2. `invariants_version` matches `_invariants.md` version
3. Every constraint from the source skill appears in the adapted output
4. Every "NEVER" in the source appears as an absolute prohibition in the adapted output
5. Every ERR_FATAL condition is preserved
6. No new capabilities are added
7. No constraints are weakened

If any check fails → `ERR_FATAL: ADAPTER_INVALID`

---

## Platform Differences

| Platform | Format | System Prompt | Tool Use | Memory |
|---|---|---|---|---|
| Manus | Markdown skill file | Via SKILL.md | Function calling | Session-based |
| OpenAI (ChatGPT) | System message + instructions | `system` role message | Function calling / tools | Conversation history |
| Claude (Anthropic) | System prompt + XML tags | `system` parameter | Tool use | Conversation history |
| Gemini (Google) | System instruction + safety settings | `system_instruction` | Function declarations | Conversation history |

Each adapter handles these differences while preserving identical semantics.

---

## Adapter Files

| Adapter | File | Target Platform |
|---|---|---|
| Manus | `adapters/manus.md` | Manus agent (SKILL.md format) |
| OpenAI | `adapters/openai.md` | ChatGPT / OpenAI API |
| Claude | `adapters/claude.md` | Anthropic Claude |
| Gemini | `adapters/gemini.md` | Google Gemini |

---

## Translation Rules

### Absolute Prohibitions
- Source: "NEVER" → Adapted: absolute prohibition in platform format
- Source: "MUST NOT" → Adapted: absolute prohibition in platform format
- Source: "NO" (as constraint) → Adapted: absolute prohibition in platform format

### Conditional Requirements
- Source: "MUST" → Adapted: mandatory requirement in platform format
- Source: "If X then Y" → Adapted: conditional in platform format

### Error Conditions
- Source: "ERR_FATAL: X" → Adapted: halt instruction with error code
- Source: "FLAG_DRIFT" → Adapted: warning/logging instruction

### Role Boundaries
- Source: "The Builder does NOT execute" → Adapted: explicit prohibition on execution
- Source: "Only the Gateway executes" → Adapted: explicit restriction to gateway only

No softening. No hedging. No "try to avoid." The constraint is absolute or it is not a constraint.
