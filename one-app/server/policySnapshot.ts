/**
 * Policy Snapshot Isolation Guard
 * ═══════════════════════════════════════════════════════════════
 * 
 * Rule:
 *   Policy snapshot MUST be constructed and frozen BEFORE any
 *   operational context is read.
 * 
 * Invariant:
 *   Same policy version + different operational context
 *   → identical snapshot_hash.
 *   Decision may vary. Snapshot must not.
 * 
 * The snapshot captures ONLY:
 *   - policy_id (versioned)
 *   - policy_hash (SHA-256 of canonical policy JSON)
 *   - rules (the governance rules object)
 *   - root_public_key (who signed the policy)
 *   - policy_signature (root signature over policy_hash)
 *   - activated_at (when this version was activated)
 * 
 * The snapshot does NOT include:
 *   - Risk assessments, signals, or scores
 *   - Intent parameters or tool arguments
 *   - Retry counts, log entries, or operational state
 *   - Timestamps of the current operation
 *   - Any context that varies between operations
 */

import { createHash } from "crypto";
import { canonicalJsonStringify } from "./controlPlane";
import type { SignedPolicy, GovernancePolicyRules } from "./authorityLayer";

// ═══════════════════════════════════════════════════════════════
// SNAPSHOT TYPE
// ═══════════════════════════════════════════════════════════════

/**
 * Frozen policy snapshot — immutable after construction.
 * Contains only policy-derived fields. No operational context.
 */
export interface PolicySnapshot {
  readonly policy_id: string;
  readonly policy_hash: string;
  readonly rules: Readonly<GovernancePolicyRules>;
  readonly root_public_key: string;
  readonly policy_signature: string;
  readonly activated_at: string;
  readonly snapshot_hash: string;
  readonly frozen_at: string;
}

// ═══════════════════════════════════════════════════════════════
// SNAPSHOT CONSTRUCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Build a policy snapshot from the active signed policy.
 * 
 * MUST be called BEFORE any operational context (risk assessment,
 * intent parameters, signals, retries) is read.
 * 
 * The snapshot_hash is computed over the canonical JSON of the
 * policy-only fields. This hash is deterministic: the same policy
 * version always produces the same snapshot_hash, regardless of
 * when or in what operational context it is constructed.
 * 
 * The returned object is frozen (Object.freeze) to prevent
 * any downstream code from mutating the snapshot.
 */
export function buildPolicySnapshot(policy: SignedPolicy): PolicySnapshot {
  if (!policy) {
    throw new Error("SNAPSHOT_ERROR: Cannot build snapshot — no policy provided");
  }
  if (policy.status !== "ACTIVE") {
    throw new Error(`SNAPSHOT_ERROR: Cannot build snapshot from ${policy.status} policy — only ACTIVE policies allowed`);
  }

  // Extract ONLY policy-derived fields — no operational context
  const snapshotFields = {
    policy_id: policy.policy_id,
    policy_hash: policy.policy_hash,
    rules: policy.rules,
    root_public_key: policy.root_public_key,
    policy_signature: policy.policy_signature,
    activated_at: policy.activated_at,
  };

  // Compute snapshot_hash over canonical JSON of policy-only fields
  const canonical = canonicalJsonStringify(snapshotFields);
  const snapshot_hash = createHash("sha256").update(canonical).digest("hex");

  const snapshot: PolicySnapshot = {
    ...snapshotFields,
    rules: Object.freeze({ ...policy.rules }),
    snapshot_hash,
    frozen_at: new Date().toISOString(),
  };

  // Freeze the snapshot — no mutations allowed downstream
  return Object.freeze(snapshot);
}

// ═══════════════════════════════════════════════════════════════
// SNAPSHOT VERIFICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Verify a snapshot_hash by recomputing it from the snapshot's
 * policy-only fields.
 * 
 * Returns true if the hash matches — proving the snapshot was
 * not tampered with after construction.
 */
export function verifySnapshotHash(snapshot: PolicySnapshot): boolean {
  const snapshotFields = {
    policy_id: snapshot.policy_id,
    policy_hash: snapshot.policy_hash,
    rules: snapshot.rules,
    root_public_key: snapshot.root_public_key,
    policy_signature: snapshot.policy_signature,
    activated_at: snapshot.activated_at,
  };

  const canonical = canonicalJsonStringify(snapshotFields);
  const recomputed = createHash("sha256").update(canonical).digest("hex");

  return recomputed === snapshot.snapshot_hash;
}

/**
 * Compare two snapshots for identity.
 * Returns true if they have the same snapshot_hash — meaning
 * they were built from the same policy version.
 */
export function snapshotsMatch(a: PolicySnapshot, b: PolicySnapshot): boolean {
  return a.snapshot_hash === b.snapshot_hash;
}
