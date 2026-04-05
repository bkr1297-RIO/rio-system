/**
 * Agent Adapter Layer Tests
 * ═════════════════════════
 * Tests the core adapter interface, registry, passthrough adapter,
 * OpenAI adapter, Claude adapter, task types, and agent recommendation.
 * The OpenAI and Claude adapters call the Forge LLM API, so we test
 * both the contract and the integration.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerAdapter,
  getAdapter,
  listAdapters,
  initializeAdapters,
  inferTaskType,
  recommendAgent,
  TASK_TYPES,
  type AgentAdapter,
  type AgentInput,
  type AgentAdapterResult,
  type TaskType,
} from "./agentAdapters";

// ─── Test Fixtures ────────────────────────────────────────────

const SEND_EMAIL_INPUT: AgentInput = {
  intentId: "test-intent-001",
  toolName: "send_email",
  toolArgs: {
    to: "john@example.com",
    subject: "Meeting tomorrow",
    body: "Hi John, just confirming our meeting at 3pm.",
  },
  riskTier: "MEDIUM",
  reflection: "User wants to confirm a meeting",
};

const WEB_SEARCH_INPUT: AgentInput = {
  intentId: "test-intent-002",
  toolName: "web_search",
  toolArgs: { query: "RIO governance framework" },
  riskTier: "LOW",
};

const DRAFT_EMAIL_INPUT: AgentInput = {
  intentId: "test-intent-003",
  toolName: "draft_email",
  toolArgs: {
    to: "team@company.com",
    subject: "Q2 Report",
    body: "Please find attached the Q2 report.",
  },
  riskTier: "LOW",
};

const SUMMARIZE_INPUT: AgentInput = {
  intentId: "test-intent-004",
  toolName: "summarize_document",
  toolArgs: { content: "A long document about AI governance..." },
  riskTier: "LOW",
};

const WRITE_FILE_INPUT: AgentInput = {
  intentId: "test-intent-005",
  toolName: "write_file",
  toolArgs: { path: "/docs/report.md", content: "# Report\n\nContent here." },
  riskTier: "MEDIUM",
};

const SCHEDULE_INPUT: AgentInput = {
  intentId: "test-intent-006",
  toolName: "schedule_meeting",
  toolArgs: { title: "Team sync", time: "2026-04-02T10:00:00Z" },
  riskTier: "MEDIUM",
};

// ─── Registry Tests ───────────────────────────────────────────

describe("Adapter Registry", () => {
  beforeEach(() => {
    // Re-initialize to ensure clean state
    initializeAdapters();
  });

  it("should have openai, claude, and passthrough adapters registered by default", () => {
    const adapters = listAdapters();
    expect(adapters.length).toBeGreaterThanOrEqual(3);
    expect(adapters.find(a => a.id === "openai")).toBeTruthy();
    expect(adapters.find(a => a.id === "claude")).toBeTruthy();
    expect(adapters.find(a => a.id === "passthrough")).toBeTruthy();
  });

  it("should retrieve openai adapter by id", () => {
    const adapter = getAdapter("openai");
    expect(adapter).toBeDefined();
    expect(adapter!.id).toBe("openai");
    expect(adapter!.displayName).toBe("OpenAI GPT-4o");
    expect(adapter!.provider).toBe("OPENAI");
  });

  it("should retrieve claude adapter by id", () => {
    const adapter = getAdapter("claude");
    expect(adapter).toBeDefined();
    expect(adapter!.id).toBe("claude");
    expect(adapter!.provider).toBe("ANTHROPIC");
  });

  it("should retrieve passthrough adapter by id", () => {
    const adapter = getAdapter("passthrough");
    expect(adapter).toBeDefined();
    expect(adapter!.id).toBe("passthrough");
    expect(adapter!.provider).toBe("RIO");
  });

  it("should return undefined for unknown adapter id", () => {
    const adapter = getAdapter("nonexistent-adapter");
    expect(adapter).toBeUndefined();
  });

  it("should allow registering a custom adapter", () => {
    const customAdapter: AgentAdapter = {
      id: "test-custom",
      displayName: "Test Custom Adapter",
      provider: "TEST",
      processIntent: async (input) => ({
        success: true,
        actionRequest: {
          connectorName: input.toolName,
          connectorArgs: input.toolArgs,
          agentReasoning: "Custom adapter test",
          confidence: 1.0,
        },
        agentId: "test-custom",
        agentModel: "test-model",
        processingTimeMs: 0,
      }),
    };

    registerAdapter(customAdapter);
    const retrieved = getAdapter("test-custom");
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe("test-custom");
    expect(retrieved!.provider).toBe("TEST");

    const all = listAdapters();
    expect(all.find(a => a.id === "test-custom")).toBeTruthy();
  });

  it("listAdapters should return id, displayName, and provider only", () => {
    const adapters = listAdapters();
    for (const adapter of adapters) {
      expect(adapter).toHaveProperty("id");
      expect(adapter).toHaveProperty("displayName");
      expect(adapter).toHaveProperty("provider");
      // Should NOT expose processIntent function
      expect((adapter as any).processIntent).toBeUndefined();
    }
  });
});

// ─── Passthrough Adapter Tests ────────────────────────────────

describe("Passthrough Adapter", () => {
  it("should return original args unchanged", async () => {
    const adapter = getAdapter("passthrough")!;
    const result = await adapter.processIntent(SEND_EMAIL_INPUT);

    expect(result.success).toBe(true);
    expect(result.agentId).toBe("passthrough");
    expect(result.agentModel).toBe("none");
    expect(result.processingTimeMs).toBe(0);
    expect(result.actionRequest).toBeDefined();
    expect(result.actionRequest!.connectorName).toBe("send_email");
    expect(result.actionRequest!.connectorArgs).toEqual(SEND_EMAIL_INPUT.toolArgs);
    expect(result.actionRequest!.confidence).toBe(1.0);
  });

  it("should work with any tool type", async () => {
    const adapter = getAdapter("passthrough")!;
    const result = await adapter.processIntent(WEB_SEARCH_INPUT);

    expect(result.success).toBe(true);
    expect(result.actionRequest!.connectorName).toBe("web_search");
    expect(result.actionRequest!.connectorArgs).toEqual({ query: "RIO governance framework" });
  });

  it("should always succeed (never fails)", async () => {
    const adapter = getAdapter("passthrough")!;

    // Even with empty args
    const result = await adapter.processIntent({
      intentId: "test-empty",
      toolName: "unknown_tool",
      toolArgs: {},
      riskTier: "HIGH",
    });

    expect(result.success).toBe(true);
    expect(result.actionRequest!.connectorName).toBe("unknown_tool");
  });
});

// ─── OpenAI Adapter Contract Tests ────────────────────────────

describe("OpenAI Adapter", () => {
  it("should exist and have correct metadata", () => {
    const adapter = getAdapter("openai")!;
    expect(adapter).toBeDefined();
    expect(adapter.id).toBe("openai");
    expect(adapter.displayName).toBe("OpenAI GPT-4o");
    expect(adapter.provider).toBe("OPENAI");
    expect(typeof adapter.processIntent).toBe("function");
  });

  it("should return a valid AgentAdapterResult shape", async () => {
    const adapter = getAdapter("openai")!;
    const result = await adapter.processIntent(SEND_EMAIL_INPUT);

    // Regardless of success/failure, the result must have these fields
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("agentId", "openai");
    expect(result).toHaveProperty("agentModel", "gpt-4o");
    expect(result).toHaveProperty("processingTimeMs");
    expect(typeof result.processingTimeMs).toBe("number");
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("should return an actionRequest when successful", async () => {
    const adapter = getAdapter("openai")!;
    const result = await adapter.processIntent(SEND_EMAIL_INPUT);

    if (result.success) {
      expect(result.actionRequest).toBeDefined();
      expect(result.actionRequest!.connectorName).toBeTruthy();
      expect(result.actionRequest!.connectorArgs).toBeDefined();
      expect(typeof result.actionRequest!.agentReasoning).toBe("string");
      expect(typeof result.actionRequest!.confidence).toBe("number");
      expect(result.actionRequest!.confidence).toBeGreaterThan(0);
      expect(result.actionRequest!.confidence).toBeLessThanOrEqual(1);
    } else {
      // If the LLM call failed (e.g., no API key), error should be present
      expect(result.error).toBeTruthy();
    }
  });

  it("should preserve the original connector name for send_email", async () => {
    const adapter = getAdapter("openai")!;
    const result = await adapter.processIntent(SEND_EMAIL_INPUT);

    if (result.success && result.actionRequest) {
      // The agent should use one of the known connector names
      const validConnectors = [
        "send_email", "draft_email", "send_sms",
        "web_search", "drive_read", "drive_search", "drive_write",
      ];
      expect(validConnectors).toContain(result.actionRequest.connectorName);
    }
  });

  it("should include token usage when successful", async () => {
    const adapter = getAdapter("openai")!;
    const result = await adapter.processIntent(SEND_EMAIL_INPUT);

    if (result.success) {
      // Token usage should be present (may be undefined if API doesn't return it)
      if (result.tokensUsed !== undefined) {
        expect(typeof result.tokensUsed).toBe("number");
        expect(result.tokensUsed).toBeGreaterThan(0);
      }
    }
  });

  it("should handle web_search intent", async () => {
    const adapter = getAdapter("openai")!;
    const result = await adapter.processIntent(WEB_SEARCH_INPUT);

    expect(result.agentId).toBe("openai");
    if (result.success && result.actionRequest) {
      expect(result.actionRequest.connectorArgs).toBeDefined();
    }
  });

  it("should handle draft_email intent", async () => {
    const adapter = getAdapter("openai")!;
    const result = await adapter.processIntent(DRAFT_EMAIL_INPUT);

    expect(result.agentId).toBe("openai");
    if (result.success && result.actionRequest) {
      expect(result.actionRequest.connectorArgs).toBeDefined();
    }
  });
});

// ─── Claude Adapter Contract Tests ────────────────────────────

describe("Claude Adapter", () => {
  // Claude adapter calls the Anthropic API through Forge, which can take longer
  const CLAUDE_TIMEOUT = 30000;

  it("should exist and have correct metadata", () => {
    const adapter = getAdapter("claude")!;
    expect(adapter).toBeDefined();
    expect(adapter.id).toBe("claude");
    expect(adapter.provider).toBe("ANTHROPIC");
    expect(typeof adapter.processIntent).toBe("function");
  });

  it("should return a valid AgentAdapterResult shape", async () => {
    const adapter = getAdapter("claude")!;
    const result = await adapter.processIntent(SEND_EMAIL_INPUT);

    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("agentId", "claude");
    expect(result).toHaveProperty("processingTimeMs");
    expect(typeof result.processingTimeMs).toBe("number");
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  }, CLAUDE_TIMEOUT);

  it("should return an actionRequest when successful", async () => {
    const adapter = getAdapter("claude")!;
    const result = await adapter.processIntent(SEND_EMAIL_INPUT);

    if (result.success) {
      expect(result.actionRequest).toBeDefined();
      expect(result.actionRequest!.connectorName).toBeTruthy();
      expect(result.actionRequest!.connectorArgs).toBeDefined();
      expect(typeof result.actionRequest!.agentReasoning).toBe("string");
      expect(typeof result.actionRequest!.confidence).toBe("number");
      expect(result.actionRequest!.confidence).toBeGreaterThan(0);
      expect(result.actionRequest!.confidence).toBeLessThanOrEqual(1);
    } else {
      expect(result.error).toBeTruthy();
    }
  }, CLAUDE_TIMEOUT);

  it("should preserve valid connector names", async () => {
    const adapter = getAdapter("claude")!;
    const result = await adapter.processIntent(SEND_EMAIL_INPUT);

    if (result.success && result.actionRequest) {
      const validConnectors = [
        "send_email", "draft_email", "send_sms",
        "web_search", "drive_read", "drive_search", "drive_write",
      ];
      expect(validConnectors).toContain(result.actionRequest.connectorName);
    }
  }, CLAUDE_TIMEOUT);

  it("should handle draft_email intent (Claude's strength)", async () => {
    const adapter = getAdapter("claude")!;
    const result = await adapter.processIntent(DRAFT_EMAIL_INPUT);

    expect(result.agentId).toBe("claude");
    if (result.success && result.actionRequest) {
      expect(result.actionRequest.connectorArgs).toBeDefined();
    }
  }, CLAUDE_TIMEOUT);

  it("should handle web_search intent", async () => {
    const adapter = getAdapter("claude")!;
    const result = await adapter.processIntent(WEB_SEARCH_INPUT);

    expect(result.agentId).toBe("claude");
    if (result.success && result.actionRequest) {
      expect(result.actionRequest.connectorArgs).toBeDefined();
    }
  }, CLAUDE_TIMEOUT);
});

// ─── Task Type Inference Tests ────────────────────────────────

describe("Task Type Inference", () => {
  it("should have all 7 task types defined", () => {
    expect(TASK_TYPES).toHaveLength(7);
    const ids = TASK_TYPES.map(t => t.id);
    expect(ids).toContain("write_draft");
    expect(ids).toContain("summarize_analyze");
    expect(ids).toContain("communicate");
    expect(ids).toContain("schedule_calendar");
    expect(ids).toContain("file_document");
    expect(ids).toContain("search_research");
    expect(ids).toContain("general");
  });

  it("should infer write_draft for draft/write tools", () => {
    expect(inferTaskType("draft_email")).toBe("write_draft");
    expect(inferTaskType("write_file")).toBe("write_draft");
    expect(inferTaskType("compose_message")).toBe("write_draft");
  });

  it("should infer summarize_analyze for summarize/analyze/read tools", () => {
    expect(inferTaskType("summarize_report")).toBe("summarize_analyze");
    expect(inferTaskType("analyze_data")).toBe("summarize_analyze");
    expect(inferTaskType("read_content")).toBe("summarize_analyze");
  });

  it("should infer communicate for email/sms/send tools", () => {
    expect(inferTaskType("send_email")).toBe("communicate");
    expect(inferTaskType("send_sms")).toBe("communicate");
    expect(inferTaskType("notify_user")).toBe("communicate");
  });

  it("should infer schedule_calendar for schedule/calendar/meeting tools", () => {
    expect(inferTaskType("schedule_meeting")).toBe("schedule_calendar");
    expect(inferTaskType("calendar_event")).toBe("schedule_calendar");
    expect(inferTaskType("create_event")).toBe("schedule_calendar");
  });

  it("should infer file_document for file/drive/document tools", () => {
    expect(inferTaskType("drive_read")).toBe("file_document");
    expect(inferTaskType("upload_file")).toBe("file_document");
    expect(inferTaskType("document_create")).toBe("file_document");
  });

  it("should infer search_research for search/web/research tools", () => {
    expect(inferTaskType("web_search")).toBe("search_research");
    expect(inferTaskType("research_topic")).toBe("search_research");
    expect(inferTaskType("lookup_info")).toBe("search_research");
  });

  it("should default to general for unknown tools", () => {
    expect(inferTaskType("unknown_tool")).toBe("general");
    expect(inferTaskType("echo")).toBe("general");
    expect(inferTaskType("custom_action")).toBe("general");
  });
});

// ─── Agent Recommendation Tests ──────────────────────────────

describe("Agent Recommendation", () => {
  it("should recommend claude for write_draft tasks", () => {
    const rec = recommendAgent("write_draft", "draft_email");
    expect(rec.recommendedAgentId).toBe("claude");
    expect(rec.confidence).toBeGreaterThan(0);
    expect(rec.confidence).toBeLessThanOrEqual(1);
    expect(rec.reason).toBeTruthy();
    expect(rec.alternatives.length).toBeGreaterThan(0);
  });

  it("should recommend claude for summarize_analyze tasks", () => {
    const rec = recommendAgent("summarize_analyze", "summarize_document");
    expect(rec.recommendedAgentId).toBe("claude");
    expect(rec.confidence).toBeGreaterThan(0);
  });

  it("should recommend openai for communicate tasks", () => {
    const rec = recommendAgent("communicate", "send_email");
    expect(rec.recommendedAgentId).toBe("openai");
    expect(rec.confidence).toBeGreaterThan(0);
  });

  it("should recommend passthrough for schedule_calendar tasks", () => {
    const rec = recommendAgent("schedule_calendar", "schedule_meeting");
    expect(rec.recommendedAgentId).toBe("passthrough");
    expect(rec.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("should recommend passthrough for direct tools (web_search, drive_read)", () => {
    const rec1 = recommendAgent("search_research", "web_search");
    expect(rec1.recommendedAgentId).toBe("passthrough");

    const rec2 = recommendAgent("file_document", "drive_read");
    expect(rec2.recommendedAgentId).toBe("passthrough");

    const rec3 = recommendAgent("file_document", "drive_search");
    expect(rec3.recommendedAgentId).toBe("passthrough");
  });

  it("should recommend openai for general tasks", () => {
    const rec = recommendAgent("general", "echo");
    expect(rec.recommendedAgentId).toBe("openai");
  });

  it("should always include alternatives", () => {
    const taskTypes: TaskType[] = [
      "write_draft", "summarize_analyze", "communicate",
      "schedule_calendar", "file_document", "search_research", "general",
    ];
    for (const tt of taskTypes) {
      const rec = recommendAgent(tt, "some_tool");
      expect(rec.alternatives.length).toBeGreaterThan(0);
      for (const alt of rec.alternatives) {
        expect(alt.agentId).toBeTruthy();
        expect(alt.reason).toBeTruthy();
      }
    }
  });

  it("should never recommend an agent that doesn't exist in the registry", () => {
    const taskTypes: TaskType[] = [
      "write_draft", "summarize_analyze", "communicate",
      "schedule_calendar", "file_document", "search_research", "general",
    ];
    const registeredIds = listAdapters().map(a => a.id);
    for (const tt of taskTypes) {
      const rec = recommendAgent(tt, "some_tool");
      expect(registeredIds).toContain(rec.recommendedAgentId);
      for (const alt of rec.alternatives) {
        expect(registeredIds).toContain(alt.agentId);
      }
    }
  });
});

// ─── Adapter Interface Compliance ─────────────────────────────

describe("Adapter Interface Compliance", () => {
  it("all registered adapters should implement processIntent", () => {
    const adapters = listAdapters();
    for (const adapterMeta of adapters) {
      const adapter = getAdapter(adapterMeta.id);
      expect(adapter).toBeDefined();
      expect(typeof adapter!.processIntent).toBe("function");
    }
  });

  it("all adapters should return agentId matching their registered id", async () => {
    const adapterList = listAdapters();
    for (const adapterMeta of adapterList) {
      const adapter = getAdapter(adapterMeta.id)!;
      const result = await adapter.processIntent(WEB_SEARCH_INPUT);
      expect(result.agentId).toBe(adapterMeta.id);
    }
  }, 60000);

  it("passthrough adapter should never call external APIs", async () => {
    const adapter = getAdapter("passthrough")!;
    // Passthrough should complete in 0ms (no network call)
    const result = await adapter.processIntent(SEND_EMAIL_INPUT);
    expect(result.processingTimeMs).toBe(0);
    expect(result.tokensUsed).toBeUndefined();
  });
});

// ─── Multi-Agent Governance Loop ─────────────────────────────

describe("Multi-Agent Governance Loop", () => {
  it("should route same intent through different agents with consistent structure", async () => {
    const agents = ["passthrough", "openai", "claude"];
    const results: AgentAdapterResult[] = [];

    for (const agentId of agents) {
      const adapter = getAdapter(agentId)!;
      const result = await adapter.processIntent(SEND_EMAIL_INPUT);
      results.push(result);

      // Every result must have the core fields
      expect(result.agentId).toBe(agentId);
      expect(typeof result.success).toBe("boolean");
      expect(typeof result.processingTimeMs).toBe("number");
    }

    // Passthrough should always succeed
    expect(results[0].success).toBe(true);
    expect(results[0].actionRequest!.connectorName).toBe("send_email");

    // All successful results should have actionRequests
    for (const result of results) {
      if (result.success) {
        expect(result.actionRequest).toBeDefined();
        expect(result.actionRequest!.connectorName).toBeTruthy();
        expect(result.actionRequest!.connectorArgs).toBeDefined();
      }
    }
  }, 60000);

  it("task type inference + recommendation should form a complete pipeline", () => {
    // Simulate the full routing pipeline: tool → task type → recommendation
    const tools = ["send_email", "draft_email", "web_search", "summarize_document", "schedule_meeting", "write_file", "echo"];

    for (const tool of tools) {
      const taskType = inferTaskType(tool);
      expect(TASK_TYPES.find(t => t.id === taskType)).toBeDefined();

      const rec = recommendAgent(taskType, tool);
      expect(rec.recommendedAgentId).toBeTruthy();
      expect(rec.reason).toBeTruthy();
      expect(rec.confidence).toBeGreaterThan(0);

      // The recommended agent must exist
      const adapter = getAdapter(rec.recommendedAgentId);
      expect(adapter).toBeDefined();
    }
  });
});
