/**
 * Status — Gateway health, policy, and system status.
 * Uses Gateway-direct /health endpoint.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGatewayAuth } from "@/hooks/useGatewayAuth";
import BottomNav from "@/components/BottomNav";
import { getGatewayToken } from "@/lib/gateway";
import {
  Activity,
  RefreshCw,
  Shield,
  Lock,
  Database,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || "";

interface HealthData {
  status: string;
  version?: string;
  gateway?: string;
  governance?: {
    constitution_loaded?: boolean;
    policy_v1_loaded?: boolean;
    policy_v2?: {
      active?: boolean;
      version?: string;
      hash?: string;
      action_classes?: number;
    };
    system_mode?: string;
  };
  ledger?: {
    entries?: number;
    chain_valid?: boolean;
    chain_tip?: string;
  };
  pipeline_stats?: {
    total?: number;
    submitted?: number;
    governed?: number;
    authorized?: number;
    denied?: number;
    executed?: number;
    receipted?: number;
    blocked?: number;
  };
  hardening?: {
    ed25519_mode?: string;
    token_burn?: boolean;
    replay_prevention?: boolean;
    active_tokens?: number;
  };
  principals?: {
    enforcement?: string;
    role_gating?: boolean;
    fail_closed?: boolean;
  };
  fail_mode?: string;
}

function StatusDot({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
  ) : (
    <XCircle className="h-4 w-4 text-red-400 shrink-0" />
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/30 bg-card/30 p-3">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Status() {
  const { loading: gwLoading, isAuthenticated } = useGatewayAuth();
  const [, navigate] = useLocation();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gwLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [gwLoading, isAuthenticated, navigate]);

  async function fetchHealth() {
    setLoading(true);
    setError(null);
    try {
      const token = getGatewayToken();
      const res = await fetch(`${GATEWAY_URL}/health`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        setHealth(await res.json());
      } else {
        setError(`Gateway returned ${res.status}`);
      }
    } catch {
      setError("Could not reach Gateway");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated) fetchHealth();
  }, [isAuthenticated]);

  if (gwLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const mode = health?.governance?.system_mode || "—";
  const modeColor =
    mode === "NORMAL"
      ? "text-emerald-400"
      : mode === "LOCKDOWN"
      ? "text-red-400"
      : "text-amber-400";

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              System Status
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Gateway health and governance state
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchHealth}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        {health && (
          <div className="space-y-4">
            {/* Gateway status */}
            <div className="rounded-xl border border-border/40 bg-card/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Gateway
                </h2>
                <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">
                  v{health.version || "?"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Status" value={health.status === "operational" ? "Operational" : health.status} />
                <StatCard label="Mode" value={mode} sub={modeColor.includes("emerald") ? "All systems normal" : "Restricted"} />
              </div>
            </div>

            {/* Governance */}
            {health.governance && (
              <div className="rounded-xl border border-border/40 bg-card/50 p-4">
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Governance
                </h2>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Constitution</span>
                    <StatusDot ok={!!health.governance.constitution_loaded} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Policy v2</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px]">
                        {health.governance.policy_v2?.version || "—"}
                      </span>
                      <StatusDot ok={!!health.governance.policy_v2?.active} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Action classes</span>
                    <span className="font-medium">
                      {health.governance.policy_v2?.action_classes || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">System mode</span>
                    <span className={`font-medium ${modeColor}`}>{mode}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Ledger */}
            {health.ledger && (
              <div className="rounded-xl border border-border/40 bg-card/50 p-4">
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Ledger
                </h2>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Entries</span>
                    <span className="font-medium">{health.ledger.entries}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Chain valid</span>
                    <StatusDot ok={!!health.ledger.chain_valid} />
                  </div>
                  {health.ledger.chain_tip && (
                    <div className="text-[10px] font-mono text-muted-foreground/60 truncate">
                      Tip: {health.ledger.chain_tip}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pipeline stats */}
            {health.pipeline_stats && (
              <div className="rounded-xl border border-border/40 bg-card/50 p-4">
                <h2 className="text-sm font-semibold mb-3">Pipeline Stats</h2>
                <div className="grid grid-cols-4 gap-2">
                  <StatCard label="Submitted" value={health.pipeline_stats.submitted || 0} />
                  <StatCard label="Governed" value={health.pipeline_stats.governed || 0} />
                  <StatCard label="Executed" value={health.pipeline_stats.executed || 0} />
                  <StatCard label="Denied" value={health.pipeline_stats.denied || 0} />
                </div>
              </div>
            )}

            {/* Hardening */}
            {health.hardening && (
              <div className="rounded-xl border border-border/40 bg-card/50 p-4">
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Hardening
                </h2>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Ed25519</span>
                    <span className="font-medium">{health.hardening.ed25519_mode}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Token burn</span>
                    <StatusDot ok={!!health.hardening.token_burn} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Replay prevention</span>
                    <StatusDot ok={!!health.hardening.replay_prevention} />
                  </div>
                </div>
              </div>
            )}

            {/* Principals */}
            {health.principals && (
              <div className="rounded-xl border border-border/40 bg-card/50 p-4">
                <h2 className="text-sm font-semibold mb-3">Principal Enforcement</h2>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Enforcement</span>
                    <span className="font-medium">{health.principals.enforcement}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Role gating</span>
                    <StatusDot ok={!!health.principals.role_gating} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Fail closed</span>
                    <StatusDot ok={!!health.principals.fail_closed} />
                  </div>
                </div>
              </div>
            )}

            {/* Fail mode */}
            <div className="rounded-lg border border-border/30 bg-card/20 p-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">System fail mode</span>
              <span className={`text-xs font-semibold ${
                health.fail_mode === "closed" ? "text-emerald-400" : "text-red-400"
              }`}>
                {health.fail_mode === "closed" ? "FAIL-CLOSED" : health.fail_mode?.toUpperCase()}
              </span>
            </div>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
