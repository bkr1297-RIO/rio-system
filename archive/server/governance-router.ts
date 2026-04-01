/**
 * RIO Governance Router — Phase B Dual-Mode Dispatch
 *
 * This module sits between the tRPC router and the governance backends.
 * It decides whether to route governance operations through:
 *   - The internal engine (server/rio.ts) — Phase A / fallback
 *   - The external gateway (gateway-client.ts) — Phase B / canonical
 *
 * Routing rules:
 *   1. If GATEWAY_URL is not set → internal engine (Phase A)
 *   2. If GATEWAY_URL is set → gateway for NEW actions (Phase B)
 *   3. Verification always checks BOTH (gateway first, then internal)
 *   4. Ledger reads merge results from both sources
 *
 * FAIL-CLOSED: If the gateway is configured but unreachable,
 * new governance operations are BLOCKED — not silently routed internally.
 * Only read-only operations (verify, ledger, audit) fall back to internal.
 */

import {
  createGatewayClient,
  isGatewayHealthy,
  RioGatewayClient,
  GatewayUnreachableError,
  type GatewayIntent,
  type GatewayAuthorizeRequest,
  type GatewayExecuteConfirmRequest,
} from "./gateway-client";

import {
  createIntent as internalCreateIntent,
  approveIntent as internalApproveIntent,
  denyIntent as internalDenyIntent,
  executeIntent as internalExecuteIntent,
  getAuditLog as internalGetAuditLog,
  verifyReceiptById as internalVerifyReceiptById,
  getLedgerChain as internalGetLedgerChain,
  getLearningAnalytics as internalGetLearningAnalytics,
} from "./rio";

// ── Singleton ───────────────────────────────────────────────────────────

let gatewayClient: RioGatewayClient | null = null;
let initialized = false;

/**
 * Initialize the governance router.
 * Call once at server startup. Reads GATEWAY_URL from env.
 */
export function initGovernanceRouter(): { mode: "gateway" | "internal" } {
  gatewayClient = createGatewayClient();
  initialized = true;
  const mode = gatewayClient ? "gateway" : "internal";
  console.log(`[RIO Governance Router] Mode: ${mode.toUpperCase()}`);
  return { mode };
}

/**
 * Get the current routing mode.
 */
export function getRoutingMode(): "gateway" | "internal" | "uninitialized" {
  if (!initialized) return "uninitialized";
  return gatewayClient ? "gateway" : "internal";
}

/**
 * Get the gateway client (for advanced operations).
 * Returns null if in internal mode.
 */
export function getGatewayClient(): RioGatewayClient | null {
  return gatewayClient;
}

// ── Intent Lifecycle (Write Operations) ─────────────────────────────────

/**
 * Create a new intent.
 * Phase B: Routes to gateway. Fail-closed if gateway unreachable.
 * Phase A: Routes to internal engine.
 */
export async function createIntent(
  action: string,
  description: string,
  requestedBy: string
) {
  if (gatewayClient) {
    const intent: GatewayIntent = {
      action,
      description,
      agent_id: requestedBy,
      parameters: {},
    };
    const result = await gatewayClient.submitIntent(intent);
    // Map gateway response to internal format for UI compatibility
    return {
      id: result.intent_id,
      intentId: result.intent_id, // Alias for frontend compatibility
      action: result.action,
      description,
      requestedBy,
      status: result.status,
      intentHash: result.intent_hash,
      createdAt: result.timestamp,
      source: "gateway" as const,
    };
  }

  // Internal engine (Phase A)
  const result = await internalCreateIntent(action, description, requestedBy);
  return { ...result, source: "internal" as const };
}

/**
 * Create intent and run governance evaluation in one step.
 * Only available in gateway mode.
 */
export async function createAndGovern(
  action: string,
  description: string,
  requestedBy: string
) {
  if (gatewayClient) {
    const intent: GatewayIntent = {
      action,
      description,
      agent_id: requestedBy,
      parameters: {},
    };
    const { intent: intentResult, governance } = await gatewayClient.submitAndGovern(intent);
    return {
      intent: {
        id: intentResult.intent_id,
        action: intentResult.action,
        description,
        requestedBy,
        status: intentResult.status,
        intentHash: intentResult.intent_hash,
        createdAt: intentResult.timestamp,
      },
      governance: {
        status: governance.governance_status,
        riskLevel: governance.risk_level,
        requiresApproval: governance.requires_approval,
        reason: governance.reason,
        governanceHash: governance.governance_hash,
      },
      source: "gateway" as const,
    };
  }

  // Internal engine doesn't have a separate govern step — it's embedded in the pipeline
  const result = await internalCreateIntent(action, description, requestedBy);
  return {
    intent: { ...result },
    governance: {
      status: "evaluated",
      riskLevel: "medium",
      requiresApproval: true,
      reason: "Internal engine — all actions require human approval",
      governanceHash: null,
    },
    source: "internal" as const,
  };
}

