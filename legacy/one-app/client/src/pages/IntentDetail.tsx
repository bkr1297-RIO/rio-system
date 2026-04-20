import { trpc } from "@/lib/trpc";
import { useLocalStore } from "@/hooks/useLocalStore";
import { signData } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle, Shield,
  Play, FileText, ArrowLeft, ChevronDown, ChevronUp,
  Mail, Search, FileEdit, Zap, Clock, MessageSquare
} from "lucide-react";
import { useLocation, useParams, Link } from "wouter";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

// ─── Tool display helpers ─────────────────────────────────────

const TOOL_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  send_email: { label: "Send Email", icon: Mail, color: "text-blue-600 bg-blue-50" },
  send_sms: { label: "Send Text Message", icon: MessageSquare, color: "text-violet-600 bg-violet-50" },
  search_web: { label: "Web Search", icon: Search, color: "text-emerald-600 bg-emerald-50" },
  read_file: { label: "Read File", icon: FileText, color: "text-gray-600 bg-gray-50" },
  write_file: { label: "Write File", icon: FileEdit, color: "text-amber-600 bg-amber-50" },
  delete_file: { label: "Delete File", icon: XCircle, color: "text-red-600 bg-red-50" },
  execute_code: { label: "Run Code", icon: Zap, color: "text-orange-600 bg-orange-50" },
  transfer_funds: { label: "Transfer Funds", icon: Zap, color: "text-red-600 bg-red-50" },
  echo: { label: "Test Action", icon: Zap, color: "text-gray-600 bg-gray-50" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  PENDING_APPROVAL: { label: "Waiting for your approval", color: "text-amber-600", bgColor: "bg-amber-50 border-amber-200" },
  APPROVED: { label: "Approved — ready to execute", color: "text-blue-600", bgColor: "bg-blue-50 border-blue-200" },
  EXECUTED: { label: "Completed", color: "text-emerald-600", bgColor: "bg-emerald-50 border-emerald-200" },
  REJECTED: { label: "Rejected", color: "text-red-600", bgColor: "bg-red-50 border-red-200" },
  FAILED: { label: "Failed", color: "text-red-600", bgColor: "bg-red-50 border-red-200" },
  KILLED: { label: "Killed", color: "text-red-600", bgColor: "bg-red-50 border-red-200" },
  EXPIRED: { label: "Expired — TTL exceeded", color: "text-slate-500", bgColor: "bg-slate-50 border-slate-200" },
};

const RISK_CONFIG: Record<string, { label: string; color: string; description: string }> = {
  LOW: { label: "Low Risk", color: "text-emerald-600 bg-emerald-50 border-emerald-200", description: "Read-only or minimal impact" },
  MEDIUM: { label: "Medium Risk", color: "text-amber-600 bg-amber-50 border-amber-200", description: "Creates or modifies data" },
  HIGH: { label: "High Risk", color: "text-red-600 bg-red-50 border-red-200", description: "Sends communications or transfers value" },
};

// ─── Human-readable argument display ──────────────────────────

