/**
 * Connector Architecture Tests
 *
 * Tests the connector registry, individual connectors, fail-closed behavior,
 * and connector-aware execution routing.
 */

import { describe, it, expect } from "vitest";
import { connectorRegistry } from "./connectors";

describe("Connector Registry", () => {
  it("lists all registered connectors", () => {
    const connectors = connectorRegistry.listConnectors();
    expect(connectors.length).toBeGreaterThanOrEqual(4);

    const ids = connectors.map((c) => c.id);
    expect(ids).toContain("gmail");
    expect(ids).toContain("google_calendar");
    expect(ids).toContain("google_drive");
    expect(ids).toContain("github");
  });

  it("lists all supported actions across connectors", () => {
    const actions = connectorRegistry.listActions();
    expect(actions.length).toBeGreaterThanOrEqual(8);

    const actionNames = actions.map((a) => a.action);
    expect(actionNames).toContain("send_email");
    expect(actionNames).toContain("create_event");
    expect(actionNames).toContain("write_file");
    expect(actionNames).toContain("delete_file");
    expect(actionNames).toContain("create_issue");
    expect(actionNames).toContain("create_pr");
  });

  it("gets a specific connector by ID", () => {
    const gmail = connectorRegistry.getConnector("gmail");
    expect(gmail).not.toBeNull();
    expect(gmail!.name).toBe("Gmail");
    expect(gmail!.platform).toBe("google");
    expect(gmail!.status).toBe("connected");

    const calendar = connectorRegistry.getConnector("google_calendar");
    expect(calendar).not.toBeNull();
    expect(calendar!.name).toBe("Google Calendar");
    expect(calendar!.status).toBe("simulated");
  });

  it("returns null for unknown connector", () => {
    const unknown = connectorRegistry.getConnector("nonexistent");
    expect(unknown).toBeNull();
  });
});

describe("Connector Routing", () => {
  it("routes send_email to Gmail connector", async () => {
    const result = await connectorRegistry.execute({
      intentId: "test-intent-1",
      receiptId: "test-receipt-1",
      action: "send_email",
      parameters: { to: "test@example.com", subject: "Test", body: "Hello" },
      mode: "simulated",
    });

    expect(result.success).toBe(true);
    expect(result.connector).toBe("gmail");
    expect(result.action).toBe("send_email");
    expect(result.mode).toBe("simulated");
    expect(result.detail).toContain("Simulated");
  });

  it("routes create_event to Calendar connector", async () => {
    const result = await connectorRegistry.execute({
      intentId: "test-intent-2",
      receiptId: "test-receipt-2",
      action: "create_event",
      parameters: { title: "Team Sync", date: "2026-03-28", time: "2:00 PM" },
      mode: "simulated",
    });

    expect(result.success).toBe(true);
    expect(result.connector).toBe("google_calendar");
    expect(result.action).toBe("create_event");
    expect(result.detail).toContain("Simulated");
    expect(result.detail).toContain("Team Sync");
  });

  it("routes write_file to Drive connector", async () => {
    const result = await connectorRegistry.execute({
      intentId: "test-intent-3",
      receiptId: "test-receipt-3",
      action: "write_file",
      parameters: { filename: "report.docx", destination: "/Reports/" },
      mode: "simulated",
    });

    expect(result.success).toBe(true);
    expect(result.connector).toBe("google_drive");
    expect(result.action).toBe("write_file");
    expect(result.detail).toContain("report.docx");
  });

  it("routes delete_file to Drive connector with correct risk", async () => {
    const actions = connectorRegistry.listActions();
    const deleteAction = actions.find((a) => a.action === "delete_file");
    expect(deleteAction).toBeDefined();
    expect(deleteAction!.riskLevel).toBe("High");
    expect(deleteAction!.connector).toBe("google_drive");
  });
});

describe("Fail-Closed Behavior", () => {
  it("blocks execution when no connector matches the action", async () => {
    const result = await connectorRegistry.execute({
      intentId: "test-intent-4",
      receiptId: "test-receipt-4",
      action: "unknown_action_xyz",
      parameters: {},
      mode: "live",
    });

    expect(result.success).toBe(false);
    expect(result.connector).toBe("none");
    expect(result.error).toBe("NO_CONNECTOR");
    expect(result.detail).toContain("No connector found");
  });

  it("forces simulated mode when connector status is simulated even if live requested", async () => {
    // Calendar connector is simulated, so even live mode should be forced to simulated
    const result = await connectorRegistry.execute({
      intentId: "test-intent-5",
      receiptId: "test-receipt-5",
      action: "create_event",
      parameters: { title: "Meeting" },
      mode: "live",
    });

    expect(result.success).toBe(true);
    expect(result.mode).toBe("simulated"); // Forced to simulated
    expect(result.connector).toBe("google_calendar");
  });

  it("allows live mode for connected connectors", async () => {
    // Gmail connector is connected, so live mode should be allowed
    // Note: actual MCP CLI call may fail in test env (no UI dialog) — that's expected
    const result = await connectorRegistry.execute({
      intentId: "test-intent-6",
      receiptId: "test-receipt-6",
      action: "send_email",
      parameters: { to: "test@example.com", subject: "Live Test", body: "Hello" },
      mode: "live",
    });

    // Mode should be live since Gmail is connected (not forced to simulated)
    expect(result.mode).toBe("live");
    expect(result.connector).toBe("gmail");
    // Success may be false if MCP CLI isn't available in test env — that's OK
    // The important thing is that live mode was attempted, not forced to simulated
  });
});

