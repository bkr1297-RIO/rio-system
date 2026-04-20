# TO: damon@example.com, "riomethod5@gmail.com" <riomethod5@gmail.com>
# SUBJECT: Integration Planning — Governed Execution Flow

Damon,  
  
Integration planning phase. Do not build yet; plan first.  
  
CONFIRM:  
  ✓ VERIFY\_API\_INTEGRATION.md fixes are on main  
  ✓ You are ready to plan SDK and integration architecture  
  
BEGIN PLANNING:  
  
Define the developer flow for governed execution:  
  
DEVELOPER FLOW:  
  Intent → Policy → Approval → Execution → Receipt → Verify  
  
What this means:  
  1. Intent: Developer submits action request (human readable)  
  2. Policy: RIO policy engine evaluates (is action allowed? what approval needed?)  
  3. Approval: Human approver signs decision (Ed25519 signature)  
  4. Execution: FORGE gateway executes action through integration (Slack, Email, etc.)  
  5. Receipt: ATLAS generates cryptographic receipt (5-link hash chain)  
  6. Verify: Auditor can verify receipt at any time (receipt → ledger → execution)  
  
INTEGRATION ARCHITECTURE:  
  
Interface Layer (ONE) vs Governance Layer (RIO):  
  ✓ Interface: Slack, Email, Telegram, Web UI, Mobile (how humans see the system)  
  ✗ NOT: Where governance happens  
  
Governance happens in RIO (gateway):  
  ✓ Slack integration: User sends message → Slack adapter → RIO gateway (governance)  
  ✓ Email integration: User sends email → Email adapter → RIO gateway (governance)  
  ✓ Web UI: User clicks action → Web adapter → RIO gateway (governance)  
  
All integrations must go through the gateway:  
  • No direct execution from Slack  
  • No direct execution from Email  
  • No direct action without approval  
  • All actions produce receipts  
  
PLANNING TASKS (Do not code yet):  
  
1\. API Design  
   Define API for each integration:  
     GET /integrations/slack/handlers  
     POST /integrations/slack/intent (human intent from Slack → RIO format)  
     POST /integrations/slack/execute (approval → real execution via Slack)  
  
2\. Adapter Pattern  
   Define how each integration adapter works:  
     Slack Adapter: Parse message → Extract intent → Call /intent endpoint → Wait for approval → Execute  
     Email Adapter: Parse email → Extract intent → Call /intent endpoint → Wait for approval → Execute  
  
3\. Receipt Distribution  
   How do humans see receipts?  
     Slack: Bot sends receipt message (with hash chain)  
     Email: Return email with receipt (human knows it happened)  
     Web: Show receipt on screen (5-link hash chain visible)  
  
4\. Error Handling  
   What if Slack fails? What if email bounces?  
     Intent created in RIO (stored in ledger)  
     Execution failed (integration error)  
     Receipt still generated (shows: "created, approval obtained, execution failed in Slack adapter")  
     Auditor sees the failure (can track why action didn't complete)  
  
5\. SDK Specification  
   Define SDK for developers building on RIO:  
     rio.intent(action, target, context) → intent\_id  
     rio.approve(intent\_id, decision) → approval\_record  
     rio.execute(intent\_id, approval\_record) → execution\_result  
     rio.verify(intent\_id) → receipt (full chain)  
  
Planning deliverable: INTEGRATION\_ARCHITECTURE.md  
  
Include:  
  • Flow diagram: Intent → Governance → Approval → Execution → Receipt  
  • Adapter pattern for each integration type  
  • API specification for each adapter  
  • Error handling and failure modes  
  • SDK specification for developers  
  
Do not code until Brian approves architecture.  
  
— Brian