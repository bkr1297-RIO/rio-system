import { describe, expect, it } from "vitest";
import {
  buildBondiSystemPrompt,
  detectMode,
  extractIntents,
  extractResponseText,
  buildSentinelStatus,
  generateConversationTitle,
  createLearningEventPayload,
  type BondiContext,
  type ProxyMode,
} from "./bondi";

// ─── Test Helpers ──────────────────────────────────────────────

function createTestContext(overrides: Partial<BondiContext> = {}): BondiContext {
  return {
    userId: 1,
    proxyStatus: "ACTIVE",
    policyHash: "abc123def456",
    seedVersion: "SEED-v1.0.0",
    mode: "REFLECT",
    recentLearnings: [],
    availableTools: [],
    sentinel: {
      identityVerified: true,
      policyLoaded: true,
      contextSynced: true,
      killSwitchActive: false,
      proxyStatus: "ACTIVE",
    },
    conversationHistory: [],
    ...overrides,
  };
}

// ─── buildBondiSystemPrompt ───────────────────────────────────

describe("buildBondiSystemPrompt", () => {
  it("includes Master Seed v1.1 rules in the system prompt", () => {
    const ctx = createTestContext();
    const prompt = buildBondiSystemPrompt(ctx);

    expect(prompt).toContain("HUMAN SOVEREIGNTY");
    expect(prompt).toContain("FIDUCIARY DUTY");
    expect(prompt).toContain("FAIL-CLOSED");
    expect(prompt).toContain("KILL SWITCH");
    expect(prompt).toContain("LEAST PRIVILEGE");
    // v1.1 additions
    expect(prompt).toContain("Master Seed v1.1");
    expect(prompt).toContain("PHASE 2 ACTIVATION");
    expect(prompt).toContain("No Receipt = Did Not Happen");
    expect(prompt).toContain("ROBOT");
    expect(prompt).toContain("FRACTAL FRICTION RULE");
    expect(prompt).toContain("ARGS_HASH_MISMATCH");
  });

  it("includes current state section with mode and proxy status", () => {
    const ctx = createTestContext({ mode: "EXECUTE", proxyStatus: "ACTIVE" });
    const prompt = buildBondiSystemPrompt(ctx);

    expect(prompt).toContain("Mode: EXECUTE");
    expect(prompt).toContain("Proxy Status: ACTIVE");
    expect(prompt).toContain("Seed Version: SEED-v1.0.0");
  });

  it("includes available tools when present", () => {
    const ctx = createTestContext({
      availableTools: [
        { toolName: "web_search", description: "Search the web", riskTier: "LOW" },
        { toolName: "send_email", description: "Send an email", riskTier: "MEDIUM" },
      ],
    });
    const prompt = buildBondiSystemPrompt(ctx);

    expect(prompt).toContain("AVAILABLE TOOLS");
    expect(prompt).toContain("web_search [LOW]: Search the web");
    expect(prompt).toContain("send_email [MEDIUM]: Send an email");
  });

  it("includes recent learnings when present", () => {
    const ctx = createTestContext({
      recentLearnings: [
        { eventType: "APPROVAL", toolName: "web_search", outcome: "POSITIVE", timestamp: Date.now() },
        { eventType: "REJECTION", toolName: "send_email", outcome: "NEGATIVE", feedback: "Too risky", timestamp: Date.now() },
      ],
    });
    const prompt = buildBondiSystemPrompt(ctx);

    expect(prompt).toContain("RECENT LEARNINGS");
    expect(prompt).toContain("[APPROVAL] web_search: POSITIVE");
    expect(prompt).toContain("[REJECTION] send_email: NEGATIVE");
    expect(prompt).toContain('Feedback: "Too risky"');
  });

  it("shows kill switch status in sentinel section", () => {
    const ctx = createTestContext({
      sentinel: {
        identityVerified: true,
        policyLoaded: true,
        contextSynced: true,
        killSwitchActive: true,
        proxyStatus: "KILLED",
      },
    });
    const prompt = buildBondiSystemPrompt(ctx);

    expect(prompt).toContain("KillSwitch=ACTIVE — HALT ALL OPERATIONS");
  });

  it("omits tools section when no tools available", () => {
    const ctx = createTestContext({ availableTools: [] });
    const prompt = buildBondiSystemPrompt(ctx);

    expect(prompt).not.toContain("AVAILABLE TOOLS");
  });

  it("omits learnings section when no learnings available", () => {
    const ctx = createTestContext({ recentLearnings: [] });
    const prompt = buildBondiSystemPrompt(ctx);

    expect(prompt).not.toContain("RECENT LEARNINGS");
  });
});

