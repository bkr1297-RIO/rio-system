# RIO Skills Model

Skills are bounded capabilities that operate inside RIO without adding authority.

---

## Position in the Flow

Human  
↓  
Skills (clarify / audit / align)  
↓  
Decision Surface (human commits)  
↓  
RIO (enforce)  
↓  
Execution  
↓  
Receipt + Ledger (prove)

---

## Skill categories

### 1. Enforcement / Proof Skills

- check execution admissibility
- verify receipts and ledger

👉 expose RIO guarantees

---

### 2. Interaction Skills

- clarify intent
- detect ambiguity, drift, mismatch
- surface alignment issues

👉 protect the human–agent relationship

---

### 3. Builder / Operator / Auditor Skills

- build within constraints
- run and test the system
- audit behavior and integrity

👉 protect system evolution

---

## What skills do NOT do

- do not authorize
- do not execute
- do not override human decisions

Skills guide behavior; they do not confer authority.

---

## Review Pattern (Pre-Commit Governance)

For high-stakes or irreversible actions, RIO deployments MAY use a Review Pattern at the skills layer:

- multiple independent skills or agents review a proposal,
- the human observes convergence or disagreement,
- the human resolves differences,
- only then is a commit made.

This pattern:

- improves decision quality and confidence convergence,
- does not grant authority,
- does not replace the execution boundary,
- and is NOT required for RIO conformance.

It is an optional usage pattern, not part of the RIO standard.

---

## One rule

Skills guide behavior. RIO governs reality.
