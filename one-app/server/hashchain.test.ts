import { describe, expect, it } from "vitest";
import { createHash } from "crypto";

/**
 * Non-mocked test that constructs ledger entries and verifies
 * the SHA-256 hash chain integrity, including tamper detection.
 */

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

interface LedgerEntry {
  entryId: string;
  entryType: string;
  payload: Record<string, unknown>;
  hash: string;
  prevHash: string;
  timestamp: number;
}

function buildLedgerEntry(
  entryId: string,
  entryType: string,
  payload: Record<string, unknown>,
  prevHash: string,
  timestamp: number
): LedgerEntry {
  const hash = sha256(JSON.stringify({ entryId, entryType, payload, prevHash, timestamp }));
  return { entryId, entryType, payload, hash, prevHash, timestamp };
}

function verifyChain(entries: LedgerEntry[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    // Verify hash
    const expectedHash = sha256(JSON.stringify({
      entryId: entry.entryId,
      entryType: entry.entryType,
      payload: entry.payload,
      prevHash: entry.prevHash,
      timestamp: entry.timestamp,
    }));
    if (entry.hash !== expectedHash) {
      errors.push(`Entry ${entry.entryId}: hash mismatch (expected ${expectedHash}, got ${entry.hash})`);
    }
    // Verify chain link
    if (i === 0) {
      if (entry.prevHash !== "GENESIS") {
        errors.push(`Entry ${entry.entryId}: first entry prevHash should be GENESIS, got ${entry.prevHash}`);
      }
    } else {
      if (entry.prevHash !== entries[i - 1].hash) {
        errors.push(`Entry ${entry.entryId}: prevHash mismatch (expected ${entries[i - 1].hash}, got ${entry.prevHash})`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

describe("SHA-256 Hash Chain Integrity", () => {
  it("validates a correctly built chain of 5 entries", () => {
    const entries: LedgerEntry[] = [];
    const types = ["ONBOARD", "INTENT", "APPROVAL", "EXECUTION", "SYNC"];
    let prevHash = "GENESIS";

    for (let i = 0; i < 5; i++) {
      const entry = buildLedgerEntry(
        `LED-${i + 1}`,
        types[i],
        { action: `test-action-${i}`, userId: 1 },
        prevHash,
        Date.now() + i * 1000
      );
      entries.push(entry);
      prevHash = entry.hash;
    }

    const result = verifyChain(entries);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects tampered payload in the middle of the chain", () => {
    const entries: LedgerEntry[] = [];
    let prevHash = "GENESIS";

    for (let i = 0; i < 5; i++) {
      const entry = buildLedgerEntry(
        `LED-${i + 1}`,
        "INTENT",
        { action: `action-${i}`, amount: i * 100 },
        prevHash,
        Date.now() + i * 1000
      );
      entries.push(entry);
      prevHash = entry.hash;
    }

    // Tamper with entry 2 (index 2) payload
    entries[2] = { ...entries[2], payload: { action: "TAMPERED", amount: 999999 } };

    const result = verifyChain(entries);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0]).toContain("LED-3");
    expect(result.errors[0]).toContain("hash mismatch");
  });

  it("detects broken prevHash link", () => {
    const entries: LedgerEntry[] = [];
    let prevHash = "GENESIS";

    for (let i = 0; i < 3; i++) {
      const entry = buildLedgerEntry(
        `LED-${i + 1}`,
        "EXECUTION",
        { executionId: `EXE-${i}` },
        prevHash,
        Date.now() + i * 1000
      );
      entries.push(entry);
      prevHash = entry.hash;
    }

    // Break the chain by replacing entry 1's hash with garbage
    // This should cause entry 2's prevHash check to fail
    const originalHash = entries[1].hash;
    entries[1] = { ...entries[1], hash: "0000000000000000000000000000000000000000000000000000000000000000" };

    const result = verifyChain(entries);
    expect(result.valid).toBe(false);
    // Should detect both: entry 1 hash mismatch AND entry 2 prevHash mismatch
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("detects tampered first entry (GENESIS link)", () => {
    const entry = buildLedgerEntry("LED-1", "ONBOARD", { userId: 1 }, "GENESIS", Date.now());
    // Change prevHash from GENESIS to something else
    const tampered = { ...entry, prevHash: "NOT-GENESIS" };

    const result = verifyChain([tampered]);
    expect(result.valid).toBe(false);
    // Changing prevHash also changes the computed hash, so we get both a hash mismatch
    // and a GENESIS link error
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    const allErrors = result.errors.join(" ");
    expect(allErrors).toContain("LED-1");
  });

  it("validates an empty chain", () => {
    const result = verifyChain([]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("validates a single-entry chain", () => {
    const entry = buildLedgerEntry("LED-1", "ONBOARD", { userId: 1, publicKey: "abc" }, "GENESIS", Date.now());
    const result = verifyChain([entry]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
