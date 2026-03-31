/**
 * RIO Gateway Client
 *
 * REST client for the standalone RIO Governance Gateway.
 * This module is the bridge between the demo site and the canonical gateway.
 *
 * Phase B: Runs alongside the internal engine. New actions can be routed
 * through the gateway while old receipts stay in the local ledger.
 *
 * Phase C: Becomes the sole governance backend; internal engine deprecated.
 *
 * FAIL-CLOSED: If the gateway is unreachable, all governance operations
 * are blocked. We never silently fall back to the internal engine.
 *
 * Gateway Pipeline (6 steps):
 *   1. POST /intent       → Submit intent
 *   2. POST /govern       → Policy + risk evaluation
 *   3. POST /authorize    → Human approval/denial (supports Ed25519 signatures)
 *   4. POST /execute      → Get execution token
 *   5. POST /execute-confirm → Confirm external execution result
 *   6. POST /receipt      → Generate cryptographic receipt
 *
 * Read-only endpoints:
 *   GET /verify           → Verify receipt/chain integrity
 *   GET /ledger           → View ledger entries
 *   GET /health           → System health check
 *   GET /intents          → List intents
 *   GET /intent/:id       → Get specific intent
 *   POST /login           → Authenticate (get JWT)
 *   GET /whoami           → Current user info
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface GatewayConfig {
  /** Base URL of the gateway (e.g., https://rio-gateway.railway.app) */
  baseUrl: string;
  /** JWT token for authenticated requests (obtained via POST /login) */
  authToken?: string;
  /** Request timeout in milliseconds (default: 15000) */
  timeoutMs?: number;
}

export interface GatewayIntent {
  action: string;
  agent_id: string;
  target_environment?: string;
  parameters?: Record<string, unknown>;
  confidence?: number;
  description?: string;
}

export interface GatewayIntentResponse {
  intent_id: string;
  status: string;
  action: string;
  agent_id: string;
  intent_hash: string;
  timestamp: string;
}

export interface GatewayGovernResponse {
  intent_id: string;
  governance_status: string;
  risk_level: string;
  requires_approval: boolean;
  reason: string;
  checks: unknown[];
  governance_hash: string;
}

export interface GatewayAuthorizeRequest {
  intent_id: string;
  decision: "approved" | "denied";
  authorized_by: string;
  conditions?: string | null;
  expires_at?: string | null;
  /** Ed25519 signature (hex) over the canonical payload */
  signature?: string;
  signature_timestamp?: string;
}

export interface GatewayAuthorizeResponse {
  intent_id: string;
  status: string;
  authorization_hash?: string;
  authorized_by?: string;
  decision?: string;
  ed25519_signed?: boolean;
  timestamp?: string;
}

export interface GatewayExecuteResponse {
  intent_id: string;
  status: string;
  execution_token: {
    intent_id: string;
    action: string;
    agent_id: string;
    authorized_by: string;
    authorization_hash: string;
    parameters: Record<string, unknown>;
    cc_recipients: string[];
    issued_at: string;
    status: string;
  };
  instruction: string;
  timestamp: string;
}

export interface GatewayExecuteConfirmRequest {
  intent_id: string;
  execution_result: Record<string, unknown>;
  connector?: string;
}

export interface GatewayExecuteConfirmResponse {
  intent_id: string;
  status: string;
  execution_hash: string;
  connector: string;
  result: Record<string, unknown>;
  timestamp: string;
}

export interface GatewayReceiptResponse {
  receipt_id: string;
  intent_id: string;
  action: string;
  hash_chain: {
    intent_hash: string;
    governance_hash: string;
    authorization_hash: string;
    execution_hash: string;
    receipt_hash: string;
  };
  authorized_by: string;
  timestamp: string;
}

export interface GatewayVerifyResponse {
  receipt_verification?: {
    valid: boolean;
    receipt_id: string;
    checks: Record<string, boolean>;
  };
  ledger_chain_verification: {
    valid: boolean;
    total_entries: number;
    chain_tip: string;
  };
}

export interface GatewayLedgerResponse {
  entries: Array<{
    intent_id: string;
    action: string;
    agent_id: string;
    status: string;
    detail: string;
    hash: string;
    previous_hash: string;
    timestamp: string;
  }>;
  total: number;
  chain_tip: string;
}

export interface GatewayHealthResponse {
  status: string;
  gateway: string;
  version: string;
  timestamp: string;
  governance: {
    constitution_loaded: boolean;
    policy_loaded: boolean;
  };
  ledger: {
    entries: number;
    chain_valid: boolean;
    chain_tip: string;
  };
  fail_mode: string;
}

