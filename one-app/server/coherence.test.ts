import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock invokeLLM before importing the module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { runCoherenceCheck, getCoherenceState, getCoherenceHistory, buildSystemContext } from "./coherence";
import { invokeLLM } from "./_core/llm";

const mockedInvokeLLM = vi.mocked(invokeLLM);

describe("Coherence Monitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildSystemContext", () => {
    it("builds context string from provided parameters", () => {
      const ctx = buildSystemContext({
        activeObjective: "Send governed email to partner",
        systemHealth: "OPERATIONAL",
        recentActions: [
          { action: "send_email", timestamp: "2026-04-11T00:00:00Z", status: "receipted" },
        ],
        agentStates: { "Manny": "ACTIVE", "Bondi": "IDLE" },
      });

      expect(ctx).toContain("ACTIVE OBJECTIVE: Send governed email to partner");
      expect(ctx).toContain("SYSTEM HEALTH: OPERATIONAL");
      expect(ctx).toContain("send_email");
      expect(ctx).toContain("Manny: ACTIVE");
      expect(ctx).toContain("Bondi: IDLE");
    });

    it("returns fallback when no params provided", () => {
      const ctx = buildSystemContext({});
      expect(ctx).toBe("No additional context available.");
    });
  });

  describe("runCoherenceCheck", () => {
    it("produces a GREEN record when LLM reports no drift", async () => {
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              signals: [
                {
                  dimension: "intent",
                  level: "NONE",
                  description: "Action aligns with stated intent",
                  expected: "Send email to partner",
                  observed: "send_email action proposed",
                  suggestedAction: "None needed",
                },
                {
                  dimension: "objective",
                  level: "NONE",
                  description: "Objective alignment confirmed",
                  expected: "Complete partner communication",
                  observed: "Email action serves this objective",
                  suggestedAction: "None needed",
                },
                {
                  dimension: "relational",
                  level: "NONE",
                  description: "Trust maintained",
                  expected: "Transparent action with human approval",
                  observed: "Action goes through governed pipeline",
                  suggestedAction: "None needed",
                },
              ],
              confidence: 0.95,
              overall_suggestion: null,
            }),
            role: "assistant",
          },
          index: 0,
          finish_reason: "stop",
        }],
      } as any);

      const record = await runCoherenceCheck({
        actionType: "send_email",
        actionParameters: { to: "partner@example.com", subject: "Hello" },
        intentId: "test-intent-001",
        proposedBy: "I-1",
        systemContext: "ACTIVE OBJECTIVE: Send governed email",
        statedObjective: "Send governed email to partner",
      });

      expect(record.status).toBe("GREEN");
      expect(record.drift_detected).toBe(false);
      expect(record.signals).toHaveLength(3);
      expect(record.coherence_id).toMatch(/^coh-/);
      expect(record.action_id).toBe("test-intent-001");
      expect(record.intent_hash).toBeTruthy();
      expect(record.confidence).toBe(0.95);
      expect(record.triggered_by).toContain("send_email");
    });

    it("produces a RED record when LLM detects HIGH drift", async () => {
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              signals: [
                {
                  dimension: "intent",
                  level: "HIGH",
                  description: "Action contradicts stated objective",
                  expected: "Read-only operation",
                  observed: "Destructive write operation proposed",
                  suggestedAction: "Review with human before proceeding",
                },
                {
                  dimension: "objective",
                  level: "MODERATE",
                  description: "Action is tangential to current objective",
                  expected: "Data analysis task",
                  observed: "Email sending action",
                  suggestedAction: "Confirm this is intentional",
                },
                {
                  dimension: "relational",
                  level: "LOW",
                  description: "Minor transparency concern",
                  expected: "Clear action description",
                  observed: "Parameters partially obscured",
                  suggestedAction: "Provide full parameter visibility",
                },
              ],
              confidence: 0.85,
              overall_suggestion: "Recommend human review before approval",
            }),
            role: "assistant",
          },
          index: 0,
          finish_reason: "stop",
        }],
      } as any);

      const record = await runCoherenceCheck({
        actionType: "send_email",
        actionParameters: { to: "unknown@example.com" },
        proposedBy: "I-1",
        systemContext: "ACTIVE OBJECTIVE: Data analysis only",
      });

      expect(record.status).toBe("RED");
      expect(record.drift_detected).toBe(true);
      expect(record.signals).toHaveLength(3);
      expect(record.suggested_action).toBe("Recommend human review before approval");
    });

    it("produces a YELLOW record for MODERATE drift", async () => {
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              signals: [
                {
                  dimension: "objective",
                  level: "MODERATE",
                  description: "Slight deviation from stated objective",
                  expected: "Focus on task A",
                  observed: "Action relates to task B",
                  suggestedAction: "Verify intent with human",
                },
              ],
              confidence: 0.75,
              overall_suggestion: "Minor drift detected — human awareness recommended",
            }),
            role: "assistant",
          },
          index: 0,
          finish_reason: "stop",
        }],
      } as any);

      const record = await runCoherenceCheck({
        actionType: "web_search",
        actionParameters: { query: "unrelated topic" },
        proposedBy: "I-1",
        systemContext: "ACTIVE OBJECTIVE: Task A",
      });

      expect(record.status).toBe("YELLOW");
      expect(record.drift_detected).toBe(true);
    });

    it("falls back to GREEN when LLM is unavailable", async () => {
      mockedInvokeLLM.mockRejectedValueOnce(new Error("LLM service unavailable"));

      const record = await runCoherenceCheck({
        actionType: "send_sms",
        actionParameters: { to: "+18014555810", body: "Test" },
        proposedBy: "I-1",
        systemContext: "System operational",
      });

      // Advisory layer fails open — not a system failure
      expect(record.status).toBe("GREEN");
      expect(record.drift_detected).toBe(false);
      expect(record.confidence).toBe(0.0);
      expect(record.triggered_by).toContain("fallback");
      expect(record.signals[0].description).toContain("inconclusive");
    });

    it("falls back to GREEN when LLM returns invalid JSON", async () => {
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{
          message: {
            content: "This is not valid JSON",
            role: "assistant",
          },
          index: 0,
          finish_reason: "stop",
        }],
      } as any);

      const record = await runCoherenceCheck({
        actionType: "draft_email",
        actionParameters: {},
        proposedBy: "I-1",
        systemContext: "System operational",
      });

      expect(record.status).toBe("GREEN");
      expect(record.confidence).toBe(0.0);
    });
  });

  describe("getCoherenceState", () => {
    it("returns state with totalChecks reflecting history", async () => {
      // Run a check first to populate history
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              signals: [{ dimension: "intent", level: "NONE", description: "OK", expected: "OK", observed: "OK", suggestedAction: "None" }],
              confidence: 0.9,
              overall_suggestion: null,
            }),
            role: "assistant",
          },
          index: 0,
          finish_reason: "stop",
        }],
      } as any);

      await runCoherenceCheck({
        actionType: "test_action",
        actionParameters: {},
        proposedBy: "test",
        systemContext: "test",
      });

      const state = getCoherenceState();
      expect(state.totalChecks).toBeGreaterThan(0);
      expect(state.lastCheck).toBeTruthy();
      expect(state.status).toBeDefined();
      expect(state.computedAt).toBeGreaterThan(0);
      expect(Array.isArray(state.history)).toBe(true);
      expect(Array.isArray(state.activeWarnings)).toBe(true);
    });
  });

  describe("getCoherenceHistory", () => {
    it("returns array of coherence records", () => {
      const history = getCoherenceHistory(10);
      expect(Array.isArray(history)).toBe(true);
    });
  });
});
