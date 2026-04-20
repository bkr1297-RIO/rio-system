> Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

Internet-Draft               RIO Protocol                    April 2026
Intended status: Standards Track
Expires: October 3, 2026

                 Relational Intelligence Operations (RIO)
      An Authorization and Commit Protocol for Governed AI Systems
                 draft-rio-governance-00

Abstract

   This document specifies the Relational Intelligence Operations (RIO)
   protocol.  RIO is an authorization and commit protocol for governed
   AI systems.  RIO defines a token model, state machine, and receipt
   format that make it structurally impossible to execute a governed
   action without a valid authorization token, and structurally
   impossible to commit an action without generating a verifiable
   receipt and writing it to an append-only ledger.  RIO is intended to
   support interoperable implementations across heterogeneous agents,
   services, and organizations.

Status of This Memo

   This Internet-Draft is submitted in full conformance with the
   provisions of BCP 78 and BCP 79.

   Internet-Drafts are working documents of the Internet Engineering
   Task Force (IETF).  Note that other groups may also distribute
   working documents as Internet-Drafts.  The list of current Internet-
   Drafts is at https://datatracker.ietf.org/drafts/current/.

   Internet-Drafts are draft documents valid for a maximum of six months
   and may be updated, replaced, or obsoleted by other documents at any
   time.  It is inappropriate to use Internet-Drafts as reference
   material or to cite them other than as "work in progress."

Copyright Notice

   Copyright (c) 2026 IETF Trust and the persons identified as the
   document authors.  All rights reserved.

Table of Contents

   1.  Introduction
   2.  Terminology and Conventions
   3.  Architecture Overview
   4.  Invariants and Authority Model
   5.  Token Model
       5.1.  intent_token
       5.2.  approval_token
       5.3.  execution_token
       5.4.  Token Validity and Revocation
   6.  State Machine for Governed Actions
       6.1.  States
       6.2.  Allowed Transitions
       6.3.  Forbidden Transitions
       6.4.  Transition Preconditions
   7.  Authorization and Commit Protocol
       7.1.  Intent Registration
       7.2.  Approval Collection
       7.3.  Authorization Decision
       7.4.  Execution
       7.5.  Receipt Generation and Commit
   8.  Receipts and Ledger
       8.1.  Receipt Model
       8.2.  Hash Linking
       8.3.  Ledger Requirements
       8.4.  Right to History
   9.  Kill Switch Semantics
       9.1.  Kill Switch Events
       9.2.  Effects on Tokens
       9.3.  Effects on Execution
       9.4.  Resumption
       9.5.  Ledger Recording
   10. Subject Profile and Policy Binding
   11. RIO APIs (Non-Exhaustive)
       11.1.  POST /rio/intents
       11.2.  POST /rio/approvals
       11.3.  POST /rio/authorize
       11.4.  POST /rio/execute
       11.5.  POST /rio/kill
   12. Security Considerations
       12.1. Authentication and Channel Security
       12.2. Replay Protection
       12.3. Receipt Integrity and Transparency
       12.4. Kill Switch Governance
       12.5. Minimal Security Profile (Normative)
   Appendix A. Risk Bands (Informative but Recommended)
   Appendix B. RIO Governed Action State Machine (Mermaid)
   Appendix C. Canonical JSON Flows (Informative)

1.  Introduction

   Modern AI agents and automation systems can generate and refine
   complex intents and plans, but they MUST NOT be allowed to execute
   high-impact real-world actions without explicit authorization and
   durable, auditable records of what they did.

   The Relational Intelligence Operations (RIO) protocol defines a
   structured way to:

   *  Register governed intents.

   *  Collect and record approvals where required.

   *  Issue authorization tokens that permit specific executions.

   *  Enforce that no governed action executes without such a token.

   *  Require that no action is considered committed until a receipt is
      generated and written to a ledger.

   RIO is not only an authorization server.  RIO is an authorization
   AND commit protocol.  Execution of a governed action is not
   considered complete under this protocol until a conformant receipt
   is generated and durably recorded on an append-only ledger.

   The core invariants of RIO are:

   *  No valid execution_token => no execution.

   *  No conformant receipt => no commit.

   These are protocol-level invariants, not recommendations.

2.  Terminology and Conventions

2.1.  Normative Language

   The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
   "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this
   document are to be interpreted as described in RFC 2119.

