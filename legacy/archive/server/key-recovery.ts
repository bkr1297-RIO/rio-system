/**
 * RIO Key Recovery — Server-Side Encrypted Key Backup & Restore
 *
 * This module provides:
 *   1. Store an encrypted private key backup on the server (per user, per signer)
 *   2. Retrieve the encrypted backup for recovery on a new device
 *   3. List available backups for a user
 *   4. Delete a backup
 *
 * SECURITY:
 *   - The server NEVER sees the plaintext private key.
 *   - The client encrypts with AES-GCM (passphrase-derived key) BEFORE sending.
 *   - The server stores only the ciphertext, salt, and IV.
 *   - Recovery requires the user's passphrase (known only to the user).
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { keyBackups } from "../drizzle/schema";

// ── Types ───────────────────────────────────────────────────────────────────

export interface KeyBackupInput {
  userId: number;
  signerId: string;
  publicKey: string;
  encryptedKey: string;
  salt: string;
  iv: string;
  version?: number;
}

export interface KeyBackupRecord {
  id: number;
  signerId: string;
  publicKey: string;
  encryptedKey: string;
  salt: string;
  iv: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

// ── Store Backup ────────────────────────────────────────────────────────────

/**
 * Store an encrypted key backup on the server.
 * If a backup already exists for this user+signer, it is replaced (upsert).
 */
export async function storeKeyBackup(input: KeyBackupInput): Promise<{
  success: boolean;
  signerId: string;
  message: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check for existing backup
  const existing = await db
    .select()
    .from(keyBackups)
    .where(
      and(
        eq(keyBackups.userId, input.userId),
        eq(keyBackups.signerId, input.signerId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing backup
    await db
      .update(keyBackups)
      .set({
        publicKey: input.publicKey,
        encryptedKey: input.encryptedKey,
        salt: input.salt,
        iv: input.iv,
        version: input.version ?? 1,
      })
      .where(
        and(
          eq(keyBackups.userId, input.userId),
          eq(keyBackups.signerId, input.signerId)
        )
      );

    return {
      success: true,
      signerId: input.signerId,
      message: "Key backup updated.",
    };
  }

  // Insert new backup
  await db.insert(keyBackups).values({
    userId: input.userId,
    signerId: input.signerId,
    publicKey: input.publicKey,
    encryptedKey: input.encryptedKey,
    salt: input.salt,
    iv: input.iv,
    version: input.version ?? 1,
  });

  return {
    success: true,
    signerId: input.signerId,
    message: "Key backup stored.",
  };
}

// ── Retrieve Backup ─────────────────────────────────────────────────────────

/**
 * Retrieve an encrypted key backup for a specific signer.
 * Returns null if no backup exists.
 */
export async function getKeyBackup(
  userId: number,
  signerId: string
): Promise<KeyBackupRecord | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select()
    .from(keyBackups)
    .where(
      and(
        eq(keyBackups.userId, userId),
        eq(keyBackups.signerId, signerId)
      )
    )
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id,
    signerId: row.signerId,
    publicKey: row.publicKey,
    encryptedKey: row.encryptedKey,
    salt: row.salt,
    iv: row.iv,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── List Backups ────────────────────────────────────────────────────────────

/**
 * List all encrypted key backups for a user.
 * Returns metadata only (no ciphertext) for listing purposes.
 */
export async function listKeyBackups(
  userId: number
): Promise<
  Array<{
    signerId: string;
    publicKey: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }>
> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select({
      signerId: keyBackups.signerId,
      publicKey: keyBackups.publicKey,
      version: keyBackups.version,
      createdAt: keyBackups.createdAt,
      updatedAt: keyBackups.updatedAt,
    })
    .from(keyBackups)
    .where(eq(keyBackups.userId, userId));

  return rows;
}

// ── Delete Backup ───────────────────────────────────────────────────────────

/**
 * Delete an encrypted key backup.
 */
export async function deleteKeyBackup(
  userId: number,
  signerId: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(keyBackups)
    .where(
      and(
        eq(keyBackups.userId, userId),
        eq(keyBackups.signerId, signerId)
      )
    );

  return true;
}
