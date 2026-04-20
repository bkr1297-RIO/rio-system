# PGTC Terminology

This document defines the normative vocabulary for the Pre-execution Governance and Trust Chain (PGTC) standard. All terms used in the specification, test suite, and compliance report carry the meanings defined below.

---

## Intent

A human or system-level expression of a desired action. An intent is not executable. It represents what the actor wants to happen, not the mechanism by which it happens.

## Intent Packet

A canonical structured representation of intent. The packet is the unit of governance. If a field is not in the packet, it MUST NOT be executed. The packet includes a unique `packet_id`, the `action` to perform, `parameters`, a `nonce`, a `timestamp`, and a cryptographic `signature`.

## Canonical Form

Deterministic serialization used for hashing. Canonical form MUST:

- Sort keys lexicographically
- Exclude undefined fields
- Normalize nulls to `null`
- Use consistent encoding (UTF-8, no trailing whitespace)

The canonical form ensures that identical logical content always produces the same hash.

## Intent Hash

Cryptographic digest of the canonical packet. Computed as `HASH(canonical(packet))`. The intent hash binds the authorization to the exact content of the packet.

## Approval

A human or policy decision that a given intent should proceed. Approval is a governance event, not an execution event.

## Authorization

A machine-verifiable artifact derived from approval. An authorization includes the `intent_hash`, a `nonce`, an `expiry`, and a cryptographic `signature`. It is the only artifact that can unlock the Gate.

## Nonce

A single-use identifier. Reuse of a nonce MUST halt execution. The nonce prevents replay attacks by ensuring each authorization is unique.

## Gate

The single enforcement boundary. All execution MUST pass through the Gate. The Gate verifies the authorization, checks the nonce, validates the signature, enforces TES constraints, and evaluates context restrictions. If any check fails, the Gate halts execution.

## Adapter

The only component allowed to perform side effects. No execution occurs outside an adapter. Adapters are closure-isolated, credential-scoped, and instrumented for auditing.

## Execution

A state-changing action performed by an adapter after Gate approval. Execution is the only point in the pipeline where external side effects occur.

## Pre-Record

A ledger record created before execution. The pre-record (WAL PREPARED) establishes that the system committed to attempting the action.

## Receipt

A post-execution proof. The receipt records the outcome, the intent hash, the execution result, and a timestamp. It is the system's evidence that the action was performed.

## Ledger Entry

A hash-linked append-only record. Each entry contains a `prev_hash` linking it to the previous entry, forming a tamper-evident chain. Entries record both allowed and blocked actions.

## Lineage

The complete chain from intent to ledger: intent → authorization → execution → receipt → ledger. Lineage is the proof that every step in the governance pipeline was completed.

## Outcome

The result of execution. Outcomes are validated against expected shapes before being recorded. Invalid outcomes halt the pipeline.

## Trajectory

An ordered sequence of actions. A trajectory represents a multi-step workflow where each step is individually governed.

## Trajectory Envelope (TES)

Constraints on allowed paths within a trajectory. TES defines which action classes are permitted, which state transitions are valid, and which resource scopes are allowed.

## Blocked Action

An attempted but rejected action. Every blocked action MUST produce a ledger entry recording the reason for rejection.

## Fail-Closed

The system's default behavior on any failure. Any error, missing field, invalid signature, expired token, or unrecognized state MUST halt execution. The system never fails open.
