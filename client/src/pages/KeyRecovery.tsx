/**
 * RIO Key Recovery & Device Sync Page
 *
 * This page provides the user interface for:
 *   1. Viewing current device key state
 *   2. Generating a new signing keypair
 *   3. Recovering a key from a server backup (passphrase required)
 *   4. Recovering a key from a downloaded backup file
 *   5. Downloading a backup of the current key
 *   6. Viewing ledger sync status and triggering resync
 *   7. Full device sync (keys + ledger in one operation)
 */

import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRioKeys } from "@/hooks/useRioKeys";
import { useRioSync } from "@/hooks/useRioSync";

export default function KeyRecovery() {
  useAuth({ redirectOnUnauthenticated: true });

  const keys = useRioKeys();
  const sync = useRioSync();

  // Form state
  const [signerId, setSignerId] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [recoverSignerId, setRecoverSignerId] = useState("");
  const [recoverPassphrase, setRecoverPassphrase] = useState("");
  const [filePassphrase, setFilePassphrase] = useState("");
  const [downloadPassphrase, setDownloadPassphrase] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ── Generate New Key ──────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!signerId.trim()) {
      setMessage({ type: "error", text: "Signer ID is required." });
      return;
    }
    if (!passphrase || passphrase.length < 8) {
      setMessage({ type: "error", text: "Passphrase must be at least 8 characters." });
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setMessage({ type: "error", text: "Passphrases do not match." });
      return;
    }

    const result = await keys.generateAndStore(signerId.trim(), passphrase);
    if (result.success) {
      setMessage({ type: "success", text: `Key generated and backed up. Public key: ${result.publicKey?.slice(0, 16)}...` });
      setSignerId("");
      setPassphrase("");
      setConfirmPassphrase("");
    } else {
      setMessage({ type: "error", text: result.error || "Generation failed." });
    }
  };

  // ── Recover from Server ───────────────────────────────────────────────

  const handleRecoverServer = async () => {
    if (!recoverSignerId.trim()) {
      setMessage({ type: "error", text: "Signer ID is required for recovery." });
      return;
    }
    if (!recoverPassphrase) {
      setMessage({ type: "error", text: "Passphrase is required for decryption." });
      return;
    }

    const result = await keys.recoverFromServer(recoverSignerId.trim(), recoverPassphrase);
    if (result.success) {
      setMessage({ type: "success", text: `Key recovered for ${result.signerId}. Public key: ${result.publicKey?.slice(0, 16)}...` });
      setRecoverSignerId("");
      setRecoverPassphrase("");
    } else {
      setMessage({ type: "error", text: result.error || "Recovery failed." });
    }
  };

  // ── Recover from File ─────────────────────────────────────────────────

  const handleRecoverFile = async () => {
    if (!filePassphrase) {
      setMessage({ type: "error", text: "Passphrase is required to decrypt the backup file." });
      return;
    }

    const result = await keys.recoverFromFile(filePassphrase);
    if (result.success) {
      setMessage({ type: "success", text: `Key recovered from file for ${result.signerId}.` });
      setFilePassphrase("");
    } else {
      setMessage({ type: "error", text: result.error || "File recovery failed." });
    }
  };

  // ── Download Backup ───────────────────────────────────────────────────

  const handleDownloadBackup = async () => {
    if (!downloadPassphrase || downloadPassphrase.length < 8) {
      setMessage({ type: "error", text: "Passphrase must be at least 8 characters." });
      return;
    }

    const result = await keys.downloadBackup(downloadPassphrase);
    if (result.success) {
      setMessage({ type: "success", text: "Backup file downloaded." });
      setDownloadPassphrase("");
    } else {
      setMessage({ type: "error", text: result.error || "Download failed." });
    }
  };

  // ── Ledger Resync ─────────────────────────────────────────────────────

  const handleResync = async () => {
    const result = await sync.resync();
    if (result.success) {
      setMessage({ type: "success", text: `Ledger synced. ${result.entriesVerified} entries verified. Chain valid: ${result.chainValid}` });
    } else {
      setMessage({ type: "error", text: `Ledger sync issues: ${result.errors.join("; ")}` });
    }
  };

  // ── Full Device Sync ──────────────────────────────────────────────────

  const handleFullSync = async () => {
    const result = await sync.fullDeviceSync(keys.signerId || undefined);
    if (result) {
      setMessage({ type: "success", text: `Device synced. Identity: ${result.identity.signerId || "none"}, Ledger: ${result.ledger.entryCount} entries, Chain valid: ${result.ledger.chainValid}` });
    } else {
      setMessage({ type: "error", text: sync.error || "Device sync failed." });
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Key Recovery & Device Sync</h1>
      <p className="text-gray-400 mb-8">
        Manage your Ed25519 signing key and synchronize your device with the RIO ledger.
      </p>

      {/* Status Message */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            message.type === "success"
              ? "bg-green-950/50 border-green-700 text-green-300"
              : "bg-red-950/50 border-red-700 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ── Current State ──────────────────────────────────────────────── */}
      <section className="mb-8 p-6 bg-gray-900 rounded-xl border border-gray-800">
        <h2 className="text-xl font-semibold mb-4">Device State</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Local Key:</span>{" "}
            <span className={keys.hasLocalKey ? "text-green-400" : "text-red-400"}>
              {keys.hasLocalKey ? "PRESENT" : "NO_LOCAL_KEYS"}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Server Backup:</span>{" "}
            <span className={keys.hasServerBackup ? "text-green-400" : "text-yellow-400"}>
              {keys.hasServerBackup ? "EXISTS" : "NONE"}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Signer ID:</span>{" "}
            <span className="text-gray-200 font-mono">{keys.signerId || "—"}</span>
          </div>
          <div>
            <span className="text-gray-400">Public Key:</span>{" "}
            <span className="text-gray-200 font-mono">
              {keys.publicKey ? keys.publicKey.slice(0, 16) + "..." : "—"}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Ledger Sync:</span>{" "}
            <span className={sync.syncState.inSync ? "text-green-400" : "text-red-400"}>
              {sync.syncState.inSync ? "IN_SYNC" : "OUT_OF_SYNC"}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Ledger Entries:</span>{" "}
            <span className="text-gray-200">
              {sync.syncState.verifiedCount} local / {sync.serverEntryCount} server
            </span>
          </div>
          <div>
            <span className="text-gray-400">Drift Detected:</span>{" "}
            <span className={sync.driftDetected ? "text-red-400" : "text-green-400"}>
              {sync.driftDetected ? "YES" : "NO"}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Last Sync:</span>{" "}
            <span className="text-gray-200">
              {sync.syncState.lastSyncAt
                ? new Date(sync.syncState.lastSyncAt).toLocaleString()
                : "Never"}
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-4 flex gap-3">
          <button
            onClick={handleFullSync}
            disabled={sync.syncing}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {sync.syncing ? "Syncing..." : "Full Device Sync"}
          </button>
          <button
            onClick={handleResync}
            disabled={sync.syncing}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            Resync Ledger Only
          </button>
          <button
            onClick={() => sync.checkDrift()}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            Check Drift
          </button>
        </div>
      </section>

      {/* ── Generate New Key ───────────────────────────────────────────── */}
      {!keys.hasLocalKey && (
        <section className="mb-8 p-6 bg-gray-900 rounded-xl border border-gray-800">
          <h2 className="text-xl font-semibold mb-4">Generate New Signing Key</h2>
          <p className="text-gray-400 text-sm mb-4">
            Create a new Ed25519 keypair. The private key will be stored in your browser
            and encrypted backup sent to the server.
          </p>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Signer ID (e.g., brian.k.rasmussen)"
              value={signerId}
              onChange={(e) => setSignerId(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <input
              type="password"
              placeholder="Backup passphrase (min 8 characters)"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <input
              type="password"
              placeholder="Confirm passphrase"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleGenerate}
              disabled={keys.loading}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {keys.loading ? "Generating..." : "Generate & Backup Key"}
            </button>
          </div>
        </section>
      )}

      {/* ── Recover from Server ────────────────────────────────────────── */}
      {!keys.hasLocalKey && (
        <section className="mb-8 p-6 bg-gray-900 rounded-xl border border-gray-800">
          <h2 className="text-xl font-semibold mb-4">Recover Key from Server</h2>
          <p className="text-gray-400 text-sm mb-4">
            If you previously backed up your key, enter your signer ID and passphrase to restore it.
          </p>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Signer ID"
              value={recoverSignerId}
              onChange={(e) => setRecoverSignerId(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <input
              type="password"
              placeholder="Backup passphrase"
              value={recoverPassphrase}
              onChange={(e) => setRecoverPassphrase(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleRecoverServer}
              disabled={keys.loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {keys.loading ? "Recovering..." : "Recover from Server"}
            </button>
          </div>
        </section>
      )}

      {/* ── Recover from File ──────────────────────────────────────────── */}
      {!keys.hasLocalKey && (
        <section className="mb-8 p-6 bg-gray-900 rounded-xl border border-gray-800">
          <h2 className="text-xl font-semibold mb-4">Recover Key from Backup File</h2>
          <p className="text-gray-400 text-sm mb-4">
            Upload a previously downloaded backup file and enter the passphrase to decrypt it.
          </p>
          <div className="space-y-3">
            <input
              type="password"
              placeholder="Backup passphrase"
              value={filePassphrase}
              onChange={(e) => setFilePassphrase(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleRecoverFile}
              disabled={keys.loading}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {keys.loading ? "Recovering..." : "Select File & Recover"}
            </button>
          </div>
        </section>
      )}

      {/* ── Download Backup (when key exists) ──────────────────────────── */}
      {keys.hasLocalKey && (
        <section className="mb-8 p-6 bg-gray-900 rounded-xl border border-gray-800">
          <h2 className="text-xl font-semibold mb-4">Download Key Backup</h2>
          <p className="text-gray-400 text-sm mb-4">
            Download an encrypted copy of your signing key. You will need the passphrase to restore it.
          </p>
          <div className="space-y-3">
            <input
              type="password"
              placeholder="Encryption passphrase (min 8 characters)"
              value={downloadPassphrase}
              onChange={(e) => setDownloadPassphrase(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleDownloadBackup}
              className="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-sm font-medium transition-colors"
            >
              Download Encrypted Backup
            </button>
          </div>
        </section>
      )}

      {/* ── Error Display ──────────────────────────────────────────────── */}
      {(keys.error || sync.error) && (
        <section className="mb-8 p-4 bg-red-950/30 rounded-xl border border-red-800">
          <h3 className="text-red-400 font-semibold mb-1">Errors</h3>
          {keys.error && <p className="text-red-300 text-sm">[Keys] {keys.error}</p>}
          {sync.error && <p className="text-red-300 text-sm">[Sync] {sync.error}</p>}
        </section>
      )}
    </div>
  );
}
