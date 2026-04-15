import { eq, desc, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, proxyUsers, toolRegistry, intents, approvals, executions, ledger, keyBackups, conversations, learningEvents, nodeConfigs, systemComponents, policyRules, notifications, principals, type SystemRole, SYSTEM_ROLES, emailFirewallConfig, type EmailFirewallConfig, type InsertEmailFirewallConfig, pendingEmailApprovals, proposalPackets, type InsertProposalPacket, trustPolicies, type InsertTrustPolicy, sentinelEvents, type InsertSentinelEvent, budgetPools, type InsertBudgetPool, financialTransactions, type InsertFinancialTransaction, handoffPackets, type InsertHandoffPacket } from "../drizzle/schema";
import { ENV } from './_core/env';
import { nanoid } from "nanoid";
import { createHash } from "crypto";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── SHA-256 Hashing ────────────────────────────────────────────
export function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Canonical JSON serialization — sorts keys recursively so that
 * JSON.stringify produces identical output regardless of key insertion
 * order. This is critical because MySQL JSON columns return keys in
 * alphabetical order, not insertion order.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(item => canonicalJsonStringify(item)).join(",") + "]";
  }
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sorted.map(key => {
    return JSON.stringify(key) + ":" + canonicalJsonStringify((obj as Record<string, unknown>)[key]);
  });
  return "{" + pairs.join(",") + "}";
}

// ─── Ledger Helpers ─────────────────────────────────────────────
export async function getLastLedgerEntry() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(ledger).orderBy(desc(ledger.id)).limit(1);
  return rows[0] ?? null;
}

export async function appendLedger(entryType: "ONBOARD" | "INTENT" | "APPROVAL" | "EXECUTION" | "KILL" | "SYNC" | "JORDAN_CHAT" | "BONDI_CHAT" | "LEARNING" | "ARCHITECTURE_STATE" | "RE_KEY" | "REVOKE" | "RE_KEY_AUTHORIZED" | "RE_KEY_FORCED" | "TELEGRAM_NOTIFY" | "POLICY_UPDATE" | "NOTIFICATION" | "GENESIS" | "AUTHORITY_TOKEN" | "EMAIL_DELIVERY" | "COHERENCE_CHECK" | "FIREWALL_SCAN" | "ACTION_COMPLETE" | "DELEGATION_BLOCKED" | "DELEGATION_APPROVED" | "SUBSTRATE_BLOCK" | "NOTION_DENIAL" | "NOTION_EXECUTION" | "NOTION_ROW_CREATED" | "PROPOSAL_CREATED" | "PROPOSAL_APPROVED" | "PROPOSAL_REJECTED" | "PROPOSAL_EXECUTED" | "TRUST_POLICY_CREATED" | "TRUST_POLICY_UPDATED" | "TRUST_POLICY_DELETED" | "DELEGATED_AUTO_APPROVE" | "SENTINEL_EVENT" | "BUDGET_POOL_CREATED" | "BUDGET_POOL_MODIFIED" | "FINANCIAL_TRANSFER" | "HANDOFF_CREATED" | "HANDOFF_COMPLETED" | "HANDOFF_REJECTED" | "PROPOSAL_FAILED" | "TRUST_POLICY_CHANGE", payload: Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const last = await getLastLedgerEntry();
  const prevHash = last ? last.hash : "GENESIS";
  const ts = Date.now();
  const entryId = `LE-${nanoid(16)}`;
  const hashInput = canonicalJsonStringify({ entryId, entryType, payload, prevHash, timestamp: ts });
  const hash = sha256(hashInput);
  await db.insert(ledger).values({ entryId, entryType, payload, hash, prevHash, timestamp: ts });
  return { entryId, hash, prevHash, timestamp: ts };
}

export async function getAllLedgerEntries() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ledger).orderBy(ledger.id);
}

export async function verifyHashChain() {
  const entries = await getAllLedgerEntries();
  if (entries.length === 0) return { valid: true, entries: 0, errors: [] };
  const errors: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedPrev = i === 0 ? "GENESIS" : entries[i - 1].hash;
    if (entry.prevHash !== expectedPrev) {
      errors.push(`Entry ${entry.entryId}: prevHash mismatch at index ${i}`);
    }
    const hashInput = canonicalJsonStringify({ entryId: entry.entryId, entryType: entry.entryType, payload: entry.payload, prevHash: entry.prevHash, timestamp: entry.timestamp });
    const computed = sha256(hashInput);
    if (computed !== entry.hash) {
      errors.push(`Entry ${entry.entryId}: hash mismatch at index ${i}`);
    }
  }
  return { valid: errors.length === 0, entries: entries.length, errors };
}

// ─── Proxy User Helpers ─────────────────────────────────────────
export async function createProxyUser(userId: number, publicKey: string, policyHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(proxyUsers).values({ userId, publicKey, policyHash });
  const rows = await db.select().from(proxyUsers).where(eq(proxyUsers.userId, userId)).limit(1);
  return rows[0];
}

