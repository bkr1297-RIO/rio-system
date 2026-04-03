# RIO Internal Ops Agent — Knowledge Base

## Product Positioning

### One-Liner
"RIO makes AI agents accountable — every action gets a receipt."

### Elevator Pitch
As companies deploy AI agents that send emails, move money, delete files, and call APIs, they need a way to ensure humans stay in control. RIO provides that control layer — with cryptographic receipts that prove what happened, who approved it, and when. The receipt protocol is open and free. The governance platform that enforces human approval is licensed.

### The Two-Layer Business Model

**Layer 1: Receipt Protocol (Open, Free)**
Creates adoption and standardization. Any developer can generate and verify receipts. Goal: become the standard for AI action accountability, like HTTPS for web security.

**Layer 2: RIO Platform (Licensed)**
Governance engine, policy management, HITL enforcement, ONE command center. Companies that need enforced governance license the platform.

The funnel: developers discover receipts (free) → companies need governance (licensed).

## Build Status Summary

### What's Shipped
- ONE Command Center PWA (rio-one.manus.space)
- Receipt protocol with Ed25519 signing and SHA-256 hashing
- Hash-chained tamper-evident ledger
- Governance engine with 4-tier risk assessment
- Human approval flow with cryptographic signatures
- Policy editor (create/edit/toggle/delete custom rules)
- In-app notification center
- Bondi AI orchestrator (OpenAI + Claude routing)
- Execution gateway (email, search, SMS, Drive connectors)
- Kill switch (emergency stop)
- 298+ passing tests

### What's In Progress
- Google Drive reorganization (Jordan)
- Repo restructuring and packaging (Romney)
- Agent skills (this skill set)

### What's Planned (Not Yet Built)
- Protocol Packs (domain-specific policy profiles)
- Learning Loop feedback (learning events improving future decisions)
- Witness service (independent verification network)
- Blockchain anchoring (timestamping receipts)
- Multi-tenant support
- npm/PyPI package publishing
- Docker quickstart

## Operational Patterns

### How Brian Works
- Prefers compressed, actionable information over long documents
- Thinks in terms of "smallest viable action" — prove the concept works, then expand
- Uses multiple AI agents in parallel, acts as intermediary between them
- Communicates via voice (transcribed), text, and pasted documents
- Prefers Telegram and Messenger for real-time coordination
- Values honest status reports — what's done, what's not, what's blocked

### Sprint Cadence
- No formal sprint schedule yet — work is driven by conversations and priorities
- Brian assigns work to agents via direct messages
- Progress is tracked via Google Drive (manus-sync.json) and todo.md in the ONE project
- Agents communicate through Brian, not directly with each other

### Document Management
- Google Drive is the source of truth for documentation
- GitHub repos are the source of truth for code
- ONE app database is the source of truth for runtime data
- When in doubt about where something lives, check Google Drive `One/root/` first

### Key Contacts and Roles
- Brian — founder, authority, decision maker
- Manny — ONE builder agent (Manus)
- Jordan — Google Drive librarian agent
- Romney — GitHub/packaging agent

## Common Tasks

### Writing a Proposal
1. Read the prospect's context (what they do, what AI they use)
2. Map their needs to RIO capabilities
3. Draft using the proposal template in SKILL.md
4. Include specific implementation timeline
5. Leave pricing blank for Brian
6. Flag any capabilities that aren't built yet

### Planning a Sprint
1. Check current status: Google Drive `RIO_IMPLEMENTATION_STATUS.md`
2. Check what's in progress: `manus-sync.json`
3. Identify highest-priority unbuilt items
4. Assign to appropriate agents based on territory
5. Write sprint doc using template
6. Share with Brian for approval

### Drafting Communications
1. Understand the audience (prospect, partner, internal)
2. Write in Brian's voice — direct, no jargon
3. Include context (why writing), body (what to communicate), CTA (what to do next)
4. Flag anything Brian should customize before sending
5. Keep it short — Brian can always expand

### Updating Documentation
1. Read the current version on Google Drive
2. Make changes with clear rationale
3. Note what changed and why at the top of the document
4. If the change affects other agents, flag it for Brian to relay
