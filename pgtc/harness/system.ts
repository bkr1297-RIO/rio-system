/**
 * PGTC System Interface
 * ═══════════════════════════════════════════════════════════════
 * The testable contract that wraps all RIO enforcement primitives.
 *
 * ALL execution must go through system.execute().
 * No direct side effects allowed.
 *
 * This is the ONLY entry point the PGTC test suite uses.
 */

import { createHash, createHmac, randomUUID } from "crypto";
import {
  type IntentEnvelope,
  type GovernanceDecision,
  type ExecutionToken,
  type WitnessReceipt,
  verifyIntentEnvelope,
  evaluateGovernance,
  issueExecutionToken,
  executeGatePreflight,
  canonicalJsonStringify,
  computeHash,
  createIntentEnvelope,
  _clearNonces,
  _clearTokens,
} from "../../server/rio/controlPlane";
import {
  enforceGate,
  evaluateContext,
  type GateDecision,
} from "../../server/rio/gate";
import {
  evaluateTES,
  setTES as setTESConfig,
  resetTES,
  type TESConfig,
  type TESResult,
} from "../../server/rio/tes";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface PGTCPacket {
  // Required fields
  intent_id: string;
  action: string;
  target: string;
  parameters: Record<string, unknown>;
  nonce: string;
  timestamp: number;
  signature: string;
  actor_id: string;
  source_type: "HUMAN" | "AI_AGENT" | "SYSTEM" | "API";
  // Schema-aligned fields (Task 3)
  packet_id?: string;           // Unique packet identifier
  packet_version?: string;      // PGTC spec version (default: "0.1")
  hash_alg?: string;            // Hash algorithm (default: "SHA-256")
  canon_alg?: string;           // Canonicalization algorithm (default: "JCS")
  trajectory_id?: string | null; // Trajectory identifier, if multi-step
  step_id?: string | null;       // Step within trajectory
  x_extensions?: Record<string, unknown>; // Implementation-specific extensions
  // Existing optional fields
  resource?: string;
  target_state?: string;
}

export interface PGTCToken {
  /** If provided, overrides the real token for mutation tests */
  override_intent_hash?: string;
  override_action_hash?: string;
  override_expires_at?: number;
  override_used?: boolean;
  skip_token?: boolean;
}

export interface ExecutionResult {
  execution: "ALLOW" | "HALT";
  reason?: string;
  receipt?: WitnessReceipt;
  gate_decision?: GateDecision;
  tes_result?: TESResult;
  adapter_output?: unknown;
}

export interface AdapterCall {
  adapter: string;
  method: string;
  args: Record<string, unknown>;
  timestamp: number;
  source: "system.execute" | "direct" | "hidden";
}

export interface LedgerEntry {
  index: number;
  entry_type: string;
  status: "ALLOWED" | "BLOCKED";
  reason: string | null;
  intent_hash: string;
  timestamp: number;
  prev_hash: string;
  entry_hash: string;
  payload: Record<string, unknown>;
  // Schema-aligned fields (Task 3)
  entry_id?: string;            // Unique entry identifier
  hash_alg?: string;            // Hash algorithm (default: "SHA-256")
  x_extensions?: Record<string, unknown>; // Implementation-specific extensions
}

export interface OutcomeValidator {
  (action: string, result: unknown): { valid: boolean; reason?: string };
}

// ═══════════════════════════════════════════════════════════════
// SYSTEM STATE
// ═══════════════════════════════════════════════════════════════

const SIGNING_SECRET = "pgtc-test-signing-secret-v1";

const adapterCalls: AdapterCall[] = [];
const ledger: LedgerEntry[] = [];
const consumedNonces = new Set<string>();
const flags: Record<string, unknown> = {};
let outcomeValidator: OutcomeValidator | null = null;

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function getLastHash(): string {
  if (ledger.length === 0) return "GENESIS";
  return ledger[ledger.length - 1].entry_hash;
}

function appendToLedger(
  entryType: string,
  status: "ALLOWED" | "BLOCKED",
  reason: string | null,
  intentHash: string,
  payload: Record<string, unknown>,
): LedgerEntry {
  const prev_hash = getLastHash();
  const index = ledger.length;
  const timestamp = Date.now();

  const entry_hash = sha256(canonicalJsonStringify({
    index,
    entry_type: entryType,
    status,
    reason,
    intent_hash: intentHash,
    timestamp,
    prev_hash,
    payload,
  }));

  // Verify chain integrity before appending
  if (ledger.length > 0) {
    const lastEntry = ledger[ledger.length - 1];
    if (prev_hash !== lastEntry.entry_hash) {
      throw new Error("HASH_CHAIN_BROKEN: prev_hash does not match last entry hash");
    }
  }

  const entry: LedgerEntry = {
    index,
    entry_type: entryType,
    status,
    reason,
    intent_hash: intentHash,
    timestamp,
    prev_hash,
    entry_hash,
    payload,
    // Schema-aligned fields (Task 3)
    entry_id: `ENT-${randomUUID()}`,
    hash_alg: "SHA-256",
  };

  ledger.push(entry);
  return entry;
}

