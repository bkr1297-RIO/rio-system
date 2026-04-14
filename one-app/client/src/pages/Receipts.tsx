/**
 * Receipts — View execution receipts from the Gateway ledger.
 * Receipts are cryptographic proof that an action was executed through governance.
 * Source: Gateway ledger via server-side tRPC proxy (handles auth automatically).
 */
import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import BottomNav from "@/components/BottomNav";
import { FileCheck, RefreshCw, Hash, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Receipt-related entry types from Gateway ledger
const RECEIPT_TYPES = new Set(["receipt", "execution", "EXECUTION", "TOOL_EXECUTION", "EMAIL_DELIVERY"]);

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

export default function Receipts() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [authLoading, user, navigate]);

  // Fetch ledger via server-side tRPC proxy
  const { data, isLoading, error, refetch } = trpc.gateway.ledger.useQuery(
    { limit: 200 },
    { enabled: !!user }
  );

  // Filter for receipt/execution entries
  const receipts = useMemo(() => {
    if (!data?.ok || !data.entries) return [];
    return (data.entries as LedgerEntry[])
      .filter((e) => RECEIPT_TYPES.has(e.status))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [data]);

  const loading = authLoading || isLoading;

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
              <FileCheck className="h-5 w-5 text-primary" />
              Receipts
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Cryptographic proof of governed execution — Gateway ledger
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

        {/* Content */}
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 mb-4">
            {error.message || "Failed to fetch receipts"}
          </div>
        )}

        {data && !data.ok && data.error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 mb-4">
            {data.error}
          </div>
        )}

        {!loading && receipts.length === 0 && !error && (
          <div className="rounded-xl border border-border/40 bg-card/50 p-8 text-center">
            <FileCheck className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No receipts yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Receipts are generated after governed actions are executed through the Gateway
            </p>
          </div>
        )}

        <div className="space-y-3">
          {receipts.map((r) => (
            <div
              key={r.entry_id || r.id}
              className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="font-medium text-sm">
                    {(r.action || r.status || "unknown").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400">
                  {r.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {r.agent_id && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="text-[10px]">Agent: {r.agent_id}</span>
                  </div>
                )}
                {r.timestamp && (
                  <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                    <Clock className="h-3 w-3" />
                    <span>{new Date(r.timestamp).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Hash chain */}
              <div className="rounded-lg bg-background/50 p-2 space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                  <Hash className="h-3 w-3 shrink-0" />
                  <span className="truncate">Ledger Hash: {r.ledger_hash}</span>
                </div>
                {r.intent_id && (
                  <div className="text-[10px] font-mono text-muted-foreground/60 pl-4 truncate">
                    Intent: {r.intent_id}
                  </div>
                )}
                {r.receipt_hash && (
                  <div className="text-[10px] font-mono text-muted-foreground/60 pl-4 truncate">
                    Receipt Hash: {r.receipt_hash}
                  </div>
                )}
                {r.prev_hash && (
                  <div className="text-[10px] font-mono text-muted-foreground/60 pl-4 truncate">
                    Prev: {r.prev_hash}
                  </div>
                )}
              </div>

              {/* Entry ID */}
              <div className="text-[10px] text-muted-foreground/50 font-mono truncate">
                {r.entry_id}
              </div>
            </div>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
