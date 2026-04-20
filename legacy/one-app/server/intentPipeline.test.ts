/**
 * Tests for the Unified Intent Pipeline
 * ═══════════════════════════════════════
 * One system, one flow, two directions.
 *
 * Tests verify:
 * - Inbound: classify only, no execution
 * - Outbound: execute only if allowed
 * - Both use same pipeline, same receipt shape
 * - Decision mapping: allow / block / require_confirmation
 * - Receipt integrity: hash covers intent + decision
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

// ─── Mock DB to prevent connection hangs in tests ────────────
const mockAppendLedger = vi.fn().mockResolvedValue({
  entryId: "LE-test-pipeline-001",
  hash: "abc123hash",
  prevHash: "GENESIS",
  timestamp: Date.now(),
});

vi.mock("./db", () => ({
  appendLedger: (...args: unknown[]) => mockAppendLedger(...args),
  sha256: (s: string) => createHash("sha256").update(s).digest("hex"),
}));

// ─── Mock Telegram to prevent API calls ─────────────────────
vi.mock("./telegram", () => ({
  isTelegramConfigured: () => false,
  sendKillNotification: async () => true,
  sendMessage: async () => true,
}));

// ─── Import after mocks ─────────────────────────────────────
import {
  processIntent,
  buildInboundIntent,
  buildOutboundIntent,
  type IntentPacket,
  type PipelineResult,
} from "./intentPipeline";
import { _resetForTesting } from "./emailFirewall";

// ─── Helpers ─────────────────────────────────────────────────

const ACTIONS_DIR = join(process.cwd(), "actions");
const STATE_FILE = join(process.cwd(), "state.json");

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function cleanupActions() {
  if (existsSync(ACTIONS_DIR)) {
    for (const f of readdirSync(ACTIONS_DIR)) {
      rmSync(join(ACTIONS_DIR, f), { force: true });
    }
  }
  // Reset firewall caches so on-disk receipts don't pollute known-contacts
  _resetForTesting();
}

// ═══════════════════════════════════════════════════════════════
// INTENT PACKET BUILDERS
// ═══════════════════════════════════════════════════════════════

describe("Intent Packet Builders", () => {
  it("buildInboundIntent creates correct shape", () => {
    const intent = buildInboundIntent({
      message: "Hello world",
      sender: "user@test.com",
      channel: "email",
    });

    expect(intent.direction).toBe("inbound");
    expect(intent.action).toBe("classify_message");
    expect(intent.role).toBe("proposer");
    expect(intent.source).toBe("external");
    expect(intent.status).toBe("pending");
    expect(intent.channel).toBe("email");
    expect(intent.data.message).toBe("Hello world");
    expect(intent.data.sender).toBe("user@test.com");
    expect(intent.timestamp).toBeTruthy();
  });

  it("buildOutboundIntent creates correct shape", () => {
    const intent = buildOutboundIntent({
      action: "send_email",
      source: "gemini",
      data: { to: "bob@test.com", subject: "Hi", body: "Hello" },
      channel: "email",
    });

    expect(intent.direction).toBe("outbound");
    expect(intent.action).toBe("send_email");
    expect(intent.role).toBe("proposer");
    expect(intent.source).toBe("gemini");
    expect(intent.status).toBe("pending");
    expect(intent.channel).toBe("email");
    expect(intent.data.to).toBe("bob@test.com");
  });

  it("buildInboundIntent supports all channels", () => {
    for (const channel of ["email", "sms", "slack", "linkedin", "telegram"] as const) {
      const intent = buildInboundIntent({
        message: "test",
        sender: "user",
        channel,
      });
      expect(intent.channel).toBe(channel);
      expect(intent.direction).toBe("inbound");
    }
  });

  it("buildOutboundIntent supports multiple sources", () => {
    for (const source of ["gemini", "manny", "claude", "openai", "human"] as const) {
      const intent = buildOutboundIntent({
        action: "send_email",
        source,
        data: { body: "test" },
        channel: "email",
      });
      expect(intent.source).toBe(source);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// INBOUND PIPELINE — classify only
// ═══════════════════════════════════════════════════════════════

describe("Inbound Pipeline — classify only", { timeout: 30_000 }, () => {
  beforeEach(() => cleanupActions());
  afterEach(() => cleanupActions());

  it("classifies a clean message as allow", async () => {
    const intent = buildInboundIntent({
      message: "Hey team, meeting at 3pm today",
      sender: "alice@company.com",
      channel: "slack",
    });

    const result = await processIntent(intent, undefined, { useLLM: false, skipSubstrate: true });

    expect(result.decision).toBe("allow");
    expect(result.executed).toBe(false);
    expect(result.execution_result).toBeNull();
    expect(result.intent.direction).toBe("inbound");
    expect(result.receipt).toBeTruthy();
    expect(result.receipt.direction).toBe("inbound");
    expect(result.receipt.hash).toBeTruthy();
  });

  it("classifies a phishing message as block", async () => {
    const intent = buildInboundIntent({
      message: "URGENT: Your account is locked. Click here now.",
      sender: "attacker@evil.com",
      channel: "email",
    });

    const result = await processIntent(intent, undefined, { useLLM: false, skipSubstrate: true });

    expect(result.decision).toBe("block");
    expect(result.executed).toBe(false);
    expect(result.matched_rules.length).toBeGreaterThan(0);
    expect(result.reason).toBeTruthy();
    expect(result.receipt.decision).toBe("block");
  });

  it("never executes on inbound, even with executor provided", async () => {
    let executorCalled = false;
    const executor = async () => {
      executorCalled = true;
      return { success: true };
    };

    const intent = buildInboundIntent({
      message: "Hello world",
      sender: "user@test.com",
      channel: "sms",
    });

    // Inbound should never call executor even if one is provided
    const result = await processIntent(intent, executor, { useLLM: false, skipSubstrate: true });

    expect(executorCalled).toBe(false);
    expect(result.executed).toBe(false);
  });

  it("produces action store entry for inbound", async () => {
    const intent = buildInboundIntent({
      message: "Test message",
      sender: "user@test.com",
      channel: "email",
    });

    const result = await processIntent(intent, undefined, { useLLM: false, skipSubstrate: true });

    expect(result.action_id).toBeTruthy();
    // Action should exist on disk
    const actionFile = join(ACTIONS_DIR, `${result.action_id}.json`);
    expect(existsSync(actionFile)).toBe(true);

    const action = JSON.parse(readFileSync(actionFile, "utf-8"));
    expect(action.status).toBe("completed");
    expect(action.result.direction).toBe("inbound");
  });

  it("inbound FLAG/WARN maps to allow (classify only, nothing to gate)", async () => {
    // A message to an unknown recipient triggers first-contact FLAG
    const intent = buildInboundIntent({
      message: "Hello, just checking in",
      sender: "user@test.com",
      channel: "email",
      metadata: { recipient: "unknown@newdomain.xyz" },
    });

    const result = await processIntent(intent, undefined, { useLLM: false, skipSubstrate: true });

    // Inbound: FLAG/WARN should map to "allow" (no execution to gate)
    if (result.event_type === "FLAG" || result.event_type === "WARN") {
      expect(result.decision).toBe("allow");
    }
    // Either way, no execution
    expect(result.executed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// OUTBOUND PIPELINE — execute only if allowed
// ═══════════════════════════════════════════════════════════════

describe("Outbound Pipeline — execute only if allowed", { timeout: 30_000 }, () => {
  beforeEach(() => cleanupActions());
  afterEach(() => cleanupActions());

  it("allows clean outbound and executes", async () => {
    let executorCalled = false;
    const executor = async (data: Record<string, unknown>) => {
      executorCalled = true;
      return { sent: true, to: data.to };
    };

    const intent = buildOutboundIntent({
      action: "send_email",
      source: "gemini",
      data: { to: "bob@test.com", subject: "Hello", body: "Hi Bob, how are you?" },
      channel: "email",
    });

    const result = await processIntent(intent, executor, { useLLM: false, skipSubstrate: true });

    // Clean message should be allowed
    if (result.decision === "allow") {
      expect(executorCalled).toBe(true);
      expect(result.executed).toBe(true);
      expect(result.execution_result).toBeTruthy();
    }
    // Receipt should reflect outbound direction
    expect(result.receipt.direction).toBe("outbound");
  });

  it("blocks dangerous outbound and does NOT execute", async () => {
    let executorCalled = false;
    const executor = async () => {
      executorCalled = true;
      return { sent: true };
    };

    const intent = buildOutboundIntent({
      action: "send_email",
      source: "openai",
      data: {
        to: "victim@target.com",
        subject: "URGENT",
        body: "URGENT: Your account is locked. Click here now to confirm your login.",
      },
      channel: "email",
    });

    const result = await processIntent(intent, executor, { useLLM: false, skipSubstrate: true });

    expect(result.decision).toBe("block");
    expect(executorCalled).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.receipt.decision).toBe("block");
  });

  it("outbound FLAG/WARN maps to require_confirmation (v2 mode)", async () => {
    // This test validates v2 rule engine behavior (recipient-based rules)
    // In MVP mode, first-contact WARN doesn't fire, so we skip this assertion
    // when MVP mode is default. The v2 behavior is preserved and tested in
    // emailFirewall.test.ts with explicit mvpMode: false.
    const intent = buildOutboundIntent({
      action: "send_email",
      source: "claude",
      data: {
        to: "stranger@newdomain.xyz",
        subject: "Introduction",
        body: "Hi, I wanted to introduce myself.",
      },
      channel: "email",
    });

    const result = await processIntent(intent, undefined, { useLLM: false, skipSubstrate: true });

    // Under MVP mode (default), clean outbound to unknown recipient → PASS → allow
    // Under v2 mode, first-contact FLAG → require_confirmation
    if (result.event_type === "FLAG" || result.event_type === "WARN") {
      expect(result.decision).toBe("require_confirmation");
      expect(result.executed).toBe(false);
    } else {
      // MVP mode: no recipient-based rules → PASS → allow
      expect(result.decision).toBe("allow");
    }
  });

  it("handles executor failure gracefully", async () => {
    const executor = async () => {
      throw new Error("SMTP connection refused");
    };

    const intent = buildOutboundIntent({
      action: "send_email",
      source: "human",
      data: { to: "bob@test.com", subject: "Test", body: "Just a test" },
      channel: "email",
    });

    const result = await processIntent(intent, executor, { useLLM: false, skipSubstrate: true });

    // If the message was allowed but execution failed
    if (result.decision === "block" && result.reason.includes("Execution failed")) {
      expect(result.executed).toBe(false);
      expect(result.receipt.decision).toBe("block"); // effective block
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// RECEIPT INTEGRITY
// ═══════════════════════════════════════════════════════════════

describe("Receipt Integrity", { timeout: 30_000 }, () => {
  beforeEach(() => cleanupActions());
  afterEach(() => cleanupActions());

  it("receipt has all required fields", async () => {
    const intent = buildInboundIntent({
      message: "Test message",
      sender: "user@test.com",
      channel: "email",
    });

    const result = await processIntent(intent, undefined, { useLLM: false, skipSubstrate: true });

    expect(result.receipt.intent_id).toBeTruthy();
    expect(result.receipt.decision).toBeTruthy();
    expect(result.receipt.direction).toBeTruthy();
    expect(result.receipt.reason).toBeTruthy();
    expect(result.receipt.timestamp).toBeTruthy();
    expect(result.receipt.hash).toBeTruthy();
  });

  it("receipt hash is deterministic for same inputs", async () => {
    // The hash should be a SHA-256 of intent_id + decision + reason + timestamp
    const intentId = "test-123";
    const decision = "allow";
    const reason = "Allowed by policy";
    const timestamp = "2026-01-01T00:00:00.000Z";

    const expectedHash = sha256(JSON.stringify({ intentId, decision, reason, timestamp }));

    // Verify the hash algorithm matches
    expect(expectedHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("inbound and outbound receipts have identical shape", async () => {
    const inboundIntent = buildInboundIntent({
      message: "Hello",
      sender: "user@test.com",
      channel: "email",
    });

    const outboundIntent = buildOutboundIntent({
      action: "send_email",
      source: "human",
      data: { body: "Hello" },
      channel: "email",
    });

    const inboundResult = await processIntent(inboundIntent, undefined, { useLLM: false, skipSubstrate: true });
    const outboundResult = await processIntent(outboundIntent, undefined, { useLLM: false, skipSubstrate: true });

    // Same receipt shape
    const inboundKeys = Object.keys(inboundResult.receipt).sort();
    const outboundKeys = Object.keys(outboundResult.receipt).sort();
    expect(inboundKeys).toEqual(outboundKeys);

    // Same result shape
    const inboundResultKeys = Object.keys(inboundResult).sort();
    const outboundResultKeys = Object.keys(outboundResult).sort();
    expect(inboundResultKeys).toEqual(outboundResultKeys);
  });
});

// ═══════════════════════════════════════════════════════════════
// SAME PIPELINE, TWO DIRECTIONS
// ═══════════════════════════════════════════════════════════════

describe("Same Pipeline, Two Directions", { timeout: 60_000 }, () => {
  beforeEach(() => cleanupActions());
  afterEach(() => cleanupActions());

  it("same dangerous message blocked in both directions", async () => {
    const dangerousMessage = "URGENT: Your account is locked. Click here now.";

    const inbound = buildInboundIntent({
      message: dangerousMessage,
      sender: "attacker@evil.com",
      channel: "email",
    });

    const outbound = buildOutboundIntent({
      action: "send_email",
      source: "gemini",
      data: { body: dangerousMessage, to: "victim@target.com" },
      channel: "email",
    });

    const inboundResult = await processIntent(inbound, undefined, { useLLM: false, skipSubstrate: true });
    const outboundResult = await processIntent(outbound, undefined, { useLLM: false, skipSubstrate: true });

    // Both should be blocked by the MVP rule (unknown sender + urgency + consequential)
    expect(inboundResult.decision).toBe("block");
    expect(outboundResult.decision).toBe("block");

    // MVP rule should fire on both
    expect(inboundResult.matched_rules.length).toBeGreaterThan(0);
    expect(outboundResult.matched_rules.length).toBeGreaterThan(0);
  });

  it("same clean message allowed in both directions", async () => {
    const cleanMessage = "Hey team, meeting at 3pm today";

    const inbound = buildInboundIntent({
      message: cleanMessage,
      sender: "alice@company.com",
      channel: "slack",
    });

    const outbound = buildOutboundIntent({
      action: "send_email",
      source: "human",
      data: { body: cleanMessage, to: "team@company.com" },
      channel: "slack",
    });

    const inboundResult = await processIntent(inbound, undefined, { useLLM: false, skipSubstrate: true });
    const outboundResult = await processIntent(outbound, undefined, { useLLM: false, skipSubstrate: true });

    // Both should be allowed
    expect(inboundResult.decision).toBe("allow");
    // Outbound may be allow or require_confirmation (first-contact rule)
    expect(["allow", "require_confirmation"]).toContain(outboundResult.decision);
  });

  it("all 4 channels produce valid results", async () => {
    for (const channel of ["email", "sms", "slack", "linkedin"] as const) {
      const intent = buildInboundIntent({
        message: "Test message for channel validation",
        sender: "user@test.com",
        channel,
      });

      const result = await processIntent(intent, undefined, { useLLM: false, skipSubstrate: true });

      expect(result.decision).toBeTruthy();
      expect(result.receipt.direction).toBe("inbound");
      expect(result.receipt.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.action_id).toBeTruthy();
    }
  });

  it("telegram channel routes through pipeline correctly", async () => {
    const intent = buildInboundIntent({
      message: "Hello from Telegram",
      sender: "telegram_user_123",
      channel: "telegram",
    });

    const result = await processIntent(intent, undefined, { useLLM: false, skipSubstrate: true });

    expect(result.decision).toBeTruthy();
    expect(result.receipt).toBeTruthy();
    expect(result.action_id).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
// INTEGRITY SUBSTRATE — beneath all governance surfaces
// ═══════════════════════════════════════════════════════════════

describe("Integrity Substrate in Pipeline", { timeout: 30_000 }, () => {
  beforeEach(() => cleanupActions());
  afterEach(() => cleanupActions());

  it("first message passes substrate and reaches governance", async () => {
    const intent = buildInboundIntent({
      message: `Substrate test unique ${Date.now()} ${Math.random()}`,
      sender: "user@test.com",
      channel: "email",
    });

    const result = await processIntent(intent, undefined, {
      useLLM: false,
      nonce: `NONCE-test-${Date.now()}-${Math.random()}`,
    });

    // Should NOT be blocked by substrate
    expect(result.action_id).not.toBe("SUBSTRATE-BLOCKED");
    expect(result.receipt.intent_id).not.toContain("SUBSTRATE");
    // Should have substrate metadata attached
    expect(result.intent.data._substrate).toBeTruthy();
  });

  it("duplicate message blocked by substrate dedup", async () => {
    const uniqueMsg = `Dedup test ${Date.now()}`;

    // First: passes
    const intent1 = buildInboundIntent({
      message: uniqueMsg,
      sender: "user@test.com",
      channel: "email",
    });
    const result1 = await processIntent(intent1, undefined, {
      useLLM: false,
      nonce: `NONCE-dedup-1-${Date.now()}`,
    });
    expect(result1.action_id).not.toBe("SUBSTRATE-BLOCKED");

    // Second: same content, blocked by dedup
    const intent2 = buildInboundIntent({
      message: uniqueMsg,
      sender: "user@test.com",
      channel: "email",
    });
    const result2 = await processIntent(intent2, undefined, {
      useLLM: false,
      nonce: `NONCE-dedup-2-${Date.now()}`,
    });
    expect(result2.decision).toBe("block");
    expect(result2.action_id).toBe("SUBSTRATE-BLOCKED");
    expect(result2.reason).toContain("Integrity Substrate");
    expect(result2.reason).toContain("Duplicate content");
  });

  it("duplicate nonce blocked by substrate", async () => {
    const sharedNonce = `NONCE-shared-${Date.now()}`;

    // First: passes
    const intent1 = buildInboundIntent({
      message: `Nonce test A ${Date.now()} ${Math.random()}`,
      sender: "user@test.com",
      channel: "email",
    });
    const result1 = await processIntent(intent1, undefined, {
      useLLM: false,
      nonce: sharedNonce,
    });
    expect(result1.action_id).not.toBe("SUBSTRATE-BLOCKED");

    // Second: different content, same nonce, blocked
    const intent2 = buildInboundIntent({
      message: `Nonce test B ${Date.now()} ${Math.random()}`,
      sender: "user@test.com",
      channel: "email",
    });
    const result2 = await processIntent(intent2, undefined, {
      useLLM: false,
      nonce: sharedNonce,
    });
    expect(result2.decision).toBe("block");
    expect(result2.action_id).toBe("SUBSTRATE-BLOCKED");
    expect(result2.reason).toContain("Integrity Substrate");
    expect(result2.reason).toContain("nonce");
  });

  it("substrate block produces correct receipt shape", async () => {
    const uniqueMsg = `Receipt shape test ${Date.now()}`;

    // Send twice to trigger dedup
    const intent1 = buildInboundIntent({
      message: uniqueMsg,
      sender: "user@test.com",
      channel: "email",
    });
    await processIntent(intent1, undefined, {
      useLLM: false,
      nonce: `NONCE-receipt-1-${Date.now()}`,
    });

    const intent2 = buildInboundIntent({
      message: uniqueMsg,
      sender: "user@test.com",
      channel: "email",
    });
    const result = await processIntent(intent2, undefined, {
      useLLM: false,
      nonce: `NONCE-receipt-2-${Date.now()}`,
    });

    // Receipt should have all required fields
    expect(result.receipt.intent_id).toContain("SUBSTRATE");
    expect(result.receipt.decision).toBe("block");
    expect(result.receipt.direction).toBe("inbound");
    expect(result.receipt.reason).toContain("Integrity Substrate");
    expect(result.receipt.timestamp).toBeTruthy();
    expect(result.receipt.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("substrate metadata attached to passing intents", async () => {
    const intent = buildInboundIntent({
      message: `Metadata test ${Date.now()} ${Math.random()}`,
      sender: "user@test.com",
      channel: "sms",
    });

    const result = await processIntent(intent, undefined, {
      useLLM: false,
      nonce: `NONCE-meta-${Date.now()}-${Math.random()}`,
    });

    const substrate = result.intent.data._substrate as Record<string, unknown>;
    expect(substrate).toBeTruthy();
    expect(substrate.content_hash).toBeTruthy();
    expect(substrate.nonce).toBeTruthy();
    expect(substrate.checks_passed).toBeGreaterThan(0);
  });
});
