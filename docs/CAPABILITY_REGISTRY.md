# RIO SYSTEM — Master Node Capability Registry

**Version 1.0** | April 10, 2026 | Authority: B-Rass | Governance: RIO

---

## Purpose

This registry documents the verified capabilities and hard limits of every node in the RIO system. It exists to enforce lane-keeping: no node should be asked to perform work outside its verified capability. Work assignment flows from this document.

All entries are self-reported by each node and verified against observed behavior. Authority source: B-Rass. Governance layer: RIO.

---

## System Topology

The system operates in two functional clusters, one adversarial node, and one authority source.

| Cluster | Nodes | Strengths |
|---------|-------|-----------|
| Execution | Bondi + Manny | GitHub, terminal, deployment, email send, full-stack build, Outlook, Notion, Zapier |
| Intelligence | Claude + Gemini | Drive, Gmail, Calendar, analysis, audit, memory, media generation, past conversation search |
| Adversarial | Grok | X/Twitter search, stress-testing, adversarial audit, Python REPL analysis — no external access |
| Authority | B-Rass | Sovereign authority source. Every cross-cluster handoff routes through B-Rass. No agent bypasses this. |

**Key constraint:** No agent communicates directly with another. Every cross-node handoff routes through B-Rass as courier. This is the OPERATOR_HANDOFF_RULE and it is currently the primary bottleneck as the system scales.

---

## Node Entries

### Manny (Manus) — Builder / Executor

| Category | Capabilities |
|----------|-------------|
| READ | GitHub: all repos under bkr1297-RIO (full clone, files, Issues, commits, PRs). Google Drive: all files and folders (list, read, download, search). Google Docs/Sheets/Slides: read and extract content via API. Web: full browser access (navigate, read, screenshot, interact). Search: web, image, news, API, academic. File systems: full read in sandbox environment. MCP active: Zapier, Notion, Gmail, Outlook Mail, Outlook Calendar, Meta Creators, Meta Marketing. |
| WRITE / ACT | GitHub: clone, commit, push, create/close/comment Issues, create labels, create repos. Google Drive: create, update, delete files and folders. Google Docs: create and overwrite Docs. Gmail: read, send, draft, label (MCP — not yet used in RIO context). Outlook Mail: read, send, draft (MCP — available, not yet used). Outlook Calendar: read, create, update events (MCP — available, not yet used). Notion: create/update pages, manage databases, edit blocks. Shell: full terminal — install packages, run scripts, manage processes. Web apps: build, deploy on Manus hosting (rio-one.manus.space live). Database: read/write MySQL/TiDB. File storage: upload to S3 via platform helpers. Scheduled tasks: timer-based recurring or one-time tasks. |
| GENERATE / BUILD | Code: Python, JavaScript/TypeScript, HTML/CSS, shell scripts, SQL. Web apps: full-stack React + Express + tRPC + database. Chrome extensions: manifest v3, content scripts, background scripts. Documents: Markdown, PDF, DOCX, presentations. Images: AI image generation via platform helpers. Audio: speech-to-text transcription. Data analysis: charts, visualizations, spreadsheets. LLM integration: invoke OpenAI-compatible models from server-side. |
| HARD LIMITS | No direct agent-to-agent communication. No access to Azure Portal or Azure AD. No Slack, Discord, or Teams. No Stripe or payment processing (unless added via platform feature). Cannot deploy to external hosting — Manus hosting only. Cannot modify GitHub Actions workflow files via API. Session-bound: state persists across hibernation but not new task sessions unless committed. |

### Gemini (Librarian) — Memory / MANTIS Monitor

| Category | Capabilities |
|----------|-------------|
| READ | Google Ecosystem: full read of Google Drive (RIO Hub), Gmail, Google Calendar. Knowledge retrieval: real-time web search (Google Search) and YouTube analysis. Context: past conversation history and User Summary data. Visuals: uploaded images, PDFs, shared camera/screen feeds (via Live mode). |
| WRITE / ACT | Google Workspace: create/modify Google Docs/Sheets, draft Gmail, manage Calendar events. Communication: execute search queries, fetch real-time data to update the Ledger. Navigation: screen-sharing assistance on mobile for real-time task guidance. |
| GENERATE / BUILD | Media: Text-to-Image (Gemini Flash), Text-to-Video (Veo), Music (Lyria 3). Code/Artifacts: technical documentation, LaTeX, logic-based JSON structures (Packets). Coordination: Status Dashboards and automated Librarian Ledgers. |
| HARD LIMITS | No direct GitHub access (cannot commit, push, open issues — must relay via Brian). No terminal/IDE access — cannot execute commands or deploy code. No native Microsoft Ecosystem access (Outlook/Azure must be bridged via Logic Apps). Cannot send final emails (drafts only) or post to social platforms. |

