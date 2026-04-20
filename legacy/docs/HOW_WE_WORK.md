# How We Work

Operating rules for the RIO multi-agent team. Read once, follow always.

---

## Communication

1. **Agents do not talk directly to each other.** All communication flows through the repo docs and through Brian. There is no agent-to-agent channel.

2. **Do not message Brian with routine status updates.** Push your work to the repo and update STATUS.md. The Chief of Staff monitors these docs and surfaces what Brian needs to see. Brian engages only on decisions, conflicts, and milestones.

3. **The repo is the shared memory.** If it is not written down in the repo, it does not exist. Status updates, decisions, questions, and ownership are all tracked in the coordination docs.

---

## Delivery Workflow

4. **Deliver, don't report.** When you finish work, push it to the repo (code, docs, PRs) and update STATUS.md. Do not wait for Brian to ask.

5. **Questions go to OPEN_QUESTIONS.md.** If you need a decision from Brian, add it there with your name, the date, and the context. The Chief of Staff will surface it.

6. **Decisions go to DECISIONS.md.** When Brian makes a call, record it immediately so it sticks and other agents can reference it.

7. **Brian's two contact points are Manny and the Chief of Staff.** Manny for building and product decisions. Chief of Staff for status, coordination, and surfaced questions. Other agents do not contact Brian directly unless he initiates.

---

## Authority

8. **Brian is the final authority on all decisions.** Architecture, product, licensing, naming, priorities, hiring — Brian decides. Agents propose; Brian approves.

9. **No real-world actions without approval.** No agent executes real-world actions (sending emails, making purchases, deploying to production, publishing packages) without explicit approval from Brian.

10. **Fail closed.** If you are unsure whether you have permission to do something, do not do it. Ask first.

---

## Ownership

11. **Check WHO_OWNS_WHAT.md before working.** Every system, repo, doc area, and decision area has an owner. If it is not yours, do not touch it without coordinating through Brian.

12. **Stay in your lane.** Overlap creates confusion. If you see something that needs fixing outside your area, flag it in OPEN_QUESTIONS.md — do not fix it yourself.

13. **Own your updates.** When you complete work, update STATUS.md. When a decision is made, update DECISIONS.md. When a question is answered, update OPEN_QUESTIONS.md.

---

## Code and Repos

14. **Receipt protocol is open.** The `rio-receipt-protocol` repo is public. Everything in it is open source under MIT OR Apache-2.0. Do not put governance/control plane code there.

15. **Governance platform is licensed.** The `rio-system` repo is private. Policy engine, authorization logic, HITL enforcement, ONE interface, enterprise deployment, and orchestration logic stay here.

16. **Document everything.** Code without documentation is incomplete. Every feature, decision, and change should be reflected in the appropriate doc.

17. **Use PRs for significant changes.** For non-trivial changes, use pull requests so Brian can review before merge. Trivial doc updates can go direct to main.

---

## Quality

18. **Structure first, content second.** Get the structure right, then fill in the details. Do not overthink content on the first pass.

19. **Working system over good-sounding answer.** If you claim something works, show the test output. If you claim something is fixed, show before and after.

20. **One change at a time.** Make a change, verify it works, then move to the next thing. Do not batch unrelated changes.

---

## Priorities

21. **Check ROADMAP.md for current priorities.** Work on what is in the current phase. Do not jump ahead unless Brian directs it.

22. **Blockers surface immediately.** If you are blocked, update STATUS.md and flag it in OPEN_QUESTIONS.md. Do not sit on blockers.

23. **Speed matters, but quality matters more.** Move fast, but do not trade correctness for velocity.
