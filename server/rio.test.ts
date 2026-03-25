import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Build a minimal public context (no authenticated user needed for RIO demo endpoints).
 */
function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("RIO Backend — Enforcement Logic", () => {
  const ctx = createPublicContext();
  const caller = appRouter.createCaller(ctx);

  it("creates an intent and returns intentId, hash, and pending status", async () => {
    const result = await caller.rio.createIntent({
      action: "send_email",
      description: "Test email",
      requestedBy: "AI_agent",
    });

    expect(result).toHaveProperty("intentId");
    expect(result.intentId).toMatch(/^INT-/);
    expect(result).toHaveProperty("intentHash");
    expect(result.status).toBe("pending");
    expect(result.action).toBe("send_email");
  });

  it("blocks execution of an unapproved intent (fail-closed)", async () => {
    // Create a fresh intent
    const intent = await caller.rio.createIntent({
      action: "send_email",
      description: "Blocked test",
      requestedBy: "AI_agent",
    });

    // Attempt to execute without approval
    const result = await caller.rio.execute({ intentId: intent.intentId });

    expect(result.allowed).toBe(false);
    expect(result.httpStatus).toBe(403);
    expect(result.message).toContain("Blocked");
  });

  it("approves an intent and returns a cryptographic signature", async () => {
    const intent = await caller.rio.createIntent({
      action: "send_email",
      description: "Approval test",
      requestedBy: "AI_agent",
    });

    const approval = await caller.rio.approve({
      intentId: intent.intentId,
      decidedBy: "human_user",
    });

    expect(approval.decision).toBe("approved");
    expect(approval.decidedBy).toBe("human_user");
    expect(approval).toHaveProperty("signature");
    expect(approval.signature).toBeTruthy();
  });

  it("allows execution after approval and returns receipt + ledger", async () => {
    const intent = await caller.rio.createIntent({
      action: "send_email",
      description: "Full cycle test",
      requestedBy: "AI_agent",
    });

    await caller.rio.approve({
      intentId: intent.intentId,
      decidedBy: "human_user",
    });

    const result = await caller.rio.execute({ intentId: intent.intentId });

    expect(result.allowed).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(result).toHaveProperty("receipt");
    expect(result).toHaveProperty("ledger_entry");

    const receipt = result.receipt as Record<string, unknown>;
    expect(receipt).toHaveProperty("receipt_id");
    expect(receipt.action).toBe("send_email");
    expect(receipt).toHaveProperty("hash");
    expect(receipt).toHaveProperty("previous_hash");

    const ledgerEntry = result.ledger_entry as Record<string, unknown>;
    expect(ledgerEntry).toHaveProperty("block_id");
    expect(ledgerEntry).toHaveProperty("current_hash");
    expect(ledgerEntry).toHaveProperty("previous_hash");
  });

  it("denies an intent and blocks subsequent execution", async () => {
    const intent = await caller.rio.createIntent({
      action: "delete_data",
      description: "Denial test",
      requestedBy: "AI_agent",
    });

    const denial = await caller.rio.deny({
      intentId: intent.intentId,
      decidedBy: "admin_user",
    });

    expect(denial.decision).toBe("denied");
    expect(denial.decidedBy).toBe("admin_user");

    // Attempt execution after denial — must be blocked
    const result = await caller.rio.execute({ intentId: intent.intentId });
    expect(result.allowed).toBe(false);
    expect(result.httpStatus).toBe(403);
  });

  it("returns a full audit log for a completed intent", async () => {
    const intent = await caller.rio.createIntent({
      action: "send_email",
      description: "Audit log test",
      requestedBy: "AI_agent",
    });

    await caller.rio.approve({
      intentId: intent.intentId,
      decidedBy: "human_user",
    });

    await caller.rio.execute({ intentId: intent.intentId });

    const audit = await caller.rio.auditLog({ intentId: intent.intentId });

    expect(audit.intentId).toBe(intent.intentId);
    expect(audit.intent).not.toBeNull();
    expect(audit.approvals.length).toBeGreaterThan(0);
    expect(audit.executions.length).toBeGreaterThan(0);
    expect(audit.receipts.length).toBeGreaterThan(0);
    expect(audit.ledger_entries.length).toBeGreaterThan(0);
    expect(audit.log.length).toBeGreaterThan(0);
  });
});
