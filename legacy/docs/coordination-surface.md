# Coordination Surface — How Work Moves

**Purpose:** This replaces Brian's clipboard. All tasks, results, and approvals live here in GitHub Issues. Agents read from here. Brian approves here. No more copy-pasting between chat windows.

---

## The Rule

> **Nothing moves unless it exists in a shared artifact.**
> Not in chat. Not in memory. Not in your head.
> Only in GitHub or Drive.

---

## How It Works (5 steps)

### Step 1 — Brian posts a TASK

Go to [rio-system Issues](https://github.com/bkr1297-RIO/rio-system/issues) → **New Issue** → choose **TASK Packet**.

Fill in:
- What needs to happen
- Who should do it (manny / bondi / gemini / claude)
- How you'll know it's done

That's it. The task now exists in a shared place.

### Step 2 — Agent reads the TASK

When you open a session with an agent, instead of explaining everything, say:

> "Check rio-system Issue #[number] and do it."

Or for agents that can't see GitHub:

> "Check rio-system STATUS.json for current state. Your task is Issue #[number]: [one-line summary]."

### Step 3 — Agent posts a RESULT

The agent (or you on their behalf) creates a **RESULT Packet** issue:
- What was done
- Commit hash / artifacts
- Status (SUCCESS / PARTIAL / BLOCKED)
- What should happen next

### Step 4 — Brian approves

You review the RESULT. If it's good, create an **APPROVAL Packet** issue or just comment "APPROVED" on the RESULT issue.

### Step 5 — Close the loop

Close both the TASK and RESULT issues. The work is done. The record lives in GitHub forever.

---

## Labels (auto-applied by templates)

| Label | Meaning |
|-------|---------|
| `task` | Work proposed |
| `pending` | Waiting to be picked up |
| `result` | Work completed, needs review |
| `needs-review` | Brian should look at this |
| `approval` | Brian's decision recorded |
| `manny` | Assigned to Builder |
| `bondi` | Assigned to Strategist |
| `gemini` | Assigned to Librarian |
| `claude` | Assigned to Architect |

You can also add labels manually: `now`, `next`, `later` for priority.

---

## STATUS.json — The Shared State File

`STATUS.json` at the repo root is updated by Manny after every build. It contains:
- Current system state
- Last build info (commit, description)
- Repo status for all three repos
- Governance integrity (hash, sweep status)
- Agent status (who did what last)
- Pending tasks and blockers

**Any agent that can read GitHub can read this file directly.** No relay needed.

---

## Day-to-Day Usage

**Morning:**
1. Open [rio-system Issues](https://github.com/bkr1297-RIO/rio-system/issues)
2. Check for any open RESULT packets (agents completed work overnight or in previous sessions)
3. Approve or adjust

**When you have work to assign:**
1. Create a TASK issue
2. Open the agent's chat
3. Say: "Check Issue #X and do it"

**When an agent finishes:**
1. They give you a commit hash and summary
2. You (or they) create a RESULT issue
3. You approve or comment

**That's it.** No more explaining context. No more re-describing what another agent did. The Issues are the record.

---

## What Each Agent Sees

| Agent | Can Read GitHub? | Can Write GitHub? | How They Get Tasks |
|-------|-----------------|-------------------|-------------------|
| Manny | Yes | Yes (commits) | Reads Issues directly |
| Bondi | Yes (limited) | No | Reads Issues, Brian posts results |
| Gemini | No | No | Brian summarizes or shares STATUS.json content |
| Claude | No | No | Brian summarizes or shares STATUS.json content |

For agents that can't see GitHub, STATUS.json and the Issue text are your shorthand. Copy the Issue title + objective — not the whole conversation history.

---

## Files

| File | Purpose |
|------|---------|
| `.github/ISSUE_TEMPLATE/task-packet.yml` | TASK template |
| `.github/ISSUE_TEMPLATE/result-packet.yml` | RESULT template |
| `.github/ISSUE_TEMPLATE/approval-packet.yml` | APPROVAL template |
| `STATUS.json` | Shared state — updated after every build |
| `docs/coordination-surface.md` | This guide |
