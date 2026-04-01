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
- [ ] Full restore E2E: enter passphrase → decrypt → keys in IndexedDB → policy restored → ledger synced → approval works (requires Brian's passphrase)

## Logo + Corpus + Gmail Fix
- [x] Upload sacred geometry icon (IMG_6712.PNG) as app logo and favicon
- [x] Clone rio-system repo and read corpus/foundation-v1 branch content
- [x] Integrate corpus files (policy-v0.3.json, identity, directives, witness records, build specs) into shared/corpus/
- [x] Update Jordan system prompt with Policy v0.3 GREEN/YELLOW/RED zones from corpus
- [x] Fix send_email red error: wired via notifyOwner transport (not Gmail API — delivers to owner via Manus notification)
- [x] Wire draft_email as LIVE connector (returns draft content, never sends)
- [x] Unit tests: 24 connector tests in connectors.test.ts (send_email, draft_email, DEFERRED, ARGS_HASH_MISMATCH, receipts)
- [x] Browser E2E: verify send_email intent → approval → execute → receipt → ledger with notifyOwner path
- [ ] True Gmail OAuth connector: replace notifyOwner transport with real Gmail API (requires Google Cloud project + OAuth consent)

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
- [ ] Blocked on: Brian creates bot via @BotFather + provides TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID

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
- [ ] Test: Telegram notification fires on intent creation (mocked)
- [ ] Test: Telegram notification skipped when not configured
