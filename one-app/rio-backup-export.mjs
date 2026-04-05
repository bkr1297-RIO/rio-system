// RIO System Data Export Script
// Exports all system data from the database to JSON files for Google Drive backup

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR = path.join('/home/ubuntu', 'rio-export');

// Read DATABASE_URL from environment
function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set in environment');
  return url;
}

async function exportData() {
  const dbUrl = getDatabaseUrl();
  console.log('Connecting to database...');
  
  const connection = await mysql.createConnection(dbUrl);
  console.log('Connected.');

  // Create export directory
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const tables = [
    'proxy_users',
    'intents',
    'approvals',
    'executions',
    'ledger',
    'tool_registry',
    'learning_events',
    'conversations',
    'node_configs',
    'key_backups'
  ];

  const exportManifest = {
    exportedAt: new Date().toISOString(),
    timestamp,
    system: 'RIO Digital Proxy',
    version: '1.0',
    tables: {}
  };

  for (const table of tables) {
    try {
      const [rows] = await connection.execute(`SELECT * FROM ${table} ORDER BY 1`);
      const filename = `${table}.json`;
      const filepath = path.join(EXPORT_DIR, filename);
      
      fs.writeFileSync(filepath, JSON.stringify(rows, null, 2));
      exportManifest.tables[table] = {
        rowCount: rows.length,
        filename,
        exportedAt: new Date().toISOString()
      };
      console.log(`  ✓ ${table}: ${rows.length} rows`);
    } catch (err) {
      console.log(`  ✗ ${table}: ${err.message}`);
      exportManifest.tables[table] = {
        error: err.message,
        rowCount: 0
      };
    }
  }

  // Export ledger with hash chain verification
  try {
    const [ledgerRows] = await connection.execute('SELECT * FROM ledger ORDER BY entryId ASC');
    let chainValid = true;
    let prevHash = 'GENESIS';
    for (const entry of ledgerRows) {
      if (entry.prevHash !== prevHash) {
        chainValid = false;
        break;
      }
      prevHash = entry.hash;
    }
    exportManifest.hashChainVerification = {
      totalEntries: ledgerRows.length,
      chainValid,
      genesisHash: ledgerRows.length > 0 ? ledgerRows[0].hash : null,
      latestHash: ledgerRows.length > 0 ? ledgerRows[ledgerRows.length - 1].hash : null
    };
    console.log(`  ✓ Hash chain verification: ${chainValid ? 'VALID' : 'BROKEN'} (${ledgerRows.length} entries)`);
  } catch (err) {
    console.log(`  ✗ Hash chain verification: ${err.message}`);
  }

  // Write manifest
  const manifestPath = path.join(EXPORT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(exportManifest, null, 2));
  console.log(`\n✓ Manifest written to ${manifestPath}`);

  // Create a single ZIP-friendly combined export
  const combinedPath = path.join(EXPORT_DIR, `rio-system-backup-${timestamp}.json`);
  const combined = { manifest: exportManifest };
  for (const table of tables) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, `${table}.json`), 'utf-8'));
      combined[table] = data;
    } catch (e) {
      combined[table] = [];
    }
  }
  fs.writeFileSync(combinedPath, JSON.stringify(combined, null, 2));
  console.log(`✓ Combined backup written to ${combinedPath}`);

  await connection.end();
  console.log('\nExport complete!');
  return { timestamp, exportDir: EXPORT_DIR };
}

exportData().catch(console.error);
