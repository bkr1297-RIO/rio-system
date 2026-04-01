# RIO Receipt Protocol Glossary

This glossary defines the core terminology used throughout the RIO Receipt Protocol. It uses plain industry language to ensure clarity across engineering, compliance, and business teams.

### Action Request
A formal, immutable proposal for an AI system to perform a specific task. It defines exactly what will be done, to what target, with what parameters, and the assessed risk level.

### AI Recommendation
The output of an AI model evaluating an Action Request against organizational policy. It states whether the action should proceed, be blocked, or be escalated, along with the reasoning.

### Approval
The explicit, cryptographically signed authorization from a human (or designated proxy) permitting an Action Request to proceed. Approvals are time-limited and single-use.

### Controlled Execution
The process by which an authorized action is actually performed. Execution is "controlled" because it occurs behind a fail-closed gateway that mathematically verifies the Approval before allowing the action to touch external systems.

### Cryptographic Receipt
The final, immutable record of a completed action. It binds the Request, Recommendation, Approval, and Execution into a single document, secured by a digital signature and a cryptographic hash.

### Audit Log
An append-only, tamper-evident ledger where all Cryptographic Receipts are stored. It provides a chronological, mathematically verifiable history of all governed actions.

### Non-Repudiation
A property of the protocol ensuring that no party can deny their involvement in an action. Because Approvals and Receipts are cryptographically signed, the human cannot deny approving the action, and the system cannot deny executing it.

### Provenance
The complete, traceable history of a decision. In this protocol, provenance means being able to look at a final action and trace it backward through the Execution, the Approval, the AI Recommendation, and the original Request.
