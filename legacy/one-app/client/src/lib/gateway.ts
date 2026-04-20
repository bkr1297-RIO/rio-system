/**
 * Gateway API Client — ONE's interface to the RIO Gateway.
 *
 * ONE is an untrusted client. All enforcement happens in the Gateway.
 * This module provides typed fetch wrappers for Gateway endpoints.
 */

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || "";

/* ─── Token Storage ─────────────────────────────────────────── */

const TOKEN_KEY = "rio-gateway-token";

export function getGatewayToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setGatewayToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearGatewayToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/* ─── Fetch Wrapper ─────────────────────────────────────────── */

async function gw<T = unknown>(
  path: string,
  opts: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T }> {
  const token = getGatewayToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...opts,
    headers,
  });

  let data: T;
  try {
    data = await res.json();
  } catch {
    data = {} as T;
  }

  return { ok: res.ok, status: res.status, data };
}

/* ─── Auth ──────────────────────────────────────────────────── */

export interface WhoAmI {
  authenticated: boolean;
  user?: {
    sub: string;
    name: string;
    role?: string;
    auth_method?: string;
    principal_id?: string;
  };
}

export async function gatewayWhoAmI(): Promise<WhoAmI> {
  // Gateway returns flat: { authenticated, user_id, display_name, email, role }
  // We need nested: { authenticated, user: { sub, name, role, principal_id } }
  const { ok, data } = await gw<Record<string, unknown>>("/whoami");
  if (!ok || !data.authenticated) return { authenticated: false };
  return {
    authenticated: true,
    user: {
      sub: (data.user_id as string) || "",
      name: (data.display_name as string) || (data.user_id as string) || "",
      role: (data.role as string) || undefined,
      auth_method: "passphrase",
      principal_id: (data.user_id as string) || undefined,
    },
  };
}

export async function gatewayLogin(userId: string, passphrase: string): Promise<{ token?: string; error?: string }> {
  const { ok, data } = await gw<{ token?: string; error?: string }>("/login", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, passphrase }),
  });
  if (ok && data.token) {
    setGatewayToken(data.token);
  }
  return data;
}

export function getGoogleOAuthUrl(): string {
  return `${GATEWAY_URL}/auth/google`;
}

export interface AuthStatus {
  google_oauth_configured: boolean;
  version?: string;
  system_mode?: string;
  policy_active?: boolean;
}

export async function gatewayAuthStatus(): Promise<AuthStatus> {
  // Try /auth/status first, fall back to /health for version/mode info
  const { data } = await gw<AuthStatus>("/auth/status");
  // If /auth/status doesn't return version, try /health
  if (!data.version) {
    try {
      const health = await gatewayHealth();
      data.version = health.version;
      data.system_mode = health.governance?.system_mode;
      data.policy_active = !!health.governance?.policy_version;
    } catch {
      // ignore
    }
  }
  return data;
}

/* ─── Health ────────────────────────────────────────────────── */

export interface GatewayHealth {
  status: string;
  version?: string;
  governance?: {
    policy_version?: string;
    system_mode?: string;
  };
  principal?: {
    principal_id?: string;
    role?: string;
  };
}

export async function gatewayHealth(): Promise<GatewayHealth> {
  const { data } = await gw<GatewayHealth>("/health");
  return data;
}

/* ─── Intents ───────────────────────────────────────────────── */

export interface Intent {
  intent_id: string;
  action: string;
  agent_id?: string;
  target_environment?: string;
  parameters?: Record<string, unknown>;
  confidence?: number;
  context?: Record<string, unknown>;
  status: string;
  risk_tier?: string;
  governance_decision?: string;
  principal_id?: string;
  principal_role?: string;
  created_at?: string;
  expires_at?: string;
}

export interface GovernResult {
  intent_id: string;
  governance_decision: string;
  risk_tier: string;
  risk_level?: string;
  approval_requirements?: {
    min_approvals: number;
    quorum_type?: string;
  };
  approval_requirement?: {
    description: string;
    required_roles?: string[];
    approvals_required: number;
  };
  approval_ttl?: number;
  ttl_seconds?: number;
  expires_at?: string;
  governance_hash?: string;
  reason?: string;
}

export async function submitIntent(payload: {
  action: string;
  agent_id?: string;
  target_environment?: string;
  parameters?: Record<string, unknown>;
  confidence?: number;
  context?: Record<string, unknown>;
  reflection?: string;
  break_analysis?: string;
}): Promise<{ ok: boolean; data: Intent & { error?: string } }> {
  const nonce = `one-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const body = {
    ...payload,
    request_timestamp: new Date().toISOString(),
    request_nonce: nonce,
  };
  return gw<Intent & { error?: string }>("/intent", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function governIntent(intentId: string): Promise<{ ok: boolean; data: GovernResult & { error?: string } }> {
  const nonce = `one-govern-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return gw<GovernResult & { error?: string }>("/govern", {
    method: "POST",
    body: JSON.stringify({
      intent_id: intentId,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce,
    }),
  });
}

export async function getIntent(intentId: string): Promise<{ ok: boolean; data: Intent & { error?: string } }> {
  return gw<Intent & { error?: string }>(`/intent/${intentId}`);
}

/* ─── Approvals ─────────────────────────────────────────────── */

export interface Approval {
  approval_id: string;
  intent_id: string;
  approver_id: string;
  decision: string;
  reason?: string;
  signature?: string;
  principal_id?: string;
  principal_role?: string;
  created_at: string;
}

export interface PendingApproval {
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

export async function getPendingApprovals(): Promise<{ ok: boolean; data: { pending: PendingApproval[] } }> {
  return gw<{ pending: PendingApproval[] }>("/approvals");
}

export async function getIntentApprovals(intentId: string): Promise<{ ok: boolean; data: { approvals: Approval[]; intent: Intent } }> {
  return gw<{ approvals: Approval[]; intent: Intent }>(`/approvals/${intentId}`);
}

export async function submitApproval(intentId: string, decision: "approved" | "denied", reason?: string): Promise<{ ok: boolean; status: number; data: { approval_id?: string; error?: string; invariant?: string } }> {
  const nonce = `one-approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return gw<{ approval_id?: string; error?: string; invariant?: string }>(`/approvals/${intentId}`, {
    method: "POST",
    body: JSON.stringify({
      decision,
      reason: reason || undefined,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce,
    }),
  });
}

/* ─── Ledger (read-only) ────────────────────────────────────── */

export interface LedgerEntry {
  id: number;
  entry_type: string;
  intent_id?: string;
  actor: string;
  action: string;
  payload_hash: string;
  prev_hash: string;
  created_at: string;
}

export async function getLedger(limit = 50): Promise<{ ok: boolean; data: { entries: LedgerEntry[] } }> {
  return gw<{ entries: LedgerEntry[] }>(`/ledger?limit=${limit}`);
}
