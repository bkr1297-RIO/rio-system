/**
 * /learning — RIO Learning Dashboard
 *
 * Shows how execution outcomes feed back into policy refinement.
 * Tracks decision patterns, approval rates, decision times.
 * Suggests policies after enough decisions accumulate.
 *
 * Key insight: receipts are still generated for auto-approved actions.
 * The governance trail never disappears.
 */

import { useState } from "react";
import NavBar from "@/components/NavBar";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

const ACTION_LABELS: Record<string, string> = {
  send_email: "Send Email",
  transfer_funds: "Transfer Funds",
  deploy_production: "Deploy Production",
  read_data: "Read Data",
  read_file: "Read File",
  write_file: "Write File",
  create_event: "Create Event",
  delete_database: "Delete Database",
};

const SUGGESTION_ICONS: Record<string, string> = {
  auto_approve: "\u2705",
  auto_deny: "\uD83D\uDEAB",
  reduce_pause: "\u23F1",
  increase_scrutiny: "\uD83D\uDD0D",
};

const SUGGESTION_COLORS: Record<string, string> = {
  auto_approve: "#22c55e",
  auto_deny: "#ef4444",
  reduce_pause: "#3b82f6",
  increase_scrutiny: "#f59e0b",
};

interface ActionStat {
  action: string;
  total: number;
  approved: number;
  denied: number;
  approvalRate: number;
  avgDecisionTimeMs: number;
  lastDecision: string;
  lastDecisionAt: string;
}

interface Suggestion {
  id: string;
  action: string;
  type: "auto_approve" | "auto_deny" | "reduce_pause" | "increase_scrutiny";
  title: string;
  description: string;
  confidence: number;
  basedOn: number;
  approvalRate: number;
  avgDecisionTimeSec: number;
}

interface Decision {
  intentId: string;
  action: string;
  description: string;
  requester: string;
  decision: string;
  decidedBy: string;
  decidedAt: string;
  decisionTimeMs: number;
}