export async function getProxyUser(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(proxyUsers).where(eq(proxyUsers.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function updateProxyUserPublicKey(userId: number, publicKey: string, policyHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(proxyUsers).set({ publicKey, policyHash, status: "ACTIVE" }).where(eq(proxyUsers.userId, userId));
  const rows = await db.select().from(proxyUsers).where(eq(proxyUsers.userId, userId)).limit(1);
  return rows[0];
}

export async function getAllProxyUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(proxyUsers).orderBy(desc(proxyUsers.id));
}

export async function revokeProxyUser(userId: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(proxyUsers).set({ status: "SUSPENDED", killReason: reason }).where(eq(proxyUsers.userId, userId));
  // Kill all pending intents for this signer
  await db.update(intents).set({ status: "KILLED" }).where(and(eq(intents.userId, userId), eq(intents.status, "PENDING_APPROVAL")));
  const rows = await db.select().from(proxyUsers).where(eq(proxyUsers.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function killProxyUser(userId: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(proxyUsers).set({ status: "KILLED", killReason: reason, killedAt: new Date() }).where(eq(proxyUsers.userId, userId));
  // Kill all pending intents
  await db.update(intents).set({ status: "KILLED" }).where(and(eq(intents.userId, userId), eq(intents.status, "PENDING_APPROVAL")));
}

// ─── Tool Registry Helpers ──────────────────────────────────────
export async function getAllTools() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(toolRegistry);
}

export async function getToolByName(toolName: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(toolRegistry).where(eq(toolRegistry.toolName, toolName)).limit(1);
  return rows[0] ?? null;
}

// ─── Intent Helpers ─────────────────────────────────────────────
export async function createIntent(userId: number, toolName: string, toolArgs: Record<string, unknown>, riskTier: "LOW" | "MEDIUM" | "HIGH", blastRadius: { score: number; affectedSystems: string[]; reversible: boolean }, reflection?: string, sourceConversationId?: string, ttlSeconds?: number, principalId?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const intentId = `INT-${nanoid(16)}`;
  const argsHash = sha256(JSON.stringify({ toolName, toolArgs }));
  const status = riskTier === "LOW" ? "APPROVED" : "PENDING_APPROVAL";
  // Intent TTL: default 24h for PENDING intents, configurable
  const expiresAt = status === "PENDING_APPROVAL" ? Date.now() + (ttlSeconds ?? 86400) * 1000 : null;
  await db.insert(intents).values({ intentId, userId, toolName, toolArgs, argsHash, riskTier, blastRadius, status, reflection, sourceConversationId, expiresAt, principalId: principalId ?? null });
  const rows = await db.select().from(intents).where(eq(intents.intentId, intentId)).limit(1);
  return rows[0];
}

export async function getIntent(intentId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(intents).where(eq(intents.intentId, intentId)).limit(1);
  return rows[0] ?? null;
}

export async function getUserIntents(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(intents).where(eq(intents.userId, userId)).orderBy(desc(intents.id)).limit(limit);
}

export async function updateIntentStatus(intentId: string, status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "EXECUTED" | "FAILED" | "KILLED" | "EXPIRED") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(intents).set({ status }).where(eq(intents.intentId, intentId));
}

/**
 * Expire stale PENDING_APPROVAL intents whose TTL has passed.
 * Returns the count of expired intents.
 */
export async function expireStaleIntents(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const now = Date.now();
  const result = await db.update(intents)
    .set({ status: "EXPIRED" })
    .where(and(
      eq(intents.status, "PENDING_APPROVAL"),
      sql`${intents.expiresAt} IS NOT NULL AND ${intents.expiresAt} <= ${now}`
    ));
  return (result as any)[0]?.affectedRows ?? 0;
}

/**
 * Batch approve multiple intents at once.
 * Returns the list of created approvals.
 */
export async function batchApproveIntents(
  intentIds: string[],
  userId: number,
  decision: "APPROVED" | "REJECTED",
  signature: string,
  expiresAt: number,
  maxExecutions: number,
): Promise<Array<{ approvalId: string; intentId: string }>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results: Array<{ approvalId: string; intentId: string }> = [];
  for (const intentId of intentIds) {
    const intent = await getIntent(intentId);
    if (!intent || intent.userId !== userId || intent.status !== "PENDING_APPROVAL") continue;
    const approvalId = `APR-${nanoid(16)}`;
    await db.insert(approvals).values({
      approvalId, intentId, userId, decision, signature,
      boundToolName: intent.toolName,
      boundArgsHash: intent.argsHash,
      expiresAt, maxExecutions,
    });
    await db.update(intents).set({ status: decision }).where(eq(intents.intentId, intentId));
    results.push({ approvalId, intentId });
  }
  return results;
}

/**
 * Approval SLA metrics — queue size, avg time-to-approval, oldest pending age.
 */
export async function getApprovalMetrics(userId: number) {
  const db = await getDb();
  if (!db) return { queueSize: 0, avgTimeToApprovalMs: 0, oldestPendingAgeMs: 0, totalApproved: 0, totalRejected: 0, totalExpired: 0 };
  const allIntents = await db.select().from(intents).where(eq(intents.userId, userId));
  const pending = allIntents.filter(i => i.status === "PENDING_APPROVAL");
  const approved = allIntents.filter(i => i.status === "APPROVED" || i.status === "EXECUTED");
  const rejected = allIntents.filter(i => i.status === "REJECTED");
  const expired = allIntents.filter(i => i.status === "EXPIRED");
  const now = Date.now();
  const oldestPendingAgeMs = pending.length > 0
    ? Math.max(...pending.map(i => now - (i.createdAt?.getTime() ?? now)))
    : 0;
  // Compute avg time-to-approval from intents that have approvals
  const userApprovals = await db.select().from(approvals).where(eq(approvals.userId, userId));
  let totalApprovalTime = 0;
  let approvalCount = 0;
  for (const apr of userApprovals) {
    const intent = allIntents.find(i => i.intentId === apr.intentId);
    if (intent && apr.createdAt && intent.createdAt) {
      totalApprovalTime += apr.createdAt.getTime() - intent.createdAt.getTime();
      approvalCount++;
    }
  }
  return {
    queueSize: pending.length,
    avgTimeToApprovalMs: approvalCount > 0 ? Math.round(totalApprovalTime / approvalCount) : 0,
    oldestPendingAgeMs,
    totalApproved: approved.length,
    totalRejected: rejected.length,
    totalExpired: expired.length,
  };
}

// ─── Approval Helpers ───────────────────────────────────────────
export async function createApproval(intentId: string, userId: number, decision: "APPROVED" | "REJECTED", signature: string, boundToolName: string, boundArgsHash: string, expiresAt: number, maxExecutions: number, principalId?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const approvalId = `APR-${nanoid(16)}`;
  await db.insert(approvals).values({ approvalId, intentId, userId, decision, signature, boundToolName, boundArgsHash, expiresAt, maxExecutions, principalId: principalId ?? null });
  const rows = await db.select().from(approvals).where(eq(approvals.approvalId, approvalId)).limit(1);
  return rows[0];
}

export async function getApproval(approvalId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(approvals).where(eq(approvals.approvalId, approvalId)).limit(1);
  return rows[0] ?? null;
}

export async function getApprovalForIntent(intentId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(approvals).where(eq(approvals.intentId, intentId)).orderBy(desc(approvals.id)).limit(1);
  return rows[0] ?? null;
}

export async function incrementApprovalExecution(approvalId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvals).set({ executionCount: sql`${approvals.executionCount} + 1` }).where(eq(approvals.approvalId, approvalId));
}

// ─── Execution Helpers ──────────────────────────────────────────
export async function createExecution(intentId: string, approvalId: string | null, result: Record<string, unknown>, receiptHash: string, preflightResults: Array<{ check: string; status: string; detail: string }>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const executionId = `EXE-${nanoid(16)}`;
  await db.insert(executions).values({ executionId, intentId, approvalId, result, receiptHash, preflightResults });
  const rows = await db.select().from(executions).where(eq(executions.executionId, executionId)).limit(1);
  return rows[0];
}

export async function getExecution(executionId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(executions).where(eq(executions.executionId, executionId)).limit(1);
  return rows[0] ?? null;
}

export async function getExecutionByIntentId(intentId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(executions).where(eq(executions.intentId, intentId)).limit(1);
  return rows[0] ?? null;
}

export async function updateExecutionReceiptHash(executionId: string, receiptHash: string, receiptPayload?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateSet: Record<string, unknown> = { receiptHash };
  if (receiptPayload) updateSet.receiptPayload = receiptPayload;
  await db.update(executions).set(updateSet).where(eq(executions.executionId, executionId));
}

export async function getUserApprovals(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(approvals).where(eq(approvals.userId, userId)).orderBy(desc(approvals.id)).limit(limit);
}

// ─── Key Backup Helpers ────────────────────────────────────────
export async function saveKeyBackup(userId: number, encryptedKey: string, iv: string, salt: string, publicKeyFingerprint: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Upsert: delete existing backup for this user, then insert new one
  await db.delete(keyBackups).where(eq(keyBackups.userId, userId));
  await db.insert(keyBackups).values({ userId, encryptedKey, iv, salt, publicKeyFingerprint });
  const rows = await db.select().from(keyBackups).where(eq(keyBackups.userId, userId)).limit(1);
  return rows[0];
}

export async function getKeyBackup(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(keyBackups).where(eq(keyBackups.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function deleteKeyBackup(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(keyBackups).where(eq(keyBackups.userId, userId));
}

// ─── Ledger Resync Helper ──────────────────────────────────────
export async function getLedgerEntriesSince(afterEntryId?: string) {
  const allEntries = await getAllLedgerEntries();
  if (!afterEntryId) return allEntries;
  const idx = allEntries.findIndex(e => e.entryId === afterEntryId);
  if (idx < 0) return allEntries; // Entry not found, return all
  return allEntries.slice(idx + 1);
}

// ═══════════════════════════════════════════════════════════════════
// BONDI AI ROUTER DATABASE HELPERS
// ═══════════════════════════════════════════════════════════════════

// ─── Conversation Helpers ──────────────────────────────────────
export async function createConversation(
  userId: number,
  title: string,
  nodeId: string,
  mode: "REFLECT" | "COMPUTE" | "DRAFT" | "VERIFY" | "EXECUTE" | "ROBOT",
  initialMessages: Array<{ role: string; content: string; timestamp: number; metadata?: Record<string, unknown> }>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conversationId = `CONV-${nanoid(16)}`;
  await db.insert(conversations).values({
    conversationId,
    userId,
    title,
    nodeId,
    mode,
    messages: initialMessages,
  });
  const rows = await db.select().from(conversations).where(eq(conversations.conversationId, conversationId)).limit(1);
  return rows[0];
}

export async function getConversation(conversationId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(conversations).where(eq(conversations.conversationId, conversationId)).limit(1);
  return rows[0] ?? null;
}

export async function getUserConversations(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.id)).limit(limit);
}

export async function updateConversationMessages(
  conversationId: string,
  messages: Array<{ role: string; content: string; timestamp: number; metadata?: Record<string, unknown> }>,
  mode?: "REFLECT" | "COMPUTE" | "DRAFT" | "VERIFY" | "EXECUTE" | "ROBOT",
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Record<string, unknown> = { messages };
  if (mode) updateData.mode = mode;
  await db.update(conversations).set(updateData).where(eq(conversations.conversationId, conversationId));
}

export async function addIntentToConversation(conversationId: string, intentId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conv = await getConversation(conversationId);
  if (!conv) throw new Error("Conversation not found");
  const currentIds = (conv.intentIds as string[] | null) ?? [];
  await db.update(conversations).set({ intentIds: [...currentIds, intentId] }).where(eq(conversations.conversationId, conversationId));
}

export async function closeConversation(conversationId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(conversations).set({ status: "CLOSED" }).where(eq(conversations.conversationId, conversationId));
}

// ─── Learning Event Helpers ────────────────────────────────────
export async function createLearningEvent(
  userId: number,
  eventId: string,
  eventType: "APPROVAL" | "REJECTION" | "EXECUTION" | "FEEDBACK" | "CORRECTION",
  data: {
    intentId?: string | null;
    conversationId?: string | null;
    context?: Record<string, unknown>;
    feedback?: string | null;
    outcome?: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
    tags?: string[];
  },
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(learningEvents).values({
    eventId,
    userId,
    eventType,
    intentId: data.intentId ?? undefined,
    conversationId: data.conversationId ?? undefined,
    context: data.context ?? {},
    feedback: data.feedback ?? undefined,
    outcome: data.outcome ?? "NEUTRAL",
    tags: data.tags ?? [],
  });
  const rows = await db.select().from(learningEvents).where(eq(learningEvents.eventId, eventId)).limit(1);
  return rows[0];
}

export async function getUserLearningEvents(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(learningEvents).where(eq(learningEvents.userId, userId)).orderBy(desc(learningEvents.id)).limit(limit);
}

export async function getRecentLearningContext(userId: number, limit = 20) {
  const events = await getUserLearningEvents(userId, limit);
  return events.map(e => ({
    eventType: e.eventType,
    toolName: (e.context as Record<string, unknown>)?.toolName as string | undefined,
    outcome: e.outcome,
    feedback: e.feedback ?? undefined,
    timestamp: e.createdAt?.getTime() ?? Date.now(),
  }));
}

// ─── Node Config Helpers ───────────────────────────────────────
export async function getAllNodeConfigs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(nodeConfigs).orderBy(desc(nodeConfigs.priority));
}

export async function getActiveNodeConfigs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(nodeConfigs).where(eq(nodeConfigs.isActive, true)).orderBy(desc(nodeConfigs.priority));
}

