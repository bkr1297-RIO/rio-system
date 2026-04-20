import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocalStore } from "@/hooks/useLocalStore";
import { signData } from "@/lib/crypto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, CheckCircle2, Clock, XCircle, Zap, Play,
  BookOpen, ShieldCheck, AlertTriangle, ChevronDown,
  Mail, Search, FileText, FileEdit, MessageSquare,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Config ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  PENDING_APPROVAL: { label: "Needs Approval", color: "text-amber-600", icon: Clock },
  APPROVED: { label: "Ready to Execute", color: "text-blue-600", icon: CheckCircle2 },
  EXECUTED: { label: "Completed", color: "text-emerald-600", icon: CheckCircle2 },
  REJECTED: { label: "Rejected", color: "text-red-500", icon: XCircle },
  FAILED: { label: "Failed", color: "text-red-600", icon: AlertTriangle },
  EXPIRED: { label: "Expired", color: "text-gray-400", icon: Clock },
  KILLED: { label: "Killed", color: "text-red-400", icon: XCircle },
};

const TOOL_LABELS: Record<string, string> = {
  send_email: "Send Email",
  send_sms: "Send Text",
  search_web: "Search the Web",
  read_file: "Read a File",
  write_file: "Write a File",
  delete_file: "Delete a File",
  execute_code: "Run Code",
  transfer_funds: "Transfer Funds",
  draft_email: "Draft an Email",
  echo: "Test Action",
};

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  send_email: Mail,
  send_sms: MessageSquare,
  search_web: Search,
  read_file: FileText,
  write_file: FileEdit,
  draft_email: FileText,
  echo: Zap,
};

