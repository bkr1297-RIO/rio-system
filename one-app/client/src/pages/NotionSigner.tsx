/**
 * Notion Signer — Secure Approval Confirmation UI (outside Notion)
 *
 * Build Directive Step 3: When Brian sets Status=Approved in Notion,
 * the system detects the change and presents this secure confirmation UI.
 *
 * This page:
 *   1. Polls the server for intents where Notion Status=Approved AND Approval State=Unsigned
 *   2. Displays the exact intent summary, intent hash, and policy version
 *   3. Brian explicitly confirms, producing a signed Ed25519 approval payload
 *   4. The signed payload is sent to the existing /authorize endpoint via the server
 *   5. After execution, the Notion row is updated with Executed status and receipt link
 *
 * Invariants:
 *   - Notion status change is a SIGNAL, not authority
 *   - This UI produces the actual cryptographic approval
 *   - Fail closed on any mismatch
 */
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { signData, sha256 } from "@/lib/crypto";
import { useLocalStore } from "@/hooks/useLocalStore";
import { toast } from "sonner";
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  ArrowLeft,
  RefreshCw,
  Loader2,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Hash,
  User,
  Zap,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────── */

interface PendingNotionApproval {
  pageId: string;
  title: string;
  intentId: string;
  intentHash: string;
  action: string;
  riskTier: string;
  proposer: string;
  policyVersion: string;
  gatewayDecision: string;
  createdAt: string;
}

/* ─── Risk Tier Colors ───────────────────────────────────── */

function riskColor(tier: string): string {
  switch (tier.toUpperCase()) {
    case "LOW": return "text-emerald-400";
    case "MEDIUM": return "text-amber-400";
    case "HIGH": return "text-orange-400";
    case "CRITICAL": return "text-red-400";
    default: return "text-zinc-400";
  }
}

function riskBg(tier: string): string {
  switch (tier.toUpperCase()) {
    case "LOW": return "bg-emerald-500/10 border-emerald-500/30";
    case "MEDIUM": return "bg-amber-500/10 border-amber-500/30";
    case "HIGH": return "bg-orange-500/10 border-orange-500/30";
    case "CRITICAL": return "bg-red-500/10 border-red-500/30";
    default: return "bg-zinc-500/10 border-zinc-500/30";
  }
}

/* ─── Component ──────────────────────────────────────────── */