export interface GatewayLoginResponse {
  status: string;
  user_id: string;
  display_name: string;
  role: string;
  token: string;
  expires_in: string;
}

export interface GatewayError {
  error: string;
  hint?: string;
}

// ── Error Classes ────────────────────────────────────────────────────────

export class GatewayUnreachableError extends Error {
  constructor(url: string, cause?: unknown) {
    super(`RIO Gateway unreachable at ${url}. Fail-closed: all governance operations blocked.`);
    this.name = "GatewayUnreachableError";
    this.cause = cause;
  }
}

export class GatewayApiError extends Error {
  public status: number;
  public body: GatewayError;

  constructor(status: number, body: GatewayError) {
    super(`RIO Gateway error (${status}): ${body.error}`);
    this.name = "GatewayApiError";
    this.status = status;
    this.body = body;
  }
}

// ── Client ───────────────────────────────────────────────────────────────

export class RioGatewayClient {
  private baseUrl: string;
  private authToken: string | null;
  private timeoutMs: number;

  constructor(config: GatewayConfig) {
    // Strip trailing slash
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.authToken = config.authToken ?? null;
    this.timeoutMs = config.timeoutMs ?? 15000;
  }

  // ── Internal fetch wrapper ──────────────────────────────────────────

  /**
   * Generate replay prevention fields required by the production gateway.
   * All POST requests must include request_timestamp (ISO 8601) and request_nonce (UUID).
   */
  private replayFields(): { request_timestamp: string; request_nonce: string } {
    return {
      request_timestamp: new Date().toISOString(),
      request_nonce: crypto.randomUUID(),
    };
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    // Inject replay prevention fields into all POST request bodies
    let finalBody = body;
    if (method === "POST" && body && typeof body === "object") {
      finalBody = { ...body, ...this.replayFields() };
    } else if (method === "POST" && !body) {
      finalBody = this.replayFields();
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: finalBody ? JSON.stringify(finalBody) : undefined,
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeout);
      // Network error, DNS failure, timeout, etc.
      throw new GatewayUnreachableError(url, err);
    } finally {
      clearTimeout(timeout);
    }

    // Parse response
    let data: T;
    try {
      data = (await response.json()) as T;
    } catch {
      throw new GatewayApiError(response.status, {
        error: `Non-JSON response from gateway (HTTP ${response.status})`,
      });
    }

    if (!response.ok) {
      throw new GatewayApiError(response.status, data as unknown as GatewayError);
    }

