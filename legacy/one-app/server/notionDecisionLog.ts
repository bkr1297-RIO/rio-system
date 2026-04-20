/**
 * Notion Decision Log — Server-side integration module.
 *
 * Invariants (from Observer Agent build directive):
 *   1. Notion is NOT the system of record — PostgreSQL ledger is.
 *   2. Notion is NOT the enforcement boundary — Gateway is.
 *   3. Changing status in Notion is a SIGNAL, not cryptographic approval.
 *   4. Execution requires a verified Ed25519 signature.
 *   5. Fail closed on any mismatch.
 *
 * This module provides:
 *   - createDecisionRow()  — write a new Pending row when an intent is governed
 *   - updateDecisionRow()  — update status/approval state/receipt after execution
 *   - getDecisionRow()     — fetch a single row by Notion page ID
 *   - pollPendingApprovals() — find rows where Status=Approved AND Approval State=Unsigned
 *                              (Brian set "Approved" in Notion → signer flow trigger)
 */

import { ENV } from "./_core/env";

// ─── Constants ─────────────────────────────────────────────────────
const NOTION_API_VERSION = "2022-06-28";
const NOTION_BASE_URL = "https://api.notion.com/v1";

// ─── Types ─────────────────────────────────────────────────────────

export type NotionStatus = "Pending" | "Approved" | "Denied" | "Failed" | "Executed";
export type NotionApprovalState = "Unsigned" | "Signed" | "Executed";
export type NotionGatewayDecision = "Allow" | "ReviewRequired" | "Deny";
export type NotionRiskTier = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type NotionAction = "send_email" | "github_commit" | "web_search" | "drive_read" | "drive_write" | "send_sms" | "draft_email";
export type NotionProposer = "bondi" | "manus" | "manny" | "brian";

export interface DecisionRowInput {
  title: string;
  intentId: string;
  intentHash: string;
  action: NotionAction;
  riskTier: NotionRiskTier;
  proposer: NotionProposer;
  policyVersion: string;
  gatewayDecision: NotionGatewayDecision;
  delegatedTo?: string;
}

export interface DecisionRowUpdate {
  status?: NotionStatus;
  approvalState?: NotionApprovalState;
  receiptLink?: string;
  gatewayDecision?: NotionGatewayDecision;
  delegatedTo?: string;
}

export interface DecisionRow {
  pageId: string;
  title: string;
  intentId: string;
  intentHash: string;
  action: string;
  riskTier: string;
  proposer: string;
  status: string;
  approvalState: string;
  policyVersion: string;
  delegatedTo: string;
  receiptLink: string;
  gatewayDecision: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ───────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const token = ENV.notionApiToken;
  if (!token) {
    throw new Error("[NotionDecisionLog] NOTION_API_TOKEN not configured");
  }
  return {
    "Authorization": `Bearer ${token}`,
    "Notion-Version": NOTION_API_VERSION,
    "Content-Type": "application/json",
  };
}

function getDatabaseId(): string {
  const dbId = ENV.notionDecisionLogDbId;
  if (!dbId) {
    throw new Error("[NotionDecisionLog] NOTION_DECISION_LOG_DB_ID not configured");
  }
  return dbId;
}

/** Extract plain text from a Notion rich_text array */
function extractText(richText: Array<{ plain_text?: string }> | undefined): string {
  if (!richText || richText.length === 0) return "";
  return richText.map(t => t.plain_text || "").join("");
}

/** Extract select value from a Notion select property */
function extractSelect(select: { name?: string } | null | undefined): string {
  return select?.name || "";
}

/** Extract URL from a Notion URL property */
function extractUrl(url: string | null | undefined): string {
  return url || "";
}

/** Extract title from a Notion title property */
function extractTitle(title: Array<{ plain_text?: string }> | undefined): string {
  return extractText(title);
}

/** Parse a Notion page object into our DecisionRow type */
function parseDecisionRow(page: Record<string, unknown>): DecisionRow {
  const props = page.properties as Record<string, Record<string, unknown>>;
  return {
    pageId: page.id as string,
    title: extractTitle(props["Title"]?.title as Array<{ plain_text?: string }>),
    intentId: extractText(props["Intent ID"]?.rich_text as Array<{ plain_text?: string }>),
    intentHash: extractText(props["Intent Hash"]?.rich_text as Array<{ plain_text?: string }>),
    action: extractSelect(props["Action"]?.select as { name?: string }),
    riskTier: extractSelect(props["Risk Tier"]?.select as { name?: string }),
    proposer: extractSelect(props["Proposer"]?.select as { name?: string }),
    status: extractSelect(props["Status"]?.select as { name?: string }),
    approvalState: extractSelect(props["Approval State"]?.select as { name?: string }),
    policyVersion: extractText(props["Policy Version"]?.rich_text as Array<{ plain_text?: string }>),
    delegatedTo: extractText(props["Delegated To"]?.rich_text as Array<{ plain_text?: string }>),
    receiptLink: extractUrl((props["Receipt Link"] as Record<string, unknown>)?.url as string),
    gatewayDecision: extractSelect(props["Gateway Decision"]?.select as { name?: string }),
    createdAt: (props["Created At"] as Record<string, unknown>)?.created_time as string || "",
    updatedAt: (props["Updated At"] as Record<string, unknown>)?.last_edited_time as string || "",
  };
}

// ─── Core Functions ────────────────────────────────────────────────

/**
 * Create a new row in the RIO DECISION LOG.
 * Called when an intent is evaluated and governed by the Gateway.
 * Status = Pending, Approval State = Unsigned.
 */
