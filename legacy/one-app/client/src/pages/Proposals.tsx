/**
 * Proposals Page — Phase 2A Outreach Loop
 * ─────────────────────────────────────────
 * Surfaces proposal packets for human review.
 * Shows: status, risk tier, category, type, proposal summary, Notion link.
 * Actions: Approve (→ sign + execute), Reject, View Details.
 *
 * Invariant: This page NEVER auto-executes. All execution requires
 * explicit human action through the signing flow.
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, FileText, CheckCircle2, XCircle, AlertTriangle,
  Clock, Zap, Filter, ChevronDown, ChevronUp, ExternalLink,
  Shield, Send, Search, DollarSign, BarChart3, RefreshCw,
  Sparkles, ArrowRight, BookOpen,
} from "lucide-react";
import { toast } from "sonner";

/* ─── Type/Status display helpers ──────────────────────────── */
const TYPE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  outreach: { label: "Outreach", icon: Send, color: "text-blue-400" },
  task: { label: "Task", icon: Zap, color: "text-purple-400" },
  analysis: { label: "Analysis", icon: BarChart3, color: "text-cyan-400" },
  financial: { label: "Financial", icon: DollarSign, color: "text-amber-400" },
  follow_up: { label: "Follow-up", icon: RefreshCw, color: "text-emerald-400" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  proposed: { label: "Pending", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", icon: Clock },
  approved: { label: "Approved", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", icon: Shield },
  executed: { label: "Executed", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: XCircle },
  failed: { label: "Failed", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: AlertTriangle },
  expired: { label: "Expired", color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/20", icon: Clock },
};

const RISK_CONFIG: Record<string, { label: string; color: string; border: string }> = {
  LOW: { label: "Low", color: "text-emerald-400", border: "border-emerald-500/20" },
  MEDIUM: { label: "Medium", color: "text-amber-400", border: "border-amber-500/20" },
  HIGH: { label: "High", color: "text-red-400", border: "border-red-500/20" },
};

function getTypeDisplay(type: string) {
  return TYPE_CONFIG[type] || { label: type, icon: FileText, color: "text-muted-foreground" };
}
function getStatusDisplay(status: string) {
  return STATUS_CONFIG[status] || { label: status, color: "text-muted-foreground", bg: "bg-muted/50 border-border", icon: Clock };
}
function getRiskDisplay(risk: string) {
  return RISK_CONFIG[risk] || { label: risk, color: "text-slate-400", border: "border-slate-500/20" };
}

/* ─── Proposal Card ────────────────────────────────────────── */
function ProposalCard({
  proposal,
  onApprove,
  onReject,
  expanded,
  onToggle,
}: {
  proposal: any;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const typeDisplay = getTypeDisplay(proposal.type);
  const statusDisplay = getStatusDisplay(proposal.status);
  const riskDisplay = getRiskDisplay(proposal.riskTier);
  const StatusIcon = statusDisplay.icon;
  const TypeIcon = typeDisplay.icon;

  // Parse proposal JSON
  let proposalData: Record<string, unknown> = {};
  try {
    proposalData = typeof proposal.proposal === "string" ? JSON.parse(proposal.proposal) : (proposal.proposal || {});
  } catch { proposalData = {}; }

  const subject = (proposalData as any).subject || (proposalData as any).title || (proposalData as any).action || proposal.category;

  return (
    <div className={`border rounded-xl p-4 transition-all ${statusDisplay.bg}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={`w-8 h-8 rounded-lg bg-card flex items-center justify-center shrink-0`}>
            <TypeIcon className={`h-4 w-4 ${typeDisplay.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground truncate">{String(subject)}</span>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${riskDisplay.color} ${riskDisplay.border}`}>
                {riskDisplay.label}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{proposal.category}</span>
              <span className="text-xs text-muted-foreground/50">|</span>
              <span className={`text-xs font-medium ${statusDisplay.color} flex items-center gap-1`}>
                <StatusIcon className="h-3 w-3" />
                {statusDisplay.label}
              </span>
            </div>
          </div>
        </div>
        <button onClick={onToggle} className="text-muted-foreground hover:text-foreground transition-colors p-1">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Why it matters */}
      {proposal.whyItMatters && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{proposal.whyItMatters}</p>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border/40 space-y-3">
          {/* Reasoning */}
          {proposal.reasoning && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Reasoning</span>
              <p className="text-xs text-foreground/80 mt-0.5">{proposal.reasoning}</p>
            </div>
          )}

          {/* Proposal details */}
          {Object.keys(proposalData).length > 0 && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Proposal Details</span>
              <div className="mt-1 bg-card/50 rounded-lg p-2.5 space-y-1">
                {Object.entries(proposalData).map(([key, val]) => (
                  <div key={key} className="flex items-start gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0 w-24">{key}:</span>
                    <span className="text-[10px] font-mono text-foreground/70 break-all">{typeof val === "string" ? val : JSON.stringify(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk factors */}
          {proposal.riskFactors && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Risk Factors</span>
              <p className="text-xs text-foreground/80 mt-0.5">{proposal.riskFactors}</p>
            </div>
          )}

          {/* Notion link */}
          {proposal.notionPageId && (
            <a
              href={`https://notion.so/${proposal.notionPageId.replace(/-/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              View in Notion Decision Log
            </a>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
            <span className="font-mono">{proposal.proposalId?.slice(0, 16)}...</span>
            <span>{new Date(proposal.createdAt).toLocaleString()}</span>
            {proposal.receiptId && <span className="font-mono">RCP: {proposal.receiptId.slice(0, 12)}</span>}
          </div>
        </div>
      )}

      {/* Action buttons — only for pending proposals */}
      {proposal.status === "proposed" && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40">
          <Button
            size="sm"
            onClick={() => onApprove(proposal.proposalId)}
            className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Approve & Execute
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReject(proposal.proposalId)}
            className="h-8 text-xs text-red-400 border-red-500/20 hover:bg-red-500/10"
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────── */
export default function Proposals() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const { data: proposals, isLoading, refetch } = trpc.proposal.list.useQuery(
    {
      status: statusFilter as any,
      type: typeFilter as any,
      limit: 50,
    },
    { refetchInterval: 15000 }
  );

  const rejectMutation = trpc.proposal.reject.useMutation({
    onSuccess: () => {
      toast.success("Proposal rejected");
      refetch();
    },
    onError: (err) => toast.error(`Reject failed: ${err.message}`),
  });

  const handleApprove = (proposalId: string) => {
    // Navigate to the Notion signer page with the proposal ID
    // The signer page handles Ed25519 signing and Gateway authorization
    navigate(`/notion-signer?proposalId=${proposalId}`);
  };

  const handleReject = (proposalId: string) => {
    if (confirm("Reject this proposal?")) {
      rejectMutation.mutate({ proposalId });
    }
  };

  // Count by status
  const counts = useMemo(() => {
    if (!proposals) return { proposed: 0, executed: 0, rejected: 0, total: 0 };
    const proposed = proposals.filter((p: any) => p.status === "proposed").length;
    const executed = proposals.filter((p: any) => p.status === "executed").length;
    const rejected = proposals.filter((p: any) => p.status === "rejected").length;
    return { proposed, executed, rejected, total: proposals.length };
  }, [proposals]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border/40">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-bold">Proposals</h1>
                <p className="text-[10px] text-muted-foreground">Phase 2A — Outreach Loop</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className="h-7 text-xs"
              >
                <Filter className="h-3 w-3 mr-1" />
                Filter
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                className="h-7 w-7 p-0"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Status summary */}
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-amber-400 font-medium">{counts.proposed} pending</span>
            <span className="text-xs text-emerald-400 font-medium">{counts.executed} executed</span>
            <span className="text-xs text-red-400 font-medium">{counts.rejected} rejected</span>
            <span className="text-xs text-muted-foreground">{counts.total} total</span>
          </div>

          {/* Filter bar */}
          {showFilters && (
            <div className="flex items-center gap-2 mt-2 pb-1">
              <select
                value={statusFilter || ""}
                onChange={(e) => setStatusFilter(e.target.value || undefined)}
                className="text-xs bg-card border border-border rounded-md px-2 py-1 text-foreground"
              >
                <option value="">All Status</option>
                <option value="proposed">Pending</option>
                <option value="approved">Approved</option>
                <option value="executed">Executed</option>
                <option value="rejected">Rejected</option>
                <option value="failed">Failed</option>
              </select>
              <select
                value={typeFilter || ""}
                onChange={(e) => setTypeFilter(e.target.value || undefined)}
                className="text-xs bg-card border border-border rounded-md px-2 py-1 text-foreground"
              >
                <option value="">All Types</option>
                <option value="outreach">Outreach</option>
                <option value="task">Task</option>
                <option value="analysis">Analysis</option>
                <option value="financial">Financial</option>
                <option value="follow_up">Follow-up</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading proposals...</span>
          </div>
        ) : !proposals || proposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center">
              <BookOpen className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <span className="text-sm text-muted-foreground">No proposals yet</span>
            <p className="text-xs text-muted-foreground/70 text-center max-w-xs">
              Proposals will appear here when agents generate them from research.
              All proposals surface in Notion for your review.
            </p>
          </div>
        ) : (
          proposals.map((proposal: any) => (
            <ProposalCard
              key={proposal.proposalId}
              proposal={proposal}
              onApprove={handleApprove}
              onReject={handleReject}
              expanded={expandedId === proposal.proposalId}
              onToggle={() => setExpandedId(expandedId === proposal.proposalId ? null : proposal.proposalId)}
            />
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
}
