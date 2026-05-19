# ONE/RIO/MUSS Governance Starter v0.1.1

This directory is a starter harness for governed boundary behavior in ONE/RIO/MUSS.

It provides:

- a three-layer architecture baseline
- governance-as-code policy rules
- a signed receipt schema
- an illustrative append-only ledger example
- a deterministic policy evaluator
- conformance fixtures for key RIO invariants
- unit tests proving the evaluator preserves boundary semantics

## Rule precedence

When multiple rules or safeguards apply, the evaluator uses **most restrictive verdict wins**.

```text
DENY > REQUIRE_HUMAN_APPROVAL > PREAUTHORIZED_EXTERNAL > ALLOW_WITH_RECEIPT > ALLOW_INTERNAL
```

This precedence is declared in `policy-schema.yaml` and read at runtime by the evaluator.

## Core invariants

The conformance cases enforce these governance invariants:

- language output is not authority
- confidence is not consent
- memory is not scope
- receipt is not future authorization
- quantum result is not execution permission
- simulator quantum task may be advisory-only with receipt
- hardware quantum task requires explicit human approval
- credential use and money movement deny by default

## Approval semantics

To avoid ambiguity between a rule class and the state of a specific request, the evaluator returns:

- `policy_verdict` — the governing class of the action
- `approval_satisfied` — whether required approval has been satisfied for this instance
- `governance_state` — a human-readable lifecycle state such as `AWAITING_HUMAN_APPROVAL` or `APPROVED_AFTER_HUMAN_REVIEW`

This means a request can correctly remain in the `REQUIRE_HUMAN_APPROVAL` class while also becoming executable only after explicit human approval is recorded.

## Example ledger note

Example ledger values are **illustrative** and are not cryptographically generated. The placeholder hashes, signatures, and public keys exist to demonstrate structure only. A later version can replace them with real hash-chain and signing logic.

## Install

Python 3.10+ is recommended.

```bash
cd governance-starter-v0.1.1
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run tests

```bash
cd governance-starter-v0.1.1
python -m unittest discover -s tests -p "test_*.py" -v
```

## Quick usage

```bash
cd governance-starter-v0.1.1
python - <<'PY'
from src.governance.policy_evaluator import PolicyEvaluator

evaluator = PolicyEvaluator("policy-schema.yaml")
request = {
    "principal": "brian",
    "requested_action": "run_quantum_task",
    "tool_scope": "qiskit_runtime",
    "backend_mode": "simulator",
    "consequence_class": "low",
    "data_class": "internal",
    "approval_mode": "auto",
    "scope": {"problem_type": "optimization", "result_mode": "advisory"}
}
print(evaluator.evaluate(request))
PY
```

## Directory layout

```text
governance-starter-v0.1.1/
├── ARCHITECTURE.md
├── README.md
├── policy-schema.yaml
├── receipt-schema.json
├── example-ledger.jsonl
├── requirements.txt
├── src/
│   ├── __init__.py
│   └── governance/
│       ├── __init__.py
│       └── policy_evaluator.py
└── tests/
    ├── __init__.py
    ├── policy_cases.json
    └── test_policy_evaluator.py
```
