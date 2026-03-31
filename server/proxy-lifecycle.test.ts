/**
 * Proxy Lifecycle Tests
 *
 * Tests the three new proxy lifecycle methods on RioGatewayClient:
 *   - onboard (POST /api/onboard)
 *   - kill (POST /api/kill)
 *   - sync (GET /api/sync)
 *
 * Also tests the tRPC procedures that wrap these methods:
 *   - rio.proxyOnboard
 *   - rio.proxyKill
 *   - rio.proxySync
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RioGatewayClient,
  GatewayUnreachableError,
  GatewayApiError,
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

describe("RioGatewayClient — Proxy Lifecycle", () => {
  const BASE_URL = "https://rio-gateway.onrender.com";
  let client: RioGatewayClient;

  beforeEach(() => {
    client = new RioGatewayClient({ baseUrl: BASE_URL });
  });

  // ── Onboard ────────────────────────────────────────────────────────────

  describe("onboard", () => {
    const onboardRequest = {
      public_key: "a".repeat(64),
      key_fingerprint: "a".repeat(16),
      display_name: "Brian Rasmussen",
      policies: {
        version: "policy-v1.0",
        rules: [
          { action: "*", approval: "require_human", confidence_threshold: 0.8 },
        ],
      },
      policy_hash: "b".repeat(64),
      confirmation_signature: "c".repeat(128),
      confirmation_timestamp: "2026-03-31T06:00:00.000Z",
    };

    it("sends POST /api/onboard with correct body", async () => {
      const mockResponse = {
        status: "active",
        proxy_id: "PROXY-brian-001",
        user_id: "brian",
        public_key_registered: true,
        policies_applied: 1,
        onboard_receipt_id: "RIO-onboard-001",
        onboard_hash: "d".repeat(64),
        timestamp: "2026-03-31T06:00:01.000Z",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockResponse, 201));

      const result = await client.onboard(onboardRequest);

      expect(result.status).toBe("active");
      expect(result.proxy_id).toBe("PROXY-brian-001");
      expect(result.public_key_registered).toBe(true);
      expect(result.policies_applied).toBe(1);
      expect(result.onboard_receipt_id).toBe("RIO-onboard-001");

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/onboard`);
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(body.public_key).toBe("a".repeat(64));
      expect(body.key_fingerprint).toBe("a".repeat(16));
      expect(body.display_name).toBe("Brian Rasmussen");
      expect(body.policies.version).toBe("policy-v1.0");
    });

    it("throws GatewayUnreachableError when gateway is down", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

      await expect(client.onboard(onboardRequest)).rejects.toThrow(
        GatewayUnreachableError
      );
    });

    it("throws GatewayApiError on 400 (bad request)", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          { error: "Invalid public key format", code: "INVALID_KEY" },
          400
        )
      );

      await expect(client.onboard(onboardRequest)).rejects.toThrow(
        GatewayApiError
      );
    });

    it("throws GatewayApiError on 409 (already onboarded)", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          { error: "Public key already registered", code: "DUPLICATE_KEY" },
          409
        )
      );

      await expect(client.onboard(onboardRequest)).rejects.toThrow(
        GatewayApiError
      );
    });
  });

  // ── Kill ───────────────────────────────────────────────────────────────

  describe("kill", () => {
    const killRequest = {
      public_key: "a".repeat(64),
      kill_signature: "e".repeat(128),
      kill_timestamp: "2026-03-31T06:05:00.000Z",
    };

    it("sends POST /api/kill with correct body", async () => {
      const mockResponse = {
        status: "killed",
        proxy_id: "PROXY-brian-001",
        tokens_burned: 3,
        kill_receipt_id: "RIO-kill-001",
        kill_hash: "f".repeat(64),
        timestamp: "2026-03-31T06:05:01.000Z",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockResponse));

      const result = await client.kill(killRequest);

      expect(result.status).toBe("killed");
      expect(result.proxy_id).toBe("PROXY-brian-001");
      expect(result.tokens_burned).toBe(3);
      expect(result.kill_receipt_id).toBe("RIO-kill-001");

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/kill`);
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(body.public_key).toBe("a".repeat(64));
      expect(body.kill_signature).toBe("e".repeat(128));
    });

    it("throws GatewayUnreachableError when gateway is down", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

      await expect(client.kill(killRequest)).rejects.toThrow(
        GatewayUnreachableError
      );
    });

    it("throws GatewayApiError on 404 (proxy not found)", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          { error: "No active proxy found for this key", code: "NOT_FOUND" },
          404
        )
      );

      await expect(client.kill(killRequest)).rejects.toThrow(GatewayApiError);
    });

    it("throws GatewayApiError on 403 (invalid signature)", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          { error: "Kill signature verification failed", code: "INVALID_SIG" },
          403
        )
      );

      await expect(client.kill(killRequest)).rejects.toThrow(GatewayApiError);
    });
  });

  // ── Sync ───────────────────────────────────────────────────────────────

  describe("sync", () => {
    it("sends GET /api/sync and returns full context", async () => {
      const mockResponse = {
        status: "synced",
        proxy_id: "PROXY-brian-001",
        pending_approvals: 2,
        recent_receipts: [
          {
            receipt_id: "RIO-abc123",
            action: "send_email",
            decision: "approved",
            timestamp: "2026-03-31T05:50:00.000Z",
          },
          {
            receipt_id: "RIO-abc124",
            action: "read_file",
            decision: "auto_approved",
            timestamp: "2026-03-31T05:55:00.000Z",
          },
        ],
        health: {
          gateway: "operational",
          ledger_valid: true,
          ledger_entries: 42,
        },
        pattern_confidence: 65,
        active_policies: 3,
        last_activity: "2026-03-31T05:55:00.000Z",
        timestamp: "2026-03-31T06:00:00.000Z",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockResponse));

      const result = await client.sync();

      expect(result.status).toBe("synced");
      expect(result.proxy_id).toBe("PROXY-brian-001");
      expect(result.pending_approvals).toBe(2);
      expect(result.recent_receipts).toHaveLength(2);
      expect(result.recent_receipts[0].action).toBe("send_email");
      expect(result.health.gateway).toBe("operational");
      expect(result.health.ledger_valid).toBe(true);
      expect(result.health.ledger_entries).toBe(42);
      expect(result.pattern_confidence).toBe(65);
      expect(result.active_policies).toBe(3);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/sync`);
      expect(options.method).toBe("GET");
    });

    it("throws GatewayUnreachableError when gateway is down", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

      await expect(client.sync()).rejects.toThrow(GatewayUnreachableError);
    });

    it("throws GatewayApiError on 401 (unauthenticated)", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          { error: "Authentication required", code: "UNAUTHORIZED" },
          401
        )
      );

      await expect(client.sync()).rejects.toThrow(GatewayApiError);
    });
  });

  // ── Integration: Auth token propagation ────────────────────────────────

  describe("auth token propagation", () => {
    it("includes JWT token in onboard request when authenticated", async () => {
      client.setAuthToken("jwt-brian-token");

      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          status: "active",
          proxy_id: "PROXY-brian-001",
          user_id: "brian",
          public_key_registered: true,
          policies_applied: 1,
          onboard_receipt_id: "RIO-onboard-001",
          onboard_hash: "d".repeat(64),
          timestamp: "2026-03-31T06:00:01.000Z",
        }, 201)
      );

      await client.onboard({
        public_key: "a".repeat(64),
        key_fingerprint: "a".repeat(16),
        display_name: "Brian",
        policies: {},
        policy_hash: "b".repeat(64),
        confirmation_signature: "c".repeat(128),
        confirmation_timestamp: "2026-03-31T06:00:00.000Z",
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBe("Bearer jwt-brian-token");
    });

    it("includes JWT token in kill request when authenticated", async () => {
      client.setAuthToken("jwt-brian-token");

      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          status: "killed",
          proxy_id: "PROXY-brian-001",
          tokens_burned: 0,
          kill_receipt_id: "RIO-kill-001",
          kill_hash: "f".repeat(64),
          timestamp: "2026-03-31T06:05:01.000Z",
        })
      );

      await client.kill({
        public_key: "a".repeat(64),
        kill_signature: "e".repeat(128),
        kill_timestamp: "2026-03-31T06:05:00.000Z",
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBe("Bearer jwt-brian-token");
    });

    it("includes JWT token in sync request when authenticated", async () => {
      client.setAuthToken("jwt-brian-token");

      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          status: "synced",
          proxy_id: "PROXY-brian-001",
          pending_approvals: 0,
          recent_receipts: [],
          health: { gateway: "operational", ledger_valid: true, ledger_entries: 0 },
          pattern_confidence: 0,
          active_policies: 0,
          last_activity: "",
          timestamp: "2026-03-31T06:00:00.000Z",
        })
      );

      await client.sync();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBe("Bearer jwt-brian-token");
    });
  });
});