2.2.  Core Terms

   Subject:
      An authenticated human or system principal on whose behalf a
      governed action is requested.

   Agent:
      An AI system, automation workflow, or software service that
      proposes or executes actions.

   Action:
      A concrete operation with potential external side effects
      (e.g., payment.create, email.send, record.update).

   Resource:
      The object(s) acted upon (e.g., account, customer record, file,
      infrastructure resource).

   Governed Action:
      An action that is subject to RIO policies and MUST be authorized
      and committed through this protocol.

   intent_token:
      A structured, signed representation of a proposed governed action
      (the intent).  It does NOT authorize execution.

   approval_token:
      A structured, signed representation of a human or delegated
      approval that binds to a specific intent_token.

   execution_token:
      A structured, signed authorization that permits a specific
      governed action to be executed under defined constraints.

   Receipt:
      A structured, signed record that links intent, approvals,
      authorization, and execution outcomes and is written to a ledger.

   Ledger:
      An append-only, tamper-evident store of receipts.

   Kill Switch:
      A protocol mechanism that temporarily halts the issuance and/or
      use of execution_token values in a given scope.

2.3.  Informal Naming Conventions

   Some implementations MAY refer to:

   *  intent_token as "C-intent".

   *  approval_token as "A-token".

   *  execution_token as "E-ticket".

   These names are non-normative and are not required for
   interoperability.

3.  Architecture Overview

   RIO sits between intent-generating components (e.g., AI agents,
   planners) and effectful executors (e.g., payment services, email
   gateways, infrastructure APIs).

   At a high level:

   *  Intent registration produces an intent_token.

   *  Required approvals produce one or more approval_token instances.

   *  Policy evaluation over the intent_token, approval_token set,
      Subject, and context produces an execution_token or a denial.

   *  Executors MUST verify execution_token values before acting.

   *  After execution, the executor MUST report the outcome to RIO.

   *  RIO MUST generate a Receipt and write it to the ledger before the
      action is considered committed.

   RIO does not perform the domain-specific action itself.  RIO
   authorizes, governs, and commits actions performed by other
   components.

4.  Invariants and Authority Model

4.1.  Human Authority

   For classes of high-risk or high-impact Governed Actions, policies
   MUST require explicit human approvals or explicit delegated authority
   before an execution_token can be issued.

   Implementations MUST be able to express which actions, resources, or
   risk bands require human approvals and which roles are acceptable
   approvers.

4.2.  Fail-Closed Behavior

   If RIO is unreachable, or if RIO cannot produce a definitive
   authorization decision for a Governed Action, executors MUST treat
   the action as NOT AUTHORIZED and MUST NOT execute it.

4.3.  Separation of Roles

   For Governed Actions in configured risk bands, the same logical
   principal MUST NOT unilaterally:

   *  Register the intent,

   *  Provide the required approval(s), and

   *  Execute the action.

   RIO policies MAY enforce additional separation-of-duty requirements.

4.4.  Authorization Invariant

   No executor MUST execute a Governed Action unless the executor has
   validated a current, non-revoked execution_token that:

   *  Binds to the specific intent_token (by identifier and cryptographic
      reference).

   *  Covers the requested Action and Resource(s).

   *  Is within its validity window.

   *  Satisfies any policy-defined contextual constraints.

4.5.  Commit Invariant

   A Governed Action MUST NOT be considered committed (e.g., visible in
   durable state, completed in business terms) unless:

   *  RIO has generated a conformant Receipt for the execution, and

   *  The Receipt has been durably written to the ledger (or to a
      durable queue for ingestion into the ledger according to local
      rules).

   Implementations MAY maintain temporary state while a Receipt is in
   progress, but MUST treat the action as non-committed until a Receipt
   is written.

4.6.  Policy Binding

   Every Governed Action MUST be associated with a specific policy
   version identifier.  That identifier MUST appear in the corresponding
   Receipt and in the relevant tokens.

4.7.  Risk Bands

   The `risk_band` field MUST be used to route Governed Actions to
   appropriate controls. At minimum, implementations SHOULD distinguish
   LOW, MEDIUM, and HIGH risk bands. Policies MUST define, per
   risk_band:

   *  Whether human approvals are required and, if so, the number and
      roles of approvers.

   *  Whether additional mitigations are required (e.g., sandboxing,
      dry-run, reduced limits).

   *  Whether Kill Switch behavior is stricter (e.g., HIGH risk actions
      may be globally halted).

