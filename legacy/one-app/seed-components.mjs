import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const components = [
  {
    componentId: "P1",
    name: "ONE",
    role: "Human interface — the PWA where the user sees everything, approves actions, and controls the system",
    status: "LIVE",
    implementation: "React 19 + Tailwind 4 + tRPC + Express, deployed on Manus infrastructure",
    url: "https://riodigital-cqy2ymbu.manus.space",
    githubRepo: "bkr1297-RIO/rio-system",
    connections: ["P2", "P6", "P7", "P8", "P9"],
    metadata: {
      stack: "React 19, Tailwind 4, tRPC 11, Express 4",
      database: "TiDB (MySQL-compatible)",
      features: ["onboarding", "intent_creation", "approval", "execution", "receipt_viewer", "ledger_viewer", "kill_switch", "settings", "bondi_chat", "learning_events", "sms_twilio", "telegram_notifications", "key_backup"]
    }
  },
  {
    componentId: "P2",
    name: "BONDI",
    role: "AI concierge / planner — interprets natural language, proposes intents, routes through governance",
    status: "LIVE",
    implementation: "Multi-model router inside ONE Command Center. Routes to GPT-4, Claude Sonnet, or Gemini Flash based on node config.",
    url: null,
    githubRepo: null,
    connections: ["P1", "P6"],
    metadata: {
      models: [
        { nodeId: "gpt4", provider: "OPENAI", model: "gpt-4o" },
        { nodeId: "claude-sonnet", provider: "ANTHROPIC", model: "claude-sonnet-4-20250514" },
        { nodeId: "gemini-flash", provider: "MANUS_FORGE", model: "gemini-2.5-flash" }
      ],
      modes: ["REFLECT", "COMPUTE", "DRAFT", "VERIFY", "EXECUTE", "ROBOT"],
      conversations_count: 8
    }
  },
  {
    componentId: "P3",
    name: "MANTIS",
    role: "The database that sees and records everything. If MANTIS didn't record it, it didn't happen.",
    status: "LIVE",
    implementation: "TiDB database with 12+ tables. All system events recorded in ledger table with SHA-256 hash chain.",
    url: null,
    githubRepo: null,
    connections: ["P1", "P6", "P8"],
    metadata: {
      tables: ["users", "proxy_users", "tool_registry", "intents", "approvals", "executions", "ledger", "conversations", "learning_events", "node_configs", "key_backups", "system_components"],
      ledger_entries: 79,
      chain_integrity: "VALID"
    }
  },
  {
    componentId: "P4",
    name: "SAGE",
    role: "Intelligence / analysis layer — deep reasoning and risk assessment",
    status: "PLANNED",
    implementation: "Currently handled by BONDI's multi-model routing. Not a separate component yet.",
    url: null,
    githubRepo: null,
    connections: [],
    metadata: {
      notes: "Risk assessment (blast radius scoring) is built into the intent creation flow. A dedicated SAGE component would separate analysis from conversational AI."
    }
  },
  {
    componentId: "P5",
    name: "ORACLE",
    role: "Simulation / prediction — testing outcomes before committing to action",
    status: "PLANNED",
    implementation: "Not built. Would simulate action outcomes before they reach the RIO gate.",
    url: null,
    githubRepo: null,
    connections: [],
    metadata: {
      notes: "Future: run simulations of proposed actions to predict outcomes and surface risks before human approval."
    }
  },
  {
    componentId: "P6",
    name: "RIO",
    role: "Governance engine — policy enforcement, risk gating, approval requirement, execution authorization",
    status: "LIVE",
    implementation: "Server-side governance logic in ONE Command Center. Evaluates risk tier, enforces approval requirements, runs 8 preflight checks before execution.",
    url: null,
    githubRepo: null,
    connections: ["P1", "P2", "P3", "P7", "P8"],
    metadata: {
      risk_tiers: { LOW: "Automatic", MEDIUM: "Logged", HIGH: "Explicit approval required" },
      preflight_checks: ["proxy_active", "not_already_executed", "tool_registered", "risk_tier_check", "approval_exists", "approval_not_expired", "execution_limit", "args_hash_match"],
      registered_tools: 17
    }
  },
  {
    componentId: "P7",
    name: "FORGE",
    role: "Execution layer — performs the actual real-world action (sends SMS, sends email, etc.)",
    status: "LIVE",
    implementation: "Connector modules inside ONE Command Center server. Twilio SMS (live), Email (live). Other tools registered but connectors not all wired.",
    url: null,
    githubRepo: null,
    connections: ["P6", "P8"],
    metadata: {
      live_connectors: ["send_sms", "send_email", "read_email", "draft_email", "drive_read", "drive_search", "drive_write", "web_search"],
      not_wired: ["transfer_funds", "execute_code"]
    }
  },
  {
    componentId: "P8",
    name: "ATLAS",
    role: "Proof layer — generates cryptographic receipts and maintains the tamper-evident ledger",
    status: "LIVE",
    implementation: "SHA-256 receipt hashing, canonical JSON serialization, append-only ledger with hash chain, Ed25519 approval signatures from browser.",
    url: null,
    githubRepo: "bkr1297-RIO/rio-receipt-protocol",
    connections: ["P3", "P6", "P7"],
    metadata: {
      cryptography: {
        receipt_hash: "SHA-256 of canonical JSON",
        ledger_hash: "SHA-256 of canonicalJsonStringify({entryId, entryType, payload, prevHash, timestamp})",
        approval_signature: "Ed25519 (64 bytes)",
        key_backup: "AES-256-GCM"
      },
      open_source_spec: "https://github.com/bkr1297-RIO/rio-receipt-protocol",
      spec_version: "1.0",
      conformance_tests: { nodejs: 38, python: 29 }
    }
  },
  {
    componentId: "P9",
    name: "HUMAN",
    role: "Root authority — the only entity that can approve HIGH-risk actions. Holds the Ed25519 private key. Can kill the system at any time.",
    status: "LIVE",
    implementation: "Brian (user_id: 1). Ed25519 key pair generated in browser. Public key stored in proxy_users table.",
    url: null,
    githubRepo: null,
    connections: ["P1"],
    metadata: {
      public_key: "2f84c4cbf86d688953296463a3eb296adee45bb6004ea3d3e72055d9cdf0b30f",
      seed_version: "SEED-v1.0.0",
      onboarded_at: "2026-03-31T20:05:59Z"
    }
  }
];

for (const c of components) {
  await conn.execute(
    `INSERT INTO system_components (componentId, name, role, status, implementation, url, githubRepo, connections, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       role = VALUES(role),
       status = VALUES(status),
       implementation = VALUES(implementation),
       url = VALUES(url),
       githubRepo = VALUES(githubRepo),
       connections = VALUES(connections),
       metadata = VALUES(metadata)`,
    [
      c.componentId,
      c.name,
      c.role,
      c.status,
      c.implementation,
      c.url,
      c.githubRepo,
      JSON.stringify(c.connections),
      JSON.stringify(c.metadata)
    ]
  );
  console.log(`  ${c.componentId} ${c.name} → ${c.status}`);
}

// Verify
const [rows] = await conn.execute("SELECT componentId, name, status FROM system_components ORDER BY componentId");
console.log("\n=== SYSTEM COMPONENTS ===");
for (const r of rows) console.log(`  ${r.componentId}: ${r.name} [${r.status}]`);

await conn.end();
console.log("\nDone. System knows itself.");
