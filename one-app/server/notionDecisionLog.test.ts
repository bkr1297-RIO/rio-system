import { describe, it, expect } from "vitest";
import {
  createDecisionRow,
  updateDecisionRow,
  getDecisionRow,
  pollPendingApprovals,
  findDecisionRowByIntentId,
  isNotionConfigured,
} from "./notionDecisionLog";

describe("Notion Decision Log", () => {
  // Use a unique intent ID per test run to avoid collisions
  const testIntentId = `INT-TEST-${Date.now()}`;
  const testIntentHash = `sha256-test-${Date.now()}`;
  let createdPageId: string | undefined;

  it("should report Notion as configured", () => {
    expect(isNotionConfigured()).toBe(true);
  });

  it("should create a Pending row in the DECISION LOG", async () => {
    const result = await createDecisionRow({
      title: `Test: send_email to test@example.com`,
      intentId: testIntentId,
      intentHash: testIntentHash,
      action: "send_email",
      riskTier: "LOW",
      proposer: "manny",
      policyVersion: "v2.0.0-test",
      gatewayDecision: "Allow",
    });

    expect(result.success).toBe(true);
    expect(result.pageId).toBeDefined();
    createdPageId = result.pageId;
  });

  it("should fetch the created row by page ID", async () => {
    expect(createdPageId).toBeDefined();
    const row = await getDecisionRow(createdPageId!);

    expect(row).not.toBeNull();
    expect(row!.intentId).toBe(testIntentId);
    expect(row!.intentHash).toBe(testIntentHash);
    expect(row!.action).toBe("send_email");
    expect(row!.riskTier).toBe("LOW");
    expect(row!.proposer).toBe("manny");
    expect(row!.status).toBe("Pending");
    expect(row!.approvalState).toBe("Unsigned");
    expect(row!.policyVersion).toBe("v2.0.0-test");
    expect(row!.gatewayDecision).toBe("Allow");
  });

  it("should find the row by intent ID", async () => {
    const row = await findDecisionRowByIntentId(testIntentId);

    expect(row).not.toBeNull();
    expect(row!.pageId).toBe(createdPageId);
    expect(row!.intentId).toBe(testIntentId);
  });

  it("should update the row to Executed with receipt link", async () => {
    expect(createdPageId).toBeDefined();

    const updateResult = await updateDecisionRow(createdPageId!, {
      status: "Executed",
      approvalState: "Executed",
      receiptLink: "https://rio-one.manus.space/receipts/RCP-TEST-001",
    });

    expect(updateResult.success).toBe(true);

    // Verify the update
    const row = await getDecisionRow(createdPageId!);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("Executed");
    expect(row!.approvalState).toBe("Executed");
    expect(row!.receiptLink).toBe("https://rio-one.manus.space/receipts/RCP-TEST-001");
  });

  it("should return empty array from pollPendingApprovals (no Approved+Unsigned rows)", async () => {
    // Our test row is now Executed, so it should NOT appear in pending approvals
    const pending = await pollPendingApprovals();
    const found = pending.find(r => r.intentId === testIntentId);
    expect(found).toBeUndefined();
  });

  // Clean up: archive the test row so it doesn't clutter the database
  it("should archive the test row (cleanup)", async () => {
    expect(createdPageId).toBeDefined();
    const NOTION_API_TOKEN = process.env.NOTION_API_TOKEN;
    const res = await fetch(`https://api.notion.com/v1/pages/${createdPageId}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${NOTION_API_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ archived: true }),
    });
    expect(res.ok).toBe(true);
  });
});
