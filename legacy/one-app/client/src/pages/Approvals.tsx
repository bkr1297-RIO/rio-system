import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocalStore } from "@/hooks/useLocalStore";
import { signData } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Loader2, ShieldCheck, Mail, MessageSquare, Search,
  FileText, FileEdit, Zap, XCircle, CheckCircle2,
  AlertTriangle, Clock, ChevronRight, Shield, CheckSquare, Square, Timer
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useState, useMemo, useCallback } from "react";

/* ─── Tool display helpers ────────────────────────────────── */

const TOOL_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  send_email: { label: "Send Email", icon: Mail, color: "text-blue-400 bg-blue-500/10" },
  send_sms: { label: "Send Text", icon: MessageSquare, color: "text-violet-400 bg-violet-500/10" },
  search_web: { label: "Web Search", icon: Search, color: "text-emerald-400 bg-emerald-500/10" },
  read_file: { label: "Read File", icon: FileText, color: "text-slate-400 bg-slate-500/10" },
  write_file: { label: "Write File", icon: FileEdit, color: "text-amber-400 bg-amber-500/10" },
  delete_file: { label: "Delete File", icon: XCircle, color: "text-red-400 bg-red-500/10" },
  execute_code: { label: "Run Code", icon: Zap, color: "text-orange-400 bg-orange-500/10" },
  transfer_funds: { label: "Transfer Funds", icon: Zap, color: "text-red-400 bg-red-500/10" },
  draft_email: { label: "Draft Email", icon: FileText, color: "text-blue-400 bg-blue-500/10" },
  echo: { label: "Test Action", icon: Zap, color: "text-slate-400 bg-slate-500/10" },
};

const RISK_CONFIG: Record<string, { label: string; color: string; border: string }> = {
  LOW: { label: "Low", color: "text-emerald-400", border: "border-emerald-500/20" },
  MEDIUM: { label: "Medium", color: "text-amber-400", border: "border-amber-500/20" },
  HIGH: { label: "High", color: "text-red-400", border: "border-red-500/20" },
};

/* ─── TTL Display ────────────────────────────────────────── */

function TtlBadge({ expiresAt }: { expiresAt: number | null | undefined }) {
  if (!expiresAt) return null;
  const remaining = Number(expiresAt) - Date.now();
  if (remaining <= 0) {
    return (
      <Badge variant="outline" className="text-[10px] text-red-400 border-red-500/20 gap-1">
        <Timer className="h-3 w-3" /> Expired
      </Badge>
    );
  }
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  const label = hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
  const isUrgent = remaining < 3600000; // less than 1h
  return (
    <Badge variant="outline" className={cn(
      "text-[10px] gap-1",
      isUrgent ? "text-amber-400 border-amber-500/20" : "text-muted-foreground border-border/40"
    )}>
      <Timer className="h-3 w-3" /> {label}
    </Badge>
  );
}

/* ─── Approval Card (with selection checkbox) ────────────── */

