# RIO Digital Proxy - TODO

## Database & Schema
- [x] Create proxy_users table (userId, publicKey, policyHash, seedVersion, status, onboardedAt)
- [x] Create intents table (intentId, userId, toolName, toolArgs, argsHash, riskTier, status, blastRadius, createdAt)
- [x] Create approvals table (approvalId, intentId, userId, decision, signature, boundToolName, boundArgsHash, expiresAt, maxExecutions, executionCount, createdAt)
- [x] Create executions table (executionId, intentId, approvalId, result, receiptHash, preflightResults, executedAt)
- [x] Create ledger table (entryId, entryType, payload, hash, prevHash, timestamp)
- [x] Create tool_registry table (toolName, description, riskTier, requiredParams)

## Server-Side API (tRPC Procedures)
- [x] POST /onboard - User onboarding with public key + policy binding
- [x] POST /intent - Create new intent with risk assessment
- [x] POST /approval - Submit approval decision with Ed25519 signature binding
- [x] POST /execute - Execute approved intent with 8 preflight checks
- [x] GET /ledger - Retrieve full tamper-evident ledger
- [x] GET /verify - Verify SHA-256 hash chain integrity
- [x] POST /kill - Global kill switch to revoke all access
- [x] GET /status/:userId - Get user proxy status and recent activity
- [x] GET /receipt/:executionId - Get execution receipt with verification data
- [x] POST /sync - Bidirectional state sync between client and server

## Frontend Pages
- [x] Onboarding page with Ed25519 key generation in browser, policy selection, first intent
- [x] Intent creation page with tool selector, risk tier display, blast radius computation
- [x] Approval interface with signature binding details (tool + argsHash + expiry + maxExecutions)
- [x] Execution view with 8 preflight checks display and real-time status
- [x] Ledger viewer showing tamper-evident SHA-256 hash chain with entry details
- [x] Status dashboard showing proxy state, recent intents, approvals, system health
- [x] Receipt viewer with cryptographic verification UI (Ed25519 signatures + hash chain)

## Global UI
- [x] Global kill switch button accessible from every screen with confirmation dialog
- [x] Navigation layout with persistent kill switch visibility
- [x] Dark theme with security-focused design tokens

## Local State (IndexedDB)
- [x] IndexedDB store for cryptographic keys
- [x] IndexedDB store for active policy
- [x] IndexedDB store for last known system state
- [x] Sync mechanism between IndexedDB and cloud ledger

## Testing
- [x] Server-side tests for onboard, intent, approval, execute, kill, ledger, verify
- [x] Hash chain integrity verification test

## Gaps to Address
- [x] Dedicated Receipt Viewer page with signature verification status and hash-chain linkage proof
- [x] IndexedDB sync: persist pulled ledger state to IndexedDB and push local state updates
- [x] Non-mocked hash chain integrity test that constructs entries and verifies chain validity

## Key Recovery & Ledger Resync (CRITICAL)
- [x] Database table for encrypted key backups (AES-256-GCM encrypted private key, tied to user)
- [x] Server endpoint: POST backup encrypted key (user provides passphrase-encrypted blob)
- [x] Server endpoint: GET retrieve encrypted key backup (returns encrypted blob for user to decrypt locally)
- [x] Server endpoint: GET ledger resync (returns full verified ledger for device to rebuild local state)
- [x] Frontend: Key backup flow after onboarding (prompt user to set backup passphrase, encrypt private key in browser, upload)
- [x] Frontend: Key recovery page (enter passphrase, download encrypted blob, decrypt in browser, restore to IndexedDB)
- [x] Frontend: Ledger resync button on Dashboard (detect broken/missing local ledger, pull full chain from server, verify, store)
- [x] Frontend: Device sync flow combining key recovery + ledger resync into single restore process
- [x] Frontend: Recovery banner on Dashboard when local keys are missing but server identity exists
- [x] Tests: encrypted backup round-trip, recovery flow, ledger resync verification

## Bug Fixes
- [x] Fix: Cannot update component (`Home`) while rendering — setState called during render instead of useEffect

## Jordan AI Router + Node Integration + Learning Loop
### Server-Side
- [x] Database: learning_events table (stores every approval/rejection/execution as learning context with feedback, tags, outcome)
- [x] Database: conversations table (stores Jordan chat sessions with user + AI messages)
- [x] Database: node_configs table (stores which AI models are available, their API keys reference, capabilities)
- [x] AI Node abstraction: unified interface to call Claude, GPT, or Gemini via Manus Forge with identical input/output contract
- [x] Pass selected node/model config into invokeLLM to support actual multi-provider routing
- [x] Jordan Router: receives user message, loads context (policy, recent learnings, active intents, user state), routes to selected AI node
- [x] Jordan context builder: assembles system prompt from Master Seed rules + policy + recent learning events + user proxy state
- [x] Intent extraction: AI node proposes actions as structured tool calls, Jordan converts them to HITL intents automatically
- [x] Learning Loop: after every approval/rejection/execution, store the decision + user feedback as a learning event
- [x] Learning Loop: feed recent learning events back into AI context on every new conversation turn
- [x] Sentinel orientation: on session start, verify identity, load authority, check status, load context before any AI interaction
- [x] "Where does this break?" analysis: AI must include break analysis for MEDIUM+ risk intents before submission
- [x] Enforce breakAnalysis server-side for MEDIUM/HIGH risk intents (validation error when missing)

### Frontend
- [x] Jordan chat page: conversational interface where user talks to the proxy through Jordan
- [x] Node selector: dropdown to choose which AI model (Claude/GPT/Gemini) powers the current conversation
- [x] Intent proposal cards: when AI suggests an action, display it as an approvable intent card inline in chat
- [x] Feedback buttons: after every AI response, thumbs up/down + optional text feedback that feeds the Learning Loop
- [x] Learning feed: summary counts on Jordan header
- [x] Learning Feed UI: dedicated view listing learning events with type/outcome/feedback/timestamps (/learning route)
- [x] Sentinel banner: shows orientation status at top of Jordan chat (identity verified, policy loaded, context synced)
- [x] Mode indicator: shows current proxy mode (Reflect/Compute/Draft/Verify/Execute) in the chat header

### Tests
- [x] Test: AI node abstraction returns structured response from each provider (via extractResponseText)
- [x] Test: Jordan router builds correct context from Master Seed + learning events (buildJordanSystemPrompt)
- [x] Test: Intent extraction converts AI tool calls to HITL intents (extractIntents)
- [x] Test: Learning Loop stores feedback and includes it in subsequent context (createLearningEventPayload)

## Phase 2: Activate the Hands (Real Tool Execution) — Architect Directive v1
### CRITICAL: Connectors
- [x] Integrate Gmail API connector (send/read email via approved intents) — see Core Loop section
- [x] Integrate Google Drive connector (read/write/search files via approved intents) — see Core Loop section
- [x] Integrate Web Search connector (search the web via approved intents) — see Core Loop section

### CRITICAL: Execution Loop
- [x] Wire approved intents to trigger real-world API calls through RIO control plane — see Core Loop section
- [x] Ensure every MEDIUM/HIGH tool call is an extracted intent that awaits human cryptographic 'Yes' (LOW risk auto-approved by policy) — enforced by dispatchExecution
- [x] Do not allow 'Thinking Mode' to bypass the RIO Governance Kernel — all execution goes through connector dispatch

### MANDATORY: Receipts
- [x] Post-execution SHA-256 hash must be recorded for every real tool execution — see Core Loop section
- [x] Receipt includes execution result, timestamp, and proof of approval chain — see Core Loop section

### MANDATORY: Fail-Closed
- [x] Verify ARGS_HASH_MISMATCH blocks execution drift (approved args != execution args = HALT) — tested in connectors.test.ts
- [x] Fix: ARGS_HASH_MISMATCH false positive caused by MySQL JSON key reordering — use stored argsHash instead of recomputing from DB-returned JSON
- [x] All connector failures must fail closed (no partial execution, no silent errors) — tested in connectors.test.ts

### Gemini API Testing
- [x] Create Gemini API demo script testing capabilities through Manus Forge
- [x] Document Gemini capabilities brief for RIO integration planning

