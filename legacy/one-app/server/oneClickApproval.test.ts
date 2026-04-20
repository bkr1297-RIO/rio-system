/**
 * One-Click Approval — Unit Tests
 *
 * Tests the HMAC token generation/verification, URL building,
 * and structural correctness of the approval module.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateApprovalToken, verifyApprovalToken, buildApprovalUrl } from "./oneClickApproval";

describe("One-Click Approval Token", () => {
  it("generates a token with correct format (expiresAt.hmac)", () => {
    const token = generateApprovalToken("test-intent-123");
    expect(token).toMatch(/^\d+\.[a-f0-9]{64}$/);
  });

  it("verifies a valid token", () => {
    const intentId = "intent-abc-456";
    const token = generateApprovalToken(intentId);
    const result = verifyApprovalToken(intentId, token);
    expect(result.valid).toBe(true);
    expect(result.expired).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it("rejects a token for a different intentId", () => {
    const token = generateApprovalToken("intent-A");
    const result = verifyApprovalToken("intent-B", token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid signature");
  });

  it("rejects a malformed token", () => {
    const result = verifyApprovalToken("intent-123", "not-a-valid-token");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Malformed token");
  });

  it("rejects a token with invalid expiry", () => {
    const result = verifyApprovalToken("intent-123", "abc.deadbeef");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid expiry");
  });

  it("rejects an expired token", () => {
    const intentId = "intent-expired";
    const token = generateApprovalToken(intentId);

    // Manually create an expired token
    const parts = token.split(".");
    const expiredAt = Date.now() - 1000; // 1 second ago
    const { createHmac } = require("crypto");
    const payload = `${intentId}:${expiredAt}`;
    const hmac = createHmac("sha256", process.env.JWT_SECRET || "rio-fallback-secret")
      .update(payload)
      .digest("hex");
    const expiredToken = `${expiredAt}.${hmac}`;

    const result = verifyApprovalToken(intentId, expiredToken);
    expect(result.valid).toBe(false);
    expect(result.expired).toBe(true);
    expect(result.error).toBe("Token expired");
  });

  it("generates different tokens for different intentIds", () => {
    const token1 = generateApprovalToken("intent-1");
    const token2 = generateApprovalToken("intent-2");
    expect(token1).not.toBe(token2);
  });
});

describe("One-Click Approval URL", () => {
  it("builds a URL with the correct structure", () => {
    const url = buildApprovalUrl("intent-xyz", "https://example.com");
    expect(url).toMatch(/^https:\/\/example\.com\/api\/approve\/intent-xyz\/\d+\.[a-f0-9]{64}$/);
  });

  it("includes the intentId in the URL path", () => {
    const url = buildApprovalUrl("my-intent-id", "https://test.com");
    expect(url).toContain("/api/approve/my-intent-id/");
  });

  it("uses a valid token in the URL", () => {
    const intentId = "url-test-intent";
    const url = buildApprovalUrl(intentId, "https://test.com");
    const token = url.split("/").pop()!;
    const result = verifyApprovalToken(intentId, token);
    expect(result.valid).toBe(true);
  });
});

describe("One-Click Approval Module Structure", () => {
  it("source file contains registerOneClickApproval export", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/oneClickApproval.ts", "utf-8");
    expect(source).toContain("export function registerOneClickApproval");
  });

  it("registers GET and POST /api/approve/:intentId/:token endpoints", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/oneClickApproval.ts", "utf-8");
    expect(source).toContain('app.get("/api/approve/:intentId/:token"');
    expect(source).toContain('app.post("/api/approve/:intentId/:token"');
  });

  it("POST handler logs in as both I-1 and I-2 for governance separation", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/oneClickApproval.ts", "utf-8");
    expect(source).toContain('user_id: "I-1"');
    expect(source).toContain('user_id: "I-2"');
  });

  it("POST handler calls /authorize with I-2 token", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/oneClickApproval.ts", "utf-8");
    expect(source).toContain("/authorize");
    expect(source).toContain("i2Data.token");
  });

  it("POST handler calls /execute-action with I-1 token", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/oneClickApproval.ts", "utf-8");
    expect(source).toContain("/execute-action");
    expect(source).toContain("i1Data.token");
  });

  it("POST handler injects _gatewayExecution: true for connector", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/oneClickApproval.ts", "utf-8");
    expect(source).toContain("_gatewayExecution: true");
  });

  it("POST handler logs to local ledger with execution_path: one_click_approval", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/oneClickApproval.ts", "utf-8");
    expect(source).toContain("one_click_approval");
    expect(source).toContain("appendLedger");
  });

  it("POST handler sends Telegram receipt notification", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/oneClickApproval.ts", "utf-8");
    expect(source).toContain("One-Click Approved");
    expect(source).toContain("sendTg");
  });

  it("HTML page includes Authorize & Execute button", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/oneClickApproval.ts", "utf-8");
    expect(source).toContain("Authorize & Execute");
  });

  it("HTML page shows receipt after successful execution", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/oneClickApproval.ts", "utf-8");
    expect(source).toContain("Authorized & Executed");
    expect(source).toContain("receipt_id");
    expect(source).toContain("receipt_hash");
  });
});

describe("Telegram Notification includes one-click URL", () => {
  it("telegram.ts imports buildApprovalUrl", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/telegram.ts", "utf-8");
    expect(source).toContain('import { buildApprovalUrl } from "./oneClickApproval"');
  });

  it("sendIntentNotification builds an approval URL", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/telegram.ts", "utf-8");
    expect(source).toContain("buildApprovalUrl(intent.intentId)");
  });

  it("Telegram inline keyboard includes One-Click Approve button with URL", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/telegram.ts", "utf-8");
    expect(source).toContain("One-Click Approve");
    expect(source).toContain("url: approvalUrl");
  });
});

describe("Login page is single-user mode", () => {
  it("Login.tsx does not contain principal selector", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("client/src/pages/Login.tsx", "utf-8");
    expect(source).not.toContain("Select Principal");
    expect(source).not.toContain("PRINCIPALS");
    expect(source).not.toContain("selectedPrincipal");
  });

  it("Login.tsx auto-selects I-1 for login", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("client/src/pages/Login.tsx", "utf-8");
    expect(source).toContain('login("I-1"');
  });

  it("Login.tsx navigates to /approvals after login", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("client/src/pages/Login.tsx", "utf-8");
    expect(source).toContain('navigate("/approvals")');
  });
});

describe("_core/index.ts registers one-click approval", () => {
  it("imports registerOneClickApproval", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/_core/index.ts", "utf-8");
    expect(source).toContain('import { registerOneClickApproval } from "../oneClickApproval"');
  });

  it("calls registerOneClickApproval(app)", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/_core/index.ts", "utf-8");
    expect(source).toContain("registerOneClickApproval(app)");
  });
});
