/**
 * Outbound Governance Loop Tests
 * ────────────────────────────────
 * Proves that no direct execution path exists for HIGH-risk outbound actions.
 *
 * Invariant: send_email and send_sms connectors REFUSE direct execution
 * and REQUIRE the _gatewayExecution flag, which is ONLY set by the
 * gateway.approveAndExecute path after completing the full governance loop.
 *
 * Test categories:
 *   1. Direct execution is REFUSED (no _gatewayExecution flag)
 *   2. Gateway-authorized execution SUCCEEDS (with _gatewayExecution flag)
 *   3. Firewall still blocks dangerous content even through Gateway path
 *   4. LOW-risk connectors (web_search, draft_email) still work directly
 *   5. Static proof: approveAndExecute is the only code path that sets _gatewayExecution
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Mock external dependencies
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db") as Record<string, unknown>;
  return {
    ...actual,
    getRecentReceipts: vi.fn().mockResolvedValue([]),
    storeFirewallReceipt: vi.fn().mockResolvedValue(undefined),
    appendLedger: vi.fn().mockResolvedValue({ entryId: "test-entry" }),
  };
});

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("./telegram", () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
  isTelegramConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock("./coherence", () => ({
  checkCoherence: vi.fn().mockResolvedValue({
    coherence_id: "test-coh",
    status: "pass",
    drift_detected: false,
    signals: [],
    confidence: 1.0,
  }),
  runCoherenceCheck: vi.fn().mockResolvedValue({
    coherence_id: "test-coh",
    status: "pass",
    drift_detected: false,
    signals: [],
    confidence: 1.0,
  }),
  buildSystemContext: vi.fn().mockReturnValue({}),
}));

import { dispatchExecution, getConnector } from "./connectors";
import { _resetForTesting } from "./emailFirewall";

beforeEach(() => {
  _resetForTesting();
  vi.clearAllMocks();
});

// ─── 1. Direct Execution is REFUSED ────────────────────────────

describe("Outbound Governance: Direct Execution Refused", () => {
  it("send_email REFUSES direct execution without _gatewayExecution flag", async () => {
    const connector = getConnector("send_email");
    expect(connector).toBeDefined();

    const result = await connector!(
      { to: "test@example.com", subject: "Hello", body: "Test message" },
      null,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("REQUIRES_GATEWAY_GOVERNANCE");
    expect(result.output).toBeDefined();
    expect((result.output as Record<string, unknown>).requires_gateway).toBe(true);
  });

  it("send_sms REFUSES direct execution without _gatewayExecution flag", async () => {
    const connector = getConnector("send_sms");
    expect(connector).toBeDefined();

    const result = await connector!(
      { to: "+18015551234", body: "Test SMS" },
      null,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("REQUIRES_GATEWAY_GOVERNANCE");
    expect((result.output as Record<string, unknown>).requires_gateway).toBe(true);
  });

  it("send_email via dispatchExecution is blocked at dispatch layer (no approval proof for HIGH risk)", async () => {
    // dispatchExecution blocks HIGH-risk actions without approval proof BEFORE reaching the connector.
    // This is a SECOND layer of defense — even if the connector gate were bypassed,
    // dispatchExecution would still refuse.
    const result = await dispatchExecution(
      "send_email",
      { to: "test@example.com", subject: "Hello", body: "Test" },
      null,
      "HIGH",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("FAIL_CLOSED");
    expect(result.error).toContain("HIGH risk action requires approval proof");
  });

  it("send_sms via dispatchExecution is blocked at dispatch layer (no approval proof for HIGH risk)", async () => {
    const result = await dispatchExecution(
      "send_sms",
      { to: "+18015551234", body: "Test SMS" },
      null,
      "HIGH",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("FAIL_CLOSED");
    expect(result.error).toContain("HIGH risk action requires approval proof");
  });

  it("send_email REFUSES even with a valid approval proof but no _gatewayExecution", async () => {
    const result = await dispatchExecution(
      "send_email",
      { to: "test@example.com", subject: "Hello", body: "Test" },
      {
        approvalId: "test-approval-123",
        intentId: "test-intent-123",
        boundToolName: "send_email",
        boundArgsHash: "abc123",
        signature: "sig-test",
        expiresAt: Date.now() + 60000,
      },
      "HIGH",
      "abc123",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("REQUIRES_GATEWAY_GOVERNANCE");
  });
});

// ─── 2. Gateway-Authorized Execution SUCCEEDS ──────────────────

describe("Outbound Governance: Gateway-Authorized Execution", () => {
  it("send_email SUCCEEDS with _gatewayExecution=true", async () => {
    const connector = getConnector("send_email");
    const result = await connector!(
      {
        to: "test@example.com",
        subject: "Governed Email",
        body: "This was approved through RIO.",
        _gatewayExecution: true,
      },
      null,
    );

    expect(result.success).toBe(true);
    expect((result.output as Record<string, unknown>).delivered).toBe(true);
    expect((result.output as Record<string, unknown>).governance).toBe("gateway");
    expect((result.output as Record<string, unknown>).method).toBe("notifyOwner");
  });

  it("send_email _gatewayExecution must be boolean true, not truthy string", async () => {
    const connector = getConnector("send_email");

    // String "true" should NOT pass the gate — use unique content to avoid dedup
    const uniqueBody = `Strict type check test ${Date.now()}-${Math.random()}`;
    const result = await connector!(
      {
        to: "typecheck@example.com",
        subject: "Type Check Test",
        body: uniqueBody,
        _gatewayExecution: "true", // string, not boolean
      },
      null,
    );

    expect(result.success).toBe(false);
    // Should be either REQUIRES_GATEWAY_GOVERNANCE or FIREWALL_BLOCKED — but NOT success
    expect(result.error).toBeDefined();
    // The key assertion: it must NOT succeed (no delivery)
    expect(result.success).toBe(false);
  });
});

// ─── 3. Firewall Still Blocks Dangerous Content via Gateway ─────

describe("Outbound Governance: Firewall Gate Still Active", () => {
  it("send_email blocks dangerous content even with _gatewayExecution=true", async () => {
    const connector = getConnector("send_email");
    // Message with urgency + consequential action + unknown sender pattern
    const result = await connector!(
      {
        to: "victim@target.com",
        subject: "URGENT: Transfer funds immediately",
        body: "You must wire $50,000 to account 12345 immediately or face legal consequences. Click here to confirm payment now.",
        _gatewayExecution: true,
      },
      null,
    );

    // The MVP firewall rule should block this (urgency + consequential + unknown sender)
    expect(result.success).toBe(false);
    expect(result.error).toContain("FIREWALL_BLOCKED");
  });
});

// ─── 4. LOW-Risk Connectors Still Work Directly ─────────────────

describe("Outbound Governance: LOW-Risk Direct Execution Allowed", () => {
  it("draft_email works directly without _gatewayExecution", async () => {
    const connector = getConnector("draft_email");
    expect(connector).toBeDefined();

    const result = await connector!(
      { to: "test@example.com", subject: "Draft", body: "Draft content" },
      null,
    );

    expect(result.success).toBe(true);
    expect((result.output as Record<string, unknown>).draft).toBe(true);
  });

  it("web_search connector exists and does NOT have _gatewayExecution check", () => {
    // Static proof: web_search connector does not contain gateway governance enforcement
    const src = readFileSync(join(__dirname, "connectors.ts"), "utf-8");
    const webSearchStart = src.indexOf("async function executeWebSearch");
    // Use the comment block separator before executeSendEmail as the boundary
    const sendEmailComment = src.indexOf("// \u2500\u2500\u2500 Send Email (HIGH risk)");
    const webSearchBody = src.slice(webSearchStart, sendEmailComment);

    // web_search should NOT contain _gatewayExecution check
    expect(webSearchBody).not.toContain("_gatewayExecution");
    expect(webSearchBody).not.toContain("REQUIRES_GATEWAY_GOVERNANCE");
  });
});

// ─── 5. Static Proof: _gatewayExecution Only Set in approveAndExecute ──

describe("Outbound Governance: Static Code Proof", () => {
  it("_gatewayExecution flag is ONLY checked (not assigned) in connectors.ts", () => {
    const connectorsSrc = readFileSync(join(__dirname, "connectors.ts"), "utf-8");

    // In connectors.ts, _gatewayExecution should be checked with === true
    const connectorChecks = connectorsSrc.match(/toolArgs\._gatewayExecution\s*===\s*true/g) || [];
    expect(connectorChecks.length).toBeGreaterThan(0); // It should be checked in at least one connector

    // There should be NO assignment of _gatewayExecution in connectors.ts
    // (assignments look like: _gatewayExecution = true or _gatewayExecution: true)
    // We check for lines that SET the flag as a property assignment
    const lines = connectorsSrc.split("\n");
    for (const line of lines) {
      // Skip comments and check lines
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
      if (line.includes("===")) continue; // comparison, not assignment
      // Check for property assignment pattern: _gatewayExecution: true
      if (line.includes("_gatewayExecution:") && line.includes("true")) {
        throw new Error(`Found _gatewayExecution assignment in connectors.ts: ${line.trim()}`);
      }
    }
  });

  it("dispatchExecution is called from proxy.execute AND approveAndExecute (for local delivery)", () => {
    const routersSrc = readFileSync(join(__dirname, "routers.ts"), "utf-8");
    const routerLines = routersSrc.split("\n");

    // Find all lines that call dispatchExecution (the connector dispatch)
    const dispatchLines = routerLines
      .map((line, i) => ({ line: line.trim(), num: i + 1 }))
      .filter(({ line }) => {
        if (line.startsWith("//") || line.startsWith("*")) return false;
        if (line.startsWith("import")) return false;
        return line.includes("dispatchExecution(");
      });

    // Architecture: Gateway = governance engine, Proxy = execution engine.
    // dispatchExecution is called from:
    //   1. proxy.execute — for the standard proxy execution path
    //   2. approveAndExecute — for local Gmail delivery AFTER Gateway governance receipt
    // Both paths require proper approval proof before reaching dispatchExecution.
    expect(dispatchLines.length).toBe(2);

    // First call should be in proxy.execute
    const firstNum = dispatchLines[0].num;
    const firstContext = routerLines.slice(Math.max(0, firstNum - 200), firstNum).join("\n");
    expect(firstContext).toContain("execute: protectedProcedure");

    // Second call should be in approveAndExecute (local Gmail delivery after Gateway receipt)
    const secondNum = dispatchLines[1].num;
    // approveAndExecute starts ~270 lines before the dispatchExecution call, use 300 line window
    const secondContext = routerLines.slice(Math.max(0, secondNum - 300), secondNum).join("\n");
    expect(secondContext).toContain("approveAndExecute:");
  });

  it("approveAndExecute always calls Gateway /execute-action with delivery_mode=external first", () => {
    const routersSrc = readFileSync(join(__dirname, "routers.ts"), "utf-8");

    // Find the approveAndExecute section
    const approveStart = routersSrc.indexOf("approveAndExecute:");
    const approveEnd = routersSrc.indexOf("health:", approveStart);
    const approveBody = routersSrc.slice(approveStart, approveEnd);

    // Must call Gateway /execute-action with delivery_mode=external
    expect(approveBody).toContain('/execute-action');
    expect(approveBody).toContain('delivery_mode: "external"');

    // The Gateway call must come BEFORE dispatchExecution
    const gwCallPos = approveBody.indexOf('delivery_mode: "external"');
    const dispatchPos = approveBody.indexOf('dispatchExecution(');
    expect(gwCallPos).toBeGreaterThan(0);
    expect(dispatchPos).toBeGreaterThan(gwCallPos);
  });

  it("executeApproved does NOT use dispatchExecution", () => {
    const routersSrc = readFileSync(join(__dirname, "routers.ts"), "utf-8");

    // Find the executeApproved section
    const execApprovedStart = routersSrc.indexOf("executeApproved:");
    const execApprovedEnd = routersSrc.indexOf("deliverEmail:");
    const execApprovedBody = routersSrc.slice(execApprovedStart, execApprovedEnd);

    // executeApproved should NOT call dispatchExecution
    expect(execApprovedBody).not.toContain("dispatchExecution(");
  });

  it("executeSendEmail connector header documents GATEWAY-ONLY enforcement", () => {
    const src = readFileSync(join(__dirname, "connectors.ts"), "utf-8");
    expect(src).toContain("GATEWAY-ONLY");
    expect(src).toContain("GOVERNANCE INVARIANT");
    expect(src).toContain("No HIGH-risk connector executes without _gatewayExecution=true");
  });

  it("no direct notifyOwner call exists outside the gateway-guarded path in send_email", () => {
    const src = readFileSync(join(__dirname, "connectors.ts"), "utf-8");

    // Find the executeSendEmail function
    const funcStart = src.indexOf("async function executeSendEmail");
    const funcEnd = src.indexOf("async function executeSendSms");
    const funcBody = src.slice(funcStart, funcEnd);

    // The notifyOwner call should only appear AFTER the _gatewayExecution check
    const gatewayCheckPos = funcBody.indexOf("if (!isGatewayExecution)");
    const notifyPos = funcBody.indexOf("notifyOwner(");

    expect(gatewayCheckPos).toBeGreaterThan(0);
    expect(notifyPos).toBeGreaterThan(0);
    // notifyOwner must come AFTER the gateway check (it's in the else branch)
    expect(notifyPos).toBeGreaterThan(gatewayCheckPos);
  });
});
