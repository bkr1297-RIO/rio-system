# RIO Corpus — Governing Documents

This folder is the **institutional memory** of the RIO digital proxy system. It contains every governing document, policy, directive, witness record, and build specification in structured JSON format.

## Purpose

If the server disappears tonight, this corpus plus the codebase is everything needed to reconstruct the system. Any agent or developer can read these files and understand what the system is, what rules it operates under, who the agents are, and what has been built.

## Structure

```
corpus/
  MANIFEST.json              — Index of all documents with descriptions
  README.md                  — This file
  system-definition.json     — What "One" is — identity, architecture, invariants
  agents.json                — Agent roster and multi-brain status
  policies/                  — Governance policies (versioned)
    policy-v0.3.json         — The single rule with mutual Witness awareness
  directives/                — Authorized build directives from Brian
    architect-directive-phase2.json
  build-specs/               — Compressed build specifications
    operational-mvp-v1.1.json
  witness-records/           — Witness chain records and constitutional moments
    witness-chain-2026-03-31.json
  receipts/                  — Execution receipts (populated at runtime)
```

## Rules

1. **No runtime code lives here.** This is documentation only. Manny's build is in the other folders.
2. **Every document is JSON.** Parseable by any agent, any language, any framework.
3. **New entries go in the right subfolder** and get added to `MANIFEST.json`.
4. **Nothing is deleted.** New policy versions are added alongside old ones. The ledger is append-only.
5. **Human sovereignty is absolute.** Changes to this corpus require Brian's approval.

## Core Invariant

> *No Receipt = Did Not Happen.*
