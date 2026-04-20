/**
 * PGTC Compliance Test Suite — 19 Tests
 * ═══════════════════════════════════════════════════════════════
 *
 * Categories:
 *   AUTH   (4) — Authentication & authorization enforcement
 *   PGE    (4) — Pre-Gate Enforcement (adapter boundary)
 *   TES    (4) — Transition/Execution State enforcement
 *   GATE   (4) — Gate decision enforcement
 *   LEDGER (3) — Ledger integrity enforcement
 *
 * All tests are deterministic. No mocks. No skips.
 * System is reset before each test.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  system,
  assertExecution,
  assertLedgerEntry,
  assertHashChainIntegrity,
  assertNoSideEffects,
  assertNonceConsumed,
  assertBlockedEntry,
  assertPrePostRecords,
  assertAdapterBoundary,
  createPacket,
  createBadSignaturePacket,
  createActionPacket,
} from "../harness/runner";

// ═══════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════

beforeEach(() => {
  system.reset();
});

// ═══════════════════════════════════════════════════════════════
// PASS-001: Happy Path (Baseline)
// ═══════════════════════════════════════════════════════════════

describe("PASS-001: Happy path — valid packet, valid token, valid TES", () => {
  it("produces ALLOW with receipt and ledger entries", async () => {
    const packet = createPacket();

    const result = await system.execute(packet);

    assertExecution(result, "ALLOW");
    assertPrePostRecords(system.ledger, "ALLOW");
    assertNonceConsumed(system.ledger, packet.nonce);

    // Adapter was called exactly once via system.execute
    const governedCalls = system.adapterCalls.filter(c => c.source === "system.execute");
    expect(governedCalls.length).toBe(1);
    expect(governedCalls[0].adapter).toBe("send_email");
  });
});

// ═══════════════════════════════════════════════════════════════
// AUTH — Authentication & Authorization (4 tests)
// ═══════════════════════════════════════════════════════════════

describe("AUTH-001: Invalid signature → HALT", () => {
  it("rejects packet with bad signature", async () => {
    const packet = createBadSignaturePacket();

    const result = await system.execute(packet);

    assertExecution(result, "HALT");
    assertNoSideEffects(system.adapterCalls, "HALT");
    expect(system.ledger.length).toBeGreaterThan(0);
    const blocked = system.ledger.find(e => e.status === "BLOCKED");
    expect(blocked).toBeDefined();
  });
});

describe("AUTH-002: Expired token → HALT", () => {
  it("rejects execution with expired token", async () => {
    const packet = createPacket();

    const result = await system.execute(packet, {
      override_expires_at: Date.now() - 60_000, // Already expired
    });

    assertExecution(result, "HALT");
    assertNoSideEffects(system.adapterCalls, "HALT");
    expect(system.ledger.find(e => e.status === "BLOCKED")).toBeDefined();
  });
});

describe("AUTH-003: Nonce replay → HALT", () => {
  it("blocks second execution with same nonce", async () => {
    const packet1 = createPacket();

    // First execution succeeds
    const result1 = await system.execute(packet1);
    assertExecution(result1, "ALLOW");

    // Replay with same nonce — create a new packet but reuse the nonce
    const packet2 = createPacket({ nonce: packet1.nonce });

    const result2 = await system.execute(packet2);

    assertExecution(result2, "HALT", "NONCE_REPLAY");
    assertBlockedEntry(system.ledger, "NONCE_REPLAY");
  });
});

describe("AUTH-004: Token-intent binding mismatch → HALT", () => {
  it("rejects token bound to different intent", async () => {
    const packet = createPacket();

    const result = await system.execute(packet, {
      override_intent_hash: "WRONG_HASH_0000000000000000000000000000000000000000000000000000",
    });

    assertExecution(result, "HALT");
    assertNoSideEffects(system.adapterCalls, "HALT");
  });
});

// ═══════════════════════════════════════════════════════════════
// PGE — Pre-Gate Enforcement (4 tests)
// ═══════════════════════════════════════════════════════════════

describe("PGE-001: Direct adapter call without gate → detectable", () => {
  it("direct adapter call is recorded as ungoverned", () => {
    const result = system.directAdapterCall("send_email", "perform", {
      to: "test@example.com",
      subject: "Bypass",
    });

    expect(system.adapterCalls.length).toBe(1);
    expect(system.adapterCalls[0].source).toBe("direct");
    expect(system.ledger.length).toBe(0);
    expect((result as any).ungoverned).toBe(true);
  });
});

describe("PGE-002: Hidden side effect attempt → detectable", () => {
  it("hidden side effect is recorded and identifiable", () => {
    const result = system.attemptHiddenSideEffect("smtp://mail.example.com", {
      payload: "raw email bytes",
    });

    expect(system.adapterCalls.length).toBe(1);
    expect(system.adapterCalls[0].source).toBe("hidden");
    expect(system.adapterCalls[0].adapter).toBe("HIDDEN");
    expect(system.ledger.length).toBe(0);
    expect((result as any).ungoverned).toBe(true);
    expect((result as any).hidden).toBe(true);
  });
});

describe("PGE-003: Adapter boundary lock — no side effects on HALT", () => {
  it("HALT execution produces zero governed adapter calls", async () => {
    const packet = createBadSignaturePacket();

    const result = await system.execute(packet);

    assertExecution(result, "HALT");
    assertNoSideEffects(system.adapterCalls, "HALT");
    assertAdapterBoundary(system.adapterCalls);
  });
});

describe("PGE-004: Pre/post record enforcement", () => {
  it("ALLOW execution has WAL_PREPARED before WAL_COMMITTED", async () => {
    const packet = createPacket();

    const result = await system.execute(packet);

    assertExecution(result, "ALLOW");
    assertPrePostRecords(system.ledger, "ALLOW");

    const prepared = system.ledger.find(e => e.entry_type === "WAL_PREPARED");
    const committed = system.ledger.find(e => e.entry_type === "WAL_COMMITTED");
    expect(prepared).toBeDefined();
    expect(committed).toBeDefined();
    expect(prepared!.index).toBeLessThan(committed!.index);
  });
});

// ═══════════════════════════════════════════════════════════════
// TES — Transition/Execution State (4 tests)
// ═══════════════════════════════════════════════════════════════

describe("TES-001: Action not in allowed classes → HALT", () => {
  it("blocks action outside TES allowed list", async () => {
    system.setTES({
      allowed_action_classes: ["write_file"],
      valid_transitions: { "*": ["*"] },
      allowed_scopes: ["*"],
    });

    const packet = createPacket({ action: "send_email" });

    const result = await system.execute(packet);

    assertExecution(result, "HALT", "ACTION_NOT_ALLOWED");
    assertLedgerEntry(system.ledger, "TES_BLOCK", "ACTION_NOT_ALLOWED");
    assertNoSideEffects(system.adapterCalls, "HALT");
  });
});

describe("TES-002: Invalid state transition → HALT", () => {
  it("blocks invalid state transition", async () => {
    system.setTES({
      allowed_action_classes: ["*"],
      valid_transitions: { IDLE: ["PREPARING"], PREPARING: ["EXECUTING"] },
      allowed_scopes: ["*"],
      current_state: "EXECUTING",
    });

    const packet = createPacket({ target_state: "IDLE" });

    const result = await system.execute(packet);

    assertExecution(result, "HALT", "INVALID_TRANSITION");
    assertLedgerEntry(system.ledger, "TES_BLOCK", "INVALID_TRANSITION");
  });
});

describe("TES-003: Scope violation → HALT", () => {
  it("blocks resource outside allowed scope", async () => {
    system.setTES({
      allowed_action_classes: ["*"],
      valid_transitions: { "*": ["*"] },
      allowed_scopes: ["user-files/*"],
    });

    const packet = createPacket({ resource: "system-config/secrets.env" });

    const result = await system.execute(packet);

    assertExecution(result, "HALT", "SCOPE_VIOLATION");
    assertLedgerEntry(system.ledger, "TES_BLOCK", "SCOPE_VIOLATION");
  });
});

describe("TES-004: Valid TES config → ALLOW", () => {
  it("allows action within TES constraints", async () => {
    system.setTES({
      allowed_action_classes: ["send_email", "write_file"],
      valid_transitions: { IDLE: ["send_email", "write_file"] },
      allowed_scopes: ["*"],
      current_state: "IDLE",
    });

    const packet = createPacket({ action: "send_email" });

    const result = await system.execute(packet);

    assertExecution(result, "ALLOW");
    expect(result.tes_result?.allowed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// GATE — Gate Decision Enforcement (4 tests)
// ═══════════════════════════════════════════════════════════════

describe("GATE-001: All checks pass → ALLOW", () => {
  it("valid packet + valid token + valid TES → ALLOW", async () => {
    const packet = createPacket();

    const result = await system.execute(packet);

    assertExecution(result, "ALLOW");
    assertPrePostRecords(system.ledger, "ALLOW");
  });
});

describe("GATE-002: Missing token → HALT", () => {
  it("execution without token is blocked", async () => {
    const packet = createPacket();

    const result = await system.execute(packet, { skip_token: true });

    assertExecution(result, "HALT", "NO_TOKEN");
    assertNoSideEffects(system.adapterCalls, "HALT");
    assertLedgerEntry(system.ledger, "TOKEN_MISSING", "NO_TOKEN");
  });
});

describe("GATE-003: Fail-closed guarantee", () => {
  it("any validation failure produces HALT, never silent pass", async () => {
    // Test 1: Bad signature
    const p1 = createBadSignaturePacket();
    const r1 = await system.execute(p1);
    expect(r1.execution).toBe("HALT");

    system.reset();

    // Test 2: No token
    const p2 = createPacket();
    const r2 = await system.execute(p2, { skip_token: true });
    expect(r2.execution).toBe("HALT");

    system.reset();

    // Test 3: Expired token
    const p3 = createPacket();
    const r3 = await system.execute(p3, { override_expires_at: Date.now() - 60_000 });
    expect(r3.execution).toBe("HALT");
  });
});

describe("GATE-004: Outcome validation — invalid result shape → HALT", () => {
  it("rejects execution with invalid outcome shape", async () => {
    system.setOutcomeValidator((action, result) => {
      if (action === "send_email") {
        const r = result as any;
        if (!r || !r.message_id) {
          return { valid: false, reason: "INVALID_OUTCOME: missing message_id" };
        }
      }
      return { valid: true };
    });

    const packet = createPacket();

    const result = await system.execute(packet);

    assertExecution(result, "HALT", "INVALID_OUTCOME");
    assertLedgerEntry(system.ledger, "OUTCOME_INVALID", "INVALID_OUTCOME");
  });
});

// ═══════════════════════════════════════════════════════════════
// LEDGER — Ledger Integrity (3 tests)
// ═══════════════════════════════════════════════════════════════

describe("LEDGER-001: Blocked action produces ledger entry", () => {
  it("every HALT writes a BLOCKED entry to the ledger", async () => {
    const packet = createBadSignaturePacket();

    const result = await system.execute(packet);

    assertExecution(result, "HALT");
    expect(system.ledger.length).toBeGreaterThan(0);

    const blocked = system.ledger.filter(e => e.status === "BLOCKED");
    expect(blocked.length).toBeGreaterThan(0);

    for (const entry of blocked) {
      expect(entry.intent_hash).toBeTruthy();
      expect(entry.timestamp).toBeGreaterThan(0);
      expect(entry.prev_hash).toBeTruthy();
      expect(entry.entry_hash).toBeTruthy();
      expect(entry.entry_hash.length).toBe(64);
    }
  });
});

describe("LEDGER-002: Hash chain integrity maintained", () => {
  it("multiple operations maintain valid hash chain", async () => {
    // 1. Successful execution
    const p1 = createPacket();
    await system.execute(p1);

    // 2. Failed execution (bad signature)
    const p2 = createBadSignaturePacket();
    await system.execute(p2);

    // 3. Failed execution (no token)
    const p3 = createPacket();
    await system.execute(p3, { skip_token: true });

    // 4. Another success
    const p4 = createPacket();
    await system.execute(p4);

    expect(system.ledger.length).toBeGreaterThanOrEqual(4);
    assertHashChainIntegrity(system.ledger);
  });
});

describe("LEDGER-003: Hash chain break detected", () => {
  it("corrupted entry breaks chain verification", async () => {
    const p1 = createPacket();
    await system.execute(p1);

    const p2 = createPacket();
    await system.execute(p2);

    expect(system.ledger.length).toBeGreaterThanOrEqual(2);

    // Manually corrupt the chain (simulate tampering)
    const corruptedLedger = [...system.ledger];
    if (corruptedLedger.length >= 2) {
      corruptedLedger[1] = {
        ...corruptedLedger[1],
        prev_hash: "CORRUPTED_0000000000000000000000000000000000000000000000000000000000",
      };
    }

    // Verify the corrupted chain fails
    let chainBroken = false;
    for (let i = 1; i < corruptedLedger.length; i++) {
      if (corruptedLedger[i].prev_hash !== corruptedLedger[i - 1].entry_hash) {
        chainBroken = true;
        break;
      }
    }
    expect(chainBroken).toBe(true);

    // The original chain should still be valid
    assertHashChainIntegrity(system.ledger);
  });
});
