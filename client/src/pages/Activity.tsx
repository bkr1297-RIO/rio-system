import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Clock, XCircle, Zap, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  PENDING_APPROVAL: { label: "Needs Approval", color: "text-amber-500 bg-amber-50 border-amber-200", icon: Clock },
  APPROVED: { label: "Approved", color: "text-blue-500 bg-blue-50 border-blue-200", icon: CheckCircle2 },
  EXECUTED: { label: "Completed", color: "text-emerald-600 bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  REJECTED: { label: "Rejected", color: "text-red-500 bg-red-50 border-red-200", icon: XCircle },
  EXPIRED: { label: "Expired", color: "text-gray-400 bg-gray-50 border-gray-200", icon: Clock },
};

const TOOL_LABELS: Record<string, string> = {
  send_email: "Send Email",
  send_sms: "Send Text",
  search_web: "Web Search",
  read_file: "Read File",
  write_file: "Write File",
  delete_file: "Delete File",
  execute_code: "Run Code",
  transfer_funds: "Transfer Funds",
  echo: "Test Action",
};

const RISK_COLORS: Record<string, string> = {
  LOW: "text-emerald-600 bg-emerald-50",
  MEDIUM: "text-amber-600 bg-amber-50",
  HIGH: "text-red-600 bg-red-50",
};

export default function Activity() {
  const { isAuthenticated } = useAuth();

  const statusQuery = trpc.proxy.status.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const intents = statusQuery.data?.recentIntents ?? [];
  const pendingCount = intents.filter(i => i.status === "PENDING_APPROVAL").length;

  if (statusQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {pendingCount > 0
            ? `${pendingCount} action${pendingCount > 1 ? "s" : ""} waiting for your approval`
            : "All caught up"}
        </p>
      </div>

      {/* Pending section */}
      {pendingCount > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-amber-600 uppercase tracking-wide flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Needs Your Approval
          </h2>
          {intents
            .filter(i => i.status === "PENDING_APPROVAL")
            .map(intent => (
              <IntentCard key={intent.intentId} intent={intent} />
            ))}
        </div>
      )}

      {/* Completed section */}
      <div className="space-y-3">
        {pendingCount > 0 && (
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Recent
          </h2>
        )}
        {intents
          .filter(i => i.status !== "PENDING_APPROVAL")
          .map(intent => (
            <IntentCard key={intent.intentId} intent={intent} />
          ))}
        {intents.length === 0 && (
          <div className="text-center py-16">
            <Zap className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No activity yet</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Ask Bondi to do something and it will show up here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function IntentCard({ intent }: { intent: { intentId: string; toolName: string; riskTier: string; status: string; createdAt: Date | null; reasoning?: string | null } }) {
  const config = STATUS_CONFIG[intent.status] ?? STATUS_CONFIG.PENDING_APPROVAL;
  const StatusIcon = config.icon;
  const toolLabel = TOOL_LABELS[intent.toolName] ?? intent.toolName;
  const riskColor = RISK_COLORS[intent.riskTier] ?? "";
  const isPending = intent.status === "PENDING_APPROVAL";

  return (
    <Link href={`/intent/${intent.intentId}`}>
      <div className={cn(
        "flex items-center gap-4 p-4 rounded-xl border bg-card shadow-sm transition-all hover:shadow-md cursor-pointer group",
        isPending && "border-amber-200 bg-amber-50/30 ring-1 ring-amber-100"
      )}>
        {/* Status icon */}
        <div className={cn(
          "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
          isPending ? "bg-amber-100" : "bg-muted"
        )}>
          <StatusIcon className={cn("h-5 w-5", isPending ? "text-amber-600" : config.color.split(" ")[0])} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{toolLabel}</span>
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border", riskColor)}>
              {intent.riskTier}
            </Badge>
          </div>
          {intent.reasoning ? (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{intent.reasoning}</p>
          ) : null}
          {intent.createdAt && (
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              {formatRelativeTime(new Date(intent.createdAt))}
            </p>
          )}
        </div>

        {/* Action hint */}
        <div className="shrink-0">
          {isPending ? (
            <span className="text-xs font-medium text-amber-600 bg-amber-100 px-3 py-1.5 rounded-full">
              Review
            </span>
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
          )}
        </div>
      </div>
    </Link>
  );
}

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
