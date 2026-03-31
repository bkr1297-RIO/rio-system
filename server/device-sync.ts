/**
 * RIO Device Sync — Full Device State Restoration
 *
 * This module provides a single /sync endpoint that returns everything
 * a device needs to restore full signing and governance capability:
 *
 *   1. Identity state (signer ID, public key, whether a backup exists)
 *   2. Encrypted key backup (if stored on server)
 *   3. Ledger chain (full or incremental from a given hash)
 *   4. Ledger health (chain validity, entry count, tip hash)
 *
 * The client calls this once on login or when it detects NO_LOCAL_KEYS.
 * After receiving the response, the client:
 *   - Prompts for the passphrase to decrypt the key backup
 *   - Stores the decrypted key in IndexedDB
 *   - Verifies and stores the ledger state locally
 */

import { eq, desc, gt } from "drizzle-orm";
import { getDb } from "./db";
import { ledger, keyBackups } from "../drizzle/schema";
import { verifyLedgerIntegrity } from "./ledger-guard";

// ── Types ───────────────────────────────────────────────────────────────────

export interface DeviceSyncRequest {
  userId: number;
  signerId?: string;
  /** If provided, only return ledger entries after this hash (incremental sync) */
  lastKnownHash?: string;
  /** Maximum number of ledger entries to return */
  ledgerLimit?: number;
}

export interface DeviceSyncResponse {
  /** Identity information */
  identity: {
    signerId: string | null;
    publicKey: string | null;
    hasBackup: boolean;
  };
  /** Encrypted key backup (null if none exists) */
  keyBackup: {
    encryptedKey: string;
    salt: string;
    iv: string;
    publicKey: string;
    version: number;
  } | null;
  /** Ledger state */
  ledger: {
    entries: Array<{
      blockId: string;
      intentId: string;
      action: string;
      decision: string;
      receiptHash: string | null;
      previousHash: string | null;
      currentHash: string;
      ledgerSignature: string | null;
      protocolVersion: string | null;
      timestamp: Date;
      recordedBy: string;
    }>;
    entryCount: number;
    tipHash: string | null;
    chainValid: boolean;
    chainErrors: string[];
    isIncremental: boolean;
  };
  /** Sync metadata */
  syncedAt: string;
  syncVersion: number;
}

// ── Sync Implementation ─────────────────────────────────────────────────────

/**
 * Perform a full device sync.
 * Returns all state needed to restore a device to full capability.
 */
export async function performDeviceSync(
  request: DeviceSyncRequest
): Promise<DeviceSyncResponse> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { userId, signerId, lastKnownHash, ledgerLimit = 500 } = request;

  // 1. Fetch identity / key backup
  let identitySignerId: string | null = null;
  let identityPublicKey: string | null = null;
  let keyBackupData: DeviceSyncResponse["keyBackup"] = null;
  let hasBackup = false;

  if (signerId) {
    // Look for a specific signer's backup
    const backupRows = await db
      .select()
      .from(keyBackups)
      .where(
        eq(keyBackups.userId, userId)
      );

    const backup = backupRows.find((b) => b.signerId === signerId);
    if (backup) {
      hasBackup = true;
      identitySignerId = backup.signerId;
      identityPublicKey = backup.publicKey;
      keyBackupData = {
        encryptedKey: backup.encryptedKey,
        salt: backup.salt,
        iv: backup.iv,
        publicKey: backup.publicKey,
        version: backup.version,
      };
    }
  } else {
    // No specific signer — find any backup for this user
    const backupRows = await db
      .select()
      .from(keyBackups)
      .where(eq(keyBackups.userId, userId))
      .limit(1);

    if (backupRows.length > 0) {
      const backup = backupRows[0];
      hasBackup = true;
      identitySignerId = backup.signerId;
      identityPublicKey = backup.publicKey;
      keyBackupData = {
        encryptedKey: backup.encryptedKey,
        salt: backup.salt,
        iv: backup.iv,
        publicKey: backup.publicKey,
        version: backup.version,
      };
    }
  }

  // 2. Fetch ledger entries
  let isIncremental = false;
  let ledgerEntries;

  if (lastKnownHash) {
    // Incremental sync: find the entry with lastKnownHash, then get everything after it
    const knownEntry = await db
      .select()
      .from(ledger)
      .where(eq(ledger.currentHash, lastKnownHash))
      .limit(1);

    if (knownEntry.length > 0) {
      isIncremental = true;
      ledgerEntries = await db
        .select()
        .from(ledger)
        .where(gt(ledger.id, knownEntry[0].id))
        .orderBy(ledger.id)
        .limit(ledgerLimit);
    } else {
      // Hash not found — do a full sync
      ledgerEntries = await db
        .select()
        .from(ledger)
        .orderBy(ledger.id)
        .limit(ledgerLimit);
    }
  } else {
    // Full sync
    ledgerEntries = await db
      .select()
      .from(ledger)
      .orderBy(ledger.id)
      .limit(ledgerLimit);
  }

  // 3. Get ledger health
  let chainValid = true;
  let chainErrors: string[] = [];
  try {
    const integrity = await verifyLedgerIntegrity();
    chainValid = integrity.valid;
    chainErrors = integrity.errors;
  } catch {
    chainValid = false;
    chainErrors = ["Failed to verify ledger integrity"];
  }

  // 4. Compute tip hash and entry count
  const totalCountResult = await db
    .select()
    .from(ledger)
    .orderBy(desc(ledger.id))
    .limit(1);

  const entryCount = totalCountResult.length > 0 ? totalCountResult[0].id : 0;
  const tipHash =
    totalCountResult.length > 0 ? totalCountResult[0].currentHash : null;

  return {
    identity: {
      signerId: identitySignerId,
      publicKey: identityPublicKey,
      hasBackup,
    },
    keyBackup: keyBackupData,
    ledger: {
      entries: ledgerEntries.map((e) => ({
        blockId: e.blockId,
        intentId: e.intentId,
        action: e.action,
        decision: e.decision,
        receiptHash: e.receiptHash ?? null,
        previousHash: e.previousHash ?? null,
        currentHash: e.currentHash,
        ledgerSignature: e.ledgerSignature ?? null,
        protocolVersion: e.protocolVersion ?? null,
        timestamp: e.timestamp,
        recordedBy: e.recordedBy,
      })),
      entryCount,
      tipHash,
      chainValid,
      chainErrors,
      isIncremental,
    },
    syncedAt: new Date().toISOString(),
    syncVersion: 1,
  };
}

/**
 * Get a lightweight ledger health summary (no entries, just status).
 * Used for quick drift detection on the client.
 */
export async function getLedgerHealthSummary(): Promise<{
  entryCount: number;
  tipHash: string | null;
  chainValid: boolean;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const tipRow = await db
    .select()
    .from(ledger)
    .orderBy(desc(ledger.id))
    .limit(1);

  let chainValid = true;
  try {
    const integrity = await verifyLedgerIntegrity();
    chainValid = integrity.valid;
  } catch {
    chainValid = false;
  }

  return {
    entryCount: tipRow.length > 0 ? tipRow[0].id : 0,
    tipHash: tipRow.length > 0 ? tipRow[0].currentHash : null,
    chainValid,
  };
}
