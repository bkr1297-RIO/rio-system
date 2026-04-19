# TO: manny@example.com, "riomethod5@gmail.com" <riomethod5@gmail.com>
# SUBJECT: Directive — Prepare Enforcement Implementation Plans

Manny,  
  
Do not begin enforcement coding until Andrew's specs are finalized.  
  
PREPARATION PHASE:  
While Andrew is writing the foundational specs, prepare detailed implementation plans  
for the following enforcement areas. For each area, define:  
  1. Implementation Plan (what needs to be built)  
  2. Code Path (which files, which functions, which gates)  
  3. Verification Path (how we test that enforcement is non-bypassable)  
  
ENFORCEMENT AREAS:  
  
1\. ROLE ENFORCEMENT  
   What: Load identity and roles from spec. Verify agent has permission for action.  
   Where: gateway/governance/role-check.mjs  
   Gates: Identity gate checks agent role before any action proceeds  
   Test: Verify unrecognized agent is blocked. Verify agent without role cannot execute outside scope.  
  
2\. POLICY EVALUATION ENGINE  
   What: Load policy schema. Evaluate intent against policy rules. Determine approval requirements.  
   Where: gateway/governance/policy-engine.mjs  
   Gates: Policy gate determines which actions are allowed, what approval level is required  
   Test: Verify auto-approve actions execute without human. Verify escalation actions require approval. Verify policy violations are blocked.  
  
3\. CAS + LEDGER BOUNDARY  
   What: Content-addressable storage for artifacts. Append-only ledger for execution records.  
   Where: gateway/storage/cas.mjs and gateway/ledger/ledger.mjs  
   Gates: Execution gate writes to CAS. ATLAS gate writes to ledger.  
   Test: Verify CAS is immutable (hash changes if content changes). Verify ledger cannot be modified or deleted.  
  
4\. ACTIVE AUDIT  
   What: Before receipt is finalized, verify execution matched approved plan.  
   Where: gateway/audit/active-audit.mjs  
   Gates: Audit gate runs BEFORE receipt generation (not after)  
   Test: Verify approval existed. Verify execution matched approval. Verify policy was not violated. Verify ledger entries exist.  
  
5\. META-GOVERNANCE ENFORCEMENT  
   What: Policy and roles can be changed, but only through governance (approval + audit).  
   Where: gateway/governance/meta-governance.mjs  
   Gates: Policy change gate requires Admin approval. Change is logged in ledger. Old policy cannot be modified (only new version created).  
   Test: Verify policy change requires approval. Verify old policy is preserved. Verify new policy takes effect immediately.  
  
CRITICAL CONSTRAINT:  
You are building the enforcement layer that makes governance non-bypassable.  
This is not application logic. This is security infrastructure.  
Every gate must fail-closed. Every violation must be logged.  
  
ACTIVE AUDIT REQUIREMENT:  
Active audit must verify execution matches approved plan BEFORE receipt finalization.  
This is not a post-execution audit. This is a gate that blocks receipt generation if execution violates policy.  
  
Do not begin coding these areas until:  
  1. Andrew's specs are finalized  
  2. You have reviewed and understood the specs  
  3. You have approval from Brian to begin  
  
Timeline:  
  Phase: Spec writing (Andrew)  
  Your task: Prepare implementation plans  
  Next: Begin enforcement coding once specs are locked  
  
— Brian