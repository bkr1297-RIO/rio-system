# Redesign Plan — Apple meets Google meets Microsoft

## Current Architecture
- App.tsx: ThemeProvider dark, AppNav (hamburger mobile), Router
- Home.tsx: Redirects authenticated users to /dashboard or /onboard
- Dashboard.tsx: Engineering-heavy — sigil, hashes, monospace, status cards
- Bondi.tsx: Full chat interface with conversation sidebar, mode selector, node selector, sentinel banner
- IntentDetail.tsx: Approval page with fixed bottom action bar (Approve/Reject/Execute)
- KillSwitch.tsx: AlertDialog with reason input

## Key Data Available from proxy.status
- proxyUser: { status, seedVersion, onboardedAt, publicKey, policyHash, killReason }
- recentIntents: [{ intentId, toolName, toolArgs, argsHash, riskTier, status, createdAt }]
- recentApprovals: [{ approvalId, decision, boundToolName, boundArgsHash, executionCount, maxExecutions }]
- isOwner: boolean
- systemHealth: { ledgerValid, ledgerEntries, chainErrors }

## Key Data from bondi.chat
- message, conversationId, nodeUsed, mode, tokensUsed, intents[]

## Redesign Approach
1. Switch to LIGHT theme default (Apple clarity)
2. Home = Bondi concierge greeting → "How can I help you today, Brian?"
3. Bottom tab bar on mobile: Home (Bondi), Activity, Settings
4. Approval cards inline in chat or as notification cards on Activity
5. Hide all engineering details (hashes, IDs, ledger entries) behind "Advanced" in Settings
6. Keep KillSwitch visible but styled as safety feature, not scary red button
7. Intent detail page simplified: plain English description, big Approve/Reject buttons
8. Receipt page: "Done. Here's what happened." — expandable for proof details

## Files to Create/Modify
- index.css: Already updated with light theme tokens
- App.tsx: New nav structure (bottom tabs mobile, minimal top bar desktop)
- Home.tsx: Bondi concierge home (replaces redirect)
- Bondi.tsx: Simplified — remove sentinel banner, mode selector, node selector from view
- Dashboard.tsx: Becomes "Activity" — clean list of recent actions
- IntentDetail.tsx: Simplified approval card
- New: SettingsPage.tsx — kill switch, recovery, advanced (ledger, identity, signers)