5.  Token Model

   Tokens are signed, verifiable artifacts. Implementations MAY choose
   their own serialization formats (e.g., JSON Web Tokens, CBOR, etc.),
   but MUST preserve the semantics defined in this section.

5.1.  intent_token

   An intent_token represents a proposed Governed Action.

   A conformant intent_token MUST include at least:

   *  intent_id: globally unique identifier.

   *  subject_id: identifier of the Subject on whose behalf the action
      is requested.

   *  agent_id: identifier of the Agent that generated the intent.

   *  action: machine-readable action name.

   *  resource: identifiers or scopes of the target Resource(s).

   *  risk_band: a value indicating the risk class (e.g., LOW, MEDIUM,
      HIGH).

   *  policy_version: identifier of the applied policy set.

   *  created_at: timestamp.

   *  expires_at: timestamp.

   *  signature or MAC ensuring authenticity and integrity.

   An intent_token MUST NOT, by itself, authorize execution. Executors
   MUST treat any request that presents only an intent_token as NOT
   AUTHORIZED.

5.2.  approval_token

   An approval_token represents a human (or delegated) approval for a
   specific intent_token under defined conditions.

   A conformant approval_token MUST include at least:

   *  approval_id: globally unique identifier.

   *  intent_id: identifier of the associated intent_token.

   *  approver_id: identity of the approver.

   *  approver_role: role or authority classification.

   *  decision: APPROVE or DENY.

   *  constraints: OPTIONAL structured constraints (e.g., maximum
      amount, time window).

   *  created_at: timestamp.

   *  expires_at: timestamp.

   *  signature or MAC of the approver or approval system.

   Policies MAY require one or more approval_token values for a given
   Governed Action.  Policies MUST define aggregation rules (e.g.,
   N-of-M).

5.3.  execution_token

   An execution_token authorizes an executor to perform a specific
   Governed Action under defined constraints.

   A conformant execution_token MUST include at least:

   *  execution_token_id: globally unique identifier.

   *  intent_id: identifier of the associated intent_token.

   *  approval_ids: list of approval_id values used (if any).

   *  subject_id: identifier of the Subject.

   *  executor_class: identifier of the permitted executor type or
      identity class.

   *  action: authorized action name.

   *  resource: authorized resource identifiers or scopes.

   *  risk_band: risk classification.

   *  policy_version: policy identifier used for the authorization
      decision.

   *  created_at: timestamp.

   *  not_before: timestamp.

   *  expires_at: timestamp.

   *  usage_limit: OPTIONAL limit on number of executions (default 1).

   *  signature or MAC of the RIO authority.

   An execution_token MUST be single-use by default.  If usage_limit is
   greater than 1, executors MUST track usage and MUST NOT exceed the
   limit.

5.3.1.  Executor Binding

   An execution_token SHOULD be cryptographically or logically bound to
   a specific executor identity or class of executors. This binding MAY
   be represented via:

   *  A stable executor_id corresponding to a service identity
      recognized by RIO (e.g., mTLS client cert subject, OIDC subject).

   *  A claim set describing an executor class (e.g., “payments-service
      in prod cluster”).

   RIO MUST record the executor binding inside the execution_token, and
   executors MUST authenticate using a credential that RIO can map to
   that binding. A conformant implementation MUST reject any attempt to
   use an execution_token from an executor that does not satisfy the
   binding.

5.4.  Token Validity and Revocation

   All tokens (intent_token, approval_token, execution_token) MUST have
   explicit expiry times.

   RIO MUST provide a mechanism to revoke tokens prior to expiry (e.g.,
   due to Kill Switch, policy change, or incident).

   Executors MUST check token validity (including revocation status)
   before each use.  Cached tokens without freshness or validity checks
   MUST NOT be used for high-risk Governed Actions.

6.  State Machine for Governed Actions

6.1.  States

   The protocol defines the following abstract states for a Governed
   Action:

   *  NEW_INTENT

   *  INTENT_REGISTERED

   *  PENDING_APPROVAL

   *  APPROVED

   *  AUTHORIZED

   *  EXECUTING

   *  EXECUTED

   *  COMMITTED

   *  ROLLED_BACK

   *  CANCELLED

