# Telegram as RIO Control Plane Channel — Investigation

## Summary

Telegram Bot API is a strong fit for RIO's approval workflow. The inline keyboard feature maps directly to the APPROVE/REJECT decision boundary, and the `node-telegram-bot-api` npm package (v0.67.0) provides a mature Node.js integration.

## Architecture Fit

| RIO Concept | Telegram Feature |
|---|---|
| Intent notification | `sendMessage` with formatted intent details |
| Approve/Reject decision | `InlineKeyboardMarkup` with callback buttons |
| Human auth boundary | `callback_query` event with `from.id` verification |
| Receipt confirmation | Follow-up message with receipt hash + ledger link |
| Kill switch | `/kill` command handler |
| Status check | `/status` command handler |

## How It Would Work

1. **New HIGH/MEDIUM intent created** → Bot sends Telegram message to Brian with intent details + inline keyboard: `[APPROVE] [REJECT]`
2. **Brian taps APPROVE** → Bot receives `callback_query`, verifies `from.id` matches registered Telegram user, calls `proxy.approve` tRPC mutation
3. **Execution completes** → Bot sends receipt confirmation with hash
4. **Kill switch** → `/kill` command triggers `proxy.kill` mutation

## Key Technical Details

- **Package**: `node-telegram-bot-api` (npm, v0.67.0, well-maintained)
- **Bot creation**: Via @BotFather on Telegram (Brian already connected to @MANUS_AI_AGENT_BOT)
- **Webhook vs Polling**: Webhook mode preferred for production (Manus hosting supports HTTPS)
- **Identity binding**: Telegram `from.id` (numeric, immutable) maps to `proxy_users.userId`
- **Message format**: Markdown v2 supported for formatted intent details

## Required Secrets

| Secret | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather for the RIO bot |
| `TELEGRAM_CHAT_ID` | Brian's Telegram chat ID for direct messages |

## Implementation Plan (When Ready)

1. Create RIO bot via @BotFather → get bot token
2. Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` as secrets
3. Install `node-telegram-bot-api` package
4. Create `server/telegram.ts` — bot initialization, message handlers, inline keyboard callbacks
5. Wire into intent creation flow: when HIGH/MEDIUM intent created, send Telegram notification
6. Wire callback handler: APPROVE/REJECT buttons call existing tRPC mutations
7. Wire receipt notifications: after execution, send receipt summary
8. Add `/status` and `/kill` command handlers

## Blockers

- Need Brian to create a dedicated RIO bot via @BotFather (separate from @MANUS_AI_AGENT_BOT)
- Need Brian's Telegram chat ID for direct message delivery
- Webhook URL needs to be configured after bot creation

## Risk Assessment

- **LOW risk**: Telegram is read-only notification + approval channel, not an execution path
- The bot cannot execute anything — it only triggers the same tRPC mutations that the web UI uses
- All governance rules (preflight checks, approval binding, hash verification) still apply
- Telegram identity (`from.id`) provides additional authentication factor beyond web session

## Recommendation

**Proceed when Brian is ready.** The integration is straightforward (~200 lines of code), maps cleanly to existing architecture, and adds a mobile-native approval channel that doesn't require opening the web app. The inline keyboard UX is ideal for the binary APPROVE/REJECT decision.
