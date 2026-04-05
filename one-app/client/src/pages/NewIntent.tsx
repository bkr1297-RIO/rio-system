/**
 * Create Intent Page — Screen 2 of 3
 *
 * User-friendly interface for submitting governed actions.
 * Default mode shows simple forms per action type (Send Email → To/Subject/Body).
 * Advanced mode exposes raw JSON, target environment, and confidence controls.
 *
 * Auth: useGatewayAuth() — Gateway JWT (passphrase login).
 * Gateway calls: Direct via gateway.ts (submitIntent, governIntent).
 *
 * ONE is an untrusted client. No enforcement here.
 */
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useGatewayAuth } from "@/hooks/useGatewayAuth";
import { submitIntent, governIntent } from "@/lib/gateway";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Send, ArrowLeft, Shield, CheckCircle2,
  AlertTriangle, XCircle, Clock, Settings2,
  Mail, MessageSquare, Search, Rocket, DollarSign, FileEdit,
  Zap
} from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";

/* ─── Action definitions with form schemas ────────────────── */

interface ActionField {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "number";
  placeholder: string;
  required?: boolean;
}

interface ActionDef {
  value: string;
  label: string;
  description: string;
  risk: string;
  icon: React.ComponentType<{ className?: string }>;
  fields: ActionField[];
  /** Maps to Gateway policy scope.systems — must match an entry in the policy */
  targetEnvironment?: string;
}

const ACTIONS: ActionDef[] = [
  {
    value: "send_email",
    label: "Send Email",
    description: "Send an email through a governed channel",
    risk: "MEDIUM",
    icon: Mail,
    targetEnvironment: "gmail",
    fields: [
      { key: "to", label: "To", type: "email", placeholder: "recipient@example.com", required: true },
      { key: "subject", label: "Subject", type: "text", placeholder: "Email subject line", required: true },
      { key: "body", label: "Message", type: "textarea", placeholder: "Write your email message here..." },
    ],
  },
  {
    value: "send_sms",
    label: "Send SMS",
    description: "Send a text message to a phone number",
    risk: "MEDIUM",
    icon: MessageSquare,
    fields: [
      { key: "phone", label: "Phone Number", type: "tel", placeholder: "+1 (555) 123-4567", required: true },
      { key: "message", label: "Message", type: "textarea", placeholder: "Write your text message here..." },
    ],
  },
  {
    value: "search_web",
    label: "Web Search",
    description: "Search the web for information",
    risk: "LOW",
    icon: Search,
    fields: [
      { key: "query", label: "Search Query", type: "text", placeholder: "What would you like to search for?", required: true },
    ],
  },
  {
    value: "deploy_service",
    label: "Deploy Service",
    description: "Deploy or update a running service",
    risk: "HIGH",
    icon: Rocket,
    targetEnvironment: "github",
    fields: [
      { key: "service_name", label: "Service Name", type: "text", placeholder: "e.g., rio-gateway", required: true },
      { key: "version", label: "Version", type: "text", placeholder: "e.g., v2.7.1" },
      { key: "environment", label: "Environment", type: "text", placeholder: "e.g., production" },
    ],
  },
  {
    value: "transfer_funds",
    label: "Transfer Funds",
    description: "Initiate a financial transfer",
    risk: "CRITICAL",
    icon: DollarSign,
    fields: [
      { key: "recipient", label: "Recipient", type: "text", placeholder: "Account or wallet address", required: true },
      { key: "amount", label: "Amount", type: "number", placeholder: "0.00", required: true },
      { key: "currency", label: "Currency", type: "text", placeholder: "USD" },
      { key: "memo", label: "Memo", type: "text", placeholder: "Payment description" },
    ],
  },
  {
    value: "modify_policy",
    label: "Modify Policy",
    description: "Change governance policy rules",
    risk: "HIGH",
    icon: FileEdit,
    targetEnvironment: "RIO",
    fields: [
      { key: "policy_section", label: "Policy Section", type: "text", placeholder: "e.g., risk_tiers", required: true },
      { key: "change_description", label: "Description of Change", type: "textarea", placeholder: "Describe what you want to change..." },
    ],
  },
];

