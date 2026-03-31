/**
 * ONE App — Approvals Inbox
 *
 * Core screen showing pending intents that require user approval.
 * Pulls from the live gateway ledger, shows action details, risk level,
 * and provides approve/deny actions.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Inbox,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  User,
  FileText,
  Loader2,
} from "lucide-react";

type LedgerEntry = {
  block_id: string;
  intent_id: string;
  action: string;
  decision: string;
  receipt_hash: string | null;
  previous_hash: string | null;
  current_hash: string;
  ledger_signature: string | null;
  protocol_version: string | null;
  timestamp: string | null;
  recorded_by: string;
  source?: string;
  detail?: string;
  status?: string;
};

function riskColor(action: string): string {
  const high = ["payment", "transfer", "delete", "wire"];
  const medium = ["email", "send", "calendar", "message"];
  if (high.some((k) => action.toLowerCase().includes(k))) return "#ef4444";
  if (medium.some((k) => action.toLowerCase().includes(k))) return "#f59e0b";
  return "#22c55e";
}

function riskLabel(action: string): string {
  const high = ["payment", "transfer", "delete", "wire"];
  const medium = ["email", "send", "calendar", "message"];
  if (high.some((k) => action.toLowerCase().includes(k))) return "High";
  if (medium.some((k) => action.toLowerCase().includes(k))) return "Medium";
  return "Low";
}

function formatTime(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function relativeTime(ts: string | null): string {
  if (!ts) return "";
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

export default function Approvals() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const {
    data: ledgerData,
    isLoading,
    refetch,
  } = trpc.rio.ledgerChain.useQuery(
    { limit: 200 },
    { refetchInterval: 15000, refetchOnWindowFocus: true }
  );

  const approveMut = trpc.rio.approve.useMutation();
  const denyMut = trpc.rio.deny.useMutation();

  const entries = (ledgerData as any)?.entries ?? [];

  const pendingEntries = useMemo(
    () =>
      entries.filter(
        (e: LedgerEntry) =>
          e.decision === "pending" || e.decision === "pending_approval"
      ),
    [entries]
  );

  const recentDecisions = useMemo(
    () =>
      entries
        .filter(
          (e: LedgerEntry) =>
            e.decision === "approved" ||
            e.decision === "denied" ||
            e.decision === "executed"
        )
        .slice(0, 5),
    [entries]
  );

  const handleApprove = async (intentId: string) => {
    setProcessingId(intentId);
    try {
      await approveMut.mutateAsync({ intentId });
      toast.success("Intent approved", {
        description: `Approved ${intentId.slice(0, 12)}...`,
      });
      refetch();
    } catch (err: any) {
      toast.error("Approval failed", {
        description: err?.message || "Could not approve this intent",
      });
    }
    setProcessingId(null);
  };

  const handleDeny = async (intentId: string) => {
    setProcessingId(intentId);
    try {
      await denyMut.mutateAsync({ intentId });
      toast.success("Intent denied", {
        description: `Denied ${intentId.slice(0, 12)}...`,
      });
      refetch();
    } catch (err: any) {
      toast.error("Denial failed", {
        description: err?.message || "Could not deny this intent",
      });
    }
    setProcessingId(null);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Approval Inbox</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pending intents requiring your decision
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-2"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="bg-card/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#b8963e20" }}
            >
              <Clock className="h-5 w-5" style={{ color: "#b8963e" }} />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingEntries.length}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#22c55e20" }}
            >
              <CheckCircle2 className="h-5 w-5" style={{ color: "#22c55e" }} />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {
                  entries.filter(
                    (e: LedgerEntry) =>
                      e.decision === "approved" || e.decision === "executed"
                  ).length
                }
              </p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#ef444420" }}
            >
              <XCircle className="h-5 w-5" style={{ color: "#ef4444" }} />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {
                  entries.filter((e: LedgerEntry) => e.decision === "denied")
                    .length
                }
              </p>
              <p className="text-xs text-muted-foreground">Denied</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && pendingEntries.length === 0 && (
        <Card className="bg-card/30 border-dashed">
          <CardContent className="p-12 flex flex-col items-center text-center">
            <div
              className="h-16 w-16 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: "#22c55e15" }}
            >
              <Inbox className="h-8 w-8" style={{ color: "#22c55e" }} />
            </div>
            <h3 className="text-lg font-semibold mb-2">All clear</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              No pending approvals. When an AI agent requests an action that
              requires your approval, it will appear here.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pending Intents */}
      {pendingEntries.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Pending Approval ({pendingEntries.length})
          </h2>
          {pendingEntries.map((entry: LedgerEntry) => {
            const isExpanded = expandedId === entry.intent_id;
            const isProcessing = processingId === entry.intent_id;
            const risk = riskLabel(entry.action);
            const rColor = riskColor(entry.action);

            return (
              <Card
                key={entry.intent_id}
                className="transition-all hover:shadow-md"
                style={{
                  borderColor: isExpanded ? "#b8963e40" : undefined,
                }}
              >
                <CardContent className="p-0">
                  {/* Summary Row */}
                  <button
                    className="w-full p-4 flex items-center gap-4 text-left hover:bg-accent/30 transition-colors rounded-t-lg"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : entry.intent_id)
                    }
                  >
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${rColor}15` }}
                    >
                      {risk === "High" ? (
                        <AlertTriangle
                          className="h-5 w-5"
                          style={{ color: rColor }}
                        />
                      ) : (
                        <Shield
                          className="h-5 w-5"
                          style={{ color: rColor }}
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm truncate">
                          {entry.action}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] shrink-0"
                          style={{ borderColor: rColor, color: rColor }}
                        >
                          {risk} Risk
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {entry.recorded_by}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {relativeTime(entry.timestamp)}
                        </span>
                        {entry.source && (
                          <Badge variant="secondary" className="text-[10px]">
                            {entry.source}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4">
                      <Separator className="mb-4" />

                      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Intent ID
                          </p>
                          <p className="font-mono text-xs break-all">
                            {entry.intent_id}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Block ID
                          </p>
                          <p className="font-mono text-xs break-all">
                            {entry.block_id}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Submitted
                          </p>
                          <p className="text-xs">
                            {formatTime(entry.timestamp)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Current Hash
                          </p>
                          <p className="font-mono text-xs break-all">
                            {entry.current_hash
                              ? entry.current_hash.slice(0, 24) + "..."
                              : "—"}
                          </p>
                        </div>
                      </div>

                      {entry.detail && (
                        <div className="mb-4 p-3 rounded-lg bg-muted/30">
                          <p className="text-xs text-muted-foreground mb-1">
                            Detail
                          </p>
                          <p className="text-sm">{entry.detail}</p>
                        </div>
                      )}

                      {/* Approve / Deny Buttons */}
                      <div className="flex gap-3">
                        <Button
                          className="flex-1 font-semibold"
                          style={{
                            backgroundColor: "#22c55e",
                            color: "#fff",
                          }}
                          disabled={isProcessing}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApprove(entry.intent_id);
                          }}
                        >
                          {isProcessing ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                          )}
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 font-semibold border-destructive text-destructive hover:bg-destructive/10"
                          disabled={isProcessing}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeny(entry.intent_id);
                          }}
                        >
                          {isProcessing ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <XCircle className="h-4 w-4 mr-2" />
                          )}
                          Deny
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Recent Decisions */}
      {recentDecisions.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Recent Decisions
          </h2>
          <div className="space-y-2">
            {recentDecisions.map((entry: LedgerEntry) => (
              <div
                key={entry.intent_id}
                className="flex items-center gap-3 p-3 rounded-lg bg-card/30 border border-border/30"
              >
                {entry.decision === "approved" ||
                entry.decision === "executed" ? (
                  <CheckCircle2
                    className="h-4 w-4 shrink-0"
                    style={{ color: "#22c55e" }}
                  />
                ) : (
                  <XCircle
                    className="h-4 w-4 shrink-0"
                    style={{ color: "#ef4444" }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block">
                    {entry.action}
                  </span>
                </div>
                <Badge
                  variant="secondary"
                  className="text-[10px] capitalize shrink-0"
                >
                  {entry.decision}
                </Badge>
                <span className="text-xs text-muted-foreground shrink-0">
                  {relativeTime(entry.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
