/**
 * Receipts — View execution receipts from the Gateway.
 * Receipts are cryptographic proof that an action was executed through governance.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGatewayAuth } from "@/hooks/useGatewayAuth";
import BottomNav from "@/components/BottomNav";
import { FileCheck, RefreshCw, Hash, Clock, User, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getGatewayToken } from "@/lib/gateway";

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || "";

interface Receipt {
  receipt_hash: string;
  intent_id: string;
  action: string;
  agent_id?: string;
  principal_id?: string;
  governance_decision?: string;
  risk_tier?: string;
  executed_at?: string;
  created_at?: string;
  intent_hash?: string;
  governance_hash?: string;
  authorization_hash?: string;
  execution_hash?: string;
}

export default function Receipts() {
  const { loading: gwLoading, isAuthenticated } = useGatewayAuth();
  const [, navigate] = useLocation();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gwLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [gwLoading, isAuthenticated, navigate]);

  async function fetchReceipts() {
    setLoading(true);
    setError(null);
    try {
      const token = getGatewayToken();
      const res = await fetch(`${GATEWAY_URL}/receipts`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        setReceipts(data.receipts || data || []);
      } else if (res.status === 404) {
        // Endpoint may not exist yet
        setReceipts([]);
      } else {
        setError(`Failed to fetch receipts (${res.status})`);
      }
    } catch (err) {
      setError("Could not reach Gateway");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated) fetchReceipts();
  }, [isAuthenticated]);

  if (gwLoading) {
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
              Cryptographic proof of governed execution
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchReceipts}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Content */}
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        {!loading && receipts.length === 0 && !error && (
          <div className="rounded-xl border border-border/40 bg-card/50 p-8 text-center">
            <FileCheck className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No receipts yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Receipts are generated after governed actions are executed
            </p>
          </div>
        )}

        <div className="space-y-3">
          {receipts.map((r, i) => (
            <div
              key={r.receipt_hash || i}
              className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-emerald-400" />
                  <span className="font-medium text-sm">{r.action}</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  r.risk_tier === "CRITICAL" ? "bg-red-500/10 text-red-400" :
                  r.risk_tier === "HIGH" ? "bg-orange-500/10 text-orange-400" :
                  r.risk_tier === "MEDIUM" ? "bg-amber-500/10 text-amber-400" :
                  "bg-emerald-500/10 text-emerald-400"
                }`}>
                  {r.risk_tier || "—"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {r.agent_id && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span>Agent: {r.agent_id}</span>
                  </div>
                )}
                {r.principal_id && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span>Principal: {r.principal_id}</span>
                  </div>
                )}
                {(r.executed_at || r.created_at) && (
                  <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                    <Clock className="h-3 w-3" />
                    <span>{new Date(r.executed_at || r.created_at!).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Hash chain */}
              <div className="rounded-lg bg-background/50 p-2 space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                  <Hash className="h-3 w-3 shrink-0" />
                  <span className="truncate">Receipt: {r.receipt_hash}</span>
                </div>
                {r.intent_hash && (
                  <div className="text-[10px] font-mono text-muted-foreground/60 pl-4 truncate">
                    Intent: {r.intent_hash}
                  </div>
                )}
                {r.governance_hash && (
                  <div className="text-[10px] font-mono text-muted-foreground/60 pl-4 truncate">
                    Governance: {r.governance_hash}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
