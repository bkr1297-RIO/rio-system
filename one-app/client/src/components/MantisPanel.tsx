/**
 * MANTIS Integrity Panel — Claude Condition 3
 *
 * Displays integrity sweep output from the MANTIS observer layer.
 * Source of truth: bkr1297-RIO/rio-system/sweeps/*.json + STATUS.json
 * NOT agent self-report.
 *
 * Read-only. No writes to governance artifacts.
 */
import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  GitBranch,
  FileCheck,
  Clock,
  Eye,
  ChevronDown,
  ChevronUp,
  Users,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ─── Status helpers ─────────────────────────────────────── */

function OverallBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    PASS: {
      label: "ALL CLEAR",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10 border-emerald-500/20",
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
    },
    WARN: {
      label: "WARNING",
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
      icon: <AlertTriangle className="h-4 w-4 text-amber-400" />,
    },
    FAIL: {
      label: "INTEGRITY BREACH",
      color: "text-red-400",
      bg: "bg-red-500/10 border-red-500/20",
      icon: <XCircle className="h-4 w-4 text-red-400" />,
    },
    UNKNOWN: {
      label: "NO DATA",
      color: "text-muted-foreground",
      bg: "bg-muted/30 border-border/30",
      icon: <Eye className="h-4 w-4 text-muted-foreground" />,
    },
  };

  const c = config[status] || config.UNKNOWN;

  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border", c.bg)}>
      {c.icon}
      <span className={cn("text-xs font-bold uppercase tracking-wider", c.color)}>
        {c.label}
      </span>
    </div>
  );
}

function ArtifactStatusDot({ status }: { status: string }) {
  if (status === "VERIFIED") return <CheckCircle2 className="h-3 w-3 text-emerald-400" />;
  if (status === "RECORDED") return <CheckCircle2 className="h-3 w-3 text-blue-400" />;
  if (status === "MISSING") return <XCircle className="h-3 w-3 text-red-400" />;
  if (status === "MISMATCH") return <XCircle className="h-3 w-3 text-red-400" />;
  return <AlertTriangle className="h-3 w-3 text-muted-foreground" />;
}

function CriticalityBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    CRITICAL: "text-red-400 bg-red-500/10",
    HIGH: "text-amber-400 bg-amber-500/10",
    MEDIUM: "text-blue-400 bg-blue-500/10",
    LOW: "text-muted-foreground bg-muted/30",
  };
  return (
    <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded", colors[level] || colors.LOW)}>
      {level}
    </span>
  );
}

function Row({ label, value, mono, color }: { label: string; value: React.ReactNode; mono?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-medium", mono && "font-mono", color)}>
        {value}
      </span>
    </div>
  );
}

function PanelHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <h2 className="text-sm font-bold uppercase tracking-wider text-foreground/80">{title}</h2>
    </div>
  );
}

/* ─── Time formatting ────────────────────────────────────── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ─── Main Component ─────────────────────────────────────── */