    return data;
  }

  // ── Authentication ──────────────────────────────────────────────────

  /**
   * Authenticate with the gateway and store the JWT token.
   * Subsequent requests will include this token.
   */
  async login(userId: string, passphrase: string): Promise<GatewayLoginResponse> {
    const result = await this.request<GatewayLoginResponse>("POST", "/login", {
      user_id: userId,
      passphrase,
    });
    this.authToken = result.token;
    return result;
  }

  /** Check current authentication state */
  async whoami(): Promise<{ authenticated: boolean; user_id?: string; display_name?: string; role?: string }> {
    return this.request("GET", "/whoami");
  }

  /** Update the auth token (e.g., from an external OAuth flow) */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  // ── Pipeline (6 steps) ─────────────────────────────────────────────

  /**
   * Step 1: Submit an intent to the gateway.
   * Returns the intent_id and intent_hash.
   */
  async submitIntent(intent: GatewayIntent): Promise<GatewayIntentResponse> {
    return this.request<GatewayIntentResponse>("POST", "/api/v1/intents", intent);
  }

  /**
   * Step 2: Run governance evaluation (policy + risk).
   * Returns governance status, risk level, and whether approval is required.
   */
  async govern(intentId: string): Promise<GatewayGovernResponse> {
    return this.request<GatewayGovernResponse>("POST", `/api/v1/intents/${encodeURIComponent(intentId)}/govern`, {});
  }

  /**
   * Step 3: Record human approval or denial.
   * Supports optional Ed25519 signatures for cryptographic proof.
   */
  async authorize(req: GatewayAuthorizeRequest): Promise<GatewayAuthorizeResponse> {
    const { intent_id, ...body } = req;
    return this.request<GatewayAuthorizeResponse>("POST", `/api/v1/intents/${encodeURIComponent(intent_id)}/authorize`, body);
  }

  /**
   * Step 4: Request execution token.
   * The gateway issues a token; the agent must execute externally
   * and then call executeConfirm().
   */
  async execute(intentId: string): Promise<GatewayExecuteResponse> {
    return this.request<GatewayExecuteResponse>("POST", `/api/v1/intents/${encodeURIComponent(intentId)}/execute`, {});
  }

  /**
   * Step 5: Confirm execution result.
   * After the agent executes the action externally (e.g., via MCP/connector),
   * it reports back the result.
   */
  async executeConfirm(req: GatewayExecuteConfirmRequest): Promise<GatewayExecuteConfirmResponse> {
    const { intent_id, ...body } = req;
    return this.request<GatewayExecuteConfirmResponse>("POST", `/api/v1/intents/${encodeURIComponent(intent_id)}/confirm`, body);
  }

  /**
   * Step 6: Generate cryptographic receipt.
   * Creates a receipt with a 5-link SHA-256 hash chain.
   */
  async generateReceipt(intentId: string): Promise<GatewayReceiptResponse> {
    return this.request<GatewayReceiptResponse>("POST", `/api/v1/intents/${encodeURIComponent(intentId)}/receipt`, {});
  }

  // ── Full Pipeline (convenience) ────────────────────────────────────

  /**
   * Run the full governance pipeline in one call:
   * intent → govern → (returns for human decision) → ...
   *
   * This submits the intent and runs governance. Returns the intent_id
   * and governance result so the caller can present the approval UI.
   * The caller must then call authorize(), execute(), executeConfirm(),
   * and generateReceipt() separately after human decision.
   */
  async submitAndGovern(intent: GatewayIntent): Promise<{
    intent: GatewayIntentResponse;
    governance: GatewayGovernResponse;
  }> {
    const intentResult = await this.submitIntent(intent);
    const governResult = await this.govern(intentResult.intent_id);
    return { intent: intentResult, governance: governResult };
  }

  // ── Read-Only Endpoints ────────────────────────────────────────────

  /** Verify a receipt or the full ledger chain */
  async verify(intentId?: string): Promise<GatewayVerifyResponse> {
    const query = intentId ? `?intent_id=${encodeURIComponent(intentId)}` : "";
    return this.request<GatewayVerifyResponse>("GET", `/api/v1/verify${query}`);
  }

  /** Get ledger entries */
  async getLedger(options?: { limit?: number; offset?: number; intentId?: string }): Promise<GatewayLedgerResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.offset) params.set("offset", String(options.offset));
    if (options?.intentId) params.set("intent_id", options.intentId);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<GatewayLedgerResponse>("GET", `/api/v1/ledger${query}`);
  }

  /** Check gateway health */
  async health(): Promise<GatewayHealthResponse> {
    // /health exists at both root and /api/v1/health — use /api/v1 for consistency
    return this.request<GatewayHealthResponse>("GET", "/api/v1/health");
  }

  /** List intents */
  async listIntents(status?: string, limit?: number): Promise<{ intents: unknown[]; count: number }> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (limit) params.set("limit", String(limit));
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request("GET", `/api/v1/intents${query}`);
  }

  /** Get a specific intent with full pipeline state */
  async getIntent(intentId: string): Promise<unknown> {
    return this.request("GET", `/api/v1/intents/${encodeURIComponent(intentId)}`);
  }
}

// ── Factory ──────────────────────────────────────────────────────────────

/**
 * Create a gateway client from environment variables.
 * Returns null if GATEWAY_URL is not set (Phase A — gateway not deployed yet).
 *
 * When GATEWAY_URL is set, all governance operations MUST go through the gateway.
 * When GATEWAY_URL is not set, the internal engine handles governance.
 */
export function createGatewayClient(): RioGatewayClient | null {
  const gatewayUrl = process.env.GATEWAY_URL;
  if (!gatewayUrl) {
    console.log("[RIO Gateway Client] GATEWAY_URL not set — using internal engine (Phase A)");
    return null;
  }

  console.log(`[RIO Gateway Client] Connecting to gateway at ${gatewayUrl}`);
  return new RioGatewayClient({
    baseUrl: gatewayUrl,
    timeoutMs: parseInt(process.env.GATEWAY_TIMEOUT_MS || "15000", 10),
  });
}

/**
 * Check if the gateway is available and healthy.
 * Returns true if the gateway responds with status "operational".
 */
export async function isGatewayHealthy(client: RioGatewayClient): Promise<boolean> {
  try {
    const health = await client.health();
    return health.status === "operational" && health.ledger?.chain_valid === true;
  } catch {
    return false;
  }
}
