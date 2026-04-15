/**
 * Phase 2G — Multi-Agent Collaboration (Handoff Packets)
 * 
 * Explicit work transfer between agents with full governance.
 * 
 * Invariants:
 * - No agent self-approves
 * - All execution routes through Gateway
 * - Handoffs are recorded in the ledger
 * - Approval required by default (human decides)
 * - Receiving agent cannot modify the handoff terms
 */

import { nanoid } from "nanoid";
import {
  createHandoffPacket,
  getHandoffPacket,
  listHandoffPackets,
  updateHandoffPacket,
  appendLedger,
} from "./db";

// ─── Types ───────────────────────────────────────────────────────

export interface HandoffRequest {
  fromAgent: string;
  toAgent: string;
  workType: "proposal" | "financial" | "analysis" | "review" | "execution" | "research";
  payload: Record<string, unknown>;
  instructions: string;
  deadline?: Date;
  approvalRequired?: boolean;
}

export interface HandoffAcceptance {
  handoffId: string;
  acceptedBy: string;
}

export interface HandoffCompletion {
  handoffId: string;
  completedBy: string;
  result: Record<string, unknown>;
  receiptId?: string;
}

export interface HandoffRejection {
  handoffId: string;
  rejectedBy: string;
  reason: string;
}

// ─── Known Agents ────────────────────────────────────────────────

const KNOWN_AGENTS = [
  "manny",      // Builder agent
  "bondi",      // Operator agent (Gemini)
  "jordan",     // Observer agent
  "rio-system", // System-level operations
] as const;

export function isKnownAgent(name: string): boolean {
  return KNOWN_AGENTS.includes(name.toLowerCase() as any);
}

// ─── Handoff Lifecycle ───────────────────────────────────────────

/**
 * Create a new handoff packet — agent A sends work to agent B.
 * The handoff is recorded in the ledger.
 * By default, approval is required before the receiving agent can act.
 */
export async function initiateHandoff(req: HandoffRequest) {
  const handoffId = `hoff_${nanoid(12)}`;

  // Validate: no self-handoff
  if (req.fromAgent.toLowerCase() === req.toAgent.toLowerCase()) {
    throw new Error("Agent cannot hand off work to itself");
  }

  const packet = await createHandoffPacket({
    handoffId,
    fromAgent: req.fromAgent,
    toAgent: req.toAgent,
    workType: req.workType,
    payload: req.payload,
    instructions: req.instructions,
    deadline: req.deadline ?? null,
    approvalRequired: req.approvalRequired ?? true,
    status: "pending",
    result: null,
    receiptId: null,
  });

  // Record in ledger
  await appendLedger("HANDOFF_CREATED", {
    handoffId,
    fromAgent: req.fromAgent,
    toAgent: req.toAgent,
    workType: req.workType,
    approvalRequired: req.approvalRequired ?? true,
    instructions: req.instructions,
  });

  return packet;
}

/**
 * Accept a handoff — receiving agent acknowledges the work.
 * Does NOT mean execution has started — just that the agent is aware.
 */
export async function acceptHandoff(req: HandoffAcceptance) {
  const packet = await getHandoffPacket(req.handoffId);
  if (!packet) throw new Error(`Handoff ${req.handoffId} not found`);

  // Validate: only the intended recipient can accept
  if (packet.toAgent.toLowerCase() !== req.acceptedBy.toLowerCase()) {
    throw new Error(`Only ${packet.toAgent} can accept this handoff`);
  }

  if (packet.status !== "pending") {
    throw new Error(`Handoff ${req.handoffId} is not in pending state (current: ${packet.status})`);
  }

  return updateHandoffPacket(req.handoffId, { status: "accepted" });
}

/**
 * Mark a handoff as in-progress — receiving agent has started work.
 */
export async function startHandoff(handoffId: string, agentName: string) {
  const packet = await getHandoffPacket(handoffId);
  if (!packet) throw new Error(`Handoff ${handoffId} not found`);

  if (packet.toAgent.toLowerCase() !== agentName.toLowerCase()) {
    throw new Error(`Only ${packet.toAgent} can start this handoff`);
  }

  if (packet.status !== "accepted") {
    throw new Error(`Handoff ${handoffId} must be accepted before starting (current: ${packet.status})`);
  }

  return updateHandoffPacket(handoffId, { status: "in_progress" });
}

/**
 * Complete a handoff — receiving agent delivers the result.
 * The result is recorded in the ledger.
 */
export async function completeHandoff(req: HandoffCompletion) {
  const packet = await getHandoffPacket(req.handoffId);
  if (!packet) throw new Error(`Handoff ${req.handoffId} not found`);

  if (packet.toAgent.toLowerCase() !== req.completedBy.toLowerCase()) {
    throw new Error(`Only ${packet.toAgent} can complete this handoff`);
  }

  if (packet.status !== "in_progress" && packet.status !== "accepted") {
    throw new Error(`Handoff ${req.handoffId} is not in a completable state (current: ${packet.status})`);
  }

  const updated = await updateHandoffPacket(req.handoffId, {
    status: "completed",
    result: req.result,
    receiptId: req.receiptId ?? null,
  });

  // Record in ledger
  await appendLedger("HANDOFF_COMPLETED", {
    handoffId: req.handoffId,
    fromAgent: packet.fromAgent,
    toAgent: packet.toAgent,
    workType: packet.workType,
    completedBy: req.completedBy,
    receiptId: req.receiptId,
  });

  return updated;
}

/**
 * Reject a handoff — receiving agent declines the work.
 */
export async function rejectHandoff(req: HandoffRejection) {
  const packet = await getHandoffPacket(req.handoffId);
  if (!packet) throw new Error(`Handoff ${req.handoffId} not found`);

  if (packet.toAgent.toLowerCase() !== req.rejectedBy.toLowerCase()) {
    throw new Error(`Only ${packet.toAgent} can reject this handoff`);
  }

  if (packet.status !== "pending" && packet.status !== "accepted") {
    throw new Error(`Handoff ${req.handoffId} cannot be rejected in current state (${packet.status})`);
  }

  const updated = await updateHandoffPacket(req.handoffId, { status: "rejected" });

  // Record in ledger
  await appendLedger("HANDOFF_REJECTED", {
    handoffId: req.handoffId,
    fromAgent: packet.fromAgent,
    toAgent: packet.toAgent,
    workType: packet.workType,
    rejectedBy: req.rejectedBy,
    reason: req.reason,
  });

  return updated;
}

// ─── Query Helpers ───────────────────────────────────────────────

/**
 * Get all handoffs for a specific agent (sent or received).
 */
export async function getAgentHandoffs(agentName: string) {
  const sent = await listHandoffPackets({ fromAgent: agentName });
  const received = await listHandoffPackets({ toAgent: agentName });
  return { sent, received };
}

/**
 * Get pending handoffs that need attention (for dashboard display).
 */
export async function getPendingHandoffs() {
  return listHandoffPackets({ status: "pending" });
}

/**
 * Check if a handoff has expired (past deadline).
 */
export function isHandoffExpired(packet: { deadline: Date | null; status: string }): boolean {
  if (!packet.deadline) return false;
  if (packet.status === "completed" || packet.status === "rejected" || packet.status === "expired") return false;
  return new Date(packet.deadline).getTime() < Date.now();
}