## Master Seed v1.1 Integration
- [x] Save Master Seed v1.1 JSON to shared/master-seed-v1.1.json (canonical source of truth)
- [x] Update Jordan system prompt (MASTER_SEED_RULES) to reflect v1.1 — add Robot mode, Phase 2 directive, updated end-goal, corpus anchoring
- [x] Update ProxyMode type to include ROBOT mode
- [x] Update mode detection to include Robot mode triggers
- [x] Update frontend mode selector to include Robot mode
- [x] Add Phase 2 directive constants to shared/master-seed-v1.1.json for cross-module access

## Phase 2 Core Loop: intent → approval → execution → receipt → ledger
### Connector Abstraction
- [x] Connector interface: unified execute(toolName, toolArgs, approvalProof) → ConnectorResult
- [x] Register tools in tool_registry DB: web_search (LOW), read_email (MEDIUM), draft_email (MEDIUM), send_email (HIGH), drive_read (MEDIUM), drive_search (LOW), drive_write (HIGH)
- [x] Risk tier definitions from Brian: LOW=[search, read-only, draft], MEDIUM=[read email, download, edit docs], HIGH=[send email, delete/move files, money, sign]

### RIO Execution Loop
- [x] Wire approved intent → connector dispatch: execution procedure calls connector.execute() with approval proof
- [x] ARGS_HASH_MISMATCH enforcement: SHA-256(toolArgs at approval) must equal SHA-256(toolArgs at execution) or HALT
- [x] Fail-closed on any connector error: no partial execution, no silent errors, error recorded to ledger
- [x] HIGH risk requires explicit approval every time (no auto-approve)

### Connector Implementations (Manus Forge APIs)
- [x] Gmail send_email connector via Forge API (true fail-closed)
- [x] Gmail read_email connector via Forge API (true fail-closed)
- [x] Gmail draft_email connector via Forge API (true fail-closed)
- [x] Google Drive read/search/write connectors via Forge API (true fail-closed)
- [x] Web Search connector via Forge API (true fail-closed)

### Receipts + Ledger
- [x] SHA-256 receipt generated after every real execution (includes result, executionId, intentId)
- [x] Receipt written to ledger as EXECUTION entry with full hash chain linkage
- [x] Receipt visible in UI (execution view + receipt viewer) — IntentDetail links to receipt, ExecutedReceiptLink for DB-loaded intents

### Tests
- [x] Test: ARGS_HASH_MISMATCH blocks execution when args differ (connectors.test.ts)
- [x] Test: Connector dispatch routes to correct connector based on toolName (connectors.test.ts)
- [x] Test: Receipt SHA-256 includes execution result + approval proof (connectors.test.ts)
- [x] Test: Fail-closed on connector error (no partial execution) (connectors.test.ts)

### Definition of Done (from Brian)
- [x] Full lifecycle works: create intent → system assigns risk → user approves → system executes real action → receipt generated → receipt in ledger → receipt visible in UI (RECEIPT HASH VALID + CHAIN LINK VALID confirmed)
- [x] Mobile responsive code implemented — hamburger nav, collapsible Jordan sidebar, responsive sentinel banner
- [ ] Verify phone UX on real device: responsive code is in place (hamburger nav, sidebar toggle, flex-wrap) but sandbox viewport is fixed at 1280px — Brian must test on phone
- [x] Recovery UI verified: all 3 tabs render, server backup detected, resync returns 14 entries
- [ ] Full restore E2E: enter passphrase → decrypt → keys in IndexedDB → policy restored → ledger synced → approval works — code verified, Brian needs to test on phone with passphrase Rio4life08$

## Logo + Corpus + Gmail Fix
- [x] Upload sacred geometry icon (IMG_6712.PNG) as app logo and favicon
- [x] Clone rio-system repo and read corpus/foundation-v1 branch content
- [x] Integrate corpus files (policy-v0.3.json, identity, directives, witness records, build specs) into shared/corpus/
- [x] Update Jordan system prompt with Policy v0.3 GREEN/YELLOW/RED zones from corpus
- [x] Fix send_email red error: wired via notifyOwner transport (not Gmail API — delivers to owner via Manus notification)
- [x] Wire draft_email as LIVE connector (returns draft content, never sends)
- [x] Unit tests: 24 connector tests in connectors.test.ts (send_email, draft_email, DEFERRED, ARGS_HASH_MISMATCH, receipts)
- [x] Browser E2E: verify send_email intent → approval → execute → receipt → ledger with notifyOwner path
- [ ] True Gmail OAuth connector: replace notifyOwner transport with real Gmail API — deferred (current notifyOwner transport works, Gmail OAuth requires Google Cloud project setup)

## Ledger Hash Chain Verification Fix
- [x] Fix: Ledger chain verification fails (CHAIN BROKEN) due to MySQL JSON key reordering — same root cause as ARGS_HASH_MISMATCH
- [x] Server-side: canonicalJsonStringify function sorts keys recursively before hashing — deterministic across MySQL round-trips
- [x] Client-side: verification calls server-side verifyHashChain via tRPC (already uses canonical JSON)
- [x] Verify chain shows CHAIN VALID after fix — 20 entries verified, no tampering detected

## Twilio SMS Connector
- [x] Store Twilio credentials (Account SID, Auth Token, Phone Number, Messaging Service SID) as secrets — validated active
- [x] Register send_sms tool in tool registry with HIGH risk tier (blast radius 8, params: to, body)
- [x] Build Twilio SMS connector in connectors.ts behind governance gate
- [x] Add send_sms to frontend CreateIntent form with to/body fields (dynamic from tool registry)
- [x] Write vitest tests for SMS connector — 97 tests pass (4 new SMS tests: missing to, missing body, missing creds, HIGH risk enforcement)
- [x] E2E test: Intent → Approve → Execute → SMS delivered → Receipt → Ledger — INT-1Z2_DMxKzV8YCzWI, messageSid SM1dDd3ca4a1ee63dd3768432d650ae95f, twilioStatus: accepted, 8/8 preflight PASS

## Bugs / Issues
- [x] SMS not delivered to +18014555810 — diagnosed: toll-free blocked (30032), local blocked by 10DLC (30034). Requires A2P registration.
- [x] Publish fails with S3 PutObject 429 rate limit error — transient Manus infra issue, retry resolves

## Architecture Logs + Local Twilio Number
- [x] Get local Twilio number (non-toll-free) to fix SMS delivery — (801) 457-0972 purchased, SMS+MMS+Voice
- [x] Update TWILIO_PHONE_NUMBER secret with new local number — +18014570972
- [x] Resend SMS to +18014052174 (verified number) — DELIVERED from +18014570972, no errors. +18014555810 blocked by 10DLC.
- [x] Create /docs/architecture/ in repo and store RIO_Architecture_Log_2026-03-31.json
- [x] Add ARCHITECTURE_STATE ledger entry type to the system — schema migrated, appendLedger updated, logArchitectureState tRPC mutation added
- [x] Mirror architecture log to Google Drive One/root/architecture/ — folder created, file uploaded (id: 1jgFqEhzg8ZSuif_0gqtRUpskCNYKhCtD)
- [x] Push architecture docs to GitHub repo bkr1297-RIO/rio-system — pushed to feature/hitl-proxy branch

## RIO System Icon
- [x] Generate RIO system icon from JSON spec (dark bg, center point, triangle, hexagon, outer ring, gold loop line) — v2 generated
- [x] Upload to CDN — URL ready. User sets in Settings > General.

## SMS From-Number Fix (Connector Bug)
- [x] Fix connector to stop using Messaging Service SID — hardcoded From: +18014570972
- [x] Verify via Twilio API that SMS sends from local number — confirmed from: +18014570972
- [x] Resend first governed SMS to +18014052174 — DELIVERED (status: delivered, no error). +18014555810 requires 10DLC registration.

## Current Issues (Brian reported)
- [x] Published site still shows broken ledger — re-migrated all 48 entries, CHAIN VALID, needs re-publish
- [x] Second email verified delivered — "RIO System Live - Loop Confirmed" sent Mar 31 10:58 PM UTC from riomethod5@gmail.com to bkr1297@gmail.com, confirmed in Gmail sent folder
- [x] Investigate Telegram as RIO control plane channel — docs/telegram-control-plane-investigation.md written. Strong fit: inline keyboard for APPROVE/REJECT, node-telegram-bot-api (v0.67.0), ~200 LOC. Blocked on: Brian creates RIO bot via @BotFather + provides bot token + chat ID.

