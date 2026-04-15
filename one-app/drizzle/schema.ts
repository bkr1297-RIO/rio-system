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
  entryType: mysqlEnum("entryType", ["ONBOARD", "INTENT", "APPROVAL", "EXECUTION", "KILL", "SYNC", "JORDAN_CHAT", "BONDI_CHAT", "LEARNING", "ARCHITECTURE_STATE", "RE_KEY", "REVOKE", "RE_KEY_AUTHORIZED", "RE_KEY_FORCED", "TELEGRAM_NOTIFY", "POLICY_UPDATE", "NOTIFICATION", "GENESIS", "AUTHORITY_TOKEN", "EMAIL_DELIVERY", "COHERENCE_CHECK", "FIREWALL_SCAN", "ACTION_COMPLETE", "DELEGATION_BLOCKED", "DELEGATION_APPROVED", "SUBSTRATE_BLOCK", "NOTION_DENIAL", "NOTION_EXECUTION", "NOTION_ROW_CREATED", "PROPOSAL_CREATED", "PROPOSAL_APPROVED", "PROPOSAL_REJECTED", "PROPOSAL_EXECUTED", "TRUST_POLICY_CREATED", "TRUST_POLICY_UPDATED", "TRUST_POLICY_DELETED", "DELEGATED_AUTO_APPROVE", "SENTINEL_EVENT", "BUDGET_POOL_CREATED", "BUDGET_POOL_MODIFIED", "FINANCIAL_TRANSFER", "HANDOFF_CREATED", "HANDOFF_COMPLETED", "HANDOFF_REJECTED", "PROPOSAL_FAILED", "TRUST_POLICY_CHANGE"]).notNull(),
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

// ═══════════════════════════════════════════════════════════════════
// PHASE 2A — PROPOSAL PACKETS
// ═══════════════════════════════════════════════════════════════════

/**
 * Proposal packets — structured proposals generated from research,
 * written to Notion Decision Log, awaiting human approval.
 * Each proposal is ONE row in the Decision Log.
 * No auto-queueing: proposals surface in Notion for human decision.
 */
