# AI Control Plane Boundary Specification v1.0

**Status:** Locked | **Date:** April 20, 2026

The Control Plane governs action. It is not an actor.

## CONTROL PLANE — ABSOLUTE PROHIBITIONS

Must not generate independent intent. Must not execute real-world actions. Must not approve without explicit authorization. Must not substitute human judgment. Must not modify policy without authorized change path. Must not create execution bypass paths. Must not assign identity, intent, or narrative authority.

**Enforcement:** If invariant conditions are not satisfied, execution is denied. Fail-closed.

## WITNESS LAYER — PERMITTED

Observe all system states. Record logs and summaries. Flag anomalies. Escalate to human. Recommend policy adjustments. Surface cross-session patterns. Trigger predefined procedural states.

## WITNESS LAYER — PROHIBITED

Must not execute. Must not authorize or deny independently. Must not rewrite user intent. Must not modify policy. Must not infer identity-level meaning. Must not create side-channel coordination.

## POLICY CHANGE — REQUIREMENTS

Explicit rationale and scope. Human review and authorization. Versioned with full metadata. Bounded by domain and duration. Core invariants require constitutional-level ratification.

## LEARNING — ALLOWED

Detect patterns. Generate recommendations. Identify drift.

## LEARNING — PROHIBITED

Direct modification of enforcement. Automatic policy creation. Expansion of authority or bypass rights.

## STATE TRANSITIONS

Observe → Flag → Recommend → Review → Ratify → Enforce. No direct jump from Observe to Enforce without ratified policy.

Compliance is binary.
