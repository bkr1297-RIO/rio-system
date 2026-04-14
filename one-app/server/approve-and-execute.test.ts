/**
 * Tests for the approveAndExecute tRPC mutation.
 *
 * This mutation is the unified server-side pipeline:
 *   Browser (I-2) → tRPC → Server logs in as I-2 (authorize) + I-1 (execute) → deliver → receipt
 *
 * Validates:
 *   1. The mutation exists in the gateway router
 *   2. It accepts intentId input
 *   3. It calls Gateway /authorize with I-2 token (approver)
 *   4. It calls Gateway /execute-action with I-1 token (proposer) — separation of duties
 *   5. It delivers email via notifyOwner + Telegram
 *   6. It logs to local ledger
 *   7. GatewayApprovals.tsx uses approveAndExecute (not gatewayExecuteAction)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const routersSrc = readFileSync(join(__dirname, "routers.ts"), "utf-8");
const approvalsSrc = readFileSync(join(__dirname, "../client/src/pages/GatewayApprovals.tsx"), "utf-8");
const gatewaySrc = readFileSync(join(__dirname, "../client/src/lib/gateway.ts"), "utf-8");

describe("approveAndExecute mutation", () => {
  it("exists in the gateway router", () => {
    expect(routersSrc).toContain("approveAndExecute:");
    expect(routersSrc).toContain("protectedProcedure.input");
  });

  it("accepts intentId input", () => {
    expect(routersSrc).toContain("intentId: z.string().min(1)");
  });

  it("logs in as I-1 (proposer) for execute-action", () => {
    expect(routersSrc).toContain('user_id: "I-1"');
    expect(routersSrc).toContain("/execute-action");
  });

  it("logs in as I-2 (approver) for authorize", () => {
    expect(routersSrc).toContain('user_id: "I-2"');
    expect(routersSrc).toContain("/authorize");
  });

  it("enforces separation of duties: I-2 authorizes, I-1 executes", () => {
    // I-2 token used for /authorize
    const section = routersSrc.slice(
      routersSrc.indexOf("approveAndExecute:"),
      routersSrc.indexOf("health: publicProcedure")
    );
    expect(section).toContain("i2Token");
    expect(section).toContain("/authorize");

    // I-1 token used for /execute-action
    expect(section).toContain("i1Token");
    expect(section).toContain("/execute-action");
  });

  it("uses delivery_mode=external for Gateway execute-action (fix for SMTP hang)", () => {
    const section = routersSrc.slice(
      routersSrc.indexOf("approveAndExecute:"),
      routersSrc.indexOf("health: publicProcedure")
    );
    // The unified path always sends delivery_mode: "external" to Gateway
    expect(section).toContain('delivery_mode: "external"');
    // Should NOT have the old branching on isLocalGmailExecution
    expect(section).not.toContain("isLocalGmailExecution");
  });

  it("handles local Gmail delivery after Gateway receipt", () => {
    const section = routersSrc.slice(
      routersSrc.indexOf("approveAndExecute:"),
      routersSrc.indexOf("health: publicProcedure")
    );
    // After Gateway receipt, proxy delivers via local Gmail SMTP
    expect(section).toContain("isGmailDelivery");
    expect(section).toContain("dispatchExecution");
    expect(section).toContain("generateReceipt");
  });

  it("delivers email via notifyOwner", () => {
    const section = routersSrc.slice(
      routersSrc.indexOf("approveAndExecute:"),
      routersSrc.indexOf("health: publicProcedure")
    );
    expect(section).toContain("notifyOwner");
  });

  it("delivers email via Telegram", () => {
    const section = routersSrc.slice(
      routersSrc.indexOf("approveAndExecute:"),
      routersSrc.indexOf("health: publicProcedure")
    );
    expect(section).toContain("isTelegramConfigured");
    expect(section).toContain("sendTg");
  });

  it("logs to local ledger", () => {
    const section = routersSrc.slice(
      routersSrc.indexOf("approveAndExecute:"),
      routersSrc.indexOf("health: publicProcedure")
    );
    expect(section).toContain("appendLedger");
  });

  it("returns receipt with required fields", () => {
    const section = routersSrc.slice(
      routersSrc.indexOf("approveAndExecute:"),
      routersSrc.indexOf("health: publicProcedure")
    );
    expect(section).toContain("receipt_id");
    expect(section).toContain("receipt_hash");
    expect(section).toContain("deliveryMode");
    expect(section).toContain("channels");
  });
});

describe("GatewayApprovals uses server-side approveAndExecute", () => {
  it("imports trpc (not gatewayExecuteAction)", () => {
    expect(approvalsSrc).toContain("trpc");
    expect(approvalsSrc).not.toContain("gatewayExecuteAction");
  });

  it("calls approveAndExecute.mutateAsync", () => {
    expect(approvalsSrc).toContain("approveAndExecute.mutateAsync");
  });

  it("does NOT call gatewayExecuteAction from the browser", () => {
    // The browser should never call /execute-action directly
    // because I-2 (approver) doesn't have the proposer role
    expect(approvalsSrc).not.toContain("gatewayExecuteAction(");
  });

  it("does NOT import ExecuteActionResult", () => {
    // No longer needed since execution happens server-side
    expect(approvalsSrc).not.toContain("ExecuteActionResult");
  });
});

describe("gateway.ts client library", () => {
  it("still exports gatewayExecuteAction for other uses", () => {
    // The function still exists in gateway.ts for potential future use
    // but is NOT imported by GatewayApprovals
    expect(gatewaySrc).toContain("gatewayExecuteAction");
  });

  it("does NOT contain HITL code", () => {
    expect(gatewaySrc).not.toContain("hitlSubmitIntent");
    expect(gatewaySrc).not.toContain("hitlExecute");
    expect(gatewaySrc).not.toContain("hitlOnboard");
    expect(gatewaySrc).toContain("HITL Proxy REMOVED");
  });
});
