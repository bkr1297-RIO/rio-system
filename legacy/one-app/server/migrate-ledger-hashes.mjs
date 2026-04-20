/**
 * LEDGER HASH CHAIN MIGRATION
 * ============================
 * Rebuilds all ledger entry hashes using canonical JSON serialization.
 * 
 * Root cause: MySQL JSON columns return keys in alphabetical order,
 * but the original hashes were computed with JavaScript insertion order.
 * This migration recomputes every hash using canonicalJsonStringify
 * so that verification always produces matching hashes.
 * 
 * The entire chain is rebuilt from GENESIS forward, so prevHash links
 * are also corrected.
 */

import { createHash } from "crypto";
import mysql from "mysql2/promise";

// Canonical JSON — sorts keys recursively
function canonicalJsonStringify(obj) {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(item => canonicalJsonStringify(item)).join(",") + "]";
  }
  const sorted = Object.keys(obj).sort();
  const pairs = sorted.map(key => {
    return JSON.stringify(key) + ":" + canonicalJsonStringify(obj[key]);
  });
  return "{" + pairs.join(",") + "}";
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const conn = await mysql.createConnection(dbUrl);
  console.log("Connected to database.");

  // Fetch all ledger entries in order
  const [rows] = await conn.execute("SELECT id, entryId, entryType, payload, hash, prevHash, timestamp FROM ledger ORDER BY id ASC");
  console.log(`Found ${rows.length} ledger entries.`);

  if (rows.length === 0) {
    console.log("Nothing to migrate.");
    await conn.end();
    return;
  }

  // Rebuild the entire chain from GENESIS
  let currentPrevHash = "GENESIS";
  let updated = 0;

  for (let i = 0; i < rows.length; i++) {
    const entry = rows[i];
    // Parse payload if it's a string (MySQL returns JSON as string)
    const payload = typeof entry.payload === "string" ? JSON.parse(entry.payload) : entry.payload;
    const timestamp = typeof entry.timestamp === "bigint" ? Number(entry.timestamp) : entry.timestamp;

    // Compute canonical hash
    const hashInput = canonicalJsonStringify({
      entryId: entry.entryId,
      entryType: entry.entryType,
      payload,
      prevHash: currentPrevHash,
      timestamp,
    });
    const newHash = sha256(hashInput);

    // Check if anything changed
    const prevHashChanged = entry.prevHash !== currentPrevHash;
    const hashChanged = entry.hash !== newHash;

    if (prevHashChanged || hashChanged) {
      await conn.execute(
        "UPDATE ledger SET hash = ?, prevHash = ? WHERE id = ?",
        [newHash, currentPrevHash, entry.id]
      );
      updated++;
      console.log(`  [${i}] ${entry.entryId}: hash ${hashChanged ? "UPDATED" : "ok"}, prevHash ${prevHashChanged ? "UPDATED" : "ok"}`);
    } else {
      console.log(`  [${i}] ${entry.entryId}: no change needed`);
    }

    currentPrevHash = newHash;
  }

  console.log(`\nMigration complete. ${updated}/${rows.length} entries updated.`);

  // Verify the chain
  const [verifyRows] = await conn.execute("SELECT entryId, entryType, payload, hash, prevHash, timestamp FROM ledger ORDER BY id ASC");
  let verifyPrev = "GENESIS";
  let errors = 0;
  for (let i = 0; i < verifyRows.length; i++) {
    const entry = verifyRows[i];
    const payload = typeof entry.payload === "string" ? JSON.parse(entry.payload) : entry.payload;
    const timestamp = typeof entry.timestamp === "bigint" ? Number(entry.timestamp) : entry.timestamp;

    if (entry.prevHash !== verifyPrev) {
      console.error(`  VERIFY FAIL [${i}] ${entry.entryId}: prevHash mismatch`);
      errors++;
    }
    const hashInput = canonicalJsonStringify({ entryId: entry.entryId, entryType: entry.entryType, payload, prevHash: entry.prevHash, timestamp });
    const computed = sha256(hashInput);
    if (computed !== entry.hash) {
      console.error(`  VERIFY FAIL [${i}] ${entry.entryId}: hash mismatch (computed=${computed.slice(0,16)}... stored=${entry.hash.slice(0,16)}...)`);
      errors++;
    }
    verifyPrev = entry.hash;
  }

  if (errors === 0) {
    console.log("\nVERIFICATION: CHAIN VALID ✓");
  } else {
    console.error(`\nVERIFICATION: ${errors} error(s) detected`);
  }

  await conn.end();
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
