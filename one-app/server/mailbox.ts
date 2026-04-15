/**
 * Mailbox Module — Builder Contract v1
 *
 * The event-sourced backbone of the RIO governed execution system.
 * All state flows through mailboxes. Notion is a view, not the source of truth.
 *
 * INVARIANTS:
 * 1. Append-only: no row is ever UPDATE'd or DELETE'd
 * 2. Status transitions create NEW rows referencing the same trace_id
 * 3. Every entry carries a trace_id linking the full decision chain
 * 4. The entire system state can be reconstructed by replaying entries in order
 *
 * Mailbox types:
 * - proposal:  proposal_packet, follow_up_proposal
 * - financial: financial_proposal, budget_transfer
 * - policy:    trust_policy_change, policy_update
 * - handoff:   handoff_packet, handoff_result
 * - sentinel:  sentinel_event, aftermath_event
 * - decision:  approval_packet, kernel_decision_object, gateway_enforcement_object
 */

import { eq, and, desc, asc, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  mailboxEntries,
  type MailboxEntry,
  type InsertMailboxEntry,
  type MailboxType,
  type MailboxStatus,
  MAILBOX_TYPES,
  MAILBOX_STATUSES,
} from "../drizzle/schema";
import { nanoid } from "nanoid";

// ─────────────────────────────────────────────────────────────────
// ID Generation
// ─────────────────────────────────────────────────────────────────

/** Generate a unique packet ID with prefix */
export function generatePacketId(prefix = "pkt"): string {
  return `${prefix}_${nanoid(16)}`;
}

/** Generate a unique trace ID */
export function generateTraceId(): string {
  return `trace_${nanoid(16)}`;
}

// ─────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────

/** Validate mailbox type */
function validateMailboxType(type: string): asserts type is MailboxType {
  if (!MAILBOX_TYPES.includes(type as MailboxType)) {
    throw new Error(`Invalid mailbox type: "${type}". Must be one of: ${MAILBOX_TYPES.join(", ")}`);
  }
}

/** Validate mailbox status */
function validateStatus(status: string): asserts status is MailboxStatus {
  if (!MAILBOX_STATUSES.includes(status as MailboxStatus)) {
    throw new Error(`Invalid mailbox status: "${status}". Must be one of: ${MAILBOX_STATUSES.join(", ")}`);
  }
}

/**
 * Validate status transition ordering.
 * Allowed transitions: pending → processed → routed → executed → archived
 * Each new entry must have a status >= the latest status for that trace.
 */
const STATUS_ORDER: Record<MailboxStatus, number> = {
  pending: 0,
  processed: 1,
  routed: 2,
  executed: 3,
  archived: 4,
};