describe("Connector Info", () => {
  it("Gmail connector reports correct capabilities", () => {
    const gmail = connectorRegistry.getConnector("gmail");
    expect(gmail).not.toBeNull();
    expect(gmail!.capabilities.length).toBeGreaterThanOrEqual(2);

    const capActions = gmail!.capabilities.map((c) => c.action);
    expect(capActions).toContain("send_email");
    expect(capActions).toContain("draft_email");
  });

  it("Calendar connector reports correct capabilities", () => {
    const cal = connectorRegistry.getConnector("google_calendar");
    expect(cal).not.toBeNull();

    const capActions = cal!.capabilities.map((c) => c.action);
    expect(capActions).toContain("create_event");
    expect(capActions).toContain("update_event");
    expect(capActions).toContain("delete_event");
  });

  it("Drive connector reports correct capabilities", () => {
    const drive = connectorRegistry.getConnector("google_drive");
    expect(drive).not.toBeNull();

    const capActions = drive!.capabilities.map((c) => c.action);
    expect(capActions).toContain("write_file");
    expect(capActions).toContain("read_file");
    expect(capActions).toContain("move_file");
    expect(capActions).toContain("delete_file");
  });

  it("each connector has required metadata fields", () => {
    const connectors = connectorRegistry.listConnectors();
    for (const c of connectors) {
      expect(c.id).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.platform).toBeTruthy();
      expect(c.icon).toBeTruthy();
      expect(["connected", "disconnected", "simulated"]).toContain(c.status);
      expect(c.capabilities.length).toBeGreaterThan(0);
      expect(c.description).toBeTruthy();
    }
  });
});

describe("GitHub Connector", () => {
  it("routes create_issue to GitHub connector", async () => {
    const result = await connectorRegistry.execute({
      intentId: "test-gh-1",
      receiptId: "test-gh-receipt-1",
      action: "create_issue",
      parameters: {
        repo: "bkr1297-RIO/rio-system",
        title: "Test Issue",
        body: "This is a test",
      },
      mode: "simulated",
    });

    expect(result.success).toBe(true);
    expect(result.connector).toBe("github");
    expect(result.action).toBe("create_issue");
    expect(result.mode).toBe("simulated");
    expect(result.detail).toContain("Simulated");
    expect(result.detail).toContain("Test Issue");
  });

  it("routes create_pr to GitHub connector", async () => {
    const result = await connectorRegistry.execute({
      intentId: "test-gh-2",
      receiptId: "test-gh-receipt-2",
      action: "create_pr",
      parameters: {
        repo: "bkr1297-RIO/rio-system",
        title: "Test PR",
        body: "Test body",
        head: "feature/test",
        base: "main",
      },
      mode: "simulated",
    });

    expect(result.success).toBe(true);
    expect(result.connector).toBe("github");
    expect(result.action).toBe("create_pr");
    expect(result.detail).toContain("Simulated");
    expect(result.detail).toContain("Test PR");
  });

  it("routes commit_file to GitHub connector", async () => {
    const result = await connectorRegistry.execute({
      intentId: "test-gh-3",
      receiptId: "test-gh-receipt-3",
      action: "commit_file",
      parameters: {
        repo: "bkr1297-RIO/rio-system",
        filename: "test.txt",
        content: "Hello world",
      },
      mode: "simulated",
    });

    expect(result.success).toBe(true);
    expect(result.connector).toBe("github");
    expect(result.action).toBe("commit_file");
    expect(result.detail).toContain("Simulated");
    expect(result.detail).toContain("test.txt");
  });

  it("GitHub connector reports correct capabilities", () => {
    const gh = connectorRegistry.getConnector("github");
    expect(gh).not.toBeNull();
    expect(gh!.name).toBe("GitHub");
    expect(gh!.platform).toBe("github");
    expect(gh!.status).toBe("connected");

    const capActions = gh!.capabilities.map((c) => c.action);
    expect(capActions).toContain("create_issue");
    expect(capActions).toContain("create_pr");
    expect(capActions).toContain("commit_file");
  });

  it("allows live mode for GitHub connector (connected)", async () => {
    const result = await connectorRegistry.execute({
      intentId: "test-gh-live-1",
      receiptId: "test-gh-live-receipt-1",
      action: "create_issue",
      parameters: {
        repo: "bkr1297-RIO/rio-system",
        title: "Live Test",
        body: "Test",
      },
      mode: "live",
    });

    // Live mode should be allowed (connector is connected)
    // But the actual gh CLI call might fail in test env — that's fine
    // We just verify the mode isn't forced to simulated
    expect(result.connector).toBe("github");
    expect(result.action).toBe("create_issue");
    // Mode should be live since GitHub is connected
    expect(result.mode).toBe("live");
  });
});

describe("Execution Result Shape", () => {
  it("returns all required fields in execution result", async () => {
    const result = await connectorRegistry.execute({
      intentId: "test-shape-1",
      receiptId: "test-shape-receipt-1",
      action: "send_email",
      parameters: { to: "test@example.com", subject: "Shape Test", body: "Hello" },
      mode: "simulated",
    });

    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("connector");
    expect(result).toHaveProperty("action");
    expect(result).toHaveProperty("mode");
    expect(result).toHaveProperty("executedAt");
    expect(result).toHaveProperty("detail");
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.executedAt).toBe("string");
  });
});