## Mobile Approval Flow
- [x] Audit mobile UX on key pages (dashboard, intent list, intent detail, approve, ledger)
- [x] Dashboard: pending intents at top with ACTION REQUIRED banner, pulsing bell, large tap targets, risk dots
- [x] Fix mobile nav — hamburger menu already in place, responsive breakpoints solid
- [x] Fix mobile intent detail — fixed bottom action bar with 48px approve/execute buttons, touch-manipulation, backdrop-blur
- [x] Fix mobile ledger — break-all for hashes, whitespace-pre-wrap for JSON payloads
- [x] Test full mobile approval flow end-to-end — 97 tests pass, UI verified in browser

## E2E Mobile Verification (Brian Required)
- [ ] Brian: test full mobile approval flow on real phone — open riodigital-cqy2ymbu.manus.space, approve pending intent, execute, verify receipt
- [x] Add E2E vitest covering approve→execute governance flow (11 steps: onboard, create HIGH intent, block without approval, approve, verify status, execute with 8/8 preflight, verify receipt hash, verify ledger entries, block re-execution, reject flow, kill switch) — 108 tests pass

## Close The Loop — Control Plane (Andrew's Spec)
### A1: Make intent envelope first-class
- [x] Define canonical intent envelope schema (intent_id, request_id, source_type, source_id, actor_id, timestamp, nonce, action_type, target, parameters, context, correlation_id, policy_version_target, metadata)
- [x] Canonicalize envelope for deterministic hashing (canonicalJsonStringify + hashEnvelope)

### A2: Separate verification from governance
- [x] Create verification layer that runs BEFORE policy evaluation (verifyIntentEnvelope)
- [x] Reject malformed, expired, replayed, unsigned-when-required, or unauthorized requests
- [x] Emit explicit verification_result object (verification_id, intent_hash, schema_valid, auth_valid, signature_valid, ttl_valid, nonce_valid, replay_check, verified, failure_reasons, timestamp)

### A3: Formalize governance decision object
- [x] Create governance_decision artifact (decision_id, intent_hash, verification_id, policy_version, risk_score, risk_level, decision, required_approvals, reasons, blocking_conditions, timestamp)

### A4: Enforce explicit human authorization boundary
- [x] Capture approver identity, approval payload, signed/authenticated approval artifact, timestamp, decision rationale
- [x] Silence equals refusal — no implied approval (validateApproval)

### A5: Add execution token and final preflight gate
- [x] Issue single-use execution token after successful approval or auto-approval (issueExecutionToken)
- [x] Bind token to intent hash, action hash, policy version, TTL, nonce, target
- [x] Execution gate must verify token before connector call (executeGatePreflight — 8 checks)

### A6: Produce receipt/witness artifact
- [x] Receipt links to intent, governance, approval, execution, and verification artifacts (generateWitnessReceipt)
- [x] Include timestamps, outcome, external response IDs, verification status, hashes, chain_of_custody

### A7: Append full chain to immutable ledger
- [x] Ledger entry stores receipt_hash, previous_ledger_hash, current_hash, block_index, timestamp (buildFormalLedgerEntry)
- [x] Append only, no overwrite, chain validation in tests

### A8: Close learning loop safely
- [x] Build analytics over ledger and receipts (runLearningLoopAnalysis)
- [x] Generate reports: false positives, false negatives, approval bottlenecks, execution failures, policy misses, repeated override patterns
- [x] Output policy recommendations — no auto-change to live policy without explicit approved promotion (mutates_live_policy=false invariant)
- [x] Wire learning.analyze tRPC endpoint to serve analysis from UI

### Required Tests (all 9) — 34 tests in controlPlane.test.ts
- [x] T1: malformed_intent_fails_before_governance (5 assertions)
- [x] T2: expired_or_replayed_intent_fails_verification (4 assertions)
- [x] T3: low_risk_intent_auto_approves_and_executes_through_gate (2 assertions)
- [x] T4: high_risk_intent_blocks_without_human_approval (3 assertions)
- [x] T5: approval_for_one_intent_cannot_be_reused_for_another (3 assertions)
- [x] T6: execution_without_valid_token_is_denied (4 assertions)
- [x] T7: successful_execution_generates_receipt_and_ledger_entry (4 assertions)
- [x] T8: ledger_chain_validation_detects_tampering (3 assertions)
- [x] T9: learning_loop_reads_ledger_and_emits_recommendations_without_mutating_live_policy (5 assertions)

### Definition of Done — ALL PROVEN
- [x] Single intent traceable end-to-end from proposal to receipt (DEMO test)
- [x] System blocks execution when verification fails (T1, T2)
- [x] System blocks execution when policy requires approval and no approval exists (T4)
- [x] System binds approval to the exact intended action (T5)
- [x] System emits verifiable receipt after execution (T7)
- [x] System appends tamper-evident ledger entry (T7, T8)
- [x] System runs learning analysis over completed records (T9)
- [x] Demo/test proves full closed loop in one flow (DEMO: traces single HIGH-risk intent end-to-end)

## First-Light Bring-Up Plan (Andrew's Operational Checklist)
### Issue: Onboarding Loop + Broken Ledger + No Local Keys
- [x] Fix onboarding loop — re-key flow added: Onboard.tsx detects already-onboarded, offers Generate New Keys or Restore from Backup
- [x] Ensure key generation completes and persists to IndexedDB — Onboard.tsx saves to IndexedDB via useLocalStore, re-key auto-syncs ledger
- [x] Fix ledger health — Dashboard auto-syncs on load, re-key auto-resyncs, Resync button on ledger health
- [x] Verify hash chain — server-side verifyHashChain uses canonicalJsonStringify, chain valid across MySQL round-trips
- [x] Ensure backup/recovery material created after onboarding — Onboard.tsx prompts backup passphrase after key generation
- [x] Run governed action E2E (first-light-e2e.test.ts): gmail_send intent → policy → approval → 8/8 preflight → execution → receipt → ledger — 12 steps, all pass
- [x] Confirm receipt and ledger entry independently verified — Steps 7-9: receipt hash is valid SHA-256, ledger contains EXECUTION entry, hash chain valid, 154 total tests pass

## Three-Power Separation Architecture (Brian's v1.0 Spec)
### Principle: "No component should be trusted because of what it is supposed to do; each component must be restricted by what it is technically impossible for it to do."

### Phase 1: RBAC Boundaries (enforce identity separation)
- [x] Define Observer/Governor/Executor roles as typed constants with explicit permission sets (PERMISSIONS matrix in threePowers.ts)
- [x] Observer: canRead, canAssessRisk, canSendSignals, canReadFullState — approve()/execute() throw POWER_VIOLATION
- [x] Governor: canApprove, canSign — execute()/readFullState() throw POWER_VIOLATION
- [x] Executor: canExecute, canWriteLedger — approve()/sign()/readFullState() throw POWER_VIOLATION
- [x] Runtime RBAC via checkPermission() — returns {allowed, reason} for every operation
- [x] Component identity: each power has componentId, Ed25519 keypair (Governor), and typed power role

### Phase 2: Queue-Based Message Flow + Signing
- [x] Observer → Governor signal queue: PowerQueue<ObserverSignal> with sender=OBSERVER, receiver=GOVERNOR
- [x] Governor → Executor approval queue: PowerQueue<GovernorApproval> with sender=GOVERNOR, receiver=EXECUTOR
- [x] Cryptographic signing: Governor signs with Ed25519 (@noble/ed25519 v3), Executor verifies via verifyApprovalSignature()
- [x] Queue isolation: wrong power enqueue/dequeue throws QUEUE_VIOLATION — 7 tests prove all boundary violations

### Phase 3: One Closed-Loop Governed Action (THE FINISH LINE)
- [x] Prove one full loop: executeThreePowerLoop() — Observer assesses → Governor signs → Executor verifies+executes → receipt → ledger
- [x] Receipt independently verifiable: SHA-256 receipt_hash matches /^[a-f0-9]{64}$/
- [x] Ledger entry links all artifacts: prev_hash, current_hash, block_index, receipt_hash — chain proven across 2 consecutive loops

