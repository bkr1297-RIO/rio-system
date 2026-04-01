/**
 * Digital Chip — IndexedDB Local-First Sovereign Storage
 *
 * The "chip" is the user's sovereign identity + policy + history stored locally.
 * It enables offline approval review, receipt verification, and key management.
 *
 * Six object stores:
 *   1. sovereign-keys   — Ed25519 keypair (encrypted with passphrase)
 *   2. policy-cache     — current policy bundle (synced from gateway)
 *   3. approval-history — local copy of approvals (for offline review)
 *   4. receipt-cache    — local copy of receipts (for offline verification)
 *   5. intent-drafts    — offline intent drafts (queued for submission when online)
 *   6. sync-metadata    — last sync timestamp, gateway version, connection state
 *
 * All data stays on-device. The private key NEVER leaves the browser.
 * Sync with gateway when online; operate offline with cached policy.
 */

import { openDB, type IDBPDatabase } from "idb";

// ── Database Constants ────────────────────────────────────────────────
const DB_NAME = "rio-digital-chip";
const DB_VERSION = 1;

// ── Types ─────────────────────────────────────────────────────────────

export interface SovereignKey {
  id: string; // "primary" for the main keypair
  publicKey: string; // hex-encoded Ed25519 public key
  privateKeyEncrypted: string; // base64-encoded private key (encrypted with passphrase in production)
  fingerprint: string; // first 16 chars of public key
  createdAt: number; // UTC timestamp ms
  label: string; // human-readable label
}

export interface PolicyCache {
  id: string; // policyId
  seedId: string;
  version: string;
  policyBundle: Record<string, unknown>; // full policy JSON
  syncedAt: number; // UTC timestamp ms when last synced from gateway
  status: "active" | "stale" | "offline";
}

export interface ApprovalRecord {
  id: string; // approval_id
  intentId: string;
  decision: "approve" | "deny";
  signerId: string;
  toolName: string;
  riskTier: string;
  status: string;
  createdAt: number; // UTC timestamp ms
  expiresAt: number; // UTC timestamp ms
  syncedAt: number; // UTC timestamp ms
}

export interface ReceiptRecord {
  id: string; // receipt_id
  requestId: string;
  approvalId: string;
  executionId: string;
  actionType: string;
  status: string;
  ledgerHash: string;
  previousHash: string;
  chainIndex: number;
  createdAt: number; // UTC timestamp ms
  syncedAt: number; // UTC timestamp ms
  fullReceipt: Record<string, unknown>; // complete receipt JSON for verification
}

export interface IntentDraft {
  id: string; // UUID
  text: string; // natural language intent
  createdAt: number; // UTC timestamp ms
  status: "draft" | "queued" | "submitted" | "failed";
  submittedAt?: number;
  error?: string;
}

export interface SyncMetadata {
  id: string; // "primary"
  lastSyncAt: number; // UTC timestamp ms
  gatewayVersion: string;
  connectionState: "online" | "offline" | "syncing";
  gatewayUrl: string;
  proxyStatus: "active" | "killed" | "onboarding" | "unknown";
  pendingApprovalsCount: number;
  totalReceipts: number;
}

