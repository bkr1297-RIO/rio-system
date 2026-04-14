/**
 * RIO Governance Dashboard — CBS Section 11
 * ───────────────────────────────────────────
 * Four panels:
 *   1. Last 10 Actions (from Drive ledger via rio.history)
 *   2. System State (from rio.health — chain integrity, uptime, errors)
 *   3. Approval Queue (from rio.pendingApprovals)
 *   4. Action Trace (from rio.lastAction — full receipt detail)
 *
 * All data comes from the rio.* tRPC endpoints.
 * This is a read-only observation surface — no execution authority.
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import BottomNav from "@/components/BottomNav";
import {
  Activity,
  RefreshCw,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCheck,
  Eye,
  ChevronDown,
  ChevronUp,
  Inbox,
  Zap,
  Hash,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ─── Helpers ──────────────────────────────────────────────── */

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-red-400" />
      )}
      <span className={`text-xs font-semibold ${ok ? "text-emerald-400" : "text-red-400"}`}>
        {label}
      </span>
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <h2 className="text-sm font-bold uppercase tracking-wider text-foreground/80 flex-1">
        {title}
      </h2>
      {badge}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  color,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-medium ${mono ? "font-mono" : ""} ${color || ""}`}>
        {value}
      </span>
    </div>
  );
}

function timeAgo(ts: string | number): string {
  const now = Date.now();
  const then = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const diff = now - then;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function riskBadge(level: string) {
  const colors: Record<string, string> = {
    low: "bg-emerald-500/15 text-emerald-400",
    medium: "bg-amber-500/15 text-amber-400",
    high: "bg-red-500/15 text-red-400",
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
        colors[level] || "bg-muted text-muted-foreground"
      }`}
    >
      {level}
    </span>
  );
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    PENDING: "bg-amber-500/15 text-amber-400",
    APPROVED: "bg-emerald-500/15 text-emerald-400",
    REJECTED: "bg-red-500/15 text-red-400",
    EXPIRED: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
        colors[status] || "bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}

/* ─── Component ────────────────────────────────────────────── */

