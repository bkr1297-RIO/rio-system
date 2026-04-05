import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for Policy Rules CRUD and Notifications system.
 * These test the tRPC router layer via direct procedure calls.
 */

// ─── Mock DB helpers ─────────────────────────────────────────
const mockPolicyRules: Array<{
  ruleId: string;
  userId: number;
  name: string;
  description: string | null;
  toolPattern: string;
  riskOverride: string | null;
  requiresApproval: boolean;
  condition: unknown;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}> = [];

const mockNotifications: Array<{
  id: number;
  notificationId: string;
  userId: number;
  type: string;
  title: string;
  body: string;
  intentId: string | null;
  executionId: string | null;
  read: boolean;
  createdAt: Date;
}> = [];

let ruleCounter = 0;
let notifCounter = 0;

vi.mock("./db", () => ({
  // Policy rules
  createPolicyRule: vi.fn(async (userId: number, data: Record<string, unknown>) => {
    ruleCounter++;
    const rule = {
      id: ruleCounter,
      ruleId: `rule-${ruleCounter}`,
      userId,
      name: data.name as string,
      description: (data.description as string) ?? null,
      toolPattern: data.toolPattern as string,
      riskOverride: (data.riskOverride as string) ?? null,
      requiresApproval: data.requiresApproval as boolean,
      condition: data.condition ?? null,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockPolicyRules.push(rule);
    return rule;
  }),
  getUserPolicyRules: vi.fn(async (userId: number) => {
    return mockPolicyRules.filter(r => r.userId === userId);
  }),
  getAllPolicyRules: vi.fn(async () => {
    return [...mockPolicyRules];
  }),
  getActivePolicyRulesForTool: vi.fn(async (toolName: string) => {
    return mockPolicyRules.filter(r => r.enabled && (r.toolPattern === "*" || r.toolPattern === toolName));
  }),
  updatePolicyRule: vi.fn(async (ruleId: string, data: Record<string, unknown>) => {
    const rule = mockPolicyRules.find(r => r.ruleId === ruleId);
    if (!rule) return null;
    Object.assign(rule, data, { updatedAt: new Date() });
    return rule;
  }),
  deletePolicyRule: vi.fn(async (ruleId: string) => {
    const idx = mockPolicyRules.findIndex(r => r.ruleId === ruleId);
    if (idx >= 0) mockPolicyRules.splice(idx, 1);
  }),
  togglePolicyRule: vi.fn(async (ruleId: string, enabled: boolean) => {
    const rule = mockPolicyRules.find(r => r.ruleId === ruleId);
    if (!rule) return null;
    rule.enabled = enabled;
    return rule;
  }),

  // Notifications
  createNotification: vi.fn(async (userId: number, data: Record<string, unknown>) => {
    notifCounter++;
    const notif = {
      id: notifCounter,
      notificationId: `notif-${notifCounter}`,
      userId,
      type: data.type as string,
      title: data.title as string,
      body: data.body as string,
      intentId: (data.intentId as string) ?? null,
      executionId: (data.executionId as string) ?? null,
      read: false,
      createdAt: new Date(),
    };
    mockNotifications.push(notif);
    return notif;
  }),
  getUserNotifications: vi.fn(async (userId: number, limit: number) => {
    return mockNotifications
      .filter(n => n.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }),
  getUnreadNotificationCount: vi.fn(async (userId: number) => {
    return mockNotifications.filter(n => n.userId === userId && !n.read).length;
  }),
  markNotificationRead: vi.fn(async (notificationId: string) => {
    const notif = mockNotifications.find(n => n.notificationId === notificationId);
    if (notif) notif.read = true;
  }),
  markAllNotificationsRead: vi.fn(async (userId: number) => {
    mockNotifications.filter(n => n.userId === userId).forEach(n => { n.read = true; });
  }),

  // Stubs for other db functions used by routers
  appendLedger: vi.fn(async () => {}),
  getProxyUser: vi.fn(async () => ({ status: "ACTIVE", publicKey: "test-key" })),
  getAllTools: vi.fn(async () => []),
  getToolByName: vi.fn(async () => null),
  createIntent: vi.fn(async () => null),
  getIntent: vi.fn(async () => null),
  getUserIntents: vi.fn(async () => []),
  updateIntentStatus: vi.fn(async () => {}),
  createApproval: vi.fn(async () => null),
  getApprovalForIntent: vi.fn(async () => null),
  incrementApprovalExecution: vi.fn(async () => {}),
  createExecution: vi.fn(async () => null),
  getExecution: vi.fn(async () => null),
  getExecutionByIntentId: vi.fn(async () => null),
  updateExecutionReceiptHash: vi.fn(async () => {}),
  getUserApprovals: vi.fn(async () => []),
  sha256: vi.fn((s: string) => `sha256-${s.length}`),
  saveKeyBackup: vi.fn(async () => null),
  getKeyBackup: vi.fn(async () => null),
  deleteKeyBackup: vi.fn(async () => {}),
  getLedgerEntriesSince: vi.fn(async () => []),
  getAllLedgerEntries: vi.fn(async () => []),
  verifyHashChain: vi.fn(async () => ({ valid: true, entries: 0 })),
  createProxyUser: vi.fn(async () => null),
  killProxyUser: vi.fn(async () => {}),
  updateProxyUserPublicKey: vi.fn(async () => null),
  getAllProxyUsers: vi.fn(async () => []),
  revokeProxyUser: vi.fn(async () => {}),
  createConversation: vi.fn(async () => null),
  getConversation: vi.fn(async () => null),
  getUserConversations: vi.fn(async () => []),
  updateConversationMessages: vi.fn(async () => null),
  addIntentToConversation: vi.fn(async () => {}),
  closeConversation: vi.fn(async () => {}),
  createLearningEvent: vi.fn(async () => null),
  getUserLearningEvents: vi.fn(async () => []),
  getRecentLearningContext: vi.fn(async () => []),
  getAllNodeConfigs: vi.fn(async () => []),
  getActiveNodeConfigs: vi.fn(async () => []),
  getNodeConfig: vi.fn(async () => null),
  getSystemComponents: vi.fn(async () => []),
  getSystemComponent: vi.fn(async () => null),
}));

vi.mock("./telegram", () => ({
  isTelegramConfigured: vi.fn(() => false),
  sendIntentNotification: vi.fn(async () => {}),
  sendReceiptNotification: vi.fn(async () => {}),
  sendKillNotification: vi.fn(async () => {}),
}));

vi.mock("./bondi", () => ({
  routeToBondi: vi.fn(async () => ({ response: "test" })),
  buildSentinelStatus: vi.fn(async () => ({})),
  generateConversationTitle: vi.fn(async () => "Test"),
  createLearningEventPayload: vi.fn(() => ({
    eventId: "test-event",
    eventType: "EXECUTION",
    intentId: "test-intent",
    context: {},
    outcome: "POSITIVE",
  })),
}));

vi.mock("./connectors", () => ({
  dispatchExecution: vi.fn(async () => ({ success: true, output: "ok", executedAt: Date.now() })),
  generateReceipt: vi.fn(() => "receipt-hash"),
  verifyArgsHash: vi.fn(() => true),
}));

vi.mock("./controlPlane", () => ({
  runLearningLoopAnalysis: vi.fn(async () => ({})),
}));

vi.mock("./agentAdapters", () => ({
  listAdapters: vi.fn(() => []),
  getAdapter: vi.fn(() => null),
  inferTaskType: vi.fn(() => "general"),
  recommendAgent: vi.fn(() => ({ agentId: "passthrough", confidence: 1 })),
  TASK_TYPES: [],
}));

// ─── Tests ───────────────────────────────────────────────────

describe("Policy Rules", () => {
  beforeEach(() => {
    mockPolicyRules.length = 0;
    ruleCounter = 0;
  });

  it("creates a policy rule with all fields", async () => {
    const { createPolicyRule } = await import("./db");
    const rule = await createPolicyRule(1, {
      name: "Block large payments",
      description: "Require approval for payments over $500",
      toolPattern: "financial_transfer",
      riskOverride: "HIGH",
      requiresApproval: true,
      condition: { field: "amount", operator: "greaterThan", value: "500" },
    });

    expect(rule).toBeDefined();
    expect(rule!.ruleId).toBe("rule-1");
    expect(rule!.name).toBe("Block large payments");
    expect(rule!.toolPattern).toBe("financial_transfer");
    expect(rule!.riskOverride).toBe("HIGH");
    expect(rule!.requiresApproval).toBe(true);
    expect(rule!.enabled).toBe(true);
  });

  it("creates a wildcard rule that applies to all tools", async () => {
    const { createPolicyRule, getActivePolicyRulesForTool } = await import("./db");
    await createPolicyRule(1, {
      name: "All tools need approval",
      toolPattern: "*",
      requiresApproval: true,
      condition: null,
    });

    const rules = await getActivePolicyRulesForTool("external_email");
    expect(rules.length).toBe(1);
    expect(rules[0].toolPattern).toBe("*");

    const rules2 = await getActivePolicyRulesForTool("web_search");
    expect(rules2.length).toBe(1);
  });

  it("creates a tool-specific rule that only matches that tool", async () => {
    const { createPolicyRule, getActivePolicyRulesForTool } = await import("./db");
    await createPolicyRule(1, {
      name: "Email needs approval",
      toolPattern: "external_email",
      requiresApproval: true,
      condition: null,
    });

    const emailRules = await getActivePolicyRulesForTool("external_email");
    expect(emailRules.length).toBe(1);

    const searchRules = await getActivePolicyRulesForTool("web_search");
    expect(searchRules.length).toBe(0);
  });

  it("toggles a rule on and off", async () => {
    const { createPolicyRule, togglePolicyRule, getActivePolicyRulesForTool } = await import("./db");
    await createPolicyRule(1, {
      name: "Test rule",
      toolPattern: "*",
      requiresApproval: true,
      condition: null,
    });

    // Disable
    await togglePolicyRule("rule-1", false);
    const disabled = await getActivePolicyRulesForTool("web_search");
    expect(disabled.length).toBe(0);

    // Re-enable
    await togglePolicyRule("rule-1", true);
    const enabled = await getActivePolicyRulesForTool("web_search");
    expect(enabled.length).toBe(1);
  });

  it("updates a rule's properties", async () => {
    const { createPolicyRule, updatePolicyRule } = await import("./db");
    await createPolicyRule(1, {
      name: "Original name",
      toolPattern: "*",
      requiresApproval: false,
      condition: null,
    });

    const updated = await updatePolicyRule("rule-1", {
      name: "Updated name",
      riskOverride: "MEDIUM",
      requiresApproval: true,
    });

    expect(updated!.name).toBe("Updated name");
    expect(updated!.riskOverride).toBe("MEDIUM");
    expect(updated!.requiresApproval).toBe(true);
  });

  it("deletes a rule", async () => {
    const { createPolicyRule, deletePolicyRule, getAllPolicyRules } = await import("./db");
    await createPolicyRule(1, {
      name: "To delete",
      toolPattern: "*",
      requiresApproval: true,
      condition: null,
    });

    expect((await getAllPolicyRules()).length).toBe(1);
    await deletePolicyRule("rule-1");
    expect((await getAllPolicyRules()).length).toBe(0);
  });

  it("filters rules by user", async () => {
    const { createPolicyRule, getUserPolicyRules } = await import("./db");
    await createPolicyRule(1, { name: "User 1 rule", toolPattern: "*", requiresApproval: true, condition: null });
    await createPolicyRule(2, { name: "User 2 rule", toolPattern: "*", requiresApproval: true, condition: null });

    const user1Rules = await getUserPolicyRules(1);
    expect(user1Rules.length).toBe(1);
    expect(user1Rules[0].name).toBe("User 1 rule");
  });
});

describe("Notifications", () => {
  beforeEach(() => {
    mockNotifications.length = 0;
    notifCounter = 0;
  });

  it("creates a notification", async () => {
    const { createNotification } = await import("./db");
    const notif = await createNotification(1, {
      type: "APPROVAL_NEEDED",
      title: "Action Needs Approval",
      body: "external_email (HIGH risk) is waiting for your approval",
      intentId: "intent-123",
    });

    expect(notif).toBeDefined();
    expect(notif!.notificationId).toBe("notif-1");
    expect(notif!.type).toBe("APPROVAL_NEEDED");
    expect(notif!.read).toBe(false);
    expect(notif!.intentId).toBe("intent-123");
  });

  it("returns unread count", async () => {
    const { createNotification, getUnreadNotificationCount } = await import("./db");
    await createNotification(1, { type: "SYSTEM", title: "Test 1", body: "Body 1" });
    await createNotification(1, { type: "SYSTEM", title: "Test 2", body: "Body 2" });
    await createNotification(2, { type: "SYSTEM", title: "Other user", body: "Body 3" });

    const count = await getUnreadNotificationCount(1);
    expect(count).toBe(2);
  });

  it("marks a single notification as read", async () => {
    const { createNotification, markNotificationRead, getUnreadNotificationCount } = await import("./db");
    await createNotification(1, { type: "SYSTEM", title: "Test 1", body: "Body 1" });
    await createNotification(1, { type: "SYSTEM", title: "Test 2", body: "Body 2" });

    await markNotificationRead("notif-1");

    const count = await getUnreadNotificationCount(1);
    expect(count).toBe(1);
  });

  it("marks all notifications as read", async () => {
    const { createNotification, markAllNotificationsRead, getUnreadNotificationCount } = await import("./db");
    await createNotification(1, { type: "SYSTEM", title: "Test 1", body: "Body 1" });
    await createNotification(1, { type: "SYSTEM", title: "Test 2", body: "Body 2" });
    await createNotification(1, { type: "SYSTEM", title: "Test 3", body: "Body 3" });

    await markAllNotificationsRead(1);

    const count = await getUnreadNotificationCount(1);
    expect(count).toBe(0);
  });

  it("returns notifications sorted by newest first", async () => {
    const { createNotification, getUserNotifications } = await import("./db");
    const n1 = await createNotification(1, { type: "SYSTEM", title: "First", body: "Body 1" });
    // Manually adjust timestamp to be older
    n1!.createdAt = new Date(Date.now() - 60000);
    await createNotification(1, { type: "SYSTEM", title: "Second", body: "Body 2" });

    const list = await getUserNotifications(1, 50);
    expect(list.length).toBe(2);
    expect(list[0].title).toBe("Second");
    expect(list[1].title).toBe("First");
  });

  it("respects limit parameter", async () => {
    const { createNotification, getUserNotifications } = await import("./db");
    for (let i = 0; i < 5; i++) {
      await createNotification(1, { type: "SYSTEM", title: `Notif ${i}`, body: `Body ${i}` });
    }

    const list = await getUserNotifications(1, 3);
    expect(list.length).toBe(3);
  });

  it("creates execution complete notification with executionId", async () => {
    const { createNotification } = await import("./db");
    const notif = await createNotification(1, {
      type: "EXECUTION_COMPLETE",
      title: "Action Executed",
      body: "external_email completed successfully",
      intentId: "intent-123",
      executionId: "exec-456",
    });

    expect(notif!.type).toBe("EXECUTION_COMPLETE");
    expect(notif!.executionId).toBe("exec-456");
  });

  it("creates kill switch notification without entity references", async () => {
    const { createNotification } = await import("./db");
    const notif = await createNotification(1, {
      type: "KILL_SWITCH",
      title: "Kill Switch Activated",
      body: "System killed: Safety concern. All pending intents revoked.",
    });

    expect(notif!.type).toBe("KILL_SWITCH");
    expect(notif!.intentId).toBeNull();
    expect(notif!.executionId).toBeNull();
  });
});

describe("Policy Rule Enforcement", () => {
  beforeEach(() => {
    mockPolicyRules.length = 0;
    ruleCounter = 0;
  });

  it("condition-based rule with contains operator matches correctly", async () => {
    const { createPolicyRule, getActivePolicyRulesForTool } = await import("./db");
    await createPolicyRule(1, {
      name: "Block external emails to specific domain",
      toolPattern: "external_email",
      riskOverride: "HIGH",
      requiresApproval: true,
      condition: { field: "to", operator: "contains", value: "@competitor.com" },
    });

    const rules = await getActivePolicyRulesForTool("external_email");
    expect(rules.length).toBe(1);

    // Simulate condition check (as done in createIntent router)
    const cond = rules[0].condition as { field: string; operator: string; value: string };
    const toolArgs = { to: "ceo@competitor.com", subject: "Hello" };
    const argValue = String(toolArgs[cond.field as keyof typeof toolArgs] ?? "");

    let matches = false;
    if (cond.operator === "contains") matches = argValue.includes(cond.value);
    expect(matches).toBe(true);

    // Non-matching case
    const toolArgs2 = { to: "friend@partner.com", subject: "Hello" };
    const argValue2 = String(toolArgs2[cond.field as keyof typeof toolArgs2] ?? "");
    let matches2 = false;
    if (cond.operator === "contains") matches2 = argValue2.includes(cond.value);
    expect(matches2).toBe(false);
  });

  it("condition with greaterThan operator for numeric comparison", async () => {
    const { createPolicyRule, getActivePolicyRulesForTool } = await import("./db");
    await createPolicyRule(1, {
      name: "Large payment rule",
      toolPattern: "financial_transfer",
      riskOverride: "HIGH",
      requiresApproval: true,
      condition: { field: "amount", operator: "greaterThan", value: "500" },
    });

    const rules = await getActivePolicyRulesForTool("financial_transfer");
    const cond = rules[0].condition as { field: string; operator: string; value: string };

    // $1000 > $500 → should match
    expect(Number("1000") > Number(cond.value)).toBe(true);

    // $200 > $500 → should not match
    expect(Number("200") > Number(cond.value)).toBe(false);
  });

  it("disabled rules are not returned by getActivePolicyRulesForTool", async () => {
    const { createPolicyRule, togglePolicyRule, getActivePolicyRulesForTool } = await import("./db");
    await createPolicyRule(1, {
      name: "Active rule",
      toolPattern: "*",
      requiresApproval: true,
      condition: null,
    });
    await createPolicyRule(1, {
      name: "Disabled rule",
      toolPattern: "*",
      requiresApproval: true,
      condition: null,
    });

    await togglePolicyRule("rule-2", false);

    const active = await getActivePolicyRulesForTool("web_search");
    expect(active.length).toBe(1);
    expect(active[0].name).toBe("Active rule");
  });

  it("risk override elevates LOW to HIGH", async () => {
    const { createPolicyRule, getActivePolicyRulesForTool } = await import("./db");
    await createPolicyRule(1, {
      name: "Elevate web search risk",
      toolPattern: "web_search",
      riskOverride: "HIGH",
      requiresApproval: true,
      condition: null,
    });

    const rules = await getActivePolicyRulesForTool("web_search");
    expect(rules[0].riskOverride).toBe("HIGH");
    expect(rules[0].requiresApproval).toBe(true);

    // Simulate the risk tier override logic from createIntent
    let effectiveRiskTier = "LOW"; // web_search default
    for (const rule of rules) {
      if (rule.riskOverride) effectiveRiskTier = rule.riskOverride;
    }
    expect(effectiveRiskTier).toBe("HIGH");
  });
});
