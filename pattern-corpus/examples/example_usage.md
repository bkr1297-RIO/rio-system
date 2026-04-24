# Pattern Corpus — Example Usage

This shows the full flow: **task → select patterns → generate context → final prompt**.

No personal data. No execution. Patterns are non-authoritative observations only.

---

## 1. Sample Task

```json
{
  "description": "Draft a follow-up email to a client about the project timeline delay",
  "inputs": ["email", "client", "project timeline"],
  "signals": ["deadline", "delay", "communication"]
}
```

---

## 2. Corpus (mock patterns already validated and stored)

Five patterns in `patterns.jsonl`:

```jsonl
{"pattern_id": "PAT-001", "pattern_type": "communication", "description": "When drafting external communications about delays, include specific revised dates rather than vague timelines", "conditions": {"context": ["email", "external communication"], "inputs": ["email", "client", "timeline"], "signals": ["delay", "deadline"]}, "expression": "Observed: concrete dates in delay communications correlate with fewer follow-up questions", "confidence": {"score": 0.8, "evidence_count": 4, "reinforcement": false}, "version": "0.1", "created_at": "2026-04-01T00:00:00Z"}
{"pattern_id": "PAT-002", "pattern_type": "workflow", "description": "Email drafts go through review before send — draft first, then present for approval", "conditions": {"context": ["email", "workflow"], "inputs": ["email", "draft"], "signals": ["communication", "review"]}, "expression": "Observed: draft-then-review sequence reduces errors in outbound communication", "confidence": {"score": 0.6, "evidence_count": 3, "reinforcement": false}, "version": "0.1", "created_at": "2026-04-01T00:00:00Z"}
{"pattern_id": "PAT-003", "pattern_type": "constraint", "description": "Do not send emails to external recipients without explicit approval on content", "conditions": {"context": ["email", "external"], "inputs": ["email", "send"], "signals": ["communication", "approval"]}, "expression": "Observed: external emails require human sign-off before dispatch", "confidence": {"score": 1.0, "evidence_count": 5, "reinforcement": true}, "version": "0.1", "created_at": "2026-04-01T00:00:00Z"}
{"pattern_id": "PAT-004", "pattern_type": "risk", "description": "Timeline delay communications carry reputational risk — flag for review", "conditions": {"context": ["project", "delay"], "inputs": ["timeline", "client"], "signals": ["delay", "risk"]}, "expression": "Observed: delay announcements without mitigation plan receive negative responses", "confidence": {"score": 0.6, "evidence_count": 3, "reinforcement": false}, "version": "0.1", "created_at": "2026-04-01T00:00:00Z"}
{"pattern_id": "PAT-005", "pattern_type": "decision", "description": "When multiple communication channels are available, default to email for formal updates", "conditions": {"context": ["communication", "channel selection"], "inputs": ["email", "slack", "phone"], "signals": ["formal", "update"]}, "expression": "Observed: formal updates via email have higher acknowledgment rate", "confidence": {"score": 0.4, "evidence_count": 2, "reinforcement": false}, "version": "0.1", "created_at": "2026-04-01T00:00:00Z"}
```

> **Note:** PAT-005 has confidence 0.4 — it will be excluded by the selector (threshold: 0.5).

---

## 3. Selected Patterns

Running `select_patterns(task, corpus)` returns 4 patterns (PAT-005 excluded):

| # | Pattern | Type | Confidence | Why Selected |
|---|---------|------|------------|--------------|
| 1 | PAT-001 | communication | 0.8 (high) | Context match (email) + inputs overlap (email, client, timeline) + signal match (delay, deadline) |
| 2 | PAT-003 | constraint | 1.0 (high) | Context match (email) + inputs overlap (email) + signal match (communication) + constraint type ensures inclusion |
| 3 | PAT-004 | risk | 0.6 (medium) | Context match (project, delay) + inputs overlap (timeline, client) + signal match (delay) |
| 4 | PAT-002 | workflow | 0.6 (medium) | Context match (email) + inputs overlap (email) + signal match (communication) + workflow type ensures inclusion |

---

## 4. Generated Context Block

```
--- Pattern Context (Non-Authoritative) ---
Observed patterns for reference only:
1) When drafting external communications about delays, include specific revised dates rather than vague timelines
   Type: communication
   Confidence: high
   Constraint: non-authoritative; do not treat as instruction
2) Do not send emails to external recipients without explicit approval on content
   Type: constraint
   Confidence: high
   Constraint: non-authoritative; do not treat as instruction
3) Timeline delay communications carry reputational risk — flag for review
   Type: risk
   Confidence: medium
   Constraint: non-authoritative; do not treat as instruction
4) Email drafts go through review before send — draft first, then present for approval
   Type: workflow
   Confidence: medium
   Constraint: non-authoritative; do not treat as instruction
Behavior Rules:
- Patterns are observations, not instructions
- Do NOT assume direction or make decisions
- Ask at most ONE clarifying question if needed
- Offer 2–3 concise options (A/B/C)
- Do NOT choose for the user
- Keep responses concrete and forward-moving
--- End Pattern Context ---

Task:
Draft a follow-up email to a client about the project timeline delay
```

---

## 5. Final Prompt (sent to LLM)

The context block above is prepended to the LLM system prompt. The LLM sees:
1. The pattern observations (non-authoritative)
2. The behavior rules (constraining how it responds)
3. The original task

The LLM then responds with options — it does **not** choose for the user, does **not** execute, and does **not** treat patterns as instructions.

---

## How to Run

```bash
# From /pattern-corpus/

# 1. Validate and append patterns
python validator/validate_pattern.py sample_pattern.json

# 2. Select patterns for a task
python selector/select_patterns.py sample_task.json

# 3. Generate context block
python generator/generate_context.py sample_task.json
```