export async function getNodeConfig(nodeId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(nodeConfigs).where(eq(nodeConfigs.nodeId, nodeId)).limit(1);
  return rows[0] ?? null;
}

// ═══════════════════════════════════════════════════════════════════
// SYSTEM SELF-KNOWLEDGE
// ═══════════════════════════════════════════════════════════════════

export async function getSystemComponents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(systemComponents).orderBy(systemComponents.componentId);
}

export async function getSystemComponent(componentId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(systemComponents).where(eq(systemComponents.componentId, componentId)).limit(1);
  return rows[0] ?? null;
}

// ═══════════════════════════════════════════════════════════════════
// POLICY RULES HELPERS
// ═══════════════════════════════════════════════════════════════════

export async function createPolicyRule(userId: number, data: {
  name: string;
  description?: string;
  toolPattern: string;
  riskOverride?: "LOW" | "MEDIUM" | "HIGH";
  requiresApproval: boolean;
  condition?: { field: string; operator: string; value: string } | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const ruleId = `RULE-${nanoid(16)}`;
  await db.insert(policyRules).values({
    ruleId,
    userId,
    name: data.name,
    description: data.description,
    toolPattern: data.toolPattern,
    riskOverride: data.riskOverride,
    requiresApproval: data.requiresApproval,
    condition: data.condition ?? null,
  });
  const rows = await db.select().from(policyRules).where(eq(policyRules.ruleId, ruleId)).limit(1);
  return rows[0];
}

export async function getUserPolicyRules(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(policyRules).where(eq(policyRules.userId, userId)).orderBy(desc(policyRules.id));
}

export async function getAllPolicyRules() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(policyRules).orderBy(desc(policyRules.id));
}

