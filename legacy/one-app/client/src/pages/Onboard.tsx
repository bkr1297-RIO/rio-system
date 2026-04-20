import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocalStore } from "@/hooks/useLocalStore";
import { generateKeyPair, sha256, signData } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import {
  Shield, Key, FileCheck, CheckCircle2, Loader2,
  ArrowRight, Lock, RefreshCw, AlertTriangle
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const STEPS = [
  { icon: Key, label: "Create Your Keys", desc: "A secure keypair is generated on your device" },
  { icon: FileCheck, label: "Accept Policy", desc: "Review and accept the governance rules" },
  { icon: Shield, label: "Verify Identity", desc: "Link your keys to your account" },
  { icon: CheckCircle2, label: "You're Ready", desc: "Start using Bondi" },
];

export default function Onboard() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { keys: localKeys, saveKeys, savePolicy, saveState, syncFromCloud } = useLocalStore();
  const [step, setStep] = useState(0);
  const [keys, setKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [policyHash, setPolicyHash] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRekeying, setIsRekeying] = useState(false);

  const { data: proxyStatus, isLoading: statusLoading } = trpc.proxy.status.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const isAlreadyOnboarded = !!proxyStatus?.proxyUser;

  useEffect(() => {
    if (localKeys && isAlreadyOnboarded) {
      navigate("/bondi");
    }
  }, [localKeys, isAlreadyOnboarded, navigate]);

  const onboardMutation = trpc.proxy.onboard.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Welcome to RIO! You're all set.");
        setStep(3);
      } else {
        toast.error(data.error || "Already set up");
        navigate("/bondi");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const rekeyMutation = trpc.proxy.rekey.useMutation({
    onSuccess: async (data) => {
      if (data.success) {
        toast.success("Keys updated successfully.");
        try {
          const syncResult = await resyncLedger.refetch();
          if (syncResult.data) {
            await syncFromCloud({
              entries: syncResult.data.entries,
              totalEntries: syncResult.data.totalEntries,
              chainValid: syncResult.data.chainValid,
              proxyUser: data.proxyUser,
            });
          }
        } catch (e) {
          console.warn("Ledger sync after re-key failed:", e);
        }
        setStep(3);
      } else {
        toast.error(data.error || "Key update failed");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const resyncLedger = trpc.sync.resyncLedger.useQuery(undefined, { enabled: false });

  if (authLoading || statusLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 gap-6">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Shield className="h-8 w-8 text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold">Sign in to get started</h1>
          <p className="text-sm text-muted-foreground">You'll need an account to set up your proxy.</p>
        </div>
        <Button onClick={() => { window.location.href = getLoginUrl(); }} className="px-8">
          Sign In
        </Button>
      </div>
    );
  }

  const handleGenerateKeys = async () => {
    setIsProcessing(true);
    try {
      const kp = await generateKeyPair();
      setKeys(kp);
      await saveKeys(kp.publicKey, kp.privateKey);
      if (isAlreadyOnboarded) setIsRekeying(true);
      setStep(1);
      toast.success("Secure keys created on your device.");
    } catch (e) {
      toast.error("Key generation failed: " + (e as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBindPolicy = async () => {
    setIsProcessing(true);
    try {
      const policy = {
        version: "SEED-v1.0.0",
        rules: ["human-root-only-yes", "all-actions-ledgered", "kill-is-global", "approval-bound"],
        timestamp: Date.now(),
      };
      const hash = await sha256(JSON.stringify(policy));
      setPolicyHash(hash);
      await savePolicy(hash, "SEED-v1.0.0");
      setStep(2);
      toast.success("Policy accepted.");
    } catch (e) {
      toast.error("Policy binding failed: " + (e as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmIdentity = async () => {
    if (!keys || !policyHash) return;
    setIsProcessing(true);
    try {
      if (isRekeying || isAlreadyOnboarded) {
        let oldKeySignature: string | undefined;
        if (localKeys?.privateKey && localKeys.publicKey !== keys.publicKey) {
          try {
            const sigPayload = await sha256(keys.publicKey);
            oldKeySignature = await signData(localKeys.privateKey, sigPayload);
          } catch (e) {
            console.warn("Could not sign with old key:", e);
          }
        }
        await rekeyMutation.mutateAsync({
          publicKey: keys.publicKey,
          policyHash,
          oldKeySignature,
        });
      } else {
        await onboardMutation.mutateAsync({ publicKey: keys.publicKey, policyHash });
      }
      await saveState("ACTIVE", null);
    } catch {
      // handled by mutation
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinish = () => {
    navigate("/bondi");
  };

  const showRekeyBanner = isAlreadyOnboarded && !localKeys && step === 0;

  return (
    <div className="max-w-lg mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Shield className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isAlreadyOnboarded && !isRekeying && step === 0
            ? "Welcome Back"
            : isRekeying
              ? "Update Your Keys"
              : "Set Up Your Proxy"}
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          {isAlreadyOnboarded && step === 0
            ? "Your account is active but this device needs keys. Restore from backup or create new ones."
            : "This takes about 30 seconds. We'll create secure keys on your device so you can approve actions."}
        </p>
      </div>

      {/* Recovery banner for already-onboarded users */}
      {showRekeyBanner && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">No keys on this device</p>
              <p className="text-xs text-amber-600/80 mt-1">
                Choose how you'd like to get set up on this device.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={() => navigate("/recovery")}
              className="h-auto py-3 flex-col gap-1.5"
            >
              <RefreshCw className="h-5 w-5" />
              <span className="text-xs">Restore Backup</span>
            </Button>
            <Button
              onClick={handleGenerateKeys}
              disabled={isProcessing}
              className="h-auto py-3 flex-col gap-1.5"
            >
              {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Key className="h-5 w-5" />}
              <span className="text-xs">New Keys</span>
            </Button>
          </div>
        </div>
      )}

      {/* Progress dots */}
      {(!showRekeyBanner || step > 0) && (
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                i < step
                  ? "bg-primary text-primary-foreground"
                  : i === step
                    ? "bg-primary/10 text-primary ring-2 ring-primary/30"
                    : "bg-muted text-muted-foreground"
              }`}>
                {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 rounded-full ${i < step ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Step content */}
      {(!showRekeyBanner || step > 0) && (
        <div className="rounded-xl border bg-card shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              {(() => { const Icon = STEPS[step].icon; return <Icon className="h-5 w-5 text-primary" />; })()}
              {STEPS[step].label}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">{STEPS[step].desc}</p>
          </div>

          {step === 0 && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm text-muted-foreground">
                <p>A secure keypair will be created right here in your browser.</p>
                <p>Your private key <strong>never leaves your device</strong> — it's used to sign your approvals.</p>
              </div>
              <Button onClick={handleGenerateKeys} disabled={isProcessing} className="w-full h-11 gap-2">
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                Create Secure Keys
              </Button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              {isRekeying && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-700">
                    These new keys will replace your previous ones. This will be recorded in the audit log.
                  </p>
                </div>
              )}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                <p className="text-sm font-medium text-primary">Governance Policy</p>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    You are the only one who can approve actions
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    Every action is permanently recorded
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    Kill switch stops everything immediately
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    Approvals are locked to specific actions
                  </li>
                </ul>
              </div>
              <Button onClick={handleBindPolicy} disabled={isProcessing} className="w-full h-11 gap-2">
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
                Accept Policy
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account</span>
                  <span className="font-medium">{user?.name || "You"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Key</span>
                  <span className="font-mono text-xs">{keys?.publicKey?.slice(0, 16)}...</span>
                </div>
              </div>
              <Button onClick={handleConfirmIdentity} disabled={isProcessing} className="w-full h-11 gap-2">
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                {isRekeying ? "Update Keys" : "Confirm & Activate"}
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="text-center py-4">
                <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
                <h3 className="text-lg font-semibold text-emerald-800">You're all set!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {isRekeying
                    ? "Your new keys are active. You can approve and execute actions."
                    : "Your proxy is active. Ask Bondi anything and approve the actions it proposes."}
                </p>
              </div>

              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-center gap-2">
                <Lock className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700">
                  <strong>Important:</strong> Back up your keys now so you can recover on a new device.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => navigate("/recovery")} className="h-11 gap-2">
                  <Lock className="h-4 w-4" />
                  Backup Keys
                </Button>
                <Button onClick={handleFinish} className="h-11 gap-2">
                  Go to Bondi
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