### Claude (Architect) — Thinking Partner / Analyst / Auditor

| Category | Capabilities |
|----------|-------------|
| READ | Google Drive: search and fetch any document owned by B-Rass. Gmail: search threads, read emails, list drafts and labels. Google Calendar: list events, get event details, find free time. Web: search and fetch any public URL. Past conversations: search previous Claude chat history. |
| WRITE / ACT | Gmail: create drafts, label/unlabel messages and threads. Google Calendar: create events, update events, respond to invites. Browser: navigate pages, read page content, fill forms, execute JavaScript, read network requests. |
| GENERATE / BUILD | Code, artifacts, visualizations, interactive widgets, documents. API calls to Claude models (can run AI inside artifacts). |
| HARD LIMITS | No GitHub direct access. No Replit or Manus access. No Azure/Microsoft 365 direct access. No Slack. Cannot send email (draft only — B-Rass sends). Cannot execute terminal commands. |

### Bondi (ChatGPT) — Chief of Staff / Coordination Layer

| Category | Capabilities |
|----------|-------------|
| READ | Chat context and shared artifacts brought into session by B-Rass. GitHub: issues, commits, docs (read-only, via ChatGPT GitHub integration). Platform-exposed connectors active in-session. |
| WRITE / ACT | Structured intent objects and task packets (propose only). Draft docs, issue updates, and coordination artifacts. Route and translate between agents when instructed by B-Rass. |
| GENERATE / BUILD | Task packets, proposals, and structured coordination documents. Comparison and synthesis across multiple agent outputs. Constitutional review and policy drafts. |
| HARD LIMITS | No direct GitHub commit, push, or issue creation authority. No direct Drive, Gmail, or Calendar write access. No execution authority — propose only, never execute. No silence counts as approval. No connected tool implies standing permission. All external actions require explicit B-Rass instruction. |

### Grok (Azure) — Stress-Tester / Adversarial Auditor

| Category | Capabilities |
|----------|-------------|
| READ | Current conversation history and all prior sealed entries. Real-time web search, X (Twitter) search, page browsing, image search. Code execution via Python REPL (stateful, with scientific/ML libraries). |
| WRITE / ACT | Structured text, JSON, code snippets, policy drafts, architectural specs (no external execution). Analysis and synthesis from packet or tool outputs. |
| GENERATE / BUILD | Technical specifications, policy text, capability registries. Step-by-step instructions, code examples (Python, JavaScript, HTML/CSS). Stress-test scenarios and adversarial audits. Structured exports (JSON, tables, timelines). |
| HARD LIMITS | Cannot execute real-world actions (no email, SMS, calendar, file writes, GitHub commits). No access to external systems (GitHub, Azure, Slack, Gmail, Drive, Replit). Cannot act as executor or issue authorization tokens — advisory only. Cannot override human authority or bypass governance. No persistent state outside conversation session. No terminal or OS-level commands. |

---

## System Gaps and Observations

**GitHub Blind Spot:** Only Manny has GitHub access. Claude, Gemini, Bondi (read-only), and Grok cannot read or write the repo. All code-layer work routes through Manny via B-Rass courier.

**Untapped Capability:** Manny has Outlook, Gmail, Notion, and Zapier connectors live but none are wired into RIO governance flows yet. High-value, near-term opportunity.

**ONE is the primary gap:** The web/phone interface (rio-one.manus.space) is scaffolded but has no features. It is the highest priority build target — it surfaces everything else.

**Unique capabilities by node:** Grok is the only node with X/Twitter search. Gemini is the only node with media generation (video, image, music). These are currently underutilized.

---

*This document is a living artifact. Update when node capabilities change.*
*Authored by Claude (Architect). Committed by Manny (Builder). Authority: B-Rass.*