const RISK_INFO: Record<string, { label: string; color: string; bg: string }> = {
  LOW: { label: "Low Risk", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  MEDIUM: { label: "Medium Risk", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  HIGH: { label: "High Risk", color: "text-red-700", bg: "bg-red-50 border-red-200" },
};

// ─── Tab type ────────────────────────────────────────────────

type Tab = "all" | "pending" | "ledger";

// ─── Main Component ──────────────────────────────────────────

export default function Activity() {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("all");

  const statusQuery = trpc.proxy.status.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 10000,
  });

  const ledgerQuery = trpc.ledger.list.useQuery(undefined, {
    enabled: isAuthenticated && activeTab === "ledger",
  });

  const verifyQuery = trpc.ledger.verify.useQuery(undefined, {
    enabled: isAuthenticated && activeTab === "ledger",
  });

  const intents = statusQuery.data?.recentIntents ?? [];
  const approvals = statusQuery.data?.recentApprovals ?? [];
  const pendingIntents = intents.filter(i => i.status === "PENDING_APPROVAL");
  const approvedIntents = intents.filter(i => {
    if (i.status !== "APPROVED") return false;
    // Find matching approval — filter out stale/expired/fully-used approvals
    const approval = (approvals as any[]).find((a: any) => a.intentId === i.intentId && a.decision === "APPROVED");
    if (!approval) return false;
    if (approval.expiresAt && approval.expiresAt < Date.now()) return false;
    if (approval.executionCount >= approval.maxExecutions) return false;
    return true;
  });
  const actionableCount = pendingIntents.length + approvedIntents.length;

  if (statusQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {actionableCount > 0
            ? `${actionableCount} action${actionableCount > 1 ? "s" : ""} need your attention`
            : "All caught up — everything's running smoothly"}
        </p>
      </div>

      {/* Tabs: All | Pending | Ledger */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1">
        {([
          { key: "all" as Tab, label: "All Activity" },
          { key: "pending" as Tab, label: "Action Needed", badge: actionableCount },
          { key: "ledger" as Tab, label: "Audit Ledger" },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all relative",
              activeTab === tab.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {(tab.badge ?? 0) > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "all" && (
        <AllActivityView
          intents={intents}
          onRefresh={() => statusQuery.refetch()}
        />
      )}
      {activeTab === "pending" && (
        <PendingView
          pendingIntents={pendingIntents}
          approvedIntents={approvedIntents}
          onRefresh={() => statusQuery.refetch()}
        />
      )}
      {activeTab === "ledger" && (
        <LedgerView
          entries={ledgerQuery.data ?? []}
          verification={verifyQuery.data}
          isLoading={ledgerQuery.isLoading}
          onReverify={() => verifyQuery.refetch()}
        />
      )}
    </div>
  );
}

// ─── All Activity View ───────────────────────────────────────

function AllActivityView({ intents, onRefresh }: {
  intents: Array<{ intentId: string; toolName: string; riskTier: string; status: string; createdAt: Date | null; reasoning?: string | null }>;
  onRefresh: () => void;
}) {
  if (intents.length === 0) {
    return (
      <div className="text-center py-16">
        <Zap className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">No activity yet</p>
        <p className="text-muted-foreground/60 text-xs mt-1">
          Ask Bondi to do something and it'll show up here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {intents.map(intent => (
        <ActivityIntentCard key={intent.intentId} intent={intent} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

// ─── Pending View ────────────────────────────────────────────

function PendingView({ pendingIntents, approvedIntents, onRefresh }: {
  pendingIntents: Array<{ intentId: string; toolName: string; riskTier: string; status: string; createdAt: Date | null; reasoning?: string | null; toolArgs?: unknown }>;
  approvedIntents: Array<{ intentId: string; toolName: string; riskTier: string; status: string; createdAt: Date | null; reasoning?: string | null; toolArgs?: unknown }>;
  onRefresh: () => void;
}) {
  const all = [...pendingIntents, ...approvedIntents];

  if (all.length === 0) {
    return (
      <div className="text-center py-16">
        <CheckCircle2 className="h-10 w-10 text-emerald-500/30 mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">Nothing needs your attention</p>
        <p className="text-muted-foreground/60 text-xs mt-1">
          You're all caught up
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pendingIntents.length > 0 && (
        <div className="flex items-center gap-2 text-xs font-medium text-amber-600 uppercase tracking-wide">
          <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          Waiting for your approval
        </div>
      )}
      {pendingIntents.map(intent => (
        <ActivityIntentCard key={intent.intentId} intent={intent} onRefresh={onRefresh} expandByDefault />
      ))}

      {approvedIntents.length > 0 && (
        <div className="flex items-center gap-2 text-xs font-medium text-blue-600 uppercase tracking-wide mt-4">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          Ready to execute
        </div>
      )}
      {approvedIntents.map(intent => (
        <ActivityIntentCard key={intent.intentId} intent={intent} onRefresh={onRefresh} expandByDefault />
      ))}
    </div>
  );
}

// ─── Human-readable error messages ──────────────────────────

function humanizeError(error: string): string {
  if (error.includes("notifyOwner returned false") || error.includes("notification service unreachable")) {
    return "The notification service is temporarily unavailable. Your email content is safe — try again in a moment.";
  }
  if (error.includes("AGENT_NOT_FOUND")) {
    return "The selected AI agent isn't available right now. Try using Direct execution instead.";
  }
  if (error.includes("AGENT_ERROR")) {
    const match = error.match(/AGENT_ERROR:\s*(.+)/);
    return match ? `The AI agent encountered an issue: ${match[1]}` : "The AI agent couldn't process this request. Try again or use a different agent.";
  }
  if (error.includes("ARGS_HASH_MISMATCH")) {
    return "Security check failed — the action parameters were modified after approval. Please create a new intent.";
  }
  if (error.includes("CONNECTOR_ERROR")) {
    const match = error.match(/CONNECTOR_ERROR:\s*(.+)/);
    return match ? `Execution error: ${match[1]}` : "The action couldn't be completed due to a connector error.";
  }
  if (error.includes("Preflight failed")) {
    return `Pre-execution checks failed: ${error.replace("Preflight failed: ", "")}`;
  }
  if (error.includes("not_already_executed")) {
    return "This action has already been executed. Check your activity for the receipt.";
  }
  if (error.includes("approval_not_expired") || error.includes("approval expired")) {
    return "Your approval has expired. Please approve the action again.";
  }
  if (error.includes("execution_limit")) {
    return "This approval has reached its execution limit. Please approve the action again.";
  }
  return `${error}. You can try again or ask Bondi for help.`;
}

// ─── Activity Intent Card (with inline approve/execute) ──────

function ActivityIntentCard({ intent, onRefresh, expandByDefault }: {
  intent: Record<string, unknown> & { intentId: string; toolName: string; riskTier: string; status: string; createdAt: Date | null; toolArgs?: unknown };
  onRefresh: () => void;
  expandByDefault?: boolean;
}) {
  const { keys } = useLocalStore();
  const [localStatus, setLocalStatus] = useState(intent.status);
  const [expanded, setExpanded] = useState(expandByDefault ?? false);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<Record<string, unknown> | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authTokenId, setAuthTokenId] = useState<string | null>(null);

  const approveMutation = trpc.proxy.approve.useMutation();
  const rejectMutation = trpc.proxy.approve.useMutation();
  const executeMutation = trpc.proxy.execute.useMutation();

  const config = STATUS_CONFIG[localStatus] ?? STATUS_CONFIG.PENDING_APPROVAL;
  const StatusIcon = config.icon;
  const toolLabel = TOOL_LABELS[intent.toolName] ?? intent.toolName;
  const ToolIcon = TOOL_ICONS[intent.toolName] ?? Zap;
  const riskInfo = RISK_INFO[intent.riskTier] ?? RISK_INFO.LOW;
  const isPending = localStatus === "PENDING_APPROVAL";
  const isApproved = localStatus === "APPROVED";
  const isExecuted = localStatus === "EXECUTED";
  const isRejected = localStatus === "REJECTED";
  const isFailed = localStatus === "FAILED";
  const reflection: string = typeof (intent as any).reflection === "string" ? (intent as any).reflection : "";

  const handleApprove = async () => {
    if (!keys?.privateKey) {
      toast.error("No signing key found. Go to Settings to restore your keys.");
      return;
    }
    const dataToSign = JSON.stringify({
      intentId: intent.intentId,
      toolName: intent.toolName,
      decision: "APPROVED",
    });
    try {
      const signature = await signData(keys.privateKey, dataToSign);
      const approveResult = await approveMutation.mutateAsync({
        intentId: intent.intentId,
        decision: "APPROVED",
        signature,
        expiresInSeconds: 300,
        maxExecutions: 1,
      });
      // Capture the authorization token ID for execution
      const tokenId = (approveResult as any)?.authorizationToken?.token_id;
      if (tokenId) setAuthTokenId(tokenId);
      setLocalStatus("APPROVED");
      toast.success(tokenId ? "Approved! Authorization token issued." : "Approved!");
      onRefresh();
    } catch (e) {
      toast.error("Approval failed: " + (e as Error).message);
    }
  };

  const handleReject = async () => {
    try {
      await rejectMutation.mutateAsync({
        intentId: intent.intentId,
        decision: "REJECTED",
        signature: "REJECTED-BY-USER",
        expiresInSeconds: 0,
        maxExecutions: 0,
      });
      setLocalStatus("REJECTED");
      toast.info("Rejected.");
      onRefresh();
    } catch (e) {
      toast.error("Rejection failed: " + (e as Error).message);
    }
  };

  const handleExecute = async () => {
    setExecuting(true);
    try {
      const result = await executeMutation.mutateAsync({
        intentId: intent.intentId,
        ...(authTokenId ? { tokenId: authTokenId } : {}),
      });
      if (result.success) {
        setLocalStatus("EXECUTED");
        const execData = (result as Record<string, unknown>).execution as { result: unknown; executionId: string } | undefined;
        if (execData) {
          setExecutionResult(execData.result as Record<string, unknown>);
          setExecutionId(execData.executionId);
        }
        toast.success("Done!");
        onRefresh();
      } else {
        setLocalStatus("FAILED");
        const errMsg = result.error || "Something went wrong";
        setErrorMessage(errMsg);
        toast.error(errMsg);
      }
    } catch (e) {
      const errMsg = "Execution failed: " + (e as Error).message;
      setErrorMessage(errMsg);
      toast.error(errMsg);
      setLocalStatus("FAILED");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className={cn(
      "rounded-2xl border bg-card shadow-sm overflow-hidden transition-all",
      isPending && "border-amber-300 ring-2 ring-amber-200/60 bg-amber-50/30",
      isApproved && "border-blue-300 ring-2 ring-blue-200/60 bg-blue-50/30",
      isExecuted && "border-emerald-200 bg-emerald-50/20",
      isRejected && "opacity-60",
      isFailed && "border-red-200 bg-red-50/20",
    )}>
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className={cn(
          "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
          isPending ? "bg-amber-100" : isApproved ? "bg-blue-100" : isExecuted ? "bg-emerald-100" : "bg-muted"
        )}>
          {isExecuted ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : isPending ? (
            <Clock className="h-5 w-5 text-amber-600" />
          ) : (
            <ToolIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{toolLabel}</span>
            <Badge variant="outline" className={cn("text-[10px] px-1.5 border", riskInfo.bg, riskInfo.color)}>
              {riskInfo.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {isPending && "Needs your approval"}
            {isApproved && "Ready to execute"}
            {isExecuted && "Completed successfully"}
            {isRejected && "You rejected this"}
            {isFailed && "This action failed"}
          </p>
          {intent.createdAt && (
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
              {formatRelativeTime(new Date(intent.createdAt))}
            </p>
          )}
        </div>

        <ChevronDown className={cn(
          "h-4 w-4 text-muted-foreground/40 transition-transform shrink-0",
          expanded && "rotate-180"
        )} />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/30 pt-3">
          {/* Reasoning */}
          {reflection.length > 0 && (
            <p className="text-sm text-foreground/80 italic">"{reflection}"</p>
          )}

          {/* Tool args preview */}
          {intent.toolArgs != null && (
            <ArgsPreview toolName={intent.toolName} args={intent.toolArgs as Record<string, unknown>} />
          )}

          {/* Execution result */}
          {isExecuted && executionResult && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-800">Done</span>
              </div>
              {executionResult?.agentProvenance ? (
                <div className="flex items-center gap-1.5 text-[11px] text-violet-600 mb-1">
                  <Zap className="h-3 w-3" />
                  <span>Processed by {String((executionResult.agentProvenance as Record<string, unknown>).agentModel ?? "AI Agent")}</span>
                </div>
              ) : null}
              {executionId && (
                <Link href={`/receipt/${executionId}`}>
                  <span className="text-xs text-emerald-600 hover:underline">View full receipt →</span>
                </Link>
              )}
            </div>
          )}

          {/* Failed result */}
          {isFailed && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-800">Something went wrong</span>
              </div>
              {errorMessage && (
                <p className="text-xs text-red-600 mt-1">{humanizeError(errorMessage)}</p>
              )}
            </div>
          )}

          {/* ─── ACTION BUTTONS ─── */}
          {isPending && (
            <div className="flex gap-3 pt-1">
              <Button
                onClick={handleApprove}
                disabled={approveMutation.isPending}
                className="flex-1 h-14 text-base font-semibold gap-2 rounded-xl shadow-md bg-primary hover:bg-primary/90"
              >
                {approveMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                Approve
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={rejectMutation.isPending}
                className="h-14 px-6 text-base font-semibold gap-2 rounded-xl shadow-md"
              >
                {rejectMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
                Reject
              </Button>
            </div>
          )}

          {isApproved && !executing && !isExecuted && (
            <Button
              onClick={handleExecute}
              disabled={executeMutation.isPending}
              className="w-full h-14 text-base font-semibold gap-2 rounded-xl shadow-md bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {executeMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Play className="h-5 w-5" />
              )}
              Execute Now
            </Button>
          )}

          {executing && (
            <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Running...</span>
            </div>
          )}

          {/* Link to full detail page */}
          {!isPending && !isApproved && (
            <Link href={`/intent/${intent.intentId}`}>
              <span className="text-xs text-primary hover:underline">View full details →</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Args Preview ────────────────────────────────────────────

function ArgsPreview({ toolName, args }: { toolName: string; args: Record<string, unknown> }) {
  if (toolName === "send_email" || toolName === "send_sms" || toolName === "draft_email") {
    return (
      <div className="space-y-1.5 text-sm bg-muted/20 rounded-lg p-3">
        {args.to ? <div><span className="text-muted-foreground">To:</span> <span className="font-medium">{String(args.to)}</span></div> : null}
        {args.subject ? <div><span className="text-muted-foreground">Subject:</span> <span className="font-medium">{String(args.subject)}</span></div> : null}
        {(args.body || args.message) ? (
          <div className="mt-1 text-foreground/80 text-xs whitespace-pre-wrap line-clamp-4">
            {String(args.body || args.message)}
          </div>
        ) : null}
      </div>
    );
  }
  if (toolName === "search_web") {
    return (
      <div className="text-sm bg-muted/20 rounded-lg p-3">
        <span className="text-muted-foreground">Searching:</span> <span className="font-medium">{String(args.query || args.q || "")}</span>
      </div>
    );
  }
  const entries = Object.entries(args).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1 text-sm bg-muted/20 rounded-lg p-3">
      {entries.slice(0, 3).map(([k, v]) => (
        <div key={k}><span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}:</span> <span className="font-medium">{String(v)}</span></div>
      ))}
      {entries.length > 3 && <div className="text-xs text-muted-foreground">+{entries.length - 3} more</div>}
    </div>
  );
}

// ─── Ledger View ─────────────────────────────────────────────

const ENTRY_TYPE_COLORS: Record<string, string> = {
  ONBOARD: "bg-blue-100 text-blue-700 border-blue-200",
  INTENT: "bg-purple-100 text-purple-700 border-purple-200",
  APPROVAL: "bg-emerald-100 text-emerald-700 border-emerald-200",
  EXECUTION: "bg-amber-100 text-amber-700 border-amber-200",
  KILL: "bg-red-100 text-red-700 border-red-200",
  SYNC: "bg-cyan-100 text-cyan-700 border-cyan-200",
  BONDI_CHAT: "bg-indigo-100 text-indigo-700 border-indigo-200",
  LEARNING: "bg-pink-100 text-pink-700 border-pink-200",
  ARCHITECTURE_STATE: "bg-slate-100 text-slate-700 border-slate-200",
};

const ENTRY_TYPE_LABELS: Record<string, string> = {
  ONBOARD: "Onboarded",
  INTENT: "Action Proposed",
  APPROVAL: "Decision Made",
  EXECUTION: "Action Completed",
  KILL: "Kill Switch",
  SYNC: "System Sync",
  BONDI_CHAT: "Conversation",
  LEARNING: "Learning Event",
  ARCHITECTURE_STATE: "Architecture Update",
};

function LedgerView({ entries, verification, isLoading, onReverify }: {
  entries: Array<{ entryId: string; entryType: string; hash: string; prevHash: string; payload: unknown; timestamp: number }>;
  verification: { valid: boolean; entries: number; errors: string[] } | null | undefined;
  isLoading: boolean;
  onReverify: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chain verification banner */}
      {verification && (
        <div className={cn(
          "rounded-xl border p-3 flex items-center justify-between",
          verification.valid
            ? "bg-emerald-50/50 border-emerald-200"
            : "bg-red-50/50 border-red-200"
        )}>
          <div className="flex items-center gap-2">
            {verification.valid ? (
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-600" />
            )}
            <div>
              <p className={cn("text-sm font-medium", verification.valid ? "text-emerald-800" : "text-red-800")}>
                {verification.valid ? "Chain verified" : "Chain integrity issue"}
              </p>
              <p className="text-xs text-muted-foreground">
                {verification.entries} entries in tamper-evident hash chain
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onReverify} className="text-xs gap-1 h-8">
            <ShieldCheck className="h-3 w-3" /> Verify
          </Button>
        </div>
      )}

      {/* Ledger entries */}
      <div className="space-y-2">
        {entries.slice().reverse().map(entry => {
          const typeColor = ENTRY_TYPE_COLORS[entry.entryType] ?? ENTRY_TYPE_COLORS.SYNC;
          const typeLabel = ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType;
          const isExpanded = expandedId === entry.entryId;

          return (
            <button
              key={entry.entryId}
              onClick={() => setExpandedId(isExpanded ? null : entry.entryId)}
              className="w-full text-left rounded-xl border bg-card p-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={cn("text-[10px] px-1.5 border shrink-0", typeColor)}>
                  {typeLabel}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-mono text-muted-foreground/60 truncate">
                    {entry.hash.slice(0, 12)}...
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground/50 shrink-0">
                  {formatRelativeTime(new Date(entry.timestamp))}
                </span>
                <ChevronDown className={cn(
                  "h-3 w-3 text-muted-foreground/30 transition-transform shrink-0",
                  isExpanded && "rotate-180"
                )} />
              </div>

              {isExpanded && (
                <div className="mt-3 text-xs bg-muted/20 rounded-lg p-3 overflow-x-auto" onClick={e => e.stopPropagation()}>
                  <pre className="whitespace-pre-wrap break-all text-muted-foreground">
                    {JSON.stringify(entry.payload, null, 2)}
                  </pre>
                  <div className="mt-2 pt-2 border-t border-border/30 space-y-1">
                    <p className="font-mono text-[10px]"><span className="text-muted-foreground/60">Hash:</span> {entry.hash}</p>
                    {entry.prevHash && (
                      <p className="font-mono text-[10px]"><span className="text-muted-foreground/60">Previous:</span> {entry.prevHash}</p>
                    )}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {entries.length === 0 && (
        <div className="text-center py-16">
          <BookOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No ledger entries yet</p>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
