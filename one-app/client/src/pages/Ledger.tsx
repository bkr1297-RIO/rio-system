/**
 * Ledger — View the tamper-evident, hash-chained ledger from the Gateway.
 * Uses Gateway-direct calls (not tRPC proxy).
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGatewayAuth } from "@/hooks/useGatewayAuth";
import BottomNav from "@/components/BottomNav";
import { getLedger, type LedgerEntry } from "@/lib/gateway";
import {
  BookOpen,
  RefreshCw,
  Hash,
  Link2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const TYPE_COLORS: Record<string, string> = {
  intent_submitted: "text-blue-400 bg-blue-500/10",
  governance_decision: "text-amber-400 bg-amber-500/10",
  approval: "text-emerald-400 bg-emerald-500/10",
  execution: "text-purple-400 bg-purple-500/10",
  receipt: "text-cyan-400 bg-cyan-500/10",
  denial: "text-red-400 bg-red-500/10",
  ONBOARD: "text-blue-400 bg-blue-500/10",
  INTENT: "text-purple-400 bg-purple-500/10",
  APPROVAL: "text-emerald-400 bg-emerald-500/10",
  EXECUTION: "text-amber-400 bg-amber-500/10",
  KILL: "text-red-400 bg-red-500/10",
  SYNC: "text-cyan-400 bg-cyan-500/10",
};

export default function Ledger() {
  const { loading: gwLoading, isAuthenticated } = useGatewayAuth();
  const [, navigate] = useLocation();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (!gwLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [gwLoading, isAuthenticated, navigate]);

  async function fetchLedger() {
    setLoading(true);
    setError(null);
    try {
      const result = await getLedger(100);
      if (result.ok) {
        setEntries(result.data.entries || []);
      } else {
        setError("Failed to fetch ledger");
      }
    } catch {
      setError("Could not reach Gateway");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated) fetchLedger();
  }, [isAuthenticated]);

  // Verify chain integrity client-side
  function verifyChainLink(entry: LedgerEntry, prevEntry: LedgerEntry | null): boolean {
    if (!prevEntry) return true; // Genesis
    return entry.prev_hash === prevEntry.payload_hash;
  }

  if (gwLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const chainValid = entries.every((e, i) =>
    i === 0 ? true : verifyChainLink(e, entries[i - 1])
  );

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Ledger
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {entries.length} entries in tamper-evident hash chain
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLedger}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Chain verification banner */}
        {entries.length > 0 && (
          <div
            className={`rounded-lg border p-3 mb-4 flex items-center gap-3 ${
              chainValid
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-red-500/30 bg-red-500/5"
            }`}
          >
            {chainValid ? (
              <>
                <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-emerald-400">Chain Valid</div>
                  <div className="text-xs text-muted-foreground">
                    {entries.length} entries verified. No tampering detected.
                  </div>
                </div>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-red-400">Chain Integrity Warning</div>
                  <div className="text-xs text-muted-foreground">
                    One or more chain links could not be verified.
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && entries.length === 0 && !error && (
          <div className="rounded-xl border border-border/40 bg-card/50 p-8 text-center">
            <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Ledger is empty</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Entries appear as governed actions are processed
            </p>
          </div>
        )}

        {/* Ledger entries */}
        <div className="space-y-0">
          {entries.map((entry, i) => {
            const isExpanded = expandedId === entry.id;
            const typeColor =
              TYPE_COLORS[entry.entry_type] || "text-gray-400 bg-gray-500/10";
            const isLast = i === entries.length - 1;
            const linkValid = verifyChainLink(entry, i > 0 ? entries[i - 1] : null);

            return (
              <div key={entry.id} className="relative">
                {/* Chain connector */}
                {!isLast && (
                  <div className="absolute left-5 top-12 bottom-0 w-px bg-border/30" />
                )}

                <button
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="w-full text-left rounded-xl border border-border/30 bg-card/30 hover:bg-card/50 p-3 mb-2 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-background/50 shrink-0">
                      <Link2 className="h-4 w-4 text-muted-foreground" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeColor}`}
                        >
                          {entry.entry_type.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          #{entry.id}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-medium truncate">
                          {entry.action}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          by {entry.actor}
                        </span>
                      </div>
                    </div>

                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border/20 space-y-2">
                      {entry.intent_id && (
                        <div className="text-[10px] text-muted-foreground">
                          <span className="font-medium">Intent:</span>{" "}
                          <span className="font-mono">{entry.intent_id}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/70">
                        <Hash className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          Payload: {entry.payload_hash}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/50">
                        <Link2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          Prev: {entry.prev_hash}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/50">
                        {new Date(entry.created_at).toLocaleString()}
                      </div>

                      {/* Chain link verification */}
                      <div className="flex items-center gap-2 text-[10px] font-mono">
                        <span className="text-muted-foreground">Chain link:</span>
                        {i === 0 ? (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Genesis
                          </span>
                        ) : linkValid ? (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Valid
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-400">
                            <XCircle className="h-3 w-3" /> Broken
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
