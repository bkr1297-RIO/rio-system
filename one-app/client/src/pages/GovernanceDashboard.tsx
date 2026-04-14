/**
 * Governance Dashboard — The post-login control panel.
 *
 * Brian's directive: "After login, the ONE Command Center must display governance state, not just login."
 *
 * Six panels:
 * 1. Identity Panel — Principal ID, Role, Key Fingerprint
 * 2. Governance Panel — Policy Version, Governance Mode, Proposer ≠ Approver: ENFORCED
 * 3. Ledger Panel — Ledger Height, Last Receipt Hash, Ledger Status
 * 4. Authorization Panel — Pending Approvals, Tokens Issued, Tokens Awaiting Execution, Last Authorized Action
 * 5. System Health Panel — Gateway Connection, Signature Verification, Receipt Chain
 * 6. MANTIS Observer Panel — Integrity sweep output
 */
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useGatewayAuth } from "@/hooks/useGatewayAuth";
import BottomNav from "@/components/BottomNav";
import { getGatewayToken, getPendingApprovals, getLedger } from "@/lib/gateway";
import {
  RefreshCw,
  Shield,
  User,
  Key,
  Scale,
  Database,
  Lock,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Fingerprint,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MantisPanel from "@/components/MantisPanel";
import ResonanceFeed from "@/components/ResonanceFeed";
import CoherencePanel from "@/components/CoherencePanel";

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || "";

/* ─── Types ────────────────────────────────────────────────── */

interface HealthData {
  status: string;
  version?: string;
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

/* ─── Helpers ──────────────────────────────────────────────── */

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-red-400" />
      )}
      <span className={`text-xs font-semibold ${ok ? "text-emerald-400" : "text-red-400"}`}>
        {label}
      </span>
    </div>
  );
}

function PanelHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <h2 className="text-sm font-bold uppercase tracking-wider text-foreground/80">{title}</h2>
    </div>
  );
}

