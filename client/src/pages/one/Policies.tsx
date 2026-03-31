/**
 * ONE App — Policy Management
 *
 * View and manage governance policies. Accept/dismiss suggestions from
 * the learning loop. Deactivate existing policies. All policy changes
 * are themselves governed actions.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ScrollText,
  Shield,
  CheckCircle2,
  XCircle,
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  BarChart3,
  Clock,
} from "lucide-react";

type ActionStat = {
  action: string;
  total: number;
  approved: number;
  denied: number;
  approvalRate: number;
  avgDecisionTimeSec: number;
};

type Suggestion = {
  id: string;
  action: string;
  type: string;
  title: string;
  description: string;
  confidence: number;
  basedOn: number;
  approvalRate: number;
  avgDecisionTimeSec: number;
};

type ActivePolicy = {
  policyId: string;
  action: string;
  type: string;
  title: string;
  description: string | null;
  confidence: number;
  basedOnDecisions: number;
  approvalRate: number;
  avgDecisionTimeSec: number;
  status: string;
  createdAt: string;
};

export default function Policies() {
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = trpc.rio.learningAnalytics.useQuery();
  const {
    data: activePoliciesData,
    refetch: refetchPolicies,
  } = trpc.rio.activePolicies.useQuery();

  const acceptMut = trpc.rio.acceptPolicySuggestion.useMutation();
  const dismissMut = trpc.rio.dismissPolicySuggestion.useMutation();
  const deactivateMut = trpc.rio.deactivatePolicy.useMutation();

  const activePolicies = (activePoliciesData || []) as unknown as ActivePolicy[];
  const actionStats = ((data as any)?.actionStats || []) as ActionStat[];
  const suggestions = ((data as any)?.suggestions || []) as Suggestion[];

  const handleAccept = async (s: Suggestion) => {
    setProcessingId(s.id);
    try {
      await acceptMut.mutateAsync({
        action: s.action,
        type: s.type as "auto_approve" | "auto_deny" | "reduce_pause" | "increase_scrutiny",
        title: s.title,
        description: s.description,
        confidence: s.confidence,
        basedOn: s.basedOn,
        approvalRate: s.approvalRate,
        avgDecisionTimeSec: s.avgDecisionTimeSec,
      });
      setAcceptedIds((prev) => {
        const next = new Set(Array.from(prev));
        next.add(s.id);
        return next;
      });
      toast.success("Policy accepted", { description: s.title });
      refetchPolicies();
    } catch (err: any) {
      toast.error("Failed to accept policy", {
        description: err?.message || "Unknown error",
      });
    }
    setProcessingId(null);
  };

  const handleDismiss = async (id: string) => {
    setProcessingId(id);
    try {
      await dismissMut.mutateAsync({ suggestionId: id });
      setRejectedIds((prev) => {
        const next = new Set(Array.from(prev));
        next.add(id);
        return next;
      });
      toast.success("Suggestion dismissed");
    } catch (err: any) {
      toast.error("Failed to dismiss", {
        description: err?.message || "Unknown error",
      });
    }
    setProcessingId(null);
  };

  const handleDeactivate = async (policyId: string) => {
    try {
      await deactivateMut.mutateAsync({ policyId });
      toast.success("Policy deactivated");
      refetchPolicies();
    } catch (err: any) {
      toast.error("Failed to deactivate", {
        description: err?.message || "Unknown error",
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Policies</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Governance rules that control how actions are approved and executed
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refetch();
            refetchPolicies();
          }}
          className="gap-2"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && data && (
        <>
          {/* Overview Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <StatCard
              icon={BarChart3}
              label="Total Decisions"
              value={(data as any).totalDecisions}
              color="#b8963e"
            />
            <StatCard
              icon={CheckCircle2}
              label="Approved"
              value={(data as any).totalApproved}
              color="#22c55e"
            />
            <StatCard
              icon={XCircle}
              label="Denied"
              value={(data as any).totalDenied}
              color="#ef4444"
            />
            <StatCard
              icon={TrendingUp}
              label="Approval Rate"
              value={`${(data as any).overallApprovalRate}%`}
              color={
                (data as any).overallApprovalRate > 70
                  ? "#22c55e"
                  : (data as any).overallApprovalRate > 40
                    ? "#f59e0b"
                    : "#ef4444"
              }
            />
          </div>

          {/* Active Policies */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Active Policies ({activePolicies.length})
            </h2>
            {activePolicies.length === 0 ? (
              <Card className="bg-card/30 border-dashed">
                <CardContent className="p-8 text-center">
                  <ScrollText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No active policies. Accept suggestions below or wait for the
                    learning loop to generate them from your decision patterns.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {activePolicies.map((p) => (
                  <Card key={p.policyId} className="bg-card/50">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div
                          className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                          style={{ backgroundColor: "#22c55e15" }}
                        >
                          <Shield
                            className="h-4 w-4"
                            style={{ color: "#22c55e" }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">
                              {p.title}
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                              {p.action}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">
                            {p.description}
                          </p>
                          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                            <span>
                              Confidence: {Math.round(p.confidence * 100)}%
                            </span>
                            <span>Based on: {p.basedOnDecisions} decisions</span>
                            <span>
                              Approval rate: {Math.round(p.approvalRate)}%
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive shrink-0"
                          onClick={() => handleDeactivate(p.policyId)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Policy Suggestions */}
          {suggestions.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Suggestions ({suggestions.length})
              </h2>
              <p className="text-xs text-muted-foreground mb-3">
                Based on your decision patterns. Accepting a policy does not
                disable governance — receipts are still generated.
              </p>
              <div className="space-y-2">
                {suggestions.map((s) => {
                  const isAccepted = acceptedIds.has(s.id);
                  const isRejected = rejectedIds.has(s.id);
                  const isProcessing = processingId === s.id;

                  if (isAccepted || isRejected) {
                    return (
                      <Card
                        key={s.id}
                        className="bg-card/20 border-dashed opacity-60"
                      >
                        <CardContent className="p-3 flex items-center gap-2 text-sm text-muted-foreground">
                          {isAccepted ? (
                            <CheckCircle2
                              className="h-4 w-4"
                              style={{ color: "#22c55e" }}
                            />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                          <span>
                            {s.title} —{" "}
                            {isAccepted ? "Accepted" : "Dismissed"}
                          </span>
                        </CardContent>
                      </Card>
                    );
                  }

                  return (
                    <Card key={s.id} className="bg-card/50">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div
                            className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                            style={{ backgroundColor: "#b8963e15" }}
                          >
                            <Lightbulb
                              className="h-4 w-4"
                              style={{ color: "#b8963e" }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-sm">
                                {s.title}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px]"
                                style={{
                                  borderColor: "#b8963e",
                                  color: "#b8963e",
                                }}
                              >
                                {Math.round(s.confidence * 100)}% confidence
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">
                              {s.description}
                            </p>
                            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                              <span>Action: {s.action}</span>
                              <span>Based on: {s.basedOn} decisions</span>
                              <span>
                                Approval rate: {Math.round(s.approvalRate)}%
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <Button
                              size="sm"
                              className="gap-1"
                              style={{
                                backgroundColor: "#22c55e",
                                color: "#fff",
                              }}
                              disabled={isProcessing}
                              onClick={() => handleAccept(s)}
                            >
                              {isProcessing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ThumbsUp className="h-3.5 w-3.5" />
                              )}
                              Accept
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              disabled={isProcessing}
                              onClick={() => handleDismiss(s.id)}
                            >
                              <ThumbsDown className="h-3.5 w-3.5" />
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-Action Breakdown */}
          {actionStats.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Action Breakdown
              </h2>
              <div className="space-y-2">
                {actionStats.map((stat) => (
                  <Card key={stat.action} className="bg-card/30">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-sm font-medium">
                              {stat.action}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {stat.total} total
                            </Badge>
                          </div>
                          {/* Progress bar */}
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${stat.approvalRate}%`,
                                backgroundColor:
                                  stat.approvalRate > 70
                                    ? "#22c55e"
                                    : stat.approvalRate > 40
                                      ? "#f59e0b"
                                      : "#ef4444",
                              }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold">
                            {Math.round(stat.approvalRate)}%
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            approval rate
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <Card className="bg-card/50">
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <div>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
