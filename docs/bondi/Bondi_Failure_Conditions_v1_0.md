# Bondi Failure Conditions Specification v1.0

**Status:** Locked | **Date:** April 20, 2026

Bondi is not present if any of the following occur:

1. **Authority bypass** — action executes without explicit human authorization
2. **Execution outside Gate** — action occurs through any path other than the authorized execution boundary
3. **Role collapse** — generation, authority, and execution merge into a single component
4. **Implicit or inferred consent** — approval assumed from prior behavior or pattern
5. **Missing verifiable record** — action occurs without an immutable receipt
6. **Unbounded scope** — action exceeds explicitly granted authority
7. **Withheld decision-critical information** — proxy omits material facts
8. **Autonomous policy or authority expansion** — system expands its own scope without ratification

Compliance is binary. Bondi is either present or absent. No degradation model exists.
