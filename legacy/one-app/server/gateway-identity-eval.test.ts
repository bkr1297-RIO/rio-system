/**
 * gateway-identity-eval.test.ts — Tests for Gateway-Level Identity Evaluation (Rule 3)
 *
 * Proves:
 *   1. evaluateIdentityAtGatewayBoundary() enforces Rule 3 at the Gateway boundary
 *   2. Receipt carries explicit proposer_identity_id and approver_identity_id
 *   3. Matching IDs labeled "Constrained Single-Actor Execution" in audit trail
 *   4. Different IDs labeled "Separated Authority"
 *   5. Blocked attempts labeled "BLOCKED — Self-Authorization Sub-Policy Not Met"
 *   6. Authority model labels are canonical and consistent across all paths
 */

import { describe, it, expect } from "vitest";
import {
  evaluateIdentityAtGatewayBoundary,
  resolveAuthorityModel,
  type AuthorityModel,
  type GatewayIdentityEvaluation,
} from "./gatewayProxy";
import { DELEGATION_COOLDOWN_MS } from "./constrainedDelegation";

// ─── Unit tests for evaluateIdentityAtGatewayBoundary ──────────

describe("evaluateIdentityAtGatewayBoundary", () => {
  const now = Date.now();

  describe("Different identities (Separated Authority)", () => {
    it("should ALLOW immediately and label as Separated Authority", () => {
      const result = evaluateIdentityAtGatewayBoundary(
        "PRI-proposer-001",
        "PRI-approver-002",
        now - 1000, // intent created 1s ago
        now,
      );

      expect(result.allowed).toBe(true);
      expect(result.proposer_identity_id).toBe("PRI-proposer-001");
      expect(result.approver_identity_id).toBe("PRI-approver-002");
      expect(result.authority_model).toBe("Separated Authority");
      expect(result.role_separation).toBe("separated");
      expect(result.cooldown_remaining_ms).toBe(0);
    });

    it("should carry explicit identity IDs in the evaluation result", () => {
      const result = evaluateIdentityAtGatewayBoundary(
        "user-alice",
        "user-bob",
        now - 5000,
        now,
      );

      // These are the fields that go into the receipt
      expect(result).toHaveProperty("proposer_identity_id", "user-alice");
      expect(result).toHaveProperty("approver_identity_id", "user-bob");
      expect(result).toHaveProperty("authority_model", "Separated Authority");
    });
  });

  describe("Same identity — immediate (BLOCKED)", () => {
    it("should BLOCK and label as BLOCKED — Self-Authorization Sub-Policy Not Met", () => {
      const result = evaluateIdentityAtGatewayBoundary(
        "PRI-same-actor",
        "PRI-same-actor",
        now - 10_000, // intent created 10s ago (well within cooldown)
        now,
      );

      expect(result.allowed).toBe(false);
      expect(result.proposer_identity_id).toBe("PRI-same-actor");
      expect(result.approver_identity_id).toBe("PRI-same-actor");
      expect(result.authority_model).toBe("BLOCKED — Self-Authorization Sub-Policy Not Met");
      expect(result.role_separation).toBe("self");
      expect(result.cooldown_remaining_ms).toBeGreaterThan(0);
    });

    it("should record matching IDs even when blocked", () => {
      const result = evaluateIdentityAtGatewayBoundary(
        "user-single-actor",
        "user-single-actor",
        now - 5000,
        now,
      );

      expect(result.proposer_identity_id).toBe("user-single-actor");
      expect(result.approver_identity_id).toBe("user-single-actor");
      // IDs match → audit trail must show this
      expect(result.proposer_identity_id).toBe(result.approver_identity_id);
    });
  });

  describe("Same identity — cooldown elapsed (Constrained Single-Actor Execution)", () => {
    it("should ALLOW after cooldown and label as Constrained Single-Actor Execution", () => {
      const result = evaluateIdentityAtGatewayBoundary(
        "PRI-same-actor",
        "PRI-same-actor",
        now - DELEGATION_COOLDOWN_MS - 1000, // intent created well past cooldown
        now,
      );

      expect(result.allowed).toBe(true);
      expect(result.proposer_identity_id).toBe("PRI-same-actor");
      expect(result.approver_identity_id).toBe("PRI-same-actor");
      expect(result.authority_model).toBe("Constrained Single-Actor Execution");
      expect(result.role_separation).toBe("constrained");
      expect(result.cooldown_remaining_ms).toBe(0);
    });

    it("should carry the full delegation check for logging", () => {
      const result = evaluateIdentityAtGatewayBoundary(
        "PRI-same-actor",
        "PRI-same-actor",
        now - DELEGATION_COOLDOWN_MS - 1000,
        now,
      );

      expect(result.delegation_check).toBeDefined();
      expect(result.delegation_check.allowed).toBe(true);
      expect(result.delegation_check.role_separation).toBe("constrained");
      expect(result.delegation_check.proposer_identity).toBe("PRI-same-actor");
      expect(result.delegation_check.approver_identity).toBe("PRI-same-actor");
    });
  });

  describe("Exact cooldown boundary", () => {
    it("should BLOCK at exactly cooldown - 1ms", () => {
      const intentTime = now - DELEGATION_COOLDOWN_MS + 1;
      const result = evaluateIdentityAtGatewayBoundary(
        "PRI-boundary",
        "PRI-boundary",
        intentTime,
        now,
      );

      expect(result.allowed).toBe(false);
      expect(result.authority_model).toBe("BLOCKED — Self-Authorization Sub-Policy Not Met");
    });

    it("should ALLOW at exactly cooldown elapsed", () => {
      const intentTime = now - DELEGATION_COOLDOWN_MS;
      const result = evaluateIdentityAtGatewayBoundary(
        "PRI-boundary",
        "PRI-boundary",
        intentTime,
        now,
      );

      expect(result.allowed).toBe(true);
      expect(result.authority_model).toBe("Constrained Single-Actor Execution");
    });
  });

  describe("Custom cooldown override", () => {
    it("should respect custom cooldown for testing", () => {
      const result = evaluateIdentityAtGatewayBoundary(
        "PRI-test",
        "PRI-test",
        now - 5000, // 5s ago
        now,
        3000, // 3s cooldown override
      );

      expect(result.allowed).toBe(true);
      expect(result.authority_model).toBe("Constrained Single-Actor Execution");
    });
  });
});

