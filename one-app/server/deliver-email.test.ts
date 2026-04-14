/**
 * Tests for gateway.deliverEmail tRPC mutation
 * and the external_fallback email delivery flow.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const routersPath = path.resolve(__dirname, "routers.ts");
const routersContent = fs.readFileSync(routersPath, "utf-8");

const gatewayClientPath = path.resolve(__dirname, "../client/src/lib/gateway.ts");
const gatewayClientContent = fs.readFileSync(gatewayClientPath, "utf-8");

const approvalsPath = path.resolve(__dirname, "../client/src/pages/GatewayApprovals.tsx");
const approvalsContent = fs.readFileSync(approvalsPath, "utf-8");

const schemaPath = path.resolve(__dirname, "../drizzle/schema.ts");
const schemaContent = fs.readFileSync(schemaPath, "utf-8");

const dbPath = path.resolve(__dirname, "db.ts");
const dbContent = fs.readFileSync(dbPath, "utf-8");

describe("deliverEmail tRPC mutation", () => {
  it("should be defined in routers.ts", () => {
    expect(routersContent).toContain("deliverEmail:");
  });

  it("should accept intentId and emailPayload inputs", () => {
    expect(routersContent).toContain("intentId: z.string().min(1)");
    expect(routersContent).toContain("emailPayload: z.object({");
    expect(routersContent).toContain("to: z.string()");
    expect(routersContent).toContain("subject: z.string()");
    expect(routersContent).toContain("body: z.string()");
  });

  it("should accept optional receipt input", () => {
    expect(routersContent).toContain("receipt: z.object({");
    expect(routersContent).toContain("receipt_id: z.string()");
    expect(routersContent).toContain("receipt_hash: z.string()");
  });

  it("should deliver via notifyOwner", () => {
    expect(routersContent).toContain("notifyOwner({ title, content })");
  });

  it("should deliver via Telegram when configured", () => {
    expect(routersContent).toContain("isTelegramConfigured()");
    expect(routersContent).toContain("Governed Email Delivered");
  });

  it("should log EMAIL_DELIVERY to local ledger", () => {
    expect(routersContent).toContain('appendLedger("EMAIL_DELIVERY"');
  });

  it("should return delivery status with channel details", () => {
    expect(routersContent).toContain("delivered: notifyDelivered || telegramDelivered");
    expect(routersContent).toContain("channels: {");
    expect(routersContent).toContain("notification: notifyDelivered");
    expect(routersContent).toContain("telegram: telegramDelivered");
  });

  it("should NOT contain Gmail MCP fallback code (Gateway sends directly)", () => {
    expect(routersContent).not.toContain("sendEmailViaMcp");
    expect(routersContent).not.toContain("gmailDelivered");
    expect(routersContent).not.toContain("gmailMessageId");
  });
});

describe("EMAIL_DELIVERY ledger entry type", () => {
  it("should be in the drizzle schema enum", () => {
    expect(schemaContent).toContain("EMAIL_DELIVERY");
  });

  it("should be in the appendLedger type union", () => {
    expect(dbContent).toContain('"EMAIL_DELIVERY"');
  });
});

describe("gatewayExecuteAction client function", () => {
  it("should be exported from gateway.ts", () => {
    expect(gatewayClientContent).toContain("export async function gatewayExecuteAction");
  });

  it("should call /execute-action endpoint", () => {
    expect(gatewayClientContent).toContain('"/execute-action"');
  });

  it("should include replay prevention fields", () => {
    expect(gatewayClientContent).toContain("request_timestamp");
    expect(gatewayClientContent).toContain("request_nonce");
  });

  it("should export ExecuteActionResult type with email_payload", () => {
    expect(gatewayClientContent).toContain("export interface ExecuteActionResult");
    expect(gatewayClientContent).toContain("email_payload?:");
    expect(gatewayClientContent).toContain("delivery_mode?:");
  });
});

describe("GatewayApprovals server-side approveAndExecute flow", () => {
  it("should use server-side approveAndExecute (not browser-side gatewayExecuteAction)", () => {
    expect(approvalsContent).toContain("approveAndExecute");
    expect(approvalsContent).not.toContain("gatewayExecuteAction");
  });

  it("should import trpc for approveAndExecute mutation", () => {
    expect(approvalsContent).toContain('import { trpc } from "@/lib/trpc"');
  });

  it("should call approveAndExecute.mutateAsync after clicking approve", () => {
    expect(approvalsContent).toContain("approveAndExecute.mutateAsync");
  });

  it("should show delivery mode in receipt display", () => {
    expect(approvalsContent).toContain("deliveryMode");
    expect(approvalsContent).toContain("lastReceipt.deliveryMode");
  });

  it("should NOT use old HITL execute flow", () => {
    expect(approvalsContent).not.toContain("hitlExecute");
    expect(approvalsContent).not.toContain("hitlApprove");
  });
});