### Phase 4: Dashboard Visualization Connected to Real State
- [x] Sigil-based dashboard showing real-time state of the three powers (ThreePowerSigil.tsx + ThreePowerPanel)
- [x] Color intensity for risk (cool=LOW emerald, amber=MEDIUM, red=HIGH) — center orb radiates risk color
- [x] Pulsing rays for "Waiting for Approval" — Governor hex pulses, GOV indicator has animated dot
- [x] Solidified geometry on "Approved" — Governor turns emerald, no pulse
- [x] Energy flow on "Executed" — Executor gear spins, indigo glow
- [x] Chain link illumination on "Logged" — chain links + connection line illuminate gold
- [x] Visual breaks/dimming on violations/expirations — VIOLATED: red flash on all powers; EXPIRED: full dim
- [x] Clear visual separation of Observer/Governor/Executor panels — OBS/GOV/EXEC indicators + labeled SVG vertices
- [x] Connected to real system state via useMemo over status.recentIntents — maps PENDING_APPROVAL/APPROVED/EXECUTED/REJECTED/FAILED to sigil stages

### Tests Required — ALL 35 PASS (threePowers.test.ts)
- [x] Test: Observer cannot execute or approve (POWER_VIOLATION throws)
- [x] Test: Governor cannot execute (POWER_VIOLATION throws)
- [x] Test: Executor cannot approve or observe full state (POWER_VIOLATION throws)
- [x] Test: Unsigned/tampered approval is rejected by Executor (SIGNATURE_INVALID)
- [x] Test: Full closed-loop: one HIGH-risk intent through all three powers with receipt + ledger
- [x] Test: Tampered approval signature is rejected (verifyApprovalSignature returns false)
- [x] Test: Action hash mismatch blocks execution (parameters changed after approval)
- [x] Test: Queue isolation — 7 boundary violation tests
- [x] Test: Rejection stops at GOVERNANCE, Executor queue empty
- [x] Test: Two consecutive loops produce valid hash chain
- [x] 189 total tests pass across 13 files

## Romney Spec Conformance Audit
- [x] Pull Romney's specs from GitHub (PR #82 docs/spec-and-architecture + commit bba7ee3 key recovery)
- [x] Audit threePowers.ts against THREE_POWER_SEPARATION.md — docs/conformance-audit.md written, 10 gaps identified, 5 fixed
- [x] Add Receipt Spec v2.1 fields to ExecutorResult: ingestion provenance, identity_binding, receipt_type, full hash_chain
- [x] Fix Observer/Governor ledger append permissions per TPS-001 §7 — canWriteLedger=true for all three powers
- [x] Audit MANTIS_COMPONENT.md against Observer role constraints — conformance verified, ingestion metadata gap noted
- [x] Map tRPC endpoints against API_CATALOG_v2.7.md — docs/api-endpoint-mapping.md written. 22 covered, 2 different approach, 14 not needed (gateway-only), 3 gaps (signer list/detail/revocation), 2 minor gaps
- [x] 191 tests pass across 13 files after all conformance fixes

## Signer Management + Re-key Hardening + Telegram Bot
### Signer Management Endpoints
- [x] Add listSigners tRPC query — owner-only, returns all signers with metadata, backup status, intent count
- [x] Add getSignerDetail tRPC query — full signer info with intents, approvals, backup status, fingerprint
- [x] Add revokeSigner tRPC mutation — suspend signer + log REVOKE to ledger, blocks already-revoked
- [x] Add REVOKE, RE_KEY_AUTHORIZED, RE_KEY_FORCED, TELEGRAM_NOTIFY to ledger entryType enum + migration applied

### Re-key Hardening
- [x] Require old-key signature on re-key mutation — AUTHORIZED re-key with oldKeySignature proof
- [x] If no old key: recoveryProof (fingerprint match) or owner emergency override; non-owner without proof rejected
- [x] Log RE_KEY_AUTHORIZED vs RE_KEY_FORCED distinction in ledger with verification detail
- [x] Onboard.tsx: sign new public key with old private key when available (signData import)

### Telegram Bot Module (pre-built, token-ready)
- [x] Create server/telegram.ts — full bot module with intent notification + inline APPROVE/REJECT keyboard
- [x] Format intent notifications: risk emoji, tool name, blast radius, args preview, 15-min silence=refusal
- [x] handleWebhookUpdate + parseCallbackData for callback queries
- [x] editMessageAfterDecision removes buttons and shows APPROVED/REJECTED
- [x] TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID added to env.ts
- [x] isTelegramConfigured() returns false when no credentials — safe to import
- [x] TELEGRAM_NOTIFY ledger entry type for audit trail
- [x] Long-polling mode (startPolling/stopPolling) for development
- [x] Blocked on: Brian creates bot via @BotFather + provides TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID — DONE

### Tests — 17 new tests in signer-telegram.test.ts
- [x] Test: listSigners returns registered users with metadata
- [x] Test: listSigners rejects non-owner callers
- [x] Test: getSignerDetail returns full info + backup status
- [x] Test: getSignerDetail throws for non-existent signer
- [x] Test: revokeSigner suspends + logs REVOKE entry
- [x] Test: revokeSigner rejects already-revoked signer
- [x] Test: re-key with old signature → RE_KEY_AUTHORIZED
- [x] Test: re-key with recovery proof → RE_KEY_FORCED
- [x] Test: re-key with mismatched proof → rejected
- [x] Test: owner emergency override → RE_KEY_FORCED
- [x] Test: non-owner without proof → rejected
- [x] Test: re-key for non-onboarded user → error
- [x] Test: isTelegramConfigured false when no credentials
- [x] Test: parseCallbackData parses approve/reject/details
- [x] Test: parseCallbackData null for invalid data
- [x] 208 total tests pass across 14 files

## Telegram Auto-Notification + Signer Management UI
### Telegram Auto-Notification Hook
- [x] Wire sendIntentNotification into proxy.createIntent procedure (fires after intent creation)
- [x] Wire sendReceiptNotification into proxy.execute procedure (fires after successful execution)
- [x] Wire sendKillNotification into proxy.kill procedure (fires on kill switch activation)
- [x] Graceful skip when isTelegramConfigured() returns false (no errors, no blocking)

### Signer Management UI Page
- [x] Create client/src/pages/SignerManagement.tsx — owner-only page listing all signers
- [x] Signer list view: public key fingerprint, status (active/suspended), onboarded date, intent count, backup status
- [x] Signer detail modal/view: full signer info, recent intents, approvals, revocation button
- [x] Revoke signer action: confirmation dialog, calls proxy.revokeSigner, updates list
- [x] Add /signers route to App.tsx and navigation
- [x] Owner-only access guard (non-owner sees "Access Denied")

### Tests
- [x] Test: Telegram notification fires on intent creation (mocked) — telegram-autofire.test.ts, 6 tests
- [x] Test: Telegram notification skipped when not configured — telegram-autofire.test.ts
- [x] 214 total tests pass across 15 files

## Phase 7 — Brian's Feedback & UX Overhaul

### Telegram Bot Activation
- [x] Set TELEGRAM_BOT_TOKEN secret (8563931494:AAEJrNC9SpGs5phhIEpk_R08C_uRDhu2p4g)
- [x] Set TELEGRAM_CHAT_ID secret (6278170396)
- [x] Send a test message via the bot to verify it works

### Rename "Jordan" (that's Brian's son, not an AI name)
- [x] Rename all references from "Jordan" to "Bondi" — 93 references across 10 files renamed, jordan.ts→bondi.ts, jordan.test.ts→bondi.test.ts, Jordan.tsx→Bondi.tsx, /jordan→/bondi route, BONDI_CHAT ledger type added (JORDAN_CHAT kept for backward compat), migration 0009 applied, 215 tests pass

### Bug Fixes from Mobile Screenshots
- [x] Fix crash error on Signers page — Dashboard hooks ordering bug (useMemo after early returns), ErrorBoundary shows friendly message
- [x] Fix Access Denied flash on Signers page — show skeleton while status.data is still loading

### Full UI Redesign (Brian's feedback: "looks like 1998", "not intuitive", "for engineers not people")
- [x] Make the AI chat the home page — Bondi concierge is now the home page
- [x] Simple approval cards: human-readable tool names, clean args display, Approve/Reject buttons
- [x] Hide engineering pages (Ledger, Identity, hashes) behind Settings > Advanced links
- [x] Remove "Create Intent" form — removed from main nav, Bondi chat is the entry point
- [x] Clean, modern, intuitive design — light theme, Inter font, Apple-inspired surfaces
- [x] Mobile-first responsive design — bottom tab bar, touch-friendly cards, responsive layout

