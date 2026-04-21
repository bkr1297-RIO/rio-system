# Governed Corpus Specification v1.0

**Status:** Proposed | **Date:** April 20, 2026

The Governed Corpus is the unified observation and memory substrate of a RIO-governed system. It combines the witness function (MANTIS) and the immutable record function (Ledger) into a single named layer.

**Function:** Observes all system states, transitions, approvals, denials, and execution outcomes. Retains append-only cryptographically verified records. Surfaces patterns and context when queried by authorized parties.

**Invariants:** Never executes. Never authorizes. Never modifies the primary record. Provides only when queried through authorized channels. Does not initiate.

**Relationship to other layers:** Receives from the Ledger. Informs human and Bondi through pattern surfacing only. No direct connection to the Gate.

**Compliance:** A system is compliant if the Governed Corpus remains strictly observational and its outputs are treated as advisory only.