export default function NotionSigner() {
  const [, navigate] = useLocation();
  const [pending, setPending] = useState<PendingNotionApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState<string | null>(null); // pageId being signed
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  type SignResultEntry = { success: boolean; receiptId?: string; error?: string };
  const [signResult, setSignResult] = useState<Record<string, SignResultEntry>>({});

  // Poll for pending Notion approvals
  const pollQuery = trpc.notion.pollPendingApprovals.useQuery(undefined, {
    refetchInterval: 10_000, // Poll every 10 seconds
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (pollQuery.data) {
      setPending(pollQuery.data as PendingNotionApproval[]);
      setLastPoll(new Date());
      setLoading(false);
    }
    if (pollQuery.error) {
      setLoading(false);
    }
  }, [pollQuery.data, pollQuery.error]);

  // Local key store (IndexedDB)
  const { keys, loading: keysLoading } = useLocalStore();

  // Sign and authorize mutation
  const signAndAuthorize = trpc.notion.signAndAuthorize.useMutation();

  const handleSign = useCallback(async (item: PendingNotionApproval) => {
    setSigning(item.pageId);

    try {
      // Step 1: Get the private key from IndexedDB via useLocalStore
      const privateKey = keys?.privateKey;
      if (!privateKey) {
        toast.error("No signing key found. Please onboard first at /authorize.");
        setSigning(null);
        return;
      }

      // Step 2: Create the canonical signing payload
      // This binds the signature to the specific intent, hash, and policy
      const nonce = `notion-sign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ttl = 300; // 5 minutes
      const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

      const signingPayload = JSON.stringify({
        intent_id: item.intentId,
        intent_hash: item.intentHash,
        policy_version: item.policyVersion,
        decision: "approved",
        nonce,
        expires_at: expiresAt,
      });

      // Step 3: Sign the payload with Ed25519
      const payloadHash = await sha256(signingPayload);
      const signature = await signData(privateKey, signingPayload);

      // Step 4: Send to server for Gateway /authorize
      const result = await signAndAuthorize.mutateAsync({
        pageId: item.pageId,
        intentId: item.intentId,
        intentHash: item.intentHash,
        policyVersion: item.policyVersion,
        signature,
        payloadHash,
        nonce,
        expiresAt,
      });

      if (result.success) {
        setSignResult(prev => ({
          ...prev,
          [item.pageId]: { success: true, receiptId: result.receiptId ?? undefined },
        }));
        toast.success(`Intent ${item.intentId} authorized and executed`);
        // Remove from pending list
        setPending(prev => prev.filter(p => p.pageId !== item.pageId));
      } else {
        setSignResult(prev => ({
          ...prev,
          [item.pageId]: { success: false, error: result.error },
        }));
        toast.error(result.error || "Authorization failed");
      }
    } catch (err) {
      setSignResult(prev => ({
        ...prev,
        [item.pageId]: { success: false, error: String(err) },
      }));
      toast.error(`Signing failed: ${String(err)}`);
    } finally {
      setSigning(null);
    }
  }, [signAndAuthorize]);

  const handleDeny = useCallback(async (item: PendingNotionApproval) => {
    setSigning(item.pageId);
    try {
      const result = await signAndAuthorize.mutateAsync({
        pageId: item.pageId,
        intentId: item.intentId,
        intentHash: item.intentHash,
        policyVersion: item.policyVersion,
        signature: "DENIED",
        payloadHash: "DENIED",
        nonce: `deny-${Date.now()}`,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        deny: true,
      });

      if (result.success) {
        toast.success(`Intent ${item.intentId} denied`);
        setPending(prev => prev.filter(p => p.pageId !== item.pageId));
      } else {
        toast.error(result.error || "Denial failed");
      }
    } catch (err) {
      toast.error(`Denial failed: ${String(err)}`);
    } finally {
      setSigning(null);
    }
  }, [signAndAuthorize]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/authorize")}
              className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-zinc-400" />
            </button>
            <div className="flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-blue-400" />
              <span className="font-semibold text-sm">Notion Signer</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastPoll && (
              <span className="text-[10px] text-zinc-500 font-mono">
                Last poll: {lastPoll.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => pollQuery.refetch()}
              className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
              disabled={pollQuery.isFetching}
            >
              <RefreshCw className={`w-4 h-4 text-zinc-400 ${pollQuery.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Invariant Banner */}
        <div className="mb-6 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-blue-300 font-medium">Cryptographic Approval Required</p>
              <p className="text-[11px] text-zinc-400 mt-1">
                Notion status changes are signals only. Your Ed25519 signature here is the actual authorization.
                The Gateway verifies signature, nonce, TTL, and intent hash binding before execution.
              </p>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin mb-3" />
            <p className="text-sm text-zinc-500">Polling Notion for approved intents...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && pending.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <ShieldCheck className="w-10 h-10 text-emerald-500/40 mb-4" />
            <p className="text-sm text-zinc-400 mb-1">No pending approvals</p>
            <p className="text-xs text-zinc-600">
              Set an intent's Status to "Approved" in Notion to trigger the signer flow.
            </p>
            <p className="text-xs text-zinc-600 mt-1">
              Polling every 10 seconds.
            </p>
          </div>
        )}

        {/* Pending Approvals */}
        {pending.map((item) => (
          <div
            key={item.pageId}
            className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden"
          >
            {/* Intent Header */}
            <div className="p-4 border-b border-zinc-800/50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-zinc-100 truncate max-w-[70%]">
                  {item.title}
                </h3>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${riskBg(item.riskTier)}`}>
                  <span className={riskColor(item.riskTier)}>{item.riskTier}</span>
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3" /> {item.action}
                </span>
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" /> {item.proposer}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}
                </span>
              </div>
            </div>

            {/* Verification Details */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Hash className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[11px] text-zinc-500">Intent ID:</span>
                <code className="text-[11px] text-zinc-300 font-mono">{item.intentId}</code>
              </div>
              <div className="flex items-center gap-2">
                <Hash className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[11px] text-zinc-500">Intent Hash:</span>
                <code className="text-[10px] text-zinc-400 font-mono truncate max-w-[60%]">{item.intentHash}</code>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[11px] text-zinc-500">Policy:</span>
                <code className="text-[11px] text-zinc-300 font-mono">{item.policyVersion}</code>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[11px] text-zinc-500">Gateway Decision:</span>
                <span className="text-[11px] text-zinc-300">{item.gatewayDecision}</span>
              </div>
            </div>

            {/* Result (if already processed) */}
            {signResult[item.pageId] && (
              <div className={`mx-4 mb-4 p-3 rounded-lg border ${
                signResult[item.pageId].success
                  ? "bg-emerald-500/5 border-emerald-500/20"
                  : "bg-red-500/5 border-red-500/20"
              }`}>
                <div className="flex items-center gap-2">
                  {signResult[item.pageId].success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                  <span className="text-xs">
                    {signResult[item.pageId].success
                      ? `Executed — Receipt: ${signResult[item.pageId].receiptId}`
                      : signResult[item.pageId].error}
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="p-4 pt-2 flex gap-3">
              <button
                onClick={() => handleSign(item)}
                disabled={signing === item.pageId}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg
                  bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm
                  transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {signing === item.pageId ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                Sign & Authorize
              </button>
              <button
                onClick={() => handleDeny(item)}
                disabled={signing === item.pageId}
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg
                  bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm
                  transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShieldOff className="w-4 h-4" />
                Deny
              </button>
            </div>
          </div>
        ))}

        {/* Completed Results */}
        {Object.keys(signResult).length > 0 && pending.length === 0 && !loading && (
          <div className="mt-8">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
              Recent Actions
            </h3>
            {Object.entries(signResult).map(([pageId, result]) => (
              <div
                key={pageId}
                className={`mb-2 p-3 rounded-lg border ${
                  result.success
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : "bg-red-500/5 border-red-500/20"
                }`}
              >
                <div className="flex items-center gap-2">
                  {result.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                  <span className="text-xs text-zinc-300">
                    {result.success
                      ? `Authorized & Executed — Receipt: ${result.receiptId || "generated"}`
                      : `Failed: ${result.error}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