/**
 * Approve an intent.
 * Phase B: Routes to gateway with Ed25519 signature support.
 * Phase A: Routes to internal engine.
 */
export async function approveIntent(
  intentId: string,
  decidedBy: string,
  options?: { signature?: string; signatureTimestamp?: string }
) {
  if (gatewayClient) {
    const req: GatewayAuthorizeRequest = {
      intent_id: intentId,
      decision: "approved",
      authorized_by: decidedBy,
      signature: options?.signature,
      signature_timestamp: options?.signatureTimestamp,
    };
    const result = await gatewayClient.authorize(req);
    return {
      intentId: result.intent_id,
      decision: result.decision || "approved",
      decidedBy: result.authorized_by || decidedBy,
      authorizationHash: result.authorization_hash,
      ed25519Signed: result.ed25519_signed,
      signature: result.authorization_hash ? result.authorization_hash.slice(0, 32) + "..." : "gateway-signed",
      timestamp: result.timestamp,
      source: "gateway" as const,
    };
  }

  const result = await internalApproveIntent(intentId, decidedBy);
  return { ...result, source: "internal" as const };
}

/**
 * Deny an intent.
 * Phase B: Routes to gateway.
 * Phase A: Routes to internal engine.
 */
export async function denyIntent(
  intentId: string,
  decidedBy: string,
  options?: { signature?: string; signatureTimestamp?: string }
) {
  if (gatewayClient) {
    const req: GatewayAuthorizeRequest = {
      intent_id: intentId,
      decision: "denied",
      authorized_by: decidedBy,
      signature: options?.signature,
      signature_timestamp: options?.signatureTimestamp,
    };
    const result = await gatewayClient.authorize(req);
    return {
      intentId: result.intent_id,
      decision: result.decision || "denied",
      decidedBy: result.authorized_by || decidedBy,
      authorizationHash: result.authorization_hash,
      timestamp: result.timestamp,
      source: "gateway" as const,
    };
  }

  const result = await internalDenyIntent(intentId, decidedBy);
  return { ...result, source: "internal" as const };
}

/**
 * Execute an approved intent.
 * Phase B: Gets execution token from gateway, then confirms result.
 * Phase A: Routes to internal engine.
 */
export async function executeIntent(intentId: string) {
  if (gatewayClient) {
    // Step 4: Get execution token from gateway
    const execResult = await gatewayClient.execute(intentId);
    // Normalize to match internal format so frontend always sees the same shape
    return {
      allowed: execResult.status === "execution_authorized",
      httpStatus: execResult.status === "execution_authorized" ? 200 : 403,
      intentId: execResult.intent_id,
      status: execResult.status,
      receipt: null as Record<string, unknown> | null, // Receipt comes from generateReceipt() in gateway mode
      ledger_entry: null as Record<string, unknown> | null, // Ledger entry comes from gateway receipt flow
      executionToken: execResult.execution_token,
      instruction: execResult.instruction,
      timestamp: execResult.timestamp,
      message: execResult.instruction || "Gateway execution authorized",
      source: "gateway" as const,
    };
  }

  const result = await internalExecuteIntent(intentId);
  return { ...result, source: "internal" as const };
}

/**
 * Confirm execution result (gateway mode only).
 * After the connector executes the action, report the result back.
 */
export async function confirmExecution(
  intentId: string,
  executionResult: Record<string, unknown>,
  connector?: string
) {
  if (!gatewayClient) {
    throw new Error("confirmExecution is only available in gateway mode");
  }

  const req: GatewayExecuteConfirmRequest = {
    intent_id: intentId,
    execution_result: executionResult,
    connector,
  };
  const result = await gatewayClient.executeConfirm(req);
  return {
    intentId: result.intent_id,
    status: result.status,
    executionHash: result.execution_hash,
    connector: result.connector,
    timestamp: result.timestamp,
    source: "gateway" as const,
  };
}

/**
 * Generate a cryptographic receipt (gateway mode only).
 * In internal mode, receipts are generated automatically during execution.
 */
export async function generateReceipt(intentId: string) {
  if (!gatewayClient) {
    throw new Error("generateReceipt is only available in gateway mode — internal engine generates receipts automatically");
  }

  const result = await gatewayClient.generateReceipt(intentId);
  return {
    receiptId: result.receipt_id,
    intentId: result.intent_id,
    action: result.action,
    hashChain: result.hash_chain,
    authorizedBy: result.authorized_by,
    timestamp: result.timestamp,
    source: "gateway" as const,
  };
}

