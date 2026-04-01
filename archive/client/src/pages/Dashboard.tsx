/**
 * /dashboard — RIO Governance Dashboard
 *
 * Shows all governed actions: receipts, ledger entries, decisions.
 * Filterable by action type, decision, and risk level.
 */

import { useState, useMemo } from "react";
import NavBar from "@/components/NavBar";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

interface LedgerEntry {
  block_id: string;
  intent_id: string;
  action: string;
  decision: string;
  receipt_hash: string;
  previous_hash: string;
  current_hash: string;
  ledger_signature: string | null;
  protocol_version: string;
  timestamp: string;
  recorded_by: string;
}

type FilterDecision = "all" | "approved" | "denied";
type FilterRisk = "all" | "low" | "medium" | "high" | "critical";

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

const ACTION_ICONS: Record<string, string> = {
  send_email: "\u2709",
  transfer_funds: "\uD83D\uDCB3",
  deploy_production: "\uD83D\uDE80",
  read_data: "\uD83C\uDFE5",
  read_file: "\uD83D\uDCC4",
  write_file: "\uD83D\uDCDD",
  create_event: "\uD83D\uDCC5",
  delete_database: "\uD83D\uDDD1",
};

const RISK_FROM_ACTION: Record<string, string> = {
  read_data: "LOW",
  read_file: "LOW",
  create_event: "LOW",
  write_file: "MEDIUM",
  send_email: "HIGH",
  deploy_production: "HIGH",
  transfer_funds: "CRITICAL",
  delete_database: "CRITICAL",
};

const RISK_COLORS: Record<string, string> = {
  LOW: "#22c55e",
  MEDIUM: "#f59e0b",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

export default function Dashboard() {
  const [filterDecision, setFilterDecision] = useState<FilterDecision>("all");
  const [filterRisk, setFilterRisk] = useState<FilterRisk>("all");

  const { data, isLoading, refetch } = trpc.rio.ledgerChain.useQuery({ limit: 200 });

  const entries: LedgerEntry[] = useMemo(() => {
    if (!data?.entries) return [];
    return (data.entries as LedgerEntry[]).reverse(); // newest first
  }, [data]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterDecision !== "all" && e.decision !== filterDecision) return false;
      if (filterRisk !== "all") {
        const risk = (RISK_FROM_ACTION[e.action] || "MEDIUM").toLowerCase();
        if (risk !== filterRisk) return false;
      }
      return true;
    });
  }, [entries, filterDecision, filterRisk]);

  // Stats
  const stats = useMemo(() => {
    const total = entries.length;
    const approved = entries.filter((e) => e.decision === "approved").length;
    const denied = entries.filter((e) => e.decision === "denied").length;
    return { total, approved, denied };
  }, [entries]);

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "oklch(0.13 0.03 260)", fontFamily: "'Outfit', sans-serif" }}
    >
      <NavBar />

      <div className="max-w-5xl mx-auto px-4 pt-12 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold" style={{ color: "#b8963e" }}>
              Governance Dashboard
            </h1>
            <p className="text-sm mt-1" style={{ color: "#9ca3af" }}>
              Every governed action, receipt, and ledger entry.
            </p>
          </div>
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

        {/* Stats Bar */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <StatCard label="Total Actions" value={stats.total} color="#b8963e" />
          <StatCard label="Approved" value={stats.approved} color="#22c55e" />
          <StatCard label="Denied" value={stats.denied} color="#ef4444" />
        </div>

        {/* Chain Integrity */}
        {data && (
          <div
            className="rounded-lg px-4 py-3 mb-6 flex items-center gap-2"
            style={{
              backgroundColor: data.chainValid ? "#22c55e10" : "#ef444410",
              border: `1px solid ${data.chainValid ? "#22c55e30" : "#ef444430"}`,
            }}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: data.chainValid ? "#22c55e" : "#ef4444" }}
            />
            <span className="text-xs font-medium" style={{ color: data.chainValid ? "#22c55e" : "#ef4444" }}>
              Ledger Chain: {data.chainValid ? "Intact" : "Broken"}
            </span>
            <span className="text-xs ml-auto" style={{ color: "#6b7280" }}>
              {entries.length} entries
            </span>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <FilterGroup
            label="Decision"
            options={[
              { value: "all", label: "All" },
              { value: "approved", label: "Approved" },
              { value: "denied", label: "Denied" },
            ]}
            selected={filterDecision}
            onChange={(v) => setFilterDecision(v as FilterDecision)}
          />
          <FilterGroup
            label="Risk"
            options={[
              { value: "all", label: "All" },
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
              { value: "critical", label: "Critical" },
            ]}
            selected={filterRisk}
            onChange={(v) => setFilterRisk(v as FilterRisk)}
          />
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div
              className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: "#b8963e", borderTopColor: "transparent" }}
            />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm mb-4" style={{ color: "#6b7280" }}>
              No governed actions yet.
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

        {/* Entry List */}
        <div className="space-y-3">
          {filtered.map((entry) => {
            const risk = RISK_FROM_ACTION[entry.action] || "MEDIUM";
            const riskColor = RISK_COLORS[risk] || "#f59e0b";
            const icon = ACTION_ICONS[entry.action] || "\u26A1";
            const label = ACTION_LABELS[entry.action] || entry.action;
            const isApproved = entry.decision === "approved";

            return (
              <div
                key={entry.block_id}
                className="rounded-lg border p-4"
                style={{
                  backgroundColor: "oklch(0.16 0.03 260)",
                  borderColor: isApproved ? "#22c55e20" : "#ef444420",
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                    style={{ backgroundColor: "oklch(0.2 0.03 260)" }}
                  >
                    {icon}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: "#e5e7eb" }}>
                        {label}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{
                          backgroundColor: isApproved ? "#22c55e20" : "#ef444420",
                          color: isApproved ? "#22c55e" : "#ef4444",
                        }}
                      >
                        {isApproved ? "APPROVED" : "DENIED"}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{
                          backgroundColor: riskColor + "20",
                          color: riskColor,
                        }}
                      >
                        {risk}
                      </span>
                    </div>

                    {/* Hashes */}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      <span className="text-[10px] font-mono" style={{ color: "#6b7280" }}>
                        Block: {entry.block_id}
                      </span>
                      <span className="text-[10px] font-mono" style={{ color: "#6b7280" }}>
                        Hash: {entry.current_hash?.slice(0, 16)}...
                      </span>
                    </div>

                    {/* Timestamp */}
                    <p className="text-[10px] mt-1" style={{ color: "#4b5563" }}>
                      {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "—"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
        © 2025–2026 RIO Protocol. All rights reserved.
      </footer>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
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

function FilterGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-medium mr-1" style={{ color: "#6b7280" }}>
        {label}:
      </span>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="px-3 py-1 rounded-full text-xs font-medium transition-all"
          style={{
            backgroundColor: selected === opt.value ? "oklch(0.25 0.03 260)" : "transparent",
            color: selected === opt.value ? "#e5e7eb" : "#6b7280",
            border: selected === opt.value ? "1px solid oklch(0.72 0.1 85 / 30%)" : "1px solid oklch(0.25 0.02 260)",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
