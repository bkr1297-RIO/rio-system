# Screenshot Findings - Redesign Progress

## Desktop View (current state)
- Top nav bar: RIO logo + "Bondi" (active, highlighted), "Activity0", "Settings" — clean
- Bondi page still shows the old engineering UI:
  - Sentinel banner (green bar with ID: OK, Policy: OK, Ctx: OK) — needs to be hidden
  - Mode selector (REFLECT, COMPUTE, etc.) — needs to be hidden
  - Node selector (Gemini Flash, MANUS_FORGE) — needs to be hidden
  - Learning stats (54 learnings +54) — needs to be hidden
  - Conversation sidebar on left — needs to be simplified or hidden
  - Empty state says "BONDI" with shield icon + monospace font — needs to be warm/friendly
  - Prompt suggestions are good but need to be more natural
  - Input area at bottom is clean

## What needs to change on Bondi page:
1. Remove Sentinel banner (move to Settings/Advanced)
2. Remove mode selector (auto-detect mode)
3. Remove node selector (auto-select)
4. Remove learning stats (move to Settings/Learning)
5. Simplify conversation sidebar or make it a drawer
6. Change empty state to warm greeting: "Good evening, Brian. How can I help you today?"
7. Change monospace font to the new Inter/system font
8. Make prompt suggestions more natural and user-friendly
