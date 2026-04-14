import { int, bigint, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
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

/**
 * Proxy users — onboarded identities with Ed25519 public keys and policy bindings.
 */
export const proxyUsers = mysqlTable("proxy_users", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  publicKey: text("publicKey").notNull(),
  policyHash: varchar("policyHash", { length: 128 }).notNull(),
  seedVersion: varchar("seedVersion", { length: 32 }).notNull().default("SEED-v1.0.0"),
  status: mysqlEnum("status", ["ACTIVE", "KILLED", "SUSPENDED"]).default("ACTIVE").notNull(),
  killReason: text("killReason"),
  killedAt: timestamp("killedAt"),
  onboardedAt: timestamp("onboardedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProxyUser = typeof proxyUsers.$inferSelect;

/**
 * Tool registry — available tools with risk tiers.
 */
export const toolRegistry = mysqlTable("tool_registry", {
  id: int("id").autoincrement().primaryKey(),
  toolName: varchar("toolName", { length: 128 }).notNull().unique(),
  description: text("description").notNull(),
  riskTier: mysqlEnum("riskTier", ["LOW", "MEDIUM", "HIGH"]).notNull(),
  requiredParams: json("requiredParams").$type<string[]>().notNull(),
  blastRadiusBase: int("blastRadiusBase").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ToolRegistryEntry = typeof toolRegistry.$inferSelect;

/**
 * Intents — proposed actions awaiting governance.
 */
export const intents = mysqlTable("intents", {
  id: int("id").autoincrement().primaryKey(),
  intentId: varchar("intentId", { length: 64 }).notNull().unique(),
  userId: int("userId").notNull(),
  toolName: varchar("toolName", { length: 128 }).notNull(),
  toolArgs: json("toolArgs").$type<Record<string, unknown>>().notNull(),
  argsHash: varchar("argsHash", { length: 128 }).notNull(),
  riskTier: mysqlEnum("riskTier", ["LOW", "MEDIUM", "HIGH"]).notNull(),
  blastRadius: json("blastRadius").$type<{ score: number; affectedSystems: string[]; reversible: boolean }>(),
  status: mysqlEnum("status", ["PENDING_APPROVAL", "APPROVED", "REJECTED", "EXECUTED", "FAILED", "KILLED", "EXPIRED"]).default("PENDING_APPROVAL").notNull(),
  /** Principal who created this intent */
  principalId: varchar("principalId", { length: 64 }),
  reflection: text("reflection"),
  sourceConversationId: varchar("sourceConversationId", { length: 64 }),
  /** Intent TTL — Unix ms timestamp after which a PENDING_APPROVAL intent auto-expires. NULL = no expiry. */
  expiresAt: bigint("expiresAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Intent = typeof intents.$inferSelect;

/**
 * Approvals — human decisions bound to specific tool + args + expiry.
 */
export const approvals = mysqlTable("approvals", {
  id: int("id").autoincrement().primaryKey(),
  approvalId: varchar("approvalId", { length: 64 }).notNull().unique(),
  intentId: varchar("intentId", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  /** Principal who made this approval decision */
  principalId: varchar("principalId", { length: 64 }),
  decision: mysqlEnum("decision", ["APPROVED", "REJECTED"]).notNull(),
  signature: text("signature").notNull(),
  boundToolName: varchar("boundToolName", { length: 128 }).notNull(),
  boundArgsHash: varchar("boundArgsHash", { length: 128 }).notNull(),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
  maxExecutions: int("maxExecutions").notNull().default(1),
  executionCount: int("executionCount").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Approval = typeof approvals.$inferSelect;

/**
 * Executions — records of executed intents with preflight results and receipts.
 */
export const executions = mysqlTable("executions", {
  id: int("id").autoincrement().primaryKey(),
  executionId: varchar("executionId", { length: 64 }).notNull().unique(),
  intentId: varchar("intentId", { length: 64 }).notNull(),
  approvalId: varchar("approvalId", { length: 64 }),
  result: json("result").$type<Record<string, unknown>>(),
  receiptHash: varchar("receiptHash", { length: 128 }),
  receiptPayload: text("receiptPayload"),
  preflightResults: json("preflightResults").$type<Array<{ check: string; status: string; detail: string }>>(),
  executedAt: timestamp("executedAt").defaultNow().notNull(),
});

export type Execution = typeof executions.$inferSelect;

/**
 * Ledger — tamper-evident append-only log with SHA-256 hash chain.
 */
export const ledger = mysqlTable("ledger", {
  id: int("id").autoincrement().primaryKey(),
  entryId: varchar("entryId", { length: 64 }).notNull().unique(),
  entryType: mysqlEnum("entryType", ["ONBOARD", "INTENT", "APPROVAL", "EXECUTION", "KILL", "SYNC", "JORDAN_CHAT", "BONDI_CHAT", "LEARNING", "ARCHITECTURE_STATE", "RE_KEY", "REVOKE", "RE_KEY_AUTHORIZED", "RE_KEY_FORCED", "TELEGRAM_NOTIFY", "POLICY_UPDATE", "NOTIFICATION", "GENESIS", "AUTHORITY_TOKEN", "EMAIL_DELIVERY", "COHERENCE_CHECK", "FIREWALL_SCAN", "ACTION_COMPLETE", "DELEGATION_BLOCKED", "DELEGATION_APPROVED", "SUBSTRATE_BLOCK"]).notNull(),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  hash: varchar("hash", { length: 128 }).notNull(),
  prevHash: varchar("prevHash", { length: 128 }).notNull(),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
});

export type LedgerEntry = typeof ledger.$inferSelect;

/**
 * Encrypted key backups — AES-256-GCM encrypted private keys stored server-side.
 * The server never sees the plaintext key; encryption/decryption happens in the browser.
 */
export const keyBackups = mysqlTable("key_backups", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  encryptedKey: text("encryptedKey").notNull(),
  iv: varchar("iv", { length: 64 }).notNull(),
  salt: varchar("salt", { length: 64 }).notNull(),
  publicKeyFingerprint: varchar("publicKeyFingerprint", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KeyBackup = typeof keyBackups.$inferSelect;

// ═══════════════════════════════════════════════════════════════════
// BONDI AI ROUTER TABLES
// ═══════════════════════════════════════════════════════════════════

/**
 * Conversations — Bondi chat sessions between user and AI nodes.
 * Each conversation tracks which AI node was used, the mode, and message history.
 */
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: varchar("conversationId", { length: 64 }).notNull().unique(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 256 }),
  nodeId: varchar("nodeId", { length: 64 }).notNull().default("gemini"),
  mode: mysqlEnum("mode", ["REFLECT", "COMPUTE", "DRAFT", "VERIFY", "EXECUTE", "ROBOT"]).notNull().default("REFLECT"),
  messages: json("messages").$type<Array<{ role: string; content: string; timestamp: number; metadata?: Record<string, unknown> }>>().notNull(),
  intentIds: json("intentIds").$type<string[]>(),
  status: mysqlEnum("status", ["ACTIVE", "CLOSED", "ARCHIVED"]).default("ACTIVE").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;

/**
 * Learning events — every approval, rejection, execution, and feedback stored as learning context.
 * These feed back into the AI context on subsequent interactions to improve proposals.
 */
export const learningEvents = mysqlTable("learning_events", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("eventId", { length: 64 }).notNull().unique(),
  userId: int("userId").notNull(),
  eventType: mysqlEnum("eventType", ["APPROVAL", "REJECTION", "EXECUTION", "FEEDBACK", "CORRECTION"]).notNull(),
  intentId: varchar("intentId", { length: 64 }),
  conversationId: varchar("conversationId", { length: 64 }),
  context: json("context").$type<{
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    riskTier?: string;
    aiNode?: string;
    mode?: string;
    userMessage?: string;
    aiResponse?: string;
  }>(),
  /** Hash of action_type + target — used for learning aggregation */
  actionSignature: varchar("actionSignature", { length: 128 }),
  /** Current risk score at time of decision (0-100) */
  riskScore: int("riskScore").default(50),
  /** Decision made: APPROVED / REJECTED / BLOCKED */
  decision: mysqlEnum("decision", ["APPROVED", "REJECTED", "BLOCKED"]),
  feedback: text("feedback"),
  outcome: mysqlEnum("outcome", ["POSITIVE", "NEGATIVE", "NEUTRAL"]).default("NEUTRAL").notNull(),
  tags: json("tags").$type<string[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LearningEvent = typeof learningEvents.$inferSelect;

/**
 * Node configs — available AI models/providers with their capabilities and status.
 * The Bondi router uses this to select the right node for each request.
 */
export const nodeConfigs = mysqlTable("node_configs", {
  id: int("id").autoincrement().primaryKey(),
  nodeId: varchar("nodeId", { length: 64 }).notNull().unique(),
  displayName: varchar("displayName", { length: 128 }).notNull(),
  provider: mysqlEnum("provider", ["ANTHROPIC", "OPENAI", "GEMINI", "MANUS_FORGE"]).notNull(),
  modelName: varchar("modelName", { length: 128 }).notNull(),
  capabilities: json("capabilities").$type<{
    reasoning: boolean;
    coding: boolean;
    analysis: boolean;
    creative: boolean;
    multimodal: boolean;
  }>().notNull(),
  isActive: boolean("isActive").notNull().default(true),
  priority: int("priority").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NodeConfig = typeof nodeConfigs.$inferSelect;

// ═══════════════════════════════════════════════════════════════════
// SYSTEM SELF-KNOWLEDGE
// ═══════════════════════════════════════════════════════════════════

/**
 * System components — the system's own architecture registry.
 * Each row represents a component in the P1–P9 stack.
 * This allows the system (and any LLM reading the DB) to know
 * what exists, what's connected, and what the current status is.
 */
export const systemComponents = mysqlTable("system_components", {
  id: int("id").autoincrement().primaryKey(),
  componentId: varchar("componentId", { length: 16 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  role: text("role").notNull(),
  status: mysqlEnum("status", ["LIVE", "PLANNED", "LEGACY", "DISABLED"]).notNull(),
  implementation: text("implementation"),
  url: varchar("url", { length: 512 }),
  githubRepo: varchar("githubRepo", { length: 256 }),
  connections: json("connections").$type<string[]>().notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemComponent = typeof systemComponents.$inferSelect;

// ═══════════════════════════════════════════════════════════════════
// POLICY RULES
// ═══════════════════════════════════════════════════════════════════

/**
 * Custom policy rules — operator-defined governance rules that override or extend
 * the default tool registry risk tiers. These allow the operator to tune what
 * requires approval, what's auto-approved, and what's blocked entirely.
 */
export const policyRules = mysqlTable("policy_rules", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: varchar("ruleId", { length: 64 }).notNull().unique(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  // Which tool(s) this rule applies to — exact match or '*' for all
  toolPattern: varchar("toolPattern", { length: 128 }).notNull(),
  // Override the tool's default risk tier
  riskOverride: mysqlEnum("riskOverride", ["LOW", "MEDIUM", "HIGH"]),
  // Whether this tool requires explicit approval (overrides auto-approve for LOW)
  requiresApproval: boolean("requiresApproval").notNull().default(true),
  // Optional condition in JSON (e.g., {"field": "to", "operator": "contains", "value": "@external.com"})
  condition: json("condition").$type<{ field: string; operator: string; value: string } | null>(),
  // Whether this rule is active
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PolicyRule = typeof policyRules.$inferSelect;
export type InsertPolicyRule = typeof policyRules.$inferInsert;

// ═══════════════════════════════════════════════════════════════════
// IN-APP NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * In-app notifications — alerts shown in the ONE Command Center UI.
 * Created on key governance events (intent needs approval, execution complete, etc.)
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  notificationId: varchar("notificationId", { length: 64 }).notNull().unique(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["APPROVAL_NEEDED", "EXECUTION_COMPLETE", "EXECUTION_FAILED", "KILL_SWITCH", "POLICY_UPDATE", "SYSTEM"]).notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  body: text("body").notNull(),
  // Optional link to related entity
  intentId: varchar("intentId", { length: 64 }),
  executionId: varchar("executionId", { length: 64 }),
  // Read state
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ═══════════════════════════════════════════════════════════════════
// ROLE ENFORCEMENT — UNIFIED PRINCIPAL MODEL
// ═══════════════════════════════════════════════════════════════════

/**
 * System roles — the five governance roles from the RIO spec.
 * A principal can hold multiple roles (stored as JSON array).
 * - proposer:  Can submit intents
 * - approver:  Can approve/reject intents
 * - executor:  Can execute approved intents
 * - auditor:   Can read audit logs, ledger, and receipts
 * - meta:      Can change governance rules, manage principals, kill switch
 */
export const SYSTEM_ROLES = ["proposer", "approver", "executor", "auditor", "meta"] as const;
export type SystemRole = typeof SYSTEM_ROLES[number];

/**
 * Principals — the unified identity model for the RIO system.
 * Every actor (human, agent, service) is a principal with explicit roles.
 * Auth methods (OAuth, API key, Ed25519) are bound to a principal.
 * The system enforces that only principals with the correct role can
 * perform governed actions. Unknown or suspended principals are rejected.
 */
export const principals = mysqlTable("principals", {
  id: int("id").autoincrement().primaryKey(),
  principalId: varchar("principalId", { length: 64 }).notNull().unique(),
  /** The user ID from the users table (OAuth identity binding) */
  userId: int("userId").notNull().unique(),
  /** Human-readable display name */
  displayName: varchar("displayName", { length: 256 }),
  /** Principal type: human operator, AI agent, or system service */
  principalType: mysqlEnum("principalType", ["human", "agent", "service"]).notNull().default("human"),
  /** Governance roles — JSON array of SystemRole values */
  roles: json("roles").$type<SystemRole[]>().notNull(),
  /** Principal status — only ACTIVE principals can perform actions */
  status: mysqlEnum("status", ["active", "suspended", "revoked"]).notNull().default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Principal = typeof principals.$inferSelect;
export type InsertPrincipal = typeof principals.$inferInsert;

// ═══════════════════════════════════════════════════════════════════
// EMAIL FIREWALL CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Email firewall config — per-owner configurable policy layer.
 * Stores which rules are enabled/disabled, strictness per category,
 * internal domains, and preset selection.
 * One row per owner (userId). If no row exists, defaults apply.
 */
export const emailFirewallConfig = mysqlTable("email_firewall_config", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  /** Global strictness: strict / standard / permissive */
  strictness: mysqlEnum("strictness", ["strict", "standard", "permissive"]).notNull().default("standard"),
  /** Preset name (personal / team / enterprise) or "custom" */
  preset: varchar("preset", { length: 32 }).notNull().default("personal"),
  /** Rule overrides — JSON map of rule_id → { enabled: boolean } */
  ruleOverrides: json("ruleOverrides").$type<Record<string, { enabled: boolean }>>().notNull(),
  /** Category strictness overrides — JSON map of category → strictness level */
  categoryOverrides: json("categoryOverrides").$type<Record<string, string>>().notNull(),
  /** Internal domains — JSON array of domain strings */
  internalDomains: json("internalDomains").$type<string[]>().notNull(),
  /** Whether LLM-enhanced scanning is enabled */
  llmEnabled: boolean("llmEnabled").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailFirewallConfig = typeof emailFirewallConfig.$inferSelect;
export type InsertEmailFirewallConfig = typeof emailFirewallConfig.$inferInsert;


/**
 * Pending email/SMS approval requests — persisted so approve/decline links
 * work across server restarts and on the published site.
 */
export const pendingEmailApprovals = mysqlTable("pending_email_approvals", {
  id: int("id").autoincrement().primaryKey(),
  intentId: varchar("intentId", { length: 128 }).notNull().unique(),
  actionType: varchar("actionType", { length: 128 }).notNull(),
  actionSummary: text("actionSummary").notNull(),
  actionDetails: json("actionDetails").$type<Record<string, unknown>>(),
  proposerEmail: varchar("proposerEmail", { length: 320 }).notNull(),
  approverEmail: varchar("approverEmail", { length: 320 }).notNull(),
  tokenNonce: varchar("tokenNonce", { length: 128 }).notNull().unique(),
  status: mysqlEnum("status", ["PENDING", "APPROVED", "DECLINED", "EXPIRED"]).default("PENDING").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});

export type PendingEmailApproval = typeof pendingEmailApprovals.$inferSelect;
export type InsertPendingEmailApproval = typeof pendingEmailApprovals.$inferInsert;