// ─── detectMode ────────────────────────────────────────────────

describe("detectMode", () => {
  it("detects REFLECT mode from thinking keywords", () => {
    expect(detectMode("think about this problem", "EXECUTE")).toBe("REFLECT");
    expect(detectMode("analyze this data", "EXECUTE")).toBe("REFLECT");
  });

  it("detects COMPUTE mode from calculation keywords", () => {
    expect(detectMode("calculate the total", "REFLECT")).toBe("COMPUTE");
    expect(detectMode("run the numbers on this", "REFLECT")).toBe("COMPUTE");
  });

  it("detects DRAFT mode from writing keywords", () => {
    expect(detectMode("write a report", "REFLECT")).toBe("DRAFT");
    expect(detectMode("draft an email", "REFLECT")).toBe("DRAFT");
    expect(detectMode("compose a message", "REFLECT")).toBe("DRAFT");
  });

  it("detects VERIFY mode from validation keywords", () => {
    expect(detectMode("verify this information", "REFLECT")).toBe("VERIFY");
    expect(detectMode("check these numbers", "REFLECT")).toBe("VERIFY");
    expect(detectMode("confirm the details", "REFLECT")).toBe("VERIFY");
  });

  it("detects EXECUTE mode from action keywords", () => {
    expect(detectMode("execute this plan", "REFLECT")).toBe("EXECUTE");
    expect(detectMode("send the email now", "REFLECT")).toBe("EXECUTE");
    expect(detectMode("deploy the changes", "REFLECT")).toBe("EXECUTE");
  });

  it("detects EXECUTE mode from polite action requests", () => {
    expect(detectMode("please update the settings", "REFLECT")).toBe("EXECUTE");
    expect(detectMode("can you set up the integration", "REFLECT")).toBe("EXECUTE");
    expect(detectMode("i need a new configuration", "REFLECT")).toBe("EXECUTE");
  });

  it("detects ROBOT mode from automation keywords", () => {
    expect(detectMode("switch to robot mode", "REFLECT")).toBe("ROBOT");
    expect(detectMode("run the auto sequence", "REFLECT")).toBe("ROBOT");
    expect(detectMode("start the daily routine", "REFLECT")).toBe("ROBOT");
    expect(detectMode("go to autopilot", "REFLECT")).toBe("ROBOT");
  });

  it("detects REFLECT mode from questions", () => {
    expect(detectMode("what is the best approach?", "EXECUTE")).toBe("REFLECT");
    expect(detectMode("how does this work?", "EXECUTE")).toBe("REFLECT");
    expect(detectMode("why did that fail?", "EXECUTE")).toBe("REFLECT");
  });

  it("returns current mode when no keywords match", () => {
    expect(detectMode("hello there", "COMPUTE")).toBe("COMPUTE");
    expect(detectMode("interesting", "DRAFT")).toBe("DRAFT");
  });
});

// ─── extractIntents ────────────────────────────────────────────

