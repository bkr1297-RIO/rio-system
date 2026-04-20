# RIO Use Cases: Real-World Applications

## Healthcare: Treatment Plan Approval

**Problem:**
- AI recommends treatment plans
- Need to prove executed plan matches approval
- HIPAA compliance requires audit trails
- Cannot allow AI to modify after approval

**RIO Solution:**
AI proposes treatment:
```json
{
  "patient_id": "PT-12345",
  "diagnosis": "Type 2 Diabetes",
  "interventions": [
    {
      "medication": "Metformin",
      "dosage": "500mg",
      "frequency": "twice daily"
    }
  ]
}
```

Clinician approves → System issues execution token → AI creates prescription (exact match) → Receipt proves no modification

**What This Prevents:**
- AI modifying treatment after approval
- AI prescribing different medication
- AI extending authority to other patients
- Tampering with audit trail

**Compliance:**
- HIPAA audit trail
- Non-repudiation
- Tamper-evident records
- Access control enforcement

---

## Finance: Trade Execution

**Problem:**
- AI executes trades based on market conditions
- Must prove trades stayed within parameters
- Regulators require authorization audit trail
- Cannot allow exceeding position limits

**RIO Solution:**
Trader defines strategy:
```json
{
  "symbol": "AAPL",
  "max_position": 10000,
  "max_order": 1000,
  "price_range": [170, 180],
  "time_window": "09:30-16:00"
}
```

AI proposes trades → Risk manager approves → System enforces caps → AI executes within bounds → Ledger records proof

**Caps enforced:**
```python
if cumulative_shares + new_order > max_shares:
    → DENY
if price < min or price > max:
    → DENY
```

**What This Prevents:**
- AI exceeding position limits
- AI trading outside price bounds
- Unlimited accumulation over time

**Regulatory Benefits:**
- MiFID II compliance
- Dodd-Frank audit
- Proof of best execution
- Risk limit enforcement

---

## DevOps: Code Deployment Pipeline

**Problem:**
- AI modifies code and deploys to production
- Need separation between edit/deploy authority
- Cannot allow deploying unreviewed changes
- Require audit trail for incidents

**RIO Solution:**

**Workflow A: Code Editing**
```json
{
  "intent": "Fix auth bug",
  "files": ["services/user/auth.ts"],
  "max_lines": 150,
  "time_limit": "30 minutes"
}
```

AI edits → Commits to branch → Artifacts tagged:
```json
{
  "artifact": "commit_abc123",
  "approval_status": "NOT_APPROVED",
  "state": "awaiting_review"
}
```

**Workflow B: Review**
Human reviews → Approves → Status updated:
```json
{
  "approval_status": "APPROVED"
}
```

**Workflow C: Deployment**
Deploy requested → Gate enforces Delegation Boundary:
```python
if artifact.origin_sequence != current_sequence:
    if artifact.approval_status != "APPROVED":
        → DENY
```

**What This Prevents:**
- Deploying without review
- Edit workflow directly deploying
- Bypassing review by chaining workflows

**DevOps Benefits:**
- Enforced code review
- Separation of edit/deploy authority
- Audit trail for incidents
- Rollback capability

---

## Customer Support: Refund Processing

**Problem:**
- AI processes refund requests
- Need to prevent excessive refunds
- Must enforce daily/weekly caps
- Require audit trail for reconciliation

**RIO Solution:**
AI evaluates refund:
```json
{
  "order_id": "12345",
  "refund_amount": 149.99,
  "reason": "Damaged product",
  "fraud_score": 0.05
}
```

System checks caps:
```json
{
  "daily_total": 2450.00,
  "daily_limit": 5000.00,
  "weekly_count": 42,
  "weekly_limit": 100
}
```

If within limits → Auto-approve → Issue token → AI processes → Caps updated atomically

**Atomic enforcement:**
```sql
BEGIN TRANSACTION
if daily_total + 149.99 <= 5000:
    daily_total += 149.99
    COMMIT
else:
    ROLLBACK
```

**What This Prevents:**
- Unlimited refunds
- Parallel requests exceeding caps
- Fraud via accumulated small refunds

**Business Benefits:**
- Automated processing within bounds
- Fraud prevention
- Financial reconciliation trail
- Manager escalation for high-risk

---

## Data Processing: Query Enforcement

**Problem:**
- AI processes sensitive customer data
- Need to enforce data access boundaries
- Cannot allow accessing data outside scope
- Must prevent data exfiltration

**RIO Solution:**
Define data scope:
```json
{
  "allowed_tables": ["sales_db.transactions"],
  "allowed_columns": ["date", "amount", "category"],
  "forbidden_columns": ["customer_name", "email", "credit_card"],
  "time_range": ["2026-01-01", "2026-03-31"],
  "max_rows": 100000
}
```

AI proposes query → Gate validates:
```python
if any(col in forbidden_columns):
    → DENY
if query_time_range not in allowed_range:
    → DENY
if no_aggregation_detected:
    → DENY (no raw PII export)
```

Execute with row limit → Audit trail records access

**What This Prevents:**
- AI accessing PII columns
- AI querying outside time range
- AI exporting raw customer data

**Compliance:**
- GDPR Article 32 (access controls)
- CCPA data minimization
- SOC 2 logical access
- Purpose limitation enforcement

---

## Common Patterns

**Bounded Authority:**
- Every workflow has explicit caps (time, quantity, scope)
- Authority expires automatically
- No accumulated power

**Cryptographic Proof:**
- Intent → Proposal → Approval → Execution all linked by hashes
- Tampering breaks chain
- Non-repudiable authorization

**Cross-Workflow Isolation:**
- Edit ≠ Deploy
- Access ≠ Export
- Approval required at boundaries

**Audit Trail:**
- Every decision recorded immutably
- Cryptographic receipts prove what happened
- Regulatory compliance built-in

**Multi-Agent Coordination:**
- Multiple AIs can’t combine to bypass
- Global caps enforced
- Forbidden combinations blocked

---

## When to Use RIO

**RIO is ideal when:**
- AI executes high-stakes actions (money, data, infrastructure)
- Need regulatory compliance (HIPAA, SOC 2, financial)
- Want to delegate but maintain control
- Need cryptographic proof
- Can’t tolerate silent failures

**RIO may be overkill when:**
- AI only generates text (low stakes)
- Human reviews every action anyway
- No audit requirements
- Trust-based governance sufficient

---

## Next Steps

1. Identify constraints: What should AI never do?
2. Define caps: Time, quantity, scope limits
3. Map workflow states: What approval gates exist?
4. Specify artifacts: What gets produced, who can consume?
5. Deploy: Use `guides/DEPLOYMENT_GUIDE.md`

See `QUICKSTART.md` for walkthrough.
