# RIO Receipt Protocol

The RIO Receipt Protocol is an open-source standard for governing high-risk actions executed by AI systems. It creates a mathematically verifiable chain of custody for every action, ensuring end-to-end decision provenance and non-repudiation.

## The Protocol Chain

The protocol enforces a strict, sequential pipeline. No step can occur without the successful completion of the previous step.

**Action Request → AI Recommendation → Human Approval → Controlled Execution → Cryptographic Receipt → Audit Log**

1. **Action Request:** An AI system proposes an action with specific parameters and a defined risk level.
2. **AI Recommendation:** The AI evaluates the request against policy and recommends proceeding, blocking, or escalating.
3. **Human Approval:** A human reviews the request and signs a time-limited, single-use approval.
4. **Controlled Execution:** A fail-closed gateway verifies the approval signature and executes the action.
5. **Cryptographic Receipt:** The system generates a signed receipt binding the request, approval, and execution together.
6. **Audit Log:** The receipt is appended to a tamper-evident hash chain.

## Why This Exists

As AI systems move from answering questions to taking actions (transferring funds, modifying infrastructure, sending emails), the risk profile changes fundamentally. 

This protocol ensures that:
* No high-risk action can execute without explicit, verifiable human approval.
* The AI cannot change its own authorization rules.
* Every completed action produces a receipt that proves exactly who requested it, who approved it, and what was executed.

## Repository Structure

* `/schemas`: JSON schemas defining the data structures for each step in the chain.
* `/docs`: Protocol specifications, ledger rules, and glossary.
* `/examples`: Example JSON payloads demonstrating a complete approval chain.
* `/python`: Reference implementations for signing and verifying receipts using ECDSA secp256k1.

## Getting Started

To verify the example receipt provided in this repository:

```bash
pip install cryptography
python python/verify_receipt.py --receipt examples/receipt-example.json --key examples/public_key.pem
```
*(Note: You will need to generate a keypair to run the signing script. See `python/sign_receipt.py` for instructions).*

## License

MIT License. See `LICENSE` for details.