6.2.  Allowed Transitions

   The following transitions are permitted:

   *  NEW_INTENT -> INTENT_REGISTERED

   *  INTENT_REGISTERED -> PENDING_APPROVAL (when approvals are
      required)

   *  INTENT_REGISTERED -> AUTHORIZED (for actions not requiring
      approvals)

   *  PENDING_APPROVAL -> APPROVED (required approvals satisfied)

   *  PENDING_APPROVAL -> CANCELLED (intent withdrawn or denied)

   *  APPROVED -> AUTHORIZED (RIO issues execution_token)

   *  AUTHORIZED -> EXECUTING (executor starts action using
      execution_token)

   *  AUTHORIZED -> CANCELLED (authorization withdrawn before execution)

   *  EXECUTING -> EXECUTED (executor completes action)

   *  EXECUTED -> COMMITTED (RIO generates Receipt and writes to ledger)

   *  EXECUTED -> ROLLED_BACK (a reversible undo is successfully
      executed and recorded)

6.3.  Forbidden Transitions

   The following transitions MUST NOT occur:

   *  Any state -> EXECUTING without AUTHORIZED.

   *  Any state -> COMMITTED without EXECUTED.

   *  Any state -> COMMITTED without a conformant Receipt.

   *  CANCELLED -> EXECUTING or AUTHORIZED.

6.4.  Transition Preconditions

   *  INTENT_REGISTERED: A valid intent_token MUST exist.

   *  APPROVED: Required approval_token instances MUST exist and be
      valid.

   *  AUTHORIZED: RIO MUST have evaluated policy and issued a valid
      execution_token.

   *  EXECUTING: Executor MUST have validated the execution_token,
      including kill-switch status and executor binding.

   *  COMMITTED: RIO MUST have generated and durably written a Receipt
      referencing the execution.

7.  Authorization and Commit Protocol

7.1.  Intent Registration

   Clients register intents with RIO via an API.  On success, RIO
   returns an intent_token.

   RIO MUST validate that the Subject and Agent are authenticated and
   authorized to register intents of the requested type.

7.2.  Approval Collection

   When approvals are required, RIO or an integrated approval system
   collects approvals and emits approval_token instances bound to the
   intent_token.

   RIO MUST evaluate whether the set of approvals satisfies policy
   (e.g., roles, N-of-M, risk_band-specific rules).

7.3.  Authorization Decision

   RIO evaluates the combination of:

   *  intent_token,

   *  approval_token set,

   *  Subject, Agent, Resource context,

   *  Current risk posture and Kill Switch state,

   *  Policy version,

   and produces either:

   *  A valid execution_token (AUTHORIZED state), or

   *  A denial with a reason.

7.4.  Execution

   Executors MUST:

   *  Validate the execution_token, including expiry, revocation,
      executor binding, and Kill Switch effects.

   *  Verify that the requested Action and Resource(s) match those
      encoded in the execution_token.

   Executions without a valid execution_token MUST be rejected.

7.5.  Receipt Generation and Commit

   After execution, the executor reports the outcome to RIO (e.g., via
   an API call).  The report MUST at minimum include:

   *  execution_token_id,

   *  actual Action and Resources affected,

   *  outcome status (SUCCESS / FAILURE),

   *  outcome identifiers (e.g., transaction IDs),

   *  timestamps.

   RIO MUST:

   *  Generate a Receipt linking the execution to the intent_token,
      approval_token set, and execution_token.

   *  Write the Receipt to the ledger.

   The Governed Action MUST NOT be treated as COMMITTED until this
   write succeeds or is durably queued according to implementation
   rules.

7.5.1.  Provisional vs Final Commit

   Implementations MAY distinguish between provisional commit and final
   commit:

   *  Provisional commit: execution has occurred and a Receipt has been
      generated locally, but inclusion in a remote or third-party ledger
      is pending.

   *  Final commit: the Receipt is durably stored and, where applicable,
      accompanied by an inclusion proof from a transparency or audit
      log.

   For high-risk Governed Actions, policies SHOULD require that full
   business effects (e.g., irreversible payouts) are gated on final
   commit rather than provisional commit. If the ledger or audit log is
   unavailable, RIO-compliant systems SHOULD degrade to read-only or
   provisional modes, not silent full access.

8.  Receipts and Ledger

