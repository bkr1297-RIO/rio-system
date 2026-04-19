# PGTC Compliance

This document defines the criteria for determining whether a system is PGTC-compliant.

---

## Definition

A system is **PGTC-compliant** if and only if:

1. It implements the PGTC processing model as defined in `processing-model.md`.
2. It passes all tests in the PGTC test suite for the declared version and profile.

Compliance is **binary**. A system is either compliant or it is not. There is no partial compliance.

---

## Compliance Dimensions

Compliance is determined per:

| Dimension | Description |
|-----------|-------------|
| **Version** | The PGTC specification version (e.g., v0.1) |
| **Profile** | The compliance profile (e.g., FULL, CORE) |
| **Test Suite** | The specific test suite used for verification |

A compliance claim MUST specify all three dimensions.

---

## Test Requirements

**ALL** tests in the declared test suite MUST pass. A single failure renders the system non-compliant for that version and profile.

The test suite is organized into five categories:

| Category | Tests | Scope |
|----------|-------|-------|
| AUTH | 4 | Authentication and authorization binding |
| PGE | 4 | Pre/post governance enforcement |
| TES | 4 | Transition and execution state enforcement |
| GATE | 4 | Gate enforcement boundary |
| LEDGER | 3 | Ledger integrity |

Plus one baseline test (PASS-001) verifying the complete happy path.

---

## Compliance Report

A compliance report MUST include:

- System under test (name, version, commit hash)
- PGTC specification version
- Date of test execution
- Test suite identifier
- Per-test results (PASS/FAIL with evidence)
- Overall verdict (COMPLIANT / NOT COMPLIANT)

---

## Non-Compliance

A system that fails any test is **NOT COMPLIANT**. The compliance report MUST identify which tests failed and the observed behavior that caused the failure.