export default function Learning() {
  const [acceptedPolicies, setAcceptedPolicies] = useState<Set<string>>(new Set());
  const [rejectedPolicies, setRejectedPolicies] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = trpc.rio.learningAnalytics.useQuery();

  const handleAcceptPolicy = (id: string) => {
    setAcceptedPolicies((prev) => { const next = new Set(Array.from(prev)); next.add(id); return next; });
    setRejectedPolicies((prev) => { const next = new Set(Array.from(prev)); next.delete(id); return next; });
  };

  const handleRejectPolicy = (id: string) => {
    setRejectedPolicies((prev) => { const next = new Set(Array.from(prev)); next.add(id); return next; });
    setAcceptedPolicies((prev) => { const next = new Set(Array.from(prev)); next.delete(id); return next; });
  };

  const actionStats = (data?.actionStats || []) as ActionStat[];
  const suggestions = (data?.suggestions || []) as Suggestion[];
  const decisions = (data?.decisions || []) as Decision[];

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "oklch(0.13 0.03 260)", fontFamily: "'Outfit', sans-serif" }}
    >
      <NavBar />

      <div className="max-w-5xl mx-auto px-4 pt-12 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: "#b8963e" }}>
            Learning Loop
          </h1>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{
              backgroundColor: "transparent",
              color: "#b8963e",
              border: "1.5px solid #b8963e40",
            }}
          >
            Refresh
          </button>
        </div>
        <p className="text-sm mb-8" style={{ color: "#9ca3af" }}>
          The system learns from your decisions. Approve enough similar actions and it suggests policies.
          Receipts are still generated for auto-approved actions — the governance trail never disappears.
        </p>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div
              className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: "#b8963e", borderTopColor: "transparent" }}
            />
          </div>
        )}

        {!isLoading && data && (
          <>
            {/* Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
              <StatCard label="Total Decisions" value={data.totalDecisions} color="#b8963e" />
              <StatCard label="Approved" value={data.totalApproved} color="#22c55e" />
              <StatCard label="Denied" value={data.totalDenied} color="#ef4444" />
              <StatCard
                label="Approval Rate"
                value={`${data.overallApprovalRate}%`}
                color={data.overallApprovalRate > 70 ? "#22c55e" : data.overallApprovalRate > 40 ? "#f59e0b" : "#ef4444"}
              />
            </div>

            {/* Policy Suggestions */}
            {suggestions.length > 0 && (
              <div className="mb-10">
                <h2 className="text-lg font-bold mb-4" style={{ color: "#e5e7eb" }}>
                  Policy Suggestions
                </h2>
                <p className="text-xs mb-4" style={{ color: "#6b7280" }}>
                  Based on your decision patterns, the system suggests the following policy changes.
                  Accepting a policy does not disable governance — receipts are still generated.
                </p>
                <div className="space-y-3">
                  {suggestions.map((s) => {
                    const isAccepted = acceptedPolicies.has(s.id);
                    const isRejected = rejectedPolicies.has(s.id);
                    const icon = SUGGESTION_ICONS[s.type] || "\u26A1";
                    const color = SUGGESTION_COLORS[s.type] || "#b8963e";

                    return (
                      <div
                        key={s.id}
                        className="rounded-lg border p-5"
                        style={{
                          backgroundColor: isAccepted
                            ? "#22c55e08"
                            : isRejected
                            ? "oklch(0.14 0.02 260)"
                            : "oklch(0.16 0.03 260)",
                          borderColor: isAccepted ? "#22c55e30" : isRejected ? "oklch(0.25 0.02 260)" : color + "30",
                          opacity: isRejected ? 0.5 : 1,
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-xl flex-shrink-0">{icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h3 className="text-sm font-bold" style={{ color: "#e5e7eb" }}>
                                {s.title}
                              </h3>
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                style={{ backgroundColor: color + "20", color }}
                              >
                                {Math.round(s.confidence * 100)}% confidence
                              </span>
                            </div>
                            <p className="text-xs mb-3" style={{ color: "#9ca3af" }}>
                              {s.description}
                            </p>

                            {/* Stats row */}
                            <div className="flex flex-wrap gap-4 mb-3">
                              <MiniStat label="Based on" value={`${s.basedOn} decisions`} />
                              <MiniStat label="Approval rate" value={`${s.approvalRate}%`} />
                              <MiniStat label="Avg decision time" value={`${s.avgDecisionTimeSec}s`} />
                            </div>

                            {/* Accept / Reject */}
                            {!isAccepted && !isRejected && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleAcceptPolicy(s.id)}
                                  className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                  style={{ backgroundColor: "#22c55e", color: "#fff" }}
                                >
                                  Accept Policy
                                </button>
                                <button
                                  onClick={() => handleRejectPolicy(s.id)}
                                  className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                  style={{
                                    backgroundColor: "transparent",
                                    color: "#6b7280",
                                    border: "1px solid oklch(0.3 0.02 260)",
                                  }}
                                >
                                  Dismiss
                                </button>
                              </div>
                            )}
                            {isAccepted && (
                              <p className="text-xs font-semibold" style={{ color: "#22c55e" }}>
                                Policy accepted. Receipts will still be generated for all governed actions.
                              </p>
                            )}
                            {isRejected && (
                              <p className="text-xs" style={{ color: "#6b7280" }}>
                                Dismissed. Current governance level maintained.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No suggestions yet */}
            {suggestions.length === 0 && data.totalDecisions > 0 && (
              <div
                className="rounded-lg border p-6 mb-10 text-center"
                style={{
                  backgroundColor: "oklch(0.16 0.03 260)",
                  borderColor: "oklch(0.72 0.1 85 / 15%)",
                }}
              >
                <p className="text-sm mb-2" style={{ color: "#9ca3af" }}>
                  Not enough data for policy suggestions yet.
                </p>
                <p className="text-xs" style={{ color: "#6b7280" }}>
                  The system needs at least 5 decisions per action type to start suggesting policies.
                  Keep using the{" "}
                  <Link href="/go" className="underline" style={{ color: "#b8963e" }}>
                    governance loop
                  </Link>{" "}
                  to build your decision history.
                </p>
              </div>
            )}

            {/* Per-Action Breakdown */}
            {actionStats.length > 0 && (
              <div className="mb-10">
                <h2 className="text-lg font-bold mb-4" style={{ color: "#e5e7eb" }}>
                  Action Breakdown
                </h2>
                <div className="space-y-3">
                  {actionStats.map((stat) => {
                    const label = ACTION_LABELS[stat.action] || stat.action;
                    const approvalPct = stat.approvalRate;
                    const avgSec = (stat.avgDecisionTimeMs / 1000).toFixed(1);

                    return (
                      <div
                        key={stat.action}
                        className="rounded-lg border p-4"
                        style={{
                          backgroundColor: "oklch(0.16 0.03 260)",
                          borderColor: "oklch(0.72 0.1 85 / 15%)",
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold" style={{ color: "#e5e7eb" }}>
                            {label}
                          </h3>
                          <span className="text-xs font-mono" style={{ color: "#6b7280" }}>
                            {stat.total} decisions
                          </span>
                        </div>

                        {/* Approval bar */}
                        <div className="flex items-center gap-3 mb-2">
                          <div
                            className="flex-1 h-2 rounded-full overflow-hidden"
                            style={{ backgroundColor: "oklch(0.2 0.02 260)" }}
                          >
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${approvalPct}%`,
                                backgroundColor: approvalPct > 70 ? "#22c55e" : approvalPct > 40 ? "#f59e0b" : "#ef4444",
                              }}
                            />
                          </div>
                          <span className="text-xs font-semibold min-w-[40px] text-right" style={{ color: "#d1d5db" }}>
                            {approvalPct}%
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-4">
                          <MiniStat label="Approved" value={String(stat.approved)} color="#22c55e" />
                          <MiniStat label="Denied" value={String(stat.denied)} color="#ef4444" />
                          <MiniStat label="Avg time" value={`${avgSec}s`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Decisions */}
            {decisions.length > 0 && (
              <div className="mb-10">
                <h2 className="text-lg font-bold mb-4" style={{ color: "#e5e7eb" }}>
                  Recent Decisions
                </h2>
                <div className="space-y-2">
                  {decisions.slice(0, 20).map((d) => {
                    const label = ACTION_LABELS[d.action] || d.action;
                    const isApproved = d.decision === "approved";
                    const timeSec = (d.decisionTimeMs / 1000).toFixed(1);

                    return (
                      <div
                        key={d.intentId}
                        className="rounded-lg p-3 flex items-center gap-3"
                        style={{ backgroundColor: "oklch(0.16 0.03 260)" }}
                      >
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: isApproved ? "#22c55e" : "#ef4444" }}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium" style={{ color: "#d1d5db" }}>
                            {label}
                          </span>
                          <span className="text-[10px] ml-2" style={{ color: "#6b7280" }}>
                            by {d.requester}
                          </span>
                        </div>
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: isApproved ? "#22c55e20" : "#ef444420",
                            color: isApproved ? "#22c55e" : "#ef4444",
                          }}
                        >
                          {isApproved ? "APPROVED" : "DENIED"}
                        </span>
                        <span className="text-[10px] font-mono" style={{ color: "#6b7280" }}>
                          {timeSec}s
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty State */}
            {data.totalDecisions === 0 && (
              <div className="text-center py-16">
                <p className="text-sm mb-2" style={{ color: "#6b7280" }}>
                  No decisions recorded yet.
                </p>
                <p className="text-xs mb-6" style={{ color: "#4b5563" }}>
                  Start approving or denying actions to build your decision history.
                </p>
                <Link
                  href="/go"
                  className="px-6 py-3 rounded-lg text-sm font-semibold no-underline transition-all inline-block"
                  style={{ backgroundColor: "#b8963e", color: "oklch(0.13 0.03 260)" }}
                >
                  Try Your First Action
                </Link>
              </div>
            )}

            {/* Explainer */}
            <div
              className="rounded-xl border p-6 md:p-8"
              style={{
                backgroundColor: "oklch(0.16 0.03 260)",
                borderColor: "oklch(0.72 0.1 85 / 15%)",
              }}
            >
              <h3 className="text-base font-bold mb-4" style={{ color: "#b8963e" }}>
                How the Learning Loop Works
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <p className="text-xs font-semibold mb-1.5" style={{ color: "#e5e7eb" }}>
                    1. Decisions Accumulate
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                    Every time you approve or deny an action, the system records the decision,
                    the action type, and how long it took you to decide.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold mb-1.5" style={{ color: "#e5e7eb" }}>
                    2. Patterns Emerge
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                    After enough decisions, the system identifies patterns: which actions you
                    always approve, which you always deny, and which require careful consideration.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold mb-1.5" style={{ color: "#e5e7eb" }}>
                    3. Policies Suggested
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                    The system suggests policy changes — auto-approve, auto-deny, or adjusted pause times.
                    You decide whether to accept. Receipts are always generated, even for auto-approved actions.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <footer
        className="border-t py-6 text-center text-xs"
        style={{
          backgroundColor: "oklch(0.1 0.02 260)",
          borderColor: "oklch(0.72 0.1 85 / 15%)",
          color: "#6b7280",
        }}
      >
        RIO Protocol — Runtime Intelligence Orchestration — Brian K. Rasmussen
      </footer>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div
      className="rounded-lg p-4 text-center"
      style={{
        backgroundColor: "oklch(0.16 0.03 260)",
        border: `1px solid ${color}20`,
      }}
    >
      <p className="text-2xl font-bold" style={{ color }}>
        {value}
      </p>
      <p className="text-xs mt-1" style={{ color: "#6b7280" }}>
        {label}
      </p>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[10px]" style={{ color: "#6b7280" }}>
        {label}
      </p>
      <p className="text-xs font-semibold" style={{ color: color || "#d1d5db" }}>
        {value}
      </p>
    </div>
  );
}