const RISK_COLORS: Record<string, string> = {
  LOW: "text-emerald-400",
  MEDIUM: "text-amber-400",
  HIGH: "text-red-400",
  CRITICAL: "text-red-500",
};

const RISK_BG: Record<string, string> = {
  LOW: "bg-emerald-500/10 border-emerald-500/20",
  MEDIUM: "bg-amber-500/10 border-amber-500/20",
  HIGH: "bg-red-500/10 border-red-500/20",
  CRITICAL: "bg-red-500/15 border-red-500/30",
};

/* ─── Governance result shape (from Gateway response) ──────── */

interface GovernanceResult {
  governance_decision: string;
  risk_tier: string;
  intent_id: string;
  approval_requirements?: {
    min_approvals: number;
    quorum_type?: string;
  };
  approval_requirement?: {
    description: string;
    required_roles?: string[];
    approvals_required: number;
  };
  ttl_seconds?: number;
  approval_ttl?: number | null;
  expires_at?: string;
  governance_hash?: string;
  reason?: string;
  matched_class?: string;
}

const DECISION_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  AUTO_APPROVE: { label: "Auto-Approved", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
  REQUIRE_HUMAN: { label: "Requires Human Approval", color: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: Clock },
  REQUIRE_QUORUM: { label: "Requires Quorum", color: "text-orange-400 bg-orange-500/10 border-orange-500/20", icon: Shield },
  AUTO_DENY: { label: "Auto-Denied", color: "text-red-400 bg-red-500/10 border-red-500/20", icon: XCircle },
};

