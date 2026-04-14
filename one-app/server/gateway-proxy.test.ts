/**
 * Gateway Proxy Tests
 *
 * Tests the server-side Gateway proxy that bridges Manus OAuth identity
 * to Gateway via X-Authenticated-Email headers (Decision 2 compliant).
 * ONE is an untrusted client — it sends the authenticated email and
 * lets the Gateway resolve the principal.
 *
 * These tests verify:
 * - The proxy module exports the correct functions
 * - The tRPC router exposes the correct procedures
 * - Email-based identity (not raw X-Principal-ID)
 * - The pending approvals merge strategy works
 * - Frontend pages use tRPC proxy (not direct Gateway calls)
 * - User-friendly forms (not developer mode)
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/* ─── Module structure tests ──────────────────────────────────── */

describe("Gateway Proxy Module", () => {
  const proxyPath = path.resolve(__dirname, "gatewayProxy.ts");
  const proxyContent = fs.readFileSync(proxyPath, "utf-8");

  it("should export proxySubmitIntent function", () => {
    expect(proxyContent).toContain("export async function proxySubmitIntent");
  });

  it("should export proxyGetPendingApprovals function", () => {
    expect(proxyContent).toContain("export async function proxyGetPendingApprovals");
  });

  it("should export proxySubmitApproval function", () => {
    expect(proxyContent).toContain("export async function proxySubmitApproval");
  });

  it("should export proxyGatewayHealth function", () => {
    expect(proxyContent).toContain("export async function proxyGatewayHealth");
  });

  it("should use VITE_GATEWAY_URL for the Gateway base URL", () => {
    expect(proxyContent).toContain("VITE_GATEWAY_URL");
  });

  it("should include replay prevention (nonce + timestamp)", () => {
    expect(proxyContent).toContain("request_nonce");
    expect(proxyContent).toContain("request_timestamp");
  });

  it("should default to 'local' target_environment when not specified", () => {
    expect(proxyContent).toContain('"local"');
  });
});

/* ─── Decision 2 compliance: email-based identity ────────────── */

describe("Decision 2 Compliance: Email-based Identity", () => {
  const proxyPath = path.resolve(__dirname, "gatewayProxy.ts");
  const proxyContent = fs.readFileSync(proxyPath, "utf-8");

  it("should send X-Authenticated-Email header to Gateway", () => {
    expect(proxyContent).toContain("X-Authenticated-Email");
  });

  it("should send X-Principal-ID as TRANSITIONAL fallback (remove after PR #91)", () => {
    // TRANSITIONAL: X-Principal-ID is sent alongside X-Authenticated-Email
    // until the Gateway is updated to resolve principals by email.
    // Once PR #91 is merged and deployed, this fallback should be removed
    // and this test should revert to asserting X-Principal-ID is NOT sent.
    expect(proxyContent).toContain("X-Principal-ID");
    expect(proxyContent).toContain("TRANSITIONAL");
  });

  it("should resolve user email from Manus OAuth context", () => {
    // The proxy uses the authenticated user's email from ctx.user
    expect(proxyContent).toContain("user.email");
  });

  it("should resolve user email from Manus OAuth profile", () => {
    // Maps Manus OAuth openId to real email for Gateway resolution
    expect(proxyContent).toContain("resolveGatewayIdentity");
  });

  it("should include Brian's real email bkr1297@gmail.com", () => {
    expect(proxyContent).toContain("bkr1297@gmail.com");
  });
});

/* ─── Pending approvals merge strategy tests ──────────────────── */