function ApprovalCard({ intent, onApprove, onDeny, isApproving, isDenying, selected, onToggleSelect, batchMode }: {
  intent: {
    intentId: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
    riskTier: string;
    reasoning?: string;
    breakAnalysis?: string;
    createdAt: number;
    agentId?: string;
    expiresAt?: number | null;
  };
  onApprove: (intentId: string) => void;
  onDeny: (intentId: string) => void;
  isApproving: boolean;
  isDenying: boolean;
  selected: boolean;
  onToggleSelect: (intentId: string) => void;
  batchMode: boolean;
}) {
  const tool = TOOL_META[intent.toolName] ?? { label: intent.toolName, icon: Zap, color: "text-slate-400 bg-slate-500/10" };
  const risk = RISK_CONFIG[intent.riskTier] ?? RISK_CONFIG.MEDIUM;
  const ToolIcon = tool.icon;
  const timeAgo = getTimeAgo(intent.createdAt);

  return (
    <div className={cn(
      "rounded-xl border bg-card p-5 space-y-4 transition-all",
      risk.border,
      selected && "ring-2 ring-primary/50"
    )}>
      {/* Header: Checkbox + Tool + Risk + TTL */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {batchMode && (
            <button
              onClick={() => onToggleSelect(intent.intentId)}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              {selected ? <CheckSquare className="h-5 w-5 text-primary" /> : <Square className="h-5 w-5" />}
            </button>
          )}
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", tool.color)}>
            <ToolIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{tool.label}</h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Clock className="h-3 w-3" />
              {timeAgo}
              {intent.agentId && (
                <span className="text-muted-foreground/60">via {intent.agentId}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TtlBadge expiresAt={intent.expiresAt} />
          <Badge variant="outline" className={cn("text-[10px] font-semibold uppercase tracking-wider", risk.color, risk.border)}>
            {risk.label} Risk
          </Badge>
        </div>
      </div>

      {/* Action details */}
      <div className="rounded-lg bg-secondary/50 p-3.5 space-y-2">
        <ArgsPreview toolName={intent.toolName} args={intent.toolArgs} />
      </div>

      {/* Why it needs approval */}
      {intent.reasoning && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Why this needs approval</p>
          <p className="text-sm text-foreground/80 leading-relaxed">{intent.reasoning}</p>
        </div>
      )}

      {/* Break analysis */}
      {intent.breakAnalysis && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-amber-400/80 uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Risk Analysis
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">{intent.breakAnalysis}</p>
        </div>
      )}

      {/* Approve / Deny buttons (hidden in batch mode when selected) */}
      {!batchMode && (
        <div className="flex gap-3 pt-1">
          <Button
            onClick={() => onApprove(intent.intentId)}
            disabled={isApproving || isDenying}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium gap-2"
          >
            {isApproving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Approve
          </Button>
          <Button
            onClick={() => onDeny(intent.intentId)}
            disabled={isApproving || isDenying}
            variant="outline"
            className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 font-medium gap-2"
          >
            {isDenying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Deny
          </Button>
        </div>
      )}
    </div>
  );
}

/* ─── Args Preview ────────────────────────────────────────── */

function ArgsPreview({ toolName, args }: { toolName: string; args: Record<string, unknown> }) {
  if (toolName === "send_email" || toolName === "send_sms" || toolName === "draft_email") {
    return (
      <div className="space-y-1.5 text-sm">
        {args.to ? <div><span className="text-muted-foreground text-xs">To:</span> <span className="font-medium">{String(args.to)}</span></div> : null}
        {args.subject ? <div><span className="text-muted-foreground text-xs">Subject:</span> <span className="font-medium">{String(args.subject)}</span></div> : null}
        {(args.body || args.message) ? (
          <div className="mt-1 text-foreground/70 text-xs bg-background/50 rounded-lg p-2.5 whitespace-pre-wrap line-clamp-4">
            {String(args.body || args.message)}
          </div>
        ) : null}
      </div>
    );
  }
  if (toolName === "search_web") {
    return <div className="text-sm"><span className="text-muted-foreground text-xs">Query:</span> <span className="font-medium">{String(args.query || args.q || "")}</span></div>;
  }
  const entries = Object.entries(args).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">No parameters</p>;
  return (
    <div className="space-y-1 text-sm">
      {entries.slice(0, 4).map(([k, v]) => (
        <div key={k}><span className="text-muted-foreground text-xs capitalize">{k.replace(/_/g, " ")}:</span> <span className="font-medium">{String(v)}</span></div>
      ))}
      {entries.length > 4 && <p className="text-xs text-muted-foreground">+{entries.length - 4} more</p>}
    </div>
  );
}

/* ─── Time helper ─────────────────────────────────────────── */

function getTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

/* ─── Main Approvals Page ─────────────────────────────────── */

export default function Approvals() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { data: status, isLoading } = trpc.proxy.status.useQuery(undefined, { enabled: isAuthenticated });
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const { keys } = useLocalStore();
  const utils = trpc.useUtils();

  const approveMutation = trpc.proxy.approve.useMutation({
    onSuccess: () => {
      toast.success("Action approved");
      utils.proxy.status.invalidate();
      setApprovingId(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setApprovingId(null);
    },
  });

  const rejectMutation = trpc.proxy.approve.useMutation({
    onSuccess: () => {
      toast.success("Action denied");
      utils.proxy.status.invalidate();
      setDenyingId(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setDenyingId(null);
    },
  });

  const batchApproveMutation = trpc.proxy.batchApprove.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.processed} action${data.processed !== 1 ? "s" : ""} approved`);
      utils.proxy.status.invalidate();
      setSelectedIds(new Set());
      setBatchMode(false);
      setBatchProcessing(false);
    },
    onError: (err) => {
      toast.error(err.message);
      setBatchProcessing(false);
    },
  });

  const batchRejectMutation = trpc.proxy.batchApprove.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.processed} action${data.processed !== 1 ? "s" : ""} denied`);
      utils.proxy.status.invalidate();
      setSelectedIds(new Set());
      setBatchMode(false);
      setBatchProcessing(false);
    },
    onError: (err) => {
      toast.error(err.message);
      setBatchProcessing(false);
    },
  });

  const pendingIntents = useMemo(() => {
    if (!status?.recentIntents) return [];
    return status.recentIntents.filter((i) => i.status === "PENDING_APPROVAL");
  }, [status?.recentIntents]);

  const recentlyApproved = useMemo(() => {
    if (!status?.recentIntents) return [];
    return status.recentIntents
      .filter((i) => i.status === "APPROVED" || i.status === "EXECUTED")
      .slice(0, 5);
  }, [status?.recentIntents]);

  const expiredIntents = useMemo(() => {
    if (!status?.recentIntents) return [];
    return status.recentIntents.filter((i) => i.status === "EXPIRED");
  }, [status?.recentIntents]);

  const toggleSelect = useCallback((intentId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(intentId)) next.delete(intentId);
      else next.add(intentId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(pendingIntents.map(i => i.intentId)));
  }, [pendingIntents]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  async function handleApprove(intentId: string) {
    setApprovingId(intentId);
    try {
      const signature = keys?.privateKey
        ? await signData(keys.privateKey, JSON.stringify({ intentId, action: "APPROVE", timestamp: Date.now() }))
        : "unsigned-approval";
      approveMutation.mutate({ intentId, decision: "APPROVED" as const, signature });
    } catch {
      approveMutation.mutate({ intentId, decision: "APPROVED" as const, signature: "unsigned-approval" });
    }
  }

  function handleDeny(intentId: string) {
    setDenyingId(intentId);
    rejectMutation.mutate({ intentId, decision: "REJECTED" as const, signature: "user-rejection" });
  }

  async function handleBatchApprove() {
    if (selectedIds.size === 0) return;
    setBatchProcessing(true);
    try {
      const signature = keys?.privateKey
        ? await signData(keys.privateKey, JSON.stringify({ action: "BATCH_APPROVE", count: selectedIds.size, timestamp: Date.now() }))
        : "unsigned-batch-approval";
      batchApproveMutation.mutate({
        intentIds: Array.from(selectedIds),
        decision: "APPROVED",
        signature,
      });
    } catch {
      batchApproveMutation.mutate({
        intentIds: Array.from(selectedIds),
        decision: "APPROVED",
        signature: "unsigned-batch-approval",
      });
    }
  }

  async function handleBatchReject() {
    if (selectedIds.size === 0) return;
    setBatchProcessing(true);
    batchRejectMutation.mutate({
      intentIds: Array.from(selectedIds),
      decision: "REJECTED",
      signature: "batch-rejection",
    });
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
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
        {/* Batch mode toggle */}
        {pendingIntents.length > 1 && (
          <Button
            variant={batchMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setBatchMode(!batchMode);
              setSelectedIds(new Set());
            }}
            className="font-mono text-xs gap-1.5"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {batchMode ? "Exit Batch" : "Batch Mode"}
          </Button>
        )}
      </div>

      {/* Batch action bar */}
      {batchMode && pendingIntents.length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {selectedIds.size} of {pendingIntents.length} selected
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7">
                Select All
              </Button>
              <Button variant="ghost" size="sm" onClick={deselectAll} className="text-xs h-7">
                Clear
              </Button>
            </div>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex gap-3">
              <Button
                onClick={handleBatchApprove}
                disabled={batchProcessing}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium gap-2"
              >
                {batchProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve {selectedIds.size}
              </Button>
              <Button
                onClick={handleBatchReject}
                disabled={batchProcessing}
                variant="outline"
                className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 font-medium gap-2"
              >
                {batchProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Deny {selectedIds.size}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Pending approvals */}
      {pendingIntents.length > 0 ? (
        <div className="space-y-4">
          <p className="text-xs font-medium text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            {pendingIntents.length} Pending Approval{pendingIntents.length !== 1 ? "s" : ""}
          </p>
          {pendingIntents.map((intent) => (
            <ApprovalCard
              key={intent.intentId}
              intent={intent as any}
              onApprove={handleApprove}
              onDeny={handleDeny}
              isApproving={approvingId === intent.intentId}
              isDenying={denyingId === intent.intentId}
              selected={selectedIds.has(intent.intentId)}
              onToggleSelect={toggleSelect}
              batchMode={batchMode}
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
            No actions waiting for your approval. Bondi will notify you when something needs your attention.
          </p>
        </div>
      )}

      {/* Expired intents */}
      {expiredIntents.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-red-400/80 uppercase tracking-wider flex items-center gap-1.5">
            <Timer className="h-3 w-3" />
            {expiredIntents.length} Expired
          </p>
          {expiredIntents.map((intent) => {
            const tool = TOOL_META[intent.toolName] ?? { label: intent.toolName, icon: Zap, color: "text-slate-400 bg-slate-500/10" };
            const ToolIcon = tool.icon;
            return (
              <Link key={intent.intentId} href={`/intent/${intent.intentId}`}>
                <div className="flex items-center gap-3 p-3.5 rounded-xl border border-red-500/10 bg-red-500/5 hover:bg-red-500/10 transition-colors group cursor-pointer opacity-60">
                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", tool.color)}>
                    <ToolIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tool.label}</p>
                    <p className="text-xs text-muted-foreground">{getTimeAgo(intent.createdAt instanceof Date ? intent.createdAt.getTime() : Number(intent.createdAt))}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-red-400 border-red-500/20">
                    Expired
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Recently approved/executed */}
      {recentlyApproved.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recently Processed</p>
          {recentlyApproved.map((intent) => {
            const tool = TOOL_META[intent.toolName] ?? { label: intent.toolName, icon: Zap, color: "text-slate-400 bg-slate-500/10" };
            const ToolIcon = tool.icon;
            return (
              <Link key={intent.intentId} href={`/intent/${intent.intentId}`}>
                <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border/30 bg-card/50 hover:bg-card transition-colors group cursor-pointer">
                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", tool.color)}>
                    <ToolIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tool.label}</p>
                    <p className="text-xs text-muted-foreground">{getTimeAgo(intent.createdAt instanceof Date ? intent.createdAt.getTime() : Number(intent.createdAt))}</p>
                  </div>
                  <Badge variant="outline" className={cn(
                    "text-[10px]",
                    intent.status === "EXECUTED" ? "text-emerald-400 border-emerald-500/20" : "text-blue-400 border-blue-500/20"
                  )}>
                    {intent.status === "EXECUTED" ? "Done" : "Approved"}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
