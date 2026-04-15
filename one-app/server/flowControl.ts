/**
 * flowControl.ts — Phase 2C
 * 
 * Manages the "attention surface" — what Brian sees and in what order.
 * 
 * Core rules:
 * - Maximum 5 visible items at any time (configurable)
 * - Ranking algorithm: risk_tier weight + recency + type diversity
 * - When an item is resolved (executed/rejected/expired), next-ranked item becomes visible
 * - Visible/Rank fields synced to Notion Decision Log
 * - Flow control is a DISPLAY concern, not an enforcement concern
 * 
 * Invariants:
 * - Flow control never blocks or delays execution
 * - Flow control never auto-approves anything
 * - All items exist in DB regardless of visibility
 */

import { getDb } from "./db";
import { proposalPackets, type ProposalPacket } from "../drizzle/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { ENV } from "./_core/env";

// ─── Constants ────────────────────────────────────────────────────

const MAX_VISIBLE = 5;

const RISK_WEIGHT: Record<string, number> = {
  HIGH: 100,
  MEDIUM: 60,
  LOW: 30,
};

const TYPE_DIVERSITY_BONUS = 15; // bonus for types not already visible

// ─── Types ────────────────────────────────────────────────────────

export interface RankedProposal {
  id: number;
  proposalId: string;
  type: string;
  category: string;
  riskTier: string;
  status: string;
  rank: number;
  visible: boolean;
  createdAt: number;
  notionPageId: string | null;
}

// ─── Ranking Algorithm ────────────────────────────────────────────

/**
 * Score a proposal for ranking. Higher score = higher priority.
 * 
 * Factors:
 * 1. Risk tier weight (HIGH=100, MEDIUM=60, LOW=30)
 * 2. Recency bonus (newer items get a small boost, decays over 7 days)
 * 3. Type diversity bonus (types not already visible get +15)
 */
export function scoreProposal(
  proposal: { riskTier: string; type: string; createdAt: number },
  visibleTypes: Set<string>,
  now: number = Date.now()
): number {
  let score = RISK_WEIGHT[proposal.riskTier] || 30;

  // Recency: up to 20 points for items created in the last 7 days
  const ageMs = now - proposal.createdAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const recencyBonus = Math.max(0, 20 - (ageDays * (20 / 7)));
  score += recencyBonus;

  // Type diversity: bonus if this type isn't already visible
  if (!visibleTypes.has(proposal.type)) {
    score += TYPE_DIVERSITY_BONUS;
  }

  return Math.round(score * 100) / 100;
}

// ─── Rerank and Promote ──────────────────────────────────────────

/**
 * Rerank all pending proposals and update visible/rank fields.
 * Called after any state change (new proposal, execution, rejection, expiry).
 * 
 * Returns the new visible set.
 */
export async function rerankProposals(): Promise<RankedProposal[]> {
  // Get all pending/proposed proposals
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const pending = await db
    .select()
    .from(proposalPackets)
    .where(
      and(
        eq(proposalPackets.status, "proposed"),
      )
    )
    .orderBy(desc(proposalPackets.createdAt));

  if (pending.length === 0) return [];

  // Score all proposals
  // First pass: determine currently visible types (for diversity calc)
  const visibleTypes = new Set<string>();
  const now = Date.now();

  const scored = pending.map((p: ProposalPacket) => ({
    ...p,
    score: scoreProposal(
      { riskTier: p.riskTier, type: p.type, createdAt: p.createdAt.getTime() },
      visibleTypes,
      now
    ),
  }));

  // Sort by score descending
  scored.sort((a: { score: number }, b: { score: number }) => b.score - a.score);

  // Top N become visible, rest are hidden
  const results: RankedProposal[] = [];
  for (let i = 0; i < scored.length; i++) {
    const p = scored[i];
    const visible = i < MAX_VISIBLE;
    const rank = i + 1;

    // Update DB
    const dbInner = await getDb();
    if (!dbInner) throw new Error("Database not available");
    await dbInner
      .update(proposalPackets)
      .set({ visible, rank })
      .where(eq(proposalPackets.id, p.id));

    // Update Notion if configured
    if (p.notionPageId && ENV.notionApiToken && ENV.notionDecisionLogDbId) {
      try {
        await updateNotionVisibility(p.notionPageId, visible, rank);
      } catch (err) {
        console.error(`[flowControl] Notion update failed for ${p.proposalId}:`, err);
      }
    }

    if (visible) {
      visibleTypes.add(p.type);
    }

    results.push({
      id: p.id,
      proposalId: p.proposalId,
      type: p.type,
      category: p.category,
      riskTier: p.riskTier,
      status: p.status,
      rank,
      visible,
      createdAt: p.createdAt.getTime(),
      notionPageId: p.notionPageId,
    });
  }

  return results;
}

/**
 * Get the current visible proposals (top 5 by rank).
 */
export async function getVisibleProposals(): Promise<RankedProposal[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const visible = await db
    .select()
    .from(proposalPackets)
    .where(
      and(
        eq(proposalPackets.status, "proposed"),
        eq(proposalPackets.visible, true),
      )
    )
    .orderBy(asc(proposalPackets.rank));

  return visible.map((p: ProposalPacket) => ({
    id: p.id,
    proposalId: p.proposalId,
    type: p.type,
    category: p.category,
    riskTier: p.riskTier,
    status: p.status,
    rank: p.rank ?? 999,
    visible: p.visible ?? false,
    createdAt: p.createdAt.getTime(),
    notionPageId: p.notionPageId,
  }));
}

/**
 * Called when a proposal is resolved (executed, rejected, expired).
 * Promotes the next-ranked item to visible.
 */
export async function onProposalResolved(proposalId: string): Promise<void> {
  // Mark the resolved proposal as not visible
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(proposalPackets)
    .set({ visible: false, rank: null })
    .where(eq(proposalPackets.proposalId, proposalId));

  // Rerank to fill the gap
  await rerankProposals();
}

// ─── Notion Sync ──────────────────────────────────────────────────

const NOTION_API_BASE = "https://api.notion.com/v1";

function getNotionHeaders(): Record<string, string> {
  return {
    "Authorization": `Bearer ${ENV.notionApiToken}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
  };
}

/**
 * Update Visible and Rank fields on a Notion Decision Log row.
 */
async function updateNotionVisibility(pageId: string, visible: boolean, rank: number): Promise<void> {
  const response = await fetch(`${NOTION_API_BASE}/pages/${pageId}`, {
    method: "PATCH",
    headers: getNotionHeaders(),
    body: JSON.stringify({
      properties: {
        "Visible": { checkbox: visible },
        "Rank": { number: rank },
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[flowControl] Notion visibility update failed: ${response.status} ${error}`);
  }
}

/**
 * Get the max visible count (for configuration).
 */
export function getMaxVisible(): number {
  return MAX_VISIBLE;
}
