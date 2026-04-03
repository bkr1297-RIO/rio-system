# RIO Compliance Agent — Knowledge Base

## Regulatory Framework Mapping

### SOC 2 (Service Organization Control 2)

SOC 2 requires demonstrating controls around security, availability, processing integrity, confidentiality, and privacy. RIO addresses these through:

**Processing Integrity:** Every action produces a cryptographic receipt proving what was processed, by whom, and with what result. The hash-chained ledger provides tamper-evident records. Independent verification confirms processing integrity without trusting the system.

**Security:** Human-in-the-Loop enforcement ensures no unauthorized actions execute. Ed25519 cryptographic signatures prove authorization. Fail-closed design means security failures halt operations rather than allowing unauthorized access.

**Availability:** System status monitoring, kill switch for emergency stops, and notification system for operational awareness. Fail-closed design is documented as an intentional availability trade-off for security.

**Confidentiality:** Role-based access control, policy-based data handling rules, and audit trails for all data access operations.

### GDPR (General Data Protection Regulation)

**Article 22 (Automated Decision-Making):** RIO ensures human involvement in significant decisions through HITL enforcement. The approval queue provides meaningful human review, not rubber-stamping.

**Article 30 (Records of Processing Activities):** The ledger provides a complete, tamper-evident record of all processing activities with timestamps, actors, and outcomes.

**Article 35 (Data Protection Impact Assessment):** Risk assessment classifies every action by risk level. Policy rules can enforce additional scrutiny for data processing operations.

**Right to Explanation:** Receipts contain the AI agent's reasoning for each proposed action, providing explainability for automated decisions.

### HIPAA (Health Insurance Portability and Accountability Act)

**Access Controls:** HITL enforcement ensures no unauthorized access to protected health information (PHI). Every access attempt is recorded with cryptographic proof.

**Audit Controls:** Hash-chained ledger provides tamper-evident audit trail. Independent verification allows compliance auditors to confirm records without system access.

**Integrity Controls:** SHA-256 hashing ensures data integrity. Ed25519 signatures prove authenticity. Chain verification detects any tampering.

### Financial Regulations (SOX, PCI-DSS, Basel III)

**Transaction Authorization:** Every financial action requires explicit human approval with cryptographic signature. The approval is embedded in the receipt — you can prove who authorized what.

**Audit Trail:** Complete, immutable record of all transactions. Hash-chained ledger prevents retroactive modification. Independent verification available for auditors.

**Segregation of Duties:** The separation of powers model (proposer, approver, executor are distinct roles) maps directly to segregation of duties requirements.

## Audit Capabilities

### What RIO Can Prove

For any action in the system, RIO can mathematically prove:

1. **What was proposed** — the exact tool, arguments, and reasoning
2. **What risk level was assessed** — and which policy rules applied
3. **Who approved it** — cryptographic signature tied to a specific human
4. **When it was approved** — timestamp embedded in the signature
5. **What was executed** — the exact result returned
6. **When it was executed** — timestamp in the receipt
7. **That the record hasn't been altered** — hash chain verification

### What RIO Cannot Prove

RIO provides technical controls, not business guarantees:

1. **That the human actually read the proposal** — RIO proves they signed, not that they understood
2. **That the AI's reasoning was correct** — RIO records the reasoning but doesn't validate it
3. **That the execution result is truthful** — RIO records what the connector returned
4. **Compliance with specific regulations** — RIO provides controls; legal counsel determines compliance

### Audit Report Generation

The ledger viewer in ONE provides:
- Chain integrity verification (VALID or BROKEN with location)
- Filterable history by date, risk level, tool, status
- Exportable records for external audit tools
- Receipt-level detail with all cryptographic proofs

## Governance Policy Framework

### Risk Classification

| Tier | Examples | Default Behavior |
|---|---|---|
| LOW | Read email, search web, check calendar | Auto-approved, receipt generated |
| MEDIUM | Send email, create document, update record | Requires human approval |
| HIGH | Delete data, financial transaction, API key rotation | Requires approval + reasoning review |
| CRITICAL | Production deployment, bulk data operation, legal filing | Requires approval + kill switch check |

### Custom Policy Rules

Operators can create rules that override default risk classifications:
- Elevate risk for specific tools (e.g., "all email sends to external domains = HIGH")
- Require approval for normally auto-approved actions
- Add conditions (e.g., "if amount > $1000, require CRITICAL review")
- These rules are logged to the audit ledger when created or modified

### Kill Switch

The kill switch is an emergency control that immediately:
- Rejects all pending approval requests
- Prevents new actions from being proposed
- Logs the activation to the ledger with timestamp and reason
- Sends notifications to the operator

This satisfies "emergency stop" requirements in many regulatory frameworks.

## Key Phrases for Compliance Conversations

When explaining RIO's compliance value, use these framings:

- "RIO provides the technical controls to support your compliance requirements — your legal team determines how those controls map to specific regulations."
- "The difference between RIO and traditional logging is mathematical proof versus text records. Anyone with the public key can independently verify any receipt."
- "Fail-closed means the system errs on the side of safety. If governance is unavailable, actions stop — they don't proceed without oversight."
- "The receipt protocol is an open standard. This means your auditors can verify records independently, without needing access to our platform."
- "Human-in-the-Loop isn't just a checkbox — it's cryptographic. The approval signature proves a specific human authorized a specific action at a specific time."
