import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocalStore } from "@/hooks/useLocalStore";
import { encryptPrivateKey, decryptPrivateKey, publicKeyFingerprint } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLoginUrl } from "@/const";
import {
  Shield, Key, Download, Upload, RefreshCw, Loader2, CheckCircle2,
  AlertTriangle, ShieldCheck, ShieldAlert, Lock, Unlock, HardDrive, Cloud,
  ArrowRight, FileKey, Eye, EyeOff,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type Tab = "backup" | "restore" | "resync";

export default function KeyRecovery() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { keys, saveKeys, savePolicy, saveState, syncFromCloud } = useLocalStore();
  const [activeTab, setActiveTab] = useState<Tab>("backup");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const utils = trpc.useUtils();

  // Check if server has a backup
  const { data: backupStatus, isLoading: checkingBackup } = trpc.keyBackup.check.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Check proxy status
  const { data: proxyStatus } = trpc.proxy.status.useQuery(undefined, { enabled: isAuthenticated });

  // Auto-detect recovery state: if no local keys but server has backup, show restore tab
  useEffect(() => {
    if (!keys && backupStatus?.exists) {
      setActiveTab("restore");
    } else if (!keys && !backupStatus?.exists) {
      setActiveTab("backup");
    }
  }, [keys, backupStatus]);

  const backupMutation = trpc.keyBackup.save.useMutation({
    onSuccess: () => {
      toast.success("Key backup saved. Your private key is encrypted and stored securely.");
      utils.keyBackup.check.invalidate();
      setPassphrase("");
      setConfirmPassphrase("");
    },
    onError: (err) => toast.error(err.message),
  });

  const retrieveBackup = trpc.keyBackup.retrieve.useQuery(undefined, {
    enabled: false, // manual fetch
  });

  const fullRecover = trpc.sync.fullRecover.useQuery(undefined, {
    enabled: false, // manual fetch
  });

  const resyncLedger = trpc.sync.resyncLedger.useQuery(undefined, {
    enabled: false, // manual fetch
  });

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md w-full bg-card border-border">
          <CardContent className="p-6 text-center space-y-4">
            <Shield className="h-12 w-12 text-primary mx-auto" />
            <p className="text-muted-foreground text-sm">Sign in to access key recovery.</p>
            <Button onClick={() => { window.location.href = getLoginUrl(); }} className="font-medium">Sign In</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Backup Handler ─────────────────────────────────────────────
  const handleBackup = async () => {
    if (!keys) {
      toast.error("No local keys found. Generate keys first via onboarding.");
      return;
    }
    if (passphrase.length < 8) {
      toast.error("Passphrase must be at least 8 characters.");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      toast.error("Passphrases do not match.");
      return;
    }

    setIsProcessing(true);
    try {
      const encrypted = await encryptPrivateKey(keys.privateKey, passphrase);
      const fingerprint = await publicKeyFingerprint(keys.publicKey);
      await backupMutation.mutateAsync({
        encryptedKey: encrypted.encryptedKey,
        iv: encrypted.iv,
        salt: encrypted.salt,
        publicKeyFingerprint: fingerprint,
      });
    } catch (e) {
      toast.error("Backup failed: " + (e as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── Restore Handler ────────────────────────────────────────────
  const handleRestore = async () => {
    if (passphrase.length < 1) {
      toast.error("Enter your backup passphrase.");
      return;
    }

    setIsProcessing(true);
    try {
      const { data } = await retrieveBackup.refetch();
      if (!data?.exists || !data.backup) {
        toast.error("No key backup found on server.");
        setIsProcessing(false);
        return;
      }

      const privateKeyHex = await decryptPrivateKey(
        data.backup.encryptedKey,
        data.backup.iv,
        data.backup.salt,
        passphrase
      );

      // Get the public key from the server proxy record
      const statusData = proxyStatus;
      if (!statusData?.proxyUser?.publicKey) {
        toast.error("Cannot find your proxy identity on the server.");
        setIsProcessing(false);
        return;
      }

      // Save restored keys to IndexedDB
      await saveKeys(statusData.proxyUser.publicKey, privateKeyHex);

      // Restore policy
      if (statusData.proxyUser.policyHash && statusData.proxyUser.seedVersion) {
        await savePolicy(statusData.proxyUser.policyHash, statusData.proxyUser.seedVersion);
      }

      // Resync ledger
      const { data: recoveryData } = await fullRecover.refetch();
      if (recoveryData) {
        await syncFromCloud({
          entries: recoveryData.ledger.entries,
          totalEntries: recoveryData.ledger.totalEntries,
          chainValid: recoveryData.ledger.chainValid,
          proxyUser: recoveryData.identity,
        });
      }

      toast.success("Identity restored! Keys, policy, and ledger synced to this device.");
      utils.proxy.status.invalidate();
      setPassphrase("");
      navigate("/bondi");
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("decrypt") || msg.includes("operation")) {
        toast.error("Wrong passphrase. The encrypted key could not be decrypted.");
      } else {
        toast.error("Restore failed: " + msg);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── Ledger Resync Handler ──────────────────────────────────────
  const handleResync = async () => {
    setIsProcessing(true);
    try {
      const { data } = await resyncLedger.refetch();
      if (!data) {
        toast.error("Resync failed: no data returned.");
        setIsProcessing(false);
        return;
      }

      await syncFromCloud({
        entries: data.entries,
        totalEntries: data.totalEntries,
        chainValid: data.chainValid,
        proxyUser: proxyStatus?.proxyUser,
      });

      toast.success(`Ledger resynced: ${data.totalEntries} entries, chain ${data.chainValid ? "VALID" : "BROKEN"}.`);
      utils.proxy.status.invalidate();
      utils.ledger.list.invalidate();
      utils.ledger.verify.invalidate();
    } catch (e) {
      toast.error("Resync failed: " + (e as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── File Download Backup ───────────────────────────────────────
  const handleDownloadBackup = async () => {
    if (!keys) {
      toast.error("No local keys to backup.");
      return;
    }
    if (passphrase.length < 8) {
      toast.error("Passphrase must be at least 8 characters.");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      toast.error("Passphrases do not match.");
      return;
    }

    setIsProcessing(true);
    try {
      const encrypted = await encryptPrivateKey(keys.privateKey, passphrase);
      const fingerprint = await publicKeyFingerprint(keys.publicKey);
      const backupData = {
        version: 1,
        type: "rio-key-backup",
        publicKeyFingerprint: fingerprint,
        publicKey: keys.publicKey,
        encryptedPrivateKey: encrypted.encryptedKey,
        iv: encrypted.iv,
        salt: encrypted.salt,
        createdAt: new Date().toISOString(),
        note: "Decrypt with your passphrase to restore. Never share this file.",
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rio-key-backup-${fingerprint.slice(0, 8)}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Key backup file downloaded.");
      setPassphrase("");
      setConfirmPassphrase("");
    } catch (e) {
      toast.error("Download failed: " + (e as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const hasLocalKeys = !!keys;
  const hasServerBackup = backupStatus?.exists;

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <FileKey className="h-5 w-5 text-primary" /> Key Recovery &amp; Device Sync
          </h1>
          <p className="text-sm text-muted-foreground">
            Backup your signing keys, restore them on a new device, or resync your ledger.
          </p>
        </div>

        {/* Status Banner */}
        <Card className={`border ${!hasLocalKeys ? "border-amber-500/50 bg-amber-500/5" : "border-emerald-500/50 bg-emerald-500/5"}`}>
          <CardContent className="py-4 px-4">
            <div className="flex items-start gap-3">
              {!hasLocalKeys ? (
                <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
              ) : (
                <ShieldCheck className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
              )}
              <div className="space-y-1">
                <div className="text-sm font-medium">
                  {!hasLocalKeys ? "No Local Keys Detected" : "Local Keys Present"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {!hasLocalKeys && hasServerBackup && "A server backup exists. Restore your keys using your passphrase."}
                  {!hasLocalKeys && !hasServerBackup && "No backup found. If you have a backup file, you can restore from it. Otherwise, re-onboard."}
                  {hasLocalKeys && hasServerBackup && "Keys are stored locally and backed up to the server."}
                  {hasLocalKeys && !hasServerBackup && "Keys are stored locally but NOT backed up. Create a backup now."}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tab Selector */}
        <div className="flex gap-1 rounded-lg bg-secondary/30 p-1">
          {([
            { id: "backup" as Tab, label: "Backup", icon: Upload },
            { id: "restore" as Tab, label: "Restore", icon: Download },
            { id: "resync" as Tab, label: "Ledger Resync", icon: RefreshCw },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${activeTab === id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ─── Backup Tab ──────────────────────────────────────── */}
        {activeTab === "backup" && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" /> Encrypted Key Backup
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Your private key is encrypted in the browser with your passphrase before being sent to the server.
                The server never sees your plaintext key.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!hasLocalKeys ? (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4 text-center">
                  <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-2" />
                  <p className="text-xs font-mono text-amber-400">No local keys to backup.</p>
                  <p className="text-xs text-muted-foreground mt-1">Go to onboarding to generate keys first.</p>
                  <Button variant="outline" size="sm" onClick={() => navigate("/onboard")} className="mt-3 text-xs">
                    Go to Onboarding
                  </Button>
                </div>
              ) : (
                <>
                  {hasServerBackup && (
                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      <div className="text-xs font-mono text-emerald-400">
                        Server backup exists (fingerprint: {backupStatus?.publicKeyFingerprint?.slice(0, 12)}...)
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-mono text-muted-foreground">BACKUP PASSPHRASE</label>
                      <div className="relative">
                        <Input
                          type={showPassphrase ? "text" : "password"}
                          value={passphrase}
                          onChange={(e) => setPassphrase(e.target.value)}
                          placeholder="Enter a strong passphrase (min 8 chars)"
                          className="font-mono text-sm pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassphrase(!showPassphrase)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassphrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-mono text-muted-foreground">CONFIRM PASSPHRASE</label>
                      <Input
                        type={showPassphrase ? "text" : "password"}
                        value={confirmPassphrase}
                        onChange={(e) => setConfirmPassphrase(e.target.value)}
                        placeholder="Confirm your passphrase"
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleBackup}
                      disabled={isProcessing || passphrase.length < 8 || passphrase !== confirmPassphrase}
                      className="flex-1 font-medium text-xs gap-2"
                    >
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                      Backup to Server
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleDownloadBackup}
                      disabled={isProcessing || passphrase.length < 8 || passphrase !== confirmPassphrase}
                      className="flex-1 font-medium text-xs gap-2"
                    >
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Download File
                    </Button>
                  </div>

                  <div className="rounded-lg bg-secondary/50 p-3 text-[10px] font-mono text-muted-foreground space-y-1">
                    <p>Encryption: AES-256-GCM with PBKDF2 (600,000 iterations)</p>
                    <p>Your passphrase is never sent to the server.</p>
                    <p>Without your passphrase, the backup cannot be decrypted.</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── Restore Tab ─────────────────────────────────────── */}
        {activeTab === "restore" && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono flex items-center gap-2">
                <Unlock className="h-4 w-4 text-primary" /> Restore Keys
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Restore your signing keys from a server backup or a downloaded backup file.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasLocalKeys && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  <div className="text-xs font-mono text-amber-400">
                    Local keys already exist. Restoring will overwrite them.
                  </div>
                </div>
              )}

              {hasServerBackup ? (
                <>
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Cloud className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs font-mono text-emerald-400 font-semibold">Server Backup Found</span>
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      Fingerprint: {backupStatus?.publicKeyFingerprint}
                    </div>
                    {backupStatus?.createdAt && (
                      <div className="text-[10px] font-mono text-muted-foreground">
                        Created: {new Date(backupStatus.createdAt).toLocaleString()}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-muted-foreground">BACKUP PASSPHRASE</label>
                    <div className="relative">
                      <Input
                        type={showPassphrase ? "text" : "password"}
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder="Enter your backup passphrase"
                        className="font-mono text-sm pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassphrase(!showPassphrase)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassphrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    onClick={handleRestore}
                    disabled={isProcessing || passphrase.length < 1}
                    className="w-full font-medium text-xs gap-2"
                  >
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                    Restore from Server Backup
                  </Button>
                </>
              ) : (
                <div className="rounded-lg bg-secondary/50 p-4 text-center space-y-2">
                  <ShieldAlert className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-xs font-mono text-muted-foreground">No server backup found for your account.</p>
                  <p className="text-[10px] text-muted-foreground">
                    If you have a downloaded backup file, use the file restore below.
                    Otherwise, you may need to re-onboard.
                  </p>
                </div>
              )}

              {/* File Restore */}
              <div className="border-t border-border pt-4 space-y-3">
                <div className="text-xs font-mono text-muted-foreground">OR RESTORE FROM FILE</div>
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-muted-foreground">SELECT BACKUP FILE</label>
                  <Input
                    type="file"
                    accept=".json"
                    className="text-xs"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const text = await file.text();
                        const data = JSON.parse(text);
                        if (data.type !== "rio-key-backup") {
                          toast.error("Invalid backup file format.");
                          return;
                        }
                        // Store file data temporarily
                        (window as any).__rioFileBackup = data;
                        toast.info(`Backup file loaded (fingerprint: ${data.publicKeyFingerprint?.slice(0, 12)}...). Enter passphrase and click restore.`);
                      } catch {
                        toast.error("Could not read backup file.");
                      }
                    }}
                  />
                </div>
                {!hasServerBackup && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-muted-foreground">FILE BACKUP PASSPHRASE</label>
                    <Input
                      type={showPassphrase ? "text" : "password"}
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="Enter file backup passphrase"
                      className="font-mono text-sm"
                    />
                  </div>
                )}
                <Button
                  variant="outline"
                  onClick={async () => {
                    const fileData = (window as any).__rioFileBackup;
                    if (!fileData) {
                      toast.error("Load a backup file first.");
                      return;
                    }
                    if (passphrase.length < 1) {
                      toast.error("Enter your passphrase.");
                      return;
                    }
                    setIsProcessing(true);
                    try {
                      const privateKeyHex = await decryptPrivateKey(
                        fileData.encryptedPrivateKey,
                        fileData.iv,
                        fileData.salt,
                        passphrase
                      );
                      await saveKeys(fileData.publicKey, privateKeyHex);

                      // Also restore policy and sync ledger
                      if (proxyStatus?.proxyUser) {
                        await savePolicy(proxyStatus.proxyUser.policyHash, proxyStatus.proxyUser.seedVersion);
                      }
                      const { data: recoveryData } = await fullRecover.refetch();
                      if (recoveryData) {
                        await syncFromCloud({
                          entries: recoveryData.ledger.entries,
                          totalEntries: recoveryData.ledger.totalEntries,
                          chainValid: recoveryData.ledger.chainValid,
                          proxyUser: recoveryData.identity,
                        });
                      }

                      toast.success("Identity restored from file backup!");
                      delete (window as any).__rioFileBackup;
                      setPassphrase("");
                      navigate("/bondi");
                    } catch (e) {
                      const msg = (e as Error).message;
                      if (msg.includes("decrypt") || msg.includes("operation")) {
                        toast.error("Wrong passphrase.");
                      } else {
                        toast.error("File restore failed: " + msg);
                      }
                    } finally {
                      setIsProcessing(false);
                    }
                  }}
                  disabled={isProcessing}
                  className="w-full font-medium text-xs gap-2"
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
                  Restore from File
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Resync Tab ──────────────────────────────────────── */}
        {activeTab === "resync" && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-primary" /> Ledger Resync
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Download the full server ledger and rebuild your local state. Use this when your local
                ledger is out of sync or shows a broken chain.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {proxyStatus?.systemHealth && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-secondary/50 p-3 space-y-1">
                    <div className="text-[10px] font-mono text-muted-foreground">SERVER LEDGER</div>
                    <div className="text-sm font-medium">{proxyStatus.systemHealth.ledgerEntries} entries</div>
                    <div className={`text-xs font-mono ${proxyStatus.systemHealth.ledgerValid ? "text-emerald-400" : "text-red-400"}`}>
                      {proxyStatus.systemHealth.ledgerValid ? "Chain VALID" : "Chain BROKEN"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-secondary/50 p-3 space-y-1">
                    <div className="text-[10px] font-mono text-muted-foreground">LOCAL STATE</div>
                    <div className="text-sm font-medium">{keys ? "Keys present" : "No keys"}</div>
                    <div className="text-xs font-mono text-muted-foreground">
                      {proxyStatus.proxyUser ? `Status: ${proxyStatus.proxyUser.status}` : "Not onboarded"}
                    </div>
                  </div>
                </div>
              )}

              <Button
                onClick={handleResync}
                disabled={isProcessing}
                className="w-full font-medium text-xs gap-2"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Full Ledger Resync
              </Button>

              <div className="rounded-lg bg-secondary/50 p-3 text-[10px] font-mono text-muted-foreground space-y-1">
                <p>This downloads the complete server ledger and verifies the hash chain.</p>
                <p>Your local IndexedDB state will be updated to match the server.</p>
                <p>No data is deleted from the server during resync.</p>
              </div>

              {!hasLocalKeys && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <span className="text-xs font-mono text-amber-400 font-semibold">Keys Required for Signing</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Ledger resync restores your ledger state, but you still need your private key to approve actions.
                    Go to the Restore tab to recover your keys.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab("restore")} className="text-xs gap-1">
                    <ArrowRight className="h-3 w-3" /> Go to Restore
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
