/**
 * useRioKeys — React hook for RIO device key management
 *
 * Provides a unified interface for:
 *   - Generating a new Ed25519 keypair
 *   - Storing the key in IndexedDB
 *   - Backing up the encrypted key to the server
 *   - Recovering a key from a server backup
 *   - Recovering a key from a downloaded file
 *   - Signing approval payloads
 *   - Checking local key state
 */

import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  generateKeypair,
  encryptSecretKey,
  decryptSecretKey,
  buildSignaturePayload,
  signPayload,
  downloadKeyBundle,
  importKeyBundleFromFile,
  type EncryptedKeyBundle,
} from "@/lib/crypto";
import {
  saveKey,
  loadKey,
  getDefaultKey,
  hasAnyKey,
  deleteKey,
  touchKey,
  type StoredKey,
} from "@/lib/keyStore";

// ── Types ───────────────────────────────────────────────────────────────────

export interface RioKeyState {
  /** Whether a signing key exists in IndexedDB */
  hasLocalKey: boolean;
  /** The signer ID of the local key (if any) */
  signerId: string | null;
  /** The public key hex of the local key (if any) */
  publicKey: string | null;
  /** Whether a server backup exists */
  hasServerBackup: boolean;
  /** Whether the state is still loading */
  loading: boolean;
  /** Any error message */
  error: string | null;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useRioKeys() {
  const [state, setState] = useState<RioKeyState>({
    hasLocalKey: false,
    signerId: null,
    publicKey: null,
    hasServerBackup: false,
    loading: true,
    error: null,
  });

  const backupKeyMutation = trpc.rio.backupKey.useMutation();
  const listBackupsQuery = trpc.rio.listKeyBackups.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  // ── Initialize: check local key state ───────────────────────────────

  const refreshState = useCallback(async () => {
    try {
      const key = await getDefaultKey();
      const hasBackup = (listBackupsQuery.data?.count ?? 0) > 0;

      setState({
        hasLocalKey: !!key,
        signerId: key?.signerId ?? null,
        publicKey: key?.publicKeyHex ?? null,
        hasServerBackup: hasBackup,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to check key state",
      }));
    }
  }, [listBackupsQuery.data]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  // ── Generate New Keypair ──────────────────────────────────────────────

  const generateAndStore = useCallback(
    async (signerId: string, passphrase: string) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        // 1. Generate keypair
        const keypair = await generateKeypair();

        // 2. Store in IndexedDB
        await saveKey(signerId, keypair.publicKey, keypair.secretKey);

        // 3. Encrypt and backup to server
        const bundle = await encryptSecretKey(
          keypair.secretKey,
          keypair.publicKey,
          signerId,
          passphrase
        );

        await backupKeyMutation.mutateAsync({
          signerId,
          publicKey: bundle.publicKey,
          encryptedKey: bundle.ciphertext,
          salt: bundle.salt,
          iv: bundle.iv,
          version: bundle.version,
        });

        // 4. Refresh state
        await refreshState();

        return {
          success: true,
          publicKey: keypair.publicKey,
          signerId,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Key generation failed";
        setState((prev) => ({ ...prev, loading: false, error: msg }));
        return { success: false, error: msg };
      }
    },
    [backupKeyMutation, refreshState]
  );

  // ── Recover from Server Backup ────────────────────────────────────────

  const recoverFromServer = useCallback(
    async (signerId: string, passphrase: string) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        // 1. Fetch encrypted backup from server
        // We use a direct fetch since we need the query result immediately
        const utils = trpc.useUtils();
        const result = await utils.client.rio.recoverKey.query({ signerId });

        if (!result.found || !result.backup) {
          throw new Error(`No backup found for signer: ${signerId}`);
        }

        const backup = result.backup;

        // 2. Decrypt with passphrase
        const bundle: EncryptedKeyBundle = {
          version: backup.version as 1,
          salt: backup.salt,
          iv: backup.iv,
          ciphertext: backup.encryptedKey,
          publicKey: backup.publicKey,
          signerId: backup.signerId,
          createdAt: backup.createdAt,
        };

        const secretKeyHex = await decryptSecretKey(bundle, passphrase);

        // 3. Store in IndexedDB
        await saveKey(signerId, backup.publicKey, secretKeyHex);

        // 4. Refresh state
        await refreshState();

        return { success: true, signerId, publicKey: backup.publicKey };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Recovery failed";
        setState((prev) => ({ ...prev, loading: false, error: msg }));
        return { success: false, error: msg };
      }
    },
    [refreshState]
  );

  // ── Recover from File ─────────────────────────────────────────────────

  const recoverFromFile = useCallback(
    async (passphrase: string) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        // 1. Import file
        const bundle = await importKeyBundleFromFile();

        // 2. Decrypt with passphrase
        const secretKeyHex = await decryptSecretKey(bundle, passphrase);

        // 3. Store in IndexedDB
        await saveKey(bundle.signerId, bundle.publicKey, secretKeyHex);

        // 4. Also backup to server for future recovery
        await backupKeyMutation.mutateAsync({
          signerId: bundle.signerId,
          publicKey: bundle.publicKey,
          encryptedKey: bundle.ciphertext,
          salt: bundle.salt,
          iv: bundle.iv,
          version: bundle.version,
        });

        // 5. Refresh state
        await refreshState();

        return {
          success: true,
          signerId: bundle.signerId,
          publicKey: bundle.publicKey,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "File recovery failed";
        setState((prev) => ({ ...prev, loading: false, error: msg }));
        return { success: false, error: msg };
      }
    },
    [backupKeyMutation, refreshState]
  );

  // ── Download Backup File ──────────────────────────────────────────────

  const downloadBackup = useCallback(
    async (passphrase: string) => {
      try {
        const key = await getDefaultKey();
        if (!key) throw new Error("No local key to backup");

        const bundle = await encryptSecretKey(
          key.secretKeyHex,
          key.publicKeyHex,
          key.signerId,
          passphrase
        );

        downloadKeyBundle(bundle);
        return { success: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Download failed";
        return { success: false, error: msg };
      }
    },
    []
  );

  // ── Sign an Approval Payload ──────────────────────────────────────────

  const signApproval = useCallback(
    async (params: {
      intent_id: string;
      action: string;
      decision: "approved" | "denied";
      signer_id: string;
    }) => {
      const key = await loadKey(params.signer_id);
      if (!key) {
        // Try default key
        const defaultKey = await getDefaultKey();
        if (!defaultKey) {
          throw new Error("No signing key available. Recover your key first.");
        }
        // Use default key with the provided signer_id
        const timestamp = new Date().toISOString();
        const payload = buildSignaturePayload({
          ...params,
          timestamp,
        });
        const signature = await signPayload(payload, defaultKey.secretKeyHex);
        await touchKey(defaultKey.signerId);
        return { signature, timestamp, signerId: defaultKey.signerId };
      }

      const timestamp = new Date().toISOString();
      const payload = buildSignaturePayload({
        ...params,
        timestamp,
      });
      const signature = await signPayload(payload, key.secretKeyHex);
      await touchKey(params.signer_id);
      return { signature, timestamp, signerId: params.signer_id };
    },
    []
  );

  // ── Remove Local Key ──────────────────────────────────────────────────

  const removeLocalKey = useCallback(
    async (signerId: string) => {
      await deleteKey(signerId);
      await refreshState();
    },
    [refreshState]
  );

  return {
    ...state,
    generateAndStore,
    recoverFromServer,
    recoverFromFile,
    downloadBackup,
    signApproval,
    removeLocalKey,
    refreshState,
  };
}