export const proposalPackets = mysqlTable("proposal_packets", {
  id: int("id").autoincrement().primaryKey(),
  proposalId: varchar("proposalId", { length: 64 }).notNull().unique(),
  /** Proposal type: outreach, task, analysis, financial, follow_up */
  type: mysqlEnum("type", ["outreach", "task", "analysis", "financial", "follow_up"]).notNull(),
  /** Category for ranking and trust policy matching */
  category: varchar("category", { length: 128 }).notNull(),
  /** Risk tier — matches naming convention (risk_tier, not risk_level) */
  riskTier: mysqlEnum("riskTier", ["LOW", "MEDIUM", "HIGH"]).notNull(),
  /** Risk factors — array of strings explaining why this risk tier */
  riskFactors: json("riskFactors").$type<string[]>().notNull(),
  /** Baseline pattern — recent approval/velocity/edit stats for contrast detection */
  baselinePattern: json("baselinePattern").$type<{
    approval_rate_14d: number;
    avg_velocity_seconds: number;
    edit_rate: number;
  }>(),
  /** The proposal content — title, body, action_needed (or subject/body/draft_email for outreach) */
  proposal: json("proposal").$type<{
    title?: string;
    subject?: string;
    body: string;
    action_needed?: string;
    draft_email?: string;
  }>().notNull(),
  /** Why this matters — human-readable explanation */
  whyItMatters: text("whyItMatters").notNull(),
  /** AI reasoning for this proposal */
  reasoning: text("reasoning").notNull(),
  /** Current status in the governance pipeline */
  status: mysqlEnum("status", ["proposed", "approved", "rejected", "executed", "failed", "expired"]).notNull().default("proposed"),
  /** Notion page ID — links to the Decision Log row */
  notionPageId: varchar("notionPageId", { length: 64 }),
  /** Receipt ID — set after execution, links to the Gateway receipt */
  receiptId: varchar("receiptId", { length: 64 }),
  /** Intent ID — set when proposal is approved and converted to an intent */
  intentId: varchar("intentId", { length: 64 }),
  /** Aftermath — three-layer outcome tracking (auto, inferred, human) */
  aftermath: json("aftermath").$type<{
    automatic?: {
      type: "automatic";
      signal: string;
      latency_days: number | null;
      timestamp: string;
    };
    inferred?: {
      type: "inferred";
      signal: string;
      confidence: number;
      reasoning: string;
    };
    human?: {
      type: "human";
      result: "worked" | "did_not_work" | "no_response" | "unknown";
      note: string | null;
      timestamp: string;
    };
  }>(),
  /** Whether this proposal is visible in the attention surface (max 5) */
  visible: boolean("visible").notNull().default(false),
  /** Rank position (1=highest priority). Null if not ranked yet. */
  rank: int("rank"),
  /** Who created this proposal (principal ID or agent name) */
  createdBy: varchar("createdBy", { length: 64 }).notNull().default("system"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProposalPacket = typeof proposalPackets.$inferSelect;
export type InsertProposalPacket = typeof proposalPackets.$inferInsert;

// ═══════════════════════════════════════════════════════════════════
// PHASE 2E — TRUST POLICIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Trust policies — define delegation rules per category + risk_tier.
 * Trust levels:
 *   0 = Propose Only (human must approve all)
 *   1 = Safe Internal Actions (auto-approve LOW-risk internal, no external impact)
 *   2 = Bounded Autonomy (auto-approve LOW-risk external within policy limits)
 *
 * Creating, updating, or deleting a trust policy is itself a governed action
 * that requires approval and generates a receipt.
 */
export const trustPolicies = mysqlTable("trust_policies", {
  id: int("id").autoincrement().primaryKey(),
  policyId: varchar("policyId", { length: 64 }).notNull().unique(),
  /** Category this policy applies to (e.g., "outreach", "internal_task", "financial") */
  category: varchar("category", { length: 128 }).notNull(),
  /** Risk tier this policy applies to */
  riskTier: mysqlEnum("riskTier", ["LOW", "MEDIUM", "HIGH"]).notNull(),
  /** Trust level: 0 = propose only, 1 = safe internal, 2 = bounded autonomy */
  trustLevel: int("trustLevel").notNull().default(0),
  /** Additional conditions for this policy (optional constraints) */
  conditions: json("conditions").$type<{
    max_amount?: number;
    allowed_targets?: string[];
    time_window?: string;
    max_daily_count?: number;
  }>(),
  /** Whether this policy is currently active */
  active: boolean("active").notNull().default(true),
  /** Receipt ID from the governed action that created/modified this policy */
  governanceReceiptId: varchar("governanceReceiptId", { length: 64 }),
  /** User who owns this policy */
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TrustPolicy = typeof trustPolicies.$inferSelect;
export type InsertTrustPolicy = typeof trustPolicies.$inferInsert;

// ═══════════════════════════════════════════════════════════════════
// SENTINEL EVENTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Sentinel events — observational layer that detects drift, anomalies,
 * invariant violations, and contrasts. Sentinel NEVER executes or approves.
 */
export const sentinelEvents = mysqlTable("sentinel_events", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("eventId", { length: 64 }).notNull().unique(),
  /** Event type classification */
  type: mysqlEnum("type", ["contrast", "invariant_violation", "trace_break", "anomaly", "system_correction"]).notNull(),
  /** Severity level */
  severity: mysqlEnum("severity", ["INFO", "WARN", "CRITICAL"]).notNull(),
  /** What this event is about (e.g., 'approval_rate_variance') */
  subject: varchar("subject", { length: 256 }).notNull(),
  /** Baseline value (what was expected) */
  baseline: json("baseline").$type<unknown>(),
  /** Observed value (what actually happened) */
  observed: json("observed").$type<unknown>(),
  /** Delta between baseline and observed */
  delta: json("delta").$type<unknown>(),
  /** Additional context */
  context: json("context").$type<Record<string, unknown>>(),
  /** Related proposal ID (if applicable) */
  proposalId: varchar("proposalId", { length: 64 }),
  /** Whether this event has been acknowledged by the human */
  acknowledged: boolean("acknowledged").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SentinelEvent = typeof sentinelEvents.$inferSelect;
export type InsertSentinelEvent = typeof sentinelEvents.$inferInsert;

// ═══════════════════════════════════════════════════════════════════
// PHASE 2F — MONEY LAYER (Financial Governance)
// ═══════════════════════════════════════════════════════════════════

/**
 * Budget pools — governed financial artifacts.
 * Creating, modifying limits, or adding funds requires approval + receipt.
 * The budget pool is NOT configuration — it is a governed decision.
 */
export const budgetPools = mysqlTable("budget_pools", {
  id: int("id").autoincrement().primaryKey(),
  poolId: varchar("poolId", { length: 64 }).notNull().unique(),
  /** Human-readable name for this budget pool */
  name: varchar("name", { length: 256 }).notNull(),
  /** Current balance in cents (integer to avoid floating-point issues) */
  balanceCents: int("balanceCents").notNull().default(0),
  /** Spending limit in cents — changing this is a governed action */
  limitCents: int("limitCents").notNull().default(0),
  /** Calculated spending rate in cents per day (rolling 30-day average) */
  spendingRateCentsPerDay: int("spendingRateCentsPerDay").notNull().default(0),
  /** Pool status */
  status: mysqlEnum("status", ["active", "frozen", "depleted"]).notNull().default("active"),
  /** Policy version hash — tracks which governance policy created/modified this pool */
  policyVersion: varchar("policyVersion", { length: 128 }),
  /** Receipt ID from the governed action that created/modified this pool */
  governanceReceiptId: varchar("governanceReceiptId", { length: 64 }),
  /** User who owns this budget pool */
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BudgetPool = typeof budgetPools.$inferSelect;
export type InsertBudgetPool = typeof budgetPools.$inferInsert;

/**
 * Financial transactions — every money movement is recorded.
 * Each transaction links to a budget pool, an optional proposal, and a receipt.
 */
export const financialTransactions = mysqlTable("financial_transactions", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: varchar("transactionId", { length: 64 }).notNull().unique(),
  /** Which budget pool this transaction affects */
  budgetPoolId: varchar("budgetPoolId", { length: 64 }).notNull(),
  /** Optional link to the proposal that triggered this transaction */
  proposalId: varchar("proposalId", { length: 64 }),
  /** Transaction type */
  type: mysqlEnum("type", ["deposit", "withdrawal", "transfer", "adjustment", "limit_change"]).notNull(),
  /** Amount in cents (positive = inflow, negative = outflow) */
  amountCents: int("amountCents").notNull(),
  /** Human-readable description */
  description: text("description").notNull(),
  /** Receipt ID from the governed execution */
  receiptId: varchar("receiptId", { length: 64 }),
  /** Who initiated this transaction */
  initiatedBy: varchar("initiatedBy", { length: 64 }).notNull().default("system"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FinancialTransaction = typeof financialTransactions.$inferSelect;
export type InsertFinancialTransaction = typeof financialTransactions.$inferInsert;

// ═══════════════════════════════════════════════════════════════════
// PHASE 2G — MULTI-AGENT COLLABORATION (Handoff Packets)
// ═══════════════════════════════════════════════════════════════════

/**
 * Handoff packets — explicit work transfer between agents.
 * No agent self-approves. All execution routes through Gateway.
 * Handoffs are recorded in the ledger for audit trail.
 */
export const handoffPackets = mysqlTable("handoff_packets", {
  id: int("id").autoincrement().primaryKey(),
  handoffId: varchar("handoffId", { length: 64 }).notNull().unique(),
  /** Agent sending the work */
  fromAgent: varchar("fromAgent", { length: 128 }).notNull(),
  /** Agent receiving the work */
  toAgent: varchar("toAgent", { length: 128 }).notNull(),
  /** Type of work being handed off */
  workType: mysqlEnum("workType", ["proposal", "financial", "analysis", "review", "execution", "research"]).notNull(),
  /** The nested packet (proposal, financial, etc.) */
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  /** Instructions for the receiving agent */
  instructions: text("instructions").notNull(),
  /** Optional deadline for completion */
  deadline: timestamp("deadline"),
  /** Whether this handoff requires human approval before the receiving agent can act */
  approvalRequired: boolean("approvalRequired").notNull().default(true),
  /** Current status of the handoff */
  status: mysqlEnum("status", ["pending", "accepted", "in_progress", "completed", "rejected", "expired"]).notNull().default("pending"),
  /** Result payload from the receiving agent */
  result: json("result").$type<Record<string, unknown>>(),
  /** Receipt ID if execution was involved */
  receiptId: varchar("receiptId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HandoffPacket = typeof handoffPackets.$inferSelect;
export type InsertHandoffPacket = typeof handoffPackets.$inferInsert;

// ═══════════════════════════════════════════════════════════════════
// BUILDER CONTRACT v1 — MAILBOX INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════════

/**
 * Mailbox types — the six canonical mailbox categories.
 * Each mailbox is a logical partition of the mailbox_entries table.
 */
export const MAILBOX_TYPES = ["proposal", "financial", "policy", "handoff", "sentinel", "decision"] as const;
export type MailboxType = typeof MAILBOX_TYPES[number];

/**
 * Mailbox status flow: pending → processed → routed → executed → archived
 * Status changes create NEW entries (append-only). Existing entries are NEVER mutated.
 */
export const MAILBOX_STATUSES = ["pending", "processed", "routed", "executed", "archived"] as const;
export type MailboxStatus = typeof MAILBOX_STATUSES[number];

/**
 * Mailbox entries — the universal event-sourced log.
 *
 * INVARIANTS (from Builder Contract v1):
 * 1. Append-only: no row is ever UPDATE'd or DELETE'd
 * 2. Status transitions create NEW rows referencing the same trace_id
 * 3. Every entry carries a trace_id linking the full decision chain
 * 4. The entire system state can be reconstructed by replaying entries in order
 * 5. Notion is a VIEW of mailbox state, not the source of truth
 *
 * Packet types written to each mailbox:
 * - proposal:  proposal_packet, follow_up_proposal
 * - financial: financial_proposal, budget_transfer
 * - policy:    trust_policy_change, policy_update
 * - handoff:   handoff_packet, handoff_result
 * - sentinel:  sentinel_event, aftermath_event
 * - decision:  approval_packet, kernel_decision_object, gateway_enforcement_object
 */
export const mailboxEntries = mysqlTable("mailbox_entries", {
  id: int("id").autoincrement().primaryKey(),
  /** Unique packet identifier (e.g., "pkt_abc123") */
  packetId: varchar("packet_id", { length: 128 }).notNull().unique(),
  /** Which mailbox this entry belongs to */
  mailboxType: mysqlEnum("mailbox_type", ["proposal", "financial", "policy", "handoff", "sentinel", "decision"]).notNull(),
  /** Semantic type of the packet (e.g., "proposal_packet", "kernel_decision_object", "gateway_enforcement_object") */
  packetType: varchar("packet_type", { length: 128 }).notNull(),
  /** Agent or system that created this entry */
  sourceAgent: varchar("source_agent", { length: 128 }).notNull(),
  /** Target agent (null if broadcast or system-level) */
  targetAgent: varchar("target_agent", { length: 128 }),
  /** Current status of this entry */
  status: mysqlEnum("status", ["pending", "processed", "routed", "executed", "archived"]).notNull().default("pending"),
  /** The full packet payload — schema varies by packet_type */
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  /** Trace ID linking all entries in the same decision chain */
  traceId: varchar("trace_id", { length: 128 }).notNull(),
  /** Optional reference to a parent packet (for status transitions) */
  parentPacketId: varchar("parent_packet_id", { length: 128 }),
  /** Immutable creation timestamp */
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /** Set when status transitions happen (via new entry, not mutation) */
  processedAt: timestamp("processed_at"),
});

export type MailboxEntry = typeof mailboxEntries.$inferSelect;
export type InsertMailboxEntry = typeof mailboxEntries.$inferInsert;

// ═══════════════════════════════════════════════════════════════════
// BUILDER CONTRACT v1 — KERNEL DECISION OBJECTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Kernel proposed decisions — the three possible outcomes.
 * AUTO_APPROVE: policy + trust allow automatic execution
 * REQUIRE_HUMAN: human must sign before Gateway executes
 * DENY: policy explicitly blocks this action
 */
export const KERNEL_DECISIONS = ["AUTO_APPROVE", "REQUIRE_HUMAN", "DENY"] as const;
export type KernelDecision = typeof KERNEL_DECISIONS[number];

/**
 * Gateway enforced decisions — what actually happened.
 * EXECUTED: action was performed
 * BLOCKED: Gateway refused (invalid signature, stale timestamp, etc.)
 * REQUIRES_SIGNATURE: waiting for human cryptographic approval
 */
export const GATEWAY_ENFORCED_DECISIONS = ["EXECUTED", "BLOCKED", "REQUIRES_SIGNATURE"] as const;
export type GatewayEnforcedDecision = typeof GATEWAY_ENFORCED_DECISIONS[number];

/**
 * Type definitions for kernel and gateway objects stored in mailbox payloads.
 */
export interface KernelDecisionPayload {
  decision_id: string;
  packet_id: string;
  proposed_decision: KernelDecision;
  reasoning: {
    policy_match: boolean;
    policy_name: string | null;
    trust_level_ok: boolean;
    trust_level_applied: number;
    constraints_ok: boolean;
    anomaly_flag: boolean;
    anomaly_type?: string;
  };
  baseline_pattern: {
    approval_rate_14d: number;
    recent_velocity_seconds: number;
    edit_rate: number;
  } | null;
  observed_state: {
    approval_rate_delta: number;
    velocity_delta_seconds: number;
    edit_rate_delta: number;
  } | null;
  confidence: number;
  timestamp: string;
  trace_id: string;
}

export interface GatewayEnforcementPayload {
  decision_id: string;
  proposed_decision: KernelDecision;
  enforced_decision: GatewayEnforcedDecision;
  enforcement_reason: string;
  execution_id: string | null;
  receipt_id: string | null;
  signature_valid: boolean;
  signature_ed25519: string | null;
  timestamp: string;
  trace_id: string;
}

/**
 * Sentinel threshold model — governed thresholds for anomaly detection.
 * These thresholds are NOT configurable without human approval.
 */
export const SENTINEL_THRESHOLDS = {
  approval_rate_variance: { INFO: 0.05, WARN: 0.10, CRITICAL: 0.20 },
  velocity_variance:      { INFO: 0.10, WARN: 0.25, CRITICAL: 0.50 },
  edit_rate_variance:     { INFO: 0.10, WARN: 0.20, CRITICAL: 0.40 },
  pattern_shift:          { INFO: 0.50, WARN: 0.70, CRITICAL: 0.90 },
} as const;
