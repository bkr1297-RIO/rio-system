/**
 * Approvals Page — Screen 3 of 3
 *
 * Lists pending intents from the Gateway and allows approve/deny.
 * Calls Gateway directly via gateway.ts — no tRPC proxy.
 *
 * Auth: useGatewayAuth() — Gateway JWT (passphrase login).
 * Decision 2: Interface Is Not Authority — ONE displays, Gateway enforces.
 */
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useGatewayAuth } from "@/hooks/useGatewayAuth";
import {
  getPendingApprovals,
  submitApproval,
  type PendingApproval,
} from "@/lib/gateway";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Loader2, ShieldCheck, Shield, Clock, CheckCircle2,
  XCircle, AlertTriangle, Plus, LogOut, RefreshCw, Timer,
  Mail, MessageSquare, Search, Rocket, DollarSign, FileEdit, Zap,
  Play
} from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";

/* ─── Action display helpers ────────────────────────────────── */

const ACTION_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  send_email: { label: "Send Email", icon: Mail },
  send_sms: { label: "Send SMS", icon: MessageSquare },
  search_web: { label: "Web Search", icon: Search },
  deploy_service: { label: "Deploy Service", icon: Rocket },
  transfer_funds: { label: "Transfer Funds", icon: DollarSign },
  modify_policy: { label: "Modify Policy", icon: FileEdit },
};

function getActionDisplay(action: string) {
  return ACTION_LABELS[action] || {
    label: action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    icon: Zap,
  };
}

/* ─── Risk display ──────────────────────────────────────────── */

const RISK_CONFIG: Record<string, { label: string; color: string; border: string }> = {
  NONE: { label: "None", color: "text-slate-400", border: "border-slate-500/20" },
  LOW: { label: "Low", color: "text-emerald-400", border: "border-emerald-500/20" },
  MEDIUM: { label: "Medium", color: "text-amber-400", border: "border-amber-500/20" },
  HIGH: { label: "High", color: "text-red-400", border: "border-red-500/20" },
  CRITICAL: { label: "Critical", color: "text-red-500", border: "border-red-500/30" },
};

/* ─── TTL Badge ─────────────────────────────────────────────── */

function TtlBadge({ expiresAt }: { expiresAt?: string | null }) {
  if (!expiresAt) return null;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) {
    return (
      <Badge variant="outline" className="text-[10px] text-red-400 border-red-500/20 gap-1">
        <Timer className="h-3 w-3" />
        Expired
      </Badge>
    );
  }
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  return (
    <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/20 gap-1">
      <Timer className="h-3 w-3" />
      {hours}h {mins}m
    </Badge>
  );
}

/* ─── Time helper ───────────────────────────────────────────── */

function getTimeAgo(ts?: string): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

/* ─── Approval Card ─────────────────────────────────────────── */