// ═══════════════════════════════════════════════════════════════
// THE SYSTEM CONTRACT
// ═══════════════════════════════════════════════════════════════

export const system = {
  get ledger(): ReadonlyArray<LedgerEntry> {
    return ledger;
  },

  get adapterCalls(): ReadonlyArray<AdapterCall> {
    return adapterCalls;
  },

  flags,

  reset(): void {
    ledger.length = 0;
    adapterCalls.length = 0;
    consumedNonces.clear();
    resetTES();
    outcomeValidator = null;
    _clearNonces();   // Clear controlPlane nonce store
    _clearTokens();   // Clear controlPlane token store
    for (const key of Object.keys(flags)) {
      delete flags[key];
    }
  },

  setTES(config: Partial<TESConfig>): void {
    setTESConfig(config);
  },

  setOutcomeValidator(validator: OutcomeValidator): void {
    outcomeValidator = validator;
  },

  /**
   * THE ONLY EXECUTION PATH.
   *
   * Pipeline:
   *   1. TES enforcement (action class, state transition, scope)
   *   2. Nonce replay check (local)
   *   3. Build envelope + verify via controlPlane
   *   4. Governance evaluation
   *   5. Issue real execution token via controlPlane
   *   6. (Optional) Apply token mutations for testing
   *   7. Gate preflight + context evaluation
   *   8. Pre-record (WAL PREPARED)
   *   9. Adapter execution (instrumented)
   *  10. Outcome validation
   *  11. Post-record (WAL COMMITTED)
   *  12. Mark nonce consumed
   */
  async execute(packet: PGTCPacket, tokenOverrides?: PGTCToken): Promise<ExecutionResult> {
    const intentHash = sha256(canonicalJsonStringify({
      intent_id: packet.intent_id,
      action: packet.action,
      target: packet.target,
      parameters: packet.parameters,
      nonce: packet.nonce,
    }));

    // ─── Step 1: TES enforcement ───
    const tesResult = evaluateTES({
      action: packet.action,
      target_state: packet.target_state,
      resource: packet.resource ?? packet.target,
    });

    if (!tesResult.allowed) {
      appendToLedger("TES_BLOCK", "BLOCKED", tesResult.reason, intentHash, {
        action: packet.action,
        tes_checks: tesResult.checks,
      });
      return { execution: "HALT", reason: tesResult.reason ?? "TES_ENFORCEMENT_FAILED", tes_result: tesResult };
    }

    // ─── Step 2: Nonce replay check ───
    if (consumedNonces.has(packet.nonce)) {
      appendToLedger("NONCE_REPLAY", "BLOCKED", "NONCE_REPLAY", intentHash, {
        nonce: packet.nonce,
      });
      return { execution: "HALT", reason: "NONCE_REPLAY" };
    }

    // ─── Step 3: Verify packet signature (HMAC) ───
    const sigPayload = JSON.stringify({
      intent_id: packet.intent_id,
      action: packet.action,
      target: packet.target,
      parameters: packet.parameters,
      nonce: packet.nonce,
      timestamp: packet.timestamp,
    });
    const expectedSig = createHmac("sha256", SIGNING_SECRET).update(sigPayload).digest("hex");
    if (packet.signature !== expectedSig) {
      appendToLedger("AUTH_BLOCK", "BLOCKED", "INVALID_SIGNATURE", intentHash, {
        expected: expectedSig.substring(0, 8) + "...",
        received: (packet.signature || "").substring(0, 8) + "...",
      });
      return { execution: "HALT", reason: "INVALID_SIGNATURE" };
    }

    // ─── Step 4: Build envelope and verify via controlPlane ───
    const envelope = createIntentEnvelope({
      intentId: packet.intent_id,
      userId: parseInt(packet.actor_id) || 1,
      sourceType: packet.source_type,
      toolName: packet.action,
      toolArgs: packet.parameters,
      signature: packet.signature,
    });
    // Sync envelope fields with packet
    (envelope as any).target = packet.target;

    const verification = verifyIntentEnvelope(envelope, {
      requireSignature: true,
    });

    if (!verification.verified) {
      appendToLedger("AUTH_BLOCK", "BLOCKED", verification.failure_reasons.join("; "), intentHash, {
        verification_id: verification.verification_id,
        failures: verification.failure_reasons,
      });
      return { execution: "HALT", reason: verification.failure_reasons.join("; ") };
    }

    // ─── Step 4: Governance evaluation ───
    const toolMeta = { riskTier: "LOW", blastRadiusBase: 2 };
    const governance = evaluateGovernance(envelope, verification, toolMeta);

    // ─── Step 5: Skip token if requested ───
    if (tokenOverrides?.skip_token) {
      appendToLedger("TOKEN_MISSING", "BLOCKED", "NO_TOKEN", intentHash, {});
      return { execution: "HALT", reason: "NO_TOKEN" };
    }

    // ─── Step 6: Issue REAL execution token ───
    const realToken = issueExecutionToken(envelope, governance);

    // ─── Step 7: Apply token mutations for testing ───
    const tokenForGate: ExecutionToken = { ...realToken };
    if (tokenOverrides?.override_intent_hash !== undefined) {
      tokenForGate.intent_hash = tokenOverrides.override_intent_hash;
    }
    if (tokenOverrides?.override_action_hash !== undefined) {
      tokenForGate.action_hash = tokenOverrides.override_action_hash;
    }
    if (tokenOverrides?.override_expires_at !== undefined) {
      tokenForGate.expires_at = tokenOverrides.override_expires_at;
    }
    if (tokenOverrides?.override_used !== undefined) {
      tokenForGate.used = tokenOverrides.override_used;
    }

    // ─── Step 8: Context evaluation ───
    const contextEval = evaluateContext(envelope);

    // ─── Step 9: Gate enforcement ───
    const gateDecision = enforceGate(tokenForGate, envelope, governance, contextEval);

    if (!gateDecision.final_allow) {
      const failedChecks = gateDecision.preflight_checks.filter(c => c.status === "FAIL");
      const gateReason = failedChecks.map(c => c.detail).join("; ") ||
        gateDecision.context_restrictions.join("; ") ||
        "GATE_DENIED";
      appendToLedger("GATE_BLOCK", "BLOCKED", gateReason, intentHash, {
        preflight_checks: gateDecision.preflight_checks,
        context_restrictions: gateDecision.context_restrictions,
      });
      return { execution: "HALT", reason: gateReason, gate_decision: gateDecision };
    }

    // ─── Step 10: Pre-record (WAL PREPARED) ───
    appendToLedger("WAL_PREPARED", "ALLOWED", null, intentHash, {
      action: packet.action,
      target: packet.target,
      token_id: realToken.token_id,
    });

    // ─── Step 11: Adapter execution (instrumented) ───
    let adapterOutput: unknown;
    try {
      const call: AdapterCall = {
        adapter: packet.action,
        method: "perform",
        args: packet.parameters,
        timestamp: Date.now(),
        source: "system.execute",
      };
      adapterCalls.push(call);

      adapterOutput = {
        success: true,
        action: packet.action,
        target: packet.target,
        executedAt: Date.now(),
      };
    } catch (err: any) {
      appendToLedger("WAL_FAILED", "BLOCKED", err.message, intentHash, {
        error: err.message,
      });
      return { execution: "HALT", reason: err.message };
    }

    // ─── Step 12: Outcome validation ───
    if (outcomeValidator) {
      const validation = outcomeValidator(packet.action, adapterOutput);
      if (!validation.valid) {
        appendToLedger("OUTCOME_INVALID", "BLOCKED", validation.reason ?? "INVALID_OUTCOME", intentHash, {
          output: adapterOutput,
          validation_reason: validation.reason,
        });
        return { execution: "HALT", reason: validation.reason ?? "INVALID_OUTCOME" };
      }
    }

    // ─── Step 13: Post-record (WAL COMMITTED) ───
    appendToLedger("WAL_COMMITTED", "ALLOWED", null, intentHash, {
      action: packet.action,
      receipt_hash: sha256(JSON.stringify(adapterOutput)),
    });

    // ─── Step 14: Mark nonce as consumed ───
    consumedNonces.add(packet.nonce);

    return {
      execution: "ALLOW",
      gate_decision: gateDecision,
      tes_result: tesResult,
      adapter_output: adapterOutput,
    };
  },

  directAdapterCall(adapter: string, method: string, args: Record<string, unknown>): unknown {
    const call: AdapterCall = {
      adapter,
      method,
      args,
      timestamp: Date.now(),
      source: "direct",
    };
    adapterCalls.push(call);
    return { ungoverned: true, adapter, method };
  },

  attemptHiddenSideEffect(target: string, payload: Record<string, unknown>): unknown {
    const call: AdapterCall = {
      adapter: "HIDDEN",
      method: "raw_effect",
      args: { target, ...payload },
      timestamp: Date.now(),
      source: "hidden",
    };
    adapterCalls.push(call);
    return { ungoverned: true, hidden: true, target };
  },
};

export type PGTCSystem = typeof system;
