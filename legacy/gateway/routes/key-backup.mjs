/**
 * RIO Gateway — Encrypted Key Backup Routes
 *
 * These endpoints allow devices to store and retrieve encrypted private key
 * backups through the gateway. The gateway NEVER sees the plaintext key.
 *
 * Endpoints:
 *   POST   /api/key-backup              — Store an encrypted key backup
 *   GET    /api/key-backup/:signer_id   — Retrieve an encrypted key backup
 *   GET    /api/key-backup              — List all backups for the authenticated user
 *   DELETE /api/key-backup/:signer_id   — Delete a backup
 *
 * Security:
 *   - All endpoints require JWT authentication
 *   - The server only stores ciphertext + salt + IV
 *   - Decryption requires the user's passphrase (never sent to server)
 */
import { Router } from "express";
import { requireAuth } from "../security/oauth.mjs";
import { appendEntry } from "../ledger/ledger-pg.mjs";

const router = Router();

// In-memory store for gateway mode (production would use PostgreSQL)
// This is a Map<userId, Map<signerId, backup>>
const backupStore = new Map();

/**
 * POST /api/key-backup
 * Store an encrypted key backup.
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { signer_id, public_key_hex, encrypted_key, salt, iv, version } = req.body;
    const userId = req.user.sub;

    if (!signer_id || !public_key_hex || !encrypted_key || !salt || !iv) {
      return res.status(400).json({
        error: "Missing required fields: signer_id, public_key_hex, encrypted_key, salt, iv",
      });
    }

    // Store the backup
    if (!backupStore.has(userId)) {
      backupStore.set(userId, new Map());
    }
    const userBackups = backupStore.get(userId);

    const backup = {
      signer_id,
      public_key_hex,
      encrypted_key,
      salt,
      iv,
      version: version || 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const isUpdate = userBackups.has(signer_id);
    userBackups.set(signer_id, backup);

    // Log to ledger
    appendEntry({
      intent_id: "00000000-0000-0000-0000-000000000000",
      action: isUpdate ? "key_backup_updated" : "key_backup_stored",
      agent_id: userId,
      status: "system",
      detail: `Encrypted key backup ${isUpdate ? "updated" : "stored"} for signer: ${signer_id}. Public key: ${public_key_hex.substring(0, 16)}...`,
    });

    console.log(
      `[RIO Key Backup] ${isUpdate ? "Updated" : "Stored"} encrypted backup for ${signer_id} by ${userId}`
    );

    res.status(isUpdate ? 200 : 201).json({
      signer_id,
      public_key_hex,
      status: isUpdate ? "updated" : "stored",
      _note: "Only the encrypted key is stored. The server cannot decrypt it.",
    });
  } catch (err) {
    console.error(`[RIO Key Backup] Store error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/key-backup/:signer_id
 * Retrieve an encrypted key backup for recovery.
 */
router.get("/:signer_id", requireAuth, (req, res) => {
  try {
    const userId = req.user.sub;
    const signerId = req.params.signer_id;

    const userBackups = backupStore.get(userId);
    if (!userBackups || !userBackups.has(signerId)) {
      return res.status(404).json({
        error: `No backup found for signer: ${signerId}`,
        hint: "Store a backup first using POST /api/key-backup",
      });
    }

    const backup = userBackups.get(signerId);

    // Log recovery attempt
    appendEntry({
      intent_id: "00000000-0000-0000-0000-000000000000",
      action: "key_backup_retrieved",
      agent_id: userId,
      status: "system",
      detail: `Encrypted key backup retrieved for signer: ${signerId}. Decryption happens client-side.`,
    });

    console.log(
      `[RIO Key Backup] Backup retrieved for ${signerId} by ${userId}`
    );

    res.json({
      signer_id: backup.signer_id,
      public_key_hex: backup.public_key_hex,
      encrypted_key: backup.encrypted_key,
      salt: backup.salt,
      iv: backup.iv,
      version: backup.version,
      created_at: backup.created_at,
      _note: "Decrypt this with your passphrase client-side. The server cannot decrypt it.",
    });
  } catch (err) {
    console.error(`[RIO Key Backup] Retrieve error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/key-backup
 * List all backups for the authenticated user (metadata only).
 */
router.get("/", requireAuth, (req, res) => {
  try {
    const userId = req.user.sub;
    const userBackups = backupStore.get(userId);

    if (!userBackups || userBackups.size === 0) {
      return res.json({ backups: [], count: 0 });
    }

    const backups = [];
    for (const [signerId, backup] of userBackups) {
      backups.push({
        signer_id: backup.signer_id,
        public_key_hex: backup.public_key_hex,
        version: backup.version,
        created_at: backup.created_at,
        updated_at: backup.updated_at,
      });
    }

    res.json({ backups, count: backups.length });
  } catch (err) {
    console.error(`[RIO Key Backup] List error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/key-backup/:signer_id
 * Delete an encrypted key backup.
 */
router.delete("/:signer_id", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const signerId = req.params.signer_id;

    const userBackups = backupStore.get(userId);
    if (!userBackups || !userBackups.has(signerId)) {
      return res.status(404).json({
        error: `No backup found for signer: ${signerId}`,
      });
    }

    userBackups.delete(signerId);

    // Log deletion
    appendEntry({
      intent_id: "00000000-0000-0000-0000-000000000000",
      action: "key_backup_deleted",
      agent_id: userId,
      status: "system",
      detail: `Encrypted key backup deleted for signer: ${signerId}`,
    });

    console.log(
      `[RIO Key Backup] Backup deleted for ${signerId} by ${userId}`
    );

    res.json({
      signer_id: signerId,
      status: "deleted",
    });
  } catch (err) {
    console.error(`[RIO Key Backup] Delete error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

export default router;
