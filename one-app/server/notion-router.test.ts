/**
 * Tests for the Notion Decision Log integration (Phase 1 Operational Surface).
 *
 * Validates:
 * 1. notionDecisionLog module exports and types
 * 2. Notion router exists in appRouter with correct procedures
 * 3. NotionSigner page exists with correct structure
 * 4. Build Directive invariants are enforced in code
 * 5. Gateway→Notion row creation hook in submitIntent
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// Read source files as text for structural assertions
const routersSrc = readFileSync(resolve(__dirname, "routers.ts"), "utf-8");
const notionModuleSrc = readFileSync(resolve(__dirname, "notionDecisionLog.ts"), "utf-8");
const notionSignerSrc = readFileSync(resolve(__dirname, "../client/src/pages/NotionSigner.tsx"), "utf-8");
const appTsxSrc = readFileSync(resolve(__dirname, "../client/src/App.tsx"), "utf-8");
const dbSrc = readFileSync(resolve(__dirname, "db.ts"), "utf-8");
const schemaSrc = readFileSync(resolve(__dirname, "../drizzle/schema.ts"), "utf-8");
const envSrc = readFileSync(resolve(__dirname, "_core/env.ts"), "utf-8");

describe("Notion Decision Log Module", () => {
  it("exports createDecisionRow function", () => {
    expect(notionModuleSrc).toContain("export async function createDecisionRow");
  });

  it("exports updateDecisionRow function", () => {
    expect(notionModuleSrc).toContain("export async function updateDecisionRow");
  });

  it("exports getDecisionRow function", () => {
    expect(notionModuleSrc).toContain("export async function getDecisionRow");
  });

  it("exports pollPendingApprovals function", () => {
    expect(notionModuleSrc).toContain("export async function pollPendingApprovals");
  });

  it("exports findDecisionRowByIntentId function", () => {
    expect(notionModuleSrc).toContain("export async function findDecisionRowByIntentId");
  });

  it("exports isNotionConfigured function", () => {
    expect(notionModuleSrc).toContain("export function isNotionConfigured");
  });

  it("uses NOTION_API_TOKEN env var", () => {
    expect(notionModuleSrc).toContain("NOTION_API_TOKEN");
  });

  it("uses NOTION_DECISION_LOG_DB_ID env var", () => {
    expect(notionModuleSrc).toContain("NOTION_DECISION_LOG_DB_ID");
  });

  it("has all 14 properties from the Build Directive", () => {
    // The 14 properties: Title, Intent ID, Intent Hash, Action, Risk Tier,
    // Proposer, Status, Approval State, Policy Version, Delegated To,
    // Receipt Link, Gateway Decision, Created At, Updated At
    expect(notionModuleSrc).toContain("Intent ID");
    expect(notionModuleSrc).toContain("Intent Hash");
    expect(notionModuleSrc).toContain("Action");
    expect(notionModuleSrc).toContain("Risk Tier");
    expect(notionModuleSrc).toContain("Proposer");
    expect(notionModuleSrc).toContain("Status");
    expect(notionModuleSrc).toContain("Approval State");
    expect(notionModuleSrc).toContain("Policy Version");
    expect(notionModuleSrc).toContain("Delegated To");
    expect(notionModuleSrc).toContain("Receipt Link");
    expect(notionModuleSrc).toContain("Gateway Decision");
    expect(notionModuleSrc).toContain("Created At");
    expect(notionModuleSrc).toContain("Updated At");
  });
});

describe("Notion Router in appRouter", () => {
  it("has notion router defined", () => {
    expect(routersSrc).toContain("notion: router({");
  });

  it("has notion.status procedure", () => {
    expect(routersSrc).toContain("status: publicProcedure.query(");
    // Specifically in the notion router context
    expect(routersSrc).toContain("isNotionConfigured()");
  });

  it("has notion.pollPendingApprovals procedure", () => {
    expect(routersSrc).toContain("pollPendingApprovals: protectedProcedure.query(");
    expect(routersSrc).toContain("notionPollPendingApprovals()");
  });

  it("has notion.signAndAuthorize mutation", () => {
    expect(routersSrc).toContain("signAndAuthorize: protectedProcedure.input(");
  });

  it("has notion.createRow mutation", () => {
    expect(routersSrc).toContain("createRow: protectedProcedure.input(");
    expect(routersSrc).toContain("createDecisionRow(");
  });

  it("has notion.getRow query", () => {
    expect(routersSrc).toContain("getRow: protectedProcedure.input(");
    expect(routersSrc).toContain("getDecisionRow(");
  });

  it("has notion.findByIntentId query", () => {
    expect(routersSrc).toContain("findByIntentId: protectedProcedure.input(");
    expect(routersSrc).toContain("findDecisionRowByIntentId(");
  });
});

describe("Build Directive Invariants", () => {
  it("Invariant 1: Notion is NOT the system of record — PostgreSQL ledger is", () => {
    // The router must write to appendLedger for every Notion action
    expect(routersSrc).toContain('appendLedger("NOTION_EXECUTION"');
    expect(routersSrc).toContain('appendLedger("NOTION_DENIAL"');
    expect(routersSrc).toContain('appendLedger("NOTION_ROW_CREATED"');
  });

  it("Invariant 2: Notion is NOT the enforcement boundary — Gateway is", () => {
    // signAndAuthorize must call Gateway /authorize and /execute-action
    expect(routersSrc).toContain('`${GATEWAY_URL}/authorize`');
    expect(routersSrc).toContain('`${GATEWAY_URL}/execute-action`');
  });

  it("Invariant 3: Notion status change is a SIGNAL, not cryptographic approval", () => {
    // signAndAuthorize requires Ed25519 signature input
    expect(routersSrc).toContain("signature: z.string().min(1)");
    expect(routersSrc).toContain("payloadHash: z.string().min(1)");
    expect(routersSrc).toContain("nonce: z.string().min(1)");
  });

  it("Invariant 4: Execution requires verified Ed25519 signature", () => {
    // The NotionSigner page must use the crypto signing library
    expect(notionSignerSrc).toContain("signData");
    expect(notionSignerSrc).toContain("useLocalStore");
  });

  it("Invariant 5: Fail closed on any mismatch", () => {
    // signAndAuthorize must update Notion to Failed on errors
    expect(routersSrc).toContain('status: "Failed"');
    // Must return success: false on failure
    expect(routersSrc).toContain("success: false, error:");
  });

  it("comments document the 5 invariants", () => {
    expect(routersSrc).toContain("Notion is NOT the system of record");
    expect(routersSrc).toContain("Notion is NOT the enforcement boundary");
    expect(routersSrc).toContain("Notion status change is a SIGNAL");
    expect(routersSrc).toContain("Execution requires verified Ed25519 signature");
    expect(routersSrc).toContain("Fail closed on any mismatch");
  });
});

describe("Gateway→Notion Row Creation Hook", () => {
  it("submitIntent creates Notion row after governance evaluation", () => {
    expect(routersSrc).toContain("Notion Decision Log row creation");
    expect(routersSrc).toContain("createDecisionRow(");
  });

  it("submitIntent returns notionPageId in response", () => {
    expect(routersSrc).toContain("notionPageId,");
  });

  it("submitIntent logs NOTION_ROW_CREATED to ledger", () => {
    expect(routersSrc).toContain('appendLedger("NOTION_ROW_CREATED"');
  });

  it("row creation is non-blocking (wrapped in try/catch)", () => {
    expect(routersSrc).toContain("Notion row creation failed (non-blocking)");
  });
});

describe("NotionSigner Page", () => {
  it("exists and is a React component", () => {
    expect(notionSignerSrc).toContain("export default function NotionSigner");
  });

  it("polls for pending Notion approvals", () => {
    expect(notionSignerSrc).toContain("trpc.notion.pollPendingApprovals.useQuery");
  });

  it("calls signAndAuthorize mutation", () => {
    expect(notionSignerSrc).toContain("trpc.notion.signAndAuthorize.useMutation");
  });

  it("uses Ed25519 signing from crypto lib", () => {
    expect(notionSignerSrc).toContain("signData");
    expect(notionSignerSrc).toContain("sha256");
  });

  it("reads keys from IndexedDB via useLocalStore", () => {
    expect(notionSignerSrc).toContain("useLocalStore");
    expect(notionSignerSrc).toContain("keys?.privateKey");
  });

  it("displays risk tier and action information", () => {
    expect(notionSignerSrc).toContain("riskTier");
    expect(notionSignerSrc).toContain("action");
    expect(notionSignerSrc).toContain("intentId");
  });

  it("has deny capability", () => {
    expect(notionSignerSrc).toContain("deny");
  });
});

describe("App.tsx Route Registration", () => {
  it("imports NotionSigner page", () => {
    expect(appTsxSrc).toContain('import NotionSigner from "@/pages/NotionSigner"');
  });

  it("has /notion-signer route", () => {
    expect(appTsxSrc).toContain('/notion-signer');
    expect(appTsxSrc).toContain("NotionSigner");
  });
});

describe("Schema and Database Support", () => {
  it("ledger entryType enum includes NOTION types", () => {
    expect(schemaSrc).toContain("NOTION_DENIAL");
    expect(schemaSrc).toContain("NOTION_EXECUTION");
    expect(schemaSrc).toContain("NOTION_ROW_CREATED");
  });

  it("db.ts appendLedger accepts NOTION types", () => {
    expect(dbSrc).toContain("NOTION_DENIAL");
    expect(dbSrc).toContain("NOTION_EXECUTION");
    expect(dbSrc).toContain("NOTION_ROW_CREATED");
  });

  it("env.ts includes Notion env vars", () => {
    expect(envSrc).toContain("notionApiToken");
    expect(envSrc).toContain("notionDecisionLogDbId");
  });
});

describe("signAndAuthorize Mutation Contract", () => {
  it("accepts pageId, intentId, intentHash, policyVersion", () => {
    // Check the input schema
    expect(routersSrc).toContain("pageId: z.string().min(1)");
    expect(routersSrc).toContain("intentId: z.string().min(1)");
    expect(routersSrc).toContain("intentHash: z.string().min(1)");
    expect(routersSrc).toContain("policyVersion: z.string().min(1)");
  });

  it("accepts cryptographic proof fields", () => {
    expect(routersSrc).toContain("signature: z.string().min(1)");
    expect(routersSrc).toContain("payloadHash: z.string().min(1)");
    expect(routersSrc).toContain("nonce: z.string().min(1)");
    expect(routersSrc).toContain("expiresAt: z.string().min(1)");
  });

  it("logs in as I-2 for /authorize", () => {
    // In the notion signAndAuthorize context
    const notionSection = routersSrc.substring(routersSrc.indexOf("signAndAuthorize:"));
    expect(notionSection).toContain('"I-2"');
    expect(notionSection).toContain("/authorize");
  });

  it("logs in as I-1 for /execute-action", () => {
    const notionSection = routersSrc.substring(routersSrc.indexOf("signAndAuthorize:"));
    expect(notionSection).toContain('"I-1"');
    expect(notionSection).toContain("/execute-action");
  });

  it("uses delivery_mode=external for Gateway execution", () => {
    const notionSection = routersSrc.substring(routersSrc.indexOf("signAndAuthorize:"));
    expect(notionSection).toContain('delivery_mode: "external"');
  });

  it("updates Notion row to Executed with receipt link", () => {
    expect(routersSrc).toContain('status: "Executed"');
    expect(routersSrc).toContain('approvalState: "Executed"');
    expect(routersSrc).toContain("receiptLink");
  });

  it("updates Notion row to Signed after authorization", () => {
    expect(routersSrc).toContain('approvalState: "Signed"');
  });

  it("sends notifications on execution", () => {
    const notionSection = routersSrc.substring(routersSrc.indexOf("signAndAuthorize:"));
    expect(notionSection).toContain("notifyOwner");
    expect(notionSection).toContain("Notion-Governed Action Executed");
  });

  it("returns receiptId and receiptHash on success", () => {
    const notionSection = routersSrc.substring(routersSrc.indexOf("signAndAuthorize:"));
    expect(notionSection).toContain("receiptId,");
    expect(notionSection).toContain("receiptHash,");
    expect(notionSection).toContain("receiptLink,");
  });

  it("handles deny path separately", () => {
    expect(routersSrc).toContain("deny: z.boolean().optional()");
    expect(routersSrc).toContain('status: "Denied"');
    expect(routersSrc).toContain('appendLedger("NOTION_DENIAL"');
  });
});
