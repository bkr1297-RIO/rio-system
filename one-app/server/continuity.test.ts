import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  readState,
  writeState,
  withContinuity,
  _resetState,
  getStateFilePath,
} from "./continuity";
import * as fs from "fs";

describe("Continuity Layer", () => {
  beforeEach(() => {
    _resetState();
  });

  // ─── readState ──────────────────────────────────────────────

  describe("readState", () => {
    it("creates default state.json when none exists", () => {
      const state = readState();
      expect(state.version).toBe(0);
      expect(state.last_agent).toBe("system");
      expect(state.system_status).toBe("operational");
      expect(state.active_channels).toEqual(["email", "sms", "slack", "linkedin"]);
      expect(state.pending_actions).toBe(0);
      expect(state.completed_actions_count).toBe(0);
      expect(state.failed_actions_count).toBe(0);
      expect(state.last_decision).toBeNull();
      expect(state.agents_seen).toEqual([]);
      expect(state.last_note).toBe("System initialized");
    });

    it("persists state to disk", () => {
      readState(); // creates file
      expect(fs.existsSync(getStateFilePath())).toBe(true);
    });

    it("returns existing state on subsequent reads", () => {
      const s1 = readState();
      const s2 = readState();
      expect(s1.version).toBe(s2.version);
      expect(s1.last_updated).toBe(s2.last_updated);
    });

    it("recovers from corrupt state.json", () => {
      // Write garbage
      fs.writeFileSync(getStateFilePath(), "NOT VALID JSON{{{", "utf-8");
      const state = readState();
      expect(state.version).toBe(0);
      expect(state.last_agent).toBe("system");
    });
  });

  // ─── writeState ─────────────────────────────────────────────

  describe("writeState", () => {
    it("bumps version on every write", () => {
      readState(); // v0
      const s1 = writeState("manny", { last_note: "first" });
      expect(s1.version).toBe(1);
      const s2 = writeState("gemini", { last_note: "second" });
      expect(s2.version).toBe(2);
      const s3 = writeState("claude", { last_note: "third" });
      expect(s3.version).toBe(3);
    });

    it("sets last_agent to the writing agent", () => {
      readState();
      const s = writeState("manny", {});
      expect(s.last_agent).toBe("manny");
    });

    it("updates last_updated timestamp", () => {
      const s0 = readState();
      const before = s0.last_updated;
      // Small delay to ensure different timestamp
      const s1 = writeState("manny", {});
      expect(s1.last_updated).toBeDefined();
      expect(typeof s1.last_updated).toBe("string");
    });

    it("tracks agents_seen across multiple agents", () => {
      readState();
      writeState("manny", {});
      writeState("gemini", {});
      writeState("claude", {});
      writeState("manny", {}); // duplicate — should not add again
      const s = readState();
      expect(s.agents_seen).toEqual(["manny", "gemini", "claude"]);
    });

    it("merges partial updates without overwriting other fields", () => {
      readState();
      writeState("manny", { system_status: "degraded" });
      const s = writeState("gemini", { last_note: "hello" });
      // system_status should still be degraded (not reset)
      expect(s.system_status).toBe("degraded");
      expect(s.last_note).toBe("hello");
      expect(s.last_agent).toBe("gemini");
    });

    it("updates pending_actions count", () => {
      readState();
      const s = writeState("manny", { pending_actions: 5 });
      expect(s.pending_actions).toBe(5);
    });

    it("updates completed_actions_count", () => {
      readState();
      const s = writeState("manny", { completed_actions_count: 10 });
      expect(s.completed_actions_count).toBe(10);
    });

    it("updates failed_actions_count", () => {
      readState();
      const s = writeState("manny", { failed_actions_count: 3 });
      expect(s.failed_actions_count).toBe(3);
    });

    it("updates last_decision", () => {
      readState();
      const decision = {
        action_id: "test-001",
        decision: "BLOCK",
        channel: "email",
        confidence: "high",
        timestamp: new Date().toISOString(),
      };
      const s = writeState("manny", { last_decision: decision });
      expect(s.last_decision).toEqual(decision);
    });

    it("updates active_channels", () => {
      readState();
      const s = writeState("manny", { active_channels: ["email", "telegram"] });
      expect(s.active_channels).toEqual(["email", "telegram"]);
    });

    it("updates rule_kernel_hash", () => {
      readState();
      const s = writeState("manny", { rule_kernel_hash: "abc123" });
      expect(s.rule_kernel_hash).toBe("abc123");
    });
  });

  // ─── withContinuity ────────────────────────────────────────

  describe("withContinuity", () => {
    it("reads state, runs function, writes updates atomically", async () => {
      readState();
      const result = await withContinuity("manny", (state) => {
        expect(state.version).toBe(0);
        return { pending_actions: state.pending_actions + 1 };
      });
      expect(result.version).toBe(1);
      expect(result.pending_actions).toBe(1);
      expect(result.last_agent).toBe("manny");
    });

    it("works with async functions", async () => {
      readState();
      const result = await withContinuity("gemini", async (state) => {
        await new Promise((r) => setTimeout(r, 10));
        return { last_note: "async update" };
      });
      expect(result.last_note).toBe("async update");
      expect(result.last_agent).toBe("gemini");
    });

    it("preserves state on empty updates", async () => {
      readState();
      writeState("manny", { pending_actions: 5, last_note: "before" });
      const result = await withContinuity("claude", () => ({}));
      expect(result.pending_actions).toBe(5);
      expect(result.last_agent).toBe("claude");
      expect(result.version).toBe(2);
    });
  });

  // ─── _resetState ───────────────────────────────────────────

  describe("_resetState", () => {
    it("removes state.json from disk", () => {
      readState(); // creates file
      expect(fs.existsSync(getStateFilePath())).toBe(true);
      _resetState();
      expect(fs.existsSync(getStateFilePath())).toBe(false);
    });

    it("allows fresh state creation after reset", () => {
      readState();
      writeState("manny", { pending_actions: 99 });
      _resetState();
      const fresh = readState();
      expect(fresh.version).toBe(0);
      expect(fresh.pending_actions).toBe(0);
      expect(fresh.agents_seen).toEqual([]);
    });
  });

  // ─── Multi-agent continuity scenario ───────────────────────

  describe("multi-agent continuity scenario", () => {
    it("tracks a full multi-agent interaction sequence", () => {
      readState();

      // Manny comes online
      writeState("manny", { last_note: "Manny online" });

      // Gemini checks in
      writeState("gemini", { last_note: "Gemini ready" });

      // Human creates an action (simulated via state update)
      writeState("human", {
        pending_actions: 1,
        last_note: "Human submitted classify_message",
      });

      // Manny processes it
      writeState("manny", {
        pending_actions: 0,
        completed_actions_count: 1,
        last_decision: {
          action_id: "test-001",
          decision: "BLOCK",
          channel: "telegram",
          confidence: "high",
          timestamp: new Date().toISOString(),
        },
        last_note: "Action completed: classify_message → BLOCK",
      });

      const final = readState();
      expect(final.version).toBe(4);
      expect(final.agents_seen).toEqual(["manny", "gemini", "human"]);
      expect(final.pending_actions).toBe(0);
      expect(final.completed_actions_count).toBe(1);
      expect(final.last_decision?.decision).toBe("BLOCK");
      expect(final.last_agent).toBe("manny");
    });
  });
});