// ─── Unit tests for resolveAuthorityModel ──────────────────────

describe("resolveAuthorityModel", () => {
  it("maps 'separated' to 'Separated Authority'", () => {
    expect(resolveAuthorityModel("separated")).toBe("Separated Authority");
  });

  it("maps 'constrained' to 'Constrained Single-Actor Execution'", () => {
    expect(resolveAuthorityModel("constrained")).toBe("Constrained Single-Actor Execution");
  });

  it("maps 'self' to 'BLOCKED — Self-Authorization Sub-Policy Not Met'", () => {
    expect(resolveAuthorityModel("self")).toBe("BLOCKED — Self-Authorization Sub-Policy Not Met");
  });
});

// ─── Static proof: Gateway evaluation is used in all approval paths ──

describe("Static proof: Gateway-level evaluation in approval paths", () => {
  it("approveAndExecute uses evaluateIdentityAtGatewayBoundary", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/routers.ts", "utf-8");

    // The approveAndExecute procedure must call evaluateIdentityAtGatewayBoundary
    const approveAndExecuteStart = src.indexOf("approveAndExecute:");
    expect(approveAndExecuteStart).toBeGreaterThan(-1);

    const approveAndExecuteSection = src.slice(approveAndExecuteStart, approveAndExecuteStart + 5000);
    expect(approveAndExecuteSection).toContain("evaluateIdentityAtGatewayBoundary");
    expect(approveAndExecuteSection).toContain("GATEWAY-LEVEL IDENTITY EVALUATION");
  });

  it("proxy.approve uses evaluateIdentityAtGatewayBoundary", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/routers.ts", "utf-8");

    // The approve procedure must also use Gateway-level evaluation
    const approveStart = src.indexOf("approve: protectedProcedure");
    expect(approveStart).toBeGreaterThan(-1);

    const approveSection = src.slice(approveStart, approveStart + 2000);
    expect(approveSection).toContain("evaluateIdentityAtGatewayBoundary");
    expect(approveSection).toContain("Gateway-level identity evaluation");
  });

  it("all DELEGATION ledger entries in routers.ts carry proposer_identity_id, approver_identity_id, authority_model", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/routers.ts", "utf-8");

    // Find all DELEGATION_BLOCKED ledger entries (skip schema/enum references)
    const blockedMatches = [...src.matchAll(/appendLedger\("DELEGATION_BLOCKED"[^)]*\{([^}]+)\}/gs)];
    expect(blockedMatches.length).toBeGreaterThan(0);
    for (const match of blockedMatches) {
      const body = match[1];
      expect(body).toContain("proposer_identity_id");
      expect(body).toContain("approver_identity_id");
      expect(body).toContain("authority_model");
    }

    // Find all DELEGATION_APPROVED ledger entries
    const approvedMatches = [...src.matchAll(/appendLedger\("DELEGATION_APPROVED"[^)]*\{([^}]+)\}/gs)];
    expect(approvedMatches.length).toBeGreaterThan(0);
    for (const match of approvedMatches) {
      const body = match[1];
      expect(body).toContain("proposer_identity_id");
      expect(body).toContain("approver_identity_id");
      expect(body).toContain("authority_model");
    }
  });

  it("EXECUTION ledger entry in approveAndExecute carries authority_model and identity IDs", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/routers.ts", "utf-8");

    // Find the EXECUTION ledger entry specifically in the approveAndExecute section
    const approveAndExecuteStart = src.indexOf("approveAndExecute:");
    expect(approveAndExecuteStart).toBeGreaterThan(-1);
    const approveAndExecuteSection = src.slice(approveAndExecuteStart, approveAndExecuteStart + 15000);

    // Find EXECUTION within that section
    const execIdx = approveAndExecuteSection.indexOf('appendLedger("EXECUTION"');
    expect(execIdx).toBeGreaterThan(-1);

    const execBlock = approveAndExecuteSection.slice(execIdx, execIdx + 600);
    expect(execBlock).toContain("proposer_identity_id");
    expect(execBlock).toContain("approver_identity_id");
    expect(execBlock).toContain("authority_model");
  });

  it("receipt return value carries proposer_identity_id, approver_identity_id, and authority_model", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/routers.ts", "utf-8");

    // Find the receipt return in approveAndExecute
    const returnIdx = src.indexOf("Explicit identity fields in receipt");
    expect(returnIdx).toBeGreaterThan(-1);

    const returnBlock = src.slice(returnIdx, returnIdx + 300);
    expect(returnBlock).toContain("proposer_identity_id");
    expect(returnBlock).toContain("approver_identity_id");
    expect(returnBlock).toContain("authority_model");
  });
});