export default function RIODashboard() {
  const [, navigate] = useLocation();
  const [expandedAction, setExpandedAction] = useState<string | null>(null);

  // tRPC queries — all from rio.* endpoints
  const healthQ = trpc.rio.health.useQuery(undefined, { refetchInterval: 15_000 });
  const historyQ = trpc.rio.history.useQuery({ limit: 10, offset: 0 }, { refetchInterval: 10_000 });
  const lastActionQ = trpc.rio.lastAction.useQuery(undefined, { refetchInterval: 10_000 });
  const pendingQ = trpc.rio.pendingApprovals.useQuery(undefined, { refetchInterval: 5_000 });
  const allApprovalsQ = trpc.rio.allApprovals.useQuery({ limit: 10 }, { refetchInterval: 10_000 });

  const loading = healthQ.isLoading || historyQ.isLoading;

  const refetchAll = () => {
    healthQ.refetch();
    historyQ.refetch();
    lastActionQ.refetch();
    pendingQ.refetch();
    allApprovalsQ.refetch();
  };

  const health = healthQ.data;
  const history = historyQ.data;
  const lastAction = lastActionQ.data;
  const pending = pendingQ.data ?? [];
  const allApprovals = allApprovalsQ.data ?? [];

  // Derive system status color
  const sysStatus = health?.system_status ?? "unknown";
  const sysColor =
    sysStatus === "ACTIVE"
      ? "text-emerald-400"
      : sysStatus === "DEGRADED"
      ? "text-amber-400"
      : sysStatus === "BLOCKED"
      ? "text-red-400"
      : "text-muted-foreground";

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              RIO Dashboard
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Canonical Build Spec v1.0 — Observation Surface
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refetchAll} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="space-y-4">
          {/* ─── Panel 1: System State (CBS Section 13) ────────── */}
          <div className="rounded-xl border border-border/40 bg-card/50 p-4">
            <PanelHeader icon={Activity} title="System State" />
            <Row
              label="System Status"
              value={
                <span className={`font-bold uppercase ${sysColor}`}>{sysStatus}</span>
              }
            />
            <Row
              label="Chain Integrity"
              value={
                <StatusBadge
                  ok={health?.chain_integrity === true}
                  label={health?.chain_integrity ? "VALID" : "INVALID"}
                />
              }
            />
            <Row
              label="Last Action"
              value={
                health?.last_action_timestamp
                  ? timeAgo(health.last_action_timestamp)
                  : "None"
              }
            />
            <Row
              label="Active Cooldowns"
              value={health?.active_cooldowns ?? 0}
            />
            <Row
              label="Active Sessions"
              value={health?.active_sessions ?? 0}
            />
            <Row
              label="Uptime"
              value={
                health?.uptime_ms
                  ? `${Math.floor(health.uptime_ms / 60_000)}m`
                  : "—"
              }
            />
            {health?.last_error && (
              <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-2">
                <div className="text-[10px] uppercase tracking-wider text-red-400 mb-1">Last Error</div>
                <div className="text-xs text-red-300 font-mono break-all">{health.last_error}</div>
              </div>
            )}
          </div>

          {/* ─── Panel 2: Approval Queue (CBS Section 10) ──────── */}
          <div className="rounded-xl border border-border/40 bg-card/50 p-4">
            <PanelHeader
              icon={Shield}
              title="Approval Queue"
              badge={
                pending.length > 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold">
                    {pending.length} pending
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
                    Clear
                  </span>
                )
              }
            />
            {pending.length === 0 ? (
              <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
                <Inbox className="h-4 w-4" />
                <span className="text-xs">No pending approvals</span>
              </div>
            ) : (
              <div className="space-y-2">
                {pending.map((a: any) => (
                  <div
                    key={a.approval_id}
                    className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold">{a.intent_type}</span>
                      {riskBadge(a.risk_level)}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>
                        Resource: <span className="font-mono">{a.resource_id}</span>
                      </span>
                      <span>{timeAgo(a.requested_at)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                      <span>
                        Proposer: <span className="font-mono">{a.proposer_id}</span>
                      </span>
                      <span className="font-mono text-[9px]">{a.approval_id.slice(0, 12)}...</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent approval history */}
            {allApprovals.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/20">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Recent Decisions
                </div>
                <div className="space-y-1">
                  {allApprovals.map((a: any) => (
                    <div
                      key={a.approval_id}
                      className="flex items-center justify-between text-[10px] py-1"
                    >
                      <span className="font-mono text-muted-foreground">
                        {a.action_id?.slice(0, 12) || a.approval_id.slice(0, 12)}...
                      </span>
                      <div className="flex items-center gap-2">
                        {statusBadge(a.status)}
                        {a.resolved_at && (
                          <span className="text-muted-foreground">{timeAgo(a.resolved_at)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ─── Panel 3: Last 10 Actions (CBS Section 11) ─────── */}
          <div className="rounded-xl border border-border/40 bg-card/50 p-4">
            <PanelHeader
              icon={FileCheck}
              title="Recent Actions"
              badge={
                <span className="text-[10px] text-muted-foreground">
                  {history?.total ?? 0} total
                </span>
              }
            />
            {!history?.entries || history.entries.length === 0 ? (
              <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
                <Inbox className="h-4 w-4" />
                <span className="text-xs">No actions recorded</span>
              </div>
            ) : (
              <div className="space-y-1">
                {history.entries.map((entry: any, i: number) => {
                  const isExpanded = expandedAction === (entry.receipt_hash || `idx-${i}`);
                  const key = entry.receipt_hash || `idx-${i}`;
                  return (
                    <div key={key}>
                      <button
                        onClick={() => setExpandedAction(isExpanded ? null : key)}
                        className="w-full flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-muted/30 transition-colors text-left"
                      >
                        <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                          <Zap className="h-3 w-3 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">
                            {entry.decision || entry.entryType || "Action"}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {entry.receipt_hash
                              ? `${entry.receipt_hash.slice(0, 16)}...`
                              : "No hash"}
                          </div>
                        </div>
                        <div className="text-[10px] text-muted-foreground shrink-0">
                          {entry.timestamp ? timeAgo(entry.timestamp) : "—"}
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                      </button>
                      {isExpanded && (
                        <div className="ml-7 mb-2 rounded-lg border border-border/20 bg-background/50 p-3 text-[10px] space-y-1">
                          {entry.receipt_hash && (
                            <div className="flex gap-1">
                              <Hash className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                              <span className="font-mono break-all text-muted-foreground">
                                {entry.receipt_hash}
                              </span>
                            </div>
                          )}
                          {entry.previous_receipt_hash && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <ArrowRight className="h-3 w-3 shrink-0" />
                              <span className="font-mono break-all">
                                prev: {entry.previous_receipt_hash.slice(0, 24)}...
                              </span>
                            </div>
                          )}
                          {entry.proposer_id && (
                            <Row label="Proposer" value={entry.proposer_id} mono />
                          )}
                          {entry.approver_id && (
                            <Row label="Approver" value={entry.approver_id} mono />
                          )}
                          {entry.decision && <Row label="Decision" value={entry.decision} />}
                          {entry.snapshot_hash && (
                            <Row
                              label="Snapshot"
                              value={`${entry.snapshot_hash.slice(0, 16)}...`}
                              mono
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── Panel 4: Action Trace (CBS Section 11) ────────── */}
          <div className="rounded-xl border border-border/40 bg-card/50 p-4">
            <PanelHeader icon={Clock} title="Last Action Trace" />
            {!lastAction ? (
              <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
                <Inbox className="h-4 w-4" />
                <span className="text-xs">No actions recorded yet</span>
              </div>
            ) : (
              <div className="space-y-1">
                <Row label="Receipt Hash" value={
                  <span className="font-mono text-[10px]">
                    {lastAction.receipt_hash
                      ? `${lastAction.receipt_hash.slice(0, 20)}...`
                      : "—"}
                  </span>
                } />
                <Row label="Previous Hash" value={
                  <span className="font-mono text-[10px]">
                    {lastAction.previous_receipt_hash
                      ? `${lastAction.previous_receipt_hash.slice(0, 20)}...`
                      : "—"}
                  </span>
                } />
                <Row label="Proposer" value={lastAction.proposer_id || "—"} mono />
                <Row label="Approver" value={lastAction.approver_id || "—"} mono />
                <Row label="Decision" value={lastAction.decision || "—"} />
                <Row label="Receipt ID" value={
                  <span className="font-mono text-[10px]">
                    {lastAction.receipt_id
                      ? `${lastAction.receipt_id.slice(0, 20)}...`
                      : "—"}
                  </span>
                } />
                <Row
                  label="Timestamp"
                  value={
                    lastAction.timestamp
                      ? `${new Date(lastAction.timestamp).toLocaleString()} (${timeAgo(lastAction.timestamp)})`
                      : "—"
                  }
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