8.1.  Receipt Model

   A conformant Receipt MUST contain at least:

   *  receipt_id: globally unique identifier.

   *  receipt_type: e.g., INTENT, APPROVAL, AUTHORIZATION, EXECUTION,
      KILL_SWITCH.

   *  intent_id.

   *  approval_ids (if applicable).

   *  execution_token_id (for authorization and execution receipts).

   *  subject_id.

   *  action.

   *  resource identifiers or scopes.

   *  policy_version.

   *  outcome_status (for execution receipts).

   *  outcome_reference (e.g., transaction ID).

   *  created_at.

   *  previous_receipt_ids or hashes to establish linkage.

   *  cryptographic hash of key payload fields.

   *  signature or MAC of the RIO authority.

8.2.  Hash Linking

   Receipts SHOULD be linked as follows:

   *  INTENT receipts have no required previous_receipt_ids.

   *  APPROVAL receipts reference the associated INTENT receipt.

   *  AUTHORIZATION receipts reference INTENT and APPROVAL receipts.

   *  EXECUTION receipts reference the AUTHORIZATION receipt.

   Kill Switch receipts MAY reference affected scopes or last-known
   receipts for that scope.

8.3.  Ledger Requirements

   The ledger MUST be logically append-only and tamper-evident.

   Implementations MAY use different underlying technologies (e.g.,
   databases with hash chains, distributed ledgers), but MUST be able to
   prove that receipts have not been modified without detection.

   For each Governed Action, implementations MUST be able to reconstruct
   the full chain of receipts from the ledger.

8.4.  Right to History

   Any conformant RIO implementation MUST be able, given access to the
   ledger, to reconstruct the complete chain of receipts for a Governed
   Action, from intent through approval and authorization to execution
   and commit.

   RIO-compliant ledgers SHOULD provide inclusion proofs or equivalent
   cryptographic evidence that a given Receipt is part of the
   append-only history. Clients that rely on RIO for accountability MAY
   require such evidence before trusting a Receipt for high-risk
   decisions.

9.  Kill Switch Semantics

9.1.  Kill Switch Events

   Kill Switch events are represented as special receipts with
   receipt_type = KILL_SWITCH.

   A Kill Switch ON event MUST include:

   *  scope: description of affected Actions, Resources, Subjects, or
      Agents.

   *  reason: human-readable explanation.

   *  actor_id: identity that asserted the Kill Switch.

   *  created_at.

9.2.  Effects on Tokens

   When a Kill Switch ON is active for a scope:

   *  RIO MUST NOT issue new execution_token values for Governed Actions
      within that scope.

   *  RIO MUST mark existing execution_token values in that scope as
      revoked for future use.

   *  intent_token and approval_token issuance MAY continue, but MUST
      NOT lead to AUTHORIZED for that scope until Kill Switch is OFF.

   RIO MUST ensure that any future validity checks against revoked
   execution_token values return a clear revocation status.

9.3.  Effects on Execution

   Executors MUST check execution_token validity at or immediately
   before each Governed Action.  If RIO indicates that a Kill Switch ON
   invalidates the token or scope, the executor MUST NOT execute.

9.4.  Resumption

   When Kill Switch OFF is asserted for a scope:

   *  RIO MAY begin issuing new execution_token values for that scope.

   *  Previously invalidated execution_token values MUST remain invalid
      unless explicitly re-authorized via new tokens.

9.5.  Ledger Recording

   Kill Switch ON and OFF events MUST be recorded as Receipts on the
   ledger.

10.  Subject Profile and Policy Binding

   Implementations MUST maintain subject profiles including identity,
   roles, and applicable policy sets.

   Policy bindings MUST be reflected in:

   *  intent_token (policy_version),

   *  execution_token (policy_version),

   *  Receipts (policy_version).

10.1.  Policy Version Semantics

   The `policy_version` field in tokens and Receipts MUST uniquely
   identify the policy set and configuration used in the decision.
   Implementations MUST retain historical policy definitions so that an
   auditor can reconstruct “what the policy said” at decision time.
   When policy_version changes, RIO SHOULD treat previously issued
   execution_token values as suspect and MAY require re-authorization
   under the new version, according to local risk management rules.

11.  RIO APIs (Non-Exhaustive)

   This section gives a non-exhaustive JSON-over-HTTP binding.  Other
   transports MAY be used if they preserve semantics.

11.1.  POST /rio/intents

   Request (example):

   ```json
   {
     "subject_id": "user-123",
     "agent_id": "agent-planner-1",
     "action": "payment.create",
     "resource": {
       "from_account": "acct-001",
       "to_account": "acct-999",
       "amount": "1000.00",
       "currency": "USD"
     },
     "risk_band": "HIGH",
     "policy_version": "policy-2026-04-01"
   }