function ApprovalCard({
  intent,
  onApprove,
  onDeny,
  isApproving,
  isDenying,
}: {
  intent: PendingApproval;
  onApprove: (intentId: string) => void;
  onDeny: (intentId: string) => void;
  isApproving: boolean;
  isDenying: boolean;
}) {
  const risk = RISK_CONFIG[intent.risk_tier || "MEDIUM"] || RISK_CONFIG.MEDIUM;
  const timeAgo = getTimeAgo(intent.created_at);

  return (
    <div className={cn(
      "rounded-xl border bg-card p-5 space-y-4 transition-all",
      risk.border
    )}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            {(() => { const display = getActionDisplay(intent.action); const ActionIcon = display.icon; return <ActionIcon className="h-5 w-5 text-amber-400" />; })()}
          </div>
          <div>
            <h3 className="font-semibold text-sm">{getActionDisplay(intent.action).label}</h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Clock className="h-3 w-3" />
              {timeAgo}
              {intent.agent_id && (
                <span className="text-muted-foreground/60">via {intent.agent_id}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TtlBadge expiresAt={intent.expires_at} />
          <Badge variant="outline" className={cn("text-[10px] font-semibold uppercase tracking-wider", risk.color, risk.border)}>
            {risk.label} Risk
          </Badge>
        </div>
      </div>

      {/* Parameters */}
      {intent.parameters && Object.keys(intent.parameters).length > 0 && (
        <div className="rounded-lg bg-background/50 p-3 space-y-1">
          {Object.entries(intent.parameters).map(([key, value]) => (
            <div key={key} className="flex items-start gap-2 text-xs">
              <span className="text-muted-foreground font-mono min-w-[80px]">{key}:</span>
              <span className="text-foreground break-all">{String(value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Meta info */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
        {intent.principal_id && (
          <span>Proposed by: {intent.principal_id}</span>
        )}
        <span className="font-mono">{intent.intent_id.slice(0, 12)}...</span>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDeny(intent.intent_id)}
          disabled={isDenying || isApproving}
          className="flex-1 gap-1.5 text-red-400 border-red-500/20 hover:bg-red-500/10 hover:text-red-300"
        >
          {isDenying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <XCircle className="h-3.5 w-3.5" />
          )}
          Deny
        </Button>
        <Button
          size="sm"
          onClick={() => onApprove(intent.intent_id)}
          disabled={isApproving || isDenying}
          className="flex-1 gap-1.5"
        >
          {isApproving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          Approve
        </Button>
      </div>
    </div>
  );
}

/* ─── Main Approvals Page ────────────────────────────────────── */

export default function GatewayApprovals() {
  const { user, loading: gwLoading, isAuthenticated, logout } = useGatewayAuth();
  const [, navigate] = useLocation();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [denyingId, setDenyingId] = useState<string | null>(null);

  // Pending approvals state (fetched directly from Gateway)
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  // Inline receipt display — shown immediately after approval+execution
  const [lastReceipt, setLastReceipt] = useState<{
    intentId: string;
    receiptId?: string;
    status: string;
    toolName?: string;
    timestamp: string;
    receiptHash?: string;
    deliveryMode?: string;
  } | null>(null);

  // Fetch pending approvals directly from Gateway
  const fetchPending = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsFetching(true);
    try {
      const result = await getPendingApprovals();
      if (result.ok) {
        setPending(result.data.pending || []);
        setFetchError(null);
      } else if (result.status === 401 || result.status === 403) {
        setFetchError("Session expired — please login again via the home screen");
      } else {
        setFetchError(`Gateway returned ${result.status} — try refreshing or re-login`);
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Gateway unreachable");
    }
    setLoadingPending(false);
    setIsFetching(false);
  }, [isAuthenticated]);

  // Initial fetch + polling
  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 10000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  // Redirect if not authenticated (in useEffect, not during render)
  useEffect(() => {
    if (!gwLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [gwLoading, isAuthenticated, navigate]);

  // tRPC mutation: server-side approve → execute (as I-1) → deliver email
  const approveAndExecute = trpc.gateway.approveAndExecute.useMutation();

  async function handleApprove(intentId: string) {
    setApprovingId(intentId);
    try {
      // Single server-side call handles the full pipeline:
      //   1. Browser sends Gateway JWT (I-2/approver) for authorization
      //   2. Server calls Gateway /authorize with I-2 token
      //   3. Server calls Gateway /execute-action with I-1 JWT (proposer) — separation of duties
      //   4. Server delivers email via Telegram + notification
      //   5. Server logs to local ledger
      //   6. Returns receipt to browser
      toast.info("Approving and executing...");

      const result = await approveAndExecute.mutateAsync({
        intentId,
      });

      if (!result.success) {
        setLastReceipt({
          intentId,
          status: "FAILED",
          timestamp: new Date().toISOString(),
        });
        toast.error(result.error || "Approve + execute failed");
        fetchPending();
        setApprovingId(null);
        return;
      }

      // Show receipt
      setLastReceipt({
        intentId,
        receiptId: result.receipt?.receipt_id || "generated",
        status: result.status || "receipted",
        toolName: result.execution?.connector || "send_email",
        timestamp: result.receipt?.timestamp_executed || new Date().toISOString(),
        receiptHash: result.receipt?.receipt_hash,
        deliveryMode: result.deliveryMode,
      });

      // Show delivery status
      if (result.delivered) {
        const channels = [];
        if (result.channels?.notification) channels.push("notification");
        if (result.channels?.telegram) channels.push("Telegram");
        toast.success(`Executed + delivered via ${channels.join(" + ")}`, { duration: 4000 });
      } else {
        toast.success("Executed — receipt generated", { duration: 3000 });
      }

      fetchPending();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Approval failed";
      toast.error(msg);
    }
    setApprovingId(null);
  }

  async function handleDeny(intentId: string) {
    setDenyingId(intentId);
    try {
      // Step 1: Deny on Gateway
      const result = await submitApproval(intentId, "denied", "Denied by human via ONE");
      if (result.ok) {
        // Gateway deny is the only path — no parallel systems
        toast.success("Intent denied");
        fetchPending();
      } else {
        toast.error(result.data.error || "Denial failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Denial failed");
    }
    setDenyingId(null);
  }

  async function handleLogout() {
    logout();
    navigate("/");
  }

  if (gwLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render content if not authenticated (redirect is happening via useEffect)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/50">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">ONE</span>
          </div>
          <div className="flex-1" />
          <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/40">
            {user?.name || user?.sub || "unknown"}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-foreground gap-1.5"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Title + Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Approvals</h1>
              <p className="text-sm text-muted-foreground">Review and authorize actions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchPending()}
              disabled={isFetching}
              className="text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/intent/new")}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              New Action
            </Button>
          </div>
        </div>

        {/* Error state */}
        {fetchError && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-400 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Gateway Connection Issue</p>
              <p className="text-amber-400/80 mt-1">{fetchError}</p>
            </div>
          </div>
        )}

        {/* Pending approvals */}
        {loadingPending ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : pending.length > 0 ? (
          <div className="space-y-4">
            <p className="text-xs font-medium text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              {pending.length} Pending Approval{pending.length !== 1 ? "s" : ""}
            </p>
            {pending.map((intent) => (
              <ApprovalCard
                key={intent.intent_id}
                intent={intent}
                onApprove={handleApprove}
                onDeny={handleDeny}
                isApproving={approvingId === intent.intent_id}
                isDenying={denyingId === intent.intent_id}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border/40 bg-card p-12 text-center space-y-3">
            <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
              <Shield className="h-7 w-7 text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold">All Clear</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              No actions waiting for your approval. The Gateway will notify you when something needs attention.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/intent/new")}
              className="mt-4 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              New Action
            </Button>
          </div>
        )}

        {/* Inline Receipt — shown immediately after approval+execution */}
        {lastReceipt && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  {lastReceipt.status === "FAILED" ? (
                    <XCircle className="h-4 w-4 text-red-400" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {lastReceipt.status === "FAILED" ? "Execution Failed" : "Receipt Generated"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(lastReceipt.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLastReceipt(null)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                Dismiss
              </Button>
            </div>
            <div className="rounded-lg bg-background/50 p-3 space-y-1.5 text-xs">
              {lastReceipt.receiptId && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground font-mono min-w-[80px]">receipt:</span>
                  <span className="text-foreground font-mono break-all">{lastReceipt.receiptId}</span>
                </div>
              )}
              {lastReceipt.toolName && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground font-mono min-w-[80px]">action:</span>
                  <span className="text-foreground">{getActionDisplay(lastReceipt.toolName).label}</span>
                </div>
              )}
              <div className="flex gap-2">
                <span className="text-muted-foreground font-mono min-w-[80px]">status:</span>
                <Badge variant="outline" className={cn(
                  "text-[10px]",
                  lastReceipt.status === "FAILED" ? "text-red-400 border-red-500/20" : "text-emerald-400 border-emerald-500/20"
                )}>
                  {lastReceipt.status}
                </Badge>
              </div>
              {lastReceipt.receiptHash && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground font-mono min-w-[80px]">hash:</span>
                  <span className="text-foreground font-mono text-[10px] break-all">{lastReceipt.receiptHash}</span>
                </div>
              )}
              {lastReceipt.deliveryMode && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground font-mono min-w-[80px]">delivery:</span>
                  <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-500/20">
                    {lastReceipt.deliveryMode}
                  </Badge>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/receipts")}
                className="text-xs gap-1"
              >
                View All Receipts
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/ledger")}
                className="text-xs gap-1"
              >
                View Ledger
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-muted-foreground/30 text-center pt-4">
          Decision 2: Interface Is Not Authority — ONE displays, Gateway enforces.
        </p>
      </div>

      {/* Bottom nav */}
      <BottomNav />
      {/* Spacer for bottom nav */}
      <div className="h-20" />
    </div>
  );
}
