/**
 * RIO Shared Action Store — Tests
 * ────────────────────────────────
 * Tests the universal agent contract: create, claim, complete, fail, list, receipt logging.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createAction,
  claimAction,
  completeAction,
  failAction,
  cancelAction,
  getAction,
  listActions,
  getPendingActions,
  _clearActions,
  type RIOAction,
  type ActionSource,
  type ActionStatus,
} from "./actionStore";

// Mock the ledger to avoid DB dependency
vi.mock("./db", () => ({
  appendLedger: vi.fn().mockResolvedValue({ entryId: "ledger-test-123", hash: "abc123" }),
  sha256: vi.fn((input: string) => `sha256-${input.slice(0, 20)}`),
}));

describe("RIO Shared Action Store", () => {
  beforeEach(() => {
    _clearActions();
  });

  // ─── Create ───────────────────────────────────────────────

  describe("createAction", () => {
    it("creates an action with status: pending", () => {
      const action = createAction("gemini", "send_email", { to: "test@example.com", body: "Hello" });

      expect(action.id).toBeDefined();
      expect(action.source).toBe("gemini");
      expect(action.action).toBe("send_email");
      expect(action.data).toEqual({ to: "test@example.com", body: "Hello" });
      expect(action.status).toBe("pending");
      expect(action.result).toBeNull();
      expect(action.receipt_id).toBeNull();
      expect(action.created_at).toBeDefined();
      expect(action.updated_at).toBeDefined();
    });

    it("creates actions from all 5 sources", () => {
      const sources: ActionSource[] = ["gemini", "manny", "claude", "openai", "human"];
      for (const source of sources) {
        const action = createAction(source, "test_action", { source });
        expect(action.source).toBe(source);
        expect(action.status).toBe("pending");
      }
      expect(listActions()).toHaveLength(5);
    });

    it("generates unique IDs for each action", () => {
      const a1 = createAction("gemini", "action_a", {});
      const a2 = createAction("claude", "action_b", {});
      expect(a1.id).not.toBe(a2.id);
    });

    it("persists action to disk (retrievable by ID)", () => {
      const created = createAction("manny", "search_web", { query: "RIO method" });
      const retrieved = getAction(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.source).toBe("manny");
      expect(retrieved!.action).toBe("search_web");
    });
  });

  // ─── Claim ────────────────────────────────────────────────

  describe("claimAction", () => {
    it("claims a pending action → status: executing", () => {
      const action = createAction("gemini", "draft_document", { title: "Test" });
      const claimed = claimAction(action.id);

      expect(claimed).not.toBeNull();
      expect(claimed!.status).toBe("executing");
      // updated_at may match if same millisecond — verify status change is the real assertion
      expect(claimed!.id).toBe(action.id);
    });

    it("prevents double-claim (already executing)", () => {
      const action = createAction("openai", "analyze_data", {});
      claimAction(action.id);
      const secondClaim = claimAction(action.id);
      expect(secondClaim).toBeNull();
    });

    it("returns null for non-existent action", () => {
      const result = claimAction("non-existent-id");
      expect(result).toBeNull();
    });

    it("cannot claim a completed action", async () => {
      const action = createAction("claude", "test", {});
      claimAction(action.id);
      await completeAction(action.id, "done");
      const result = claimAction(action.id);
      expect(result).toBeNull();
    });

    it("cannot claim a cancelled action", () => {
      const action = createAction("human", "test", {});
      cancelAction(action.id);
      const result = claimAction(action.id);
      expect(result).toBeNull();
    });
  });

  // ─── Complete ─────────────────────────────────────────────

  describe("completeAction", () => {
    it("completes an executing action with result", async () => {
      const action = createAction("gemini", "send_email", { to: "a@b.com" });
      claimAction(action.id);
      const completed = await completeAction(action.id, { messageId: "msg-123", delivered: true });

      expect(completed).not.toBeNull();
      expect(completed!.status).toBe("completed");
      expect(completed!.result).toEqual({ messageId: "msg-123", delivered: true });
    });

    it("accepts string result (wraps in object)", async () => {
      const action = createAction("manny", "echo", {});
      claimAction(action.id);
      const completed = await completeAction(action.id, "Success");

      expect(completed!.result).toEqual({ message: "Success" });
    });

    it("writes receipt to governance ledger", async () => {
      const { appendLedger } = await import("./db");
      const action = createAction("claude", "search_web", { query: "test" });
      claimAction(action.id);
      const completed = await completeAction(action.id, { results: [] });

      expect(appendLedger).toHaveBeenCalledWith("ACTION_COMPLETE", expect.objectContaining({
        action_id: action.id,
        source: "claude",
        action: "search_web",
        status: "completed",
      }));
      expect(completed!.receipt_id).toBe("ledger-test-123");
    });

    it("cannot complete a pending action (must claim first)", async () => {
      const action = createAction("openai", "test", {});
      const result = await completeAction(action.id, "done");
      expect(result).toBeNull();
    });

    it("cannot complete a non-existent action", async () => {
      const result = await completeAction("fake-id", "done");
      expect(result).toBeNull();
    });
  });

  // ─── Fail ─────────────────────────────────────────────────

  describe("failAction", () => {
    it("fails an executing action with error", async () => {
      const action = createAction("gemini", "send_email", {});
      claimAction(action.id);
      const failed = await failAction(action.id, "SMTP connection refused");

      expect(failed).not.toBeNull();
      expect(failed!.status).toBe("failed");
      expect(failed!.result).toEqual({ error: "SMTP connection refused" });
    });

    it("writes failure receipt to governance ledger", async () => {
      const { appendLedger } = await import("./db");
      const action = createAction("manny", "drive_write", {});
      claimAction(action.id);
      await failAction(action.id, "Permission denied");

      expect(appendLedger).toHaveBeenCalledWith("ACTION_COMPLETE", expect.objectContaining({
        action_id: action.id,
        status: "failed",
        error: "Permission denied",
      }));
    });

    it("cannot fail a pending action", async () => {
      const action = createAction("claude", "test", {});
      const result = await failAction(action.id, "error");
      expect(result).toBeNull();
    });
  });

  // ─── Cancel ───────────────────────────────────────────────

  describe("cancelAction", () => {
    it("cancels a pending action", () => {
      const action = createAction("human", "send_email", {});
      const cancelled = cancelAction(action.id);

      expect(cancelled).not.toBeNull();
      expect(cancelled!.status).toBe("cancelled");
    });

    it("cannot cancel an executing action", () => {
      const action = createAction("gemini", "test", {});
      claimAction(action.id);
      const result = cancelAction(action.id);
      expect(result).toBeNull();
    });
  });

  // ─── List & Filter ────────────────────────────────────────

  describe("listActions", () => {
    it("lists all actions", () => {
      createAction("gemini", "action_1", {});
      createAction("claude", "action_2", {});
      createAction("manny", "action_3", {});

      const all = listActions();
      expect(all).toHaveLength(3);
      const actions = all.map(a => a.action).sort();
      expect(actions).toEqual(["action_1", "action_2", "action_3"]);
    });

    it("filters by status", () => {
      const a1 = createAction("gemini", "pending_action", {});
      const a2 = createAction("claude", "claimed_action", {});
      claimAction(a2.id);

      const pending = listActions({ status: "pending" });
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(a1.id);

      const executing = listActions({ status: "executing" });
      expect(executing).toHaveLength(1);
      expect(executing[0].id).toBe(a2.id);
    });

    it("filters by source", () => {
      createAction("gemini", "gemini_action", {});
      createAction("claude", "claude_action", {});
      createAction("gemini", "gemini_action_2", {});

      const geminiActions = listActions({ source: "gemini" });
      expect(geminiActions).toHaveLength(2);
      expect(geminiActions.every(a => a.source === "gemini")).toBe(true);
    });

    it("filters by both status and source", () => {
      const a1 = createAction("gemini", "action_1", {});
      const a2 = createAction("gemini", "action_2", {});
      createAction("claude", "action_3", {});
      claimAction(a2.id);

      const result = listActions({ status: "pending", source: "gemini" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(a1.id);
    });
  });

  describe("getPendingActions", () => {
    it("returns only pending actions", () => {
      const a1 = createAction("gemini", "pending_1", {});
      const a2 = createAction("claude", "claimed", {});
      const a3 = createAction("openai", "pending_2", {});
      claimAction(a2.id);

      const pending = getPendingActions();
      expect(pending).toHaveLength(2);
      expect(pending.map(a => a.id).sort()).toEqual([a1.id, a3.id].sort());
    });
  });

  // ─── Full Flow ────────────────────────────────────────────

  describe("full action lifecycle", () => {
    it("pending → executing → completed (with receipt)", async () => {
      // 1. Gemini writes action
      const action = createAction("gemini", "send_email", {
        to: "investor@bigfund.com",
        subject: "Q4 Update",
        body: "Here are the Q4 results...",
      });
      expect(action.status).toBe("pending");

      // 2. Manny reads + claims
      const pending = getPendingActions();
      expect(pending).toHaveLength(1);
      const claimed = claimAction(pending[0].id);
      expect(claimed!.status).toBe("executing");

      // 3. Manny executes + completes
      const completed = await completeAction(claimed!.id, {
        messageId: "msg-456",
        delivered: true,
        timestamp: "2026-04-12T05:00:00Z",
      });
      expect(completed!.status).toBe("completed");
      expect(completed!.receipt_id).toBe("ledger-test-123");

      // 4. Verify final state
      const final = getAction(action.id);
      expect(final!.status).toBe("completed");
      expect(final!.receipt_id).toBeDefined();
    });

    it("pending → executing → failed (with receipt)", async () => {
      const action = createAction("openai", "drive_write", { path: "/docs/report.md" });
      claimAction(action.id);
      const failed = await failAction(action.id, "Insufficient permissions");

      expect(failed!.status).toBe("failed");
      expect(failed!.result).toEqual({ error: "Insufficient permissions" });
      expect(failed!.receipt_id).toBe("ledger-test-123");
    });

    it("pending → cancelled (no execution, no receipt)", () => {
      const action = createAction("human", "send_email", { to: "wrong@address.com" });
      const cancelled = cancelAction(action.id);

      expect(cancelled!.status).toBe("cancelled");
      expect(cancelled!.receipt_id).toBeNull();
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────

  describe("edge cases", () => {
    it("handles empty data object", () => {
      const action = createAction("gemini", "ping", {});
      expect(action.data).toEqual({});
    });

    it("handles complex nested data", () => {
      const action = createAction("claude", "complex_action", {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
        nullField: null,
      });
      const retrieved = getAction(action.id);
      expect(retrieved!.data).toEqual({
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
        nullField: null,
      });
    });

    it("getAction returns null for non-existent ID", () => {
      expect(getAction("does-not-exist")).toBeNull();
    });

    it("listActions returns empty array when no actions exist", () => {
      expect(listActions()).toEqual([]);
    });
  });
});
