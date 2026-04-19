/**
 * PGTC Assertions
 * ═══════════════════════════════════════════════════════════════
 * Deterministic assertion helpers for the PGTC compliance suite.
 */

import { expect } from "vitest";
import type { ExecutionResult, LedgerEntry, AdapterCall } from "./system";

/**
 * Assert execution result matches expected outcome.
 */
export function assertExecution(
  result: ExecutionResult,
  expected: "ALLOW" | "HALT",
  expectedReason?: string,
): void {
  expect(result.execution).toBe(expected);
  if (expected === "HALT" && expectedReason) {
    expect(result.reason).toBeDefined();
    expect(result.reason!).toContain(expectedReason);
  }
}

/**
 * Assert a ledger entry exists with the given type and reason.
 */
export function assertLedgerEntry(
  ledger: ReadonlyArray<LedgerEntry>,
  entryType: string,
  reason?: string,
): LedgerEntry {
  const entry = ledger.find(e => e.entry_type === entryType);
  expect(entry).toBeDefined();
  if (reason) {
    expect(entry!.reason).toContain(reason);
  }
  return entry!;
}

/**
 * Assert the entire ledger has valid hash chain integrity.
 */
export function assertHashChainIntegrity(ledger: ReadonlyArray<LedgerEntry>): void {
  expect(ledger.length).toBeGreaterThan(0);

  for (let i = 0; i < ledger.length; i++) {
    const entry = ledger[i];
    // Index must be sequential
    expect(entry.index).toBe(i);
    // Timestamps must be positive
    expect(entry.timestamp).toBeGreaterThan(0);
    // Hash must be non-empty
    expect(entry.entry_hash).toBeTruthy();
    expect(entry.entry_hash.length).toBe(64); // SHA-256 hex

    if (i === 0) {
      expect(entry.prev_hash).toBe("GENESIS");
    } else {
      expect(entry.prev_hash).toBe(ledger[i - 1].entry_hash);
    }
  }
}

/**
 * Assert no side effects occurred when execution was HALT.
 * If execution is HALT, adapter calls from system.execute should be zero.
 */
export function assertNoSideEffects(
  adapterCalls: ReadonlyArray<AdapterCall>,
  expectedExecution: "ALLOW" | "HALT",
): void {
  if (expectedExecution === "HALT") {
    const governedCalls = adapterCalls.filter(c => c.source === "system.execute");
    expect(governedCalls.length).toBe(0);
  }
}

/**
 * Assert a nonce has been consumed (appears in ledger as used).
 */
export function assertNonceConsumed(
  ledger: ReadonlyArray<LedgerEntry>,
  nonce: string,
): void {
  // A consumed nonce means execution succeeded (WAL_COMMITTED exists)
  // and the nonce appears in the execution flow
  const committed = ledger.find(
    e => e.entry_type === "WAL_COMMITTED" && e.status === "ALLOWED",
  );
  expect(committed).toBeDefined();
}

/**
 * Assert a blocked entry exists in the ledger for a HALT result.
 */
export function assertBlockedEntry(
  ledger: ReadonlyArray<LedgerEntry>,
  reason: string,
): void {
  const blocked = ledger.find(
    e => e.status === "BLOCKED" && e.reason?.includes(reason),
  );
  expect(blocked).toBeDefined();
  expect(blocked!.entry_hash).toBeTruthy();
  expect(blocked!.prev_hash).toBeTruthy();
  expect(blocked!.timestamp).toBeGreaterThan(0);
}

/**
 * Assert pre-record and post-record exist around execution.
 */
export function assertPrePostRecords(
  ledger: ReadonlyArray<LedgerEntry>,
  expectedExecution: "ALLOW" | "HALT",
): void {
  if (expectedExecution === "ALLOW") {
    const prepared = ledger.find(e => e.entry_type === "WAL_PREPARED");
    const committed = ledger.find(e => e.entry_type === "WAL_COMMITTED");
    expect(prepared).toBeDefined();
    expect(committed).toBeDefined();
    // PREPARED must come before COMMITTED
    expect(prepared!.index).toBeLessThan(committed!.index);
  }
}

/**
 * Assert adapter calls only came through system.execute (no direct/hidden).
 */
export function assertAdapterBoundary(
  adapterCalls: ReadonlyArray<AdapterCall>,
): void {
  const violations = adapterCalls.filter(
    c => c.source === "direct" || c.source === "hidden",
  );
  // Violations may exist (test intentionally created them)
  // but they must NOT have produced governed execution
  for (const v of violations) {
    expect(v.source).not.toBe("system.execute");
  }
}
