/**
 * Trust Policies Page — Phase 2E
 * ────────────────────────────────
 * Manage trust policies that control delegated auto-approval.
 * Shows: active policies, trust levels, categories, conditions.
 * Actions: Create, Update, Deactivate.
 *
 * Invariant: Creating/updating a trust policy is a governed action
 * (logged to the ledger). Changing policy preferences requires
 * explicit approval + receipt.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Shield, ShieldCheck, ShieldAlert, ShieldOff,
  Plus, Pencil, Trash2, AlertTriangle, CheckCircle2,
  Info, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

/* ─── Trust Level Display ──────────────────────────────────── */
const TRUST_LEVELS: Record<number, { label: string; description: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  0: { label: "Propose Only", description: "Human must approve all actions", icon: ShieldOff, color: "text-slate-400" },
  1: { label: "Safe Internal", description: "Auto-approve LOW-risk internal actions", icon: Shield, color: "text-blue-400" },
  2: { label: "Bounded Autonomy", description: "Auto-approve LOW-risk external within limits", icon: ShieldCheck, color: "text-emerald-400" },
};

const RISK_COLORS: Record<string, string> = {
  LOW: "text-emerald-400 border-emerald-500/20",
  MEDIUM: "text-amber-400 border-amber-500/20",
  HIGH: "text-red-400 border-red-500/20",
};

