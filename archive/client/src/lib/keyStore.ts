/**
 * RIO Key Store — IndexedDB-backed Device Key Management
 *
 * Stores the user's Ed25519 private key in the browser's IndexedDB.
 * The key is stored as a hex string and never leaves the device unencrypted.
 *
 * Schema:
 *   Database: rio-key-store
 *   Object Store: keys
 *   Key path: signerId
 *   Fields: signerId, publicKeyHex, secretKeyHex, createdAt, lastUsedAt
 */

const DB_NAME = "rio-key-store";
const DB_VERSION = 1;
const STORE_NAME = "keys";

export interface StoredKey {
  signerId: string;
  publicKeyHex: string;
  secretKeyHex: string;
  createdAt: string;
  lastUsedAt: string;
}

// ── IndexedDB Helpers ───────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "signerId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Save a keypair to IndexedDB.
 */
export async function saveKey(
  signerId: string,
  publicKeyHex: string,
  secretKeyHex: string
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const now = new Date().toISOString();

    store.put({
      signerId,
      publicKeyHex,
      secretKeyHex,
      createdAt: now,
      lastUsedAt: now,
    } satisfies StoredKey);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(new Error(`Failed to save key: ${tx.error?.message}`));
    };
  });
}

/**
 * Load a keypair from IndexedDB by signer ID.
 * Returns null if no key is found.
 */
export async function loadKey(signerId: string): Promise<StoredKey | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(signerId);

    request.onsuccess = () => {
      db.close();
      resolve(request.result ?? null);
    };
    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to load key: ${request.error?.message}`));
    };
  });
}

/**
 * List all stored keys (signer IDs and public keys only — no secrets in the listing).
 */
export async function listKeys(): Promise<
  Array<{ signerId: string; publicKeyHex: string; createdAt: string; lastUsedAt: string }>
> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      db.close();
      const keys = (request.result as StoredKey[]).map((k) => ({
        signerId: k.signerId,
        publicKeyHex: k.publicKeyHex,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      }));
      resolve(keys);
    };
    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to list keys: ${request.error?.message}`));
    };
  });
}

/**
 * Delete a key from IndexedDB.
 */
export async function deleteKey(signerId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(signerId);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(new Error(`Failed to delete key: ${tx.error?.message}`));
    };
  });
}

/**
 * Update the lastUsedAt timestamp for a key.
 */
export async function touchKey(signerId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(signerId);

    request.onsuccess = () => {
      const key = request.result as StoredKey | undefined;
      if (key) {
        key.lastUsedAt = new Date().toISOString();
        store.put(key);
      }
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(new Error(`Failed to touch key: ${tx.error?.message}`));
    };
  });
}

/**
 * Check if any signing key exists in IndexedDB.
 */
export async function hasAnyKey(): Promise<boolean> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.count();

    request.onsuccess = () => {
      db.close();
      resolve(request.result > 0);
    };
    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to count keys: ${request.error?.message}`));
    };
  });
}

/**
 * Get the first available key (for single-signer setups).
 */
export async function getDefaultKey(): Promise<StoredKey | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      db.close();
      const keys = request.result as StoredKey[];
      resolve(keys.length > 0 ? keys[0] : null);
    };
    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to get default key: ${request.error?.message}`));
    };
  });
}

/**
 * Clear all keys from IndexedDB.
 */
export async function clearAllKeys(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(new Error(`Failed to clear keys: ${tx.error?.message}`));
    };
  });
}
