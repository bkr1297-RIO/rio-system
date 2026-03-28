import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── RIO Tables ──────────────────────────────────────────────────────────────

export const intents = mysqlTable("intents", {
  id: int("id").autoincrement().primaryKey(),
  intentId: varchar("intentId", { length: 64 }).notNull().unique(),
  action: varchar("action", { length: 128 }).notNull(),
  description: text("description"),
  requestedBy: varchar("requestedBy", { length: 128 }).notNull(),
  intentHash: varchar("intentHash", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "denied", "executed", "blocked"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const approvals = mysqlTable("approvals", {
  id: int("id").autoincrement().primaryKey(),
  intentId: varchar("intentId", { length: 64 }).notNull(),
  decision: mysqlEnum("decision", ["approved", "denied"]).notNull(),
  decidedBy: varchar("decidedBy", { length: 128 }).notNull(),
  signature: text("signature").notNull(),
  publicKey: text("publicKey").notNull(),
  decidedAt: timestamp("decidedAt").defaultNow().notNull(),
});

export const executions = mysqlTable("executions", {
  id: int("id").autoincrement().primaryKey(),
  intentId: varchar("intentId", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["success", "blocked"]).notNull(),
  detail: text("detail"),
  executedAt: timestamp("executedAt").defaultNow().notNull(),
});

export const receipts = mysqlTable("receipts", {
  id: int("id").autoincrement().primaryKey(),
  receiptId: varchar("receiptId", { length: 64 }).notNull().unique(),
  intentId: varchar("intentId", { length: 64 }).notNull(),
  intentHash: varchar("intent_hash", { length: 128 }).default(""),
  action: varchar("action", { length: 128 }).notNull(),
  actionHash: varchar("action_hash", { length: 128 }).default(""),
  requestedBy: varchar("requestedBy", { length: 128 }).notNull(),
  approvedBy: varchar("approvedBy", { length: 128 }),
  decision: varchar("decision", { length: 32 }).notNull(),
  timestampRequest: timestamp("timestampRequest").notNull(),
  timestampApproval: timestamp("timestampApproval"),
  timestampExecution: timestamp("timestampExecution"),
  signature: text("signature"),
  verificationStatus: varchar("verification_status", { length: 32 }).default("skipped"),
  verificationHash: varchar("verification_hash", { length: 128 }).default(""),
  riskScore: int("risk_score").default(0),
  riskLevel: varchar("risk_level", { length: 32 }).default(""),
  policyRuleId: varchar("policy_rule_id", { length: 64 }).default(""),
  policyDecision: varchar("policy_decision", { length: 32 }).default(""),
  receiptHash: varchar("receiptHash", { length: 128 }).notNull(),
  previousHash: varchar("previousHash", { length: 128 }),
  protocolVersion: varchar("protocol_version", { length: 8 }).default("v2"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ── Blog Posts ──────────────────────────────────────────────────────────────

export const blogPosts = mysqlTable("blog_posts", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  title: varchar("title", { length: 256 }).notNull(),
  summary: text("summary"),
  content: text("content").notNull(),
  category: mysqlEnum("category", ["release", "announcement", "technical", "industry"]).default("announcement").notNull(),
  published: int("published").default(0).notNull(),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;

// ── Governance Policies ────────────────────────────────────────────────────

export const policies = mysqlTable("policies", {
  id: int("id").autoincrement().primaryKey(),
  policyId: varchar("policyId", { length: 64 }).notNull().unique(),
  action: varchar("action", { length: 128 }).notNull(),
  type: mysqlEnum("type", ["auto_approve", "auto_deny", "reduce_pause", "increase_scrutiny"]).notNull(),
  riskLevel: varchar("risk_level", { length: 32 }),
  confidence: int("confidence").default(0).notNull(),
  basedOnDecisions: int("based_on_decisions").default(0).notNull(),
  approvalRate: int("approval_rate").default(0).notNull(),
  avgDecisionTimeSec: int("avg_decision_time_sec").default(0).notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["active", "dismissed", "expired"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Policy = typeof policies.$inferSelect;
export type InsertPolicy = typeof policies.$inferInsert;

// ── User Connections (OAuth tokens per user per provider) ─────────────────

export const userConnections = mysqlTable("user_connections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  provider: varchar("provider", { length: 64 }).notNull(), // gmail, google_calendar, google_drive, github, slack, outlook
  providerAccountId: varchar("provider_account_id", { length: 256 }), // email or username on the provider
  providerAccountName: varchar("provider_account_name", { length: 256 }), // display name
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  scopes: text("scopes"), // comma-separated list of granted scopes
  status: mysqlEnum("status", ["connected", "expired", "revoked", "error"]).default("connected").notNull(),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type UserConnection = typeof userConnections.$inferSelect;
export type InsertUserConnection = typeof userConnections.$inferInsert;

export const ledger = mysqlTable("ledger", {
  id: int("id").autoincrement().primaryKey(),
  blockId: varchar("blockId", { length: 64 }).notNull().unique(),
  intentId: varchar("intentId", { length: 64 }).notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  decision: varchar("decision", { length: 32 }).notNull(),
  receiptHash: varchar("receipt_hash", { length: 128 }).default(""),
  previousHash: varchar("previousHash", { length: 128 }),
  currentHash: varchar("currentHash", { length: 128 }).notNull(),
  ledgerSignature: text("ledger_signature"),
  protocolVersion: varchar("protocol_version", { length: 8 }).default("v2"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  recordedBy: varchar("recordedBy", { length: 128 }).default("RIO System").notNull(),
});