function validateStatusTransition(currentStatus: MailboxStatus, newStatus: MailboxStatus): void {
  if (STATUS_ORDER[newStatus] < STATUS_ORDER[currentStatus]) {
    throw new Error(
      `Invalid status transition: cannot go from "${currentStatus}" to "${newStatus}". ` +
      `Status can only advance forward: pending → processed → routed → executed → archived`
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// Core Operations (Append-Only)
// ─────────────────────────────────────────────────────────────────

export interface AppendToMailboxInput {
  mailboxType: MailboxType;
  packetType: string;
  sourceAgent: string;
  targetAgent?: string | null;
  status?: MailboxStatus;
  payload: Record<string, unknown>;
  traceId: string;
  parentPacketId?: string | null;
  packetId?: string;
}

/**
 * Append a new entry to a mailbox. This is the ONLY write operation.
 * No existing entries are ever modified.
 *
 * @returns The created mailbox entry
 */
export async function appendToMailbox(input: AppendToMailboxInput): Promise<MailboxEntry> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  validateMailboxType(input.mailboxType);
  if (input.status) validateStatus(input.status);

  const packetId = input.packetId || generatePacketId();
  const status = input.status || "pending";

  // If this is a status transition (has parentPacketId), validate the transition
  if (input.parentPacketId) {
    const parent = await getByPacketId(input.parentPacketId);
    if (parent) {
      validateStatusTransition(parent.status as MailboxStatus, status);
    }
  }

  const entry: InsertMailboxEntry = {
    packetId,
    mailboxType: input.mailboxType,
    packetType: input.packetType,
    sourceAgent: input.sourceAgent,
    targetAgent: input.targetAgent ?? null,
    status,
    payload: input.payload,
    traceId: input.traceId,
    parentPacketId: input.parentPacketId ?? null,
    processedAt: status !== "pending" ? new Date() : null,
  };

  await db.insert(mailboxEntries).values(entry);

  // Return the created entry
  const [created] = await db
    .select()
    .from(mailboxEntries)
    .where(eq(mailboxEntries.packetId, packetId))
    .limit(1);

  return created;
}

/**
 * Transition a mailbox entry to a new status by creating a NEW entry.
 * The original entry is NEVER modified (append-only invariant).
 *
 * @param parentPacketId - The packet being transitioned
 * @param newStatus - The new status
 * @param sourceAgent - Who is making this transition
 * @param additionalPayload - Optional extra payload for the transition entry
 * @returns The new transition entry
 */
export async function transitionStatus(
  parentPacketId: string,
  newStatus: MailboxStatus,
  sourceAgent: string,
  additionalPayload?: Record<string, unknown>
): Promise<MailboxEntry> {
  const parent = await getByPacketId(parentPacketId);
  if (!parent) {
    throw new Error(`Cannot transition: packet "${parentPacketId}" not found`);
  }

  validateStatusTransition(parent.status as MailboxStatus, newStatus);

  return appendToMailbox({
    mailboxType: parent.mailboxType as MailboxType,
    packetType: `${parent.packetType}_${newStatus}`,
    sourceAgent,
    targetAgent: parent.targetAgent,
    status: newStatus,
    payload: {
      ...parent.payload as Record<string, unknown>,
      _transition: {
        from_status: parent.status,
        to_status: newStatus,
        from_packet_id: parentPacketId,
        transitioned_by: sourceAgent,
        timestamp: new Date().toISOString(),
      },
      ...(additionalPayload || {}),
    },
    traceId: parent.traceId,
    parentPacketId,
  });
}

// ─────────────────────────────────────────────────────────────────
// Read Operations
// ─────────────────────────────────────────────────────────────────

/**
 * Get a single entry by packet ID.
 */
export async function getByPacketId(packetId: string): Promise<MailboxEntry | null> {
  const db = await getDb();
  if (!db) return null;

  const [entry] = await db
    .select()
    .from(mailboxEntries)
    .where(eq(mailboxEntries.packetId, packetId))
    .limit(1);

  return entry || null;
}

/**
 * Read all entries from a specific mailbox, ordered by creation time (newest first).
 *
 * @param mailboxType - Which mailbox to read
 * @param options - Optional filters
 */
export async function readMailbox(
  mailboxType: MailboxType,
  options?: {
    status?: MailboxStatus;
    limit?: number;
    offset?: number;
  }
): Promise<MailboxEntry[]> {
  const db = await getDb();
  if (!db) return [];

  validateMailboxType(mailboxType);

  const conditions = [eq(mailboxEntries.mailboxType, mailboxType)];
  if (options?.status) {
    validateStatus(options.status);
    conditions.push(eq(mailboxEntries.status, options.status));
  }

  let query = db
    .select()
    .from(mailboxEntries)
    .where(and(...conditions))
    .orderBy(desc(mailboxEntries.id));

  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }
  if (options?.offset) {
    query = query.offset(options.offset) as typeof query;
  }

  return query;
}

/**
 * Get all entries for a specific trace ID, ordered chronologically (oldest first).
 * This reconstructs the full decision chain for a single trace.
 */
export async function getByTraceId(traceId: string): Promise<MailboxEntry[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(mailboxEntries)
    .where(eq(mailboxEntries.traceId, traceId))
    .orderBy(asc(mailboxEntries.id));
}

/**
 * Get the latest entry for a trace (the current state of that decision chain).
 */
export async function getLatestForTrace(traceId: string): Promise<MailboxEntry | null> {
  const db = await getDb();
  if (!db) return null;

  const [entry] = await db
    .select()
    .from(mailboxEntries)
    .where(eq(mailboxEntries.traceId, traceId))
    .orderBy(desc(mailboxEntries.id))
    .limit(1);

  return entry || null;
}

/**
 * Get all entries with a specific packet type across all mailboxes.
 */
export async function getByPacketType(
  packetType: string,
  options?: { mailboxType?: MailboxType; status?: MailboxStatus; limit?: number }
): Promise<MailboxEntry[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(mailboxEntries.packetType, packetType)];
  if (options?.mailboxType) {
    conditions.push(eq(mailboxEntries.mailboxType, options.mailboxType));
  }
  if (options?.status) {
    conditions.push(eq(mailboxEntries.status, options.status));
  }

  let query = db
    .select()
    .from(mailboxEntries)
    .where(and(...conditions))
    .orderBy(desc(mailboxEntries.id));

  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }

  return query;
}

// ─────────────────────────────────────────────────────────────────
// Replay — Reconstruct State from Event Log
// ─────────────────────────────────────────────────────────────────

