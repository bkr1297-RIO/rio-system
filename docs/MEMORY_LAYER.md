# Memory Layer (MANTIS)

> **RIO converts AI actions into human-authorized, policy-controlled, cryptographically verifiable transactions.**
> MANTIS records the full history of how that system was built.

---

## What This Is

MANTIS is the Memory Layer of the RIO / ONE system. It is a structured corpus of 120 conversations spanning February 12 to April 7, 2026 — the complete build history of RIO from first concept to working governed execution.

**File:** `/data/conversations_export_2026-04-07.json`

The dataset contains:

- 120 conversation records (id, URL, date, title, summary)
- Key concepts index (22 entries)
- Timeline milestones (12 entries)
- Technical stack reference
- Personal context of the system author

---

## What It Is Used For

**Retrieval.** Any agent or tool can query this corpus to find prior decisions, architectural rationale, or context for current work. If a question has been answered before, the answer is here.

**Grounding.** When agents produce work, this corpus provides the provenance trail. Claims about the system can be traced to specific conversations where the idea originated, was debated, or was decided.

**Audit.** The corpus is a timestamped record of what was discussed and when. It supports verification of the development timeline and decision history.

---

## What It Is NOT Used For

**MANTIS has no authority.** It cannot approve, deny, or execute any action. It is read-only context.

**MANTIS is not training data.** It is not used to fine-tune, train, or modify any model. It is queryable reference material.

**MANTIS does not make decisions.** No agent may cite MANTIS as authorization for an action. Governance decisions flow through the Gateway and policy engine — never through memory.

---

## How It Relates to the System

```
┌─────────────────────────────────────────────────┐
│                    RIO System                    │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  MANTIS  │  │ GATEWAY  │  │    LEDGER    │   │
│  │  Memory  │  │Governance│  │    Proof     │   │
│  │          │  │          │  │              │   │
│  │ Records  │  │ Enforces │  │  Verifies    │   │
│  │ context  │  │ policy   │  │  execution   │   │
│  │          │  │          │  │              │   │
│  │ READ     │  │ DECIDE   │  │  PROVE       │   │
│  │ ONLY     │  │ + ACT    │  │              │   │
│  └──────────┘  └──────────┘  └──────────────┘   │
│       ↑              ↑              ↑            │
│       │              │              │            │
│   "What was      "What is       "What was       │
│    discussed"    allowed"       done"            │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │              ONE (Interface)              │    │
│  │     Human control surface for all three   │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

| Layer | Function | Authority | Data |
|-------|----------|-----------|------|
| MANTIS (Memory) | Context, retrieval, audit trail | None — read only | Conversations, decisions, rationale |
| Gateway (Governance) | Policy enforcement, execution control | Full — decides and acts | Intents, approvals, tokens, receipts |
| Ledger (Proof) | Cryptographic verification | None — append only | Hashes, signatures, chain entries |
| ONE (Interface) | Human control surface | Display only — human decides | Views into all three layers |

**The boundary is absolute:** Memory informs. Governance decides. Ledger proves. ONE displays. No layer crosses into another's authority.

---

## Corpus Structure

The JSON file contains these top-level keys:

| Key | Contents |
|-----|----------|
| `export_metadata` | Export date, source, scope, conversation count (120), date range |
| `conversations` | Array of 120 records: id, URL, updated_at, title, summary |
| `key_concepts` | 22 named concepts with definitions (RIO Framework, Authority Drift, Triadic Architecture, etc.) |
| `timeline_milestones` | 12 dated milestones from Jan 2025 through Apr 2026 |
| `technical_stack` | Platforms, languages, cryptography, frameworks, protocols, governance primitives |
| `personal_context` | Author background and working context |

---

## Rules for Use

1. **Do not modify the JSON.** It is a historical record. Append new exports as separate files.
2. **Do not cite MANTIS as authority.** "The memory layer says X" is context, not permission.
3. **Do not embed in prompts as instruction.** It is reference material, not a system prompt.
4. **Do not extract personal context for external use.** The `personal_context` section exists for internal grounding only.

---

*COS — 2026-04-07*
