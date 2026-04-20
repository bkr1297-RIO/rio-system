/**
 * phase2bcd.test.ts — Tests for Phase 2B (Daily Loop), 2C (Flow Control), 2D (Preference Layer)
 */
import { describe, it, expect } from "vitest";

// ═══════════════════════════════════════════════════════════════════
// PHASE 2C — FLOW CONTROL
// ═══════════════════════════════════════════════════════════════════

describe("Phase 2C — Flow Control", () => {
  describe("Module exports", () => {
    it("exports scoreProposal", async () => {
      const mod = await import("./flowControl");
      expect(typeof mod.scoreProposal).toBe("function");
    });

    it("exports rerankProposals", async () => {
      const mod = await import("./flowControl");
      expect(typeof mod.rerankProposals).toBe("function");
    });

    it("exports getVisibleProposals", async () => {
      const mod = await import("./flowControl");
      expect(typeof mod.getVisibleProposals).toBe("function");
    });

    it("exports onProposalResolved", async () => {
      const mod = await import("./flowControl");
      expect(typeof mod.onProposalResolved).toBe("function");
    });

    it("exports getMaxVisible", async () => {
      const mod = await import("./flowControl");
      expect(typeof mod.getMaxVisible).toBe("function");
    });
  });

  describe("Scoring algorithm", () => {
    it("scoreProposal returns a numeric score", async () => {
      const { scoreProposal } = await import("./flowControl");
      const score = scoreProposal(
        { riskTier: "HIGH", type: "outreach", createdAt: Date.now() },
        new Set<string>()
      );
      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThan(0);
    });

    it("HIGH risk scores higher than LOW risk", async () => {
      const { scoreProposal } = await import("./flowControl");
      const now = Date.now();
      const emptySet = new Set<string>();
      const highScore = scoreProposal({ riskTier: "HIGH", type: "outreach", createdAt: now }, emptySet);
      const lowScore = scoreProposal({ riskTier: "LOW", type: "outreach", createdAt: now }, emptySet);
      expect(highScore).toBeGreaterThan(lowScore);
    });

    it("MEDIUM risk scores between HIGH and LOW", async () => {
      const { scoreProposal } = await import("./flowControl");
      const now = Date.now();
      const emptySet = new Set<string>();
      const highScore = scoreProposal({ riskTier: "HIGH", type: "outreach", createdAt: now }, emptySet);
      const medScore = scoreProposal({ riskTier: "MEDIUM", type: "outreach", createdAt: now }, emptySet);
      const lowScore = scoreProposal({ riskTier: "LOW", type: "outreach", createdAt: now }, emptySet);
      expect(medScore).toBeGreaterThan(lowScore);
      expect(highScore).toBeGreaterThan(medScore);
    });

    it("newer proposals score higher than older ones (recency bonus)", async () => {
      const { scoreProposal } = await import("./flowControl");
      const now = Date.now();
      const oldTs = Date.now() - 14 * 24 * 60 * 60 * 1000; // 14 days ago
      const emptySet = new Set<string>();
      const newScore = scoreProposal({ riskTier: "LOW", type: "outreach", createdAt: now }, emptySet);
      const oldScore = scoreProposal({ riskTier: "LOW", type: "outreach", createdAt: oldTs }, emptySet);
      expect(newScore).toBeGreaterThan(oldScore);
    });
  });

  describe("Max visible invariant", () => {
    it("getMaxVisible returns 5", async () => {
      const { getMaxVisible } = await import("./flowControl");
      expect(getMaxVisible()).toBe(5);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// PHASE 2B — DAILY LOOP
// ═══════════════════════════════════════════════════════════════════

describe("Phase 2B — Daily Loop", () => {
  describe("Module exports", () => {
    it("exports detectFollowUpCandidates", async () => {
      const mod = await import("./dailyLoop");
      expect(typeof mod.detectFollowUpCandidates).toBe("function");
    });

    it("exports generateFollowUpProposal", async () => {
      const mod = await import("./dailyLoop");
      expect(typeof mod.generateFollowUpProposal).toBe("function");
    });

    it("exports runNightBatch", async () => {
      const mod = await import("./dailyLoop");
      expect(typeof mod.runNightBatch).toBe("function");
    });

    it("exports isNightBatchWindow", async () => {
      const mod = await import("./dailyLoop");
      expect(typeof mod.isNightBatchWindow).toBe("function");
    });
  });

  describe("Night batch window", () => {
    it("isNightBatchWindow returns a boolean", async () => {
      const { isNightBatchWindow } = await import("./dailyLoop");
      expect(typeof isNightBatchWindow()).toBe("boolean");
    });
  });

  describe("No auto-queue invariant", () => {
    it("dailyLoop does NOT export any auto-execute or auto-approve function", async () => {
      const mod = await import("./dailyLoop");
      const exports = Object.keys(mod);
      // No function should auto-execute or auto-approve
      expect(exports).not.toContain("autoExecute");
      expect(exports).not.toContain("autoApprove");
      expect(exports).not.toContain("autoQueue");
      expect(exports).not.toContain("executeProposal");
    });

    it("runNightBatch only creates proposals, never executes them", async () => {
      const mod = await import("./dailyLoop");
      expect(typeof mod.runNightBatch).toBe("function");
      // Verify the type interface uses proposalsGenerated, not proposalsExecuted
      const src = await import("fs").then(fs => 
        fs.readFileSync("./server/dailyLoop.ts", "utf-8")
      );
      expect(src).toContain("proposalsGenerated");
      expect(src).not.toContain("proposalsExecuted");
      expect(src).not.toContain("autoExecuted");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// PHASE 2D — PREFERENCE LAYER
// ═══════════════════════════════════════════════════════════════════

describe("Phase 2D — Preference Layer", () => {
  describe("Module exports", () => {
    it("exports getAllGenerationPrefs", async () => {
      const mod = await import("./preferenceLayer");
      expect(typeof mod.getAllGenerationPrefs).toBe("function");
    });

    it("exports getGenerationPref", async () => {
      const mod = await import("./preferenceLayer");
      expect(typeof mod.getGenerationPref).toBe("function");
    });

    it("exports setGenerationPref", async () => {
      const mod = await import("./preferenceLayer");
      expect(typeof mod.setGenerationPref).toBe("function");
    });

    it("exports getAllPolicyPrefs", async () => {
      const mod = await import("./preferenceLayer");
      expect(typeof mod.getAllPolicyPrefs).toBe("function");
    });

    it("exports classifyPreferenceChange", async () => {
      const mod = await import("./preferenceLayer");
      expect(typeof mod.classifyPreferenceChange).toBe("function");
    });

    it("exports isGenerationPreference", async () => {
      const mod = await import("./preferenceLayer");
      expect(typeof mod.isGenerationPreference).toBe("function");
    });

    it("exports getProposerContext", async () => {
      const mod = await import("./preferenceLayer");
      expect(typeof mod.getProposerContext).toBe("function");
    });
  });

  describe("Generation preferences (NOT governed)", () => {
    it("getAllGenerationPrefs returns default preferences", async () => {
      const { getAllGenerationPrefs } = await import("./preferenceLayer");
      const prefs = getAllGenerationPrefs();
      expect(Array.isArray(prefs)).toBe(true);
      expect(prefs.length).toBeGreaterThan(0);
      const keys = prefs.map((p: any) => p.key);
      expect(keys).toContain("tone");
      expect(keys).toContain("format");
      expect(keys).toContain("proposal_detail");
    });

    it("getGenerationPref returns default value for known key", async () => {
      const { getGenerationPref } = await import("./preferenceLayer");
      expect(getGenerationPref("tone")).toBe("professional");
      expect(getGenerationPref("format")).toBe("email");
    });

    it("setGenerationPref updates the value", async () => {
      const { setGenerationPref, getGenerationPref } = await import("./preferenceLayer");
      setGenerationPref("tone", "warm");
      expect(getGenerationPref("tone")).toBe("warm");
      setGenerationPref("tone", "professional");
    });

    it("getGenerationPref returns empty string for unknown key", async () => {
      const { getGenerationPref } = await import("./preferenceLayer");
      expect(getGenerationPref("nonexistent_key")).toBe("");
    });
  });

  describe("Preference classification (enforcement boundary)", () => {
    it("classifies 'tone' as generation preference (not governed)", async () => {
      const { classifyPreferenceChange } = await import("./preferenceLayer");
      const result = classifyPreferenceChange("tone");
      expect(result.type).toBe("generation");
      expect(result.requiresGovernance).toBe(false);
    });

    it("classifies 'format' as generation preference (not governed)", async () => {
      const { classifyPreferenceChange } = await import("./preferenceLayer");
      const result = classifyPreferenceChange("format");
      expect(result.type).toBe("generation");
      expect(result.requiresGovernance).toBe(false);
    });

    it("classifies unknown keys as policy preference (governed)", async () => {
      const { classifyPreferenceChange } = await import("./preferenceLayer");
      const result = classifyPreferenceChange("auto_approve_threshold");
      expect(result.type).toBe("policy");
      expect(result.requiresGovernance).toBe(true);
    });

    it("classifies delegation rules as policy preference (governed)", async () => {
      const { classifyPreferenceChange } = await import("./preferenceLayer");
      const result = classifyPreferenceChange("delegate_low_risk");
      expect(result.type).toBe("policy");
      expect(result.requiresGovernance).toBe(true);
    });
  });

  describe("isGenerationPreference boundary", () => {
    it("returns true for all default generation pref keys", async () => {
      const { isGenerationPreference, DEFAULT_GENERATION_PREFS } = await import("./preferenceLayer");
      for (const key of Object.keys(DEFAULT_GENERATION_PREFS)) {
        expect(isGenerationPreference(key)).toBe(true);
      }
    });

    it("returns false for anything not in the generation pref list", async () => {
      const { isGenerationPreference } = await import("./preferenceLayer");
      expect(isGenerationPreference("budget_limit")).toBe(false);
      expect(isGenerationPreference("auto_approve")).toBe(false);
      expect(isGenerationPreference("trust_level")).toBe(false);
    });
  });

  describe("Proposer context", () => {
    it("getProposerContext returns a Record<string, string>", async () => {
      const { getProposerContext } = await import("./preferenceLayer");
      const ctx = getProposerContext();
      expect(typeof ctx).toBe("object");
      expect(typeof ctx.tone).toBe("string");
      expect(typeof ctx.format).toBe("string");
    });
  });

  describe("Invariant: generation prefs never affect execution", () => {
    it("generation preference keys do not include any execution-related terms", async () => {
      const { DEFAULT_GENERATION_PREFS } = await import("./preferenceLayer");
      const keys = Object.keys(DEFAULT_GENERATION_PREFS);
      const executionTerms = ["approve", "execute", "authorize", "delegate", "trust", "budget", "limit", "threshold"];
      for (const key of keys) {
        for (const term of executionTerms) {
          expect(key).not.toContain(term);
        }
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// ROUTER STRUCTURE TESTS
// ═══════════════════════════════════════════════════════════════════

describe("Phase 2B/2C/2D Router Structure", () => {
  it("appRouter has flowControl sub-router", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter._def.procedures).toHaveProperty("flowControl.rerank");
    expect(appRouter._def.procedures).toHaveProperty("flowControl.visible");
    expect(appRouter._def.procedures).toHaveProperty("flowControl.resolve");
  });

  it("appRouter has dailyLoop sub-router", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter._def.procedures).toHaveProperty("dailyLoop.candidates");
    expect(appRouter._def.procedures).toHaveProperty("dailyLoop.runBatch");
    expect(appRouter._def.procedures).toHaveProperty("dailyLoop.isNightWindow");
  });

  it("appRouter has preferences sub-router", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter._def.procedures).toHaveProperty("preferences.generationPrefs");
    expect(appRouter._def.procedures).toHaveProperty("preferences.setGenerationPref");
    expect(appRouter._def.procedures).toHaveProperty("preferences.policyPrefs");
    expect(appRouter._def.procedures).toHaveProperty("preferences.classify");
    expect(appRouter._def.procedures).toHaveProperty("preferences.proposerContext");
  });
});
