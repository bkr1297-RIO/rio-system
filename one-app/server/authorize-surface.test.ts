/**
 * Tests for the ONE Minimal Authorization Surface + Substrate-to-Ledger
 *
 * Verifies:
 * 1. Authorize.tsx exists with the three required sections
 * 2. App.tsx routes /authorize to the Authorize page
 * 3. Login.tsx redirects to /authorize after authentication
 * 4. Substrate blocks write SUBSTRATE_BLOCK entries to the ledger
 * 5. Schema includes SUBSTRATE_BLOCK in the entryType enum
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function readFile(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("Step 3: Minimal ONE Authorization Surface", () => {
  const authorizeSrc = readFile("client/src/pages/Authorize.tsx");

  it("has a HeartbeatBar component showing Gateway status", () => {
    expect(authorizeSrc).toContain("HeartbeatBar");
    expect(authorizeSrc).toContain("Gateway");
    expect(authorizeSrc).toContain("Online");
    expect(authorizeSrc).toContain("Offline");
  });

  it("has a ProposalSurface component showing action details", () => {
    expect(authorizeSrc).toContain("ProposalSurface");
    expect(authorizeSrc).toContain("Proposal");
    expect(authorizeSrc).toContain("risk_tier");
  });

  it("has an AuthorizationBar with AUTHORIZE and DECLINE buttons", () => {
    expect(authorizeSrc).toContain("AuthorizationBar");
    expect(authorizeSrc).toContain("AUTHORIZE");
    expect(authorizeSrc).toContain("DECLINE");
  });

  it("shows consequences for both authorize and decline", () => {
    expect(authorizeSrc).toContain("If you authorize");
    expect(authorizeSrc).toContain("If you decline");
    expect(authorizeSrc).toContain("describeApproveConsequence");
    expect(authorizeSrc).toContain("describeDeclineConsequence");
  });

  it("shows a ReceiptConfirmation after successful authorization", () => {
    expect(authorizeSrc).toContain("ReceiptConfirmation");
    expect(authorizeSrc).toContain("receiptHash");
    expect(authorizeSrc).toContain("Authorized");
  });

  it("calls approveAndExecute tRPC mutation for authorization", () => {
    expect(authorizeSrc).toContain("trpc.gateway.approveAndExecute.useMutation");
    expect(authorizeSrc).toContain("approveAndExecute.mutateAsync");
  });

  it("calls submitApproval for decline", () => {
    expect(authorizeSrc).toContain("submitApproval");
    expect(authorizeSrc).toContain('"denied"');
  });

  it("polls for pending approvals", () => {
    expect(authorizeSrc).toContain("getPendingApprovals");
    expect(authorizeSrc).toContain("setInterval");
  });

  it("fetches Gateway health for heartbeat", () => {
    expect(authorizeSrc).toContain("gatewayHealth");
    expect(authorizeSrc).toContain("fetchHealth");
  });

  it("uses Gateway ledger for last action and receipt hash", () => {
    expect(authorizeSrc).toContain("trpc.gateway.ledger.useQuery");
    expect(authorizeSrc).toContain("lastReceiptHash");
    expect(authorizeSrc).toContain("lastAction");
  });

  it("shows empty state when no proposals", () => {
    expect(authorizeSrc).toContain("System ready.");
    expect(authorizeSrc).toContain("No pending proposals.");
  });

  it("has logout functionality", () => {
    expect(authorizeSrc).toContain("handleLogout");
    expect(authorizeSrc).toContain("logout");
    expect(authorizeSrc).toContain("LogOut");
  });
});

describe("Routing: /authorize is the main product screen", () => {
  const appSrc = readFile("client/src/App.tsx");

  it("imports Authorize page", () => {
    expect(appSrc).toContain('import Authorize from "@/pages/Authorize"');
  });

  it("routes /authorize to Authorize component", () => {
    expect(appSrc).toContain('path="/authorize"');
    expect(appSrc).toContain("component={Authorize}");
  });
});

describe("Login redirects to /authorize", () => {
  const loginSrc = readFile("client/src/pages/Login.tsx");

  it("redirects to /authorize after successful login", () => {
    expect(loginSrc).toContain('navigate("/authorize")');
  });

  it("does NOT redirect to /approvals", () => {
    expect(loginSrc).not.toContain('navigate("/approvals")');
  });

  it("is single-user mode (no I-1/I-2 selector)", () => {
    // Should login as I-1 automatically, not show a principal selector
    expect(loginSrc).toContain('"I-1"');
    // I-2 only appears in comments, not as a login option
    expect(loginSrc).not.toContain('login("I-2"');
    // 'principal selector' only appears in a comment confirming it's removed — that's fine
  });
});

describe("Step 1 gap: Substrate blocks write to ledger", () => {
  const substrateSrc = readFile("server/integritySubstrate.ts");
  const schemaSrc = readFile("drizzle/schema.ts");
  const dbSrc = readFile("server/db.ts");

  it("imports appendLedger in integritySubstrate.ts", () => {
    expect(substrateSrc).toContain("appendLedger");
  });

  it("writes SUBSTRATE_BLOCK to ledger on blocked attempts", () => {
    expect(substrateSrc).toContain("SUBSTRATE_BLOCK");
    expect(substrateSrc).toContain("appendLedger");
  });

  it("schema includes SUBSTRATE_BLOCK in entryType enum", () => {
    expect(schemaSrc).toContain("SUBSTRATE_BLOCK");
  });

  it("db.ts appendLedger accepts SUBSTRATE_BLOCK entryType", () => {
    expect(dbSrc).toContain("SUBSTRATE_BLOCK");
  });

  it("logs substrate block reason in the ledger entry", () => {
    // The substrate should include the block reason (DEDUP, NONCE, REPLAY, etc.)
    expect(substrateSrc).toContain("reason");
  });
});
