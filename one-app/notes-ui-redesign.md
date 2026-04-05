# UI Redesign Notes

## Current State (from Brian's screenshots + server screenshot)
- Server is running, Bondi rename complete, nav shows BONDI/STATUS/INTENT/LEDGER/LEARNING/RECOVERY/SIGNERS
- Dashboard shows: Three-Power sigil, "No Local Keys" recovery banner, Proxy Status/Ledger Health/Local State cards, Identity section, Recent Intents
- All monospace/terminal aesthetic, engineering-heavy language

## Bugs to Fix
1. **Crash error on Signers page** — "An unexpected error occurred" with stack trace. The ErrorBoundary.tsx shows raw stack traces. Need to fix the underlying error AND make ErrorBoundary user-friendly.
2. **Access Denied on Signers page** — The page gates on `status.data?.isOwner`. If the proxy status query is slow or returns undefined briefly, it may flash Access Denied.

## Brian's Feedback
- "Looks like 1998" — terminal/monospace aesthetic is wrong
- "Not intuitive" — doesn't know what to do
- "For engineers not people" — hashes, ledger entries, intent IDs visible
- "Create Intent" page with SELECT TOOL dropdown is confusing
- Doesn't understand what "Audit Ledger" means
- Doesn't know what the dashboard is for

## Redesign Plan
1. Bondi (chat) becomes the home page — redirect / to /bondi
2. Simple approval notifications — "Bondi wants to send an email. Approve?"
3. Hide engineering pages behind a "System" or "Advanced" menu
4. Remove Create Intent from main nav
5. Clean, modern design — not monospace
6. Fix ErrorBoundary to show friendly message, not stack trace