export default function NewIntent() {
  const { user, loading: gwLoading, isAuthenticated, logout } = useGatewayAuth();
  const [, navigate] = useLocation();

  // Mode
  const [advancedMode, setAdvancedMode] = useState(false);

  // Form state — user-friendly mode
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // Form state — advanced mode
  const [customAction, setCustomAction] = useState("");
  const [paramsJson, setParamsJson] = useState("{}");
  const [targetEnv, setTargetEnv] = useState("local");
  const [confidence, setConfidence] = useState("85");
  const [reflection, setReflection] = useState("");

  // Submission state
  const [governResult, setGovernResult] = useState<GovernanceResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedDef = useMemo(() =>
    ACTIONS.find(a => a.value === selectedAction),
    [selectedAction]
  );

  // Redirect if not authenticated (in useEffect, not during render)
  useEffect(() => {
    if (!gwLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [gwLoading, isAuthenticated, navigate]);

  // Redirect approvers to the Approvals tab — they can't submit intents
  useEffect(() => {
    if (!gwLoading && isAuthenticated && user?.role === "approver") {
      toast.info("Approvers review actions — redirecting to Approvals");
      navigate("/approvals");
    }
  }, [gwLoading, isAuthenticated, user, navigate]);

  function handleFieldChange(key: string, value: string) {
    setFieldValues(prev => ({ ...prev, [key]: value }));
  }

  function buildParameters(): Record<string, unknown> {
    if (advancedMode) {
      try {
        return JSON.parse(paramsJson);
      } catch {
        toast.error("Invalid JSON in parameters");
        return {};
      }
    }

    // Build from form fields
    const params: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fieldValues)) {
      if (value.trim()) {
        params[key] = value.trim();
      }
    }
    return params;
  }

  function getEffectiveAction(): string {
    if (advancedMode) return customAction;
    return selectedAction || "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const action = getEffectiveAction();

    if (!action.trim()) {
      toast.error("Please select an action");
      return;
    }

    // Validate required fields in user-friendly mode
    if (!advancedMode && selectedDef) {
      for (const field of selectedDef.fields) {
        if (field.required && !fieldValues[field.key]?.trim()) {
          toast.error(`${field.label} is required`);
          return;
        }
      }
    }

    setSubmitError(null);
    setGovernResult(null);
    setIsSubmitting(true);

    const parameters = buildParameters();
    if (Object.keys(parameters).length === 0 && !advancedMode && selectedDef && selectedDef.fields.length > 0) {
      setIsSubmitting(false);
      return;
    }

    try {
      // Step 1: Submit intent directly to Gateway
      // Use the action's targetEnvironment if available, otherwise fall back to manual input
      const resolvedTargetEnv = advancedMode ? targetEnv : (selectedDef?.targetEnvironment || targetEnv);
      const intentResult = await submitIntent({
        action,
        agent_id: "bondi",
        target_environment: resolvedTargetEnv,
        parameters,
        confidence: parseInt(confidence) || 85,
        reflection: reflection || undefined,
      });

      if (!intentResult.ok) {
        setSubmitError(intentResult.data.error || "Intent submission failed");
        setIsSubmitting(false);
        return;
      }

      const intentId = intentResult.data.intent_id;

      // Step 2: Govern the intent directly via Gateway
      const govResult = await governIntent(intentId);

      if (!govResult.ok) {
        setSubmitError(govResult.data.error || "Governance evaluation failed");
        setIsSubmitting(false);
        return;
      }

      // Map Gateway governance response to our UI shape
      const gov = govResult.data;
      setGovernResult({
        governance_decision: gov.governance_decision,
        risk_tier: gov.risk_tier,
        intent_id: gov.intent_id,
        approval_requirements: gov.approval_requirements,
        approval_requirement: gov.approval_requirement,
        ttl_seconds: gov.ttl_seconds || gov.approval_ttl,
        expires_at: gov.expires_at,
        governance_hash: gov.governance_hash,
        reason: gov.reason,
        matched_class: (gov as unknown as Record<string, unknown>).matched_class as string | undefined,
      });

      if (gov.governance_decision === "AUTO_APPROVE") {
        toast.success("Action approved automatically");
      } else if (gov.governance_decision === "AUTO_DENY") {
        toast.error("Action denied by policy");
      } else {
        toast.info("Action requires approval — check the Approvals screen");
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }

    setIsSubmitting(false);
  }

  function handleReset() {
    setGovernResult(null);
    setSubmitError(null);
    setSelectedAction(null);
    setFieldValues({});
    setCustomAction("");
    setParamsJson("{}");
    setReflection("");
  }

  function handleSelectAction(actionValue: string) {
    setSelectedAction(actionValue);
    setFieldValues({});
    setSubmitError(null);
    setGovernResult(null);
  }

  if (gwLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/50">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/approvals")}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex-1" />
          <button
            onClick={() => {
              setAdvancedMode(!advancedMode);
              // Sync state when switching modes
              if (!advancedMode && selectedAction) {
                setCustomAction(selectedAction);
                setParamsJson(JSON.stringify(buildParameters(), null, 2));
              }
            }}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all ${
              advancedMode
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/40 text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Settings2 className="h-3 w-3" />
            {advancedMode ? "Advanced" : "Simple"}
          </button>
          <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/40">
            {user?.name || user?.sub || "unknown"}
          </Badge>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {advancedMode ? "Create Intent" : "New Action"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {advancedMode
              ? "Submit a raw intent for governance evaluation"
              : "What would you like to do?"}
          </p>
        </div>

        {/* Governance result */}
        {governResult && (
          <GovernResultCard result={governResult} onReset={handleReset} />
        )}

        {/* Error */}
        {submitError && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Something went wrong</p>
              <p className="text-red-400/80 mt-1">{submitError}</p>
            </div>
          </div>
        )}

        {/* ═══ USER-FRIENDLY MODE ═══ */}
        {!governResult && !advancedMode && (
          <div className="space-y-6">
            {/* Action picker — if no action selected yet */}
            {!selectedAction && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.value}
                      type="button"
                      onClick={() => handleSelectAction(action.value)}
                      className="group rounded-xl border border-border/40 bg-card p-4 text-left transition-all hover:border-border hover:bg-card/80 hover:shadow-md"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                          <Icon className="h-4.5 w-4.5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{action.label}</p>
                            <span className={`text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded border ${RISK_BG[action.risk]} ${RISK_COLORS[action.risk]}`}>
                              {action.risk}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Form fields — when action is selected */}
            {selectedAction && selectedDef && (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Selected action header */}
                <div className="flex items-center gap-3 pb-2">
                  <button
                    type="button"
                    onClick={() => { setSelectedAction(null); setFieldValues({}); }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    {(() => { const Icon = selectedDef.icon; return <Icon className="h-4 w-4 text-primary" />; })()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{selectedDef.label}</p>
                    <p className="text-xs text-muted-foreground">{selectedDef.description}</p>
                  </div>
                  <div className="flex-1" />
                  <span className={`text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded border ${RISK_BG[selectedDef.risk]} ${RISK_COLORS[selectedDef.risk]}`}>
                    {selectedDef.risk} risk
                  </span>
                </div>

                {/* Dynamic form fields */}
                <div className="space-y-4">
                  {selectedDef.fields.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground flex items-center gap-1">
                        {field.label}
                        {field.required && <span className="text-red-400 text-xs">*</span>}
                      </label>
                      {field.type === "textarea" ? (
                        <textarea
                          value={fieldValues[field.key] || ""}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          rows={4}
                          className="w-full rounded-lg border border-border/40 bg-card p-3 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                          placeholder={field.placeholder}
                        />
                      ) : (
                        <Input
                          type={field.type}
                          value={fieldValues[field.key] || ""}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="bg-card border-border/40"
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Optional: add a reason */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">
                    Why? <span className="opacity-60">(optional — helps with audit trail)</span>
                  </label>
                  <Input
                    value={reflection}
                    onChange={(e) => setReflection(e.target.value)}
                    placeholder="Brief reason for this action..."
                    className="bg-card border-border/40 text-sm"
                  />
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full gap-2 font-medium"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  Submit for Governance
                </Button>
              </form>
            )}
          </div>
        )}

        {/* ═══ ADVANCED MODE ═══ */}
        {!governResult && advancedMode && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Action */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Action</label>
              <div className="grid grid-cols-2 gap-2">
                {ACTIONS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setCustomAction(preset.value)}
                    className={`rounded-lg border p-3 text-left transition-all ${
                      customAction === preset.value
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border/40 bg-card hover:border-border"
                    }`}
                  >
                    <p className="text-sm font-medium">{preset.label}</p>
                    <p className={`text-[10px] uppercase tracking-wider mt-0.5 ${RISK_COLORS[preset.risk]}`}>
                      {preset.risk}
                    </p>
                  </button>
                ))}
              </div>
              <Input
                placeholder="Or type a custom action name..."
                value={customAction}
                onChange={(e) => setCustomAction(e.target.value)}
                className="mt-2 bg-card border-border/40"
              />
            </div>

            {/* Parameters JSON */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Parameters (JSON)</label>
              <textarea
                value={paramsJson}
                onChange={(e) => setParamsJson(e.target.value)}
                rows={6}
                className="w-full rounded-lg border border-border/40 bg-card p-3 text-sm font-mono text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder='{"to": "user@example.com", "subject": "Hello"}'
              />
            </div>

            {/* Target environment + Confidence */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Target Environment</label>
                <Input
                  value={targetEnv}
                  onChange={(e) => setTargetEnv(e.target.value)}
                  placeholder="local"
                  className="bg-card border-border/40 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Confidence (0-100)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={confidence}
                  onChange={(e) => setConfidence(e.target.value)}
                  className="bg-card border-border/40 text-sm"
                />
              </div>
            </div>

            {/* Reflection */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Reflection / Reasoning</label>
              <textarea
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-border/40 bg-card p-3 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Why is this action being taken?"
              />
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full gap-2 font-medium"
              disabled={isSubmitting || !customAction.trim()}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit Intent
            </Button>
          </form>
        )}
      </div>

      {/* Bottom nav */}
      <BottomNav />
      {/* Spacer for bottom nav */}
      <div className="h-20" />
    </div>
  );
}

/* ─── Governance Result Card ─────────────────────────────────── */

function GovernResultCard({ result, onReset }: { result: GovernanceResult; onReset: () => void }) {
  const [, navigate] = useLocation();
  const config = DECISION_CONFIG[result.governance_decision] || DECISION_CONFIG.REQUIRE_HUMAN;
  const Icon = config.icon;

  const ttl = result.ttl_seconds || result.approval_ttl;
  const isDenied = result.governance_decision === "AUTO_DENY";
  const needsApproval = result.governance_decision === "REQUIRE_HUMAN" || result.governance_decision === "REQUIRE_QUORUM";

  return (
    <div className={`rounded-xl border p-5 space-y-4 ${config.color}`}>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-current/10">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">{config.label}</h3>
          <p className="text-xs opacity-80 mt-0.5">
            Risk: {result.risk_tier} | Intent: {result.intent_id.slice(0, 8)}...
          </p>
        </div>
      </div>

      {/* AUTO_DENY explanation */}
      {isDenied && (
        <div className="rounded-lg bg-red-500/5 border border-red-500/10 p-3 text-xs space-y-2">
          <p className="font-medium text-red-300">Action blocked by Gateway policy</p>
          {result.reason && (
            <p className="text-red-400/80">{result.reason}</p>
          )}
          {!result.matched_class && (
            <p className="text-red-400/60">
              This action type is not recognized by the current governance policy. 
              Only actions with defined policy rules can be submitted.
            </p>
          )}
          <p className="text-red-400/50 text-[10px] mt-1">
            The Gateway enforces fail-closed: unknown actions are denied by default.
          </p>
        </div>
      )}

      {/* Approval requirements — only show for non-denied results with valid data */}
      {!isDenied && result.approval_requirements && result.approval_requirements.min_approvals > 0 && (
        <div className="rounded-lg bg-background/50 p-3 text-xs space-y-1">
          <p>Min approvals: <span className="font-medium">{result.approval_requirements.min_approvals}</span></p>
          {result.approval_requirements.quorum_type && (
            <p className="text-muted-foreground">Quorum: {result.approval_requirements.quorum_type}</p>
          )}
        </div>
      )}

      {!isDenied && result.approval_requirement && result.approval_requirement.approvals_required > 0 && (
        <div className="rounded-lg bg-background/50 p-3 text-xs space-y-1">
          <p>Approvals required: <span className="font-medium">{result.approval_requirement.approvals_required}</span></p>
          <p className="text-muted-foreground">{result.approval_requirement.description}</p>
        </div>
      )}

      {!isDenied && ttl && ttl > 0 && (
        <p className="text-xs opacity-80">
          TTL: {Math.floor(ttl / 3600)}h {Math.floor((ttl % 3600) / 60)}m
        </p>
      )}

      {result.governance_hash && (
        <p className="text-[10px] font-mono opacity-50 truncate">
          Hash: {result.governance_hash}
        </p>
      )}

      <div className="flex gap-3 pt-1">
        <Button onClick={onReset} variant="outline" className="flex-1">
          Submit Another
        </Button>
        {needsApproval && (
          <Button
            onClick={() => navigate("/approvals")}
            className="flex-1 gap-1.5"
          >
            <Shield className="h-4 w-4" />
            Go to Approvals
          </Button>
        )}
      </div>
    </div>
  );
}