// ── Read Operations (Dual-Source) ───────────────────────────────────────

/**
 * Verify a receipt.
 * Checks gateway first (if available), then falls back to internal.
 * Read-only: does NOT fail-closed on gateway unreachable.
 */
export async function verifyReceipt(receiptId: string) {
  // Try gateway first
  if (gatewayClient) {
    try {
      const result = await gatewayClient.verify(receiptId);
      // Normalize gateway response to match internal format
      // so the frontend always gets the same shape
      const rv = result.receipt_verification;
      return {
        found: !!rv,
        signatureValid: rv?.checks?.signature ?? false,
        hashValid: rv?.checks?.hash_chain ?? false,
        ledgerRecorded: result.ledger_chain_verification?.valid ?? false,
        protocolVersion: "v2" as const,
        verificationStatus: rv?.valid ? "verified" : "failed",
        receipt: rv ? { receipt_id: rv.receipt_id } : null,
        source: "gateway" as const,
      };
    } catch (err) {
      if (err instanceof GatewayUnreachableError || (err instanceof Error && err.name === "GatewayUnreachableError")) {
        console.warn("[RIO Governance Router] Gateway unreachable for verify — falling back to internal");
        // Fall through to internal
      } else {
        throw err;
      }
    }
  }

  // Internal engine fallback
  const result = await internalVerifyReceiptById(receiptId);
  return { ...result, source: "internal" as const };
}

/**
 * Get the audit log for an intent.
 * Read-only: falls back to internal if gateway unavailable.
 */
export async function getAuditLog(intentId: string) {
  // Internal engine always has the audit log for locally-created intents
  const result = await internalGetAuditLog(intentId);
  return { ...result, source: "internal" as const };
}

/**
 * Get the ledger chain.
 * In dual mode, returns entries from both sources with source labels.
 */
export async function getLedgerChain(limit: number = 50) {
  const results: { entries: unknown[]; source: string }[] = [];

  // Try gateway
  if (gatewayClient) {
    try {
      const gwLedger = await gatewayClient.getLedger({ limit });
      results.push({
        entries: gwLedger.entries.map(e => ({ ...e, source: "gateway" })),
        source: "gateway",
      });
    } catch (err) {
      if (err instanceof GatewayUnreachableError || (err instanceof Error && err.name === "GatewayUnreachableError")) {
        console.warn("[RIO Governance Router] Gateway unreachable for ledger — using internal only");
      } else {
        throw err;
      }
    }
  }

  // Always include internal ledger
  const internalLedger = await internalGetLedgerChain(limit);
  const internalEntries = Array.isArray(internalLedger)
    ? internalLedger
    : (internalLedger as any)?.entries ?? [];
  results.push({
    entries: internalEntries.map((e: any) => ({ ...e, source: "internal" })),
    source: "internal",
  });

  // Carry forward chain validation from internal ledger if available
  const internalChainValid = !Array.isArray(internalLedger) ? (internalLedger as any)?.chainValid ?? true : true;
  const internalChainErrors = !Array.isArray(internalLedger) ? (internalLedger as any)?.chainErrors ?? [] : [];

  // Merge and deduplicate by intent_id, preferring gateway entries
  const seen = new Set<string>();
  const merged: unknown[] = [];
  for (const r of results) {
    for (const entry of r.entries as any[]) {
      const key = entry.intent_id || entry.intentId || entry.id;
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(entry);
      }
    }
  }

  return {
    entries: merged.slice(0, limit),
    total: merged.length,
    sources: results.map(r => r.source),
    chainValid: internalChainValid,
    chainErrors: internalChainErrors,
  };
}

/**
 * Get learning analytics.
 * Currently only available from internal engine.
 */
export async function getLearningAnalytics() {
  return internalGetLearningAnalytics();
}

// ── Health & Status ─────────────────────────────────────────────────────

/**
 * Get the health status of the governance system.
 * Reports both gateway and internal engine status.
 */
export async function getGovernanceHealth() {
  const status: {
    mode: string;
    gateway: { reachable: boolean; healthy: boolean; url: string | null; details?: unknown } | null;
    internal: { active: boolean };
  } = {
    mode: getRoutingMode(),
    gateway: null,
    internal: { active: true },
  };

  if (gatewayClient) {
    try {
      const health = await gatewayClient.health();
      status.gateway = {
        reachable: true,
        healthy: health.status === "operational",
        url: process.env.GATEWAY_URL || null,
        details: health,
      };
    } catch {
      status.gateway = {
        reachable: false,
        healthy: false,
        url: process.env.GATEWAY_URL || null,
      };
    }
  }

  return status;
}
