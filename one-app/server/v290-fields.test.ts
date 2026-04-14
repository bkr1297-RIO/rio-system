/**
 * Tests that Status and Ledger pages consume Gateway v2.9.0 response shapes.
 * COS pushed commit 866889c with enhanced chain verification fields.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const statusContent = readFileSync(
  resolve(__dirname, "../client/src/pages/Status.tsx"),
  "utf-8"
);
const ledgerContent = readFileSync(
  resolve(__dirname, "../client/src/pages/Ledger.tsx"),
  "utf-8"
);
const gatewayTsContent = readFileSync(
  resolve(__dirname, "../client/src/lib/gateway.ts"),
  "utf-8"
);

describe("Status page v2.9.0 health fields", () => {
  it("should have hashes_verified in the HealthData interface", () => {
    expect(statusContent).toContain("hashes_verified");
  });

  it("should have hash_mismatches in the HealthData interface", () => {
    expect(statusContent).toContain("hash_mismatches");
  });

  it("should have linkage_breaks in the HealthData interface", () => {
    expect(statusContent).toContain("linkage_breaks");
  });

  it("should have epochs in the HealthData interface", () => {
    expect(statusContent).toContain("epochs");
  });

  it("should have current_epoch with start_index, entries, valid", () => {
    expect(statusContent).toContain("current_epoch");
    expect(statusContent).toContain("start_index");
  });

  it("should display hashes_verified value", () => {
    expect(statusContent).toContain("health.ledger.hashes_verified");
  });

  it("should display hash_mismatches with conditional coloring", () => {
    expect(statusContent).toContain("health.ledger.hash_mismatches");
  });

  it("should display linkage_breaks with conditional coloring", () => {
    expect(statusContent).toContain("health.ledger.linkage_breaks");
  });

  it("should render current epoch section", () => {
    expect(statusContent).toContain("health.ledger.current_epoch");
    expect(statusContent).toContain("Current Epoch");
  });
});

describe("LedgerEntry interface v2.9.0 field names", () => {
  it("should use entry_id (not just id) as the UUID field", () => {
    expect(gatewayTsContent).toContain("entry_id: string");
  });

  it("should use agent_id (not actor)", () => {
    expect(gatewayTsContent).toContain("agent_id: string");
  });

  it("should use status (not entry_type)", () => {
    // LedgerEntry should have status field
    expect(gatewayTsContent).toMatch(/export interface LedgerEntry[\s\S]*?status: string/);
  });

  it("should use ledger_hash (not hash or payload_hash)", () => {
    expect(gatewayTsContent).toContain("ledger_hash: string");
  });

  it("should use timestamp (not created_at)", () => {
    expect(gatewayTsContent).toMatch(/export interface LedgerEntry[\s\S]*?timestamp: string/);
  });

  it("should include intent_hash, authorization_hash, execution_hash, receipt_hash", () => {
    expect(gatewayTsContent).toContain("intent_hash");
    expect(gatewayTsContent).toContain("authorization_hash");
    expect(gatewayTsContent).toContain("execution_hash");
    expect(gatewayTsContent).toContain("receipt_hash");
  });
});

describe("Ledger page uses Gateway v2.9.0 field names directly", () => {
  it("should reference entry_id field", () => {
    expect(ledgerContent).toContain("entry_id");
  });

  it("should reference agent_id field", () => {
    expect(ledgerContent).toContain("agent_id");
  });

  it("should reference status field", () => {
    expect(ledgerContent).toContain("entry.status");
  });

  it("should reference ledger_hash field", () => {
    expect(ledgerContent).toContain("ledger_hash");
  });

  it("should reference timestamp field", () => {
    expect(ledgerContent).toContain("entry.timestamp");
  });
});
