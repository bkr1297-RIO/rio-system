# Multi-Agent Coordination

## Table of Contents
1. Agent Roles
2. Onboarding a New Agent
3. Communication Protocol
4. Google Drive Structure

## 1. Agent Roles

Brian (the owner) coordinates three parallel agents. Each has a defined territory.

**ONE Builder (this agent):**
- Owns: live PWA at rio-one.manus.space, database, tRPC routes, UI
- Tools: webdev_* tools, browser, shell
- Integrations: GitHub (bkr1297-RIO/rio-system), Google Drive (read-only for context)

**Knowledge/Drive Agent ("Jordan"):**
- Owns: Google Drive folder structure, documentation, canonical specs
- Tools: gws CLI, rclone
- Rule: never touches code, database, or live app

**Protocol/Packaging Agent ("Romney"):**
- Owns: GitHub repo, npm package, Docker quickstart, PyPI package
- Tools: gh CLI, npm, Docker
- Rule: never touches live app or Google Drive structure

## 2. Onboarding a New Agent

Paste this to any new Manus agent:

```
Read these files from Google Drive before doing anything:
1. One/root/RIO_BUILDER_MAP.md — what RIO is and how it works
2. One/root/RIO_IMPLEMENTATION_STATUS.md — what's built vs not
3. One/root/RIO_MASTER_ARCHITECTURE_MAP.md — full architecture

Then read One/root/manus-sync.json for current coordination state.

Your territory is [SPECIFY]. Do not touch [OTHER TERRITORIES].
```

## 3. Communication Protocol

Agents cannot talk to each other directly. Brian relays between them.

**When ONE Builder needs something from Drive Agent:**
1. Tell Brian what's needed
2. Brian tells Drive Agent
3. Drive Agent updates Google Drive
4. Brian confirms to ONE Builder

**When ONE Builder ships a feature:**
1. Save checkpoint + publish
2. Tell Brian what changed
3. Brian tells Drive Agent to update RIO_IMPLEMENTATION_STATUS.md

## 4. Google Drive Structure

```
RIO/
  01_ARCHITECTURE/     — system design docs
  02_PROTOCOL_PACKS/   — domain-specific policies (future)
  03_AUDIT/            — conformance audits, hardening
  04_LEARNING/         — learning rules (future)
  05_MEMORY/           — MANTIS schema docs (future)
  06_PROOF/            — ledger seeds, receipt samples
  07_ORCHESTRATOR/     — Bondi routing docs (future)
  08_CORPUS/           — master seed, policies, agent protocols

One/root/              — entry point for all agents
  RIO_BUILDER_MAP.md
  RIO_IMPLEMENTATION_STATUS.md
  RIO_MASTER_ARCHITECTURE_MAP.md
  manus-sync.json
  index.json
```
