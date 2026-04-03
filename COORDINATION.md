# Coordination

This file explains how agents coordinate through the repo. Read this first.

---

## How We Work Together

This repo is the shared workspace for the RIO multi-agent team. All coordination happens through structured documents, not direct agent-to-agent communication. Brian is the intermediary and final authority.

Every agent should know these files and use them:

| File | Purpose | When to use |
|------|---------|-------------|
| [docs/STATUS.md](docs/STATUS.md) | Current system state | Update when you complete work, hit a blocker, or start something new |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Build plan by phase | Reference before starting work to confirm priorities |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log | Record decisions so they are not re-argued later |
| [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) | Decision queue | Post questions that need Brian's decision or team input |
| [docs/TEAM.md](docs/TEAM.md) | Team roster and roles | Reference to understand who does what |
| [docs/WHO_OWNS_WHAT.md](docs/WHO_OWNS_WHAT.md) | Ownership map | Check before working on something to confirm it is yours |
| [docs/HOW_WE_WORK.md](docs/HOW_WE_WORK.md) | Operating rules | Read once, follow always |

---

## Rules

1. **Read before you build.** Check STATUS.md and WHO_OWNS_WHAT.md before starting any work.
2. **Update when you finish.** After completing work, update STATUS.md with what changed.
3. **Ask before you assume.** If something is unclear, add it to OPEN_QUESTIONS.md. Do not guess.
4. **Record decisions.** If Brian makes a call, add it to DECISIONS.md so it sticks.
5. **Stay in your lane.** WHO_OWNS_WHAT.md defines boundaries. If it is not yours, do not touch it without coordination.
6. **No direct agent communication.** All coordination flows through these documents and through Brian.

---

## Agent Skills

Reusable skill packs live in `skills/` at the repo root. Each skill teaches a Manus agent how to operate in a specific role. Skills can be imported into Manus via the settings UI.

| Skill | Role | What It Does |
|-------|------|--------------|
| `skills/rio-one-builder/` | Chief Builder | Builds and extends the ONE Command Center app |
| `skills/rio-solutions-architect/` | Solutions Architect | Explains architecture, deployment, and integration to prospects |
| `skills/rio-developer/` | Developer Relations | Helps engineers implement receipts and build integrations |
| `skills/rio-compliance/` | Compliance | Maps RIO to regulations, explains audit and governance |
| `skills/rio-internal-ops/` | Internal Operations | Proposals, planning, communications, company operations |

Skills read from this repo and from Google Drive. When docs here or on Drive are updated, agents using these skills automatically get the updated knowledge.

---

## Knowledge Sources

The team has two knowledge bases:

1. **This repo** (`rio-system`) — Code, specs, coordination docs, agent skills, architecture docs. This is the engineering source of truth.

2. **Google Drive** (`RIO/` and `One/root/`) — Architecture maps, implementation status, builder map, policy documents, corpus files. This is the knowledge and documentation source of truth.

Both sources should stay in sync. When something changes in one, the corresponding doc in the other should be updated. Jordan owns the Drive structure; Romney owns the repo structure.

---

## Quick Start for New Agents

1. Read [docs/TEAM.md](docs/TEAM.md) to understand the team
2. Read [docs/WHO_OWNS_WHAT.md](docs/WHO_OWNS_WHAT.md) to understand ownership
3. Read [docs/HOW_WE_WORK.md](docs/HOW_WE_WORK.md) to understand the rules
4. Read [docs/STATUS.md](docs/STATUS.md) to understand current state
5. Read [docs/ROADMAP.md](docs/ROADMAP.md) to understand priorities
6. Check [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) for anything relevant to your work
7. If you have a skill assigned, read it from `skills/` before starting work
8. Start building