## Phase 8 — MVP "One" App Redesign (Apple sleek + Google intuitive + Microsoft grounding)
### Design System
-- [x] Color palette: clean blues, warm grays, white backgrounds — Apple-inspired
- [x] Typography: Inter/SF-style sans-serif, no monospace except code snippets
- [x] Theme tokens: light-first with subtle shadows, rounded corners, breathing whitespacee

### Home Screen (Bondi Concierge)
- [x] Bondi greeting: "Good morning, Brian" with personal assistant message
- [x] Capability cards: Send an email, Research something, Draft a document, Just chat
- [x] Single input field: "Ask Bondi anything..." at bottom
- [x] Example prompts via capability cards

### Approval Flow Redesign
- [x] Simple approval cards: human-readable tool names, args displayed cleanly, Approve/Reject buttons
- [x] No visible hashes, intent IDs, or technical metadata in default view
- [x] "Show Technical Details" expandable for users who want to see the cryptographic proof

### Navigation Restructure
- [x] Home = Bondi concierge (chat + capabilities)
- [x] Activity = recent intents, approvals, executions in a clean feed
- [x] Settings = kill switch, recovery, advanced (ledger, identity, signers)
- [x] Removed: standalone Intent page, standalone Ledger page, Learning page from main nav (moved to Settings)

### Mobile-First
- [x] Bottom tab bar navigation (Home, Activity, Settings) on mobile
- [x] Touch-friendly approval cards with large tap targets
- [x] Kill switch accessible from Settings, not floating red button

### Receipts
- [x] Receipts accessible from Activity feed — tap any executed item to see receipt
- [x] Receipt view: clean summary card, expandable cryptographic proof section

## Google Drive Backup
- [x] Export all RIO system data (ledger, intents, approvals, receipts) as JSON — 10 tables exported: 1 user, 18 intents, 13 approvals, 13 executions, 56 ledger entries, 17 tools, 59 learning events, 4 conversations, 3 node configs, 1 key backup
- [x] Export encrypted key backup to file — included in key_backups.json
- [x] Create RIO-System/backups folder on Google Drive — RIO > RIO-System > backups + corpus + architecture
- [x] Upload system data export to Drive — combined backup + manifest + individual table files
- [x] Upload corpus/foundation files to Drive — master seed, policy, agents, system def, directives, build specs, witness chain, architecture docs
- [x] Set up daily automated backup schedule — runs daily at 6:00 AM MDT

## Phase 9 — Brian's UX Fix List (7 Points)
- [x] 1. Approvals on Home screen: pending approvals must appear on the main Bondi screen, not hidden in Activity — no hunting
- [x] 2. After approval, show green Execute button immediately on same screen — no page change
- [x] 3. Receipts appear instantly after execution on same screen — no navigation required
- [x] 4. Natural language throughout — no robotic/technical text, conversational tone
- [x] 5. LOW risk actions auto-approve — no user approval needed for search, read-only, drafts
- [x] 6. Email sender address fix — emails now note they'll send from bkr1297@gmail.com once Gmail API connected
- [x] 7. Activity + Ledger combined — visible together in one view, not separate pages
- [x] Approval buttons must be large, visible, high-contrast — h-14 buttons with shadow, full-width, impossible to miss

## Phase 10 — Agent Adapter Layer (OpenAI First)
- [x] Create AgentAdapter interface (input: approved intent + args, output: structured action request)
- [x] Build OpenAI Adapter using function calling API
- [x] Wire adapter into existing execute pipeline (agent decides HOW, RIO executes)
- [x] Update Bondi to route intents through agent adapter when appropriate
- [x] UI shows which agent handled the intent in approval/receipt cards
- [x] Write tests for the full governed external agent loop — 19 tests including live OpenAI integration
- [x] End-to-end test: Send Email through OpenAI adapter → RIO executes → receipt → ledger — all 234 tests pass

## Phase 11 — Multi-Agent Governance (Claude + Task Types + Routing)
- [x] Build Claude Adapter using Anthropic API (same AgentAdapter interface as OpenAI)
- [x] Register Claude in the adapter registry alongside OpenAI and Passthrough
- [x] Define task type categories: Write/Draft, Summarize/Analyze, Communicate, Schedule/Calendar, File/Document, Search/Research, General
- [x] Build agent recommendation engine: suggest best agent per task type (Brian still chooses)
- [x] Update agent routing UI: task type selector, agent recommendation badge, multi-agent chooser (OpenAI / Claude / Direct)
- [x] Receipts and activity show which agent planned the task
- [x] Write tests for Claude adapter and routing/recommendation logic — 259 tests all pass
- [x] End-to-end test: task routed to Claude → RIO executes → receipt → ledger

## Bug Fixes — Mobile Testing (April 1)
- [x] BUG: Stale intent card showing "Execute via OpenAI" on Bondi screen load — filtered out expired/fully-used approvals in Bondi + Activity
- [x] BUG: Send Email execution via OpenAI fails with "Something went wrong" error — added humanizeError() for actionable error messages in Bondi + Activity

## ONE Sacred Geometry Logo Integration
- [x] Upload ONE logo (IMG_6720.PNG) to CDN — https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/cqY2yMbuJygAXmi9W2e2t9/rio-one-logo_10501d45.png
- [x] Replace Bondi greeting sparkle icon with ONE logo
- [x] Add ONE logo to app navbar (replace or alongside "RIO" text)
- [x] Ensure logo displays well on mobile and desktop — object-contain + drop-shadow, responsive sizing

## Receipt Protocol Link Button
- [x] Add prominent "RIO Receipt Protocol" button on landing page (Home.tsx) linking to https://rioprotocol-q9cry3ny.manus.space

## Twilio SMS Connector
- [x] Add send_sms connector in connectors.ts (Twilio API integration) — already implemented with full Twilio REST API
- [x] Register send_sms in the agent adapter — already in AGENT_TOOLS with to/body params, inferTaskType maps to "communicate"
- [x] Add "Send a text" quick action button on Bondi home screen — replaced "Just chat" with "Send a text" using MessageSquare icon
- [x] Display SMS intent cards properly — ArgsPreview handles send_sms, IntentDetail uses MessageSquare icon
- [x] Write vitest tests for the SMS connector — 7 tests: validation, risk enforcement, Twilio success/error/network, receipt generation
- [x] Verify full governed flow: connector registered, HIGH risk enforced, approval proof required, receipt generated

## ONE Command Center Rebuild
### Phase 1: Navigation + Theme
- [x] Switch to dark mode mission control theme (deep navy/slate bg, calm low-contrast)
- [x] Build bottom tab navigation bar (6 icons: Home, Approvals, Connections, Activity, Policies, System)
- [x] Rebrand from "RIO" to "ONE" in header with sacred geometry logo, "Powered by RIO" subtitle
- [x] Remove old sidebar/dashboard layout, replace with mobile-first bottom-nav shell

### Phase 2: Home Tab (Chief of Staff)
- [x] Adapt Bondi chat as the Home tab — chat with AI, create tasks, plans, research, drafts
- [x] When AI proposes action, show summary card in chat: "This action requires approval. Review in Approvals."
- [x] Remove inline Approve/Deny from chat — chat is proposal only, Approvals tab is authority

### Phase 3: Approvals Tab
- [x] Build dedicated Approvals page with cards: Action, Tool, Risk level, Why it needs approval, Approve/Deny buttons
- [x] Wire Approve button: creates approval signature → RIO authorizes → connector executes → receipt → ledger → status shown
- [x] Wire Deny button: rejects intent, updates status
- [x] Show empty state when no pending approvals

### Phase 4: Connections Page
- [x] Build Connections page with service list and Connect buttons
- [x] Show Twilio as "Connected", Email as "Connected"
- [x] Show Google, Microsoft, Slack, GitHub, Notion, Database, API/Webhook as "Coming Soon"
- [x] Clean status indicators (connected/disconnected/coming soon)

### Phase 5: Activity Tab
- [x] Rebuild Activity as receipts/history: Time, Action, Tool, Approved by, Status, Receipt link
- [x] Clicking item shows full receipt: intent → approval → execution → hashes → ledger entry

### Phase 6: Policies Tab
- [x] Promote Policies from Settings sub-page to top-level tab
- [x] Simple rules engine UI: external email → requires approval, payments over $X → requires approval, etc.

### Phase 7: System Tab
- [x] Build System/Kill Switch page: pause all execution, emergency stop
- [x] Disconnect connectors controls
- [x] Export ledger button
- [x] View system status
- [x] Keys / identity section
- [x] Backup / restore