export interface MailboxReplayState {
  /** All entries in chronological order */
  entries: MailboxEntry[];
  /** Current status of each trace (latest status per trace_id) */
  traceStates: Map<string, { status: MailboxStatus; latestPacketId: string; entryCount: number }>;
  /** Total entry count */
  totalEntries: number;
  /** Entries by mailbox type */
  byMailbox: Record<MailboxType, number>;
  /** Entries by status */
  byStatus: Record<MailboxStatus, number>;
}

/**
 * Replay the entire mailbox log (or a filtered subset) to reconstruct state.
 * This is the proof that the system is event-sourced: any state can be
 * reconstructed by replaying entries in order.
 *
 * @param options - Optional filters for replay scope
 */
export async function replayMailbox(
  options?: {
    mailboxType?: MailboxType;
    traceId?: string;
    since?: Date;
  }
): Promise<MailboxReplayState> {
  const db = await getDb();
  if (!db) {
    return {
      entries: [],
      traceStates: new Map(),
      totalEntries: 0,
      byMailbox: { proposal: 0, financial: 0, policy: 0, handoff: 0, sentinel: 0, decision: 0 },
      byStatus: { pending: 0, processed: 0, routed: 0, executed: 0, archived: 0 },
    };
  }

  const conditions: ReturnType<typeof eq>[] = [];
  if (options?.mailboxType) {
    conditions.push(eq(mailboxEntries.mailboxType, options.mailboxType));
  }
  if (options?.traceId) {
    conditions.push(eq(mailboxEntries.traceId, options.traceId));
  }

  let query = db
    .select()
    .from(mailboxEntries)
    .orderBy(asc(mailboxEntries.id));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const entries = await query;

  // Build replay state
  const traceStates = new Map<string, { status: MailboxStatus; latestPacketId: string; entryCount: number }>();
  const byMailbox: Record<string, number> = { proposal: 0, financial: 0, policy: 0, handoff: 0, sentinel: 0, decision: 0 };
  const byStatus: Record<string, number> = { pending: 0, processed: 0, routed: 0, executed: 0, archived: 0 };

  for (const entry of entries) {
    // Update trace state (latest entry wins)
    const existing = traceStates.get(entry.traceId);
    traceStates.set(entry.traceId, {
      status: entry.status as MailboxStatus,
      latestPacketId: entry.packetId,
      entryCount: (existing?.entryCount || 0) + 1,
    });

    // Count by mailbox
    byMailbox[entry.mailboxType] = (byMailbox[entry.mailboxType] || 0) + 1;

    // Count by status
    byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
  }

  return {
    entries,
    traceStates,
    totalEntries: entries.length,
    byMailbox: byMailbox as Record<MailboxType, number>,
    byStatus: byStatus as Record<MailboxStatus, number>,
  };
}

// ─────────────────────────────────────────────────────────────────
// Utility — Count & Stats
// ─────────────────────────────────────────────────────────────────

/**
 * Count entries in a mailbox with optional status filter.
 */
export async function countMailboxEntries(
  mailboxType: MailboxType,
  status?: MailboxStatus
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const conditions = [eq(mailboxEntries.mailboxType, mailboxType)];
  if (status) {
    conditions.push(eq(mailboxEntries.status, status));
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mailboxEntries)
    .where(and(...conditions));

  return result?.count || 0;
}

/**
 * Get all pending entries across all mailboxes (for processing queues).
 */
export async function getPendingEntries(
  mailboxType?: MailboxType,
  limit = 50
): Promise<MailboxEntry[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(mailboxEntries.status, "pending" as const)];
  if (mailboxType) {
    conditions.push(eq(mailboxEntries.mailboxType, mailboxType));
  }

  return db
    .select()
    .from(mailboxEntries)
    .where(and(...conditions))
    .orderBy(asc(mailboxEntries.id))
    .limit(limit);
}

// ─────────────────────────────────────────────────────────────────
// Export — JSONL Backup / Audit / Offline Replay
// ─────────────────────────────────────────────────────────────────

export interface JsonlExportEntry {
  /** Auto-increment row ID (ordering proof) */
  id: number;
  /** Unique packet identifier */
  packet_id: string;
  /** Mailbox type: proposal | financial | policy | handoff | sentinel | decision */
  mailbox_type: string;
  /** Semantic packet type (e.g. proposal_packet, kernel_decision_object) */
  packet_type: string;
  /** Agent that created this entry */
  source_agent: string;
  /** Target agent (if routed) */
  target_agent: string | null;
  /** Current status: pending | processed | routed | executed | archived */
  status: string;
  /** Full payload (decision data, proposal content, etc.) */
  payload: Record<string, unknown>;
  /** Trace ID linking the full decision chain */
  trace_id: string;
  /** Parent packet ID (for status transitions) */
  parent_packet_id: string | null;
  /** ISO-8601 creation timestamp */
  created_at: string;
  /** ISO-8601 processed timestamp (null if still pending) */
  processed_at: string | null;
}