describe("extractIntents", () => {
  it("extracts intents from tool calls in the response", () => {
    const result = {
      choices: [{
        message: {
          content: "I'll search for that.",
          tool_calls: [{
            id: "call_1",
            type: "function" as const,
            function: {
              name: "propose_intent",
              arguments: JSON.stringify({
                toolName: "web_search",
                toolArgs: { query: "AI governance" },
                reasoning: "User asked for AI governance info",
                confidence: 0.85,
              }),
            },
          }],
        },
        finish_reason: "tool_calls",
        index: 0,
      }],
    };

    const intents = extractIntents(result as any);
    expect(intents).toHaveLength(1);
    expect(intents[0].toolName).toBe("web_search");
    expect(intents[0].toolArgs).toEqual({ query: "AI governance" });
    expect(intents[0].reasoning).toBe("User asked for AI governance info");
    expect(intents[0].confidence).toBe(0.85);
  });

  it("extracts multiple intents from multiple tool calls", () => {
    const result = {
      choices: [{
        message: {
          content: "I'll do both.",
          tool_calls: [
            {
              id: "call_1",
              type: "function" as const,
              function: {
                name: "propose_intent",
                arguments: JSON.stringify({
                  toolName: "web_search",
                  toolArgs: { query: "test" },
                  reasoning: "Search first",
                  confidence: 0.9,
                }),
              },
            },
            {
              id: "call_2",
              type: "function" as const,
              function: {
                name: "propose_intent",
                arguments: JSON.stringify({
                  toolName: "send_email",
                  toolArgs: { to: "user@test.com" },
                  reasoning: "Then email",
                  breakAnalysis: "Could send to wrong person",
                  confidence: 0.7,
                }),
              },
            },
          ],
        },
        finish_reason: "tool_calls",
        index: 0,
      }],
    };

    const intents = extractIntents(result as any);
    expect(intents).toHaveLength(2);
    expect(intents[0].toolName).toBe("web_search");
    expect(intents[1].toolName).toBe("send_email");
    expect(intents[1].breakAnalysis).toBe("Could send to wrong person");
  });

  it("returns empty array when no tool calls", () => {
    const result = {
      choices: [{
        message: { content: "Just a text response." },
        finish_reason: "stop",
        index: 0,
      }],
    };

    const intents = extractIntents(result as any);
    expect(intents).toHaveLength(0);
  });

  it("skips malformed tool call arguments", () => {
    const result = {
      choices: [{
        message: {
          content: "Trying...",
          tool_calls: [{
            id: "call_1",
            type: "function" as const,
            function: {
              name: "propose_intent",
              arguments: "not valid json {{{",
            },
          }],
        },
        finish_reason: "tool_calls",
        index: 0,
      }],
    };

    const intents = extractIntents(result as any);
    expect(intents).toHaveLength(0);
  });

  it("returns empty array when no choices", () => {
    const result = { choices: [] };
    const intents = extractIntents(result as any);
    expect(intents).toHaveLength(0);
  });
});

// ─── extractResponseText ───────────────────────────────────────

describe("extractResponseText", () => {
  it("extracts string content from response", () => {
    const result = {
      choices: [{
        message: { content: "Hello, I'm Bondi." },
        finish_reason: "stop",
        index: 0,
      }],
    };

    expect(extractResponseText(result as any)).toBe("Hello, I'm Bondi.");
  });

  it("extracts text from array content", () => {
    const result = {
      choices: [{
        message: {
          content: [
            { type: "text", text: "Part one. " },
            { type: "text", text: "Part two." },
          ],
        },
        finish_reason: "stop",
        index: 0,
      }],
    };

    expect(extractResponseText(result as any)).toBe("Part one. \nPart two.");
  });

  it("returns fallback message when no choices", () => {
    const result = { choices: [] };
    expect(extractResponseText(result as any)).toContain("wasn't able to generate");
  });

  it("returns fallback when content is null/undefined", () => {
    const result = {
      choices: [{
        message: { content: null },
        finish_reason: "stop",
        index: 0,
      }],
    };
    expect(extractResponseText(result as any)).toContain("wasn't able to generate");
  });
});

// ─── buildSentinelStatus ───────────────────────────────────────