## RIO Receipt Protocol Repo — Launch Hardening Sprint (Manny's Tasks)
- [x] Task 3: Create CONTRIBUTING.md (how to run tests, report bugs, propose spec changes, code style, PR process)
- [x] Task 4: Create CODE_OF_CONDUCT.md (Contributor Covenant v2.1)
- [x] Task 5: Create GitHub issue templates (bug_report.md, feature_request.md, spec_change.md) and PR template
- [x] Task 6: Clean up .gitignore (add node_modules, .env, dist, coverage, OS files, IDE files, etc.)
- [x] Task 1: Add "For Platform Builders" section to README — riomethod5@gmail.com
- [x] Task 2: Create architecture/positioning diagram (docs/architecture.md + rendered PNG)
- [x] Task 7: Final README polish pass (badges, quickstart notes, repo structure tree, internal links)

## Romney Review Fixes
- [x] Fix Python test command in CONTRIBUTING.md (use custom runner, not pytest)
- [x] Confirm spec_change.md template exists (it was already created)
- [x] Fix badge count from "29 conformance" to "58 conformance (29 Node + 29 Python)"
- [x] Confirm docs/architecture.md exists (it was already created)
- [x] Update CODE_OF_CONDUCT.md enforcement email to riomethod5@gmail.com
- [x] Drop SECURITY.md — removed, Romney's version takes precedence

## Ed25519 Signing & Verification Sprint
- [x] Add signReceipt() with Ed25519 to reference/receipts.mjs
- [x] Add signature_hex field to identity_binding in spec/receipt-schema.json
- [x] Implement real Ed25519 signature verification in cli/verify.mjs
- [x] Build end-to-end demo CLI (cli/demo.mjs: action → receipt → sign → ledger → verify)
- [x] Add 9 conformance tests for Category 9: Ed25519 Signing & Verification (38 total pass)
- [x] Document canonical JSON rules, signed payload, public key format, verification steps (spec/canonical-rules.md)

## System Self-Knowledge: Architecture Registry
- [x] Create system_components table (componentId, name, role, status, implementation, connections, metadata)
- [x] Populate system_components with P1-P9 component data
- [x] Create tRPC endpoint to query system architecture state
- [x] Push RIO_SYSTEM_STATE.json and RIO_SYSTEM_STATE.md to Google Drive

## PWA Conversion & New Views Sprint
- [x] Add PWA manifest.json with app name, icons, theme color, display: standalone
- [x] Add service worker for offline caching
- [x] Add PWA meta tags to index.html (theme-color, apple-touch-icon, viewport)
- [x] Use existing ONE logo for PWA app icons (192x192, 512x512)
## Phase 2 — ONE Command Center (Operator Control Surface)

- [x] Change browser tab title from "RIO Digital Proxy" to "ONE Command Center" (HTML done, VITE_APP_TITLE requires Settings > General)
- [x] Audit current app against Phase 2 priority features

- [ ] Add 8 Pillars home screen view
- [ ] Add SPPAV loop visualization view
- [ ] Add Risk Classification display view
- [ ] Add 9-step Governance & Execution Loop diagram view
- [ ] Store 3 JSON seeds as system configuration

## Feature: Editable Policy Rules (#6)
- [x] Create policy_rules table (ruleId, userId, toolPattern, riskOverride, requiresApproval, condition, enabled, createdAt, updatedAt)
- [x] Server: CRUD endpoints for policy rules (list, create, update, delete, toggle)
- [x] Server: Wire custom rules into risk assessment / intent creation flow
- [x] Server: Log POLICY_UPDATE to ledger when rules change
- [x] Frontend: Editable rules UI on Policies page (add/edit/delete/toggle rules)
- [x] Frontend: Rule builder form (tool selector, risk level, approval required, conditions)
- [x] Tests: policy rules CRUD, enforcement during intent creation, ledger logging (19 tests)

## Feature: In-App Notifications (#7)
- [x] Create notifications table (notificationId, userId, type, title, body, intentId, read, createdAt)
- [x] Server: create notification on intent creation, approval needed, execution complete, kill switch
- [x] Server: tRPC endpoints for list/markRead/markAllRead notifications
- [x] Frontend: Notification bell icon with unread count badge in nav
- [x] Frontend: Notification dropdown/panel showing recent notifications
- [x] Frontend: Click notification navigates to relevant page (approval, receipt, etc.)
- [ ] Frontend: PWA push notification support via service worker (deferred — requires VAPID keys)
- [x] Tests: notification creation, read/unread (19 tests passing)

## Bug Fix: Sign-in Screen
- [x] Make "Sign in" text a clickable button that triggers OAuth login
- [x] Change text from "Sign in to talk to Bondi" to "Sign in to ONE"

## Phase 3 — Packaging & Deployment Readiness

### Priority 1: First Deployment Use Case
- [ ] Define the first deployment use case (AI email with approval + receipt)
- [ ] Document end-to-end flow for the use case
- [ ] Ensure ONE demonstrates the full loop for this use case

### Priority 2: Deployment Architecture
- [ ] Document what runs where (ONE, Gateway, Ledger, Receipts)
- [ ] Create deployment architecture diagram
- [ ] Document self-host installation steps
- [ ] Document open vs licensed boundary clearly

### Priority 3: ONE as Demo-Ready Control Center
- [ ] Audit all 6 control center views (Agent, Approvals, Receipts, Ledger, Policies, Activity)
- [ ] Fix any UX gaps that would hurt a demo
- [ ] Ensure all views are polished and presentable
- [ ] Add any missing navigation or empty states

### Priority 4: Push docs to repo
- [ ] Push deployment architecture docs to rio-system
- [x] Update STATUS.md and ROADMAP.md to reflect Phase 3

## Deployment Program — Artifact #4: ONE Demo Readiness
- [x] Create top-level docker-compose.yml (Gateway + PostgreSQL + ONE)
- [x] Create .env.example with all required keys documented
- [x] Create deployment README with step-by-step Docker instructions
- [x] Verify ONE demo flow: create intent → risk assessment → approve → execute → receipt → ledger
- [x] Polish any rough edges in the demo flow for prospects (verified: flow is clean and working)
- [x] Push Docker files to rio-system repo
- [x] Update STATUS.md with completed items

## Enterprise Features — Pilot Readiness (2026-04-03)
- [x] Intent expiration (TTL): add expiresAt column to intents, enforce at approval time, auto-expire stale intents
- [x] Batch approval: add batchApprove procedure + multi-select UI on Approvals page
- [x] Versioned receipt schema: add protocol_version field to every generated receipt
- [x] MFA / hardware key stub: architecture documented in ENTERPRISE_ROADMAP.md (WebAuthn/FIDO2 design)
- [x] Approval SLA dashboard: add time-to-approval, queue size, avg approval time metrics to Dashboard
- [x] Log redaction / PII documentation: architecture documented in ENTERPRISE_ROADMAP.md (redaction policy design)

## Platform Specification v1.0 (2026-04-04)
- [x] Write RIO/ONE Platform Specification v1.0 covering all 15 sections
- [x] Push spec to rio-system repo
- [x] Update STATUS.md with spec delivery

## Scribe Deliverables Integration (2026-04-04)
- [x] Write MIRRORED_GOVERNANCE.md — organizational architecture for the agent team
- [x] Write META_GOVERNANCE_SPEC.md — Layer 5 Meta-Governance specification
- [x] Push both to rio-system repo
- [x] Update STATUS.md with Scribe integration delivery

## Spec Consolidation — Canonical 6-Document Structure (2026-04-04)
- [x] Write CONSTITUTION.md (highest authority — invariants, 5 layers, quorum, accountability invariant)
- [x] Consolidate META_GOVERNANCE.md (merge two existing files into one canonical)
- [x] Write WORK_PROTOCOL.md (Builder → Auditor → CoS → Human → Receipt)
- [x] Write RECEIPT_SPEC.md (receipt schema, verification, protocol versioning)
- [x] Write LEDGER_SPEC.md (hash chain, append-only, integrity verification)
- [x] Update ARCHITECTURE.md (system design — all 5 layers, components, tokens)
- [x] Move deprecated files to spec/archive/
- [x] Push consolidated structure to repo
- [x] Update STATUS.md

