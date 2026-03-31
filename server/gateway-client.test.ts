/**
 * Gateway Client Tests
 *
 * Tests the RIO Gateway Client module with mocked HTTP responses.
 * Verifies:
 *   - All 6 pipeline steps (intent, govern, authorize, execute, execute-confirm, receipt)
 *   - Read-only endpoints (verify, ledger, health, intents)
 *   - Authentication (login, whoami, token management)
 *   - Fail-closed behavior (unreachable gateway blocks all operations)
 *   - Error handling (API errors, non-JSON responses, timeouts)
 *   - Factory function (createGatewayClient)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RioGatewayClient,
  GatewayUnreachableError,
  GatewayApiError,
  createGatewayClient,
  isGatewayHealthy,
} from "./gateway-client";

// ── Mock fetch ───────────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers(),
    redirected: false,
    statusText: "OK",
    type: "basic" as ResponseType,
    url: "",
    clone: () => jsonResponse(data, status) as Response,
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(data)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("RioGatewayClient", () => {
  const BASE_URL = "https://rio-gateway.railway.app";
  let client: RioGatewayClient;

  beforeEach(() => {
    client = new RioGatewayClient({ baseUrl: BASE_URL });
  });

  // ── Pipeline Step 1: Submit Intent ──────────────────────────────────

  describe("submitIntent", () => {
    it("sends POST /intent with correct body", async () => {
      const mockResponse = {
        intent_id: "INT-abc123",
        status: "submitted",
        action: "send_email",
        agent_id: "bondi-ai",
        intent_hash: "abc123hash",
        timestamp: "2026-03-29T22:44:00.000Z",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockResponse, 201));

      const result = await client.submitIntent({
        action: "send_email",
        agent_id: "bondi-ai",
        description: "Send email to jane@company.com",
        parameters: { to: "jane@company.com", subject: "Test" },
      });

      expect(result.intent_id).toBe("INT-abc123");
      expect(result.status).toBe("submitted");
      expect(result.intent_hash).toBe("abc123hash");

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/intent`);
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(body.action).toBe("send_email");
      expect(body.agent_id).toBe("bondi-ai");
      // Verify replay prevention fields are injected
      expect(body.request_timestamp).toBeDefined();
      expect(body.request_nonce).toBeDefined();
      expect(typeof body.request_timestamp).toBe("string");
      expect(typeof body.request_nonce).toBe("string");
    });
  });

  // ── Pipeline Step 2: Govern ─────────────────────────────────────────

  describe("govern", () => {
    it("sends POST /govern with intent_id", async () => {
      const mockResponse = {
        intent_id: "INT-abc123",
        governance_status: "requires_approval",
        risk_level: "medium",
        requires_approval: true,
        reason: "Action requires human approval per policy",
        checks: [],
        governance_hash: "gov123hash",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockResponse));

      const result = await client.govern("INT-abc123");

      expect(result.governance_status).toBe("requires_approval");
      expect(result.requires_approval).toBe(true);
      expect(result.risk_level).toBe("medium");
    });
  });

  // ── Pipeline Step 3: Authorize ──────────────────────────────────────

  describe("authorize", () => {
    it("sends POST /authorize with approval", async () => {
      const mockResponse = {
        intent_id: "INT-abc123",
        status: "authorized",
        authorization_hash: "auth123hash",
        authorized_by: "brian",
        decision: "approved",
        ed25519_signed: false,
        timestamp: "2026-03-29T22:44:15.000Z",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockResponse));

      const result = await client.authorize({
        intent_id: "INT-abc123",
        decision: "approved",
        authorized_by: "brian",
      });

      expect(result.status).toBe("authorized");
      expect(result.decision).toBe("approved");
      expect(result.authorization_hash).toBe("auth123hash");
    });

    it("sends POST /authorize with denial", async () => {
      const mockResponse = {
        intent_id: "INT-abc123",
        status: "denied",
        authorized_by: "brian",
        decision: "denied",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockResponse));

      const result = await client.authorize({
        intent_id: "INT-abc123",
        decision: "denied",
        authorized_by: "brian",
      });

      expect(result.status).toBe("denied");
      expect(result.decision).toBe("denied");
    });
  });

  // ── Pipeline Step 4: Execute ────────────────────────────────────────

  describe("execute", () => {
    it("sends POST /execute and receives execution token", async () => {
      const mockResponse = {
        intent_id: "INT-abc123",
        status: "execution_authorized",
        execution_token: {
          intent_id: "INT-abc123",
          action: "send_email",
          agent_id: "bondi-ai",
          authorized_by: "brian",
          authorization_hash: "auth123hash",
          parameters: { to: "jane@company.com" },
          cc_recipients: [],
          issued_at: "2026-03-29T22:44:16.000Z",
          status: "execution_authorized",
        },
        instruction: "Execute the action externally, then POST to /execute-confirm",
        timestamp: "2026-03-29T22:44:16.000Z",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockResponse));

      const result = await client.execute("INT-abc123");

      expect(result.status).toBe("execution_authorized");
      expect(result.execution_token.action).toBe("send_email");
      expect(result.execution_token.authorized_by).toBe("brian");

      // Verify replay prevention fields in POST body
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.request_timestamp).toBeDefined();
      expect(body.request_nonce).toBeDefined();
    });
  });

  // ── Pipeline Step 5: Execute Confirm ────────────────────────────────

  describe("executeConfirm", () => {
    it("sends POST /execute-confirm with result", async () => {
      const mockResponse = {
        intent_id: "INT-abc123",
        status: "executed",
        execution_hash: "exec123hash",
        connector: "gmail",
        result: { message_id: "msg-123", status: "sent" },
        timestamp: "2026-03-29T22:44:17.000Z",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockResponse));

      const result = await client.executeConfirm({
        intent_id: "INT-abc123",
        execution_result: { message_id: "msg-123", status: "sent" },
        connector: "gmail",
      });

      expect(result.status).toBe("executed");
      expect(result.execution_hash).toBe("exec123hash");
      expect(result.connector).toBe("gmail");
    });
  });

  // ── Pipeline Step 6: Receipt ────────────────────────────────────────

  describe("generateReceipt", () => {
    it("sends POST /receipt and receives hash chain", async () => {
      const mockResponse = {
        receipt_id: "RIO-abc123",
        intent_id: "INT-abc123",
        action: "send_email",
        hash_chain: {
          intent_hash: "ih123",
          governance_hash: "gh123",
          authorization_hash: "ah123",
          execution_hash: "eh123",
          receipt_hash: "rh123",
        },
        authorized_by: "brian",
        timestamp: "2026-03-29T22:44:18.000Z",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockResponse));

      const result = await client.generateReceipt("INT-abc123");

      expect(result.receipt_id).toBe("RIO-abc123");
      expect(result.hash_chain.intent_hash).toBe("ih123");
      expect(result.hash_chain.receipt_hash).toBe("rh123");
    });
  });

  // ── Convenience: submitAndGovern ────────────────────────────────────

  describe("submitAndGovern", () => {
    it("chains intent submission and governance in one call", async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            intent_id: "INT-abc123",
            status: "submitted",
            action: "send_email",
            agent_id: "bondi-ai",
            intent_hash: "ih123",
            timestamp: "2026-03-29T22:44:00.000Z",
          }, 201)
        )
        .mockResolvedValueOnce(
          jsonResponse({
            intent_id: "INT-abc123",
            governance_status: "requires_approval",
            risk_level: "medium",
            requires_approval: true,
            reason: "Requires human approval",
            checks: [],
            governance_hash: "gh123",
          })
        );

      const result = await client.submitAndGovern({
        action: "send_email",
        agent_id: "bondi-ai",
      });

      expect(result.intent.intent_id).toBe("INT-abc123");
      expect(result.governance.requires_approval).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ── Read-Only: Verify ───────────────────────────────────────────────

  describe("verify", () => {
    it("calls GET /verify without intent_id for full chain", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ledger_chain_verification: {
            valid: true,
            total_entries: 42,
            chain_tip: "abc123",
          },
        })
      );

      const result = await client.verify();
      expect(result.ledger_chain_verification.valid).toBe(true);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/verify`);
    });

    it("calls GET /verify?intent_id=X for specific intent", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          receipt_verification: { valid: true, receipt_id: "RIO-abc", checks: {} },
          ledger_chain_verification: { valid: true, total_entries: 42, chain_tip: "abc123" },
        })
      );

      const result = await client.verify("INT-abc123");
      expect(result.receipt_verification?.valid).toBe(true);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("intent_id=INT-abc123");
    });
  });

  // ── Read-Only: Ledger ───────────────────────────────────────────────

  describe("getLedger", () => {
    it("calls GET /ledger with query params", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          entries: [{ intent_id: "INT-1", action: "send_email", status: "receipted" }],
          total: 1,
          chain_tip: "abc123",
        })
      );

      const result = await client.getLedger({ limit: 10, offset: 0 });
      expect(result.entries).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  // ── Read-Only: Health ───────────────────────────────────────────────

  describe("health", () => {
    it("calls GET /health", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          status: "operational",
          gateway: "RIO Governance Gateway",
          version: "2.1.0",
          timestamp: "2026-03-29T22:44:00.000Z",
          governance: { constitution_loaded: true, policy_loaded: true },
          ledger: { entries: 42, chain_valid: true, chain_tip: "abc123" },
          fail_mode: "closed",
        })
      );

      const result = await client.health();
      expect(result.status).toBe("operational");
      expect(result.ledger.chain_valid).toBe(true);
    });
  });

  // ── Authentication ──────────────────────────────────────────────────

  describe("login", () => {
    it("authenticates and stores JWT token", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          status: "authenticated",
          user_id: "brian",
          display_name: "Brian Rasmussen",
          role: "admin",
          token: "jwt-token-123",
          expires_in: "24h",
        })
      );

      const result = await client.login("brian", "rio-governed-2026");
      expect(result.status).toBe("authenticated");
      expect(result.token).toBe("jwt-token-123");

      // Verify token is used in subsequent requests
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          status: "operational",
          gateway: "RIO",
          version: "2.1.0",
          timestamp: new Date().toISOString(),
          governance: {},
          ledger: { entries: 0, chain_valid: true, chain_tip: "" },
          fail_mode: "closed",
        })
      );
      await client.health();

      const [, options] = mockFetch.mock.calls[1];
      expect(options.headers.Authorization).toBe("Bearer jwt-token-123");
    });
  });

  // ── Fail-Closed: Unreachable Gateway ────────────────────────────────

  describe("fail-closed behavior", () => {
    it("throws GatewayUnreachableError when gateway is down", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

      await expect(
        client.submitIntent({ action: "send_email", agent_id: "bondi-ai" })
      ).rejects.toThrow(GatewayUnreachableError);
    });

    it("throws GatewayUnreachableError on network timeout", async () => {
      mockFetch.mockRejectedValueOnce(new DOMException("The operation was aborted", "AbortError"));

      await expect(client.health()).rejects.toThrow(GatewayUnreachableError);
    });

    it("throws GatewayApiError on 403 (execution blocked)", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          { error: "Intent was denied by human authority.", intent_id: "INT-abc123", status: "blocked" },
          403
        )
      );

      await expect(client.execute("INT-abc123")).rejects.toThrow(GatewayApiError);
    });

    it("throws GatewayApiError on 404 (intent not found)", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Intent not found: INT-invalid" }, 404)
      );

      await expect(client.govern("INT-invalid")).rejects.toThrow(GatewayApiError);
    });
  });

  // ── Token Management ────────────────────────────────────────────────

  describe("setAuthToken", () => {
    it("allows manual token injection", async () => {
      client.setAuthToken("external-jwt-token");

      mockFetch.mockResolvedValueOnce(
        jsonResponse({ authenticated: true, user_id: "brian" })
      );

      await client.whoami();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBe("Bearer external-jwt-token");
    });
  });
});

// ── Factory Function ─────────────────────────────────────────────────────

describe("createGatewayClient", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns null when GATEWAY_URL is not set (Phase A)", () => {
    delete process.env.GATEWAY_URL;
    const client = createGatewayClient();
    expect(client).toBeNull();
  });

  it("returns a client when GATEWAY_URL is set", () => {
    process.env.GATEWAY_URL = "https://rio-gateway.railway.app";
    const client = createGatewayClient();
    expect(client).toBeInstanceOf(RioGatewayClient);
  });
});

// ── Health Check Helper ──────────────────────────────────────────────────

describe("isGatewayHealthy", () => {
  it("returns true when gateway is operational with valid chain", async () => {
    const client = new RioGatewayClient({ baseUrl: "https://rio-gateway.railway.app" });
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        status: "operational",
        gateway: "RIO",
        version: "2.1.0",
        timestamp: new Date().toISOString(),
        governance: {},
        ledger: { entries: 42, chain_valid: true, chain_tip: "abc123" },
        fail_mode: "closed",
      })
    );

    const healthy = await isGatewayHealthy(client);
    expect(healthy).toBe(true);
  });

  it("returns false when gateway is unreachable", async () => {
    const client = new RioGatewayClient({ baseUrl: "https://rio-gateway.railway.app" });
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const healthy = await isGatewayHealthy(client);
    expect(healthy).toBe(false);
  });

  it("returns false when ledger chain is invalid", async () => {
    const client = new RioGatewayClient({ baseUrl: "https://rio-gateway.railway.app" });
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        status: "operational",
        gateway: "RIO",
        version: "2.1.0",
        timestamp: new Date().toISOString(),
        governance: {},
        ledger: { entries: 42, chain_valid: false, chain_tip: "abc123" },
        fail_mode: "closed",
      })
    );

    const healthy = await isGatewayHealthy(client);
    expect(healthy).toBe(false);
  });
});
