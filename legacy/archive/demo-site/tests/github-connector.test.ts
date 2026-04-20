/**
 * GitHub Connector Governed Flow Tests
 *
 * Tests the complete governance pipeline for GitHub actions:
 * intent → policy check → approval → execution → receipt → ledger
 *
 * API contract notes:
 * - approve/deny input: { intentId } (no reason field; identity from ctx.user)
 * - approve returns: { intentId, decision: "approved", decidedBy, ... }
 * - deny returns: { intentId, decision: "denied", decidedBy, ... }
 * - execute returns: { allowed, httpStatus, intentId, receipt, ledger_entry }
 * - execute for denied intent returns { allowed: false } (does NOT throw)
 * - receipt uses receipt_id (not id)
 * - verifyReceipt returns: { found, signatureValid, hashValid, ledgerRecorded, ... }
 * - connectorExecute returns: { success, connector, action, mode, detail, ... }
 */

import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "rio-github-test",
    email: "brian@rio.dev",
    name: "Brian Rasmussen",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("GitHub Connector — Governed Flow", () => {
  const authCaller = appRouter.createCaller(createAuthContext());
  const publicCaller = appRouter.createCaller(createPublicContext());

  it("creates an intent for a GitHub issue", async () => {
    const intent = await publicCaller.rio.createIntent({
      action: "create_issue",
      description: "Create a governed issue in bkr1297-RIO/rio-system",
      requestedBy: "Bondi AI",
    });

    expect(intent.intentId).toBeDefined();
    expect(intent.action).toBe("create_issue");
    expect(intent.status).toBe("pending");
  });

  it("creates an intent for a GitHub commit", async () => {
    const intent = await publicCaller.rio.createIntent({
      action: "commit_file",
      description: "Commit a governed file to bkr1297-RIO/rio-system",
      requestedBy: "Bondi AI",
    });

    expect(intent.intentId).toBeDefined();
    expect(intent.action).toBe("commit_file");
    expect(intent.status).toBe("pending");
  });

  it("approves a GitHub intent using authenticated identity", async () => {
    const intent = await publicCaller.rio.createIntent({
      action: "create_issue",
      description: "Governed GitHub issue",
      requestedBy: "Bondi AI",
    });

    const result = await authCaller.rio.approve({
      intentId: intent.intentId,
    });

    // approve returns { decision, decidedBy, ... } — not status/approved_by
    expect(result.decision).toBe("approved");
    expect(result.decidedBy).toBe("Brian Rasmussen");
  });

  it("executes a GitHub issue via connector in simulated mode", async () => {
    const intent = await publicCaller.rio.createIntent({
      action: "create_issue",
      description: "Governed GitHub issue for simulation",
      requestedBy: "Bondi AI",
    });

    await authCaller.rio.approve({
      intentId: intent.intentId,
    });

    const executed = await authCaller.rio.execute({ intentId: intent.intentId });
    expect(executed.allowed).toBe(true);
    expect(executed.receipt).toBeDefined();
    expect(executed.receipt.receipt_hash).toBeDefined();

    // Execute via connector in simulated mode
    const connectorResult = await publicCaller.rio.connectorExecute({
      intentId: intent.intentId,
      receiptId: executed.receipt.receipt_id,
      action: "create_issue",
      parameters: {
        repo: "bkr1297-RIO/rio-system",
        title: "Test Governed Issue",
        body: "This is a test governed issue.",
        labels: "rio-governed",
      },
      mode: "simulated",
    });

    expect(connectorResult.success).toBe(true);
    expect(connectorResult.connector).toBe("github");
    expect(connectorResult.detail).toContain("Simulated");
  });

  it("executes a GitHub commit via connector in simulated mode", async () => {
    const intent = await publicCaller.rio.createIntent({
      action: "commit_file",
      description: "Governed GitHub commit for simulation",
      requestedBy: "Bondi AI",
    });

    await authCaller.rio.approve({
      intentId: intent.intentId,
    });

    const executed = await authCaller.rio.execute({ intentId: intent.intentId });
    expect(executed.allowed).toBe(true);

    const connectorResult = await publicCaller.rio.connectorExecute({
      intentId: intent.intentId,
      receiptId: executed.receipt.receipt_id,
      action: "commit_file",
      parameters: {
        repo: "bkr1297-RIO/rio-system",
        path: "test/governed-test.json",
        content: '{"test": true}',
        message: "RIO governed test commit",
      },
      mode: "simulated",
    });

    expect(connectorResult.success).toBe(true);
    expect(connectorResult.connector).toBe("github");
    expect(connectorResult.detail).toContain("Simulated");
  });

  it("denies a GitHub intent and prevents execution", async () => {
    const intent = await publicCaller.rio.createIntent({
      action: "create_issue",
      description: "This should be denied",
      requestedBy: "Bondi AI",
    });

    const result = await authCaller.rio.deny({
      intentId: intent.intentId,
    });

    // deny returns { decision: "denied", decidedBy, ... }
    expect(result.decision).toBe("denied");

    // Execute returns { allowed: false } for denied intents (does NOT throw)
    const executed = await authCaller.rio.execute({ intentId: intent.intentId });
    expect(executed.allowed).toBe(false);
    expect(executed.httpStatus).toBe(403);
  });

  it("generates a receipt with valid hash for GitHub action", async () => {
    const intent = await publicCaller.rio.createIntent({
      action: "create_issue",
      description: "Receipt chain test",
      requestedBy: "Bondi AI",
    });

    await authCaller.rio.approve({
      intentId: intent.intentId,
    });

    const executed = await authCaller.rio.execute({ intentId: intent.intentId });
    expect(executed.allowed).toBe(true);
    const receipt = executed.receipt;

    expect(receipt.receipt_hash).toBeDefined();
    expect(receipt.receipt_hash.length).toBe(64); // SHA-256 hex

    // Verify the receipt
    const verification = await publicCaller.rio.verifyReceipt({
      receiptId: receipt.receipt_id,
    });

    expect(verification.found).toBe(true);
    expect(verification.hashValid).toBe(true);
    expect(verification.signatureValid).toBe(true);
    expect(verification.receipt?.receipt_hash).toBe(receipt.receipt_hash);
  });

  it("full pipeline: intent → approve → execute → connector → verify", async () => {
    // 1. Create intent
    const intent = await publicCaller.rio.createIntent({
      action: "create_issue",
      description: "Full pipeline test for GitHub connector",
      requestedBy: "Bondi AI",
    });
    expect(intent.status).toBe("pending");

    // 2. Approve with authenticated identity
    const approved = await authCaller.rio.approve({
      intentId: intent.intentId,
    });
    expect(approved.decision).toBe("approved");
    expect(approved.decidedBy).toBe("Brian Rasmussen");

    // 3. Execute (generates receipt + ledger entry)
    const executed = await authCaller.rio.execute({ intentId: intent.intentId });
    expect(executed.allowed).toBe(true);
    expect(executed.receipt).toBeDefined();
    expect(executed.ledger_entry).toBeDefined();

    // 4. Execute via GitHub connector (simulated)
    const connectorResult = await publicCaller.rio.connectorExecute({
      intentId: intent.intentId,
      receiptId: executed.receipt.receipt_id,
      action: "create_issue",
      parameters: {
        repo: "bkr1297-RIO/rio-system",
        title: "Full Pipeline Test Issue",
        body: "Created through the complete RIO governance pipeline.",
      },
      mode: "simulated",
    });
    expect(connectorResult.success).toBe(true);
    expect(connectorResult.connector).toBe("github");

    // 5. Verify receipt
    const verification = await publicCaller.rio.verifyReceipt({
      receiptId: executed.receipt.receipt_id,
    });
    expect(verification.found).toBe(true);
    expect(verification.hashValid).toBe(true);
    expect(verification.signatureValid).toBe(true);
    expect(verification.ledgerRecorded).toBe(true);
  });
});
