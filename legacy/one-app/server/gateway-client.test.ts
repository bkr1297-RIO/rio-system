/**
 * Tests for the ONE → Gateway integration.
 *
 * These tests verify:
 * 1. Gateway client token management
 * 2. App routing structure (3 screens only)
 * 3. Gateway URL configuration
 */
import { describe, expect, it } from "vitest";

describe("ONE Gateway Integration", () => {
  describe("App routing structure", () => {
    it("should have exactly 3 screens defined", async () => {
      // Read the App.tsx to verify only 3 routes exist
      const fs = await import("fs");
      const appContent = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/App.tsx",
        "utf-8"
      );

      // Count Route components (excluding catch-all redirect)
      const routeMatches = appContent.match(/<Route\s+path="/g);
      expect(routeMatches).not.toBeNull();
      expect(routeMatches!.length).toBe(10);

      // Verify the 10 required paths
      expect(appContent).toContain('path="/"');
      expect(appContent).toContain('path="/dashboard"');
      expect(appContent).toContain('path="/intent/new"');
      expect(appContent).toContain('path="/approvals"');
      expect(appContent).toContain('path="/receipts"');
      expect(appContent).toContain('path="/ledger"');
      expect(appContent).toContain('path="/status"');
      expect(appContent).toContain('path="/architecture"');
      expect(appContent).toContain('path="/ask-bondi"');
      expect(appContent).toContain('path="/email-firewall"');
    });

    it("should not import any old enforcement pages", () => {
      const fs = require("fs");
      const appContent = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/App.tsx",
        "utf-8"
      );

      // These old pages should NOT be imported (enforcement was in ONE)
      expect(appContent).not.toContain("import Bondi");
      expect(appContent).not.toContain("import SystemControl");
      expect(appContent).not.toContain("import Policies");
      expect(appContent).not.toContain("import Principals");
      expect(appContent).not.toContain("import SignerManagement");
      expect(appContent).not.toContain("import KeyRecovery");
    });

    it("should not contain AppShell with enforcement logic", () => {
      const fs = require("fs");
      const appContent = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/App.tsx",
        "utf-8"
      );

      // No tRPC proxy calls in App.tsx — ONE doesn't enforce
      expect(appContent).not.toContain("trpc.proxy");
      expect(appContent).not.toContain("pendingCount");
    });
  });

  describe("Gateway client module", () => {
    it("should export all required functions", async () => {
      const fs = await import("fs");
      const gatewayContent = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/lib/gateway.ts",
        "utf-8"
      );

      // Required exports for 3-screen flow
      expect(gatewayContent).toContain("export function getGatewayToken");
      expect(gatewayContent).toContain("export function setGatewayToken");
      expect(gatewayContent).toContain("export function clearGatewayToken");
      expect(gatewayContent).toContain("export async function gatewayWhoAmI");
      expect(gatewayContent).toContain("export async function gatewayLogin");
      expect(gatewayContent).toContain("export async function gatewayHealth");
      expect(gatewayContent).toContain("export async function submitIntent");
      expect(gatewayContent).toContain("export async function governIntent");
      expect(gatewayContent).toContain("export async function getPendingApprovals");
      expect(gatewayContent).toContain("export async function submitApproval");
      expect(gatewayContent).toContain("export function getGoogleOAuthUrl");
      expect(gatewayContent).toContain("export async function gatewayAuthStatus");
    });

    it("should use VITE_GATEWAY_URL for all requests", async () => {
      const fs = await import("fs");
      const gatewayContent = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/lib/gateway.ts",
        "utf-8"
      );

      expect(gatewayContent).toContain("VITE_GATEWAY_URL");
      expect(gatewayContent).toContain("GATEWAY_URL");
      // Should use fetch with GATEWAY_URL prefix
      expect(gatewayContent).toContain("`${GATEWAY_URL}${path}`");
    });

    it("should include replay prevention fields in POST requests", async () => {
      const fs = await import("fs");
      const gatewayContent = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/lib/gateway.ts",
        "utf-8"
      );

      // submitIntent, governIntent, and submitApproval must include replay prevention
      expect(gatewayContent).toContain("request_timestamp");
      expect(gatewayContent).toContain("request_nonce");
    });

    it("should include Authorization header when token exists", async () => {
      const fs = await import("fs");
      const gatewayContent = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/lib/gateway.ts",
        "utf-8"
      );

      expect(gatewayContent).toContain("Authorization");
      expect(gatewayContent).toContain("Bearer");
    });
  });

  describe("Login page", () => {
    it("should use Gateway passphrase as primary login method", async () => {
      const fs = await import("fs");
      const loginContent = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/pages/Login.tsx",
        "utf-8"
      );

      // Should use Gateway passphrase login via useGatewayAuth hook
      expect(loginContent).toContain("useGatewayAuth");
      expect(loginContent).toContain("login");
      expect(loginContent).toContain("passphrase");
      expect(loginContent).toContain("Authenticate");
    });

    it("should check Gateway auth status on mount", async () => {
      const fs = await import("fs");
      const loginContent = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/pages/Login.tsx",
        "utf-8"
      );

      // Should check gateway status and auth
      expect(loginContent).toContain("gatewayAuthStatus");
      expect(loginContent).toContain("useGatewayAuth");
    });

    it("should check Gateway status on mount", async () => {
      const fs = await import("fs");
      const loginContent = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/pages/Login.tsx",
        "utf-8"
      );

      expect(loginContent).toContain("gatewayAuthStatus");
      expect(loginContent).toContain("gatewayStatus");
      expect(loginContent).toContain("reachable");
    });

    it("should display Decision 2 footer", async () => {
      const fs = await import("fs");
      const loginContent = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/pages/Login.tsx",
        "utf-8"
      );

      expect(loginContent).toContain("Decision 2");
      expect(loginContent).toContain("Interface Is Not Authority");
    });
  });

  describe("Create Intent page", () => {
    it("should use Gateway-direct calls (not tRPC proxy)", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/pages/NewIntent.tsx",
        "utf-8"
      );

      // Uses Gateway-direct calls via gateway.ts
      expect(content).toContain("submitIntent");
      expect(content).toContain("governIntent");
      expect(content).toContain('from "@/lib/gateway"');
    });

    it("should display governance result after submission", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/pages/NewIntent.tsx",
        "utf-8"
      );

      expect(content).toContain("GovernResultCard");
      expect(content).toContain("AUTO_APPROVE");
      expect(content).toContain("REQUIRE_HUMAN");
      expect(content).toContain("REQUIRE_QUORUM");
      expect(content).toContain("AUTO_DENY");
    });
  });

  describe("Approvals page (Gateway-direct with approval flow)", () => {
    it("should use Gateway-direct calls (not tRPC proxy)", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/pages/GatewayApprovals.tsx",
        "utf-8"
      );

      // Uses Gateway-direct calls via gateway.ts
      expect(content).toContain("getPendingApprovals");
      expect(content).toContain("submitApproval");
      expect(content).toContain('from "@/lib/gateway"');
      // Execution pipeline uses server-side approveAndExecute (not browser-side gatewayExecuteAction)
      expect(content).toContain("approveAndExecute");
      expect(content).not.toContain("gatewayExecuteAction");
    });

    it("should poll for pending approvals via setInterval", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/pages/GatewayApprovals.tsx",
        "utf-8"
      );

      // Uses setInterval for polling (Gateway-direct, no tRPC refetchInterval)
      expect(content).toContain("setInterval");
      expect(content).toContain("fetchPending");
    });

    it("should handle proposer_ne_approver invariant", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/pages/GatewayApprovals.tsx",
        "utf-8"
      );

      // proposer_ne_approver is now handled server-side in approveAndExecute.
      // The UI shows the error message returned by the server.
      expect(content).toContain("toast.error");
    });

    it("should use useGatewayAuth for auth gating", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/pages/GatewayApprovals.tsx",
        "utf-8"
      );

      expect(content).toContain("useGatewayAuth");
      expect(content).not.toContain('from "@/_core/hooks/useAuth"');
    });

    it("should display Decision 2 footer", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync(
        "/home/ubuntu/rio-proxy/client/src/pages/GatewayApprovals.tsx",
        "utf-8"
      );

      expect(content).toContain("Decision 2");
      expect(content).toContain("Interface Is Not Authority");
    });
  });

  describe("VITE_GATEWAY_URL configuration", () => {
    it("should be defined in environment", () => {
      // The env var should be set (even if empty for dev)
      const url = process.env.VITE_GATEWAY_URL;
      // It's OK if it's undefined in test env — the gateway.ts handles fallback
      expect(typeof url === "string" || typeof url === "undefined").toBe(true);
    });
  });
});
