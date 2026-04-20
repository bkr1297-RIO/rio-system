import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Loader2, ScrollText, Shield, Mail, MessageSquare,
  DollarSign, Globe, FileText, AlertTriangle,
  CheckCircle2, Info, Plus, Pencil, Trash2, Power, PowerOff,
  ChevronDown, X,
} from "lucide-react";

/* ─── Default (built-in) policy definitions ──────────────── */

interface BuiltInRule {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  requiresApproval: boolean;
}

const BUILT_IN_POLICIES: BuiltInRule[] = [
  { id: "external_email", label: "External Email", description: "Sending email to recipients outside your organization", icon: Mail, color: "text-blue-400 bg-blue-500/10", riskTier: "HIGH", requiresApproval: true },
  { id: "send_sms", label: "Send Text Message", description: "Sending SMS via Twilio to any phone number", icon: MessageSquare, color: "text-violet-400 bg-violet-500/10", riskTier: "HIGH", requiresApproval: true },
  { id: "financial_transfer", label: "Financial Transfer", description: "Any payment or money transfer above $0", icon: DollarSign, color: "text-emerald-400 bg-emerald-500/10", riskTier: "HIGH", requiresApproval: true },
  { id: "web_search", label: "Web Search", description: "Searching the internet for information", icon: Globe, color: "text-cyan-400 bg-cyan-500/10", riskTier: "LOW", requiresApproval: false },
  { id: "file_operations", label: "File Operations", description: "Reading, writing, or deleting files", icon: FileText, color: "text-amber-400 bg-amber-500/10", riskTier: "MEDIUM", requiresApproval: true },
  { id: "draft_content", label: "Draft Content", description: "Creating drafts for review before sending", icon: FileText, color: "text-slate-400 bg-slate-500/10", riskTier: "LOW", requiresApproval: false },
];

const RISK_CONFIG: Record<string, { label: string; color: string; border: string }> = {
  LOW: { label: "Low", color: "text-emerald-400", border: "border-emerald-500/20" },
  MEDIUM: { label: "Medium", color: "text-amber-400", border: "border-amber-500/20" },
  HIGH: { label: "High", color: "text-red-400", border: "border-red-500/20" },
};

const OPERATORS = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "equals" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  { value: "greaterThan", label: "greater than" },
];

/* ─── Built-in Policy Card ───────────────────────────────── */

function BuiltInPolicyCard({ rule }: { rule: BuiltInRule }) {
  const risk = RISK_CONFIG[rule.riskTier];
  const Icon = rule.icon;
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-border/40 bg-card">
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", rule.color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{rule.label}</p>
          <Badge variant="outline" className={cn("text-[10px] font-semibold uppercase tracking-wider", risk.color, risk.border)}>
            {risk.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
      </div>
      <div className="shrink-0">
        {rule.requiresApproval ? (
          <Badge variant="outline" className="text-[10px] font-semibold text-amber-400 border-amber-500/20 gap-1">
            <Shield className="h-3 w-3" /> Approval
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] font-semibold text-emerald-400 border-emerald-500/20 gap-1">
            <CheckCircle2 className="h-3 w-3" /> Auto
          </Badge>
        )}
      </div>
    </div>
  );
}

/* ─── Custom Rule Card ───────────────────────────────────── */

