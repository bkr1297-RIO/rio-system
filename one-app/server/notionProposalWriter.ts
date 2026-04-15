/**
 * notionProposalWriter.ts — Phase 2A
 * 
 * Writes proposal packets to the Notion Decision Log as Proposed rows.
 * Updates existing rows with execution results, receipts, and aftermath.
 * 
 * Invariants:
 * - Proposals appear as Pending/Proposed in Notion — never auto-approved
 * - Notion is the display layer, NOT the authority
 * - All execution routes through Gateway /authorize
 */

import { ENV } from "./_core/env";

const NOTION_API_BASE = "https://api.notion.com/v1";

function getHeaders(): Record<string, string> {
  return {
    "Authorization": `Bearer ${ENV.notionApiToken}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
  };
}

// ─── Types ─────────────────────────────────────────────────────────

export interface ProposalForNotion {
  proposalId: string;
  type: string;
  category: string;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  riskFactors: string[];
  proposal: {
    title?: string;
    subject?: string;
    body: string;
    action_needed?: string;
    draft_email?: string;
  };
  whyItMatters: string;
  reasoning: string;
  baselinePattern?: {
    approval_rate_14d: number;
    avg_velocity_seconds: number;
    edit_rate: number;
  };
}

// ─── Write Proposal to Notion Decision Log ─────────────────────────

/**
 * Create a new row in the Notion Decision Log for a proposal packet.
 * Sets Status=Pending, Approval State=Unsigned.
 * Returns the Notion page ID.
 */
export async function writeProposalToNotion(proposal: ProposalForNotion): Promise<string> {
  const title = proposal.proposal.title || proposal.proposal.subject || `${proposal.type}: ${proposal.category}`;
  
  const properties: Record<string, unknown> = {
    "Title": {
      title: [{ text: { content: title.slice(0, 100) } }]
    },
    "Intent ID": {
      rich_text: [{ text: { content: proposal.proposalId } }]
    },
    "Action": {
      rich_text: [{ text: { content: `${proposal.type}/${proposal.category}` } }]
    },
    "Risk Tier": {
      select: { name: proposal.riskTier }
    },
    "Status": {
      select: { name: "Pending" }
    },
    "Approval State": {
      select: { name: "Unsigned" }
    },
    "Proposer": {
      rich_text: [{ text: { content: "system" } }]
    },
    "Created At": {
      date: { start: new Date().toISOString() }
    }
  };

  // Build the page body content with proposal details
  const bodyBlocks = buildProposalBody(proposal);

  const response = await fetch(`${NOTION_API_BASE}/pages`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      parent: { database_id: ENV.notionDecisionLogDbId },
      properties,
      children: bodyBlocks
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to write proposal to Notion: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Build rich content blocks for the proposal body in Notion.
 */
function buildProposalBody(proposal: ProposalForNotion): unknown[] {
  const blocks: unknown[] = [];

  // Why It Matters callout
  blocks.push({
    object: "block",
    type: "callout",
    callout: {
      rich_text: [{ type: "text", text: { content: proposal.whyItMatters } }],
      icon: { type: "emoji", emoji: "💡" }
    }
  });

  // Risk Assessment
  blocks.push({
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [{ type: "text", text: { content: "Risk Assessment" } }]
    }
  });

  blocks.push({
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [
        { type: "text", text: { content: `Tier: ${proposal.riskTier}\n` }, annotations: { bold: true } },
        { type: "text", text: { content: `Factors: ${proposal.riskFactors.join(", ")}` } }
      ]
    }
  });

  // Proposal Content
  blocks.push({
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [{ type: "text", text: { content: "Proposal" } }]
    }
  });

  blocks.push({
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: proposal.proposal.body.slice(0, 2000) } }]
    }
  });

  // Draft email (for outreach)
  if (proposal.proposal.draft_email) {
    blocks.push({
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: "Draft Email" } }]
      }
    });
    blocks.push({
      object: "block",
      type: "code",
      code: {
        rich_text: [{ type: "text", text: { content: proposal.proposal.draft_email.slice(0, 2000) } }],
        language: "plain text"
      }
    });
  }

  // Action needed (for non-outreach)
  if (proposal.proposal.action_needed) {
    blocks.push({
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: "Action Needed" } }]
      }
    });
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: proposal.proposal.action_needed } }]
      }
    });
  }

  // Reasoning
  blocks.push({
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [{ type: "text", text: { content: "AI Reasoning" } }]
    }
  });

  blocks.push({
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: proposal.reasoning.slice(0, 2000) } }]
    }
  });

  // Baseline Pattern (if available)
  if (proposal.baselinePattern) {
    blocks.push({
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: "Baseline Pattern (14d)" } }]
      }
    });
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{
          type: "text",
          text: {
            content: `Approval rate: ${(proposal.baselinePattern.approval_rate_14d * 100).toFixed(0)}% | Avg velocity: ${proposal.baselinePattern.avg_velocity_seconds}s | Edit rate: ${(proposal.baselinePattern.edit_rate * 100).toFixed(0)}%`
          }
        }]
      }
    });
  }

  return blocks;
}

// ─── Update Notion Row After Execution ─────────────────────────────

/**
 * Update a Notion Decision Log row after execution completes.
 * Sets Status=Executed, adds receipt link.
 */
export async function updateNotionProposalExecuted(pageId: string, receiptId: string): Promise<void> {
  const response = await fetch(`${NOTION_API_BASE}/pages/${pageId}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({
      properties: {
        "Status": { select: { name: "Executed" } },
        "Approval State": { select: { name: "Signed" } },
        "Receipt Link": {
          rich_text: [{ text: { content: receiptId } }]
        },
        "Updated At": {
          date: { start: new Date().toISOString() }
        }
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[NotionProposalWriter] Failed to update executed status: ${response.status} ${error}`);
  }
}

/**
 * Update a Notion Decision Log row when a proposal is approved (pre-execution).
 */
export async function updateNotionProposalApproved(pageId: string): Promise<void> {
  const response = await fetch(`${NOTION_API_BASE}/pages/${pageId}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({
      properties: {
        "Status": { select: { name: "Approved" } },
        "Updated At": {
          date: { start: new Date().toISOString() }
        }
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[NotionProposalWriter] Failed to update approved status: ${response.status} ${error}`);
  }
}

/**
 * Update a Notion Decision Log row when a proposal fails or is denied.
 */
export async function updateNotionProposalFailed(pageId: string, reason: string): Promise<void> {
  const response = await fetch(`${NOTION_API_BASE}/pages/${pageId}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({
      properties: {
        "Status": { select: { name: "Failed" } },
        "Gateway Decision": {
          rich_text: [{ text: { content: reason.slice(0, 200) } }]
        },
        "Updated At": {
          date: { start: new Date().toISOString() }
        }
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[NotionProposalWriter] Failed to update failed status: ${response.status} ${error}`);
  }
}

/**
 * Update a Notion Decision Log row when delegated auto-approval occurs.
 * Marks it as auto-approved with the trust policy reference.
 */
export async function updateNotionProposalDelegated(pageId: string, policyId: string, receiptId: string): Promise<void> {
  const response = await fetch(`${NOTION_API_BASE}/pages/${pageId}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({
      properties: {
        "Status": { select: { name: "Executed" } },
        "Approval State": { select: { name: "Delegated" } },
        "Receipt Link": {
          rich_text: [{ text: { content: receiptId } }]
        },
        "Gateway Decision": {
          rich_text: [{ text: { content: `Auto-approved via trust policy: ${policyId}` } }]
        },
        "Updated At": {
          date: { start: new Date().toISOString() }
        }
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[NotionProposalWriter] Failed to update delegated status: ${response.status} ${error}`);
  }
}

/**
 * Update aftermath fields on a Notion Decision Log row.
 */
export async function updateNotionProposalAftermath(
  pageId: string,
  aftermath: {
    automatic?: string;
    inferred?: string;
    human?: string;
    note?: string;
  }
): Promise<void> {
  const properties: Record<string, unknown> = {
    "Updated At": { date: { start: new Date().toISOString() } }
  };

  // These fields may not exist yet in Notion — they'll be added in Phase 2C/2D
  // For now, we write what we can to the Gateway Decision field as a fallback
  if (aftermath.automatic || aftermath.inferred || aftermath.human) {
    const parts: string[] = [];
    if (aftermath.automatic) parts.push(`Auto: ${aftermath.automatic}`);
    if (aftermath.inferred) parts.push(`Inferred: ${aftermath.inferred}`);
    if (aftermath.human) parts.push(`Human: ${aftermath.human}`);
    if (aftermath.note) parts.push(`Note: ${aftermath.note}`);
    
    properties["Gateway Decision"] = {
      rich_text: [{ text: { content: parts.join(" | ").slice(0, 200) } }]
    };
  }

  const response = await fetch(`${NOTION_API_BASE}/pages/${pageId}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ properties })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[NotionProposalWriter] Failed to update aftermath: ${response.status} ${error}`);
  }
}