export async function createDecisionRow(input: DecisionRowInput): Promise<{
  success: boolean;
  pageId?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${NOTION_BASE_URL}/pages`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        parent: { database_id: getDatabaseId() },
        properties: {
          "Title": {
            title: [{ text: { content: input.title } }],
          },
          "Intent ID": {
            rich_text: [{ text: { content: input.intentId } }],
          },
          "Intent Hash": {
            rich_text: [{ text: { content: input.intentHash } }],
          },
          "Action": {
            select: { name: input.action },
          },
          "Risk Tier": {
            select: { name: input.riskTier },
          },
          "Proposer": {
            select: { name: input.proposer },
          },
          "Status": {
            select: { name: "Pending" },
          },
          "Approval State": {
            select: { name: "Unsigned" },
          },
          "Policy Version": {
            rich_text: [{ text: { content: input.policyVersion } }],
          },
          "Gateway Decision": {
            select: { name: input.gatewayDecision },
          },
          ...(input.delegatedTo ? {
            "Delegated To": {
              rich_text: [{ text: { content: input.delegatedTo } }],
            },
          } : {}),
        },
      }),
    });

    if (!res.ok) {
      const errData = await res.json() as { message?: string };
      console.error("[NotionDecisionLog] Create row failed:", errData);
      return { success: false, error: errData.message || `HTTP ${res.status}` };
    }

    const data = await res.json() as { id: string };
    console.log(`[NotionDecisionLog] Created row ${data.id} for intent ${input.intentId}`);
    return { success: true, pageId: data.id };
  } catch (err) {
    console.error("[NotionDecisionLog] Create row error:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Update an existing row in the RIO DECISION LOG.
 * Used for:
 *   - After execution: Status=Executed, Approval State=Executed, Receipt Link=<url>
 *   - After denial: Status=Denied
 *   - After failure: Status=Failed
 */
export async function updateDecisionRow(
  pageId: string,
  update: DecisionRowUpdate
): Promise<{ success: boolean; error?: string }> {
  try {
    const properties: Record<string, unknown> = {};

    if (update.status) {
      properties["Status"] = { select: { name: update.status } };
    }
    if (update.approvalState) {
      properties["Approval State"] = { select: { name: update.approvalState } };
    }
    if (update.receiptLink) {
      properties["Receipt Link"] = { url: update.receiptLink };
    }
    if (update.gatewayDecision) {
      properties["Gateway Decision"] = { select: { name: update.gatewayDecision } };
    }
    if (update.delegatedTo !== undefined) {
      properties["Delegated To"] = {
        rich_text: [{ text: { content: update.delegatedTo } }],
      };
    }

    const res = await fetch(`${NOTION_BASE_URL}/pages/${pageId}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ properties }),
    });

    if (!res.ok) {
      const errData = await res.json() as { message?: string };
      console.error("[NotionDecisionLog] Update row failed:", errData);
      return { success: false, error: errData.message || `HTTP ${res.status}` };
    }

    console.log(`[NotionDecisionLog] Updated row ${pageId}: ${JSON.stringify(update)}`);
    return { success: true };
  } catch (err) {
    console.error("[NotionDecisionLog] Update row error:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Get a single decision row by its Notion page ID.
 */
export async function getDecisionRow(pageId: string): Promise<DecisionRow | null> {
  try {
    const res = await fetch(`${NOTION_BASE_URL}/pages/${pageId}`, {
      headers: getHeaders(),
    });

    if (!res.ok) return null;

    const data = await res.json() as Record<string, unknown>;
    return parseDecisionRow(data);
  } catch (err) {
    console.error("[NotionDecisionLog] Get row error:", err);
    return null;
  }
}

/**
 * Poll for rows where Brian has set Status=Approved but Approval State=Unsigned.
 * These are intents that need the signer confirmation flow.
 *
 * This is the "detect the change" mechanism from the build directive Step 3.
 * Notion status change is a SIGNAL, not authority — the signer flow produces
 * the actual cryptographic approval.
 */
export async function pollPendingApprovals(): Promise<DecisionRow[]> {
  try {
    const res = await fetch(`${NOTION_BASE_URL}/databases/${getDatabaseId()}/query`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        filter: {
          and: [
            {
              property: "Status",
              select: { equals: "Approved" },
            },
            {
              property: "Approval State",
              select: { equals: "Unsigned" },
            },
          ],
        },
        sorts: [
          { timestamp: "created_time", direction: "ascending" },
        ],
      }),
    });

    if (!res.ok) {
      const errData = await res.json() as { message?: string };
      console.error("[NotionDecisionLog] Poll failed:", errData);
      return [];
    }

    const data = await res.json() as { results: Array<Record<string, unknown>> };
    return (data.results || []).map(parseDecisionRow);
  } catch (err) {
    console.error("[NotionDecisionLog] Poll error:", err);
    return [];
  }
}

/**
 * Find a decision row by intent ID.
 * Used to look up the Notion page ID when we only have the intent ID
 * (e.g., after Gateway execution, to write back the receipt).
 */
export async function findDecisionRowByIntentId(intentId: string): Promise<DecisionRow | null> {
  try {
    const res = await fetch(`${NOTION_BASE_URL}/databases/${getDatabaseId()}/query`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        filter: {
          property: "Intent ID",
          rich_text: { equals: intentId },
        },
        page_size: 1,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json() as { results: Array<Record<string, unknown>> };
    if (!data.results || data.results.length === 0) return null;
    return parseDecisionRow(data.results[0]);
  } catch (err) {
    console.error("[NotionDecisionLog] Find by intent ID error:", err);
    return null;
  }
}

/**
 * Check if Notion integration is configured and available.
 */
export function isNotionConfigured(): boolean {
  return !!(ENV.notionApiToken && ENV.notionDecisionLogDbId);
}
