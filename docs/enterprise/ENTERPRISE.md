# RIO / ONE for Enterprise

*Intelligence proposes. Authority remains human.*

This document provides an overview of RIO / ONE for enterprise clients, addressing common questions and outlining the engagement process.

## Frequently Asked Questions

**Q: Does this slow down our employees?**  
A: Initially, yes—approval adds a step. But the system learns: routine low-risk actions get pre-approved, only novel/high-risk actions require human review. Within 30 days, approval overhead drops to <5% of actions.

**Q: Can we customize policies for different departments?**  
A: Absolutely. Marketing might have different policies than Finance. Engineering different from Legal. Policies are role-based and department-specific.

**Q: What if an employee needs to act quickly in an emergency?**  
A: Emergency override procedures can be configured. CEO or designated emergency approver can bypass normal workflows. All overrides are logged and flagged for review.

**Q: How do we know the audit trail hasn’t been tampered with?**  
A: The ledger uses SHA-256 hash chaining—each entry includes the hash of the previous entry. Any tampering breaks the chain, which is immediately detectable. We provide cryptographic verification tools. For more details on ledger integrity, refer to [Ledger Integrity Job](../monitoring/ledger_integrity_job.mjs) and the [RIO Governance Gateway Architecture](../../gateway/ARCHITECTURE.md).

**Q: What happens if RIO / ONE goes down?**  
A: Fail-closed: AI cannot execute actions. But if you need emergency access, you can configure fallback procedures. We have 99.9% uptime SLA for managed deployments. For more on our security model, see [Threat Model](../../THREAT_MODEL.md) and [Verification Results](../../VERIFICATION_RESULTS.md).

**Q: Can we migrate from our current AI tools?**  
A: Yes. RIO / ONE sits on top of existing tools—you don’t replace anything. Migration is additive: we add governance to what you already use.

**Q: How long until we see ROI?**  
A: Most enterprises see positive ROI within 3 months from:

- Risk mitigation (avoided violations)
- Productivity gains (AI-assisted work)
- Audit cost reduction (automated compliance)

-----

## Next Steps

### 1. Discovery Call (30 minutes)

- Understand your AI governance needs
- Review current AI usage and risks
- Discuss compliance requirements
- Outline potential deployment

### 2. Technical Deep Dive (60 minutes)

- Architecture walkthrough
- Security and compliance Q&A
- Integration planning
- Custom connector discussion

### 3. Pilot Proposal (1 week)

- Custom deployment plan
- Pilot user selection
- Success metrics definition
- Pricing and timeline

### 4. Pilot Deployment (4-6 weeks)

- Install in pilot environment
- Configure policies and connectors
- Train pilot users
- Measure results

### 5. Enterprise Rollout

- Expand to full organization
- Ongoing optimization
- Quarterly business reviews

-----

## Contact

**Enterprise Sales**  
enterprise@rio-one.io  
+1 (555) 123-4567

**Schedule Demo**  
calendly.com/rio-one/enterprise-demo

**Documentation**  
docs.rio-one.io/enterprise

**Security & Compliance**  
security@rio-one.io

-----

March 2026

[Back to README.md](../../README.md)
[Three-Power Separation](../../spec/THREE_POWER_SEPARATION.md)
[RIO Governance Gateway Architecture](../../gateway/ARCHITECTURE.md)
[Verification Results](../../VERIFICATION_RESULTS.md)