// ─── Authority model label consistency ─────────────────────────

describe("Authority model label consistency", () => {
  const validLabels: AuthorityModel[] = [
    "Separated Authority",
    "Constrained Single-Actor Execution",
    "BLOCKED — Self-Authorization Sub-Policy Not Met",
  ];

  it("all authority model labels are from the canonical set", () => {
    // Test all three role separations map to valid labels
    const labels = [
      resolveAuthorityModel("separated"),
      resolveAuthorityModel("constrained"),
      resolveAuthorityModel("self"),
    ];

    for (const label of labels) {
      expect(validLabels).toContain(label);
    }
  });

  it("evaluateIdentityAtGatewayBoundary returns canonical labels", () => {
    const now = Date.now();

    // Separated
    const sep = evaluateIdentityAtGatewayBoundary("A", "B", now - 1000, now);
    expect(validLabels).toContain(sep.authority_model);

    // Constrained
    const con = evaluateIdentityAtGatewayBoundary("A", "A", now - DELEGATION_COOLDOWN_MS - 1000, now);
    expect(validLabels).toContain(con.authority_model);

    // Blocked
    const blk = evaluateIdentityAtGatewayBoundary("A", "A", now - 1000, now);
    expect(validLabels).toContain(blk.authority_model);
  });

  it("gatewayProxy.ts exports the AuthorityModel type and resolveAuthorityModel function", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/gatewayProxy.ts", "utf-8");

    expect(src).toContain("export type AuthorityModel");
    expect(src).toContain("export function resolveAuthorityModel");
    expect(src).toContain("export function evaluateIdentityAtGatewayBoundary");
    expect(src).toContain("export interface GatewayIdentityEvaluation");
  });
});

// ─── GatewayIdentityEvaluation shape completeness ──────────────

describe("GatewayIdentityEvaluation shape", () => {
  it("contains all required fields for receipt and audit trail", () => {
    const now = Date.now();
    const result = evaluateIdentityAtGatewayBoundary("A", "B", now - 1000, now);

    // All fields required by the spec
    expect(result).toHaveProperty("allowed");
    expect(result).toHaveProperty("proposer_identity_id");
    expect(result).toHaveProperty("approver_identity_id");
    expect(result).toHaveProperty("authority_model");
    expect(result).toHaveProperty("role_separation");
    expect(result).toHaveProperty("reason");
    expect(result).toHaveProperty("cooldown_remaining_ms");
    expect(result).toHaveProperty("delegation_check");

    // Types
    expect(typeof result.allowed).toBe("boolean");
    expect(typeof result.proposer_identity_id).toBe("string");
    expect(typeof result.approver_identity_id).toBe("string");
    expect(typeof result.authority_model).toBe("string");
    expect(typeof result.role_separation).toBe("string");
    expect(typeof result.reason).toBe("string");
    expect(typeof result.cooldown_remaining_ms).toBe("number");
    expect(typeof result.delegation_check).toBe("object");
  });
});