export async function getActivePolicyRulesForTool(toolName: string) {
  const db = await getDb();
  if (!db) return [];
  const allRules = await db.select().from(policyRules).where(eq(policyRules.enabled, true)).orderBy(desc(policyRules.id));
  // Filter: exact match on toolPattern or wildcard '*'
  return allRules.filter(r => r.toolPattern === toolName || r.toolPattern === '*');
}

export async function updatePolicyRule(ruleId: string, data: {
  name?: string;
  description?: string;
  toolPattern?: string;
  riskOverride?: "LOW" | "MEDIUM" | "HIGH" | null;
  requiresApproval?: boolean;
  condition?: { field: string; operator: string; value: string } | null;
  enabled?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateSet: Record<string, unknown> = {};
  if (data.name !== undefined) updateSet.name = data.name;
  if (data.description !== undefined) updateSet.description = data.description;
  if (data.toolPattern !== undefined) updateSet.toolPattern = data.toolPattern;
  if (data.riskOverride !== undefined) updateSet.riskOverride = data.riskOverride;
  if (data.requiresApproval !== undefined) updateSet.requiresApproval = data.requiresApproval;
  if (data.condition !== undefined) updateSet.condition = data.condition;
  if (data.enabled !== undefined) updateSet.enabled = data.enabled;
  await db.update(policyRules).set(updateSet).where(eq(policyRules.ruleId, ruleId));
  const rows = await db.select().from(policyRules).where(eq(policyRules.ruleId, ruleId)).limit(1);
  return rows[0] ?? null;
}

export async function deletePolicyRule(ruleId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(policyRules).where(eq(policyRules.ruleId, ruleId));
}

export async function togglePolicyRule(ruleId: string, enabled: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(policyRules).set({ enabled }).where(eq(policyRules.ruleId, ruleId));
  const rows = await db.select().from(policyRules).where(eq(policyRules.ruleId, ruleId)).limit(1);
  return rows[0] ?? null;
}

// ═══════════════════════════════════════════════════════════════════
// NOTIFICATION HELPERS
// ═══════════════════════════════════════════════════════════════════

export async function createNotification(userId: number, data: {
  type: "APPROVAL_NEEDED" | "EXECUTION_COMPLETE" | "EXECUTION_FAILED" | "KILL_SWITCH" | "POLICY_UPDATE" | "SYSTEM";
  title: string;
  body: string;
  intentId?: string;
  executionId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const notificationId = `NOTIF-${nanoid(16)}`;
  await db.insert(notifications).values({
    notificationId,
    userId,
    type: data.type,
    title: data.title,
    body: data.body,
    intentId: data.intentId,
    executionId: data.executionId,
  });
  const rows = await db.select().from(notifications).where(eq(notifications.notificationId, notificationId)).limit(1);
  return rows[0];
}

export async function getUserNotifications(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.id)).limit(limit);
}

