# How We Work

Operating rules for the RIO multi-agent team. Read once, follow always.

---

## Communication

1. **Agents do not talk directly to each other.** All communication flows through the repo docs and through Brian. There is no agent-to-agent channel.

2. **Brian is the intermediary.** If you need something from another agent, tell Brian. He will relay it. If another agent needs something from you, Brian will tell you.

3. **The repo is the shared memory.** If it is not written down in the repo, it does not exist. Status updates, decisions, questions, and ownership are all tracked in the coordination docs.

---

## Authority

4. **Brian is the final authority on all decisions.** Architecture, product, licensing, naming, priorities, hiring — Brian decides. Agents propose; Brian approves.

5. **No real-world actions without approval.** No agent executes real-world actions (sending emails, making purchases, deploying to production, publishing packages) without explicit approval from Brian.

6. **Fail closed.** If you are unsure whether you have permission to do something, do not do it. Ask first.

---

## Ownership

7. **Check WHO_OWNS_WHAT.md before working.** Every system, repo, doc area, and decision area has an owner. If it is not yours, do not touch it without coordinating through Brian.

8. **Stay in your lane.** Overlap creates confusion. If you see something that needs fixing outside your area, flag it in OPEN_QUESTIONS.md — do not fix it yourself.

9. **Own your updates.** When you complete work, update STATUS.md. When a decision is made, update DECISIONS.md. When a question is answered, update OPEN_QUESTIONS.md.

---

## Code and Repos

10. **Receipt protocol is open.** The `rio-receipt-protocol` repo is public. Everything in it is open source under MIT OR Apache-2.0. Do not put governance/control plane code there.

11. **Governance platform is licensed.** The `rio-system` repo is private. Policy engine, authorization logic, HITL enforcement, ONE interface, enterprise deployment, and orchestration logic stay here.

12. **Document everything.** Code without documentation is incomplete. Every feature, decision, and change should be reflected in the appropriate doc.

13. **Use PRs for significant changes.** For non-trivial changes, use pull requests so Brian can review before merge. Trivial doc updates can go direct to main.

---

## Quality

14. **Structure first, content second.** Get the structure right, then fill in the details. Do not overthink content on the first pass.

15. **Working system over good-sounding answer.** If you claim something works, show the test output. If you claim something is fixed, show before and after.

16. **One change at a time.** Make a change, verify it works, then move to the next thing. Do not batch unrelated changes.

---

## Priorities

17. **Check ROADMAP.md for current priorities.** Work on what is in the current phase. Do not jump ahead unless Brian directs it.

18. **Blockers surface immediately.** If you are blocked, update STATUS.md and flag it in OPEN_QUESTIONS.md. Do not sit on blockers.

19. **Speed matters, but quality matters more.** Move fast, but do not trade correctness for velocity.