function ArgsDisplay({ toolName, args }: { toolName: string; args: Record<string, unknown> }) {
  const entries = Object.entries(args).filter(([, v]) => v !== null && v !== undefined && v !== "");

  // Special formatting for known tools
  if (toolName === "send_email" || toolName === "send_sms") {
    return (
      <div className="space-y-3">
        {Boolean(args.to) && (
          <div>
            <span className="text-xs text-muted-foreground">To</span>
            <p className="text-sm font-medium">{String(args.to)}</p>
          </div>
        )}
        {Boolean(args.subject) && (
          <div>
            <span className="text-xs text-muted-foreground">Subject</span>
            <p className="text-sm font-medium">{String(args.subject)}</p>
          </div>
        )}
        {Boolean(args.body || args.message) && (
          <div>
            <span className="text-xs text-muted-foreground">Message</span>
            <p className="text-sm whitespace-pre-wrap text-foreground/80">{String(args.body || args.message)}</p>
          </div>
        )}
        {entries
          .filter(([k]) => !["to", "subject", "body", "message"].includes(k))
          .map(([key, val]) => (
            <div key={key}>
              <span className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
              <p className="text-sm">{String(val)}</p>
            </div>
          ))}
      </div>
    );
  }

  // Generic display
  return (
    <div className="space-y-2">
      {entries.map(([key, val]) => (
        <div key={key}>
          <span className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
          <p className="text-sm">{typeof val === "object" ? JSON.stringify(val, null, 2) : String(val)}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Execution Receipt Link ───────────────────────────────────

function ExecutedReceiptLink({ intentId }: { intentId: string }) {
  const [, navigate] = useLocation();
  const { data: execution } = trpc.proxy.getExecution.useQuery(
    { intentId },
    { enabled: !!intentId }
  );
  if (!execution) return null;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-emerald-800">Action completed successfully</p>
          <p className="text-xs text-emerald-600/70 mt-0.5">Receipt recorded in the ledger</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/receipt/${execution.executionId}`)}
          className="text-xs shrink-0"
        >
          View Receipt
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

export default function IntentDetail() {
  const params = useParams<{ intentId: string }>();
  const [, navigate] = useLocation();
  const { keys } = useLocalStore();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [preflightResults, setPreflightResults] = useState<Array<{ check: string; status: string; detail: string }> | null>(null);
  const [executionResult, setExecutionResult] = useState<Record<string, unknown> | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [authTokenId, setAuthTokenId] = useState<string | null>(null);

  const { data: intent, isLoading, refetch } = trpc.proxy.getIntent.useQuery(
    { intentId: params.intentId || "" },
    { enabled: !!params.intentId }
  );
  const agentsQuery = trpc.agents.list.useQuery();
  const recommendQuery = trpc.agents.recommend.useQuery(
    { toolName: intent?.toolName ?? "" },
    { enabled: !!intent?.toolName }
  );

  // Pre-select recommended agent
  useEffect(() => {
    if (recommendQuery.data && selectedAgent === null) {
      setSelectedAgent(recommendQuery.data.recommendedAgentId);
    }
  }, [recommendQuery.data, selectedAgent]);

  const approveMutation = trpc.proxy.approve.useMutation({
    onSuccess: (data) => {
      // Capture the authorization token ID for execution
      const tokenId = (data as any)?.authorizationToken?.token_id;
      if (tokenId) {
        setAuthTokenId(tokenId);
        toast.success("Approved! Authorization token issued. Ready to execute.");
      } else {
        toast.success("Approved! Ready to execute.");
      }
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectMutation = trpc.proxy.approve.useMutation({
    onSuccess: () => { toast.info("Rejected."); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const executeMutation = trpc.proxy.execute.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Done! Action completed.");
        setPreflightResults(data.preflightResults);
        const execData = (data as Record<string, unknown>).execution as { result: unknown; executionId: string } | undefined;
        if (execData) {
          setExecutionResult(execData.result as Record<string, unknown>);
          setExecutionId(execData.executionId);
        }
        refetch();
      } else {
        toast.error(data.error || "Something went wrong");
        setPreflightResults(data.preflightResults);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!intent) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <XCircle className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Action not found</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/activity")}>
          Back to Activity
        </Button>
      </div>
    );
  }

  const handleApprove = async () => {
    if (!keys?.privateKey) {
      toast.error("No signing key found. Go to Settings > Key Recovery to restore your keys.");
      return;
    }
    const dataToSign = JSON.stringify({
      intentId: intent.intentId,
      toolName: intent.toolName,
      argsHash: intent.argsHash,
      decision: "APPROVED",
    });
    try {
      const signature = await signData(keys.privateKey, dataToSign);
      approveMutation.mutate({
        intentId: intent.intentId,
        decision: "APPROVED",
        signature,
        expiresInSeconds: 300,
        maxExecutions: 1,
      });
    } catch (e) {
      toast.error("Signing failed: " + (e as Error).message);
    }
  };

  const handleReject = () => {
    rejectMutation.mutate({
      intentId: intent.intentId,
      decision: "REJECTED",
      signature: "REJECTED-BY-USER",
      expiresInSeconds: 0,
      maxExecutions: 0,
    });
  };

  const handleExecute = () => {
    executeMutation.mutate({
      intentId: intent.intentId,
      agentId: selectedAgent ?? "passthrough",
      ...(authTokenId ? { tokenId: authTokenId } : {}),
    });
  };

  const toolMeta = TOOL_META[intent.toolName] ?? { label: intent.toolName, icon: Zap, color: "text-gray-600 bg-gray-50" };
  const ToolIcon = toolMeta.icon;
  const statusConfig = STATUS_CONFIG[intent.status] ?? STATUS_CONFIG.PENDING_APPROVAL;
  const riskConfig = RISK_CONFIG[intent.riskTier] ?? RISK_CONFIG.LOW;
  const blastRadius = intent.blastRadius as { score: number; affectedSystems: string[]; reversible: boolean } | null;
  const isPending = intent.status === "PENDING_APPROVAL";
  const isApproved = intent.status === "APPROVED";
  const isExecuted = intent.status === "EXECUTED";

  return (
    <div className={cn("max-w-2xl mx-auto px-4 py-6 space-y-5", (isPending || isApproved) && "pb-36")}>
      {/* Back button */}
      <button
        onClick={() => navigate("/activity")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Activity
      </button>

      {/* Status banner */}
      <div className={cn("rounded-xl border p-4 flex items-center gap-3", statusConfig.bgColor)}>
        {isPending ? (
          <Clock className={cn("h-5 w-5 shrink-0", statusConfig.color)} />
        ) : isExecuted ? (
          <CheckCircle2 className={cn("h-5 w-5 shrink-0", statusConfig.color)} />
        ) : (
          <AlertTriangle className={cn("h-5 w-5 shrink-0", statusConfig.color)} />
        )}
        <span className={cn("text-sm font-medium", statusConfig.color)}>{statusConfig.label}</span>
      </div>

      {/* Action card */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border/40">
          <div className="flex items-center gap-3 mb-3">
            <div className={cn("h-10 w-10 rounded-full flex items-center justify-center shrink-0", toolMeta.color)}>
              <ToolIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">{toolMeta.label}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className={cn("text-[10px] px-1.5 border", riskConfig.color)}>
                  {riskConfig.label}
                </Badge>
                <span className="text-xs text-muted-foreground">{riskConfig.description}</span>
              </div>
            </div>
          </div>
        </div>

        {/* What it will do */}
        <div className="p-5 space-y-4">
          <div>
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              What Bondi wants to do
            </h2>
            <ArgsDisplay toolName={intent.toolName} args={intent.toolArgs as Record<string, unknown>} />
          </div>

          {/* Reflection / reasoning */}
          {intent.reflection && (
            <div className="rounded-lg bg-muted/30 p-3.5">
              <h3 className="text-xs font-medium text-muted-foreground mb-1.5">Why</h3>
              <p className="text-sm text-foreground/80 italic">{intent.reflection}</p>
            </div>
          )}

          {/* Blast radius — simplified */}
          {blastRadius && (
            <div className="rounded-lg bg-muted/30 p-3.5">
              <h3 className="text-xs font-medium text-muted-foreground mb-2">Impact Assessment</h3>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        blastRadius.score <= 3 ? "bg-emerald-500" : blastRadius.score <= 6 ? "bg-amber-500" : "bg-red-500"
                      )}
                      style={{ width: `${blastRadius.score * 10}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs font-medium">{blastRadius.score}/10</span>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>{blastRadius.reversible ? "Reversible" : "Not reversible"}</span>
                <span className="text-border">|</span>
                <span>Affects: {blastRadius.affectedSystems.join(", ")}</span>
              </div>
            </div>
          )}
        </div>

        {/* Advanced details (collapsed) */}
        <div className="border-t border-border/40">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full px-5 py-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Technical Details</span>
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showAdvanced && (
            <div className="px-5 pb-4 space-y-2 text-xs font-mono text-muted-foreground">
              <div><span className="text-muted-foreground/60">Intent ID:</span> {intent.intentId}</div>
              <div><span className="text-muted-foreground/60">Args Hash:</span> <span className="break-all">{intent.argsHash}</span></div>
              <div><span className="text-muted-foreground/60">Created:</span> {intent.createdAt ? new Date(intent.createdAt).toLocaleString() : "—"}</div>
              <div>
                <span className="text-muted-foreground/60">Raw Arguments:</span>
                <pre className="mt-1 bg-muted/50 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all text-[11px]">
                  {JSON.stringify(intent.toolArgs, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Preflight results */}
      {preflightResults && (
        <div className="rounded-xl border bg-card shadow-sm p-5">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Safety Checks ({preflightResults.filter(c => c.status === "PASS").length}/{preflightResults.length} passed)
          </h2>
          <div className="space-y-2">
            {preflightResults.map((check, i) => (
              <div key={i} className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                check.status === "PASS" ? "bg-emerald-50" : "bg-red-50"
              )}>
                {check.status === "PASS" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                )}
                <span className="flex-1 text-xs">{check.check}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execution result */}
      {isExecuted && executionResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-sm font-medium text-emerald-800">Completed Successfully</h2>
          </div>
          <pre className="text-xs bg-white/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground">
            {JSON.stringify(executionResult, null, 2)}
          </pre>
          {executionId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/receipt/${executionId}`)}
              className="text-xs"
            >
              View Full Receipt
            </Button>
          )}
        </div>
      )}

      {/* Receipt link for previously executed intents */}
      {isExecuted && !executionResult && (
        <ExecutedReceiptLink intentId={intent.intentId} />
      )}

      {/* ─── Fixed bottom action bar ─── */}
      {isPending && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-lg border-t border-border/60 p-4 z-50 safe-area-pb">
          <div className="max-w-2xl mx-auto space-y-2">
            <div className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1.5">
              <Shield className="h-3 w-3" />
              Your cryptographic signature is required
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleApprove}
                disabled={approveMutation.isPending}
                className="flex-1 h-12 text-sm font-medium gap-2"
              >
                {approveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Approve
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={rejectMutation.isPending}
                className="h-12 px-6 text-sm font-medium gap-2"
              >
                {rejectMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Reject
              </Button>
            </div>
          </div>
        </div>
      )}

      {isApproved && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-lg border-t border-border/60 p-4 z-50 safe-area-pb">
          <div className="max-w-2xl mx-auto space-y-3">
            {/* Task type + recommendation */}
            {recommendQuery.data && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] px-2 bg-slate-100 border-slate-300 text-slate-700">
                  {recommendQuery.data.taskTypeLabel}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  {recommendQuery.data.reason}
                </span>
              </div>
            )}

            {/* Multi-agent chooser */}
            <div className="grid grid-cols-3 gap-2">
              {(agentsQuery.data ?? [
                { id: "passthrough", displayName: "Direct", provider: "RIO" },
                { id: "openai", displayName: "OpenAI GPT-4o", provider: "OPENAI" },
                { id: "claude", displayName: "Claude Sonnet", provider: "ANTHROPIC" },
              ]).map(agent => {
                const isRecommended = recommendQuery.data?.recommendedAgentId === agent.id;
                const isSelected = selectedAgent === agent.id;
                const agentColors: Record<string, { active: string; label: string }> = {
                  openai: { active: "bg-violet-100 border-violet-300 text-violet-800 ring-1 ring-violet-200", label: "OpenAI" },
                  claude: { active: "bg-orange-100 border-orange-300 text-orange-800 ring-1 ring-orange-200", label: "Claude" },
                  passthrough: { active: "bg-primary/10 border-primary/30 text-primary ring-1 ring-primary/20", label: "Direct" },
                };
                const colors = agentColors[agent.id] ?? agentColors.passthrough;
                return (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent.id)}
                    className={cn(
                      "relative px-3 py-2.5 rounded-xl text-xs font-medium border transition-all text-center",
                      isSelected
                        ? colors.active
                        : "bg-muted/30 border-border/60 text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    {colors.label}
                    {isRecommended && (
                      <span className="absolute -top-1.5 -right-1.5 text-[8px] bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded-full font-bold shadow-sm">
                        REC
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <Button
              onClick={handleExecute}
              disabled={executeMutation.isPending}
              className={cn(
                "w-full h-12 text-sm font-medium gap-2 text-white",
                selectedAgent === "openai" ? "bg-violet-600 hover:bg-violet-700" :
                selectedAgent === "claude" ? "bg-orange-600 hover:bg-orange-700" :
                "bg-emerald-600 hover:bg-emerald-700"
              )}
            >
              {executeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {selectedAgent === "openai" ? "Execute via OpenAI" :
               selectedAgent === "claude" ? "Execute via Claude" :
               "Execute"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
