/**
 * Slack Connector Tests
 *
 * Tests the Slack connector:
 *   1. Simulated mode returns simulated results
 *   2. Live mode attempts webhook POST when URL exists
 *   3. Returns error when no webhook URL is configured
 *   4. Handles webhook failures gracefully
 *   5. send_slack_alert uses Block Kit formatting
 *   6. Connector metadata is correct
 *   7. Registry routing works for Slack actions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock slack-helpers ────────────────────────────────────────────────────
const mockGetSlackWebhookUrl = vi.fn();
vi.mock("./connectors/slack-helpers", () => ({
  getSlackWebhookUrl: (...args: unknown[]) => mockGetSlackWebhookUrl(...args),
  saveSlackWebhookUrl: vi.fn(),
  disconnectSlack: vi.fn(),
}));

// ── Mock global fetch ────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { SlackConnector } from "./connectors/slack";
import type { ExecutionRequest } from "./connectors/base";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeSlackRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    intentId: "intent-slack-001",
    receiptId: "receipt-slack-001",
    action: "send_slack_message",
    parameters: {
      message: "Hello from Bondi!",
      channel: "#general",
    },
    mode: "live",
    ...overrides,
  };
}

// ── Slack Connector Tests ────────────────────────────────────────────────

describe("SlackConnector — simulated mode", () => {
  let connector: SlackConnector;

  beforeEach(() => {
    connector = new SlackConnector();
    vi.clearAllMocks();
  });

  it("returns simulated result for send_slack_message", async () => {
    const result = await connector.execute(
      makeSlackRequest({ mode: "simulated" })
    );

    expect(result.success).toBe(true);
    expect(result.detail).toContain("[Simulated]");
    expect(result.detail).toContain("#general");
    expect(result.detail).toContain("Hello from Bondi!");
    expect(result.connector).toBe("slack");
    expect(result.mode).toBe("simulated");
    expect(mockGetSlackWebhookUrl).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns simulated result for send_slack_alert", async () => {
    const result = await connector.execute(
      makeSlackRequest({
        mode: "simulated",
        action: "send_slack_alert",
        parameters: {
          title: "Test Alert",
          message: "Something happened",
        },
      })
    );

    expect(result.success).toBe(true);
    expect(result.detail).toContain("[Simulated]");
    expect(result.mode).toBe("simulated");
  });
});

describe("SlackConnector — live mode with webhook", () => {
  let connector: SlackConnector;

  beforeEach(() => {
    connector = new SlackConnector();
    vi.clearAllMocks();
  });

  it("sends message via webhook when URL exists", async () => {
    mockGetSlackWebhookUrl.mockResolvedValue("https://hooks.slack.com/services/T123/B456/abc");
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("ok"),
    });

    const result = await connector.execute(
      makeSlackRequest({ userId: 42 })
    );

    expect(mockGetSlackWebhookUrl).toHaveBeenCalledWith(42);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/T123/B456/abc",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );

    // Verify the payload
    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.text).toBe("Hello from Bondi!");
    expect(body.username).toBe("Bondi (RIO)");
    expect(body.icon_emoji).toBe(":robot_face:");
    expect(body.channel).toBe("#general");

    expect(result.success).toBe(true);
    expect(result.connector).toBe("slack");
    expect(result.mode).toBe("live");
    expect(result.detail).toContain("Slack message sent");
    expect(result.detail).toContain("receipt-slack-001");
  });

  it("sends alert with Block Kit formatting", async () => {
    mockGetSlackWebhookUrl.mockResolvedValue("https://hooks.slack.com/services/T123/B456/abc");
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("ok"),
    });

    const result = await connector.execute(
      makeSlackRequest({
        userId: 42,
        action: "send_slack_alert",
        parameters: {
          title: "RIO Alert",
          message: "Action requires approval",
          channel: "#alerts",
        },
      })
    );

    expect(result.success).toBe(true);

    // Verify Block Kit payload
    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.blocks).toBeDefined();
    expect(body.blocks.length).toBe(3); // header, section, context
    expect(body.blocks[0].type).toBe("header");
    expect(body.blocks[0].text.text).toBe("RIO Alert");
    expect(body.blocks[1].type).toBe("section");
    expect(body.blocks[1].text.text).toBe("Action requires approval");
    expect(body.blocks[2].type).toBe("context");
  });

  it("returns error when no webhook URL is configured", async () => {
    mockGetSlackWebhookUrl.mockResolvedValue(null);

    const result = await connector.execute(
      makeSlackRequest({ userId: 42 })
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("NO_WEBHOOK_URL");
    expect(result.detail).toContain("not configured");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns error when no userId is provided", async () => {
    const result = await connector.execute(
      makeSlackRequest({ userId: undefined })
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("NO_WEBHOOK_URL");
    expect(mockGetSlackWebhookUrl).not.toHaveBeenCalled();
  });

  it("handles webhook HTTP error gracefully", async () => {
    mockGetSlackWebhookUrl.mockResolvedValue("https://hooks.slack.com/services/T123/B456/abc");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve("invalid_token"),
    });

    const result = await connector.execute(
      makeSlackRequest({ userId: 42 })
    );

    expect(result.success).toBe(false);
    expect(result.detail).toContain("403");
    expect(result.error).toContain("403");
    expect(result.error).toContain("invalid_token");
  });

  it("handles network error gracefully", async () => {
    mockGetSlackWebhookUrl.mockResolvedValue("https://hooks.slack.com/services/T123/B456/abc");
    mockFetch.mockRejectedValue(new Error("Network timeout"));

    const result = await connector.execute(
      makeSlackRequest({ userId: 42 })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network timeout");
  });
});

describe("SlackConnector — metadata", () => {
  it("has correct connector info", () => {
    const connector = new SlackConnector();
    const info = connector.getInfo();

    expect(info.id).toBe("slack");
    expect(info.name).toBe("Slack");
    expect(info.platform).toBe("slack");
    expect(info.icon).toBe("message-square");
    expect(info.description).toBeTruthy();
  });

  it("reports correct capabilities", () => {
    const connector = new SlackConnector();

    expect(connector.capabilities.length).toBe(2);
    const actions = connector.capabilities.map((c) => c.action);
    expect(actions).toContain("send_slack_message");
    expect(actions).toContain("send_slack_alert");
  });

  it("canHandle returns true for Slack actions", () => {
    const connector = new SlackConnector();

    expect(connector.canHandle("send_slack_message")).toBe(true);
    expect(connector.canHandle("send_slack_alert")).toBe(true);
    expect(connector.canHandle("send_email")).toBe(false);
    expect(connector.canHandle("create_issue")).toBe(false);
  });
});

describe("Slack in Connector Registry", () => {
  it("Slack connector is registered in the registry", async () => {
    // Import registry fresh (it auto-registers connectors)
    const { connectorRegistry } = await import("./connectors");
    const connectors = connectorRegistry.listConnectors();
    const ids = connectors.map((c) => c.id);
    expect(ids).toContain("slack");
  });

  it("routes send_slack_message to Slack connector in simulated mode", async () => {
    const { connectorRegistry } = await import("./connectors");
    const result = await connectorRegistry.execute({
      intentId: "test-slack-reg-1",
      receiptId: "test-slack-reg-receipt-1",
      action: "send_slack_message",
      parameters: { message: "Registry test", channel: "#test" },
      mode: "simulated",
    });

    expect(result.success).toBe(true);
    expect(result.connector).toBe("slack");
    expect(result.action).toBe("send_slack_message");
    expect(result.mode).toBe("simulated");
    expect(result.detail).toContain("Simulated");
  });

  it("routes send_slack_alert to Slack connector in simulated mode", async () => {
    const { connectorRegistry } = await import("./connectors");
    const result = await connectorRegistry.execute({
      intentId: "test-slack-reg-2",
      receiptId: "test-slack-reg-receipt-2",
      action: "send_slack_alert",
      parameters: { title: "Alert", message: "Test alert" },
      mode: "simulated",
    });

    expect(result.success).toBe(true);
    expect(result.connector).toBe("slack");
    expect(result.action).toBe("send_slack_alert");
    expect(result.detail).toContain("Simulated");
  });

  it("Slack actions appear in listActions", async () => {
    const { connectorRegistry } = await import("./connectors");
    const actions = connectorRegistry.listActions();
    const actionNames = actions.map((a) => a.action);
    expect(actionNames).toContain("send_slack_message");
    expect(actionNames).toContain("send_slack_alert");
  });
});