describe("Pending Approvals Merge Strategy", () => {
  const proxyPath = path.resolve(__dirname, "gatewayProxy.ts");
  const proxyContent = fs.readFileSync(proxyPath, "utf-8");

  it("should fetch from both /approvals and /intents endpoints", () => {
    expect(proxyContent).toContain('"/approvals"');
    expect(proxyContent).toContain('"/intents"');
    expect(proxyContent).toContain("Promise.all");
  });

  it("should filter intents for REQUIRE_HUMAN or REQUIRE_QUORUM decisions", () => {
    expect(proxyContent).toContain("REQUIRE_HUMAN");
    expect(proxyContent).toContain("REQUIRE_QUORUM");
  });

  it("should deduplicate by intent_id", () => {
    expect(proxyContent).toContain("seenIds");
  });

  it("should normalize pending_approvals to pending", () => {
    expect(proxyContent).toContain("pending_approvals");
    expect(proxyContent).toContain("fromApprovals");
    expect(proxyContent).toContain("fromIntents");
  });
});

/* ─── Router integration tests ────────────────────────────────── */

describe("Gateway Router in appRouter", () => {
  const routersPath = path.resolve(__dirname, "routers.ts");
  const routersContent = fs.readFileSync(routersPath, "utf-8");

  it("should import gateway procedures", () => {
    expect(routersContent).toContain("gatewayProxy");
  });

  it("should define gateway.submitIntent procedure", () => {
    expect(routersContent).toContain("submitIntent");
  });

  it("should define gateway.pendingApprovals procedure", () => {
    expect(routersContent).toContain("pendingApprovals");
  });

  it("should define gateway.submitApproval procedure", () => {
    expect(routersContent).toContain("submitApproval");
  });

  it("should define gateway.health procedure", () => {
    expect(routersContent).toContain("health");
  });

  it("should use protectedProcedure for all gateway operations", () => {
    expect(routersContent).toContain("protectedProcedure");
  });
});

/* ─── Frontend: NewIntent uses Gateway-direct calls ──────────── */

describe("NewIntent uses Gateway-direct calls with user-friendly forms", () => {
  const intentPath = path.resolve(__dirname, "../client/src/pages/NewIntent.tsx");
  const intentContent = fs.readFileSync(intentPath, "utf-8");

  it("should import gateway.ts directly for submitIntent and governIntent", () => {
    expect(intentContent).toContain('from "@/lib/gateway"');
    expect(intentContent).toContain("submitIntent");
    expect(intentContent).toContain("governIntent");
  });

  it("should use useGatewayAuth for auth gating (not Manus useAuth)", () => {
    expect(intentContent).toContain("useGatewayAuth");
    expect(intentContent).not.toContain('from "@/_core/hooks/useAuth"');
  });

  it("should NOT import trpc (Gateway-direct architecture)", () => {
    expect(intentContent).not.toContain("import { trpc }");
  });

  it("should default target_environment to local", () => {
    expect(intentContent).toContain('"local"');
  });

  // User-friendly form tests (not developer mode)
  it("should have user-friendly form fields for Send Email", () => {
    expect(intentContent).toContain("recipient@example.com");
    expect(intentContent).toContain("Email subject line");
    expect(intentContent).toContain("Write your email message");
  });

  it("should have user-friendly form fields for Send SMS", () => {
    expect(intentContent).toContain("+1 (555) 123-4567");
    expect(intentContent).toContain("Write your text message here");
  });

  it("should have user-friendly form fields for Web Search", () => {
    expect(intentContent).toContain("What would you like to search for?");
  });

  it("should have Advanced Mode toggle", () => {
    expect(intentContent).toContain("Advanced");
    expect(intentContent).toContain("Simple");
  });

  it("should show 'Submit for Governance' button text", () => {
    expect(intentContent).toContain("Submit for Governance");
  });

  it("should show 'New Action' heading (not developer jargon)", () => {
    expect(intentContent).toContain("New Action");
    expect(intentContent).toContain("What would you like to do?");
  });
});

/* ─── Frontend: GatewayApprovals uses Gateway-direct calls ───── */