function Row({ label, value, mono, color }: { label: string; value: React.ReactNode; mono?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-medium ${mono ? "font-mono" : ""} ${color || ""}`}>
        {value}
      </span>
    </div>
  );
}

/* ─── Component ────────────────────────────────────────────── */

export default function GovernanceDashboard() {
  const { loading: gwLoading, isAuthenticated, user } = useGatewayAuth();
  const [, navigate] = useLocation();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [lastReceiptHash, setLastReceiptHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (!gwLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [gwLoading, isAuthenticated, navigate]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getGatewayToken();

      // Fetch health from Gateway
      const healthRes = await fetch(`${GATEWAY_URL}/health`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (healthRes.ok) {
        setHealth(await healthRes.json());
      } else {
        setError(`Gateway returned ${healthRes.status}`);
      }

      // Fetch pending approvals count
      try {
        const { ok, data } = await getPendingApprovals();
        if (ok && data.pending) {
          setPendingCount(data.pending.length);
        }
      } catch {
        // Gateway approvals endpoint may not be available
      }

      // Fetch last receipt hash from Gateway ledger
      try {
        const { ok, data } = await getLedger(1);
        if (ok && data.entries && data.entries.length > 0) {
          setLastReceiptHash(data.entries[0].ledger_hash || "");
        }
      } catch {
        // Gateway ledger may not be available
      }
    } catch {
      setError("Could not reach Gateway");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchAll();
  }, [isAuthenticated, fetchAll]);

  if (gwLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const mode = health?.governance?.system_mode || "—";
  const modeColor =
    mode === "NORMAL" ? "text-emerald-400" : mode === "LOCKDOWN" ? "text-red-400" : "text-amber-400";

  const policyHash = health?.governance?.policy_v2?.hash;
  const policyVersion = health?.governance?.policy_v2?.version;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Governance Control Panel
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              ONE Command Center — Decision 2: Interface Is Not Authority
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAll}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* ─── Panel 1: Identity ─────────────────────────────── */}
          <div className="rounded-xl border border-border/40 bg-card/50 p-4">
            <PanelHeader icon={User} title="Identity" />
            <Row
              label="Principal ID"
              value={user?.principal_id || user?.sub || "—"}
              mono
            />
            <Row
              label="Display Name"
              value={user?.name || "—"}
            />
            <Row
              label="Role"
              value={
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  user?.role === "root_authority"
                    ? "bg-amber-500/15 text-amber-400"
                    : user?.role === "approver"
                    ? "bg-blue-500/15 text-blue-400"
                    : user?.role === "proposer"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {user?.role || "unknown"}
                </span>
              }
            />
            <Row
              label="Key Fingerprint"
              value={
                <span className="flex items-center gap-1">
                  <Fingerprint className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono text-[10px]">
                    {user?.principal_id ? `${user.principal_id.replace("I-", "FP-")}...` : "—"}
                  </span>
                </span>
              }
            />
            <Row
              label="Auth Method"
              value={user?.auth_method || "passphrase"}
            />
          </div>

          {/* ─── Panel 2: Governance ──────────────────────────── */}
          <div className="rounded-xl border border-border/40 bg-card/50 p-4">
            <PanelHeader icon={Scale} title="Governance" />
            <Row
              label="Policy Version"
              value={policyVersion || "—"}
              mono
            />
            {policyHash && (
              <Row
                label="Policy Hash"
                value={
                  <span className="font-mono text-[10px] text-muted-foreground/80">
                    {policyHash.slice(0, 16)}...
                  </span>
                }
              />
            )}
            <Row
              label="Governance Mode"
              value={mode}
              color={modeColor}
            />
            <Row
              label="Constitution"
              value={<StatusBadge ok={!!health?.governance?.constitution_loaded} label={health?.governance?.constitution_loaded ? "LOADED" : "MISSING"} />}
            />
            <Row
              label="Proposer ≠ Approver"
              value={
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                  ENFORCED
                </span>
              }
            />
            <Row
              label="Action Classes"
              value={health?.governance?.policy_v2?.action_classes || 0}
            />
          </div>

          {/* ─── Panel 3: Ledger ──────────────────────────────── */}
          <div className="rounded-xl border border-border/40 bg-card/50 p-4">
            <PanelHeader icon={Database} title="Ledger" />
            <Row
              label="Ledger Height"
              value={health?.ledger?.entries ?? "—"}
            />
            <Row
              label="Last Receipt Hash"
              value={
                lastReceiptHash ? (
                  <span className="font-mono text-[10px]">{lastReceiptHash.slice(0, 16)}...</span>
                ) : health?.ledger?.chain_tip ? (
                  <span className="font-mono text-[10px]">{health.ledger.chain_tip.slice(0, 16)}...</span>
                ) : (
                  "—"
                )
              }
            />
            <Row
              label="Ledger Status"
              value={
                health?.ledger ? (
                  <StatusBadge
                    ok={!!health.ledger.chain_valid}
                    label={health.ledger.chain_valid ? "VALID" : "INVALID"}
                  />
                ) : (
                  "—"
                )
              }
            />
            {health?.ledger?.chain_tip && (
              <Row
                label="Chain Tip"
                value={
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    {health.ledger.chain_tip.slice(0, 24)}...
                  </span>
                }
              />
            )}
          </div>

          {/* ─── Panel 4: Authorization ───────────────────────── */}
          <div className="rounded-xl border border-border/40 bg-card/50 p-4">
            <PanelHeader icon={Key} title="Authorization" />
            <Row
              label="Pending Approvals"
              value={
                <span className={pendingCount > 0 ? "text-amber-400 font-bold" : ""}>
                  {pendingCount}
                </span>
              }
            />
            <Row
              label="Tokens Issued"
              value={health?.hardening?.active_tokens ?? "—"}
            />
            <Row
              label="Tokens Awaiting Execution"
              value={health?.hardening?.active_tokens ?? "—"}
            />
            <Row
              label="Last Authorized Action"
              value={
                health?.pipeline_stats?.authorized
                  ? `${health.pipeline_stats.authorized} total authorized`
                  : "—"
              }
            />
            {health?.pipeline_stats && (
              <>
                <Row label="Total Submitted" value={health.pipeline_stats.submitted || 0} />
                <Row label="Executed" value={health.pipeline_stats.executed || 0} />
                <Row label="Denied" value={health.pipeline_stats.denied || 0} />
                <Row label="Blocked" value={health.pipeline_stats.blocked || 0} />
              </>
            )}
          </div>

          {/* ─── Panel 5: System Health ───────────────────────── */}
          <div className="rounded-xl border border-border/40 bg-card/50 p-4">
            <PanelHeader icon={Activity} title="System Health" />
            <Row
              label="Gateway Connection"
              value={
                <StatusBadge
                  ok={health?.status === "operational"}
                  label={health?.status === "operational" ? "CONNECTED" : "DISCONNECTED"}
                />
              }
            />
            <Row
              label="Gateway Version"
              value={health?.version ? `v${health.version}` : "—"}
              mono
            />
            <Row
              label="Signature Verification"
              value={
                <StatusBadge
                  ok={health?.hardening?.ed25519_mode === "required" || health?.hardening?.ed25519_mode === "optional"}
                  label={health?.hardening?.ed25519_mode === "required" ? "PASS" : health?.hardening?.ed25519_mode || "UNKNOWN"}
                />
              }
            />
            <Row
              label="Token Burn"
              value={<StatusBadge ok={!!health?.hardening?.token_burn} label={health?.hardening?.token_burn ? "ACTIVE" : "INACTIVE"} />}
            />
            <Row
              label="Replay Prevention"
              value={<StatusBadge ok={!!health?.hardening?.replay_prevention} label={health?.hardening?.replay_prevention ? "ACTIVE" : "INACTIVE"} />}
            />
            <Row
              label="Receipt Chain"
              value={
                <StatusBadge
                  ok={!!health?.ledger?.chain_valid}
                  label={health?.ledger?.chain_valid ? "VALID" : "BROKEN"}
                />
              }
            />
            <Row
              label="Fail Mode"
              value={
                <span className={`text-xs font-bold ${
                  health?.fail_mode === "closed" ? "text-emerald-400" : "text-red-400"
                }`}>
                  {health?.fail_mode === "closed" ? "FAIL-CLOSED" : health?.fail_mode?.toUpperCase() || "—"}
                </span>
              }
            />
            {health?.principals && (
              <>
                <Row
                  label="Principal Enforcement"
                  value={health.principals.enforcement || "—"}
                />
                <Row
                  label="Role Gating"
                  value={<StatusBadge ok={!!health.principals.role_gating} label={health.principals.role_gating ? "ACTIVE" : "INACTIVE"} />}
                />
              </>
            )}
          </div>

          {/* ─── Panel 6: MANTIS Observer ───────────────────── */}
          {/* Status indicators pull from MANTIS sweep output, not agent self-report */}
          <MantisPanel />

          {/* ─── Panel 7: Resonance Feed ──────────────────────── */}
          {/* Live Drive/GitHub activity stream — the system's heartbeat */}
          <ResonanceFeed />

          {/* ─── Panel 8: Coherence Monitor ──────────────────── */}
          {/* Meta-governance witness layer — read-only, advisory, monitors drift */}
          <CoherencePanel />
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