describe("buildSentinelStatus", () => {
  it("returns all-good status for active proxy with valid chain", () => {
    const sentinel = buildSentinelStatus(
      { status: "ACTIVE", policyHash: "abc123" },
      true,
    );

    expect(sentinel.identityVerified).toBe(true);
    expect(sentinel.policyLoaded).toBe(true);
    expect(sentinel.contextSynced).toBe(true);
    expect(sentinel.killSwitchActive).toBe(false);
    expect(sentinel.proxyStatus).toBe("ACTIVE");
  });

  it("returns kill switch active when proxy is KILLED", () => {
    const sentinel = buildSentinelStatus(
      { status: "KILLED", policyHash: "abc123" },
      true,
    );

    expect(sentinel.killSwitchActive).toBe(true);
    expect(sentinel.proxyStatus).toBe("KILLED");
  });

  it("returns not verified when proxy user is null", () => {
    const sentinel = buildSentinelStatus(null, true);

    expect(sentinel.identityVerified).toBe(false);
    expect(sentinel.policyLoaded).toBe(false);
    expect(sentinel.proxyStatus).toBe("NOT_ONBOARDED");
  });

  it("returns context not synced when chain is invalid", () => {
    const sentinel = buildSentinelStatus(
      { status: "ACTIVE", policyHash: "abc123" },
      false,
    );

    expect(sentinel.contextSynced).toBe(false);
  });

  it("returns policy not loaded when policyHash is empty", () => {
    const sentinel = buildSentinelStatus(
      { status: "ACTIVE", policyHash: "" },
      true,
    );

    expect(sentinel.policyLoaded).toBe(false);
  });
});

// ─── generateConversationTitle ─────────────────────────────────

describe("generateConversationTitle", () => {
  it("returns the full message when under 60 chars", () => {
    expect(generateConversationTitle("Hello world")).toBe("Hello world");
  });

  it("truncates long messages to 60 chars with ellipsis", () => {
    const longMsg = "This is a very long message that should be truncated because it exceeds the sixty character limit for conversation titles";
    const title = generateConversationTitle(longMsg);
    expect(title.length).toBe(60);
    expect(title.endsWith("...")).toBe(true);
  });

  it("replaces newlines with spaces", () => {
    expect(generateConversationTitle("Hello\nworld\ntest")).toBe("Hello world test");
  });

  it("trims whitespace", () => {
    expect(generateConversationTitle("  Hello world  ")).toBe("Hello world");
  });
});

// ─── createLearningEventPayload ────────────────────────────────

describe("createLearningEventPayload", () => {
  it("creates an APPROVAL event payload", () => {
    const payload = createLearningEventPayload("APPROVAL", {
      intentId: "INT-abc123",
      toolName: "web_search",
      toolArgs: { query: "test" },
      riskTier: "LOW",
      outcome: "POSITIVE",
    });

    expect(payload.eventType).toBe("APPROVAL");
    expect(payload.eventId).toMatch(/^LE-/);
    expect(payload.intentId).toBe("INT-abc123");
    expect(payload.outcome).toBe("POSITIVE");
    expect(payload.context.toolName).toBe("web_search");
    expect(payload.context.riskTier).toBe("LOW");
  });

  it("creates a FEEDBACK event payload with feedback text", () => {
    const payload = createLearningEventPayload("FEEDBACK", {
      conversationId: "CONV-abc123",
      feedback: "Great response!",
      outcome: "POSITIVE",
      tags: ["helpful", "accurate"],
    });

    expect(payload.eventType).toBe("FEEDBACK");
    expect(payload.feedback).toBe("Great response!");
    expect(payload.outcome).toBe("POSITIVE");
    expect(payload.tags).toEqual(["helpful", "accurate"]);
    expect(payload.conversationId).toBe("CONV-abc123");
  });

  it("defaults to NEUTRAL outcome when not specified", () => {
    const payload = createLearningEventPayload("CORRECTION", {});
    expect(payload.outcome).toBe("NEUTRAL");
  });

  it("defaults to empty arrays and nulls for missing fields", () => {
    const payload = createLearningEventPayload("EXECUTION", {});
    expect(payload.intentId).toBeNull();
    expect(payload.conversationId).toBeNull();
    expect(payload.feedback).toBeNull();
    expect(payload.tags).toEqual([]);
  });

  it("generates unique event IDs", () => {
    const p1 = createLearningEventPayload("APPROVAL", {});
    const p2 = createLearningEventPayload("APPROVAL", {});
    expect(p1.eventId).not.toBe(p2.eventId);
  });
});
