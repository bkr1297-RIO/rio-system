import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

const conn = await mysql.createConnection(url);

const statements = [
  `CREATE TABLE IF NOT EXISTS \`notifications\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`notificationId\` varchar(64) NOT NULL,
    \`userId\` int NOT NULL,
    \`type\` enum('APPROVAL_NEEDED','EXECUTION_COMPLETE','EXECUTION_FAILED','KILL_SWITCH','POLICY_UPDATE','SYSTEM') NOT NULL,
    \`title\` varchar(256) NOT NULL,
    \`body\` text NOT NULL,
    \`intentId\` varchar(64),
    \`executionId\` varchar(64),
    \`read\` boolean NOT NULL DEFAULT false,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT \`notifications_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`notifications_notificationId_unique\` UNIQUE(\`notificationId\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`policy_rules\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`ruleId\` varchar(64) NOT NULL,
    \`userId\` int NOT NULL,
    \`name\` varchar(256) NOT NULL,
    \`description\` text,
    \`toolPattern\` varchar(128) NOT NULL,
    \`riskOverride\` enum('LOW','MEDIUM','HIGH'),
    \`requiresApproval\` boolean NOT NULL DEFAULT true,
    \`condition\` json,
    \`enabled\` boolean NOT NULL DEFAULT true,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`policy_rules_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`policy_rules_ruleId_unique\` UNIQUE(\`ruleId\`)
  )`
];

for (const sql of statements) {
  console.log('Executing:', sql.substring(0, 60) + '...');
  await conn.execute(sql);
  console.log('✓ Done');
}

// Also add POLICY_UPDATE to ledger entryType enum if not already there
try {
  await conn.execute(`ALTER TABLE \`ledger\` MODIFY COLUMN \`entryType\` enum('ONBOARD','INTENT','APPROVAL','EXECUTION','KILL','SYNC','JORDAN_CHAT','BONDI_CHAT','LEARNING','ARCHITECTURE_STATE','RE_KEY','REVOKE','RE_KEY_AUTHORIZED','RE_KEY_FORCED','TELEGRAM_NOTIFY','POLICY_UPDATE','NOTIFICATION') NOT NULL`);
  console.log('✓ Ledger entryType enum updated');
} catch (e) {
  console.log('Ledger enum update skipped:', e.message);
}

await conn.end();
console.log('Migration complete!');
