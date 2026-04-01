/**
 * useDigitalChip — React hook for the Digital Chip IndexedDB layer
 *
 * Provides reactive access to the local sovereign data store.
 * Handles migration from localStorage on first use.
 * Syncs with gateway data when available.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getChipStatus,
  migrateFromLocalStorage,
  syncFromGateway,
  storeKey,
  getKey,
  storeDraft,
  getQueuedDrafts,
  processOfflineQueue,
  wipeChip,
  updateSyncMetadata,
  type ChipStatus,
  type SovereignKey,
  type IntentDraft,
} from "@/lib/digital-chip";

interface UseDigitalChipReturn {
  /** Current chip status summary */
  status: ChipStatus | null;
  /** Whether the chip is loading/initializing */
  loading: boolean;
  /** Whether the chip has been initialized (migration done) */
  initialized: boolean;
  /** Store a new sovereign key */
  saveKey: (key: SovereignKey) => Promise<void>;
  /** Get the primary sovereign key */
  getPrimaryKey: () => Promise<SovereignKey | undefined>;
  /** Save an intent draft for offline queue */
  saveDraft: (text: string) => Promise<string>;
  /** Process queued drafts with a submit function */
  submitQueue: (
    submitFn: (text: string) => Promise<boolean>
  ) => Promise<string[]>;
  /** Sync local state from gateway sync data */
  syncFromServer: (syncData: Parameters<typeof syncFromGateway>[0]) => Promise<void>;
  /** Wipe all local data (kill switch) */
  wipeAll: () => Promise<void>;
  /** Refresh the status */
  refresh: () => Promise<void>;
  /** Update connection state */
  setConnectionState: (
    state: "online" | "offline" | "syncing"
  ) => Promise<void>;
}

export function useDigitalChip(): UseDigitalChipReturn {
  const [status, setStatus] = useState<ChipStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const initRef = useRef(false);

  // Initialize: migrate from localStorage if needed, then load status
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      try {
        await migrateFromLocalStorage();
        const chipStatus = await getChipStatus();
        setStatus(chipStatus);
        setInitialized(true);
      } catch (err) {
        console.error("[Digital Chip] Init error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = async () => {
      await updateSyncMetadata({ connectionState: "online" });
      const s = await getChipStatus();
      setStatus(s);
    };
    const handleOffline = async () => {
      await updateSyncMetadata({ connectionState: "offline" });
      const s = await getChipStatus();
      setStatus(s);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const refresh = useCallback(async () => {
    const s = await getChipStatus();
    setStatus(s);
  }, []);

  const saveKey = useCallback(
    async (key: SovereignKey) => {
      await storeKey(key);
      // Also keep localStorage in sync for backward compatibility
      localStorage.setItem("rio_ed25519_pubkey", key.publicKey);
      localStorage.setItem("rio_ed25519_privkey", key.privateKeyEncrypted);
      await refresh();
    },
    [refresh]
  );

  const getPrimaryKey = useCallback(async () => {
    return getKey("primary");
  }, []);

  const saveDraft = useCallback(
    async (text: string): Promise<string> => {
      const id = crypto.randomUUID();
      const draft: IntentDraft = {
        id,
        text,
        createdAt: Date.now(),
        status: navigator.onLine ? "queued" : "draft",
      };
      await storeDraft(draft);
      await refresh();
      return id;
    },
    [refresh]
  );

  const submitQueue = useCallback(
    async (
      submitFn: (text: string) => Promise<boolean>
    ): Promise<string[]> => {
      const submitted = await processOfflineQueue(submitFn);
      await refresh();
      return submitted;
    },
    [refresh]
  );

  const syncFromServer = useCallback(
    async (syncData: Parameters<typeof syncFromGateway>[0]) => {
      await syncFromGateway(syncData);
      await refresh();
    },
    [refresh]
  );

  const wipeAll = useCallback(async () => {
    await wipeChip();
    // Also clear localStorage keys for consistency
    localStorage.removeItem("rio_ed25519_pubkey");
    localStorage.removeItem("rio_ed25519_privkey");
    localStorage.removeItem("rio_proxy_id");
    localStorage.removeItem("rio_proxy_onboarded");
    localStorage.removeItem("rio_proxy_killed");
    await refresh();
  }, [refresh]);

  const setConnectionState = useCallback(
    async (state: "online" | "offline" | "syncing") => {
      await updateSyncMetadata({ connectionState: state });
      await refresh();
    },
    [refresh]
  );

  return {
    status,
    loading,
    initialized,
    saveKey,
    getPrimaryKey,
    saveDraft,
    submitQueue,
    syncFromServer,
    wipeAll,
    refresh,
    setConnectionState,
  };
}
