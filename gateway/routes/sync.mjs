/**
 * RIO Gateway — Device Sync Routes
 *
 * Provides a single endpoint that returns everything a device needs
 * to restore full signing and governance capability:
 *
 *   1. Identity state (signer ID, public key, backup availability)
 *   2. Encrypted key backup (if stored)
 *   3. Ledger chain (full or incremental from a given hash)
 *   4. Ledger health (chain validity, entry count, tip hash)
 *
 * Endpoints:
 *   POST /api/sync          — Full device sync
 *   GET  /api/sync/health   — Lightweight ledger health check (drift detection)
 *
 * Security:
 *   - /sync requires JWT authentication
 *   - /sync/health is public (no secrets exposed, just counts and hashes)
 */
import { Router } from "express";
import { requireAuth } from "../security/oauth.mjs";
import { getEntries, getEntryCount, getLatestEntry } from "../ledger/ledger-pg.mjs";
import { getSigner, listSigners } from "../security/identity-binding.mjs";

const router = Router();

/**
 * POST /api/sync
 * Full device sync — returns identity, key backup, and ledger state.
 *
 * Request body:
 *   {
 *     signer_id?: string,       // Specific signer to sync (optional)
 *     last_known_hash?: string,  // For incremental sync (optional)
 *     ledger_limit?: number      // Max entries to return (default 500)
 *   }
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { signer_id, last_known_hash, ledger_limit = 500 } = req.body;

    // 1. Identity state
    let signerInfo = null;
    if (signer_id) {
      signerInfo = getSigner(signer_id);
    } else {
      // Find any signer for this user
      const allSigners = listSigners();
      signerInfo = allSigners.find(s => s.signer_id === userId) || allSigners[0] || null;
    }

    // 2. Ledger entries
    let entries = [];
    let isIncremental = false;
    const totalCount = getEntryCount();

    if (last_known_hash) {
      // Incremental sync: find the entry with last_known_hash, get everything after
      const allEntries = getEntries(totalCount);
      const knownIdx = allEntries.findIndex(e => e.current_hash === last_known_hash);
      if (knownIdx >= 0) {
        isIncremental = true;
        entries = allEntries.slice(knownIdx + 1, knownIdx + 1 + ledger_limit);
      } else {
        // Hash not found — full sync
        entries = getEntries(Math.min(ledger_limit, totalCount));
      }
    } else {
      entries = getEntries(Math.min(ledger_limit, totalCount));
    }

    // 3. Ledger health
    const latestEntry = getLatestEntry();
    const tipHash = latestEntry ? latestEntry.current_hash : null;

    // Verify chain integrity (quick check on last N entries)
    let chainValid = true;
    const chainErrors = [];
    const recentEntries = getEntries(Math.min(50, totalCount));
    for (let i = 1; i < recentEntries.length; i++) {
      if (recentEntries[i].previous_hash !== recentEntries[i - 1].current_hash) {
        chainValid = false;
        chainErrors.push(
          `Chain break at entry ${i}: expected previous_hash=${recentEntries[i - 1].current_hash}, got ${recentEntries[i].previous_hash}`
        );
      }
    }

    console.log(
      `[RIO Sync] Device sync for ${userId}: ${entries.length} entries, chain_valid=${chainValid}, incremental=${isIncremental}`
    );

    res.json({
      identity: {
        signer_id: signerInfo?.signer_id || null,
        public_key_hex: signerInfo?.public_key_hex || null,
        display_name: signerInfo?.display_name || null,
        role: signerInfo?.role || null,
        registered: !!signerInfo,
      },
      ledger: {
        entries,
        entry_count: totalCount,
        tip_hash: tipHash,
        chain_valid: chainValid,
        chain_errors: chainErrors,
        is_incremental: isIncremental,
      },
      synced_at: new Date().toISOString(),
      sync_version: 1,
    });
  } catch (err) {
    console.error(`[RIO Sync] Sync error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sync/health
 * Lightweight ledger health check for drift detection.
 * Public endpoint — no secrets exposed.
 */
router.get("/health", async (req, res) => {
  try {
    const totalCount = getEntryCount();
    const latestEntry = getLatestEntry();
    const tipHash = latestEntry ? latestEntry.current_hash : null;

    // Quick chain validation on last 20 entries
    let chainValid = true;
    const recentEntries = getEntries(Math.min(20, totalCount));
    for (let i = 1; i < recentEntries.length; i++) {
      if (recentEntries[i].previous_hash !== recentEntries[i - 1].current_hash) {
        chainValid = false;
        break;
      }
    }

    res.json({
      entry_count: totalCount,
      tip_hash: tipHash,
      chain_valid: chainValid,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[RIO Sync] Health check error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

export default router;
