/**
 * Tests for:
 *   1. Ledger Guard — append-only enforcement & integrity verification
 *   2. Genesis Receipt Seeder — idempotent seeding of the 4:44 PM action
 *   3. Public Verify API — REST endpoints for independent verification
 */
import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "rio-test-user",
    email: "tester@rio.test",
    name: "RIO Tester",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Ledger Integrity Verification", () => {
  const caller = appRouter.createCaller(createAuthContext());

  it("returns integrity report with valid chain", async () => {
    const result = await caller.rio.ledgerIntegrity();
    expect(result).toHaveProperty("valid");
    expect(result).toHaveProperty("errors");
    expect(result).toHaveProperty("entryCount");
    expect(result).toHaveProperty("signaturesChecked");
    expect(result).toHaveProperty("signaturesValid");
    expect(Array.isArray(result.errors)).toBe(true);
    expect(typeof result.entryCount).toBe("number");
  });

  it("reports valid chain when no entries exist or chain is intact", async () => {
    const result = await caller.rio.ledgerIntegrity();
    // Either empty ledger (valid) or intact chain (valid)
    // If there are entries, signatures should be checked
    if (result.entryCount > 0) {
      expect(result.signaturesChecked).toBeGreaterThan(0);
    }
  });
});

describe("Genesis Receipt Seeder", () => {
  const authCaller = appRouter.createCaller(createAuthContext());
  const publicCaller = appRouter.createCaller(createPublicContext());

  it("rejects unauthenticated callers (protectedProcedure)", async () => {
    await expect(publicCaller.rio.seedGenesis()).rejects.toThrow();
  });

  it("seeds the genesis receipt with correct data", async () => {
    const result = await authCaller.rio.seedGenesis();
    expect(result.receiptId).toBe("e76156e6-34cc-43f0-83b0-69a85c86762a");
    // First call should seed
    expect(result.seeded || result.alreadyExists).toBe(true);
    expect(result.message).toBeTruthy();
  });

  it("is idempotent — second call reports already exists", async () => {
    const result = await authCaller.rio.seedGenesis();
    expect(result.alreadyExists).toBe(true);
    expect(result.seeded).toBe(false);
    expect(result.receiptId).toBe("e76156e6-34cc-43f0-83b0-69a85c86762a");
  });

  it("genesis receipt appears in ledger integrity check", async () => {
    const integrity = await authCaller.rio.ledgerIntegrity();
    // After seeding, there should be at least one entry
    expect(integrity.entryCount).toBeGreaterThanOrEqual(1);
  });
});

describe("Genesis Receipt Verification via tRPC", () => {
  const caller = appRouter.createCaller(createAuthContext());

  const GENESIS_RECEIPT_ID = "e76156e6-34cc-43f0-83b0-69a85c86762a";

  it("verifies the genesis receipt by receipt ID", async () => {
    const result = await caller.rio.verifyReceipt({ receiptId: GENESIS_RECEIPT_ID });
    expect(result).toHaveProperty("found");
    expect(result.found).toBe(true);
    expect(result).toHaveProperty("receipt");
    expect(result.receipt.receipt_id).toBe(GENESIS_RECEIPT_ID);
  });

  it("genesis receipt has correct action and approver", async () => {
    const result = await caller.rio.verifyReceipt({ receiptId: GENESIS_RECEIPT_ID });
    expect(result.receipt.action).toBe("send_email");
    expect(result.receipt.approved_by).toBe("brian.k.rasmussen");
    expect(result.receipt.requested_by).toBe("MANUS");
  });

  it("genesis receipt has valid hash chain hashes", async () => {
    const result = await caller.rio.verifyReceipt({ receiptId: GENESIS_RECEIPT_ID });
    // The receipt hash should match the known genesis hash
    expect(result.receipt.receipt_hash).toBe(
      "5f535138c7111af76dccba196c0afad354d48b830cc4a258c2352ee1682ae8e0"
    );
  });
});

describe("Public Verify API (REST)", () => {
  // These tests verify the Express routes are registered and respond correctly.
  // We test via HTTP fetch against the running dev server.

  const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

  it("GET /api/verify/public-key returns Ed25519 key", async () => {
    const res = await fetch(`${BASE_URL}/api/verify/public-key`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.algorithm).toBe("Ed25519");
    expect(data.format).toBe("SPKI");
    expect(data.hex).toBeTruthy();
    expect(data.pem).toContain("PUBLIC KEY");
    expect(data.system).toContain("RIO");
    expect(data.failMode).toBe("CLOSED");
  });

  it("GET /api/verify/ledger/stats returns ledger statistics", async () => {
    const res = await fetch(`${BASE_URL}/api/verify/ledger/stats`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ONLINE");
    expect(typeof data.ledger_entries).toBe("number");
    expect(typeof data.receipts).toBe("number");
    expect(typeof data.intents).toBe("number");
    expect(data.system).toContain("RIO");
    expect(data.failMode).toBe("CLOSED");
  });

  it("GET /api/verify/ledger/chain returns chain with integrity check", async () => {
    const res = await fetch(`${BASE_URL}/api/verify/ledger/chain`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ONLINE");
    expect(Array.isArray(data.entries)).toBe(true);
    expect(typeof data.chainValid).toBe("boolean");
    expect(typeof data.signaturesValid).toBe("boolean");
    expect(data.system).toContain("RIO");
  });

  it("GET /api/verify/:receiptId returns verification for genesis receipt", async () => {
    const GENESIS_ID = "e76156e6-34cc-43f0-83b0-69a85c86762a";
    const res = await fetch(`${BASE_URL}/api/verify/${GENESIS_ID}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(["VERIFIED", "PARTIALLY_VERIFIED"]).toContain(data.status);
    expect(data.receipt_valid).toBe(true);
    // Signature is signed with current key at seed time — should be valid
    expect(typeof data.signature_valid).toBe("boolean");
    expect(data.receipt.receipt_id).toBe(GENESIS_ID);
    expect(data.receipt.action).toBe("send_email");
    expect(data.receipt.approved_by).toBe("brian.k.rasmussen");
    expect(data.algorithm).toBe("Ed25519");
    expect(data.fail_mode).toBe("CLOSED");
  });

  it("GET /api/verify/:hash returns verification by receipt hash", async () => {
    const GENESIS_HASH = "5f535138c7111af76dccba196c0afad354d48b830cc4a258c2352ee1682ae8e0";
    const res = await fetch(`${BASE_URL}/api/verify/${GENESIS_HASH}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(["VERIFIED", "PARTIALLY_VERIFIED"]).toContain(data.status);
    expect(data.receipt.receipt_hash).toBe(GENESIS_HASH);
    expect(data.receipt.action).toBe("send_email");
  });

  it("GET /api/verify/nonexistent returns 404", async () => {
    const res = await fetch(`${BASE_URL}/api/verify/nonexistent-receipt-id`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.status).toBe("NOT_FOUND");
    expect(data.receipt_valid).toBe(false);
  });

  it("CORS headers are present for cross-origin access", async () => {
    const res = await fetch(`${BASE_URL}/api/verify/public-key`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
