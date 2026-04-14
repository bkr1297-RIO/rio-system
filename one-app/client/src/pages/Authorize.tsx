/**
 * ONE — Minimum Viable Authorization Surface
 *
 * Three things only:
 * 1. System heartbeat (top bar) — Gateway online, last action, last receipt hash
 * 2. Proposal surface (center) — WHAT, RISK, consequences
 * 3. Authorization bar (bottom) — AUTHORIZE (green) + DECLINE (grey)
 *
 * No settings. No configuration. No logs visible. One choice.
 * Mobile-first. Works on phone browser.
 *
 * Decision 2: Interface Is Not Authority — ONE displays, Gateway enforces.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useGatewayAuth } from "@/hooks/useGatewayAuth";
import {
  getPendingApprovals,
  submitApproval,
  gatewayHealth,
  type PendingApproval,
  type GatewayHealth,
} from "@/lib/gateway";
import { trpc } from "@/lib/trpc";
import { Loader2, Shield, ShieldCheck, ShieldOff, LogOut } from "lucide-react";
import { toast } from "sonner";

/* ─── Helpers ──────────────────────────────────────────────── */

function timeAgo(ts?: string): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function describeAction(action: string, params?: Record<string, unknown>): string {
  const labels: Record<string, string> = {
    send_email: "Send an email",
    send_sms: "Send a text message",
    search_web: "Run a web search",
    deploy_service: "Deploy a service",
    transfer_funds: "Transfer funds",
    modify_policy: "Modify a policy",
  };
  const base = labels[action] || action.replace(/_/g, " ");
  if (action === "send_email" && params) {
    const to = params.to as string | undefined;
    const subject = params.subject as string | undefined;
    if (to && subject) return `Send email to ${to}: "${subject}"`;
    if (to) return `Send email to ${to}`;
  }
  return base;
}

function describeApproveConsequence(action: string, params?: Record<string, unknown>): string {
  if (action === "send_email") {
    const to = params?.to as string | undefined;
    const mode = params?.delivery_mode as string | undefined;
    return `Email will be sent${to ? ` to ${to}` : ""}${mode === "gmail" ? " via Gmail" : ""} and recorded on the ledger.`;
  }
  return "Action will execute through the Gateway and a receipt will be recorded.";
}

function describeDeclineConsequence(): string {
  return "Action will not execute. Dismissal will be logged. No side effects.";
}

const RISK_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  LOW: { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "LOW" },
  MEDIUM: { bg: "bg-amber-500/15", text: "text-amber-400", label: "MEDIUM" },
  HIGH: { bg: "bg-red-500/15", text: "text-red-400", label: "HIGH" },
  CRITICAL: { bg: "bg-red-600/20", text: "text-red-500", label: "CRITICAL" },
};

/* ─── Heartbeat Bar ────────────────────────────────────────── */