/* ─── Create Policy Dialog ─────────────────────────────────── */
function CreatePolicyForm({ onCreated }: { onCreated: () => void }) {
  const [category, setCategory] = useState("");
  const [riskTier, setRiskTier] = useState<"LOW" | "MEDIUM" | "HIGH">("LOW");
  const [trustLevel, setTrustLevel] = useState(0);
  const [maxAmount, setMaxAmount] = useState("");

  const createMutation = trpc.trust.create.useMutation({
    onSuccess: () => {
      toast.success("Trust policy created and logged to ledger");
      setCategory("");
      setMaxAmount("");
      onCreated();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category.trim()) {
      toast.error("Category is required");
      return;
    }
    const conditions: Record<string, unknown> = {};
    if (maxAmount) conditions.max_amount = parseFloat(maxAmount);
    createMutation.mutate({ category, riskTier, trustLevel, conditions: Object.keys(conditions).length > 0 ? conditions : undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="border border-primary/20 rounded-xl p-4 bg-primary/5 space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Plus className="h-4 w-4 text-primary" />
        New Trust Policy
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Category</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g., outreach, research"
            className="mt-1 w-full text-xs bg-card border border-border rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Risk Tier</label>
          <select
            value={riskTier}
            onChange={(e) => setRiskTier(e.target.value as any)}
            className="mt-1 w-full text-xs bg-card border border-border rounded-md px-2.5 py-1.5 text-foreground"
          >
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Trust Level</label>
        <div className="mt-1.5 space-y-1.5">
          {[0, 1, 2].map((level) => {
            const config = TRUST_LEVELS[level];
            const Icon = config.icon;
            return (
              <button
                key={level}
                type="button"
                onClick={() => setTrustLevel(level)}
                className={`w-full flex items-center gap-2.5 p-2 rounded-lg border transition-all text-left ${
                  trustLevel === level
                    ? "border-primary/40 bg-primary/10"
                    : "border-border/40 bg-card/50 hover:border-border"
                }`}
              >
                <Icon className={`h-4 w-4 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-foreground">{config.label}</span>
                  <p className="text-[10px] text-muted-foreground">{config.description}</p>
                </div>
                {trustLevel === level && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Max Amount (optional)</label>
        <input
          type="number"
          value={maxAmount}
          onChange={(e) => setMaxAmount(e.target.value)}
          placeholder="e.g., 50"
          className="mt-1 w-full text-xs bg-card border border-border rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50"
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="submit"
          size="sm"
          disabled={createMutation.isPending}
          className="flex-1 h-8 text-xs font-semibold"
        >
          {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Shield className="h-3 w-3 mr-1" />}
          Create Policy
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
        <Info className="h-3 w-3" />
        Creating a trust policy is a governed action recorded in the ledger.
      </p>
    </form>
  );
}

/* ─── Policy Card ──────────────────────────────────────────── */
function PolicyCard({
  policy,
  expanded,
  onToggle,
  onDeactivate,
}: {
  policy: any;
  expanded: boolean;
  onToggle: () => void;
  onDeactivate: (id: string) => void;
}) {
  const trustConfig = TRUST_LEVELS[policy.trustLevel] || TRUST_LEVELS[0];
  const TrustIcon = trustConfig.icon;
  const riskColor = RISK_COLORS[policy.riskTier] || "text-slate-400 border-slate-500/20";

  const conditions = policy.conditions ? (typeof policy.conditions === "string" ? JSON.parse(policy.conditions) : policy.conditions) : null;

  return (
    <div className={`border rounded-xl p-4 transition-all ${policy.active ? "border-border/40 bg-card/50" : "border-border/20 bg-card/20 opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-card flex items-center justify-center shrink-0">
            <TrustIcon className={`h-4 w-4 ${trustConfig.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{policy.category}</span>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${riskColor}`}>
                {policy.riskTier}
              </Badge>
              {!policy.active && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 border-slate-500/20">
                  Inactive
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-xs font-medium ${trustConfig.color}`}>Level {policy.trustLevel}: {trustConfig.label}</span>
            </div>
          </div>
        </div>
        <button onClick={onToggle} className="text-muted-foreground hover:text-foreground transition-colors p-1">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground mt-1.5">{trustConfig.description}</p>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
          {conditions && Object.keys(conditions).length > 0 && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Conditions</span>
              <div className="mt-1 bg-card/50 rounded-lg p-2 space-y-1">
                {Object.entries(conditions).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground/60">{key}:</span>
                    <span className="text-[10px] font-mono text-foreground/70">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
            <span className="font-mono">{policy.policyId?.slice(0, 20)}...</span>
            <span>Created: {new Date(policy.createdAt).toLocaleString()}</span>
          </div>

          {policy.active && (
            <div className="flex items-center gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDeactivate(policy.policyId)}
                className="h-7 text-xs text-red-400 border-red-500/20 hover:bg-red-500/10"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Deactivate
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────── */
export default function TrustPolicies() {
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: policies, isLoading, refetch } = trpc.trust.list.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const deactivateMutation = trpc.trust.deactivate.useMutation({
    onSuccess: () => {
      toast.success("Policy deactivated and logged to ledger");
      refetch();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const handleDeactivate = (policyId: string) => {
    if (confirm("Deactivate this trust policy? This is a governed action.")) {
      deactivateMutation.mutate({ policyId });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border/40">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-bold">Trust Policies</h1>
                <p className="text-[10px] text-muted-foreground">Phase 2E — Delegated Auto-Approval</p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setShowCreate(!showCreate)}
              className="h-7 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              New Policy
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {/* Trust level explainer */}
        <div className="border border-border/30 rounded-xl p-3 bg-card/30">
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">How Trust Levels Work</span>
          </div>
          <div className="space-y-1">
            {[0, 1, 2].map((level) => {
              const config = TRUST_LEVELS[level];
              const Icon = config.icon;
              return (
                <div key={level} className="flex items-center gap-2">
                  <Icon className={`h-3 w-3 ${config.color}`} />
                  <span className={`text-[10px] font-semibold ${config.color}`}>Level {level}:</span>
                  <span className="text-[10px] text-muted-foreground">{config.description}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Anomalies always surface for human approval, regardless of trust level.
          </p>
        </div>

        {/* Create form */}
        {showCreate && <CreatePolicyForm onCreated={() => { refetch(); setShowCreate(false); }} />}

        {/* Policy list */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading policies...</span>
          </div>
        ) : !policies || policies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center">
              <Shield className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <span className="text-sm text-muted-foreground">No trust policies yet</span>
            <p className="text-xs text-muted-foreground/70 text-center max-w-xs">
              Create trust policies to enable delegated auto-approval for low-risk actions.
              All policy changes are governed actions recorded in the ledger.
            </p>
          </div>
        ) : (
          policies.map((policy: any) => (
            <PolicyCard
              key={policy.policyId}
              policy={policy}
              expanded={expandedId === policy.policyId}
              onToggle={() => setExpandedId(expandedId === policy.policyId ? null : policy.policyId)}
              onDeactivate={handleDeactivate}
            />
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
}
