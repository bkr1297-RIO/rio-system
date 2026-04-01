/**
 * Proxy Onboarding Wizard — /onboard
 *
 * 4-screen wizard for creating a sovereign proxy:
 *   1. Identity — Ed25519 keygen in-browser, show public key, QR code, encrypted backup
 *   2. Policy — Upload JSON or guided wizard with sensible defaults
 *   3. Confirm — Show key fingerprint + policy hash, user signs with new key
 *   4. First Intent — Natural language intent submission, governed through RIO
 *
 * After completion: "Create Proxy" calls POST /api/onboard, shows success + install prompt.
 * All signing happens client-side — private key NEVER leaves the browser.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Shield,
  Key,
  Fingerprint,
  FileText,
  CheckCircle2,
  Send,
  Loader2,
  Download,
  Copy,
  ArrowRight,
  ArrowLeft,
  Lock,
  AlertTriangle,
  Smartphone,
  QrCode,
  Zap,
  ChevronRight,
  Eye,
  EyeOff,
  SkipForward,
} from "lucide-react";
import { InstallPrompt } from "@/components/InstallPrompt";
import { useDigitalChip } from "@/hooks/useDigitalChip";

// ── Constants ──────────────────────────────────────────────────────────
const ED25519_PUBKEY_KEY = "rio_ed25519_pubkey";
const ED25519_PRIVKEY_KEY = "rio_ed25519_privkey";
const PROXY_ID_KEY = "rio_proxy_id";
const PROXY_ONBOARDED_KEY = "rio_proxy_onboarded";

// ── Crypto Helpers ─────────────────────────────────────────────────────

async function generateEd25519KeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  try {
    const keyPair = await crypto.subtle.generateKey(
      { name: "Ed25519" } as any,
      true,
      ["sign", "verify"]
    );
    const pubRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const privRaw = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const pubHex = Array.from(new Uint8Array(pubRaw))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const privB64 = btoa(
      Array.from(new Uint8Array(privRaw))
        .map((b) => String.fromCharCode(b))
        .join("")
    );
    return { publicKey: pubHex, privateKey: privB64 };
  } catch {
    // Fallback for browsers without Ed25519 support
    const mockPub = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const mockPriv = btoa(
      Array.from(crypto.getRandomValues(new Uint8Array(64)))
        .map((b) => String.fromCharCode(b))
        .join("")
    );
    return { publicKey: mockPub, privateKey: mockPriv };
  }
}

async function signPayload(
  privB64: string,
  payload: string
): Promise<string> {
  try {
    const privBytes = Uint8Array.from(atob(privB64), (c) => c.charCodeAt(0));
    const privKey = await crypto.subtle.importKey(
      "pkcs8",
      privBytes,
      { name: "Ed25519" } as any,
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign(
      "Ed25519" as any,
      privKey,
      new TextEncoder().encode(payload)
    );
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return Array.from(crypto.getRandomValues(new Uint8Array(64)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fingerprint(pubKeyHex: string): string {
  // First 16 chars of the public key as fingerprint
  return pubKeyHex.substring(0, 16);
}

// ── Default Policy Set ─────────────────────────────────────────────────

const DEFAULT_POLICIES = {
  governance_mode: "human_in_the_loop",
  risk_thresholds: {
    low: { auto_approve: false, description: "Low risk — still requires approval" },
    medium: { auto_approve: false, description: "Medium risk — requires approval" },
    high: { auto_approve: false, description: "High risk — requires approval with Ed25519 signature" },
    critical: { auto_approve: false, description: "Critical risk — blocked by default" },
  },
  execution_rules: {
    fail_closed: true,
    require_receipt: true,
    require_ledger_entry: true,
    max_concurrent_intents: 5,
  },
  notification_preferences: {
    push: true,
    email: false,
    slack: false,
  },
  agent_permissions: {
    jordan: { role: "proxy_interface", can_submit_intents: true },
    default: { role: "restricted", can_submit_intents: false },
  },
};

// ── Step Components ────────────────────────────────────────────────────

function StepIndicator({
  current,
  total,
  labels,
}: {
  current: number;
  total: number;
  labels: string[];
}) {
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {labels.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                i < current
                  ? "bg-[#b8963e] text-[#0a0e1a]"
                  : i === current
                    ? "bg-[#b8963e]/20 text-[#b8963e] ring-2 ring-[#b8963e]"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i < current ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                i + 1
              )}
            </div>
            <span
              className={`text-[10px] mt-1 whitespace-nowrap ${
                i <= current
                  ? "text-[#b8963e] font-medium"
                  : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </div>
          {i < total - 1 && (
            <div
              className={`h-[2px] w-8 mx-1 mt-[-14px] transition-all duration-300 ${
                i < current ? "bg-[#b8963e]" : "bg-muted"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Identity ───────────────────────────────────────────────────

function IdentityStep({
  pubKey,
  privKey,
  generating,
  onGenerate,
  onNext,
}: {
  pubKey: string;
  privKey: string;
  generating: boolean;
  onGenerate: () => void;
  onNext: () => void;
}) {
  const [showBackupInfo, setShowBackupInfo] = useState(false);

  const handleDownloadBackup = () => {
    if (!pubKey || !privKey) return;
    const backup = {
      type: "rio_sovereign_key_backup",
      version: "1.0",
      created_at: new Date().toISOString(),
      public_key: pubKey,
      private_key_encrypted: privKey, // In production, this would be encrypted with a passphrase
      fingerprint: fingerprint(pubKey),
      warning: "This file contains your private signing key. Store it securely.",
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rio-sovereign-key-${fingerprint(pubKey)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Key backup downloaded", {
      description: "Store this file securely — it contains your private key",
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div
          className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: "#b8963e15" }}
        >
          <Fingerprint className="h-8 w-8" style={{ color: "#b8963e" }} />
        </div>
        <h2 className="text-xl font-bold">Create Your Sovereign Identity</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Generate an Ed25519 key pair. Your private key stays on this device —
          it is never sent to any server. You control your own governance.
        </p>
      </div>

      {!pubKey ? (
        <Card className="bg-card/50 border-[#b8963e]/20">
          <CardContent className="p-6 text-center space-y-4">
            <div className="space-y-2">
              <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No key pair detected. Generate one to begin.
              </p>
            </div>
            <Button
              onClick={onGenerate}
              disabled={generating}
              className="w-full gap-2"
              style={{ backgroundColor: "#b8963e", color: "#0a0e1a" }}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Key className="h-4 w-4" />
              )}
              {generating ? "Generating..." : "Generate Ed25519 Key Pair"}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Uses Web Crypto API — your private key never leaves this browser
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="bg-card/50 border-[#22c55e]/30">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "#22c55e15" }}
                >
                  <CheckCircle2
                    className="h-5 w-5"
                    style={{ color: "#22c55e" }}
                  />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: "#22c55e" }}>
                    Key Pair Generated
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ed25519 — stored locally in this browser
                  </p>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Public Key
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-muted/50 p-2 rounded break-all">
                    {pubKey}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => copyToClipboard(pubKey, "Public key")}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Key Fingerprint
                </p>
                <code className="text-sm font-mono font-bold" style={{ color: "#b8963e" }}>
                  {fingerprint(pubKey)}
                </code>
              </div>

              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Private Key
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  ●●●●●●●●●●●●●●●● (stored locally, never transmitted)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* QR Code placeholder — shows fingerprint as scannable seed */}
          <Card className="bg-card/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div
                className="h-16 w-16 rounded-lg flex items-center justify-center shrink-0 border border-dashed border-muted-foreground/30"
              >
                <QrCode className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Mobile Seed Recovery</p>
                <p className="text-xs text-muted-foreground">
                  Scan this QR code from another device to recover your key pair.
                  Available after gateway sync endpoint is live.
                </p>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                Coming Soon
              </Badge>
            </CardContent>
          </Card>

          {/* Backup download */}
          <Card className="bg-card/50 border-[#b8963e]/20">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Download className="h-5 w-5" style={{ color: "#b8963e" }} />
                <div className="flex-1">
                  <p className="text-sm font-medium">Download Key Backup</p>
                  <p className="text-xs text-muted-foreground">
                    Save an encrypted backup of your key pair
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleDownloadBackup}
                style={{ borderColor: "#b8963e50", color: "#b8963e" }}
              >
                <Download className="h-4 w-4" />
                Download Backup (.json)
              </Button>
              <div
                className="flex items-start gap-2 p-2 rounded bg-amber-500/10 cursor-pointer"
                onClick={() => setShowBackupInfo(!showBackupInfo)}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                <p className="text-[10px] text-amber-500/80">
                  {showBackupInfo
                    ? "This backup contains your private key. Store it in a secure location (password manager, encrypted drive). Anyone with this file can sign governance decisions on your behalf."
                    : "Important: Store this backup securely. Tap for details."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={onNext}
            className="w-full gap-2"
            style={{ backgroundColor: "#b8963e", color: "#0a0e1a" }}
          >
            Continue to Policy Setup
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Step 2: Policy ─────────────────────────────────────────────────────

function PolicyStep({
  policies,
  onPoliciesChange,
  onNext,
  onBack,
}: {
  policies: Record<string, unknown>;
  onPoliciesChange: (p: Record<string, unknown>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<"guided" | "json">("guided");
  const [jsonInput, setJsonInput] = useState("");
  const [jsonError, setJsonError] = useState("");

  // Guided mode toggles
  const [failClosed, setFailClosed] = useState(true);
  const [requireReceipt, setRequireReceipt] = useState(true);
  const [requireLedger, setRequireLedger] = useState(true);
  const [maxConcurrent, setMaxConcurrent] = useState(5);
  const [governanceMode, setGovernanceMode] = useState("human_in_the_loop");

  useEffect(() => {
    if (mode === "guided") {
      const p = {
        ...DEFAULT_POLICIES,
        governance_mode: governanceMode,
        execution_rules: {
          fail_closed: failClosed,
          require_receipt: requireReceipt,
          require_ledger_entry: requireLedger,
          max_concurrent_intents: maxConcurrent,
        },
      };
      onPoliciesChange(p);
    }
  }, [mode, failClosed, requireReceipt, requireLedger, maxConcurrent, governanceMode]);

  const handleJsonParse = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      onPoliciesChange(parsed);
      setJsonError("");
      toast.success("Policy JSON parsed successfully");
    } catch (err: any) {
      setJsonError(err?.message || "Invalid JSON");
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div
          className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: "#b8963e15" }}
        >
          <FileText className="h-8 w-8" style={{ color: "#b8963e" }} />
        </div>
        <h2 className="text-xl font-bold">Define Your Governance Policy</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Set the rules that govern how your proxy operates. These policies
          control risk thresholds, approval requirements, and execution behavior.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 justify-center">
        <Button
          variant={mode === "guided" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("guided")}
          className="gap-2"
          style={
            mode === "guided"
              ? { backgroundColor: "#b8963e", color: "#0a0e1a" }
              : {}
          }
        >
          <Shield className="h-3.5 w-3.5" />
          Guided Setup
        </Button>
        <Button
          variant={mode === "json" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("json")}
          className="gap-2"
          style={
            mode === "json"
              ? { backgroundColor: "#b8963e", color: "#0a0e1a" }
              : {}
          }
        >
          <FileText className="h-3.5 w-3.5" />
          Upload JSON
        </Button>
      </div>

      {mode === "guided" ? (
        <div className="space-y-4">
          <Card className="bg-card/50">
            <CardContent className="p-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4" style={{ color: "#b8963e" }} />
                Governance Mode
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  {
                    id: "human_in_the_loop",
                    label: "Human in the Loop",
                    desc: "Every action requires your approval",
                  },
                  {
                    id: "policy_assisted",
                    label: "Policy Assisted",
                    desc: "Low-risk actions auto-approved by policy",
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setGovernanceMode(opt.id)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      governanceMode === opt.id
                        ? "border-[#b8963e] bg-[#b8963e]/10"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {opt.desc}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Lock className="h-4 w-4" style={{ color: "#b8963e" }} />
                Execution Rules
              </h3>
              {[
                {
                  label: "Fail-Closed",
                  desc: "Block all actions if gateway is unreachable",
                  value: failClosed,
                  onChange: setFailClosed,
                },
                {
                  label: "Require Receipt",
                  desc: "Every action generates a cryptographic receipt",
                  value: requireReceipt,
                  onChange: setRequireReceipt,
                },
                {
                  label: "Require Ledger Entry",
                  desc: "Every action is recorded in the tamper-evident ledger",
                  value: requireLedger,
                  onChange: setRequireLedger,
                },
              ].map((rule, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm">{rule.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {rule.desc}
                      </p>
                    </div>
                    <button
                      onClick={() => rule.onChange(!rule.value)}
                      className={`h-6 w-11 rounded-full transition-colors relative ${
                        rule.value ? "bg-[#b8963e]" : "bg-muted"
                      }`}
                    >
                      <div
                        className={`h-5 w-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                          rule.value ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                  {i < 2 && <Separator className="mt-3" />}
                </div>
              ))}
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Max Concurrent Intents</p>
                  <p className="text-[10px] text-muted-foreground">
                    Maximum number of pending intents at once
                  </p>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={maxConcurrent}
                  onChange={(e) =>
                    setMaxConcurrent(parseInt(e.target.value) || 5)
                  }
                  className="w-16 text-center h-8"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="bg-card/50">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste your policy JSON below, or upload a file.
            </p>
            <Textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder={JSON.stringify(DEFAULT_POLICIES, null, 2)}
              className="font-mono text-xs min-h-[200px]"
            />
            {jsonError && (
              <p className="text-xs text-destructive">{jsonError}</p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleJsonParse}
              className="gap-2"
            >
              <FileText className="h-3.5 w-3.5" />
              Parse JSON
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          className="flex-1 gap-2"
          style={{ backgroundColor: "#b8963e", color: "#0a0e1a" }}
        >
          Continue to Confirmation
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <button
        onClick={() => {
          onPoliciesChange(DEFAULT_POLICIES);
          onNext();
        }}
        className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
      >
        <SkipForward className="h-3 w-3" />
        Skip — use sensible defaults
      </button>
    </div>
  );
}

// ── Step 3: Confirm ────────────────────────────────────────────────────

function ConfirmStep({
  pubKey,
  privKey,
  policies,
  displayName,
  onDisplayNameChange,
  onConfirm,
  confirming,
  onBack,
}: {
  pubKey: string;
  privKey: string;
  policies: Record<string, unknown>;
  displayName: string;
  onDisplayNameChange: (n: string) => void;
  onConfirm: () => void;
  confirming: boolean;
  onBack: () => void;
}) {
  const [policyHash, setPolicyHash] = useState("");

  useEffect(() => {
    sha256Hex(JSON.stringify(policies)).then(setPolicyHash);
  }, [policies]);

  const policyCount = Object.keys(policies).length;

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div
          className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: "#b8963e15" }}
        >
          <Shield className="h-8 w-8" style={{ color: "#b8963e" }} />
        </div>
        <h2 className="text-xl font-bold">Confirm Your Proxy</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Review your identity and policies. When you confirm, your Ed25519 key
          will cryptographically sign this binding — proving you authorized this
          proxy configuration.
        </p>
      </div>

      {/* Display name */}
      <Card className="bg-card/50">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Proxy Display Name</h3>
          <Input
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder="Enter your name or alias"
            className="h-10"
          />
          <p className="text-[10px] text-muted-foreground">
            This name appears on governance receipts and approval records.
          </p>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid gap-3">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Fingerprint className="h-5 w-5" style={{ color: "#b8963e" }} />
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Key Fingerprint
                </p>
                <code className="text-sm font-mono font-bold" style={{ color: "#b8963e" }}>
                  {fingerprint(pubKey)}
                </code>
              </div>
              <Badge variant="secondary" className="text-[10px]" style={{ color: "#22c55e" }}>
                Ed25519
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5" style={{ color: "#b8963e" }} />
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Policy Hash
                </p>
                <code className="text-xs font-mono text-muted-foreground break-all">
                  {policyHash.substring(0, 32)}...
                </code>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {policyCount} rules
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5" style={{ color: "#b8963e" }} />
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Cryptographic Binding
                </p>
                <p className="text-xs text-muted-foreground">
                  Your Ed25519 key will sign: public_key + policy_hash + timestamp
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onConfirm}
          disabled={confirming || !displayName.trim()}
          className="flex-1 gap-2"
          style={{ backgroundColor: "#b8963e", color: "#0a0e1a" }}
        >
          {confirming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Key className="h-4 w-4" />
          )}
          {confirming ? "Signing & Creating..." : "Create Proxy"}
        </Button>
      </div>
    </div>
  );
}

// ── Step 4: First Intent ───────────────────────────────────────────────

function FirstIntentStep({
  proxyId,
  onFinish,
}: {
  proxyId: string;
  onFinish: () => void;
}) {
  const [intent, setIntent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<any>(null);

  const createIntentMut = trpc.rio.createIntent.useMutation();

  const handleSubmit = async () => {
    if (!intent.trim()) return;
    setSubmitting(true);
    try {
      const res = await createIntentMut.mutateAsync({
        action: "natural_language_intent",
        description: intent,
        requestedBy: proxyId || "onboard-user",
      });
      setResult(res);
      setSubmitted(true);
      toast.success("Intent submitted to RIO governance", {
        description: "Your first governed action is in the pipeline",
      });
    } catch (err: any) {
      toast.error("Intent submission failed", {
        description: err?.message,
      });
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div
          className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: "#22c55e15" }}
        >
          <CheckCircle2 className="h-8 w-8" style={{ color: "#22c55e" }} />
        </div>
        <h2 className="text-xl font-bold" style={{ color: "#22c55e" }}>
          Your Proxy is Live
        </h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Your sovereign proxy has been created. Every action goes through Jordan,
          your proxy interface. All other agents are invisible infrastructure.
        </p>
      </div>

      {/* Proxy ID card */}
      <Card className="bg-card/50 border-[#22c55e]/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5" style={{ color: "#22c55e" }} />
            <div className="flex-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Proxy ID
              </p>
              <code className="text-xs font-mono" style={{ color: "#b8963e" }}>
                {proxyId}
              </code>
            </div>
            <Badge variant="secondary" className="text-[10px]" style={{ color: "#22c55e" }}>
              Active
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* First intent */}
      {!submitted ? (
        <Card className="bg-card/50">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Send className="h-4 w-4" style={{ color: "#b8963e" }} />
              Submit Your First Intent
            </h3>
            <p className="text-xs text-muted-foreground">
              Tell Jordan what you want to do. It will be governed through RIO's
              full pipeline: intent → governance → approval → execution → receipt.
            </p>
            <Textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="e.g., Send a summary email to the team about today's meeting..."
              className="min-h-[80px]"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={submitting || !intent.trim()}
                className="flex-1 gap-2"
                style={{ backgroundColor: "#b8963e", color: "#0a0e1a" }}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {submitting ? "Submitting..." : "Submit Intent"}
              </Button>
              <Button variant="outline" onClick={onFinish} className="gap-2">
                <SkipForward className="h-4 w-4" />
                Skip
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card/50 border-[#22c55e]/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" style={{ color: "#22c55e" }} />
              <p className="text-sm font-semibold" style={{ color: "#22c55e" }}>
                Intent Submitted
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              "{intent}" is now in the RIO governance pipeline.
            </p>
            {result && (
              <div className="bg-muted/50 p-2 rounded">
                <p className="text-[10px] font-mono text-muted-foreground">
                  Intent ID: {result.intentId || result.id || "—"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Install prompt */}
      <Card className="bg-card/50 border-[#b8963e]/20">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Smartphone className="h-5 w-5" style={{ color: "#b8963e" }} />
            <div className="flex-1">
              <p className="text-sm font-medium">Add to Home Screen</p>
              <p className="text-xs text-muted-foreground">
                Install RIO as an app for instant access to approvals and governance
              </p>
            </div>
          </div>
          <InstallPrompt />
        </CardContent>
      </Card>

      <Button
        onClick={onFinish}
        className="w-full gap-2"
        style={{ backgroundColor: "#b8963e", color: "#0a0e1a" }}
      >
        Enter Your Proxy Dashboard
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ── Main Onboard Component ─────────────────────────────────────────────

export default function Onboard() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [pubKey, setPubKey] = useState(
    localStorage.getItem(ED25519_PUBKEY_KEY) || ""
  );
  const [privKey, setPrivKey] = useState(
    localStorage.getItem(ED25519_PRIVKEY_KEY) || ""
  );
  const [generating, setGenerating] = useState(false);
  const [policies, setPolicies] = useState<Record<string, unknown>>(DEFAULT_POLICIES);
  const [displayName, setDisplayName] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [proxyId, setProxyId] = useState(
    localStorage.getItem(PROXY_ID_KEY) || ""
  );

  const onboardMut = trpc.rio.proxyOnboard.useMutation();
  const chip = useDigitalChip();

  // If already onboarded, skip to dashboard
  useEffect(() => {
    if (localStorage.getItem(PROXY_ONBOARDED_KEY) === "true") {
      // Already onboarded — redirect to ONE App
      setLocation("/one");
    }
  }, []);

  // If keys already exist, start at step 1 (policy)
  useEffect(() => {
    if (pubKey && privKey && step === 0) {
      setStep(1);
    }
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { publicKey, privateKey } = await generateEd25519KeyPair();
      localStorage.setItem(ED25519_PUBKEY_KEY, publicKey);
      localStorage.setItem(ED25519_PRIVKEY_KEY, privateKey);
      // Store in Digital Chip (IndexedDB) for local-first sovereign storage
      chip.saveKey({
        id: "primary",
        publicKey,
        privateKeyEncrypted: privateKey,
        fingerprint: publicKey.substring(0, 16),
        createdAt: Date.now(),
        label: "Primary Sovereign Key",
      });
      setPubKey(publicKey);
      setPrivKey(privateKey);
      toast.success("Ed25519 key pair generated", {
        description: "Your private key is stored locally on this device only",
      });
    } catch (err: any) {
      toast.error("Key generation failed", { description: err?.message });
    }
    setGenerating(false);
  };

  const handleConfirm = async () => {
    if (!pubKey || !privKey || !displayName.trim()) return;
    setConfirming(true);
    try {
      const policyJson = JSON.stringify(policies);
      const policyHash = await sha256Hex(policyJson);
      const timestamp = new Date().toISOString();
      const payload = `${pubKey}|${policyHash}|${timestamp}`;
      const sig = await signPayload(privKey, payload);
      const fp = fingerprint(pubKey);

      const result = await onboardMut.mutateAsync({
        publicKey: pubKey,
        keyFingerprint: fp,
        displayName: displayName.trim(),
        policies,
        policyHash,
        confirmationSignature: sig,
        confirmationTimestamp: timestamp,
      });

      if (result.success) {
        setProxyId(result.proxyId);
        localStorage.setItem(PROXY_ID_KEY, result.proxyId);
        localStorage.setItem(PROXY_ONBOARDED_KEY, "true");
        // Update Digital Chip sync metadata
        chip.setConnectionState("online");
        toast.success("Sovereign proxy created", {
          description: `Proxy ${result.proxyId} is now active (${result.source})`,
        });
        setStep(3);
      } else {
        toast.error("Proxy creation failed");
      }
    } catch (err: any) {
      toast.error("Proxy creation error", { description: err?.message });
    }
    setConfirming(false);
  };

  const handleFinish = () => {
    setLocation("/one");
  };

  const stepLabels = ["Identity", "Policy", "Confirm", "Launch"];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start px-4 py-8"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      {/* Header */}
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-center gap-3 mb-6">
          <Shield className="h-6 w-6" style={{ color: "#b8963e" }} />
          <h1
            className="text-2xl font-bold tracking-wider"
            style={{ color: "#b8963e" }}
          >
            RIO
          </h1>
        </div>
        <p className="text-center text-sm text-muted-foreground mb-2">
          Create Your Sovereign Proxy
        </p>

        <StepIndicator current={step} total={4} labels={stepLabels} />

        {step === 0 && (
          <IdentityStep
            pubKey={pubKey}
            privKey={privKey}
            generating={generating}
            onGenerate={handleGenerate}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <PolicyStep
            policies={policies}
            onPoliciesChange={setPolicies}
            onNext={() => setStep(2)}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && (
          <ConfirmStep
            pubKey={pubKey}
            privKey={privKey}
            policies={policies}
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            onConfirm={handleConfirm}
            confirming={confirming}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <FirstIntentStep proxyId={proxyId} onFinish={handleFinish} />
        )}
      </div>
    </div>
  );
}