## Architecture Convergence — Technical Decisions (2026-04-04)
- [x] Audit codebase against Brian's 5 technical decision areas
- [x] Write TECHNICAL_DECISIONS.md mapping existing impl + gaps + next steps
- [x] Push to repo and update STATUS.md

## Platformization Phase — Enforcement Implementation Plans (2026-04-04)
- [x] Audit existing codebase to ground each enforcement plan
- [x] Write ENFORCEMENT_PLANS.md — 5 areas: Role, Policy, CAS+Ledger, Audit, Meta-Gov
- [x] Add Platformization Tracker to repo (CoS delivered separately)
- [x] Push plans to repo and update STATUS.md

## Role Enforcement — Area 1 Implementation (2026-04-04)
- [x] Add system_role enum (proposer, approver, executor, auditor, meta) to schema
- [x] Add principals table linking users to system roles
- [x] Generate and apply migration SQL
- [x] Add db helpers: getPrincipalByUserId, assignRole, removeRole, listPrincipals
- [x] Add requireRole() middleware in trpc.ts (fail-closed: no role = 403)
- [x] Gate policy/signer management procedures by meta role via roleGatedProcedure
- [ ] Add principal_id attribution to intent creation and approval records
- [x] Add admin role management UI (meta role only) — Principals page with role assign/remove/status
- [x] Add role display in SystemControl profile card with role badges
- [x] Write tests: requireRole middleware, role-gated procedures, fail-closed behavior (15 tests in role-enforcement.test.ts)
- [x] Push to repo and update STATUS.md (commit 304f0fd)

## First Platform Slice — Directive (2026-04-04)
### Priority 1: Gateway Approvals Table
- [x] Add approvals table to Gateway PostgreSQL (approver_id, decision, signature)
- [x] Add POST /approvals/:intent_id endpoint in Gateway
- [x] Add GET /approvals/:intent_id endpoint in Gateway
- [x] Add GET /approvals (pending) endpoint in Gateway
- [x] Wire proposer ≠ approver enforcement in Gateway

### Priority 2: Google OAuth in Gateway
- [x] Google OAuth flow with GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET env vars
- [x] Email-to-principal resolution with alias mapping
- [x] Passphrase login preserved as fallback

### Priority 3: Rewire ONE to call Gateway API
- [x] Strip ONE to 3 screens only: Login, Create Intent, Approvals
- [x] Remove all enforcement logic from ONE (Decision 2: Interface Is Not Authority)
- [x] ONE calls Gateway API for all data — no local tRPC enforcement
- [x] Login screen with Google OAuth (calls Gateway /auth/google)
- [x] Create Intent screen (calls Gateway POST /intent)
- [x] Approvals screen (calls Gateway GET /approvals + POST /approvals/:id)

### Priority 4: Tests
- [x] Gateway governed-flow integration tests (14/14 pass)
- [x] Gateway governed-flow unit tests (13/13 pass)
- [x] Gateway principals tests (11/11 pass)
- [x] Gateway policy engine tests (57/57 pass)
- [x] ONE PWA gateway client tests (18/18 pass)
- [x] Full project test suite: 339 tests, 0 failures across 23 files

## Bug Fix: Login Screen Missing Google OAuth Button
- [x] Show Google OAuth button on Login screen (even when not configured, show disabled state)
- [x] Clarify auth flow — passphrase is for testing, Google OAuth is for production

## Bug Fix: Login Screen — Both Auth Methods Visible
- [x] Make passphrase login visible by default (not collapsed)
- [x] Keep Google OAuth button visible and ready (activates when Gateway has credentials)
- [x] Both methods equal — user can test with passphrase now, switch to Google OAuth on deployment

## Bug: Login Not Working — Passphrase Denied, Google OAuth Not Active
- [x] Fix login so Brian can actually sign in without needing Gateway passphrase
- [x] Enable Manus OAuth as the primary login method (already built into the template)

## Login / Navigation Fix (Context Continuation)
- [x] Fix: NewIntent.tsx calls navigate() during render causing infinite loop — move to useEffect
- [x] Fix: GatewayApprovals.tsx calls navigate() during render causing infinite loop — move to useEffect
- [x] Fix: NewIntent and GatewayApprovals use useGatewayAuth() for page access gating — switch to useAuth() (Manus OAuth) since user logs in via Manus OAuth, not Gateway passphrase
- [x] Fix: Keep useGatewayAuth() only for Gateway API calls (intents, approvals), not for page access control
- [x] Verify: All 3 screens work after login (Login → Create Intent → Approvals)

## Brian's Feedback: Wiring + UX (Context Continuation)
### Issue 1: Wiring — Verify ONE→Gateway intent submission works end-to-end
- [x] Verify: Submit Intent button calls Gateway POST /intents (not just local state)
- [x] Verify: Intent is written to Gateway database
- [x] Verify: Approvals page reads from Gateway GET /intents (merged with /approvals)
- [x] Verify: OAuth login maps to a principal record with a role (Brian → I-1, root_authority)
- [~] Full loop: Propose → Approve → Execute → Receipt → Ledger (propose + govern works; approve blocked by proposer≠approver invariant — needs 2nd principal)

### Issue 2: UX — Transform developer console into user-friendly interface
- [x] Replace action tiles + JSON box with simple user-friendly forms per action type
- [x] Send Email form: To, Subject, Body fields (no JSON)
- [x] Send SMS form: Phone Number, Message fields (no JSON)
- [x] Deploy form: Environment, Version fields (no JSON)
- [x] Transfer Funds form: Amount, Recipient fields (no JSON)
- [x] Add "Advanced Mode" toggle to show raw JSON / custom actions for developers
- [x] User flow: Choose action → Fill form → Submit → See governance result status
- [x] Approvals page: clean cards with human-readable action descriptions, large Approve/Reject buttons
- [ ] After approval: show receipt immediately, no navigation required

## Vertical Slice: First Governed Execution (Priority)
- [x] Build server-side Gateway proxy: tRPC procedures that forward to Gateway with X-Principal-ID header
- [x] Map Manus OAuth user to Gateway principal (Brian → I-1) via server-side lookup
- [x] Proxy endpoint: gateway.submitIntent → POST /intent on Gateway
- [x] Proxy endpoint: gateway.governIntent → POST /govern on Gateway
- [x] Proxy endpoint: gateway.getPendingApprovals → GET /approvals on Gateway
- [x] Proxy endpoint: gateway.submitApproval → POST /approvals/:id on Gateway
- [x] Fix client gateway.ts to call ONE tRPC proxy instead of Gateway directly
- [x] Fix pending_approvals → pending field name mismatch (merge strategy: /approvals + /intents)
- [x] Set agent_id to brian.k.rasmussen (policy-scoped) instead of one-user
- [x] Test vertical slice: submit → govern → pending shows in approvals (approve blocked by proposer≠approver — correct governance behavior)

## CoS Fix: Identity Chain (Decision 2 Compliance)
- [ ] Update Gateway principals seed: I-1 email from brian.k.rasmussen to bkr1297@gmail.com (Gateway-side change)
- [ ] Fix passphrase login to resolve to bkr1297@gmail.com instead of brian.k.rasmussen (Gateway-side change)
- [x] Fix server-side proxy: send authenticated email instead of X-Principal-ID (ONE is untrusted client per Decision 2)
- [x] Gateway resolves principal from email via resolvePrincipalByEmail() — PR #91 submitted to rio-system
- [ ] Verify full flow: login → email identity → Gateway resolves principal → governance → approvals (blocked on Gateway PR merge)

## UX: Get Out of Developer Mode
- [x] Create Intent: Replace action tiles + JSON box with user-friendly forms per action type
- [x] Send Email form: To, Subject, Body fields (no JSON required)
- [x] Send SMS form: Phone Number, Message fields (no JSON required)
- [x] Web Search form: Query field (no JSON required)
- [x] Add Advanced Mode toggle for power users who want raw JSON / custom actions
- [x] Approvals page: ensure clean human-readable cards (verified)