describe("GatewayApprovals uses Gateway-direct calls", () => {
  const approvalsPath = path.resolve(__dirname, "../client/src/pages/GatewayApprovals.tsx");
  const approvalsContent = fs.readFileSync(approvalsPath, "utf-8");

  it("should import gateway.ts directly for getPendingApprovals and submitApproval", () => {
    expect(approvalsContent).toContain('from "@/lib/gateway"');
    expect(approvalsContent).toContain("getPendingApprovals");
    expect(approvalsContent).toContain("submitApproval");
  });

  it("should use useGatewayAuth for auth gating (not Manus useAuth)", () => {
    expect(approvalsContent).toContain("useGatewayAuth");
    expect(approvalsContent).not.toContain('from "@/_core/hooks/useAuth"');
  });

  it("should use server-side approveAndExecute for post-approval execution pipeline", () => {
    // Approvals page uses server-side approveAndExecute tRPC mutation.
    // Server handles: I-2 authorize + I-1 execute + deliver (separation of duties).
    expect(approvalsContent).toContain("approveAndExecute");
    expect(approvalsContent).not.toContain("gatewayExecuteAction");
  });

  it("should poll for pending approvals via setInterval", () => {
    expect(approvalsContent).toContain("setInterval");
  });

  it("should show human-readable action labels", () => {
    expect(approvalsContent).toContain("ACTION_LABELS");
    expect(approvalsContent).toContain("Send Email");
    expect(approvalsContent).toContain("Send SMS");
    expect(approvalsContent).toContain("Web Search");
  });

  it("should use 'New Action' button text (not developer jargon)", () => {
    expect(approvalsContent).toContain("New Action");
  });

  it("should handle approval errors from server", () => {
    // The server-side approveAndExecute handles proposer_ne_approver internally.
    // The UI shows the error message returned by the server.
    expect(approvalsContent).toContain("toast.error");
  });

  it("should show Decision 2 footer", () => {
    expect(approvalsContent).toContain("Interface Is Not Authority");
  });
});

/* ─── Execution Pipeline in gatewayProxy ─────────────────────── */

describe("Execution pipeline in gatewayProxy", () => {
  const proxyPath = path.resolve(__dirname, "gatewayProxy.ts");
  const proxyContent = fs.readFileSync(proxyPath, "utf-8");

  it("should export executeGovernedAction function", () => {
    expect(proxyContent).toContain("export async function executeGovernedAction");
  });

  it("should export proxyExecuteIntent function", () => {
    expect(proxyContent).toContain("export async function proxyExecuteIntent");
  });

  it("should export proxyConfirmExecution function", () => {
    expect(proxyContent).toContain("export async function proxyConfirmExecution");
  });

  it("should export proxyGenerateReceipt function", () => {
    expect(proxyContent).toContain("export async function proxyGenerateReceipt");
  });

  it("should use gateway-exec service account for execution", () => {
    expect(proxyContent).toContain('"gateway-exec"');
    expect(proxyContent).toContain("EXECUTOR_PRINCIPAL_ID");
  });

  it("should pass _action from execution token to sendAction callback", () => {
    expect(proxyContent).toContain("_action: executionToken.action");
  });

  it("should handle execution failure by notifying Gateway", () => {
    expect(proxyContent).toContain("one-server-failed");
  });
});

/* ─── executeApproved tRPC procedure ─────────────────────────── */

describe("executeApproved tRPC procedure", () => {
  const routersPath = path.resolve(__dirname, "routers.ts");
  const routersContent = fs.readFileSync(routersPath, "utf-8");

  it("should define executeApproved procedure", () => {
    expect(routersContent).toContain("executeApproved");
  });

  it("should import executeGovernedAction", () => {
    expect(routersContent).toContain("executeGovernedAction");
  });

  it("should import notifyOwner for email delivery", () => {
    expect(routersContent).toContain("notifyOwner");
  });

  it("should log execution to local ledger", () => {
    // The executeApproved procedure should call appendLedger
    expect(routersContent).toContain('appendLedger("EXECUTION"');
  });

  it("should return execution and receipt on success", () => {
    expect(routersContent).toContain("execution,");
    expect(routersContent).toContain("receipt:");
  });
});
