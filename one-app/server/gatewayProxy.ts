/**
 * Gateway Proxy — Server-side bridge between ONE and the RIO Gateway.
 *
 * ONE's frontend cannot authenticate directly with the Gateway because
 * the user logs in via Manus OAuth (session cookie), not Gateway JWT.
 *
 * This module:
 *   1. Accepts calls from ONE's tRPC procedures (already authenticated via Manus OAuth)
 *   2. Sends the authenticated user's email to the Gateway via X-Authenticated-Email
 *   3. The Gateway resolves the email to a principal via resolvePrincipalByEmail()
 *   4. Returns the Gateway response to the frontend
 *
 * Per Decision 2: ONE is an untrusted client. It NEVER sends raw principal IDs.
 * The Gateway remains the enforcement boundary. ONE only bridges identity via email.
 */

const GATEWAY_URL = process.env.VITE_GATEWAY_URL || "";

// ─── Identity Resolution ─────────────────────────────────────────
// Maps Manus OAuth user to their email for Gateway identity bridging.
// The Gateway's resolvePrincipalByEmail() handles email → principal lookup.
//
// TRANSITIONAL: Until Gateway PR #91 is merged and deployed, the live
// Gateway doesn't check X-Authenticated-Email. We send BOTH headers:
//   - X-Authenticated-Email (correct per Decision 2, for post-PR#91)
//   - X-Principal-ID (fallback for current live Gateway)
// Once PR #91 is deployed, remove X-Principal-ID from gatewayFetch.
// TODO(post-PR91): Remove X-Principal-ID fallback header

interface UserIdentity {
  email: string;
  principalId: string; // TRANSITIONAL: direct principal ID for pre-PR#91 Gateway
  agentId: string; // The agent_id that's in policy scope
}

// Known email → principal mappings.
// The Gateway resolves email → principal via resolvePrincipalByEmail(),
// but we also need the mapping here for the TRANSITIONAL X-Principal-ID fallback.
const EMAIL_TO_PRINCIPAL: Record<string, { principalId: string; agentId: string }> = {
  "bkr1297@gmail.com":      { principalId: "I-1", agentId: "brian.k.rasmussen" },
  "riomethod5@gmail.com":   { principalId: "I-2", agentId: "brian.k.rasmussen" },
  "rasmussenbr@hotmail.com": { principalId: "I-1", agentId: "brian.k.rasmussen" },
};

/**
 * Resolve a Manus-authenticated user to their Gateway identity.
 * Returns the user's email (for X-Authenticated-Email) and their agent_id.
 *
 * The Gateway will resolve the email to a principal — ONE never sends
 * a raw principal ID (Decision 2: all interfaces are untrusted clients).
 *
 * Identity is resolved by EMAIL, not by openId. This is critical because:
 * - bkr1297@gmail.com → I-1 (root_authority, proposer)
 * - riomethod5@gmail.com → I-2 (approver)
 * Same person, two accounts, two principals. The invariant holds.
 */
export function resolveGatewayIdentity(
  user: { id: number; openId: string; email?: string | null; name?: string | null },
  ownerOpenId: string
): UserIdentity | null {
  const email = user.email?.toLowerCase().trim();

  // Look up by email first — this correctly maps each email to its principal
  if (email && EMAIL_TO_PRINCIPAL[email]) {
    const mapping = EMAIL_TO_PRINCIPAL[email];
    return {
      email,
      principalId: mapping.principalId, // TRANSITIONAL: remove after PR #91 deployed
      agentId: mapping.agentId,
    };
  }

  // If the user is the system owner but email isn't in our map, use default
  if (user.openId === ownerOpenId) {
    const fallbackEmail = email || "bkr1297@gmail.com";
    return {
      email: fallbackEmail,
      principalId: "I-1", // TRANSITIONAL: remove after PR #91 deployed
      agentId: "brian.k.rasmussen",
    };
  }

  // For other users: use their email from the Manus OAuth profile
  if (email) {
    return {
      email,
      principalId: `user-${user.id}`, // TRANSITIONAL: won't resolve on Gateway
      agentId: `user-${user.id}`,
    };
  }

  // No email available — cannot bridge identity
  return null;
}