function HeartbeatBar({
  health,
  lastAction,
  lastReceiptHash,
  onLogout,
}: {
  health: GatewayHealth | null;
  lastAction: { description: string; timestamp: string } | null;
  lastReceiptHash: string | null;
  onLogout: () => void;
}) {
  const online = health?.status === "ok" || health?.status === "healthy";

  return (
    <div className="border-b border-border/30 bg-card/60 backdrop-blur-sm">
      <div className="max-w-lg mx-auto px-4 py-3">
        {/* Row 1: Gateway status + logout */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {online ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              )}
            </span>
            <span className={`text-xs font-medium ${online ? "text-emerald-400" : "text-red-400"}`}>
              Gateway {online ? "Online" : "Offline"}
            </span>
          </div>
          <button
            onClick={onLogout}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            aria-label="Logout"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Row 2: Last action + receipt hash */}
        <div className="space-y-0.5 text-[11px] text-muted-foreground/60">
          {lastAction ? (
            <p>
              Last action: <span className="text-muted-foreground">{lastAction.description}</span>{" "}
              <span className="text-muted-foreground/40">({timeAgo(lastAction.timestamp)})</span>
            </p>
          ) : (
            <p>No governed actions yet</p>
          )}
          {lastReceiptHash && (
            <p className="font-mono truncate">
              Receipt: <span className="text-muted-foreground/80">{lastReceiptHash.slice(0, 24)}...</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Proposal Surface ─────────────────────────────────────── */

function ProposalSurface({
  proposal,
}: {
  proposal: PendingApproval | null;
}) {
  if (!proposal) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-5">
          <Shield className="h-8 w-8 text-emerald-400/70" />
        </div>
        <p className="text-lg font-medium text-foreground/80">System ready.</p>
        <p className="text-sm text-muted-foreground mt-1">No pending proposals.</p>
      </div>
    );
  }

  const risk = RISK_STYLES[proposal.risk_tier || "MEDIUM"] || RISK_STYLES.MEDIUM;
  const description = describeAction(proposal.action, proposal.parameters);
  const approveConsequence = describeApproveConsequence(proposal.action, proposal.parameters);
  const declineConsequence = describeDeclineConsequence();

  return (
    <div className="flex-1 flex flex-col justify-center px-5 py-8">
      <div className="max-w-lg mx-auto w-full space-y-6">
        {/* WHAT — plain English, one sentence */}
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">
            Proposal
          </p>
          <p className="text-xl font-semibold leading-snug text-foreground">
            {description}
          </p>
        </div>

        {/* RISK — color coded */}
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${risk.bg} ${risk.text}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {risk.label} Risk
          </span>
          <span className="text-xs text-muted-foreground/50">
            {timeAgo(proposal.created_at)}
          </span>
        </div>

        {/* Parameters — compact display */}
        {proposal.parameters && Object.keys(proposal.parameters).length > 0 && (
          <div className="rounded-lg bg-background/60 border border-border/20 p-3.5 space-y-1.5">
            {Object.entries(proposal.parameters).map(([key, value]) => (
              <div key={key} className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground/50 font-mono min-w-[60px] shrink-0">{key}</span>
                <span className="text-foreground/80 break-all">{String(value)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Consequences */}
        <div className="space-y-3 pt-1">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="h-4 w-4 text-emerald-400/70 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/60 mb-0.5">
                If you authorize
              </p>
              <p className="text-xs text-foreground/70">{approveConsequence}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <ShieldOff className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40 mb-0.5">
                If you decline
              </p>
              <p className="text-xs text-foreground/50">{declineConsequence}</p>
            </div>
          </div>
        </div>

        {/* Intent ID — minimal */}
        <p className="text-[10px] font-mono text-muted-foreground/30 pt-2">
          {proposal.intent_id}
        </p>
      </div>
    </div>
  );
}

/* ─── Authorization Bar ────────────────────────────────────── */

function AuthorizationBar({
  hasProposal,
  isAuthorizing,
  isDeclining,
  onAuthorize,
  onDecline,
}: {
  hasProposal: boolean;
  isAuthorizing: boolean;
  isDeclining: boolean;
  onAuthorize: () => void;
  onDecline: () => void;
}) {
  if (!hasProposal) return null;

  return (
    <div className="border-t border-border/30 bg-card/60 backdrop-blur-sm">
      <div className="max-w-lg mx-auto px-4 py-4 flex gap-3">
        {/* DECLINE — grey */}
        <button
          onClick={onDecline}
          disabled={isDeclining || isAuthorizing}
          className="flex-1 h-14 rounded-xl bg-muted/50 hover:bg-muted/80 text-muted-foreground hover:text-foreground font-semibold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isDeclining ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            "DECLINE"
          )}
        </button>

        {/* AUTHORIZE — green */}
        <button
          onClick={onAuthorize}
          disabled={isAuthorizing || isDeclining}
          className="flex-[2] h-14 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30"
        >
          {isAuthorizing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <ShieldCheck className="h-5 w-5" />
              AUTHORIZE
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ─── Receipt Confirmation ─────────────────────────────────── */

function ReceiptConfirmation({
  receipt,
  onDismiss,
}: {
  receipt: {
    receiptId?: string;
    receiptHash?: string;
    action?: string;
    deliveryMode?: string;
    timestamp: string;
  };
  onDismiss: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 animate-in fade-in duration-500">
      <div className="h-16 w-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-5">
        <ShieldCheck className="h-8 w-8 text-emerald-400" />
      </div>
      <p className="text-lg font-semibold text-emerald-400 mb-1">Authorized</p>
      <p className="text-sm text-muted-foreground mb-6">
        Action executed and receipted.
      </p>

      <div className="w-full max-w-sm rounded-lg bg-background/60 border border-emerald-500/10 p-4 space-y-2 text-xs">
        {receipt.receiptId && (
          <div className="flex gap-2">
            <span className="text-muted-foreground/50 font-mono min-w-[60px]">receipt</span>
            <span className="text-foreground/70 font-mono break-all">{receipt.receiptId}</span>
          </div>
        )}
        {receipt.receiptHash && (
          <div className="flex gap-2">
            <span className="text-muted-foreground/50 font-mono min-w-[60px]">hash</span>
            <span className="text-foreground/70 font-mono break-all text-[10px]">{receipt.receiptHash}</span>
          </div>
        )}
        {receipt.deliveryMode && (
          <div className="flex gap-2">
            <span className="text-muted-foreground/50 font-mono min-w-[60px]">delivery</span>
            <span className="text-emerald-400/80">{receipt.deliveryMode}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="text-muted-foreground/50 font-mono min-w-[60px]">time</span>
          <span className="text-foreground/60">{new Date(receipt.timestamp).toLocaleString()}</span>
        </div>
      </div>

      <button
        onClick={onDismiss}
        className="mt-6 text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors"
      >
        Dismiss
      </button>
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────── */

export default function Authorize() {
  const { user, loading: gwLoading, isAuthenticated, logout } = useGatewayAuth();
  const [, navigate] = useLocation();

  // State
  const [health, setHealth] = useState<GatewayHealth | null>(null);
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{
    receiptId?: string;
    receiptHash?: string;
    action?: string;
    deliveryMode?: string;
    timestamp: string;
  } | null>(null);

  // Last action from Gateway ledger (for heartbeat)
  const [lastAction, setLastAction] = useState<{ description: string; timestamp: string } | null>(null);
  const [lastReceiptHash, setLastReceiptHash] = useState<string | null>(null);

  // tRPC mutation for approve+execute
  const approveAndExecute = trpc.gateway.approveAndExecute.useMutation();

  // Fetch Gateway health
  const fetchHealth = useCallback(async () => {
    try {
      const h = await gatewayHealth();
      setHealth(h);
    } catch {
      setHealth(null);
    }
  }, []);

  // Fetch pending approvals
  const fetchPending = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const result = await getPendingApprovals();
      if (result.ok) {
        setPending(result.data.pending || []);
      }
    } catch {
      // silent — heartbeat shows offline
    }
    setLoadingPending(false);
  }, [isAuthenticated]);

  // Fetch last action for heartbeat (from Gateway ledger via tRPC proxy)
  const ledgerQuery = trpc.gateway.ledger.useQuery({ limit: 1 }, {
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (ledgerQuery.data?.ok && ledgerQuery.data.entries?.length > 0) {
      const entry = ledgerQuery.data.entries[0] as Record<string, unknown>;
      setLastAction({
        description: (entry.action as string) || (entry.status as string) || "governed action",
        timestamp: (entry.timestamp as string) || new Date().toISOString(),
      });
      setLastReceiptHash((entry.receipt_hash as string) || (entry.ledger_hash as string) || null);
    }
  }, [ledgerQuery.data]);

  // Polling
  useEffect(() => {
    fetchHealth();
    fetchPending();
    const interval = setInterval(() => {
      fetchHealth();
      fetchPending();
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchHealth, fetchPending]);

  // Auth redirect
  useEffect(() => {
    if (!gwLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [gwLoading, isAuthenticated, navigate]);

  // Current proposal (first pending)
  const proposal = useMemo(() => pending[0] || null, [pending]);

  // Handlers
  async function handleAuthorize() {
    if (!proposal) return;
    setIsAuthorizing(true);
    try {
      toast.info("Authorizing...");
      const result = await approveAndExecute.mutateAsync({
        intentId: proposal.intent_id,
      });

      if (!result.success) {
        toast.error(result.error || "Authorization failed");
        setIsAuthorizing(false);
        return;
      }

      setLastReceipt({
        receiptId: result.receipt?.receipt_id,
        receiptHash: result.receipt?.receipt_hash,
        action: proposal.action,
        deliveryMode: result.deliveryMode,
        timestamp: result.receipt?.timestamp_executed || new Date().toISOString(),
      });

      // Update heartbeat
      setLastAction({
        description: describeAction(proposal.action, proposal.parameters),
        timestamp: new Date().toISOString(),
      });
      if (result.receipt?.receipt_hash) {
        setLastReceiptHash(result.receipt.receipt_hash);
      }

      toast.success("Authorized and executed");
      fetchPending();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authorization failed");
    }
    setIsAuthorizing(false);
  }

  async function handleDecline() {
    if (!proposal) return;
    setIsDeclining(true);
    try {
      const result = await submitApproval(proposal.intent_id, "denied", "Declined by human via ONE");
      if (result.ok) {
        toast.info("Declined — no action taken");
        fetchPending();
      } else {
        toast.error("Decline failed");
      }
    } catch {
      toast.error("Decline failed");
    }
    setIsDeclining(false);
  }

  function handleLogout() {
    logout();
    navigate("/");
  }

  // Loading state
  if (gwLoading || (loadingPending && isAuthenticated)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 1. System heartbeat (top bar) */}
      <HeartbeatBar
        health={health}
        lastAction={lastAction}
        lastReceiptHash={lastReceiptHash}
        onLogout={handleLogout}
      />

      {/* 2. Proposal surface (center) */}
      {lastReceipt ? (
        <ReceiptConfirmation
          receipt={lastReceipt}
          onDismiss={() => setLastReceipt(null)}
        />
      ) : (
        <ProposalSurface proposal={proposal} />
      )}

      {/* 3. Authorization bar (bottom) — two buttons, nothing else */}
      {!lastReceipt && (
        <AuthorizationBar
          hasProposal={!!proposal}
          isAuthorizing={isAuthorizing}
          isDeclining={isDeclining}
          onAuthorize={handleAuthorize}
          onDecline={handleDecline}
        />
      )}

      {/* Pending count indicator — subtle, only if multiple */}
      {pending.length > 1 && !lastReceipt && (
        <div className="text-center py-2 text-[10px] text-muted-foreground/30">
          {pending.length - 1} more pending
        </div>
      )}
    </div>
  );
}