// ── Database Initialization ───────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 1. Sovereign keys
        if (!db.objectStoreNames.contains("sovereign-keys")) {
          db.createObjectStore("sovereign-keys", { keyPath: "id" });
        }

        // 2. Policy cache
        if (!db.objectStoreNames.contains("policy-cache")) {
          db.createObjectStore("policy-cache", { keyPath: "id" });
        }

        // 3. Approval history
        if (!db.objectStoreNames.contains("approval-history")) {
          const approvalStore = db.createObjectStore("approval-history", {
            keyPath: "id",
          });
          approvalStore.createIndex("by-intent", "intentId");
          approvalStore.createIndex("by-created", "createdAt");
          approvalStore.createIndex("by-status", "status");
        }

        // 4. Receipt cache
        if (!db.objectStoreNames.contains("receipt-cache")) {
          const receiptStore = db.createObjectStore("receipt-cache", {
            keyPath: "id",
          });
          receiptStore.createIndex("by-chain", "chainIndex");
          receiptStore.createIndex("by-created", "createdAt");
          receiptStore.createIndex("by-action", "actionType");
        }

        // 5. Intent drafts
        if (!db.objectStoreNames.contains("intent-drafts")) {
          const draftStore = db.createObjectStore("intent-drafts", {
            keyPath: "id",
          });
          draftStore.createIndex("by-status", "status");
          draftStore.createIndex("by-created", "createdAt");
        }

        // 6. Sync metadata
        if (!db.objectStoreNames.contains("sync-metadata")) {
          db.createObjectStore("sync-metadata", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

// ── Sovereign Keys ────────────────────────────────────────────────────

export async function storeKey(key: SovereignKey): Promise<void> {
  const db = await getDB();
  await db.put("sovereign-keys", key);
}

export async function getKey(
  id: string = "primary"
): Promise<SovereignKey | undefined> {
  const db = await getDB();
  return db.get("sovereign-keys", id);
}

export async function getAllKeys(): Promise<SovereignKey[]> {
  const db = await getDB();
  return db.getAll("sovereign-keys");
}

export async function deleteKey(id: string = "primary"): Promise<void> {
  const db = await getDB();
  await db.delete("sovereign-keys", id);
}

// ── Policy Cache ──────────────────────────────────────────────────────

export async function storePolicy(policy: PolicyCache): Promise<void> {
  const db = await getDB();
  await db.put("policy-cache", policy);
}

export async function getActivePolicy(): Promise<PolicyCache | undefined> {
  const db = await getDB();
  const all = await db.getAll("policy-cache");
  // Return the most recently synced active policy
  return all
    .filter((p) => p.status === "active")
    .sort((a, b) => b.syncedAt - a.syncedAt)[0];
}

export async function getAllPolicies(): Promise<PolicyCache[]> {
  const db = await getDB();
  return db.getAll("policy-cache");
}

export async function markPoliciesStale(): Promise<void> {
  const db = await getDB();
  const all = await db.getAll("policy-cache");
  const tx = db.transaction("policy-cache", "readwrite");
  for (const policy of all) {
    if (policy.status === "active") {
      policy.status = "stale";
      await tx.store.put(policy);
    }
  }
  await tx.done;
}

// ── Approval History ──────────────────────────────────────────────────

export async function storeApproval(approval: ApprovalRecord): Promise<void> {
  const db = await getDB();
  await db.put("approval-history", approval);
}

export async function storeApprovals(
  approvals: ApprovalRecord[]
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("approval-history", "readwrite");
  for (const approval of approvals) {
    await tx.store.put(approval);
  }
  await tx.done;
}

export async function getApproval(
  id: string
): Promise<ApprovalRecord | undefined> {
  const db = await getDB();
  return db.get("approval-history", id);
}

export async function getRecentApprovals(
  limit: number = 50
): Promise<ApprovalRecord[]> {
  const db = await getDB();
  const all = await db.getAll("approval-history");
  return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export async function getPendingApprovals(): Promise<ApprovalRecord[]> {
  const db = await getDB();
  const idx = db
    .transaction("approval-history")
    .store.index("by-status");
  return idx.getAll("pending");
}

// ── Receipt Cache ─────────────────────────────────────────────────────

export async function storeReceipt(receipt: ReceiptRecord): Promise<void> {
  const db = await getDB();
  await db.put("receipt-cache", receipt);
}

export async function storeReceipts(
  receipts: ReceiptRecord[]
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("receipt-cache", "readwrite");
  for (const receipt of receipts) {
    await tx.store.put(receipt);
  }
  await tx.done;
}

export async function getReceipt(
  id: string
): Promise<ReceiptRecord | undefined> {
  const db = await getDB();
  return db.get("receipt-cache", id);
}

export async function getRecentReceipts(
  limit: number = 50
): Promise<ReceiptRecord[]> {
  const db = await getDB();
  const all = await db.getAll("receipt-cache");
  return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export async function getReceiptByChainIndex(
  chainIndex: number
): Promise<ReceiptRecord | undefined> {
  const db = await getDB();
  const idx = db
    .transaction("receipt-cache")
    .store.index("by-chain");
  const results = await idx.getAll(chainIndex);
  return results[0];
}

export async function getReceiptCount(): Promise<number> {
  const db = await getDB();
  return db.count("receipt-cache");
}

// ── Intent Drafts ─────────────────────────────────────────────────────

export async function storeDraft(draft: IntentDraft): Promise<void> {
  const db = await getDB();
  await db.put("intent-drafts", draft);
}

export async function getDraft(
  id: string
): Promise<IntentDraft | undefined> {
  const db = await getDB();
  return db.get("intent-drafts", id);
}

export async function getQueuedDrafts(): Promise<IntentDraft[]> {
  const db = await getDB();
  const idx = db
    .transaction("intent-drafts")
    .store.index("by-status");
  return idx.getAll("queued");
}

export async function getAllDrafts(): Promise<IntentDraft[]> {
  const db = await getDB();
  const all = await db.getAll("intent-drafts");
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("intent-drafts", id);
}

export async function updateDraftStatus(
  id: string,
  status: IntentDraft["status"],
  error?: string
): Promise<void> {
  const db = await getDB();
  const draft = await db.get("intent-drafts", id);
  if (draft) {
    draft.status = status;
    if (status === "submitted") draft.submittedAt = Date.now();
    if (error) draft.error = error;
    await db.put("intent-drafts", draft);
  }
}

// ── Sync Metadata ─────────────────────────────────────────────────────

export async function updateSyncMetadata(
  meta: Partial<SyncMetadata>
): Promise<void> {
  const db = await getDB();
  const existing =
    (await db.get("sync-metadata", "primary")) ||
    ({
      id: "primary",
      lastSyncAt: 0,
      gatewayVersion: "unknown",
      connectionState: "offline" as const,
      gatewayUrl: "",
      proxyStatus: "unknown" as const,
      pendingApprovalsCount: 0,
      totalReceipts: 0,
    } satisfies SyncMetadata);
  await db.put("sync-metadata", { ...existing, ...meta, id: "primary" });
}

export async function getSyncMetadata(): Promise<SyncMetadata | undefined> {
  const db = await getDB();
  return db.get("sync-metadata", "primary");
}

// ── Migration Helper: localStorage → IndexedDB ───────────────────────

/**
 * Migrate existing sovereign key data from localStorage to IndexedDB.
 * This is a one-time migration for users who onboarded before the
 * Digital Chip was implemented.
 *
 * Does NOT delete localStorage entries — they remain as a fallback
 * until we're confident the IndexedDB layer is stable.
 */
export async function migrateFromLocalStorage(): Promise<boolean> {
  const MIGRATION_FLAG = "rio_chip_migrated";
  if (localStorage.getItem(MIGRATION_FLAG) === "true") return false;

  const pubKey = localStorage.getItem("rio_ed25519_pubkey");
  const privKey = localStorage.getItem("rio_ed25519_privkey");

  if (pubKey && privKey) {
    await storeKey({
      id: "primary",
      publicKey: pubKey,
      privateKeyEncrypted: privKey,
      fingerprint: pubKey.substring(0, 16),
      createdAt: Date.now(),
      label: "Primary Sovereign Key (migrated from localStorage)",
    });
  }

  // Migrate proxy status
  const proxyKilled = localStorage.getItem("rio_proxy_killed");
  const proxyOnboarded = localStorage.getItem("rio_proxy_onboarded");
  await updateSyncMetadata({
    proxyStatus: proxyKilled === "true"
      ? "killed"
      : proxyOnboarded === "true"
        ? "active"
        : "unknown",
  });

  localStorage.setItem(MIGRATION_FLAG, "true");
  return true;
}

// ── Sync Engine ───────────────────────────────────────────────────────

/**
 * Sync local Digital Chip data with the gateway.
 * Called on session start and periodically.
 *
 * @param syncData - The response from GET /api/sync (proxySync tRPC)
 */
export async function syncFromGateway(syncData: {
  status: string;
  pending_approvals: number;
  recent_receipts: Array<Record<string, unknown>>;
  health: Record<string, unknown>;
  pattern_confidence: number;
  gateway_version?: string;
}): Promise<void> {
  // Update sync metadata
  await updateSyncMetadata({
    lastSyncAt: Date.now(),
    connectionState: "online",
    gatewayVersion: syncData.gateway_version || "unknown",
    proxyStatus: syncData.status === "active" ? "active" : "unknown",
    pendingApprovalsCount: syncData.pending_approvals,
    totalReceipts: syncData.recent_receipts?.length || 0,
  });

  // Cache recent receipts
  if (syncData.recent_receipts?.length) {
    const receipts: ReceiptRecord[] = syncData.recent_receipts.map(
      (r: Record<string, unknown>, i: number) => ({
        id:
          (r.receipt_id as string) ||
          (r.id as string) ||
          `synced-${Date.now()}-${i}`,
        requestId: (r.request_id as string) || "",
        approvalId: (r.approval_id as string) || "",
        executionId: (r.execution_id as string) || "",
        actionType: (r.action_type as string) || (r.type as string) || "unknown",
        status: (r.status as string) || "valid",
        ledgerHash: (r.ledger_hash as string) || "",
        previousHash: (r.previous_hash as string) || "",
        chainIndex: (r.chain_index as number) || i,
        createdAt:
          typeof r.created_at === "number"
            ? r.created_at
            : typeof r.created_at === "string"
              ? new Date(r.created_at).getTime()
              : Date.now(),
        syncedAt: Date.now(),
        fullReceipt: r,
      })
    );
    await storeReceipts(receipts);
  }
}

// ── Offline Queue Processor ───────────────────────────────────────────

/**
 * Process queued intent drafts when the connection is restored.
 * Returns the list of draft IDs that were successfully submitted.
 *
 * @param submitFn - Function that submits an intent to the gateway
 */
export async function processOfflineQueue(
  submitFn: (text: string) => Promise<boolean>
): Promise<string[]> {
  const queued = await getQueuedDrafts();
  const submitted: string[] = [];

  for (const draft of queued) {
    try {
      const success = await submitFn(draft.text);
      if (success) {
        await updateDraftStatus(draft.id, "submitted");
        submitted.push(draft.id);
      } else {
        await updateDraftStatus(draft.id, "failed", "Submission returned false");
      }
    } catch (err) {
      await updateDraftStatus(
        draft.id,
        "failed",
        err instanceof Error ? err.message : "Unknown error"
      );
    }
  }

  return submitted;
}

// ── Chip Status Summary ───────────────────────────────────────────────

export interface ChipStatus {
  hasKey: boolean;
  keyFingerprint: string | null;
  hasPolicy: boolean;
  policyStatus: string | null;
  approvalCount: number;
  receiptCount: number;
  draftCount: number;
  queuedDraftCount: number;
  lastSyncAt: number | null;
  connectionState: string;
  proxyStatus: string;
}

/**
 * Get a summary of the Digital Chip's current state.
 * Useful for the ProxyDashboard and status indicators.
 */
export async function getChipStatus(): Promise<ChipStatus> {
  const db = await getDB();

  const key = await getKey("primary");
  const policy = await getActivePolicy();
  const syncMeta = await getSyncMetadata();
  const approvalCount = await db.count("approval-history");
  const receiptCount = await db.count("receipt-cache");
  const allDrafts = await db.getAll("intent-drafts");
  const queuedDrafts = allDrafts.filter((d) => d.status === "queued");

  return {
    hasKey: !!key,
    keyFingerprint: key?.fingerprint || null,
    hasPolicy: !!policy,
    policyStatus: policy?.status || null,
    approvalCount,
    receiptCount,
    draftCount: allDrafts.length,
    queuedDraftCount: queuedDrafts.length,
    lastSyncAt: syncMeta?.lastSyncAt || null,
    connectionState: syncMeta?.connectionState || "unknown",
    proxyStatus: syncMeta?.proxyStatus || "unknown",
  };
}

// ── Wipe (for kill switch / reset) ────────────────────────────────────

/**
 * Wipe all Digital Chip data. Used when the kill switch is activated
 * or when the user wants to reset their local state.
 *
 * WARNING: This deletes the local copy of the private key.
 * Ensure the user has a backup before calling this.
 */
export async function wipeChip(): Promise<void> {
  const db = await getDB();
  const stores = [
    "sovereign-keys",
    "policy-cache",
    "approval-history",
    "receipt-cache",
    "intent-drafts",
    "sync-metadata",
  ] as const;

  for (const store of stores) {
    await db.clear(store);
  }

  // Also clear the migration flag so re-migration can happen if needed
  localStorage.removeItem("rio_chip_migrated");
}
