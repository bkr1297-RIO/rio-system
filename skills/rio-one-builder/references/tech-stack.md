# ONE Command Center Tech Stack

## Table of Contents
1. Stack Overview
2. Database Schema (Key Tables)
3. Server Patterns
4. Frontend Patterns
5. Governance Engine Flow

## 1. Stack Overview

```
Frontend:  React 19 + Tailwind 4 + shadcn/ui + wouter
Backend:   Express 4 + tRPC 11 + Superjson
Database:  TiDB (MySQL-compatible) + Drizzle ORM
Auth:      Manus OAuth (session cookie)
LLM:      OpenAI + Claude via invokeLLM() helper
Storage:  S3 via storagePut/storageGet helpers
Alerts:   Telegram bot + in-app notifications
Signing:  Ed25519 (TweetNaCl)
PWA:      manifest.json + service worker
```

## 2. Database Schema (Key Tables)

```
proxy_users     — user profile, Ed25519 keypair, OpenAI/Anthropic keys
intents         — proposed actions (tool, args, risk tier, status lifecycle)
executions      — execution results linked to intents
receipts        — cryptographic proof (SHA-256 hash, Ed25519 signature)
ledger_entries  — hash-chained audit log (prev_hash → hash)
conversations   — Bondi chat sessions
chat_messages   — individual messages within conversations
learning_events — system learning records (outcome, feedback)
policy_rules    — user-defined governance rules (tool pattern, risk override)
notifications   — in-app notification queue
system_components — system health tracking (gateway, ledger, connectors)
signer_keys     — multi-signer key management
```

## 3. Server Patterns

**Router structure** (`server/routers.ts`):
- `auth.*` — login/logout/me
- `proxy.*` — status, createIntent, approve, reject, execute, killSwitch
- `bondi.*` — chat, conversations, streaming
- `ledger.*` — entries, verify chain
- `learning.*` — events, summary, feedback
- `policyRules.*` — CRUD for custom governance rules
- `notifications.*` — list, unreadCount, markRead, markAllRead
- `system.*` — components, notifyOwner

**Key patterns:**
- `protectedProcedure` for authenticated routes
- `publicProcedure` for unauthenticated routes
- All mutations log to ledger via `appendLedger()`
- Risk assessment checks custom policy rules before built-in rules
- Receipts use Ed25519 signing + SHA-256 hashing

## 4. Frontend Patterns

**Navigation:** Desktop top bar + mobile bottom tab bar (6 tabs: Home, Approvals, Connect, Activity, Policies, System). Notification bell floating above mobile tabs.

**Key pages:**
- `/` and `/bondi` — Bondi chat (orchestrator interface)
- `/approvals` — action approval queue (approve/deny with signing)
- `/connections` — connector management (email, search, SMS)
- `/activity` — intent history + audit ledger tabs
- `/policies` — built-in rules + editable custom rules
- `/system` — system control (components, kill switch, settings)
- `/receipt/:id` — individual receipt with client-side verification
- `/ledger` — full hash-chain viewer

**Auth pattern:** `useAuth()` hook → `getLoginUrl()` for OAuth redirect. All pages check `isAuthenticated` and show sign-in button if not.

## 5. Governance Engine Flow

```
User speaks to Bondi
  → Bondi plans action (LLM)
  → createIntent() — risk assessment
    → Check custom policy rules (toolPattern match)
    → Check built-in rules (tool → risk tier mapping)
    → If HIGH or custom rule: PENDING_APPROVAL
    → If LOW + no override: AUTO_APPROVED
  → Human approves (Ed25519 signature)
  → execute() — run the tool
  → Generate receipt (SHA-256 hash of all fields)
  → Sign receipt (Ed25519)
  → Append to ledger (hash chain: prev_hash → hash)
  → Create notification
  → Send Telegram alert
```

**Kill switch:** Immediately sets all PENDING intents to REJECTED, disables gateway, logs to ledger. Requires manual re-enable.
