import React, { useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocalStore } from "@/hooks/useLocalStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, LayoutDashboard, Shield, ShieldCheck, ShieldAlert, Key, FileText, CheckCircle2, XCircle, AlertTriangle, Play, Clock, ArrowRight, RefreshCw, FileKey, Bell, Timer, BarChart3 } from "lucide-react";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import { ThreePowerPanel, type SigilStage, type RiskLevel } from "@/components/ThreePowerSigil";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    ACTIVE: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <ShieldCheck className="h-3 w-3" /> },
    KILLED: { color: "bg-red-500/15 text-red-400 border-red-500/30", icon: <ShieldAlert className="h-3 w-3" /> },
    SUSPENDED: { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: <AlertTriangle className="h-3 w-3" /> },
    PENDING_APPROVAL: { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: <Clock className="h-3 w-3" /> },
    APPROVED: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="h-3 w-3" /> },
    REJECTED: { color: "bg-red-500/15 text-red-400 border-red-500/30", icon: <XCircle className="h-3 w-3" /> },
    EXECUTED: { color: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: <Play className="h-3 w-3" /> },
    FAILED: { color: "bg-red-500/15 text-red-400 border-red-500/30", icon: <XCircle className="h-3 w-3" /> },
    EXPIRED: { color: "bg-slate-500/15 text-slate-400 border-slate-500/30", icon: <Clock className="h-3 w-3" /> },
  };
  const s = map[status] || map.ACTIVE;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${s.color}`}>{s.icon} {status}</span>;
}

function RiskDot({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    LOW: "bg-emerald-400",
    MEDIUM: "bg-amber-400",
    HIGH: "bg-red-400",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[tier] || colors.LOW}`} />;
}

