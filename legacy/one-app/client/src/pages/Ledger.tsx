/**
 * Ledger — View the tamper-evident, hash-chained ledger.
 * Source: Gateway ledger via server-side tRPC proxy (handles auth automatically).
 */
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import BottomNav from "@/components/BottomNav";
import {
  BookOpen,
  RefreshCw,
  Hash,
  Link2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface LedgerEntry {
  id: number;
  entry_id: string;
  intent_id?: string;
  action: string;
  agent_id: string;
  status: string;
  detail?: string;
  intent_hash?: string | null;
  authorization_hash?: string | null;
  execution_hash?: string | null;
  receipt_hash?: string | null;
  ledger_hash: string;
  prev_hash: string;
  timestamp: string;
}

const TYPE_COLORS: Record<string, string> = {
  intent_submitted: "text-blue-400 bg-blue-500/10",
  governance_decision: "text-amber-400 bg-amber-500/10",
  approval: "text-emerald-400 bg-emerald-500/10",
  execution: "text-purple-400 bg-purple-500/10",
  receipt: "text-cyan-400 bg-cyan-500/10",
  denial: "text-red-400 bg-red-500/10",
  ONBOARD: "text-blue-400 bg-blue-500/10",
  INTENT_CREATED: "text-purple-400 bg-purple-500/10",
  INTENT: "text-purple-400 bg-purple-500/10",
  APPROVAL: "text-emerald-400 bg-emerald-500/10",
  APPROVAL_CREATED: "text-emerald-400 bg-emerald-500/10",
  TOOL_EXECUTION: "text-amber-400 bg-amber-500/10",
  EXECUTION: "text-amber-400 bg-amber-500/10",
  KILL: "text-red-400 bg-red-500/10",
  SYNC: "text-cyan-400 bg-cyan-500/10",
  EMAIL_DELIVERY: "text-teal-400 bg-teal-500/10",
};

export default function Ledger() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [authLoading, user, navigate]);

  // Fetch ledger via server-side tRPC proxy
  const { data, isLoading, error, refetch } = trpc.gateway.ledger.useQuery(
    { limit: 100 },
    { enabled: !!user }
  );

  // Sort entries newest first
  const entries = useMemo(() => {
    if (!data?.ok || !data.entries) return [];
    return [...(data.entries as LedgerEntry[])].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [data]);

  const loading = authLoading || isLoading;

  // Verify chain integrity client-side
  function verifyChainLink(entry: LedgerEntry, prevEntry: LedgerEntry | null): boolean {
    if (!prevEntry) return true; // Genesis
    return entry.prev_hash === prevEntry.ledger_hash;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Ledger
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Tamper-evident hash chain — Gateway only
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Ledger height */}
        <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
          <DatabaseIcon className="h-3.5 w-3.5" />
          <span>{entries.length} entries loaded</span>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 mb-4">
            {error.message || "Failed to fetch ledger"}
          </div>
        )}

        {data && !data.ok && data.error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 mb-4">
            {data.error}
          </div>
        )}

        {/* Empty */}
        {!loading && entries.length === 0 && !error && (
          <div className="rounded-xl border border-border/40 bg-card/50 p-8 text-center">
            <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No ledger entries</p>
          </div>
        )}

        {/* Entries */}
        <div className="space-y-2">
          {entries.map((entry, idx) => {
            const prevEntry = idx < entries.length - 1 ? entries[idx + 1] : null;
            const chainValid = verifyChainLink(entry, prevEntry);
            const typeColor = TYPE_COLORS[entry.status] || "text-muted-foreground bg-muted/30";
            const isExpanded = expandedId === entry.entry_id;

            return (
              <div
                key={entry.entry_id || entry.id}
                className="rounded-xl border border-border/40 bg-card/50 overflow-hidden"
              >
                {/* Summary row */}
                <button
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/5 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : entry.entry_id)}
                >
                  {/* Chain link indicator */}
                  <div className="shrink-0">
                    {chainValid ? (
                      <Link2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400" />
                    )}
                  </div>

                  {/* Type badge */}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${typeColor}`}>
                    {entry.status}
                  </span>

                  {/* Action */}
                  <span className="text-xs font-medium truncate flex-1">
                    {entry.action || "\u2014"}
                  </span>

                  {/* Agent */}
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {entry.agent_id || "\u2014"}
                  </span>

                  {/* Timestamp */}
                  <span className="text-[10px] text-muted-foreground/60 shrink-0">
                    {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : "\u2014"}
                  </span>

                  {isExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border/30 p-3 space-y-2 bg-background/30">
                    <div className="grid grid-cols-1 gap-1.5 text-[10px] font-mono text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Hash className="h-3 w-3 shrink-0" />
                        <span className="truncate">Entry: {entry.entry_id}</span>
                      </div>
                      {entry.intent_id && (
                        <div className="pl-4 truncate">Intent: {entry.intent_id}</div>
                      )}
                      <div className="pl-4 truncate">
                        Ledger Hash: {entry.ledger_hash}
                      </div>
                      <div className="pl-4 truncate">
                        Prev Hash: {entry.prev_hash || "GENESIS"}
                      </div>
                      {entry.intent_hash && (
                        <div className="pl-4 truncate">Intent Hash: {entry.intent_hash}</div>
                      )}
                      {entry.authorization_hash && (
                        <div className="pl-4 truncate">Auth Hash: {entry.authorization_hash}</div>
                      )}
                      {entry.execution_hash && (
                        <div className="pl-4 truncate">Exec Hash: {entry.execution_hash}</div>
                      )}
                      {entry.receipt_hash && (
                        <div className="pl-4 truncate">Receipt Hash: {entry.receipt_hash}</div>
                      )}
                      {entry.detail && (
                        <div className="pl-4 truncate">Detail: {entry.detail}</div>
                      )}
                    </div>

                    {/* Chain verification badge */}
                    <div className="flex items-center gap-1.5 pt-1">
                      {chainValid ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          <span className="text-[10px] text-emerald-400">Chain link verified</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3 text-red-400" />
                          <span className="text-[10px] text-red-400">Chain break detected</span>
                        </>
                      )}
                    </div>

                    {/* Timestamp */}
                    <div className="text-[10px] text-muted-foreground/50">
                      {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "\u2014"}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}
