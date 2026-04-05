import { useState, useEffect, useCallback, useRef } from "react";

const DB_NAME = "rio-proxy-store";
const DB_VERSION = 1;

interface StoreSchema {
  keys: { id: string; publicKey: string; privateKey: string; createdAt: number };
  policy: { id: string; policyHash: string; seedVersion: string; updatedAt: number };
  state: { id: string; proxyStatus: string; lastSyncAt: number; lastLedgerEntryId: string | null; data: unknown };
}

type StoreName = keyof StoreSchema;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys", { keyPath: "id" });
      if (!db.objectStoreNames.contains("policy")) db.createObjectStore("policy", { keyPath: "id" });
      if (!db.objectStoreNames.contains("state")) db.createObjectStore("state", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet<T extends StoreName>(store: T, key: string): Promise<StoreSchema[T] | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut<T extends StoreName>(store: T, value: StoreSchema[T]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbClear(store: StoreName): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function useLocalStore() {
  const [keys, setKeys] = useState<StoreSchema["keys"] | null>(null);
  const [policy, setPolicy] = useState<StoreSchema["policy"] | null>(null);
  const [localState, setLocalState] = useState<StoreSchema["state"] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const k = await dbGet("keys", "primary");
        const p = await dbGet("policy", "active");
        const s = await dbGet("state", "current");
        setKeys(k ?? null);
        setPolicy(p ?? null);
        setLocalState(s ?? null);
      } catch (e) {
        console.warn("IndexedDB load failed:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveKeys = useCallback(async (publicKey: string, privateKey: string) => {
    const entry: StoreSchema["keys"] = { id: "primary", publicKey, privateKey, createdAt: Date.now() };
    await dbPut("keys", entry);
    setKeys(entry);
  }, []);

  const savePolicy = useCallback(async (policyHash: string, seedVersion: string) => {
    const entry: StoreSchema["policy"] = { id: "active", policyHash, seedVersion, updatedAt: Date.now() };
    await dbPut("policy", entry);
    setPolicy(entry);
  }, []);

  const saveState = useCallback(async (proxyStatus: string, lastLedgerEntryId: string | null, data?: unknown) => {
    const entry: StoreSchema["state"] = { id: "current", proxyStatus, lastSyncAt: Date.now(), lastLedgerEntryId, data };
    await dbPut("state", entry);
    setLocalState(entry);
  }, []);

  const clearAll = useCallback(async () => {
    await dbClear("keys");
    await dbClear("policy");
    await dbClear("state");
    setKeys(null);
    setPolicy(null);
    setLocalState(null);
  }, []);

  const syncFromCloud = useCallback(async (syncData: { entries: any[]; totalEntries: number; chainValid: boolean; proxyUser?: any }) => {
    const lastEntry = syncData.entries.length > 0 ? syncData.entries[syncData.entries.length - 1] : null;
    await saveState(
      syncData.proxyUser?.status || localState?.proxyStatus || "UNKNOWN",
      lastEntry?.entryId || localState?.lastLedgerEntryId || null,
      { totalEntries: syncData.totalEntries, chainValid: syncData.chainValid, syncedEntries: syncData.entries.length }
    );
  }, [saveState, localState]);

  return { keys, policy, localState, loading, saveKeys, savePolicy, saveState, syncFromCloud, clearAll };
}