export default function Dashboard() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { keys, policy, syncFromCloud } = useLocalStore();
  const [isResyncing, setIsResyncing] = React.useState(false);

  const resyncLedger = trpc.sync.resyncLedger.useQuery(undefined, { enabled: false });

  const { data: status, isLoading, refetch } = trpc.proxy.status.useQuery(undefined, { enabled: isAuthenticated });

  // Approval SLA metrics
  const { data: metrics } = trpc.proxy.approvalMetrics.useQuery(undefined, { enabled: isAuthenticated && !!status?.proxyUser });

  const { data: syncData } = trpc.sync.pull.useQuery(
    { lastKnownEntryId: undefined },
    { enabled: isAuthenticated && !!status?.proxyUser }
  );

  // Persist sync data to IndexedDB when it arrives
  const syncedRef = React.useRef(false);
  React.useEffect(() => {
    if (syncData && !syncedRef.current) {
      syncedRef.current = true;
      syncFromCloud(syncData).catch(console.warn);
    }
  }, [syncData, syncFromCloud]);

  // Derive the most active intent's stage for the three-power sigil
  // MUST be called before any early returns to maintain hooks order
  const sigilState = useMemo(() => {
    const allIntents = status?.recentIntents ?? [];
    if (allIntents.length === 0) {
      return { stage: "IDLE" as SigilStage, riskLevel: "LOW" as RiskLevel };
    }

    const executing = allIntents.find((i) => i.status === "APPROVED");
    if (executing) {
      return {
        stage: "APPROVED" as SigilStage,
        riskLevel: (executing.riskTier || "LOW") as RiskLevel,
        intentId: executing.intentId,
        toolName: executing.toolName,
      };
    }

    const pending = allIntents.find((i) => i.status === "PENDING_APPROVAL");
    if (pending) {
      return {
        stage: "WAITING_APPROVAL" as SigilStage,
        riskLevel: (pending.riskTier || "MEDIUM") as RiskLevel,
        intentId: pending.intentId,
        toolName: pending.toolName,
      };
    }

    const executed = allIntents.find((i) => i.status === "EXECUTED");
    if (executed) {
      return {
        stage: "LOGGED" as SigilStage,
        riskLevel: (executed.riskTier || "LOW") as RiskLevel,
        intentId: executed.intentId,
        toolName: executed.toolName,
      };
    }

    const rejected = allIntents.find((i) => i.status === "REJECTED");
    if (rejected) {
      return {
        stage: "REJECTED" as SigilStage,
        riskLevel: (rejected.riskTier || "MEDIUM") as RiskLevel,
        intentId: rejected.intentId,
        toolName: rejected.toolName,
      };
    }

    const failed = allIntents.find((i) => i.status === "FAILED");
    if (failed) {
      return {
        stage: "VIOLATED" as SigilStage,
        riskLevel: (failed.riskTier || "HIGH") as RiskLevel,
        intentId: failed.intentId,
        toolName: failed.toolName,
      };
    }

    return { stage: "IDLE" as SigilStage, riskLevel: "LOW" as RiskLevel };
  }, [status?.recentIntents]);

  const handleResync = async () => {
    setIsResyncing(true);
    try {
      const { data } = await resyncLedger.refetch();
      if (data) {
        await syncFromCloud({
          entries: data.entries,
          totalEntries: data.totalEntries,
          chainValid: data.chainValid,
          proxyUser: status?.proxyUser,
        });
        await refetch();
      }
    } catch (e) {
      console.error("Resync failed:", e);
    } finally {
      setIsResyncing(false);
    }
  };

  // ─── Early returns AFTER all hooks ───────────────────────────

  if (authLoading || isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md w-full bg-card">
          <CardContent className="p-6 text-center space-y-4">
            <Shield className="h-12 w-12 text-primary mx-auto" />
            <p className="text-muted-foreground text-sm">Sign in to view your dashboard.</p>
            <Button onClick={() => { window.location.href = getLoginUrl(); }} className="font-mono uppercase tracking-wider">Sign In</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!status?.proxyUser) {
    navigate("/onboard");
    return null;
  }

  const proxy = status.proxyUser;
  const health = status.systemHealth;
  const pendingIntents = status.recentIntents.filter((i) => i.status === "PENDING_APPROVAL");
  const approvedIntents = status.recentIntents.filter((i) => i.status === "APPROVED");
  const otherIntents = status.recentIntents.filter((i) => i.status !== "PENDING_APPROVAL" && i.status !== "APPROVED");

  return (
    <div className="min-h-screen py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h1 className="text-lg sm:text-xl font-bold font-mono tracking-tight flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5 text-primary" /> Proxy Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Welcome, {user?.name || "Operator"}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="font-mono text-xs gap-1">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>

        {/* Three-Power Sigil — Real-time state visualization */}
        <ThreePowerPanel
          stage={sigilState.stage}
          riskLevel={sigilState.riskLevel}
          intentId={sigilState.intentId}
          toolName={sigilState.toolName}
        />

        {/* Recovery Alert */}
        {!keys && proxy.status === "ACTIVE" && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardContent className="py-3 px-4 space-y-3">
              <div className="flex items-start sm:items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                <div>
                  <div className="text-sm font-mono font-semibold text-amber-400">No Local Keys</div>
                  <div className="text-xs text-muted-foreground">Restore from backup or generate new keys to approve actions.</div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate("/recovery")} className="font-mono text-xs gap-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 flex-1">
                  <FileKey className="h-3 w-3" /> Restore from Backup
                </Button>
                <Button size="sm" onClick={() => navigate("/onboard")} className="font-mono text-xs gap-1 flex-1">
                  <Key className="h-3 w-3" /> Generate New Keys
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* PENDING APPROVALS — Prominent mobile-first section */}
        {pendingIntents.length > 0 && (
          <Card className="border-amber-500/40 bg-amber-500/5 shadow-lg shadow-amber-500/5">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-mono flex items-center gap-2 text-amber-400">
                <Bell className="h-4 w-4 animate-pulse" /> ACTION REQUIRED — {pendingIntents.length} PENDING
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {pendingIntents.map((intent) => (
                  <button
                    key={intent.intentId}
                    className="w-full text-left rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/25 px-4 py-3 transition-colors touch-manipulation"
                    onClick={() => navigate(`/intent/${intent.intentId}`)}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-mono font-bold text-amber-300">{intent.toolName}</span>
                      <RiskDot tier={intent.riskTier} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-amber-400/60">{intent.intentId}</span>
                      <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider">Tap to review →</span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* APPROVED — Ready to execute */}
        {approvedIntents.length > 0 && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-mono flex items-center gap-2 text-emerald-400">
                <Play className="h-4 w-4" /> READY TO EXECUTE — {approvedIntents.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {approvedIntents.map((intent) => (
                  <button
                    key={intent.intentId}
                    className="w-full text-left rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/25 px-4 py-3 transition-colors touch-manipulation"
                    onClick={() => navigate(`/intent/${intent.intentId}`)}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-mono font-bold text-emerald-300">{intent.toolName}</span>
                      <StatusBadge status="APPROVED" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-emerald-400/60">{intent.intentId}</span>
                      <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">Tap to execute →</span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="bg-card border-border">
            <CardContent className="py-3 px-4 space-y-1.5">
              <div className="text-[10px] font-mono text-muted-foreground">PROXY STATUS</div>
              <StatusBadge status={proxy.status} />
              {proxy.status === "KILLED" && proxy.killReason && (
                <div className="text-xs text-red-400 font-mono mt-1">Reason: {proxy.killReason}</div>
              )}
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="py-3 px-4 space-y-1.5">
              <div className="text-[10px] font-mono text-muted-foreground">LEDGER HEALTH</div>
              <div className="flex items-center gap-2">
                {health.ledgerValid ? (
                  <span className="flex items-center gap-1 text-emerald-400 text-xs font-mono"><ShieldCheck className="h-3.5 w-3.5" /> Valid</span>
                ) : (
                  <span className="flex items-center gap-1 text-red-400 text-xs font-mono"><ShieldAlert className="h-3.5 w-3.5" /> Broken</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground font-mono">{health.ledgerEntries} entries</div>
              {!health.ledgerValid && (
                <Button variant="outline" size="sm" onClick={handleResync} disabled={isResyncing} className="mt-1 font-mono text-[10px] gap-1 h-6 px-2 border-red-500/30 text-red-400 hover:bg-red-500/10">
                  {isResyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Resync
                </Button>
              )}
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="py-3 px-4 space-y-1.5">
              <div className="text-[10px] font-mono text-muted-foreground">LOCAL STATE</div>
              <div className="flex items-center gap-2">
                {keys ? (
                  <span className="flex items-center gap-1 text-emerald-400 text-xs font-mono"><Key className="h-3.5 w-3.5" /> Keys stored</span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-400 text-xs font-mono"><Key className="h-3.5 w-3.5" /> No local keys</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground font-mono">{policy ? `Policy: ${policy.seedVersion}` : "No policy"}</div>
            </CardContent>
          </Card>
        </div>

        {/* Approval SLA Metrics */}
        {metrics && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> APPROVAL SLA</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] font-mono text-muted-foreground">QUEUE SIZE</div>
                  <div className={`text-lg font-bold font-mono ${metrics.queueSize > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {metrics.queueSize}
                  </div>
                  <div className="text-[10px] text-muted-foreground">pending</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-mono text-muted-foreground">AVG TIME TO APPROVE</div>
                  <div className="text-lg font-bold font-mono text-foreground">
                    {metrics.avgTimeToApprovalMs > 0
                      ? metrics.avgTimeToApprovalMs < 60000
                        ? `${Math.round(metrics.avgTimeToApprovalMs / 1000)}s`
                        : metrics.avgTimeToApprovalMs < 3600000
                          ? `${Math.round(metrics.avgTimeToApprovalMs / 60000)}m`
                          : `${(metrics.avgTimeToApprovalMs / 3600000).toFixed(1)}h`
                      : '—'}
                  </div>
                  <div className="text-[10px] text-muted-foreground">response time</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-mono text-muted-foreground">OLDEST PENDING</div>
                  <div className={`text-lg font-bold font-mono ${metrics.oldestPendingAgeMs > 3600000 ? 'text-red-400' : metrics.oldestPendingAgeMs > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {metrics.oldestPendingAgeMs > 0
                      ? metrics.oldestPendingAgeMs < 60000
                        ? `${Math.round(metrics.oldestPendingAgeMs / 1000)}s`
                        : metrics.oldestPendingAgeMs < 3600000
                          ? `${Math.round(metrics.oldestPendingAgeMs / 60000)}m`
                          : `${(metrics.oldestPendingAgeMs / 3600000).toFixed(1)}h`
                      : '—'}
                  </div>
                  <div className="text-[10px] text-muted-foreground">waiting</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-mono text-muted-foreground">APPROVED</div>
                  <div className="text-lg font-bold font-mono text-emerald-400">{metrics.totalApproved}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-mono text-muted-foreground">REJECTED</div>
                  <div className="text-lg font-bold font-mono text-red-400">{metrics.totalRejected}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-mono text-muted-foreground">EXPIRED</div>
                  <div className="text-lg font-bold font-mono text-slate-400">{metrics.totalExpired}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Identity Card */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> IDENTITY</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div>
                <div className="text-[10px] text-muted-foreground">SEED VERSION</div>
                <div>{proxy.seedVersion}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">ONBOARDED</div>
                <div>{new Date(proxy.onboardedAt).toLocaleString()}</div>
              </div>
              <div className="col-span-1 sm:col-span-2">
                <div className="text-[10px] text-muted-foreground">PUBLIC KEY</div>
                <div className="break-all text-muted-foreground">{proxy.publicKey.slice(0, 64)}...</div>
              </div>
              <div className="col-span-1 sm:col-span-2">
                <div className="text-[10px] text-muted-foreground">POLICY HASH</div>
                <div className="break-all text-muted-foreground">{proxy.policyHash}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Intents (non-pending, non-approved) */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-mono flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> RECENT INTENTS</CardTitle>
            <Button variant="outline" size="sm" onClick={() => navigate("/intent/new")} className="font-mono text-xs gap-1">
              <ArrowRight className="h-3 w-3" /> New
            </Button>
          </CardHeader>
          <CardContent>
            {otherIntents.length === 0 && pendingIntents.length === 0 && approvedIntents.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-xs font-mono text-muted-foreground">No intents yet. Create your first governed action.</p>
              </div>
            ) : otherIntents.length === 0 ? (
              <div className="text-center py-3">
                <p className="text-xs font-mono text-muted-foreground">All recent intents are shown above.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {otherIntents.map((intent) => (
                  <div
                    key={intent.intentId}
                    className="flex items-center justify-between rounded-md px-3 py-2.5 bg-secondary/30 hover:bg-secondary/50 active:bg-secondary/60 cursor-pointer transition-colors touch-manipulation"
                    onClick={() => navigate(`/intent/${intent.intentId}`)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <RiskDot tier={intent.riskTier} />
                      <span className="text-xs font-mono font-semibold truncate">{intent.toolName}</span>
                    </div>
                    <StatusBadge status={intent.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Approvals */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> RECENT APPROVALS</CardTitle>
          </CardHeader>
          <CardContent>
            {status.recentApprovals.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-xs font-mono text-muted-foreground">No approvals yet.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {status.recentApprovals.map((approval) => (
                  <div key={approval.approvalId} className="flex items-center justify-between rounded-md px-3 py-2.5 bg-secondary/30 touch-manipulation">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-muted-foreground truncate">{approval.approvalId.slice(0, 12)}...</span>
                      <span className="text-xs font-mono truncate">{approval.boundToolName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={approval.decision} />
                      <span className="text-[10px] font-mono text-muted-foreground">{approval.executionCount}/{approval.maxExecutions}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sync Status */}
        {syncData && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono flex items-center gap-2"><RefreshCw className="h-4 w-4 text-primary" /> SYNC STATUS</CardTitle>
            </CardHeader>
            <CardContent className="text-xs font-mono space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Total ledger entries:</span><span>{syncData.totalEntries}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Chain valid:</span><span className={syncData.chainValid ? "text-emerald-400" : "text-red-400"}>{syncData.chainValid ? "Yes" : "No"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">New entries since last sync:</span><span>{syncData.entries.length}</span></div>
              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={handleResync} disabled={isResyncing} className="w-full font-mono text-[10px] gap-1 h-7">
                  {isResyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Full Ledger Resync
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