// Keep the old function name as an alias for backward compatibility in routers.ts
// Returns email (for X-Authenticated-Email) and directPrincipalId (for transitional X-Principal-ID)
export function resolveGatewayPrincipal(
  userId: number,
  openId: string | null | undefined,
  ownerOpenId: string,
  email?: string | null,
  name?: string | null
): { principalId: string; directPrincipalId: string; agentId: string } | null {
  const identity = resolveGatewayIdentity(
    { id: userId, openId: openId || "", email: email || undefined, name: name || undefined },
    ownerOpenId
  );
  if (!identity) return null;
  return {
    principalId: identity.email,          // Used as X-Authenticated-Email
    directPrincipalId: identity.principalId, // TRANSITIONAL: Used as X-Principal-ID
    agentId: identity.agentId,
  };
}

// ─── Gateway Fetch ────────────────────────────────────────────────

interface GatewayResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

/**
 * Make an authenticated request to the Gateway.
 * Sends X-Authenticated-Email header for identity bridging.
 *
 * Per Decision 2: ONE is an untrusted client. We send the authenticated
 * user's email, and the Gateway resolves it to a principal via
 * resolvePrincipalByEmail(). ONE never sends X-Principal-ID.
 */
export async function gatewayFetch<T = unknown>(
  path: string,
  authenticatedEmail: string,
  opts: {
    method?: string;
    body?: unknown;
    principalId?: string; // TRANSITIONAL: remove after PR #91 deployed
  } = {}
): Promise<GatewayResponse<T>> {
  if (!GATEWAY_URL) {
    return {
      ok: false,
      status: 503,
      data: { error: "Gateway URL not configured" } as T,
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Authenticated-Email": authenticatedEmail,
  };

  // TRANSITIONAL: Send X-Principal-ID as fallback until Gateway PR #91 is deployed.
  // The live Gateway currently only checks JWT, API key, and X-Principal-ID.
  // Once PR #91 is merged, X-Authenticated-Email will be the primary path and
  // this fallback should be removed.
  // TODO(post-PR91): Remove this X-Principal-ID fallback
  if (opts.principalId) {
    headers["X-Principal-ID"] = opts.principalId;
  }

  const fetchOpts: RequestInit = {
    method: opts.method || "GET",
    headers,
  };

  if (opts.body) {
    fetchOpts.body = JSON.stringify(opts.body);
  }

  try {
    const res = await fetch(`${GATEWAY_URL}${path}`, fetchOpts);
    let data: T;
    try {
      data = await res.json() as T;
    } catch {
      data = {} as T;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: { error: `Gateway unreachable: ${String(err)}` } as T,
    };
  }
}

// ─── Replay Prevention Helpers ────────────────────────────────────

function makeNonce(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeTimestamp(): string {
  return new Date().toISOString();
}

// ─── High-Level Gateway Operations ───────────────────────────────

export interface GatewayIntentResult {
  intent_id: string;
  status: string;
  action: string;
  agent_id: string;
  principal_id: string;
  intent_hash?: string;
  timestamp?: string;
  error?: string;
}

export interface GatewayGovernResult {
  intent_id: string;
  governance_decision: string;
  risk_tier: string;
  matched_class?: string | null;
  approval_requirement?: {
    description: string;
    required_roles?: string[];
    approvals_required: number;
  };
  approval_ttl?: number | null;
  reason?: string;
  checks?: Array<{ check: string; passed: boolean; [key: string]: unknown }>;
  policy_version?: string;
  policy_hash?: string;
  governance_hash?: string;
  system_mode?: string;
  error?: string;
}

export interface GatewayPendingApproval {
  intent_id: string;
  action: string;
  agent_id?: string;
  target_environment?: string;
  parameters?: Record<string, unknown>;
  risk_tier?: string;
  governance_decision?: string;
  principal_id?: string;
  status: string;
  created_at?: string;
  expires_at?: string;
}

export interface GatewayApprovalResult {
  approval_id?: string;
  error?: string;
  invariant?: string;
}

/**
 * Submit an intent to the Gateway.
 */
export async function proxySubmitIntent(
  authenticatedEmail: string,
  agentId: string,
  payload: {
    action: string;
    target_environment?: string;
    parameters?: Record<string, unknown>;
    confidence?: number;
    reflection?: string;
  },
  principalId?: string // TRANSITIONAL: remove after PR #91
): Promise<GatewayResponse<GatewayIntentResult>> {
  return gatewayFetch<GatewayIntentResult>("/intent", authenticatedEmail, {
    method: "POST",
    body: {
      action: payload.action,
      agent_id: agentId,
      target_environment: payload.target_environment || "local",
      parameters: payload.parameters || {},
      confidence: payload.confidence || 85,
      reflection: payload.reflection,
      request_timestamp: makeTimestamp(),
      request_nonce: makeNonce("one-intent"),
    },
    principalId,
  });
}

/**
 * Request governance evaluation for an intent.
 */
export async function proxyGovernIntent(
  authenticatedEmail: string,
  intentId: string,
  principalId?: string // TRANSITIONAL: remove after PR #91
): Promise<GatewayResponse<GatewayGovernResult>> {
  return gatewayFetch<GatewayGovernResult>("/govern", authenticatedEmail, {
    method: "POST",
    body: {
      intent_id: intentId,
      request_timestamp: makeTimestamp(),
      request_nonce: makeNonce("one-govern"),
    },
    principalId,
  });
}

/**
 * Get pending approvals from the Gateway.
 *
 * Strategy: The Gateway's /approvals endpoint may return empty due to a
 * data-layer mismatch (in-memory cache vs PostgreSQL). As a fallback,
 * we also fetch /intents and filter for governed intents with REQUIRE_HUMAN
 * or REQUIRE_QUORUM decisions. We merge both sources, deduplicating by intent_id.
 */
export async function proxyGetPendingApprovals(
  authenticatedEmail: string,
  principalId?: string // TRANSITIONAL: remove after PR #91
): Promise<GatewayResponse<{ pending: GatewayPendingApproval[] }>> {
  // Fetch from both endpoints in parallel
  const [approvalsResult, intentsResult] = await Promise.all([
    gatewayFetch<{
      pending_approvals?: GatewayPendingApproval[];
      pending?: GatewayPendingApproval[];
      count?: number;
      error?: string;
    }>("/approvals", authenticatedEmail, { principalId }),
    gatewayFetch<{
      intents?: Array<{
        intent_id: string;
        action: string;
        agent_id?: string;
        target_environment?: string;
        parameters?: Record<string, unknown>;
        status: string;
        timestamp?: string;
        governance?: {
          governance_decision?: string;
          risk_tier?: string;
          requires_approval?: boolean;
        };
      }>;
    }>("/intents", authenticatedEmail, { principalId }),
  ]);

  // Start with approvals endpoint results
  const fromApprovals = approvalsResult.data.pending_approvals || approvalsResult.data.pending || [];
  const seenIds = new Set(fromApprovals.map(a => a.intent_id));

  // Add governed intents that need approval but aren't in the approvals list
  const intents = intentsResult.data.intents || [];
  const fromIntents: GatewayPendingApproval[] = intents
    .filter(i =>
      i.status === "governed" &&
      i.governance &&
      (i.governance.governance_decision === "REQUIRE_HUMAN" ||
       i.governance.governance_decision === "REQUIRE_QUORUM") &&
      !seenIds.has(i.intent_id)
    )
    .map(i => ({
      intent_id: i.intent_id,
      action: i.action,
      agent_id: i.agent_id,
      target_environment: i.target_environment,
      parameters: i.parameters,
      risk_tier: i.governance?.risk_tier,
      governance_decision: i.governance?.governance_decision,
      status: i.status,
      created_at: i.timestamp,
    }));

  const pending = [...fromApprovals, ...fromIntents];
  return {
    ok: true,
    status: 200,
    data: { pending },
  };
}

/**
 * Submit an approval decision for a pending intent.
 */
export async function proxySubmitApproval(
  authenticatedEmail: string,
  intentId: string,
  decision: "approved" | "denied",
  reason?: string,
  principalId?: string // TRANSITIONAL: remove after PR #91
): Promise<GatewayResponse<GatewayApprovalResult>> {
  return gatewayFetch<GatewayApprovalResult>(`/approvals/${intentId}`, authenticatedEmail, {
    method: "POST",
    body: {
      decision,
      reason: reason || undefined,
      request_timestamp: makeTimestamp(),
      request_nonce: makeNonce("one-approval"),
    },
    principalId,
  });
}

/**
 * Get Gateway health status.
 */
export async function proxyGatewayHealth(
  authenticatedEmail?: string
): Promise<GatewayResponse<{
  status: string;
  version?: string;
  governance?: { policy_version?: string; system_mode?: string };
  principal?: { principal_id?: string; role?: string };
}>> {
  return gatewayFetch("/health", authenticatedEmail || "anonymous");
}

// ─── Execution Pipeline ─────────────────────────────────────────
// After an intent is approved, ONE's server acts as the execution engine:
//   1. POST /execute → get single-use execution token
//   2. Execute the action (send email via Twilio/Forge)
//   3. POST /execute-confirm → burn token, record execution
//   4. POST /receipt → generate cryptographic receipt
//
// These calls use X-Principal-ID: gateway-exec because:
//   - The executor role is prohibited from being combined with proposer/approver
//   - ONE's server is a trusted service acting as the execution engine
//   - This is server-to-server, not user-facing (Decision 2 applies to user calls)

const EXECUTOR_PRINCIPAL_ID = "gateway-exec";

/**
 * Make an authenticated request to the Gateway as the executor service.
 * Uses X-Principal-ID: gateway-exec for execution-phase calls.
 */
async function executorFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<GatewayResponse<T>> {
  if (!GATEWAY_URL) {
    return {
      ok: false,
      status: 503,
      data: { error: "Gateway URL not configured" } as T,
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Principal-ID": EXECUTOR_PRINCIPAL_ID,
  };

  const fetchOpts: RequestInit = {
    method: opts.method || "GET",
    headers,
  };

  if (opts.body) {
    // Inject replay prevention fields required by the Gateway
    const bodyWithReplay = {
      ...(opts.body as Record<string, unknown>),
      request_timestamp: new Date().toISOString(),
      request_nonce: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    fetchOpts.body = JSON.stringify(bodyWithReplay);
  }

  try {
    const res = await fetch(`${GATEWAY_URL}${path}`, fetchOpts);
    let data: T;
    try {
      data = (await res.json()) as T;
    } catch {
      data = {} as T;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: { error: `Gateway unreachable: ${String(err)}` } as T,
    };
  }
}

// ─── Execution Types ─────────────────────────────────────────────

export interface ExecutionTokenResult {
  intent_id: string;
  status: string;
  execution_token?: {
    intent_id: string;
    action: string;
    agent_id: string;
    authorized_by?: string;
    authorization_hash?: string;
    parameters?: Record<string, unknown>;
    cc_recipients?: string[];
    issued_at: string;
    status: string;
    execution_token: string;
    token_expires_at: string;
  };
  instruction?: string;
  timestamp?: string;
  reason?: string;
  error?: string;
}

export interface ExecutionConfirmResult {
  intent_id: string;
  status: string;
  execution_hash?: string;
  connector?: string;
  result?: unknown;
  timestamp?: string;
  reason?: string;
  error?: string;
}

export interface ReceiptResult {
  intent_id: string;
  status: string;
  receipt?: {
    receipt_hash: string;
    receipt_type?: string;
    intent_hash: string;
    governance_hash: string;
    authorization_hash: string;
    execution_hash: string;
    action: string;
    agent_id: string;
    authorized_by: string;
    timestamp: string;
    identity_binding?: Record<string, unknown>;
    ingestion?: Record<string, unknown>;
  };
  error?: string;
}

/**
 * Request an execution token from the Gateway.
 * Only works for intents with status "authorized".
 */
export async function proxyExecuteIntent(
  intentId: string
): Promise<GatewayResponse<ExecutionTokenResult>> {
  return executorFetch<ExecutionTokenResult>("/execute", {
    method: "POST",
    body: { intent_id: intentId },
  });
}

/**
 * Confirm execution with the Gateway.
 * Burns the single-use execution token and records the result.
 */
export async function proxyConfirmExecution(
  intentId: string,
  executionResult: Record<string, unknown>,
  executionToken: string,
  connector: string = "one-server"
): Promise<GatewayResponse<ExecutionConfirmResult>> {
  return executorFetch<ExecutionConfirmResult>("/execute-confirm", {
    method: "POST",
    body: {
      intent_id: intentId,
      execution_result: executionResult,
      execution_token: executionToken,
      connector,
    },
  });
}

/**
 * Generate a cryptographic receipt for an executed intent.
 */
export async function proxyGenerateReceipt(
  intentId: string
): Promise<GatewayResponse<ReceiptResult>> {
  return executorFetch<ReceiptResult>("/receipt", {
    method: "POST",
    body: { intent_id: intentId },
  });
}

/**
 * Full execution pipeline: execute → send email → confirm → receipt.
 * This is the complete governed action flow after approval.
 *
 * Returns the receipt on success, or throws with a descriptive error.
 */
export async function executeGovernedAction(
  intentId: string,
  sendAction: (params: Record<string, unknown>) => Promise<{ success: boolean; result: Record<string, unknown> }>
): Promise<{
  execution: ExecutionConfirmResult;
  receipt: ReceiptResult;
}> {
  // Step 1: Get execution token from Gateway
  const tokenResult = await proxyExecuteIntent(intentId);
  if (!tokenResult.ok || !tokenResult.data.execution_token) {
    throw new Error(
      `Failed to get execution token: ${tokenResult.data.reason || tokenResult.data.error || "Unknown error"}`
    );
  }

  const executionToken = tokenResult.data.execution_token;
  const params = {
    ...executionToken.parameters || {},
    _action: executionToken.action, // Pass action type to executor
  };

  // Step 2: Execute the action (e.g., send email via Twilio)
  let actionResult: { success: boolean; result: Record<string, unknown> };
  try {
    actionResult = await sendAction(params);
  } catch (err) {
    // If execution fails, we still need to report to the Gateway
    const failResult = await proxyConfirmExecution(
      intentId,
      { success: false, error: String(err) },
      executionToken.execution_token,
      "one-server-failed"
    );
    throw new Error(
      `Action execution failed: ${String(err)}. Gateway notified: ${failResult.data.status}`
    );
  }

  if (!actionResult.success) {
    const failResult = await proxyConfirmExecution(
      intentId,
      { success: false, ...actionResult.result },
      executionToken.execution_token,
      "one-server-failed"
    );
    throw new Error(
      `Action returned failure: ${JSON.stringify(actionResult.result)}. Gateway notified: ${failResult.data.status}`
    );
  }

  // Step 3: Confirm execution with Gateway (burns the token)
  const confirmResult = await proxyConfirmExecution(
    intentId,
    { success: true, ...actionResult.result },
    executionToken.execution_token,
    "one-server"
  );

  if (!confirmResult.ok) {
    throw new Error(
      `Execution confirm failed: ${confirmResult.data.reason || confirmResult.data.error || "Unknown error"}`
    );
  }

  // Step 4: Generate receipt
  const receiptResult = await proxyGenerateReceipt(intentId);
  if (!receiptResult.ok) {
    // Execution succeeded but receipt failed — log but don't throw
    console.error(`[ONE] Receipt generation failed for ${intentId}: ${JSON.stringify(receiptResult.data)}`);
  }

  return {
    execution: confirmResult.data,
    receipt: receiptResult.data,
  };
}