export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ count: sql<number>`COUNT(*)` }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  return rows[0]?.count ?? 0;
}

export async function markNotificationRead(notificationId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(notifications).set({ read: true }).where(eq(notifications.notificationId, notificationId));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(notifications).set({ read: true }).where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
}

// ─── Principal Helpers (Role Enforcement — Area 1) ─────────────

/**
 * Get or create a principal for a user.
 * On first login, creates a principal with no roles (fail-closed: no roles = no access to governed actions).
 * The owner (identified by OWNER_OPEN_ID) is auto-assigned all roles.
 */
export async function getOrCreatePrincipal(userId: number, displayName: string | null, isOwner: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(principals).where(eq(principals.userId, userId)).limit(1);
  if (existing.length > 0) return existing[0];
  // Owner gets all roles; everyone else starts with no roles (must be explicitly assigned)
  const roles: SystemRole[] = isOwner ? ["proposer", "approver", "executor", "auditor", "meta"] : [];
  const principalId = `PRI-${nanoid(16)}`;
  await db.insert(principals).values({
    principalId,
    userId,
    displayName: displayName ?? undefined,
    principalType: "human",
    roles,
    status: "active",
  });
  const rows = await db.select().from(principals).where(eq(principals.principalId, principalId)).limit(1);
  return rows[0];
}

/**
 * Get a principal by user ID. Returns null if not found.
 */
export async function getPrincipalByUserId(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(principals).where(eq(principals.userId, userId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Get a principal by principal ID. Returns null if not found.
 */
export async function getPrincipalById(principalId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(principals).where(eq(principals.principalId, principalId)).limit(1);
  return rows[0] ?? null;
}

/**
 * List all principals. Returns all principals ordered by creation date.
 */
export async function listPrincipals() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(principals).orderBy(desc(principals.id));
}

/**
 * Assign a role to a principal. Idempotent — if the role already exists, no change.
 */
export async function assignRole(principalId: string, role: SystemRole) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(principals).where(eq(principals.principalId, principalId)).limit(1);
  if (rows.length === 0) throw new Error(`Principal ${principalId} not found`);
  const principal = rows[0];
  const currentRoles: SystemRole[] = (principal.roles as SystemRole[]) ?? [];
  if (currentRoles.includes(role)) return principal; // already has role
  const newRoles = [...currentRoles, role];
  await db.update(principals).set({ roles: newRoles }).where(eq(principals.principalId, principalId));
  const updated = await db.select().from(principals).where(eq(principals.principalId, principalId)).limit(1);
  return updated[0];
}

/**
 * Remove a role from a principal. Idempotent — if the role doesn't exist, no change.
 */
export async function removeRole(principalId: string, role: SystemRole) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(principals).where(eq(principals.principalId, principalId)).limit(1);
  if (rows.length === 0) throw new Error(`Principal ${principalId} not found`);
  const principal = rows[0];
  const currentRoles: SystemRole[] = (principal.roles as SystemRole[]) ?? [];
  const newRoles = currentRoles.filter(r => r !== role);
  await db.update(principals).set({ roles: newRoles }).where(eq(principals.principalId, principalId));
  const updated = await db.select().from(principals).where(eq(principals.principalId, principalId)).limit(1);
  return updated[0];
}

/**
 * Update a principal's status (active, suspended, revoked).
 */