function CustomRuleCard({ rule, onEdit, onToggle, onDelete }: {
  rule: {
    ruleId: string;
    name: string;
    description: string | null;
    toolPattern: string;
    riskOverride: string | null;
    requiresApproval: boolean;
    condition: unknown;
    enabled: boolean;
  };
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const risk = rule.riskOverride ? RISK_CONFIG[rule.riskOverride] : null;
  const cond = rule.condition as { field: string; operator: string; value: string } | null;

  return (
    <div className={cn(
      "p-4 rounded-xl border bg-card transition-opacity",
      rule.enabled ? "border-border/40" : "border-border/20 opacity-60"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold">{rule.name}</p>
            {!rule.enabled && (
              <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground border-border/40">
                Disabled
              </Badge>
            )}
            {risk && (
              <Badge variant="outline" className={cn("text-[10px] font-semibold uppercase tracking-wider", risk.color, risk.border)}>
                {risk.label} Risk
              </Badge>
            )}
            {rule.requiresApproval ? (
              <Badge variant="outline" className="text-[10px] font-semibold text-amber-400 border-amber-500/20 gap-1">
                <Shield className="h-3 w-3" /> Approval
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] font-semibold text-emerald-400 border-emerald-500/20 gap-1">
                <CheckCircle2 className="h-3 w-3" /> Auto
              </Badge>
            )}
          </div>
          {rule.description && (
            <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="secondary" className="text-[10px] font-mono">
              {rule.toolPattern === "*" ? "All Tools" : rule.toolPattern}
            </Badge>
            {cond && (
              <Badge variant="secondary" className="text-[10px]">
                When {cond.field} {cond.operator} "{cond.value}"
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggle}>
            {rule.enabled ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5 text-emerald-400" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Rule Form (Create / Edit) ──────────────────────────── */

function RuleForm({ tools, initial, onSubmit, onCancel }: {
  tools: Array<{ toolName: string }>;
  initial?: {
    ruleId?: string;
    name: string;
    description: string;
    toolPattern: string;
    riskOverride: string | null;
    requiresApproval: boolean;
    condition: { field: string; operator: string; value: string } | null;
  };
  onSubmit: (data: {
    ruleId?: string;
    name: string;
    description?: string;
    toolPattern: string;
    riskOverride?: "LOW" | "MEDIUM" | "HIGH";
    requiresApproval: boolean;
    condition?: { field: string; operator: string; value: string } | null;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [toolPattern, setToolPattern] = useState(initial?.toolPattern ?? "*");
  const [riskOverride, setRiskOverride] = useState<string>(initial?.riskOverride ?? "");
  const [requiresApproval, setRequiresApproval] = useState(initial?.requiresApproval ?? true);
  const [hasCondition, setHasCondition] = useState(!!initial?.condition);
  const [condField, setCondField] = useState(initial?.condition?.field ?? "");
  const [condOperator, setCondOperator] = useState(initial?.condition?.operator ?? "contains");
  const [condValue, setCondValue] = useState(initial?.condition?.value ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Rule name is required"); return; }
    onSubmit({
      ruleId: initial?.ruleId,
      name: name.trim(),
      description: description.trim() || undefined,
      toolPattern,
      riskOverride: riskOverride ? riskOverride as "LOW" | "MEDIUM" | "HIGH" : undefined,
      requiresApproval,
      condition: hasCondition && condField.trim() && condValue.trim()
        ? { field: condField.trim(), operator: condOperator, value: condValue.trim() }
        : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 rounded-xl border border-primary/20 bg-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{initial?.ruleId ? "Edit Rule" : "New Rule"}</p>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Name */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Rule Name</label>
        <input
          className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary/50 border border-border/40 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="e.g., Block large payments"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
        <input
          className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary/50 border border-border/40 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="e.g., Require approval for payments over $500"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      {/* Tool Pattern */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Applies To</label>
        <div className="relative mt-1">
          <select
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/40 text-sm appearance-none focus:outline-none focus:ring-1 focus:ring-primary"
            value={toolPattern}
            onChange={e => setToolPattern(e.target.value)}
          >
            <option value="*">All Tools</option>
            {tools.map(t => (
              <option key={t.toolName} value={t.toolName}>{t.toolName}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Risk Override */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Risk Level Override</label>
        <div className="flex gap-2 mt-1">
          {["", "LOW", "MEDIUM", "HIGH"].map(level => (
            <button
              key={level}
              type="button"
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                riskOverride === level
                  ? level === "HIGH" ? "bg-red-500/20 border-red-500/40 text-red-400"
                    : level === "MEDIUM" ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                    : level === "LOW" ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                    : "bg-primary/10 border-primary/30 text-primary"
                  : "bg-secondary/50 border-border/40 text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setRiskOverride(level)}
            >
              {level || "Default"}
            </button>
          ))}
        </div>
      </div>

      {/* Requires Approval */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium">Requires Approval</p>
          <p className="text-[11px] text-muted-foreground">Override auto-approve for matching actions</p>
        </div>
        <button
          type="button"
          className={cn(
            "w-11 h-6 rounded-full transition-colors relative",
            requiresApproval ? "bg-amber-500" : "bg-secondary"
          )}
          onClick={() => setRequiresApproval(!requiresApproval)}
        >
          <span className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
            requiresApproval ? "left-[22px]" : "left-0.5"
          )} />
        </button>
      </div>

      {/* Condition */}
      <div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium">Condition (optional)</p>
          <button
            type="button"
            className="text-[11px] text-primary hover:underline"
            onClick={() => setHasCondition(!hasCondition)}
          >
            {hasCondition ? "Remove condition" : "Add condition"}
          </button>
        </div>
        {hasCondition && (
          <div className="flex gap-2 mt-2">
            <input
              className="flex-1 px-2 py-1.5 rounded-lg bg-secondary/50 border border-border/40 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="field (e.g., to)"
              value={condField}
              onChange={e => setCondField(e.target.value)}
            />
            <div className="relative">
              <select
                className="px-2 py-1.5 rounded-lg bg-secondary/50 border border-border/40 text-xs appearance-none pr-6 focus:outline-none focus:ring-1 focus:ring-primary"
                value={condOperator}
                onChange={e => setCondOperator(e.target.value)}
              >
                {OPERATORS.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>
            <input
              className="flex-1 px-2 py-1.5 rounded-lg bg-secondary/50 border border-border/40 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="value"
              value={condValue}
              onChange={e => setCondValue(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button type="submit" size="sm" className="flex-1">
          {initial?.ruleId ? "Save Changes" : "Create Rule"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/* ─── Main Policies Page ──────────────────────────────────── */

export default function Policies() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { data: status, isLoading } = trpc.proxy.status.useQuery(undefined, { enabled: isAuthenticated });
  const { data: customRules, isLoading: rulesLoading } = trpc.policies.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: tools } = trpc.tools.list.useQuery();
  const utils = trpc.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<typeof customRules extends (infer T)[] | undefined ? T | null : null>(null);

  const createMutation = trpc.policies.create.useMutation({
    onSuccess: () => {
      toast.success("Rule created");
      utils.policies.list.invalidate();
      setShowForm(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.policies.update.useMutation({
    onSuccess: () => {
      toast.success("Rule updated");
      utils.policies.list.invalidate();
      setEditingRule(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleMutation = trpc.policies.toggle.useMutation({
    onSuccess: () => {
      utils.policies.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.policies.delete.useMutation({
    onSuccess: () => {
      toast.success("Rule deleted");
      utils.policies.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const builtInApproval = BUILT_IN_POLICIES.filter(p => p.requiresApproval);
  const builtInAuto = BUILT_IN_POLICIES.filter(p => !p.requiresApproval);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <ScrollText className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Policies</h1>
            <p className="text-sm text-muted-foreground">Rules that govern what ONE can do</p>
          </div>
        </div>
        {!showForm && !editingRule && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowForm(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add Rule
          </Button>
        )}
      </div>

      {/* Policy hash */}
      {status?.proxyUser && (
        <div className="rounded-xl border border-border/30 bg-secondary/30 p-4 flex items-start gap-3">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-foreground">Active Policy</p>
            <p className="text-[11px] text-muted-foreground font-mono mt-1 break-all">
              {(status.proxyUser as Record<string, unknown>)?.policyHash as string ?? "Default governance policy"}
            </p>
          </div>
        </div>
      )}

      {/* Core principle */}
      <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-400">Fail-Closed by Default</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              If a policy is unclear or missing, the system blocks the action and asks for your approval.
              No action executes without authorization. The system enforces the rules, not the AI.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Custom Rules Section ─────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-1.5">
          <Shield className="h-3 w-3" />
          Custom Rules ({customRules?.length ?? 0})
        </p>

        {/* Create form */}
        {showForm && (
          <RuleForm
            tools={tools ?? []}
            onSubmit={(data) => createMutation.mutate(data)}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* Edit form */}
        {editingRule && (
          <RuleForm
            tools={tools ?? []}
            initial={{
              ruleId: editingRule.ruleId,
              name: editingRule.name,
              description: editingRule.description ?? "",
              toolPattern: editingRule.toolPattern,
              riskOverride: editingRule.riskOverride,
              requiresApproval: editingRule.requiresApproval,
              condition: editingRule.condition as { field: string; operator: string; value: string } | null,
            }}
            onSubmit={(data) => {
              if (data.ruleId) {
                updateMutation.mutate({
                  ruleId: data.ruleId,
                  name: data.name,
                  description: data.description,
                  toolPattern: data.toolPattern,
                  riskOverride: data.riskOverride,
                  requiresApproval: data.requiresApproval,
                  condition: data.condition,
                });
              }
            }}
            onCancel={() => setEditingRule(null)}
          />
        )}

        {/* Custom rule cards */}
        {rulesLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : customRules && customRules.length > 0 ? (
          <div className="space-y-2">
            {customRules.map(rule => (
              <CustomRuleCard
                key={rule.ruleId}
                rule={rule}
                onEdit={() => { setEditingRule(rule); setShowForm(false); }}
                onToggle={() => toggleMutation.mutate({ ruleId: rule.ruleId, enabled: !rule.enabled })}
                onDelete={() => {
                  if (confirm(`Delete rule "${rule.name}"?`)) {
                    deleteMutation.mutate({ ruleId: rule.ruleId });
                  }
                }}
              />
            ))}
          </div>
        ) : !showForm ? (
          <div className="rounded-xl border border-dashed border-border/40 p-6 text-center">
            <p className="text-xs text-muted-foreground">
              No custom rules yet. Add a rule to override default behavior for specific tools or conditions.
            </p>
          </div>
        ) : null}
      </div>

      {/* ─── Built-in Policies ────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
          <Shield className="h-3 w-3" />
          Built-in: Requires Approval
        </p>
        <div className="space-y-2">
          {builtInApproval.map(rule => <BuiltInPolicyCard key={rule.id} rule={rule} />)}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3" />
          Built-in: Auto-Approved (Low Risk)
        </p>
        <div className="space-y-2">
          {builtInAuto.map(rule => <BuiltInPolicyCard key={rule.id} rule={rule} />)}
        </div>
      </div>

      {/* Bottom note */}
      <div className="rounded-xl border border-border/20 bg-secondary/30 p-4 text-center">
        <p className="text-xs text-muted-foreground">
          Custom rules override built-in defaults. Rules are evaluated in order — the most recently created rule takes priority.
          All policy changes are recorded in the audit ledger.
        </p>
      </div>
    </div>
  );
}
