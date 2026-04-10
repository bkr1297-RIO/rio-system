# Operator Handoff Rule

Every meaningful output must become a shared artifact. If it only exists in a chat window, it does not exist in the system.

---

## The Three Verbs

| Verb | Owner | Surface |
|------|-------|---------|
| **Shape** | ChatGPT (Bondi) | Strategy memos, policy schemas, advisory comments |
| **Develop** | Manus (Manny) | Code, config, docs, tests, STATUS.json |
| **Expose** | GitHub | Issues, commits, comments, status files |

Work flows in one direction: **Shape → Develop → Expose.** Nothing is real until it is exposed on a shared surface.

---

## The Rule

When any agent produces output that another agent or the Sovereign needs to act on, that output must be converted into one of these artifact types:

| Artifact Type | Where It Lives | Example |
|---------------|---------------|---------|
| Issue | GitHub Issues | TASK, RESULT, or APPROVAL packet |
| Doc | GitHub repo or Google Drive | ROLE_BOUNDARIES.md, Quick Start guide |
| Status | GitHub repo | STATUS.json |
| Receipt | GitHub Issue comment | RESULT packet with commit hash |

---

## How It Works in Practice

**Bondi shapes a strategy.** Brian carries the directive (one sentence) to Manny. Manny builds it, commits it, and posts a RESULT packet on the relevant Issue. Bondi reads the Issue directly from GitHub. Brian approves or redirects. Gemini logs it to Drive.

**Brian does not carry the content.** Brian carries the instruction. The content lives in the shared artifact where every agent that needs it can read it from their own surface.

---

## Examples

**Bad:** Bondi writes a 500-word strategy memo in ChatGPT. Brian copies it to Manny. Manny reads it, builds, then explains back to Brian what was built. Brian copies that to Bondi.

**Good:** Bondi shapes the requirement. Brian says: "Manny, check Issue #93 and build it." Manny builds, commits, posts RESULT on Issue #93. Brian says: "Bondi, check Issue #93." Done.

**Bad:** Manny finishes a build and describes it in chat. The description is lost when the session ends.

**Good:** Manny finishes a build, updates STATUS.json, posts a RESULT packet on the Issue. The record is permanent and readable by any agent with repo access.

---

## Enforcement

This rule is self-enforcing. If an output is not on a shared surface, no other agent can see it. The system's separation of access makes the rule automatic — the only way to hand off work across agents is through an artifact.