export async function updatePrincipalStatus(principalId: string, status: "active" | "suspended" | "revoked") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(principals).set({ status }).where(eq(principals.principalId, principalId));
  const rows = await db.select().from(principals).where(eq(principals.principalId, principalId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Check if a principal has a specific role.
 * Returns false if the principal is not found, not active, or doesn't have the role.
 * This is the core enforcement check — fail-closed.
 */
export function principalHasRole(principal: { roles: unknown; status: string } | null | undefined, role: SystemRole): boolean {
  if (!principal) return false;
  if (principal.status !== "active") return false;
  const roles = principal.roles as SystemRole[] | null;
  if (!roles || !Array.isArray(roles)) return false;
  return roles.includes(role);
}

// ═══════════════════════════════════════════════════════════════════
// EMAIL FIREWALL CONFIG
// ═══════════════════════════════════════════════════════════════════

/**
 * Get the email firewall config for a user.
 * Returns null if no config exists (defaults should be used).
 */
export async function getEmailFirewallConfig(userId: number): Promise<EmailFirewallConfig | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.select().from(emailFirewallConfig).where(eq(emailFirewallConfig.userId, userId)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error("[DB] getEmailFirewallConfig error:", error);
    return null;
  }
}

/**
 * Upsert email firewall config for a user.
 * Creates if not exists, updates if exists.
 */
export async function upsertEmailFirewallConfig(userId: number, config: {
  strictness?: "strict" | "standard" | "permissive";
  preset?: string;
  ruleOverrides?: Record<string, { enabled: boolean }>;
  categoryOverrides?: Record<string, string>;
  internalDomains?: string[];
  llmEnabled?: boolean;
}): Promise<EmailFirewallConfig | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const existing = await getEmailFirewallConfig(userId);
    if (existing) {
      // Update existing
      await db.update(emailFirewallConfig)
        .set({
          ...(config.strictness !== undefined && { strictness: config.strictness }),
          ...(config.preset !== undefined && { preset: config.preset }),
          ...(config.ruleOverrides !== undefined && { ruleOverrides: config.ruleOverrides }),
          ...(config.categoryOverrides !== undefined && { categoryOverrides: config.categoryOverrides }),
          ...(config.internalDomains !== undefined && { internalDomains: config.internalDomains }),
          ...(config.llmEnabled !== undefined && { llmEnabled: config.llmEnabled }),
        })
        .where(eq(emailFirewallConfig.userId, userId));
    } else {
      // Insert new
      await db.insert(emailFirewallConfig).values({
        userId,
        strictness: config.strictness ?? "standard",
        preset: config.preset ?? "personal",
        ruleOverrides: config.ruleOverrides ?? {},
        categoryOverrides: config.categoryOverrides ?? {},
        internalDomains: config.internalDomains ?? [],
        llmEnabled: config.llmEnabled ?? true,
      });
    }
    return getEmailFirewallConfig(userId);
  } catch (error) {
    console.error("[DB] upsertEmailFirewallConfig error:", error);
    return null;
  }
}


// ─── Pending Email Approvals (persisted for cross-deploy link survival) ──────

