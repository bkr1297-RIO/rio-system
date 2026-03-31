/**
 * ONE App — History Explorer
 *
 * Browse complete history of governed actions, approvals, denials,
 * executions, and receipts. Filter by status, action type, and source.
 * Click any entry to see full details including hash chain position.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  Hash,
  Copy,
  Check,
  Search,
  RefreshCw,
  FileText,
  Loader2,
  AlertTriangle,
  Link2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type LedgerEntry = {
  block_id: string;
  intent_id: string;
  action: string;
  decision: string;
  receipt_hash: string | null;
  previous_hash: string | null;
  current_hash: string;
  ledger_signature: string | null;
  protocol_version: string | null;
  timestamp: string | null;
  recorded_by: string;
  source?: string;
  detail?: string;
  status?: string;
  intent_hash?: string;
  authorization_hash?: string;
  execution_hash?: string;
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent transition-colors"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );
}

function decisionIcon(decision: string) {
  switch (decision) {
    case "approved":
    case "executed":
      return <CheckCircle2 className="h-4 w-4" style={{ color: "#22c55e" }} />;
    case "denied":
    case "blocked":
      return <XCircle className="h-4 w-4" style={{ color: "#ef4444" }} />;
    case "pending":
    case "pending_approval":
      return <Clock className="h-4 w-4" style={{ color: "#f59e0b" }} />;
    default:
      return <Shield className="h-4 w-4" style={{ color: "#6b7280" }} />;
  }
}

function decisionColor(decision: string): string {
  switch (decision) {
    case "approved":
    case "executed":
      return "#22c55e";
    case "denied":
    case "blocked":
      return "#ef4444";
    case "pending":
    case "pending_approval":
      return "#f59e0b";
    default:
      return "#6b7280";
  }
}

function formatTime(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

const PAGE_SIZE = 20;

export default function HistoryExplorer() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [page, setPage] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    chain_valid?: boolean;
    total_entries?: number;
    errors?: string[];
  } | null>(null);

  const {
    data: ledgerData,
    isLoading,
    refetch,
  } = trpc.rio.ledgerChain.useQuery(
    { limit: 200 },
    { refetchOnWindowFocus: true }
  );

  // Gateway chain verification (lazy query — only runs when user clicks Verify)
  const verifyQuery = trpc.rio.gatewayVerify.useQuery(
    {},
    { enabled: false } // don't run automatically
  );
  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const { data: result } = await verifyQuery.refetch();
      if (result) {
        setVerifyResult(result as any);
        const valid = (result as any)?.chain_valid ?? (result as any)?.valid;
        if (valid) {
          toast.success("Chain integrity verified", {
            description: `${(result as any)?.total_entries || 0} entries validated`,
          });
        } else {
          toast.error("Chain integrity issue detected");
        }
      }
    } catch (err: any) {
      toast.error("Verification failed", { description: err?.message });
    }
    setVerifying(false);
  };

  const allEntries: LedgerEntry[] = (ledgerData as any)?.entries ?? [];
  const chainValid = (ledgerData as any)?.chainValid ?? true;
  const sources: string[] = (ledgerData as any)?.sources ?? [];

  // Unique action types for filtering
  const actionTypes = useMemo(() => {
    const types = new Set(allEntries.map((e) => e.action));
    return Array.from(types).sort();
  }, [allEntries]);

  // Filtered entries
  const filtered = useMemo(() => {
    let result = allEntries;
    if (statusFilter !== "all") {
      result = result.filter((e) => {
        if (statusFilter === "approved")
          return e.decision === "approved" || e.decision === "executed";
        if (statusFilter === "denied")
          return e.decision === "denied" || e.decision === "blocked";
        if (statusFilter === "pending")
          return (
            e.decision === "pending" || e.decision === "pending_approval"
          );
        return e.decision === statusFilter;
      });
    }
    if (sourceFilter !== "all") {
      result = result.filter((e) => e.source === sourceFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.action.toLowerCase().includes(q) ||
          e.intent_id.toLowerCase().includes(q) ||
          e.recorded_by.toLowerCase().includes(q) ||
          (e.detail && e.detail.toLowerCase().includes(q))
      );
    }
    return result;
  }, [allEntries, statusFilter, sourceFilter, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageEntries = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Complete record of governed actions, approvals, and receipts
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!chainValid && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Chain integrity issue
            </Badge>
          )}
          {verifyResult && (
            <Badge
              variant={verifyResult.chain_valid ? "secondary" : "destructive"}
              className="gap-1 text-xs"
            >
              {verifyResult.chain_valid ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
              Gateway: {verifyResult.total_entries || 0} entries
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleVerifyChain}
            disabled={verifying}
            className="gap-2"
          >
            {verifying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Shield className="h-3.5 w-3.5" />
            )}
            Verify Chain
          </Button>
          {sources.length > 1 && (
            <Badge variant="secondary" className="text-xs">
              {sources.join(" + ")}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search actions, intent IDs, agents..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sourceFilter}
          onValueChange={(v) => {
            setSourceFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="gateway">Gateway</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Results */}
      {!isLoading && (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            {filtered.length} entries
            {filtered.length !== allEntries.length &&
              ` (of ${allEntries.length} total)`}
          </p>

          {filtered.length === 0 ? (
            <Card className="bg-card/30 border-dashed">
              <CardContent className="p-12 flex flex-col items-center text-center">
                <FileText className="h-8 w-8 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No entries found</h3>
                <p className="text-sm text-muted-foreground">
                  {search || statusFilter !== "all"
                    ? "Try adjusting your filters"
                    : "No governed actions have been recorded yet"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1">
              {pageEntries.map((entry, idx) => (
                <button
                  key={entry.intent_id + idx}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent/30 transition-colors text-left group"
                  onClick={() => setSelectedEntry(entry)}
                >
                  {decisionIcon(entry.decision)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {entry.action}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] capitalize shrink-0"
                        style={{
                          borderColor: decisionColor(entry.decision),
                          color: decisionColor(entry.decision),
                        }}
                      >
                        {entry.decision}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {entry.recorded_by} · {formatTime(entry.timestamp)}
                    </p>
                  </div>
                  {entry.source && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] shrink-0 opacity-60 group-hover:opacity-100"
                    >
                      {entry.source}
                    </Badge>
                  )}
                  {entry.receipt_hash && (
                    <span title="Has receipt">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Entry Detail Dialog */}
      <Dialog
        open={!!selectedEntry}
        onOpenChange={(open) => !open && setSelectedEntry(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedEntry && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {decisionIcon(selectedEntry.decision)}
                  <span>{selectedEntry.action}</span>
                  <Badge
                    variant="outline"
                    className="text-xs capitalize ml-auto"
                    style={{
                      borderColor: decisionColor(selectedEntry.decision),
                      color: decisionColor(selectedEntry.decision),
                    }}
                  >
                    {selectedEntry.decision}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                {/* Identity & Action */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Identity & Action
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <DetailField label="Intent ID" value={selectedEntry.intent_id} mono copyable />
                    <DetailField label="Block ID" value={selectedEntry.block_id} mono copyable />
                    <DetailField label="Agent" value={selectedEntry.recorded_by} />
                    <DetailField label="Timestamp" value={formatTime(selectedEntry.timestamp)} />
                    <DetailField label="Source" value={selectedEntry.source || "internal"} />
                    <DetailField label="Protocol" value={selectedEntry.protocol_version || "—"} />
                  </div>
                </div>

                <Separator />

                {/* Cryptographic Proof */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Hash className="h-3 w-3" />
                    Cryptographic Proof
                  </h4>
                  <div className="space-y-2">
                    <DetailField label="Current Hash" value={selectedEntry.current_hash || "—"} mono copyable />
                    <DetailField label="Previous Hash" value={selectedEntry.previous_hash || "genesis"} mono copyable />
                    <DetailField label="Receipt Hash" value={selectedEntry.receipt_hash || "—"} mono copyable />
                    <DetailField label="Ledger Signature" value={selectedEntry.ledger_signature || "—"} mono copyable />
                    {selectedEntry.intent_hash && (
                      <DetailField label="Intent Hash" value={selectedEntry.intent_hash} mono copyable />
                    )}
                    {selectedEntry.authorization_hash && (
                      <DetailField label="Authorization Hash" value={selectedEntry.authorization_hash} mono copyable />
                    )}
                    {selectedEntry.execution_hash && (
                      <DetailField label="Execution Hash" value={selectedEntry.execution_hash} mono copyable />
                    )}
                  </div>
                </div>

                {/* Chain Position */}
                <Separator />
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Link2 className="h-3 w-3" />
                    Chain Position
                  </h4>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Previous</p>
                      <p className="font-mono text-xs">
                        {selectedEntry.previous_hash
                          ? selectedEntry.previous_hash.slice(0, 12) + "..."
                          : "genesis"}
                      </p>
                    </div>
                    <div className="text-muted-foreground">→</div>
                    <div
                      className="text-center p-2 rounded border"
                      style={{ borderColor: "#b8963e40" }}
                    >
                      <p className="text-[10px]" style={{ color: "#b8963e" }}>
                        This Entry
                      </p>
                      <p className="font-mono text-xs font-bold">
                        {selectedEntry.current_hash
                          ? selectedEntry.current_hash.slice(0, 12) + "..."
                          : "—"}
                      </p>
                    </div>
                    <div className="text-muted-foreground">→</div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Next</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        ...
                      </p>
                    </div>
                  </div>
                </div>

                {selectedEntry.detail && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Detail
                      </h4>
                      <p className="text-sm">{selectedEntry.detail}</p>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <div className="flex items-center gap-1">
        <p
          className={`text-xs break-all ${mono ? "font-mono" : ""}`}
          title={value}
        >
          {value}
        </p>
        {copyable && value && value !== "—" && value !== "genesis" && (
          <CopyButton text={value} />
        )}
      </div>
    </div>
  );
}