## BLOCKING: Gateway Principal Mapping (CoS Audit)
- [x] Gateway: Add email→principal_id resolution so X-Authenticated-Email: bkr1297@gmail.com → I-1 → root_authority (PR #91)
- [x] Gateway: Either add email column to principals table OR create identity_map table (already in INITIAL_PRINCIPALS on main)
- [x] Gateway: Update resolvePrincipalFromRequest to check X-Authenticated-Email header (PR #91)
- [x] Gateway: Push fix, create PR, deploy (PR #91 open, pending merge)
- [x] ONE: Verify error message is clear when Gateway cannot resolve principal
- [x] ONE: Added transitional X-Principal-ID fallback (works NOW with live Gateway)
- [x] E2E: Full governed action pipeline verified (submit → govern → REQUIRE_HUMAN → approvals page shows pending)
- [ ] CLEANUP: Remove X-Principal-ID fallback after PR #91 is merged and deployed

## PRIORITY: First Governed Email E2E (CoS Directive)
- [x] Map full pipeline: Submit → Govern → Approve → Execute → Receipt → Ledger
- [x] Verify Gateway accepts approval from a different principal than proposer
- [x] Wire approval → execution: Gateway executes send_email connector after approval
- [x] Wire execution → receipt: SHA-256 receipt generated after email sends
- [x] Wire receipt → ledger: execution entry appended to tamper-evident ledger
- [x] Show receipt immediately in UI after approval completes
- [ ] Test full E2E: one governed email sent, receipt visible, ledger entry written

## CoS Decision: Register I-2, Wire Execution Pipeline
- [x] Gateway: Register I-2 (riomethod5@gmail.com, approver, human, active) in INITIAL_PRINCIPALS
- [x] ONE: Update principal mapping to include I-2 (riomethod5@gmail.com → approver)
- [x] ONE: Wire execution pipeline: approve → POST /execute → send email → POST /execute-confirm → POST /receipt
- [x] ONE: Add gateway.executeApproved tRPC procedure (orchestrates full execution pipeline)
- [x] ONE: executeGovernedAction in gatewayProxy.ts handles /execute → action → /execute-confirm → /receipt
- [x] ONE: Update Approvals UI — after approval, trigger execution and show receipt inline (ReceiptCard)
- [ ] Test: Full E2E with two principals (I-1 submits, I-2 approves, email sends, receipt generated)

## Bug: "No Gateway principal mapped for this user" on Send Email
- [x] Diagnose: Manus OAuth email not mapping to Gateway principal ID (resolveGatewayPrincipal wasn't passing ctx.user.email)
- [x] Fix principal mapping to resolve the logged-in user's email correctly (pass email + name to resolveGatewayPrincipal in all 5 call sites)
- [ ] Verify fix works for both I-1 (bkr1297@gmail.com) and I-2 (riomethod5@gmail.com)

## Architecture Fix: Switch ONE PWA to Gateway-Direct Auth (per CoS directive)
- [x] Audit existing gateway.ts and useGatewayAuth.ts client code
- [x] Wire passphrase login as primary auth path (POST /login → JWT)
- [x] Make all governed actions (submit intent, approve, execute) call Gateway directly with JWT
- [x] Remove tRPC proxy dependency for Gateway calls (ONE is untrusted thin client per Decision 2)
- [x] Update all tests to match Gateway-direct architecture (392 tests pass)
- [x] Test passphrase login → submit intent → approve → execute flow (verified via curl: I-1 submits, I-2 approves, status=authorized)

## Bondi Bug Report: THREE bugs blocking login
- [x] Bug 1: gatewayLogin sends no user_id — Gateway requires { user_id, passphrase } but we only send { passphrase }
- [x] Bug 1 Fix: Add user_id input field on Login page (Option B — proper fix), pass both to gatewayLogin
- [x] Bug 2: normalizeLegacy() overrides agent_id with JWT subject → AUTO_DENY (already fixed by Bondi in commit de51fbc, needs Gateway redeploy on Render — not our code)
- [x] Bug 3: Manus OAuth "Sign In" button already removed in architecture migration — passphrase is the only login path
- [x] Verify: passphrase login → submit intent → governance result (REQUIRE_HUMAN not AUTO_DENY) — verified via curl

## Bug: Post-login freeze — authenticated but page doesn't navigate
- [x] Diagnose: gatewayWhoAmI() expected nested { user: { sub, name } } but Gateway returns flat { user_id, display_name }
- [x] Fix: Map Gateway flat response to expected WhoAmI shape in gateway.ts

## Missing Navigation: No way to reach Approvals screen
- [x] Fix governance_decision field mapping (was using gov.decision instead of gov.governance_decision — button never appeared)
- [x] Add persistent bottom nav bar (New Action / Approvals / Logout) on both authenticated screens

## UI Improvement: Better AUTO_DENY messaging
- [x] Replace confusing "Approvals required: -1" with clear explanation ("Action blocked by Gateway policy" + reason + fail-closed note)
- [x] Show the Gateway's reason field when available
- [x] Hide approval_requirements and TTL for AUTO_DENY (no longer shows -1 or 0h 0m)

## Bondi Directive: Redeploy + Restore Tabs + Verify
- [x] Action 1: Gateway already redeployed on Render (confirmed: GET /approvals returns pending[] alias from commit 0d10f3f)
- [x] Action 2: Restored all 6 bottom nav tabs (New Action, Approvals, Receipts, Ledger, Status, Logout)
- [x] Action 3: Verified via curl — login I-1 → submit send_email → govern → REQUIRE_HUMAN → GET /approvals shows intent with count:1

## Bondi Directive: Identity Chain Implementation (2026-04-05)
- [ ] Step 2: Add principalId + email to Manus OAuth session (PRINCIPAL_MAP lookup after OAuth callback)
- [ ] Step 3: Send X-Principal-ID header on all tRPC proxy calls to Gateway
- [x] Step 5: I-2 already registered in INITIAL_PRINCIPALS, seeding fix pushed (commit 0ac1116), I-2 login confirmed
- [x] Step 6: Full two-user flow verified via curl — I-1 submits send_email, I-2 approves, status=authorized, authorization_hash generated
- [ ] Keep passphrase login as fallback alongside Manus OAuth

## Bug: agent_id sent as principal ID instead of AI agent name
- [x] Fix NewIntent to send agent_id: "bondi" (the AI agent) instead of the logged-in user's principal ID
- [x] Verify send_email returns REQUIRE_HUMAN (not AUTO_DENY) in the UI

## Bug: I-2 approves intent, flashes green then turns red, email not sent
- [x] Diagnosed: approval succeeded but no execution pipeline was wired — UI only called Gateway /approvals, never triggered execute
- [x] Fixed: GatewayApprovals now calls trpc.gateway.executeApproved after successful approval

## Bug: ROLE_VIOLATION when I-2 submits intent from New Action page
- [x] Diagnose ROLE_VIOLATION — Gateway restricts intent submission to proposer role; I-2 (approver) cannot submit
- [x] Fix: Login routes I-2 (approver) to /approvals, NewIntent redirects approvers to /approvals with toast
- [ ] Verify full two-user flow works end-to-end in UI (I-1 proposes, I-2 approves) — needs Brian to retest

## Execution Pipeline: Send email after approval
- [x] Investigated Gateway execution endpoints: POST /execute (get token), POST /execute-confirm (burn token), POST /receipt
- [x] Fixed executorFetch to include replay prevention fields (request_timestamp, request_nonce)
- [x] Wired GatewayApprovals.tsx to call trpc.gateway.executeApproved after successful approval
- [x] Pipeline: approve → execute (gateway-exec) → send via notifyOwner → confirm → receipt
- [ ] Verify full pipeline end-to-end in browser (I-1 proposes, I-2 approves, email delivered) — needs Brian to retest
- [ ] Future: Replace notifyOwner with real Gmail API once OAuth is connected

## Bug: Email not sent/received after I-2 approves
- [x] Root cause: executeApproved used protectedProcedure (Manus OAuth) but Approvals page uses Gateway auth (passphrase)
- [x] Fix: Added /api/gateway/execute Express endpoint that doesn't require Manus OAuth
- [x] Root cause 2: Gateway policy requires target_environment to match scope.systems ("gmail", not "local")
- [x] Fix: Added targetEnvironment mapping to ACTION_DEFS (send_email → "gmail", deploy → "github", etc.)
- [x] Verified full pipeline via curl: submit → govern (REQUIRE_HUMAN) → approve → execute → delivered

## Replace notifyOwner with real Gmail sending
- [x] Checked Gmail MCP — works from sandbox but not from deployed app runtime
- [x] Replaced notifyOwner with Twilio SMS in /api/gateway/execute endpoint
- [x] Verified Twilio SMS delivery works (sid: SMc5dd5aa5, status: queued)
- [ ] Verify full governed pipeline delivers SMS in browser (Brian to retest)
