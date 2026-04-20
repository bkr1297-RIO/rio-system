/**
 * useRioSync — React hook for RIO ledger synchronization
 *
 * Provides:
 *   - Full device sync (identity + key backup + ledger)
 *   - Ledger-only resync
 *   - Drift detection (quick health check)
 *   - Local sync state management
 */

import { useState, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  resyncLedger,
  checkLedgerHealth,
  getSyncState,
  clearSyncState,
  type LedgerSyncState,
  type LedgerSyncResult,
} from "@/lib/ledgerSync";

// ── Types ───────────────────────────────────────────────────────────────────

export interface RioSyncState {
  /** Current local sync state */
  syncState: LedgerSyncState;
  /** Whether a sync is currently in progress */
  syncing: boolean;
  /** Whether drift has been detected */
  driftDetected: boolean;
  /** Server entry count (from last health check) */
  serverEntryCount: number;
  /** Server tip hash (from last health check) */
  serverTipHash: string | null;
  /** Any error from the last operation */
  error: string | null;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useRioSync() {
  const [state, setState] = useState<RioSyncState>({
    syncState: getSyncState(),
    syncing: false,
    driftDetected: false,
    serverEntryCount: 0,
    serverTipHash: null,
    error: null,
  });

  const utils = trpc.useUtils();

  // ── Full Ledger Resync ────────────────────────────────────────────────

  const resync = useCallback(async (): Promise<LedgerSyncResult> => {
    setState((prev) => ({ ...prev, syncing: true, error: null }));

    try {
      const result = await resyncLedger(async () => {
        // Fetch the full ledger chain from the server via tRPC
        const data = await utils.client.rio.ledgerChain.query({ limit: 200 });

        // Map the response to the format expected by resyncLedger
        const entries = (data.entries as any[]).map((e: any) => ({
          block_id: e.block_id || e.blockId,
          intent_id: e.intent_id || e.intentId,
          action: e.action,
          decision: e.decision,
          receipt_hash: e.receipt_hash || e.receiptHash,
          previous_hash: e.previous_hash || e.previousHash,
          current_hash: e.current_hash || e.currentHash,
          ledger_signature: e.ledger_signature || e.ledgerSignature,
          protocol_version: e.protocol_version || e.protocolVersion,
          timestamp: e.timestamp,
          recorded_by: e.recorded_by || e.recordedBy,
        }));

        return {
          entries,
          chain_valid: data.chainValid ?? true,
          entry_count: data.total ?? entries.length,
          errors: data.chainErrors ?? [],
        };
      });

      setState((prev) => ({
        ...prev,
        syncing: false,
        syncState: getSyncState(),
        driftDetected: !result.chainValid,
        serverEntryCount: result.serverEntryCount,
        serverTipHash: result.serverTipHash,
        error: result.errors.length > 0 ? result.errors.join("; ") : null,
      }));

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      setState((prev) => ({
        ...prev,
        syncing: false,
        error: msg,
      }));
      return {
        success: false,
        entriesVerified: 0,
        chainValid: false,
        errors: [msg],
        serverTipHash: null,
        serverEntryCount: 0,
      };
    }
  }, [utils]);

  // ── Quick Drift Detection ─────────────────────────────────────────────

  const checkDrift = useCallback(async () => {
    try {
      const result = await checkLedgerHealth(async () => {
        const health = await utils.client.rio.ledgerHealth.query();
        return {
          entry_count: health.entryCount,
          tip_hash: health.tipHash,
          chain_valid: health.chainValid,
        };
      });

      setState((prev) => ({
        ...prev,
        driftDetected: result.driftDetected,
        serverEntryCount: result.serverEntryCount,
        serverTipHash: result.serverTipHash,
      }));

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Health check failed";
      setState((prev) => ({ ...prev, error: msg }));
      return null;
    }
  }, [utils]);

  // ── Full Device Sync (identity + keys + ledger) ───────────────────────

  const fullDeviceSync = useCallback(
    async (signerId?: string) => {
      setState((prev) => ({ ...prev, syncing: true, error: null }));

      try {
        const syncData = await utils.client.rio.deviceSync.query({
          signerId,
          ledgerLimit: 500,
        });

        // Update local ledger sync state from the server response
        const { saveSyncState } = await import("@/lib/ledgerSync");
        saveSyncState({
          verifiedCount: syncData.ledger.entryCount,
          lastVerifiedHash: syncData.ledger.tipHash,
          lastSyncAt: syncData.syncedAt,
          inSync: syncData.ledger.chainValid,
          lastError:
            syncData.ledger.chainErrors.length > 0
              ? syncData.ledger.chainErrors.join("; ")
              : null,
        });

        setState((prev) => ({
          ...prev,
          syncing: false,
          syncState: getSyncState(),
          driftDetected: !syncData.ledger.chainValid,
          serverEntryCount: syncData.ledger.entryCount,
          serverTipHash: syncData.ledger.tipHash,
          error: null,
        }));

        return syncData;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Device sync failed";
        setState((prev) => ({
          ...prev,
          syncing: false,
          error: msg,
        }));
        return null;
      }
    },
    [utils]
  );

  // ── Reset Local State ─────────────────────────────────────────────────

  const resetLocalState = useCallback(() => {
    clearSyncState();
    setState({
      syncState: getSyncState(),
      syncing: false,
      driftDetected: false,
      serverEntryCount: 0,
      serverTipHash: null,
      error: null,
    });
  }, []);

  // ── Auto-check drift on mount ─────────────────────────────────────────

  useEffect(() => {
    checkDrift();
  }, [checkDrift]);

  return {
    ...state,
    resync,
    checkDrift,
    fullDeviceSync,
    resetLocalState,
  };
}
