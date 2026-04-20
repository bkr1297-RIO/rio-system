import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module before importing the router
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: "Step 1: Submit an intent via POST /intent...",
        },
      },
    ],
  }),
}));

describe("askBondi procedure", () => {
  let caller: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic import so the mock is in place
    const { appRouter } = await import("./routers");
    caller = appRouter.createCaller({ user: null } as any);
  });

  it("returns an answer for a valid question", async () => {
    const result = await caller.askBondi({ question: "How do I send an email through RIO?" });
    expect(result).toHaveProperty("answer");
    expect(typeof result.answer).toBe("string");
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it("rejects empty questions", async () => {
    await expect(caller.askBondi({ question: "" })).rejects.toThrow();
  });

  it("rejects questions over 4000 chars", async () => {
    const longQuestion = "a".repeat(4001);
    await expect(caller.askBondi({ question: longQuestion })).rejects.toThrow();
  });

  it("accepts questions up to 4000 chars", async () => {
    const maxQuestion = "a".repeat(4000);
    const result = await caller.askBondi({ question: maxQuestion });
    expect(result).toHaveProperty("answer");
  });

  it("is a public procedure (no auth required)", async () => {
    // Caller created with null user — should still work
    const result = await caller.askBondi({ question: "What is RIO?" });
    expect(result).toHaveProperty("answer");
  });
});