export default function MantisPanel() {
  const { data, isLoading, refetch, isFetching } = trpc.mantis.integrity.useQuery(undefined, {
    staleTime: 60_000, // Cache for 1 minute
    refetchInterval: 120_000, // Auto-refresh every 2 minutes
  });

  const [showArtifacts, setShowArtifacts] = useState(false);
  const [showCommits, setShowCommits] = useState(false);
  const [showAgents, setShowAgents] = useState(false);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/50 p-4">
        <PanelHeader icon={Eye} title="MANTIS Observer" />
        <div className="flex items-center justify-center py-6">
          <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
          <span className="text-xs text-muted-foreground ml-2">Loading integrity data...</span>
        </div>
      </div>
    );
  }

  if (!data?.ok || !data?.data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <PanelHeader icon={Eye} title="MANTIS Observer" />
        <div className="text-xs text-red-400 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          {data?.error || "Could not load MANTIS integrity data"}
        </div>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  const m = data.data;

  return (
    <div className="space-y-4">
      {/* ─── MANTIS Integrity Overview ──────────────────────── */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <PanelHeader icon={Eye} title="MANTIS Observer" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-7 w-7 p-0"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          </Button>
        </div>

        {/* Overall status badge */}
        <div className="flex items-center justify-between mb-4">
          <OverallBadge status={m.overallStatus} />
          {m.sweepTimestamp && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(m.sweepTimestamp)}
            </span>
          )}
        </div>

        {/* Sweep summary */}
        <Row label="Sweep Version" value={m.sweepVersion || "—"} mono />
        <Row label="Completed By" value={m.sweepBy || "—"} />
        <Row
          label="Git State"
          value={
            <span className="flex items-center gap-1.5">
              <GitBranch className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-[10px]">{m.gitBranch || "—"}</span>
              {m.gitCommit && (
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  @{m.gitCommit.slice(0, 7)}
                </span>
              )}
              {m.gitDirty && (
                <span className="text-[9px] text-amber-400 font-bold">DIRTY</span>
              )}
            </span>
          }
        />
        <Row label="Violations" value={m.violations} color={m.violations > 0 ? "text-red-400 font-bold" : "text-emerald-400"} />

        {/* Artifact summary counts */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <div className="rounded-lg border border-border/20 bg-background/50 p-2 text-center">
            <div className="text-lg font-bold text-foreground">{m.totalArtifacts}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Total</div>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-center">
            <div className="text-lg font-bold text-emerald-400">{m.verifiedArtifacts}</div>
            <div className="text-[9px] text-emerald-400/70 uppercase">Verified</div>
          </div>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2 text-center">
            <div className="text-lg font-bold text-blue-400">{m.recordedArtifacts}</div>
            <div className="text-[9px] text-blue-400/70 uppercase">Recorded</div>
          </div>
          <div className={cn(
            "rounded-lg border p-2 text-center",
            (m.missingArtifacts + m.mismatchArtifacts) > 0
              ? "border-red-500/20 bg-red-500/5"
              : "border-border/20 bg-background/50"
          )}>
            <div className={cn(
              "text-lg font-bold",
              (m.missingArtifacts + m.mismatchArtifacts) > 0 ? "text-red-400" : "text-muted-foreground"
            )}>
              {m.missingArtifacts + m.mismatchArtifacts}
            </div>
            <div className="text-[9px] text-muted-foreground uppercase">Issues</div>
          </div>
        </div>
      </div>

      {/* ─── Governance Artifacts (expandable) ─────────────── */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-4">
        <button
          onClick={() => setShowArtifacts(!showArtifacts)}
          className="w-full flex items-center justify-between"
        >
          <PanelHeader icon={FileCheck} title="Governance Artifacts" />
          {showArtifacts ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {showArtifacts && m.artifacts.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {m.artifacts.map((a) => (
              <div
                key={a.file}
                className="flex items-center justify-between py-1.5 border-b border-border/10 last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ArtifactStatusDot status={a.status} />
                  <span className="text-xs font-mono truncate">{a.file}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <CriticalityBadge level={a.criticality} />
                  <span className="text-[9px] font-mono text-muted-foreground/50">
                    {a.hashPrefix}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {showArtifacts && m.artifacts.length === 0 && (
          <div className="text-xs text-muted-foreground mt-2">No artifact data available</div>
        )}
      </div>

      {/* ─── Agent Status (expandable) ─────────────────────── */}
      {Object.keys(m.agentStatuses).length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card/50 p-4">
          <button
            onClick={() => setShowAgents(!showAgents)}
            className="w-full flex items-center justify-between"
          >
            <PanelHeader icon={Users} title="Agent Status" />
            {showAgents ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {/* System state row always visible */}
          <Row
            label="System State"
            value={
              <span className={cn(
                "text-xs font-bold",
                m.systemState === "OPERATIONAL" ? "text-emerald-400" : "text-amber-400"
              )}>
                {m.systemState || "—"}
              </span>
            }
          />

          {showAgents && (
            <div className="mt-2 space-y-1.5">
              {Object.entries(m.agentStatuses).map(([name, agent]) => (
                <div
                  key={name}
                  className="flex items-center justify-between py-1.5 border-b border-border/10 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      agent.status === "ACTIVE" ? "bg-emerald-400" : "bg-muted-foreground"
                    )} />
                    <span className="text-xs font-semibold capitalize">{name}</span>
                    <span className="text-[10px] text-muted-foreground">({agent.role})</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                    {agent.lastAction}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Recent Commits (expandable) ───────────────────── */}
      {m.recentCommits.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card/50 p-4">
          <button
            onClick={() => setShowCommits(!showCommits)}
            className="w-full flex items-center justify-between"
          >
            <PanelHeader icon={GitBranch} title="Recent Commits" />
            {showCommits ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showCommits && (
            <div className="mt-2 space-y-1.5">
              {m.recentCommits.map((c) => (
                <div
                  key={c.hash}
                  className="flex items-start gap-2 py-1.5 border-b border-border/10 last:border-0"
                >
                  <span className="text-[10px] font-mono text-primary shrink-0 mt-0.5">
                    {c.hash}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs truncate">{c.message}</div>
                    <div className="text-[9px] text-muted-foreground">
                      {c.author} · {timeAgo(c.date)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Blockers ──────────────────────────────────────── */}
      {m.blockers.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <PanelHeader icon={AlertTriangle} title="Blockers" />
          <div className="space-y-1.5">
            {m.blockers.map((b, i) => (
              <div key={i} className="text-xs text-amber-400 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                <span>{b}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Data source attribution ───────────────────────── */}
      <div className="text-[9px] text-muted-foreground/40 text-center">
        Source: MANTIS integrity sweep · bkr1297-RIO/rio-system · Not agent self-report
        {m.fetchedAt && (
          <span> · Fetched {timeAgo(new Date(m.fetchedAt).toISOString())}</span>
        )}
      </div>
    </div>
  );
}
