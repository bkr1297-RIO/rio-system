---
name: rio-one-builder
description: Build and extend the ONE Command Center — the human control surface for the RIO governed AI system. Use when building features for the ONE PWA (rio-one.manus.space), working on the RIO governance engine, coordinating with other agents on the RIO project, or onboarding a new Manus agent to the RIO system.
---

# RIO ONE Builder

Build the ONE Command Center — a PWA that gives a human operator control over AI agent actions through governed execution with cryptographic proof.

## First Steps

1. Read `references/architecture.md` for the 8-layer stack, build phases, and agent territories
2. Read `references/tech-stack.md` for database schema, server patterns, and governance engine flow
3. If coordinating with other agents, read `references/multi-agent.md`
4. Read Google Drive `One/root/RIO_BUILDER_MAP.md` for the canonical system spec

## Build Workflow

ONE is a Manus webdev project (`rio-proxy`). Follow this loop:

```
1. Schema   → drizzle/schema.ts → pnpm drizzle-kit generate → apply SQL
2. DB layer → server/db.ts (query helpers)
3. Routes   → server/routers.ts (tRPC procedures, protectedProcedure for auth)
4. UI       → client/src/pages/*.tsx (shadcn/ui + Tailwind + trpc hooks)
5. Tests    → server/*.test.ts (vitest)
6. Ledger   → every mutation calls appendLedger() for audit trail
```

## Governance Engine Rules

Every action flows through this pipeline:

```
User → Bondi (LLM) → createIntent → risk assessment → approval → execute → receipt → ledger
```

**Risk assessment order:**
1. Check custom policy rules (`policy_rules` table, matched by `toolPattern`)
2. Fall back to built-in rules (hardcoded tool → risk tier map)
3. HIGH risk or custom `requiresApproval: true` → PENDING_APPROVAL
4. LOW risk with no override → AUTO_APPROVED

**Receipts:** SHA-256 hash of `{intentId, toolName, toolArgs, riskTier, approvalSignature, executionResult, timestamp}`. Signed with Ed25519 (TweetNaCl). Appended to hash-chained ledger.

**Kill switch:** Sets all PENDING → REJECTED, disables gateway, logs KILL_SWITCH to ledger. Manual re-enable required.

## Feature Priority (Phase 2 — ONE UI)

| # | Feature | Status |
|---|---------|--------|
| 1 | Action approval screen | Done |
| 2 | Action queue | Done |
| 3 | Receipts viewer | Done |
| 4 | Ledger viewer | Done |
| 5 | System status | Done |
| 6 | Editable policy rules | Done |
| 7 | In-app notifications | Done (polling; PWA push deferred) |
| 8 | Agent activity view | Done (basic) |

**Next priorities:**
- Protocol Packs (domain-specific policy profiles)
- Learning Loop feedback (learning_events → improve Bondi recommendations)
- Context Dynamics (session observation layer)
- Mosaic/Meta layers (cross-session patterns, self-observation)

## Key Conventions

- **Signing:** Ed25519 via TweetNaCl. Keys stored in `proxy_users` table.
- **Ledger:** Hash-chained. Each entry: `hash = SHA-256(entryId + entryType + payload + prevHash + timestamp)`.
- **Notifications:** In-app via `notifications` table + Telegram via bot API. Poll every 15s.
- **Theme:** Dark mode, navy background (#0a1628), gold/amber accents. Sacred geometry logo.
- **Mobile:** PWA with manifest.json, service worker, bottom tab bar (6 tabs).
- **Auth:** Manus OAuth. `useAuth()` hook. `getLoginUrl()` for redirect. Never hardcode domains.

## Agent Coordination

Three agents work in parallel. Brian relays between them.

| Agent | Territory | Reads From |
|-------|-----------|------------|
| ONE Builder (you) | Live app, DB, UI | Google Drive (read-only) |
| Knowledge Agent | Google Drive structure | — |
| Packaging Agent | GitHub repo, npm, Docker | Google Drive (read-only) |

After shipping a feature, tell Brian so the Knowledge Agent can update `RIO_IMPLEMENTATION_STATUS.md` on Drive.

For full coordination protocol, see `references/multi-agent.md`.

## Common Pitfalls

- **Sign-in screens must be clickable buttons** with `onClick={() => { window.location.href = getLoginUrl(); }}`. Never render plain text for sign-in prompts.
- **Every mutation needs a ledger entry.** If you add a new mutation and skip `appendLedger()`, the audit trail breaks.
- **Test mocks must include all db functions.** When adding new db helpers, update ALL test files that mock `server/db.ts` or tests will fail with missing function errors.
- **Static assets go to S3** via `manus-upload-file --webdev`, never in `client/public/` (except favicon, robots.txt, manifest.json, sw.js).
- **Custom policy rules are checked BEFORE built-in rules** in `createIntent`. Order matters.
