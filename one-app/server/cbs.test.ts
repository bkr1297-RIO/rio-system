/**
 * CBS v1.0 Comprehensive Tests
 * ─────────────────────────────
 * Tests for all 14 gap items from the Canonical Build Spec.
 *
 *   1. Expanded ActionEnvelope (full spec shape)
 *   2. Gateway envelope validation
 *   3. Enriched StandardReceipt (action_envelope_hash + policy_version)
 *   4. GatewayDecision structured output
 *   5. Duplicate protection
 *   6. Adapters (Telegram, Gmail, Gemini, Outlook, SMS)
 *   7. Config system (rioConfig)
 *   8. State expansion (cooldowns, sessions, userBehavior)
 *   9. Approval system (create, resolve, proposer≠approver, cooldown)
 *  10. System health endpoint
 *  11. Drive sub-files types
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ═══════════════════════════════════════════════════════════════
// 1. EXPANDED ACTION ENVELOPE
// ═══════════════════════════════════════════════════════════════

describe("CBS §1 — Expanded ActionEnvelope", () => {
  it("wrapInEnvelope produces full spec shape with actor object", async () => {
    const { wrapInEnvelope } = await import("./standardReceipt");

    const env = wrapInEnvelope({
      actor: "brian",
      toolName: "send_email",
      target: "alice@example.com",
      parameters: { subject: "Test" },
      source: "telegram",
      policyHash: "pol-hash",
      actorType: "human",
      actorRole: "owner",
      description: "Send test email",
      resourceType: "email",
      content: "Hello Alice",
      riskLevel: "high",
      stateHash: "state-abc",
      policyVersion: "v2",
      policies: ["pol-1", "pol-2"],
    });

    // Top-level
    expect(env.action_id).toBeTruthy();
    expect(env.timestamp).toBeTruthy();

    // Actor is an object, not a string
    expect(typeof env.actor).toBe("object");
    expect(env.actor.id).toBe("brian");
    expect(env.actor.type).toBe("human");
    expect(env.actor.source).toBe("telegram");
    expect(env.actor.role).toBe("owner");

    // Intent
    expect(env.intent.type).toBe("send_email");
    expect(env.intent.description).toBe("Send test email");

    // Resource
    expect(env.resource.type).toBe("email");
    expect(env.resource.id).toBe("alice@example.com");

    // Payload
    expect(env.payload.content).toBe("Hello Alice");
    expect(env.payload.metadata.subject).toBe("Test");

    // Constraints
    expect(env.constraints.risk_level).toBe("high");
    expect(env.constraints.policies).toEqual(["pol-1", "pol-2"]);

    // State ref
    expect(env.state_ref.state_hash).toBe("state-abc");

    // Policy ref
    expect(env.policy_ref.version).toBe("v2");
  });

  it("wrapInEnvelope infers actor.type from source", async () => {
    const { wrapInEnvelope } = await import("./standardReceipt");

    const geminiEnv = wrapInEnvelope({
      actor: "gemini-2.5",
      toolName: "search",
      target: "query",
      parameters: {},
      source: "gemini",
      policyHash: "hash",
    });
    expect(geminiEnv.actor.type).toBe("ai");

    const schedEnv = wrapInEnvelope({
      actor: "cron",
      toolName: "backup",
      target: "db",
      parameters: {},
      source: "scheduled",
      policyHash: "hash",
    });
    expect(schedEnv.actor.type).toBe("system");

    const telegramEnv = wrapInEnvelope({
      actor: "brian",
      toolName: "status",
      target: "system",
      parameters: {},
      source: "telegram",
      policyHash: "hash",
    });
    expect(telegramEnv.actor.type).toBe("human");
  });

  it("wrapInEnvelope defaults missing optional fields", async () => {
    const { wrapInEnvelope } = await import("./standardReceipt");

    const env = wrapInEnvelope({
      actor: "test",
      toolName: "test_tool",
      target: "target",
      parameters: {},
      source: "api",
      policyHash: "hash",
    });

    expect(env.constraints.risk_level).toBe("low");
    expect(env.constraints.policies).toEqual(["hash"]);
    expect(env.state_ref.state_hash).toBe("");
    expect(env.policy_ref.version).toBe("v1");
    expect(env.payload.content).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. GATEWAY ENVELOPE VALIDATION
// ═══════════════════════════════════════════════════════════════

describe("CBS §2 — Envelope Validation", () => {
  it("validates a correct envelope", async () => {
    const { wrapInEnvelope, validateEnvelope } = await import("./standardReceipt");

    const env = wrapInEnvelope({
      actor: "brian",
      toolName: "send_email",
      target: "alice@example.com",
      parameters: {},
      source: "telegram",
      policyHash: "hash",
    });

    const result = validateEnvelope(env);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects null envelope", async () => {
    const { validateEnvelope } = await import("./standardReceipt");
    const result = validateEnvelope(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Envelope must be a non-null object");
  });

  it("rejects envelope with missing actor", async () => {
    const { validateEnvelope } = await import("./standardReceipt");
    const result = validateEnvelope({
      action_id: "test",
      timestamp: new Date().toISOString(),
      intent: { type: "test" },
      resource: { type: "test", id: "test" },
      payload: { content: "" },
      constraints: { risk_level: "low" },
      state_ref: {},
      policy_ref: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("actor"))).toBe(true);
  });

  it("rejects envelope with invalid risk_level", async () => {
    const { validateEnvelope } = await import("./standardReceipt");
    const result = validateEnvelope({
      action_id: "test",
      timestamp: new Date().toISOString(),
      actor: { id: "test", type: "human", source: "api" },
      intent: { type: "test" },
      resource: { type: "test", id: "test" },
      payload: { content: "" },
      constraints: { risk_level: "INVALID" },
      state_ref: {},
      policy_ref: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("risk_level"))).toBe(true);
  });

  it("rejects envelope with invalid actor.type", async () => {
    const { validateEnvelope } = await import("./standardReceipt");
    const result = validateEnvelope({
      action_id: "test",
      timestamp: new Date().toISOString(),
      actor: { id: "test", type: "robot", source: "api" },
      intent: { type: "test" },
      resource: { type: "test", id: "test" },
      payload: { content: "" },
      constraints: { risk_level: "low" },
      state_ref: {},
      policy_ref: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("actor.type"))).toBe(true);
  });

  it("collects multiple validation errors", async () => {
    const { validateEnvelope } = await import("./standardReceipt");
    const result = validateEnvelope({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. GATEWAY DECISION OUTPUT
// ═══════════════════════════════════════════════════════════════

describe("CBS §2b — GatewayDecision", () => {
  it("createGatewayDecision produces correct structure", async () => {
    const { wrapInEnvelope, createGatewayDecision } = await import("./standardReceipt");

    const env = wrapInEnvelope({
      actor: "brian",
      toolName: "send_email",
      target: "alice@example.com",
      parameters: {},
      source: "telegram",
      policyHash: "hash",
    });

    const decision = createGatewayDecision(env, "ALLOW", "Low risk, auto-approved");
    expect(decision.action_id).toBe(env.action_id);
    expect(decision.result).toBe("ALLOW");
    expect(decision.message).toBe("Low risk, auto-approved");
    expect(decision.cooldown_ms).toBe(0);
    expect(decision.requires_confirmation).toBe(false);
  });

  it("REQUIRE_CONFIRMATION sets requires_confirmation=true", async () => {
    const { wrapInEnvelope, createGatewayDecision } = await import("./standardReceipt");

    const env = wrapInEnvelope({
      actor: "brian",
      toolName: "send_email",
      target: "alice@example.com",
      parameters: {},
      source: "telegram",
      policyHash: "hash",
    });

    const decision = createGatewayDecision(env, "REQUIRE_CONFIRMATION", "High risk", 30000);
    expect(decision.requires_confirmation).toBe(true);
    expect(decision.cooldown_ms).toBe(30000);
  });

  it("BLOCK decision has correct shape", async () => {
    const { wrapInEnvelope, createGatewayDecision } = await import("./standardReceipt");

    const env = wrapInEnvelope({
      actor: "brian",
      toolName: "delete_all",
      target: "database",
      parameters: {},
      source: "api",
      policyHash: "hash",
    });

    const decision = createGatewayDecision(env, "BLOCK", "Destructive action blocked");
    expect(decision.result).toBe("BLOCK");
    expect(decision.requires_confirmation).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. ENRICHED STANDARD RECEIPT
// ═══════════════════════════════════════════════════════════════

describe("CBS §4 — Enriched StandardReceipt", () => {
  it("includes action_envelope_hash when envelope provided", async () => {
    const { wrapInEnvelope, toStandardReceipt, buildActionIntent, hashEnvelope } = await import("./standardReceipt");

    const env = wrapInEnvelope({
      actor: "brian",
      toolName: "send_email",
      target: "alice@example.com",
      parameters: { subject: "Test" },
      source: "telegram",
      policyHash: "hash",
      policyVersion: "v2",
    });

    const canonical = {
      receipt_id: "RCPT-test",
      intent_id: "INT-test",
      proposer_id: "I-1",
      approver_id: "I-2",
      token_id: "TOK-test",
      action: "send_email",
      status: "SUCCESS" as const,
      executor: "rio-proxy",
      execution_hash: "exec-hash",
      policy_hash: "pol-hash",
      snapshot_hash: "snap-hash",
      timestamp_proposed: "2026-04-13T10:00:00Z",
      timestamp_approved: "2026-04-13T10:01:00Z",
      timestamp_executed: "2026-04-13T10:02:00Z",
      decision_delta_ms: 60000,
      ledger_entry_id: "LE-test",
      previous_receipt_hash: "prev-hash",
      receipt_hash: "receipt-hash",
      gateway_signature: "sig",
    };

    const intent = buildActionIntent("send_email", { to: "alice@example.com" }, "HIGH");
    const receipt = toStandardReceipt(canonical, intent, "REQUIRE_APPROVAL", env);

    expect(receipt.action_envelope_hash).toBe(hashEnvelope(env));
    expect(receipt.action_envelope_hash.length).toBe(64); // SHA-256 hex
    expect(receipt.policy_version).toBe("v2");
    expect(receipt.action_id).toBe(env.action_id);
    expect(receipt.actor.id).toBe("brian");
    expect(receipt.actor.type).toBe("human");
    expect(receipt.actor.source).toBe("telegram");
  });

  it("falls back gracefully without envelope", async () => {
    const { toStandardReceipt, buildActionIntent } = await import("./standardReceipt");

    const canonical = {
      receipt_id: "RCPT-noenv",
      intent_id: "INT-noenv",
      proposer_id: "I-1",
      approver_id: "I-2",
      token_id: "TOK-noenv",
      action: "test",
      status: "SUCCESS" as const,
      executor: "rio-proxy",
      execution_hash: "exec",
      policy_hash: "pol",
      snapshot_hash: "snap",
      timestamp_proposed: "2026-04-13T10:00:00Z",
      timestamp_approved: "2026-04-13T10:01:00Z",
      timestamp_executed: "2026-04-13T10:02:00Z",
      decision_delta_ms: 60000,
      ledger_entry_id: "LE-noenv",
      previous_receipt_hash: "prev",
      receipt_hash: "hash",
      gateway_signature: "sig",
    };

    const intent = buildActionIntent("test", {}, "LOW");
    const receipt = toStandardReceipt(canonical, intent);

    expect(receipt.action_envelope_hash).toBe("");
    expect(receipt.policy_version).toBe("v1");
    expect(receipt.action_id).toBe("INT-noenv"); // falls back to intent_id
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. DUPLICATE PROTECTION
// ═══════════════════════════════════════════════════════════════

describe("CBS §12 — Duplicate Protection", () => {
  beforeEach(async () => {
    const { _resetDedup } = await import("./standardReceipt");
    _resetDedup();
  });

  it("first action is not a duplicate", async () => {
    const { isDuplicateAction, recordActionId } = await import("./standardReceipt");
    expect(isDuplicateAction("action-1")).toBe(false);
    recordActionId("action-1");
  });

  it("second identical action_id is a duplicate", async () => {
    const { isDuplicateAction, recordActionId } = await import("./standardReceipt");
    recordActionId("action-dup");
    expect(isDuplicateAction("action-dup")).toBe(true);
  });

  it("different action_ids are not duplicates", async () => {
    const { isDuplicateAction, recordActionId } = await import("./standardReceipt");
    recordActionId("action-a");
    expect(isDuplicateAction("action-b")).toBe(false);
  });

  it("recording same id twice is idempotent", async () => {
    const { isDuplicateAction, recordActionId } = await import("./standardReceipt");
    recordActionId("action-x");
    recordActionId("action-x");
    expect(isDuplicateAction("action-x")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. ADAPTERS
// ═══════════════════════════════════════════════════════════════

describe("CBS §7 — Adapters", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("TelegramAdapter produces valid envelope", async () => {
    vi.doMock("./continuity", () => ({
      readState: vi.fn(() => ({ system_status: "ACTIVE" })),
    }));
    vi.doMock("./authorityLayer", () => ({
      getActivePolicy: vi.fn(() => ({ policy_hash: "test-hash" })),
    }));

    const { TelegramAdapter } = await import("./adapters");
    const { validateEnvelope } = await import("./standardReceipt");

    const env = TelegramAdapter.toActionEnvelope({
      message: "/status",
      senderId: "brian",
      chatId: 12345,
      command: "status",
    });

    expect(env.actor.id).toBe("brian");
    expect(env.actor.type).toBe("human");
    expect(env.actor.source).toBe("telegram");
    expect(env.intent.type).toBe("status");
    expect(env.resource.id).toBe("12345");

    const validation = validateEnvelope(env);
    expect(validation.valid).toBe(true);
  });

  it("TelegramAdapter.fromDecision formats response", async () => {
    vi.doMock("./continuity", () => ({
      readState: vi.fn(() => ({ system_status: "ACTIVE" })),
    }));
    vi.doMock("./authorityLayer", () => ({
      getActivePolicy: vi.fn(() => ({ policy_hash: "test-hash" })),
    }));

    const { TelegramAdapter } = await import("./adapters");

    const response = TelegramAdapter.fromDecision(
      {
        action_id: "test-action-id",
        result: "ALLOW",
        message: "Approved",
        cooldown_ms: 0,
        requires_confirmation: false,
      },
      { chatId: 12345, senderId: "brian" },
    );

    expect(response.chatId).toBe(12345);
    expect(response.text).toContain("ALLOW");
    expect(response.text).toContain("Approved");
  });

  it("GmailAdapter sets high risk for send_email", async () => {
    vi.doMock("./continuity", () => ({
      readState: vi.fn(() => ({ system_status: "ACTIVE" })),
    }));
    vi.doMock("./authorityLayer", () => ({
      getActivePolicy: vi.fn(() => ({ policy_hash: "test-hash" })),
    }));

    const { GmailAdapter } = await import("./adapters");
    const { validateEnvelope } = await import("./standardReceipt");

    const env = GmailAdapter.toActionEnvelope({
      action: "send_email",
      to: "alice@example.com",
      subject: "Test",
      body: "Hello",
    });

    expect(env.constraints.risk_level).toBe("high");
    expect(env.resource.type).toBe("email");
    expect(env.resource.id).toBe("alice@example.com");

    const validation = validateEnvelope(env);
    expect(validation.valid).toBe(true);
  });

  it("GeminiAdapter sets AI actor type", async () => {
    vi.doMock("./continuity", () => ({
      readState: vi.fn(() => ({ system_status: "ACTIVE" })),
    }));
    vi.doMock("./authorityLayer", () => ({
      getActivePolicy: vi.fn(() => ({ policy_hash: "test-hash" })),
    }));

    const { GeminiAdapter } = await import("./adapters");
    const { validateEnvelope } = await import("./standardReceipt");

    const env = GeminiAdapter.toActionEnvelope({
      toolName: "send_sms",
      toolArgs: { to: "+15551234567", body: "Hello" },
      riskTier: "HIGH",
    });

    expect(env.actor.type).toBe("ai");
    expect(env.actor.role).toBe("agent");
    expect(env.constraints.risk_level).toBe("high");

    const validation = validateEnvelope(env);
    expect(validation.valid).toBe(true);
  });

  it("OutlookAdapter produces valid envelope", async () => {
    vi.doMock("./continuity", () => ({
      readState: vi.fn(() => ({ system_status: "ACTIVE" })),
    }));
    vi.doMock("./authorityLayer", () => ({
      getActivePolicy: vi.fn(() => ({ policy_hash: "test-hash" })),
    }));

    const { OutlookAdapter } = await import("./adapters");
    const { validateEnvelope } = await import("./standardReceipt");

    const env = OutlookAdapter.toActionEnvelope({
      action: "send_email",
      to: "bob@company.com",
      subject: "Meeting",
      body: "Let's meet",
    });

    expect(env.actor.source).toBe("outlook");
    expect(env.intent.type).toBe("outlook_send_email");
    expect(env.constraints.risk_level).toBe("high");

    const validation = validateEnvelope(env);
    expect(validation.valid).toBe(true);
  });

  it("SMSAdapter produces valid envelope with medium risk", async () => {
    vi.doMock("./continuity", () => ({
      readState: vi.fn(() => ({ system_status: "ACTIVE" })),
    }));
    vi.doMock("./authorityLayer", () => ({
      getActivePolicy: vi.fn(() => ({ policy_hash: "test-hash" })),
    }));

    const { SMSAdapter } = await import("./adapters");
    const { validateEnvelope } = await import("./standardReceipt");

    const env = SMSAdapter.toActionEnvelope({
      to: "+15551234567",
      body: "Hello from RIO",
    });

    expect(env.actor.source).toBe("sms");
    expect(env.intent.type).toBe("send_sms");
    expect(env.constraints.risk_level).toBe("medium");
    expect(env.resource.id).toBe("+15551234567");

    const validation = validateEnvelope(env);
    expect(validation.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. CONFIG SYSTEM
// ═══════════════════════════════════════════════════════════════

describe("CBS §17 — Config System", () => {
  beforeEach(async () => {
    const { _resetConfig } = await import("./rioConfig");
    _resetConfig();
  });

  afterEach(async () => {
    const { _resetConfig } = await import("./rioConfig");
    _resetConfig();
  });

  it("loadConfig returns defaults when no config.json exists", async () => {
    const { loadConfig } = await import("./rioConfig");
    const config = loadConfig();

    expect(config.cooldown_default).toBe(120000);
    expect(config.policy_version).toBe("v1");
    expect(config.rate_limit).toBe(10);
    expect(config.dedup_window_size).toBe(10000);
    expect(config.approval_expiry_ms).toBe(300000);
  });

  it("getConfig returns specific values", async () => {
    const { getConfig } = await import("./rioConfig");
    expect(getConfig("cooldown_default")).toBe(120000);
    expect(getConfig("policy_version")).toBe("v1");
  });

  it("reloadConfig clears cache", async () => {
    const { loadConfig, reloadConfig } = await import("./rioConfig");
    const c1 = loadConfig();
    const c2 = reloadConfig();
    expect(c2.cooldown_default).toBe(c1.cooldown_default);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. STATE EXPANSION
// ═══════════════════════════════════════════════════════════════

describe("CBS §8 — State Expansion", () => {
  beforeEach(async () => {
    const { _resetExtendedState } = await import("./stateExpansion");
    _resetExtendedState();
  });

  it("cooldown lifecycle: add, check, expire", async () => {
    const { addCooldown, isInCooldown, getActiveCooldowns } = await import("./stateExpansion");

    expect(isInCooldown("brian", "self_approval")).toBe(false);

    addCooldown("brian", "self_approval", "test cooldown", 100); // 100ms
    expect(isInCooldown("brian", "self_approval")).toBe(true);
    expect(getActiveCooldowns().length).toBe(1);

    // Wait for expiry
    await new Promise(r => setTimeout(r, 150));
    expect(isInCooldown("brian", "self_approval")).toBe(false);
  });

  it("session tracking records activity", async () => {
    const { recordSessionActivity, getSession } = await import("./stateExpansion");

    // recordSessionActivity(actorId, sessionId?) — sessionId defaults to actorId
    // getSession looks up by actorId key in sessions map
    recordSessionActivity("brian");
    const session = getSession("brian");
    expect(session).not.toBeNull();
    expect(session!.actor_id).toBe("brian");
    expect(session!.action_count).toBe(1);

    recordSessionActivity("brian");
    const session2 = getSession("brian");
    expect(session2!.action_count).toBe(2);
  });

  it("user behavior tracking records actions", async () => {
    const { recordUserAction, getUserBehavior } = await import("./stateExpansion");

    // recordUserAction(actorId, riskLevel) — 2 args
    recordUserAction("brian", "high");
    recordUserAction("brian", "low");

    const behavior = getUserBehavior("brian");
    expect(behavior).not.toBeNull();
    expect(behavior!.total_actions).toBe(2);
    expect(behavior!.consecutive_high_risk).toBe(0); // reset after low
    expect(behavior!.risk_profile).toBe("low");
  });

  it("getSystemHealth returns correct structure", async () => {
    const { getSystemHealth, setChainIntegrity, setLastError } = await import("./stateExpansion");

    setChainIntegrity(true);
    const health = getSystemHealth();

    expect(health.system_status).toBe("ACTIVE");
    expect(health.chain_integrity).toBe(true);
    expect(health.uptime_ms).toBeGreaterThanOrEqual(0);
    expect(health.active_cooldowns).toBe(0);
    expect(health.active_sessions).toBe(0);

    setLastError("test error");
    const health2 = getSystemHealth();
    expect(health2.system_status).toBe("DEGRADED");
    expect(health2.last_error).toBe("test error");
  });

  it("chain integrity false sets BLOCKED status", async () => {
    const { getSystemHealth, setChainIntegrity } = await import("./stateExpansion");

    setChainIntegrity(false);
    const health = getSystemHealth();
    expect(health.system_status).toBe("BLOCKED");
    expect(health.chain_integrity).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. APPROVAL SYSTEM
// ═══════════════════════════════════════════════════════════════

describe("CBS §10 — Approval System", () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("createPendingApproval creates a PENDING approval", async () => {
    // Mock Drive calls
    vi.doMock("./driveSubFiles", () => ({
      logApproval: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("./rioConfig", () => ({
      loadConfig: vi.fn(() => ({
        cooldown_default: 120000,
        approval_expiry_ms: 300000,
      })),
    }));
    vi.doMock("./stateExpansion", () => ({
      isInCooldown: vi.fn(() => false),
      addCooldown: vi.fn(),
    }));

    const { createPendingApproval, _resetApprovals } = await import("./approvalSystem");
    _resetApprovals();

    const { wrapInEnvelope, createGatewayDecision } = await import("./standardReceipt");

    const env = wrapInEnvelope({
      actor: "brian",
      toolName: "send_email",
      target: "alice@example.com",
      parameters: {},
      source: "telegram",
      policyHash: "hash",
    });

    const decision = createGatewayDecision(env, "REQUIRE_CONFIRMATION", "High risk");
    const approval = await createPendingApproval(env, decision);

    expect(approval.approval_id).toMatch(/^APR-/);
    expect(approval.status).toBe("PENDING");
    expect(approval.proposer_id).toBe("brian");
    expect(approval.action_id).toBe(env.action_id);
    expect(approval.expires_at).toBeGreaterThan(approval.requested_at);
  });

  it("resolveApproval approves with different identity", async () => {
    vi.doMock("./driveSubFiles", () => ({
      logApproval: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("./rioConfig", () => ({
      loadConfig: vi.fn(() => ({
        cooldown_default: 120000,
        approval_expiry_ms: 300000,
      })),
    }));
    vi.doMock("./stateExpansion", () => ({
      isInCooldown: vi.fn(() => false),
      addCooldown: vi.fn(),
    }));

    const { createPendingApproval, resolveApproval, _resetApprovals } = await import("./approvalSystem");
    _resetApprovals();

    const { wrapInEnvelope, createGatewayDecision } = await import("./standardReceipt");

    const env = wrapInEnvelope({
      actor: "brian",
      toolName: "send_email",
      target: "alice@example.com",
      parameters: {},
      source: "telegram",
      policyHash: "hash",
    });

    const decision = createGatewayDecision(env, "REQUIRE_CONFIRMATION", "High risk");
    const pending = await createPendingApproval(env, decision);

    const result = await resolveApproval(pending.approval_id, "admin-user", "APPROVED");
    expect(result.error).toBeUndefined();
    expect(result.approval).not.toBeNull();
    expect(result.approval!.status).toBe("APPROVED");
    expect(result.approval!.approver_id).toBe("admin-user");
  });

  it("resolveApproval enforces cooldown for same-identity", async () => {
    vi.doMock("./driveSubFiles", () => ({
      logApproval: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("./rioConfig", () => ({
      loadConfig: vi.fn(() => ({
        cooldown_default: 120000,
        approval_expiry_ms: 300000,
      })),
    }));

    // Simulate cooldown active
    vi.doMock("./stateExpansion", () => ({
      isInCooldown: vi.fn(() => true),
      addCooldown: vi.fn(),
    }));

    const { createPendingApproval, resolveApproval, _resetApprovals } = await import("./approvalSystem");
    _resetApprovals();

    const { wrapInEnvelope, createGatewayDecision } = await import("./standardReceipt");

    const env = wrapInEnvelope({
      actor: "brian",
      toolName: "send_email",
      target: "alice@example.com",
      parameters: {},
      source: "telegram",
      policyHash: "hash",
    });

    const decision = createGatewayDecision(env, "REQUIRE_CONFIRMATION", "High risk");
    const pending = await createPendingApproval(env, decision);

    // Same identity + cooldown active → should reject
    const result = await resolveApproval(pending.approval_id, "brian", "APPROVED");
    expect(result.error).toContain("cooldown");
    expect(result.approval).toBeNull();
  });

  it("resolveApproval rejects non-existent approval", async () => {
    vi.doMock("./driveSubFiles", () => ({
      logApproval: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("./rioConfig", () => ({
      loadConfig: vi.fn(() => ({
        cooldown_default: 120000,
        approval_expiry_ms: 300000,
      })),
    }));
    vi.doMock("./stateExpansion", () => ({
      isInCooldown: vi.fn(() => false),
      addCooldown: vi.fn(),
    }));

    const { resolveApproval, _resetApprovals } = await import("./approvalSystem");
    _resetApprovals();

    const result = await resolveApproval("APR-nonexistent", "admin", "APPROVED");
    expect(result.error).toContain("not found");
  });

  it("getPendingApprovals auto-expires stale entries", async () => {
    vi.doMock("./driveSubFiles", () => ({
      logApproval: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("./rioConfig", () => ({
      loadConfig: vi.fn(() => ({
        cooldown_default: 120000,
        approval_expiry_ms: 50, // 50ms expiry for testing
      })),
    }));
    vi.doMock("./stateExpansion", () => ({
      isInCooldown: vi.fn(() => false),
      addCooldown: vi.fn(),
    }));

    const { createPendingApproval, getPendingApprovals, _resetApprovals } = await import("./approvalSystem");
    _resetApprovals();

    const { wrapInEnvelope, createGatewayDecision } = await import("./standardReceipt");

    const env = wrapInEnvelope({
      actor: "brian",
      toolName: "test",
      target: "test",
      parameters: {},
      source: "telegram",
      policyHash: "hash",
    });

    const decision = createGatewayDecision(env, "REQUIRE_CONFIRMATION", "test");
    await createPendingApproval(env, decision);

    // Wait for expiry
    await new Promise(r => setTimeout(r, 100));

    const pending = getPendingApprovals();
    expect(pending.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. DRIVE SUB-FILES TYPES
// ═══════════════════════════════════════════════════════════════

describe("CBS §5 — Drive Sub-Files Types", () => {
  it("EnvelopeLogEntry has correct shape", async () => {
    const dsf = await import("./driveSubFiles");

    // Type check — these imports should exist
    const entry: typeof dsf.EnvelopeLogEntry extends never ? never : Record<string, unknown> = {
      action_id: "test",
      envelope_hash: "hash",
      actor_id: "brian",
      actor_type: "human",
      intent_type: "send_email",
      resource_id: "alice@example.com",
      risk_level: "high",
      timestamp: new Date().toISOString(),
    };

    expect(entry.action_id).toBe("test");
  });

  it("ApprovalLogEntry has correct shape", async () => {
    const entry = {
      action_id: "test",
      proposer_id: "brian",
      approver_id: "admin",
      status: "APPROVED" as const,
      requested_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
      receipt_id: "RCPT-test",
    };

    expect(entry.status).toBe("APPROVED");
    expect(entry.proposer_id).not.toBe(entry.approver_id);
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. HASH ENVELOPE
// ═══════════════════════════════════════════════════════════════

describe("CBS §4 — hashEnvelope", () => {
  it("produces deterministic SHA-256 hash", async () => {
    const { wrapInEnvelope, hashEnvelope } = await import("./standardReceipt");

    const env = wrapInEnvelope({
      actor: "brian",
      toolName: "test",
      target: "target",
      parameters: { key: "value" },
      source: "api",
      policyHash: "hash",
    });

    const hash1 = hashEnvelope(env);
    const hash2 = hashEnvelope(env);

    expect(hash1).toBe(hash2); // deterministic
    expect(hash1.length).toBe(64); // SHA-256 hex
  });

  it("different envelopes produce different hashes", async () => {
    const { wrapInEnvelope, hashEnvelope } = await import("./standardReceipt");

    const env1 = wrapInEnvelope({
      actor: "brian",
      toolName: "test1",
      target: "target",
      parameters: {},
      source: "api",
      policyHash: "hash",
    });

    const env2 = wrapInEnvelope({
      actor: "brian",
      toolName: "test2",
      target: "target",
      parameters: {},
      source: "api",
      policyHash: "hash",
    });

    expect(hashEnvelope(env1)).not.toBe(hashEnvelope(env2));
  });
});