/**
 * Export the full mailbox log to JSONL format.
 *
 * Per Brian's Go Signal Decision (Apr 15, 2026):
 * - Replaces the file-based transparency requirement
 * - Preserves exact event order (by id ASC — the append order)
 * - Human-readable (one JSON object per line)
 * - Allows offline replay (standalone, no DB needed)
 *
 * The output is a string where each line is a valid JSON object.
 * This can be written to a .jsonl file, piped to jq, or stored as audit backup.
 *
 * @param options - Optional filters for export scope
 * @returns JSONL string (one JSON object per line, newline-terminated)
 */
export async function exportMailboxToJsonl(
  options?: {
    mailboxType?: MailboxType;
    traceId?: string;
    since?: Date;
    until?: Date;
  }
): Promise<string> {
  const db = await getDb();
  if (!db) return "";

  const conditions: ReturnType<typeof eq>[] = [];
  if (options?.mailboxType) {
    validateMailboxType(options.mailboxType);
    conditions.push(eq(mailboxEntries.mailboxType, options.mailboxType));
  }
  if (options?.traceId) {
    conditions.push(eq(mailboxEntries.traceId, options.traceId));
  }

  let query = db
    .select()
    .from(mailboxEntries)
    .orderBy(asc(mailboxEntries.id));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const entries = await query;

  // Convert each entry to a human-readable JSONL line with snake_case keys
  const lines = entries.map((entry) => {
    const jsonlEntry: JsonlExportEntry = {
      id: entry.id,
      packet_id: entry.packetId,
      mailbox_type: entry.mailboxType,
      packet_type: entry.packetType,
      source_agent: entry.sourceAgent,
      target_agent: entry.targetAgent,
      status: entry.status,
      payload: entry.payload as Record<string, unknown>,
      trace_id: entry.traceId,
      parent_packet_id: entry.parentPacketId,
      created_at: entry.createdAt instanceof Date
        ? entry.createdAt.toISOString()
        : String(entry.createdAt),
      processed_at: entry.processedAt instanceof Date
        ? entry.processedAt.toISOString()
        : entry.processedAt ? String(entry.processedAt) : null,
    };
    return JSON.stringify(jsonlEntry);
  });

  // Each line is a valid JSON object, newline-terminated
  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

/**
 * Parse a JSONL export back into entries for offline replay.
 * This proves the export is self-contained and replayable without DB.
 *
 * @param jsonlContent - The JSONL string (from exportMailboxToJsonl)
 * @returns Array of parsed entries in original order
 */
export function parseJsonlExport(jsonlContent: string): JsonlExportEntry[] {
  if (!jsonlContent.trim()) return [];

  return jsonlContent
    .trim()
    .split("\n")
    .map((line, index) => {
      try {
        const parsed = JSON.parse(line) as JsonlExportEntry;
        // Validate required fields
        if (!parsed.packet_id || !parsed.mailbox_type || !parsed.trace_id) {
          throw new Error(`Missing required fields at line ${index + 1}`);
        }
        return parsed;
      } catch (err) {
        throw new Error(`Invalid JSONL at line ${index + 1}: ${(err as Error).message}`);
      }
    });
}

/**
 * Replay state from a JSONL export (offline — no DB needed).
 * This is the offline equivalent of replayMailbox().
 *
 * @param jsonlContent - The JSONL string
 * @returns Replay state reconstructed from the export alone
 */
export function replayFromJsonl(jsonlContent: string): {
  entries: JsonlExportEntry[];
  traceStates: Map<string, { status: string; latestPacketId: string; entryCount: number }>;
  totalEntries: number;
  byMailbox: Record<string, number>;
  byStatus: Record<string, number>;
} {
  const entries = parseJsonlExport(jsonlContent);

  const traceStates = new Map<string, { status: string; latestPacketId: string; entryCount: number }>();
  const byMailbox: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const entry of entries) {
    // Update trace state
    const existing = traceStates.get(entry.trace_id);
    traceStates.set(entry.trace_id, {
      status: entry.status,
      latestPacketId: entry.packet_id,
      entryCount: (existing?.entryCount || 0) + 1,
    });

    // Count by mailbox
    byMailbox[entry.mailbox_type] = (byMailbox[entry.mailbox_type] || 0) + 1;

    // Count by status
    byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
  }

  return {
    entries,
    traceStates,
    totalEntries: entries.length,
    byMailbox,
    byStatus,
  };
}
