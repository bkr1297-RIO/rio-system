import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  ChevronDown,
  ChevronUp,
  Clock,
  Activity,
  Zap,
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────
function statusColor(status: string) {
  switch (status) {
    case "GREEN": return "text-emerald-400";
    case "RED": return "text-red-400";
    case "YELLOW": return "text-amber-400";
    default: return "text-zinc-500";
  }
}

function statusBg(status: string) {
  switch (status) {
    case "GREEN": return "bg-emerald-500/10 border-emerald-500/30";
    case "RED": return "bg-red-500/10 border-red-500/30";
    case "YELLOW": return "bg-amber-500/10 border-amber-500/30";
    default: return "bg-zinc-500/10 border-zinc-500/30";
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "GREEN": return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    case "RED": return <XCircle className="w-5 h-5 text-red-400" />;
    case "YELLOW": return <AlertTriangle className="w-5 h-5 text-amber-400" />;
    default: return <Eye className="w-5 h-5 text-zinc-500" />;
  }
}

function levelBadge(level: string) {
  const colors: Record<string, string> = {
    NONE: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    LOW: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    MODERATE: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    HIGH: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    CRITICAL: "bg-red-500/20 text-red-300 border-red-500/30",
  };
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${colors[level] || colors.LOW}`}>
      {level}
    </span>
  );
}

function dimensionLabel(dim: string) {
  const labels: Record<string, string> = {
    intent: "Intent Drift",
    objective: "Objective Drift",
    relational: "Relational Drift",
  };
  return labels[dim] || dim;
}

function dimensionIcon(dim: string) {
  switch (dim) {
    case "intent": return "🎯";
    case "objective": return "📐";
    case "relational": return "🔗";
    default: return "⚡";
  }
}

function timeAgo(ts: string | number) {
  const time = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const diff = Date.now() - time;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ─── Signal Card ────────────────────────────────────────────────
interface SignalProps {
  signal: {
    dimension: string;
    level: string;
    description: string;
    expected: string;
    observed: string;
    suggestedAction: string;
  };
}

function SignalCard({ signal }: SignalProps) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-zinc-300">
          {dimensionIcon(signal.dimension)} {dimensionLabel(signal.dimension)}
        </span>
        {levelBadge(signal.level)}
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">{signal.description}</p>
      {signal.expected && signal.observed && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="bg-zinc-900/50 rounded p-2">
            <span className="text-[10px] text-zinc-600 block mb-0.5">Expected</span>
            <span className="text-[10px] text-zinc-400">{signal.expected}</span>
          </div>
          <div className="bg-zinc-900/50 rounded p-2">
            <span className="text-[10px] text-zinc-600 block mb-0.5">Observed</span>
            <span className="text-[10px] text-zinc-400">{signal.observed}</span>
          </div>
        </div>
      )}
      {signal.suggestedAction && (
        <p className="text-xs text-zinc-500 mt-2 italic">
          Advisory: {signal.suggestedAction}
        </p>
      )}
    </div>
  );
}

// ─── History Row ────────────────────────────────────────────────
interface HistoryRowProps {
  record: {
    coherence_id: string;
    action_id: string | null;
    status: string;
    drift_detected: boolean;
    signals: SignalProps["signal"][];
    suggested_action: string | null;
    timestamp: string;
    triggered_by: string;
  };
}

function HistoryRow({ record }: HistoryRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-zinc-800/50 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 py-2.5 px-1 text-left hover:bg-zinc-800/30 transition-colors"
      >
        {statusIcon(record.status)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-400 truncate">
              {record.action_id || record.coherence_id.slice(0, 12)}
            </span>
            <span className="text-[10px] text-zinc-600">{timeAgo(record.timestamp)}</span>
          </div>
          <p className="text-xs text-zinc-500 truncate mt-0.5">
            {record.drift_detected
              ? `${record.signals.length} drift signal${record.signals.length !== 1 ? "s" : ""} detected`
              : "Coherent — no drift detected"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {record.signals.length > 0 && (
            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
              {record.signals.length} signal{record.signals.length !== 1 ? "s" : ""}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-zinc-600" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-1 pb-3 space-y-2">
          {record.signals.length > 0 ? (
            record.signals.map((s, i) => <SignalCard key={i} signal={s} />)
          ) : (
            <p className="text-xs text-zinc-600 px-2 py-1">No drift signals — action is coherent with system state.</p>
          )}
          {record.suggested_action && (
            <div className="bg-zinc-800/30 rounded-lg p-2.5 border border-zinc-700/30">
              <span className="text-[10px] text-zinc-500 block mb-1">Suggested Action</span>
              <p className="text-xs text-zinc-400">{record.suggested_action}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────
export default function CoherencePanel() {
  const { data, isLoading, error } = trpc.coherence.status.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur-sm rounded-xl border border-zinc-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 animate-pulse" />
          <div className="space-y-2 flex-1">
            <div className="h-4 w-40 bg-zinc-800 rounded animate-pulse" />
            <div className="h-3 w-24 bg-zinc-800 rounded animate-pulse" />
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-zinc-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur-sm rounded-xl border border-red-900/30 p-6">
        <div className="flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-400" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">Coherence Monitor Error</h3>
            <p className="text-xs text-red-400 mt-1">{error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur-sm rounded-xl border border-zinc-800 p-6">
        <div className="flex items-center gap-3">
          <Eye className="w-5 h-5 text-zinc-500" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">Coherence Monitor</h3>
            <p className="text-xs text-zinc-500 mt-1">No coherence data available</p>
          </div>
        </div>
      </div>
    );
  }

  const state = data;

  return (
    <div className="bg-zinc-900/80 backdrop-blur-sm rounded-xl border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${statusBg(state.status)}`}>
              <Shield className={`w-5 h-5 ${statusColor(state.status)}`} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                Coherence Monitor
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${statusBg(state.status)} ${statusColor(state.status)}`}>
                  {state.status}
                </span>
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Meta-governance witness layer — read-only, advisory
              </p>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-zinc-600" />
            <span className="text-xs text-zinc-400">
              <span className="font-mono text-zinc-300">{state.totalChecks}</span> checks
            </span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-zinc-600" />
            <span className="text-xs text-zinc-400">
              <span className={`font-mono ${state.activeWarnings.length > 0 ? "text-amber-400" : "text-zinc-300"}`}>
                {state.activeWarnings.length}
              </span> active warnings
            </span>
          </div>
          {state.lastCheck && (
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-zinc-600" />
              <span className="text-xs text-zinc-500">
                Last: {timeAgo(state.lastCheck.timestamp)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Active Warnings */}
      {state.activeWarnings.length > 0 && (
        <div className="p-4 border-b border-zinc-800 bg-amber-950/10">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-medium text-amber-400">Active Warnings</span>
          </div>
          <div className="space-y-2">
            {state.activeWarnings.slice(0, 5).map((w, i) => (
              <SignalCard key={i} signal={w} />
            ))}
          </div>
        </div>
      )}

      {/* Last Check Signals */}
      {state.lastCheck && state.lastCheck.signals.length > 0 && (
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-400">Latest Check Signals</span>
          </div>
          <div className="space-y-2">
            {state.lastCheck.signals.slice(0, 3).map((s, i) => (
              <SignalCard key={i} signal={s} />
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {state.history.length > 0 && (
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-400">Recent History</span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {state.history.map((record) => (
              <HistoryRow key={record.coherence_id} record={record} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {state.totalChecks === 0 && (
        <div className="p-8 text-center">
          <Eye className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">No coherence checks yet</p>
          <p className="text-xs text-zinc-600 mt-1">
            Checks run automatically when actions are proposed through the approval pipeline
          </p>
        </div>
      )}
    </div>
  );
}