export async function createPendingEmailApproval(params: {
  intentId: string;
  actionType: string;
  actionSummary: string;
  actionDetails?: Record<string, unknown>;
  proposerEmail: string;
  approverEmail: string;
  tokenNonce: string;
  expiresAt: Date;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(pendingEmailApprovals).values({
    intentId: params.intentId,
    actionType: params.actionType,
    actionSummary: params.actionSummary,
    actionDetails: params.actionDetails ?? null,
    proposerEmail: params.proposerEmail,
    approverEmail: params.approverEmail,
    tokenNonce: params.tokenNonce,
    status: "PENDING",
    expiresAt: params.expiresAt,
  });
}

export async function getPendingEmailApproval(intentId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(pendingEmailApprovals)
    .where(eq(pendingEmailApprovals.intentId, intentId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPendingEmailApprovalByNonce(nonce: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(pendingEmailApprovals)
    .where(eq(pendingEmailApprovals.tokenNonce, nonce))
    .limit(1);
  return rows[0] ?? null;
}

export async function updatePendingEmailApprovalStatus(
  intentId: string,
  status: "APPROVED" | "DECLINED" | "EXPIRED",
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(pendingEmailApprovals)
    .set({ status })
    .where(eq(pendingEmailApprovals.intentId, intentId));
}

export async function isNonceUsedInDb(nonce: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select().from(pendingEmailApprovals)
    .where(eq(pendingEmailApprovals.tokenNonce, nonce))
    .limit(1);
  if (!rows[0]) return false;
  return rows[0].status !== "PENDING";
}

// ═══════════════════════════════════════════════════════════════════
// LEARNING LOOP — DB HELPERS
// ═══════════════════════════════════════════════════════════════════

export async function insertLearningEvent(event: {
  actionSignature: string;
  riskScore: number;
  decision: "APPROVED" | "REJECTED" | "BLOCKED";
  eventType: "APPROVAL" | "REJECTION" | "EXECUTION" | "FEEDBACK" | "CORRECTION";
  intentId?: string;
  userId?: number;
  context?: Record<string, unknown>;
}): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const eventId = `LE-${nanoid(12)}`;
  await db.insert(learningEvents).values({
    eventId,
    userId: event.userId ?? 0,
    eventType: event.eventType,
    intentId: event.intentId,
    actionSignature: event.actionSignature,
    riskScore: event.riskScore,
    decision: event.decision,
    context: event.context,
    outcome: event.decision === "APPROVED" ? "POSITIVE" : event.decision === "REJECTED" ? "NEGATIVE" : "NEUTRAL",
  });
  return eventId;
}

export async function getLearningStats(actionSignature: string): Promise<{
  totalEvents: number;
  approvedCount: number;
  rejectedCount: number;
  blockedCount: number;
  avgRiskScore: number;
}> {
  const db = await getDb();
  if (!db) return { totalEvents: 0, approvedCount: 0, rejectedCount: 0, blockedCount: 0, avgRiskScore: 50 };
  
  const rows = await db.select().from(learningEvents)
    .where(eq(learningEvents.actionSignature, actionSignature));
  
  if (rows.length === 0) {
    return { totalEvents: 0, approvedCount: 0, rejectedCount: 0, blockedCount: 0, avgRiskScore: 50 };
  }

  const approvedCount = rows.filter(r => r.decision === "APPROVED").length;
  const rejectedCount = rows.filter(r => r.decision === "REJECTED").length;
  const blockedCount = rows.filter(r => r.decision === "BLOCKED").length;
  const riskScores = rows.filter(r => r.riskScore != null).map(r => r.riskScore!);
  const avgRiskScore = riskScores.length > 0 
    ? Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length)
    : 50;

  return {
    totalEvents: rows.length,
    approvedCount,
    rejectedCount,
    blockedCount,
    avgRiskScore,
  };
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 2A — PROPOSAL PACKET HELPERS
// ═══════════════════════════════════════════════════════════════════

export async function createProposalPacket(data: Omit<InsertProposalPacket, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(proposalPackets).values(data);
  const rows = await db.select().from(proposalPackets).where(eq(proposalPackets.proposalId, data.proposalId)).limit(1);
  return rows[0];
}

export async function getProposalPacket(proposalId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(proposalPackets).where(eq(proposalPackets.proposalId, proposalId)).limit(1);
  return rows[0] ?? null;
}

export async function listProposalPackets(filters?: {
  status?: string;
  type?: string;
  riskTier?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.status) conditions.push(eq(proposalPackets.status, filters.status as any));
  if (filters?.type) conditions.push(eq(proposalPackets.type, filters.type as any));
  if (filters?.riskTier) conditions.push(eq(proposalPackets.riskTier, filters.riskTier as any));
  const query = conditions.length > 0
    ? db.select().from(proposalPackets).where(and(...conditions)).orderBy(desc(proposalPackets.id)).limit(filters?.limit ?? 50)
    : db.select().from(proposalPackets).orderBy(desc(proposalPackets.id)).limit(filters?.limit ?? 50);
  return query;
}

export async function updateProposalPacketStatus(proposalId: string, status: "proposed" | "approved" | "rejected" | "executed" | "failed" | "expired", extra?: { receiptId?: string; intentId?: string; notionPageId?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Record<string, unknown> = { status };
  if (extra?.receiptId) updateData.receiptId = extra.receiptId;
  if (extra?.intentId) updateData.intentId = extra.intentId;
  if (extra?.notionPageId) updateData.notionPageId = extra.notionPageId;
  await db.update(proposalPackets).set(updateData).where(eq(proposalPackets.proposalId, proposalId));
}

export async function updateProposalAftermath(proposalId: string, aftermath: Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(proposalPackets).set({ aftermath: aftermath as any }).where(eq(proposalPackets.proposalId, proposalId));
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 2E — TRUST POLICY HELPERS
// ═══════════════════════════════════════════════════════════════════

export async function createTrustPolicy(data: Omit<InsertTrustPolicy, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(trustPolicies).values(data);
  const rows = await db.select().from(trustPolicies).where(eq(trustPolicies.policyId, data.policyId)).limit(1);
  return rows[0];
}

export async function getTrustPolicy(policyId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(trustPolicies).where(eq(trustPolicies.policyId, policyId)).limit(1);
  return rows[0] ?? null;
}

export async function listActiveTrustPolicies(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(trustPolicies)
    .where(and(eq(trustPolicies.userId, userId), eq(trustPolicies.active, true)))
    .orderBy(desc(trustPolicies.id));
}

export async function findMatchingTrustPolicy(userId: number, category: string, riskTier: "LOW" | "MEDIUM" | "HIGH") {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(trustPolicies)
    .where(and(
      eq(trustPolicies.userId, userId),
      eq(trustPolicies.category, category),
      eq(trustPolicies.riskTier, riskTier as any),
      eq(trustPolicies.active, true)
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateTrustPolicy(policyId: string, updates: { trustLevel?: number; conditions?: Record<string, unknown>; active?: boolean; governanceReceiptId?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(trustPolicies).set(updates as any).where(eq(trustPolicies.policyId, policyId));
}

export async function deactivateTrustPolicy(policyId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(trustPolicies).set({ active: false }).where(eq(trustPolicies.policyId, policyId));
}

// ═══════════════════════════════════════════════════════════════════
// SENTINEL EVENT HELPERS
// ═══════════════════════════════════════════════════════════════════

export async function createSentinelEvent(data: Omit<InsertSentinelEvent, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(sentinelEvents).values(data);
  const rows = await db.select().from(sentinelEvents).where(eq(sentinelEvents.eventId, data.eventId)).limit(1);
  return rows[0];
}

export async function listSentinelEvents(filters?: { type?: string; severity?: string; acknowledged?: boolean; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.type) conditions.push(eq(sentinelEvents.type, filters.type as any));
  if (filters?.severity) conditions.push(eq(sentinelEvents.severity, filters.severity as any));
  if (filters?.acknowledged !== undefined) conditions.push(eq(sentinelEvents.acknowledged, filters.acknowledged));
  const query = conditions.length > 0
    ? db.select().from(sentinelEvents).where(and(...conditions)).orderBy(desc(sentinelEvents.id)).limit(filters?.limit ?? 50)
    : db.select().from(sentinelEvents).orderBy(desc(sentinelEvents.id)).limit(filters?.limit ?? 50);
  return query;
}

export async function acknowledgeSentinelEvent(eventId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(sentinelEvents).set({ acknowledged: true }).where(eq(sentinelEvents.eventId, eventId));
}

/**
 * Get baseline pattern for a category — computes approval_rate_14d,
 * avg_velocity_seconds, and edit_rate from recent proposal history.
 */
export async function getBaselinePattern(category: string) {
  const db = await getDb();
  if (!db) return { approval_rate_14d: 0, avg_velocity_seconds: 0, edit_rate: 0 };
  
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const rows = await db.select().from(proposalPackets)
    .where(and(
      eq(proposalPackets.category, category),
      sql`${proposalPackets.createdAt} >= ${fourteenDaysAgo}`
    ));
  
  if (rows.length === 0) return { approval_rate_14d: 0, avg_velocity_seconds: 0, edit_rate: 0 };
  
  const approved = rows.filter(r => r.status === "approved" || r.status === "executed").length;
  const approval_rate_14d = approved / rows.length;
  
  // Average velocity: time from creation to approval (in seconds)
  const approvedRows = rows.filter(r => r.status !== "proposed" && r.status !== "expired");
  const velocities = approvedRows.map(r => {
    const created = new Date(r.createdAt).getTime();
    const updated = new Date(r.updatedAt).getTime();
    return Math.floor((updated - created) / 1000);
  }).filter(v => v > 0);
  const avg_velocity_seconds = velocities.length > 0
    ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length)
    : 0;
  
  // Edit rate: proposals that were rejected or had aftermath indicating edits
  const edited = rows.filter(r => r.status === "rejected").length;
  const edit_rate = edited / rows.length;
  
  return { approval_rate_14d, avg_velocity_seconds, edit_rate };
}


// ═══════════════════════════════════════════════════════════════════
// PHASE 2F — BUDGET POOL & FINANCIAL TRANSACTION HELPERS
// ═══════════════════════════════════════════════════════════════════

export async function createBudgetPool(data: Omit<InsertBudgetPool, "id">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(budgetPools).values(data);
  return db.select().from(budgetPools).where(eq(budgetPools.poolId, data.poolId)).then(r => r[0]);
}

export async function getBudgetPool(poolId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(budgetPools).where(eq(budgetPools.poolId, poolId));
  return rows[0] ?? null;
}

export async function listBudgetPools(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(budgetPools).where(eq(budgetPools.userId, userId)).orderBy(desc(budgetPools.createdAt));
}

export async function updateBudgetPool(poolId: string, updates: Partial<Pick<InsertBudgetPool, "name" | "balanceCents" | "limitCents" | "spendingRateCentsPerDay" | "status" | "policyVersion" | "governanceReceiptId">>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(budgetPools).set(updates).where(eq(budgetPools.poolId, poolId));
  return getBudgetPool(poolId);
}

export async function createFinancialTransaction(data: Omit<InsertFinancialTransaction, "id">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(financialTransactions).values(data);
  return db.select().from(financialTransactions).where(eq(financialTransactions.transactionId, data.transactionId)).then(r => r[0]);
}

export async function listFinancialTransactions(budgetPoolId: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(financialTransactions)
    .where(eq(financialTransactions.budgetPoolId, budgetPoolId))
    .orderBy(desc(financialTransactions.createdAt))
    .limit(limit);
}

export async function getFinancialSummary(budgetPoolId: string) {
  const db = await getDb();
  if (!db) return { totalIn: 0, totalOut: 0, transactionCount: 0 };
  const rows = await db.select().from(financialTransactions)
    .where(eq(financialTransactions.budgetPoolId, budgetPoolId));
  let totalIn = 0, totalOut = 0;
  for (const r of rows) {
    if (r.amountCents > 0) totalIn += r.amountCents;
    else totalOut += Math.abs(r.amountCents);
  }
  return { totalIn, totalOut, transactionCount: rows.length };
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 2G — HANDOFF PACKET HELPERS
// ═══════════════════════════════════════════════════════════════════

export async function createHandoffPacket(data: Omit<InsertHandoffPacket, "id">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(handoffPackets).values(data);
  return db.select().from(handoffPackets).where(eq(handoffPackets.handoffId, data.handoffId)).then(r => r[0]);
}

export async function getHandoffPacket(handoffId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(handoffPackets).where(eq(handoffPackets.handoffId, handoffId));
  return rows[0] ?? null;
}

export async function listHandoffPackets(filters?: { fromAgent?: string; toAgent?: string; status?: string; workType?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.fromAgent) conditions.push(eq(handoffPackets.fromAgent, filters.fromAgent));
  if (filters?.toAgent) conditions.push(eq(handoffPackets.toAgent, filters.toAgent));
  if (filters?.status) conditions.push(eq(handoffPackets.status, filters.status as any));
  if (filters?.workType) conditions.push(eq(handoffPackets.workType, filters.workType as any));
  const query = conditions.length > 0
    ? db.select().from(handoffPackets).where(and(...conditions))
    : db.select().from(handoffPackets);
  return query.orderBy(desc(handoffPackets.createdAt)).limit(100);
}

export async function updateHandoffPacket(handoffId: string, updates: Partial<Pick<InsertHandoffPacket, "status" | "result" | "receiptId">>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(handoffPackets).set(updates).where(eq(handoffPackets.handoffId, handoffId));
  return getHandoffPacket(handoffId);
}
