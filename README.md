# RIO — Receipt Protocol for Verifiable AI Actions

A minimal protocol that ensures AI actions execute exactly as approved—and produces proof that can be independently verified.

---

## Run it in 30 seconds

bash node demo.js 

You will see:

- valid action → ALLOW  
- modified action → BLOCK  
- tampered receipt → FAIL  

---

## Core Invariant

Nothing executes unless it exactly matches what was approved at the moment of execution—and that fact is provable.

---

## What This Is

This repository provides:

- a minimal reference implementation  
- a deterministic validation step before execution  
- a receipt format and verification mechanism  

It demonstrates how to:

- enforce exact-match execution  
- prevent silent or altered actions  
- generate proof that can be verified independently  

---

## System Flow

Language → Intent → Approval → Validation → Execution → Receipt → Verification

Validation is the control point.

If the approved intent and execution input do not match exactly:

→ execution is blocked

---

## Example — Controlled Action (Email)

### Intent submitted for approval

json {   "action": "send_email",   "target": "finance@company.com",   "parameters": {     "subject": "Q2 Report",     "body": "See attached report."   } } 

### Behavior

| Condition | Result |
|----------|--------|
| No approval | Blocked |
| Approved + exact match | Executes |
| Any change after approval | Blocked |

### Outcome

Only the approved action runs, and the result can be verified.

---

## How to Use This Pattern

To apply this in your system:

1. Represent intent in structured form  
2. Require explicit approval  
3. Validate execution against the approved intent  
4. Execute only if validation passes  
5. Generate a receipt  
6. Verify the receipt independently  

Pattern:

intent → approval → validation → execution → receipt → verification

---

## Integration

A minimal integration example is available:

/examples/integration/

Replace the execute step with your system:

- API calls  
- workflows  
- external actions  
- agent commands  

RIO sits between approval and execution.

---

## Receipt Model

RIO constructs a deterministic hash chain:

Intent Hash → Execution Hash → Receipt

Any change breaks verification.

---

## What This Repository Covers

This repository focuses on:

- validation before execution  
- receipt generation  
- verification  

It does not include:

- approval systems  
- policy engines  
- orchestration layers  

Those can be added independently.

---

## Repository Structure

demo.js generate_receipt.js verify_receipt.js test_tamper.js  examples/   valid_receipt.json   denied_receipt.json  examples/integration/   send_email_example.md  verifier/   index.html   verify.js  spec/   rio-overview.md   execution-validation-layer.md   rasmussen-construction.md  docs/   SECURITY_SUMMARY.md

---

## Dependencies

None. Uses Node.js built-in crypto.

---

## License

MIT

---

## One Line

If it changes, it doesn’t run.  
If it runs, you can prove it.