/**
 * ProxyDashboard — Context-Aware Entry Point
 *
 * On every session start, Jordan calls GET /api/sync to load full context.
 * Displays: pending approvals count, recent receipts, system health,
 * pattern confidence (placeholder for now).
 *
 * Jordan should feel like "your proxy is ready" — warm, sovereign, not corporate.
 * Design it to feel like creating your digital twin.
 */

import { useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useDigitalChip } from "@/hooks/useDigitalChip";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Shield,
  Inbox,
  History,
  Activity,
  Brain,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export function ProxyDashboard() {
  const [, setLocation] = useLocation();
  const chip = useDigitalChip();

  // Session sync — calls GET /api/sync (or assembled fallback)
  const {
    data: syncData,
    isLoading,
    refetch,
    isRefetching,
  } = trpc.rio.proxySync.useQuery(undefined, {
    refetchInterval: 30000, // Re-sync every 30 seconds
    refetchOnWindowFocus: true,
  });

  // Gateway health for additional context
  const { data: healthData } = trpc.rio.governanceHealth.useQuery(undefined, {
    refetchInterval: 60000,
  });

  // Sync gateway data to Digital Chip (IndexedDB) when new data arrives
  useEffect(() => {
    if (syncData && chip.initialized) {
      chip.syncFromServer(syncData as any).catch(console.error);
    }
  }, [syncData, chip.initialized]);

  const pendingCount = (syncData as any)?.pending_approvals ?? 0;
  const recentReceipts = (syncData as any)?.recent_receipts ?? [];
  const healthStatus = (syncData as any)?.health?.gateway ?? "unknown";
  const ledgerValid = (syncData as any)?.health?.ledger_valid ?? false;
  const ledgerEntries = (syncData as any)?.health?.ledger_entries ?? 0;
  const patternConfidence = (syncData as any)?.pattern_confidence ?? 0;
  const activePolicies = (syncData as any)?.active_policies ?? 0;
  const lastActivity = (syncData as any)?.last_activity;
  const source = (syncData as any)?.source ?? "unknown";

  const healthColor = useMemo(() => {
    if (healthStatus === "operational") return "#22c55e";
    if (healthStatus === "degraded") return "#f59e0b";
    return "#6b7280";
  }, [healthStatus]);

  const confidenceLabel = useMemo(() => {
    if (patternConfidence >= 80) return { text: "High", color: "#22c55e" };
    if (patternConfidence >= 50) return { text: "Medium", color: "#f59e0b" };
    if (patternConfidence > 0) return { text: "Learning", color: "#60a5fa" };
    return { text: "Initializing", color: "#6b7280" };
  }, [patternConfidence]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="h-5 w-5 animate-pulse" style={{ color: "#b8963e" }} />
          <span className="text-sm text-muted-foreground">
            Syncing proxy context...
          </span>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 rounded-lg bg-muted/30 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header — warm, sovereign greeting */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "#b8963e15" }}
          >
            <Shield className="h-5 w-5" style={{ color: "#b8963e" }} />
          </div>
          <div>
            <h2 className="text-lg font-bold">Your proxy is ready</h2>
            <p className="text-xs text-muted-foreground">
              Jordan — context synced{" "}
              <span className="font-mono">
                ({source === "gateway" ? "live" : source})
              </span>
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="h-8 w-8"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* Quick stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Pending Approvals */}
        <Card
          className="bg-card/50 cursor-pointer hover:bg-card/80 transition-colors"
          onClick={() => setLocation("/one/approvals")}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Inbox className="h-4 w-4" style={{ color: "#b8963e" }} />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Pending
              </span>
            </div>
            <div className="flex items-end justify-between">
              <span
                className="text-2xl font-bold"
                style={{
                  color: pendingCount > 0 ? "#b8963e" : "#6b7280",
                }}
              >
                {pendingCount}
              </span>
              {pendingCount > 0 && (
                <Badge
                  className="text-[10px]"
                  style={{
                    backgroundColor: "#b8963e20",
                    color: "#b8963e",
                  }}
                >
                  Action needed
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* System Health */}
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4" style={{ color: healthColor }} />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Health
              </span>
            </div>
            <div className="flex items-end justify-between">
              <span
                className="text-sm font-semibold capitalize"
                style={{ color: healthColor }}
              >
                {healthStatus}
              </span>
              <Badge
                variant="secondary"
                className="text-[10px]"
                style={{ color: ledgerValid ? "#22c55e" : "#ef4444" }}
              >
                {ledgerValid ? "Chain Valid" : "Chain Unknown"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Pattern Confidence */}
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-4 w-4" style={{ color: confidenceLabel.color }} />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Confidence
              </span>
            </div>
            <div className="flex items-end justify-between">
              <span
                className="text-sm font-semibold"
                style={{ color: confidenceLabel.color }}
              >
                {confidenceLabel.text}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {patternConfidence}%
              </span>
            </div>
            {/* Confidence bar */}
            <div className="h-1 rounded-full bg-muted mt-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(patternConfidence, 2)}%`,
                  backgroundColor: confidenceLabel.color,
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Ledger */}
        <Card
          className="bg-card/50 cursor-pointer hover:bg-card/80 transition-colors"
          onClick={() => setLocation("/one/history")}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Ledger
              </span>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-bold text-foreground">
                {ledgerEntries}
              </span>
              <span className="text-[10px] text-muted-foreground">entries</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Policies */}
      <Card className="bg-card/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" style={{ color: "#b8963e" }} />
              <span className="text-sm font-medium">Active Policies</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono" style={{ color: "#b8963e" }}>
                {activePolicies}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setLocation("/one/policies")}
              >
                Manage
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Receipts */}
      {recentReceipts.length > 0 && (
        <Card className="bg-card/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Recent Activity</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setLocation("/one/history")}
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            <Separator />
            {recentReceipts.slice(0, 5).map((r: any, i: number) => (
              <div
                key={r.receipt_id || i}
                className="flex items-center gap-3 text-xs"
              >
                <div
                  className="h-6 w-6 rounded flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor:
                      r.decision === "approved"
                        ? "#22c55e15"
                        : r.decision === "denied"
                          ? "#ef444415"
                          : "#f59e0b15",
                  }}
                >
                  {r.decision === "approved" ? (
                    <CheckCircle2
                      className="h-3 w-3"
                      style={{ color: "#22c55e" }}
                    />
                  ) : r.decision === "denied" ? (
                    <AlertTriangle
                      className="h-3 w-3"
                      style={{ color: "#ef4444" }}
                    />
                  ) : (
                    <Clock
                      className="h-3 w-3"
                      style={{ color: "#f59e0b" }}
                    />
                  )}
                </div>
                <span className="flex-1 truncate text-muted-foreground">
                  {r.action}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                  {r.timestamp
                    ? new Date(r.timestamp).toLocaleTimeString()
                    : "—"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Digital Chip Status */}
      {chip.status && (
        <Card className="bg-card/50 border-dashed">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4" style={{ color: "#b8963e" }} />
                <span className="text-sm font-medium">Digital Chip</span>
              </div>
              <Badge
                variant="secondary"
                className="text-[10px]"
                style={{
                  color: chip.status.connectionState === "online" ? "#22c55e" : "#6b7280",
                }}
              >
                {chip.status.connectionState}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="text-center">
                <p className="text-lg font-bold" style={{ color: "#b8963e" }}>
                  {chip.status.receiptCount}
                </p>
                <p className="text-[10px] text-muted-foreground">Cached receipts</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">
                  {chip.status.approvalCount}
                </p>
                <p className="text-[10px] text-muted-foreground">Local approvals</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">
                  {chip.status.queuedDraftCount}
                </p>
                <p className="text-[10px] text-muted-foreground">Queued intents</p>
              </div>
            </div>
            {chip.status.keyFingerprint && (
              <p className="text-[10px] text-muted-foreground text-center mt-2 font-mono">
                Key: {chip.status.keyFingerprint}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Last activity */}
      {lastActivity && (
        <p className="text-[10px] text-muted-foreground text-center">
          Last activity:{" "}
          {new Date(lastActivity).toLocaleString()}
        </p>
      )}
    </div>
  );
}
