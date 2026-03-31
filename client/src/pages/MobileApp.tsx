/**
 * MobileApp — PWA Mobile App Shell
 *
 * Standalone mobile experience for RIO governance.
 * Bottom tab navigation with four screens:
 *   - Approvals: Pending actions requiring approval
 *   - Receipts: View and verify governance receipts
 *   - Ledger: Browse the tamper-evident action ledger
 *   - Settings: Connected apps, push notifications, about
 *
 * Designed to feel native when installed via "Add to Home Screen".
 * No NavBar — this is the app, not the marketing site.
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { InstallPrompt } from "@/components/InstallPrompt";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import {
  Shield,
  FileCheck,
  BookOpen,
  Settings,
  Loader2,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Eye,
  Bell,
  BellOff,
  Link2,
  LogOut,
  ExternalLink,
  Smartphone,
  Wifi,
  WifiOff,
  AlertTriangle,
  Clock,
  Hash,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────

type MobileTab = "approvals" | "receipts" | "ledger" | "settings";

interface LedgerEntryData {
  block_id: string;
  intent_id: string;
  action: string;
  decision: string;
  receipt_hash: string;
  previous_hash: string;
  current_hash: string;
  ledger_signature: string | null;
  protocol_version: string;
  timestamp: string;
  recorded_by: string;
}

// ── Constants ────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  send_email: "Send Email",
  send_slack_message: "Slack Message",
  send_slack_alert: "Slack Alert",
  transfer_funds: "Transfer Funds",
  deploy_production: "Deploy",
  read_data: "Read Data",
  read_file: "Read File",
  write_file: "Write File",
  create_event: "Calendar Event",
  delete_database: "Delete DB",
};

const ACTION_ICONS: Record<string, string> = {
  send_email: "\u2709\uFE0F",
  send_slack_message: "\uD83D\uDCAC",
  send_slack_alert: "\uD83D\uDD14",
  transfer_funds: "\uD83D\uDCB3",
  deploy_production: "\uD83D\uDE80",
  read_data: "\uD83D\uDCCA",
  read_file: "\uD83D\uDCC4",
  write_file: "\uD83D\uDCDD",
  create_event: "\uD83D\uDCC5",
  delete_database: "\uD83D\uDDD1\uFE0F",
};

const RISK_COLORS: Record<string, string> = {
  LOW: "#22c55e",
  MEDIUM: "#f59e0b",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

const TAB_ITEMS: { id: MobileTab; label: string; icon: typeof Shield }[] = [
  { id: "approvals", label: "Approvals", icon: Shield },
  { id: "receipts", label: "Receipts", icon: FileCheck },
  { id: "ledger", label: "Ledger", icon: BookOpen },
  { id: "settings", label: "Settings", icon: Settings },
];

const RIO_LOGO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/icon-96x96_0fbc2ebd.png";

// ── Helper ───────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  truncate,
  valueColor,
}: {
  label: string;
  value: string;
  truncate?: boolean;
  valueColor?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground shrink-0 w-24">{label}</span>
      <span
        className={cn("break-all", truncate && "font-mono text-[10px]")}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────

export default function MobileApp({ initialTab }: { initialTab?: MobileTab }) {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<MobileTab>(initialTab || "approvals");

  // ── Auth Gate ──────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <img src={RIO_LOGO} alt="RIO" className="w-16 h-16 rounded-2xl mx-auto mb-4" />
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <img src={RIO_LOGO} alt="RIO" className="w-20 h-20 rounded-2xl mb-6" />
        <h1 className="text-2xl font-bold text-white mb-2">RIO</h1>
        <p className="text-sm text-muted-foreground text-center mb-8 max-w-xs">
          Governed Intelligence. Approve actions, verify receipts, and browse
          the tamper-evident ledger from your phone.
        </p>
        <Button
          onClick={() => {
            window.location.href = getLoginUrl(window.location.pathname);
          }}
          className="w-full max-w-xs bg-rio-gold text-rio-navy font-semibold hover:bg-rio-gold/90"
          size="lg"
        >
          Sign In
        </Button>
      </div>
    );
  }

  // ── Authenticated App ──────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Status bar spacer for standalone mode */}
      <div className="h-[env(safe-area-inset-top)] bg-background" />

      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background/95 backdrop-blur-sm sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <img src={RIO_LOGO} alt="RIO" className="w-7 h-7 rounded-lg" />
          <span className="text-sm font-semibold text-white">RIO</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {user?.name || user?.email || "User"}
          </span>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto min-h-0">
        {activeTab === "approvals" && <ApprovalsScreen />}
        {activeTab === "receipts" && <ReceiptsScreen />}
        {activeTab === "ledger" && <LedgerScreen />}
        {activeTab === "settings" && <SettingsScreen onLogout={logout} />}
      </main>

      {/* Bottom tab bar */}
      <nav className="border-t border-border/50 bg-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around py-2">
          {TAB_ITEMS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-[64px]",
                  isActive
                    ? "text-rio-gold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Install prompt (only shows if not already installed) */}
      <InstallPrompt />
    </div>
  );
}

// ── Approvals Screen ─────────────────────────────────────────────────────

function ApprovalsScreen() {
  const { data, isLoading, refetch } = trpc.rio.ledgerChain.useQuery({ limit: 200 });
  const approveMutation = trpc.rio.approve.useMutation();
  const denyMutation = trpc.rio.deny.useMutation();

  // Filter for pending intents from the ledger data
  // In the current architecture, pending intents don't appear in the ledger
  // (only completed actions do). So we show recent actions that could be
  // pending, plus a CTA to run new governed actions.
  const recentEntries: LedgerEntryData[] = useMemo(() => {
    if (!data?.entries) return [];
    return ([...data.entries] as LedgerEntryData[]).reverse().slice(0, 10);
  }, [data]);

  const pendingCount = 0; // Will be populated when we add a pendingIntents query

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Approvals</h2>
          <p className="text-xs text-muted-foreground">
            Pending actions requiring your decision
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()} className="shrink-0">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-4">
          {/* Pending section */}
          {pendingCount === 0 && (
            <div className="rounded-2xl border border-dashed border-border/50 p-6 text-center mb-4">
              <Shield className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-white mb-1">
                No pending approvals
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                When an AI agent requests a real-world action, it will appear
                here for your approval.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open("/one/approvals", "_blank")}
                className="text-xs"
              >
                <ExternalLink className="w-3 h-3 mr-1.5" />
                Run a Governed Action
              </Button>
            </div>
          )}

          {/* Recent decisions */}
          {recentEntries.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Recent Decisions
              </h3>
              <div className="space-y-2">
                {recentEntries.map((entry) => (
                  <div
                    key={entry.block_id}
                    className="rounded-xl border border-border/50 p-3 flex items-center gap-3"
                  >
                    <span className="text-lg shrink-0">
                      {ACTION_ICONS[entry.action] || "\u26A1"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {ACTION_LABELS[entry.action] || entry.action}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] shrink-0",
                        entry.decision === "approved"
                          ? "text-green-500 border-green-500/30"
                          : "text-red-500 border-red-500/30"
                      )}
                    >
                      {entry.decision === "approved" ? "Approved" : "Denied"}
                    </Badge>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Receipts Screen ──────────────────────────────────────────────────────

function ReceiptsScreen() {
  const { data, isLoading, refetch } = trpc.rio.ledgerChain.useQuery({ limit: 100 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, boolean> | null>(null);
  const verifyReceipt = trpc.rio.verifyReceipt.useMutation();

  const entries: LedgerEntryData[] = useMemo(() => {
    if (!data?.entries) return [];
    return ([...data.entries] as LedgerEntryData[]).reverse();
  }, [data]);

  const handleVerify = useCallback(
    async (receiptHash: string) => {
      setVerifyingId(receiptHash);
      try {
        const result = await verifyReceipt.mutateAsync({ receiptId: receiptHash });
        const d = result as Record<string, unknown>;
        setVerifyResult({
          "Signature Valid": !!d.signatureValid,
          "Hash Format Valid": !!d.hashValid,
          "Ledger Recorded": !!d.ledgerRecorded,
          "Protocol Version": d.protocolVersion === "v2",
          Verified: d.verificationStatus === "verified",
        });
      } catch {
        setVerifyResult(null);
      }
    },
    [verifyReceipt]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Receipts</h2>
          <p className="text-xs text-muted-foreground">
            Cryptographic proof of every governed action
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()} className="shrink-0">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-6">
          <FileCheck className="w-12 h-12 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground text-center">
            No receipts yet. Run a governed action to generate your first
            cryptographic receipt.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-4 space-y-2">
          {entries.map((entry) => {
            const isExpanded = expandedId === entry.block_id;
            const isVerifying = verifyingId === entry.receipt_hash;
            return (
              <div
                key={entry.block_id}
                className="rounded-xl border border-border/50 overflow-hidden"
              >
                {/* Summary */}
                <button
                  className="w-full p-3 text-left active:bg-accent/30 transition-colors"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : entry.block_id)
                  }
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg shrink-0">
                      {ACTION_ICONS[entry.action] || "\u26A1"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">
                        {ACTION_LABELS[entry.action] || entry.action}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Hash className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] font-mono text-muted-foreground truncate">
                          {entry.receipt_hash?.slice(0, 16)}...
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] shrink-0",
                        entry.decision === "approved"
                          ? "text-green-500 border-green-500/30"
                          : "text-red-500 border-red-500/30"
                      )}
                    >
                      {entry.decision === "approved" ? "Approved" : "Denied"}
                    </Badge>
                    <ChevronRight
                      className={cn(
                        "w-4 h-4 text-muted-foreground transition-transform shrink-0",
                        isExpanded && "rotate-90"
                      )}
                    />
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-0 border-t border-border/30">
                    <div className="rounded-lg bg-muted/30 p-3 mt-3 space-y-1.5 text-xs">
                      <DetailRow label="Intent ID" value={entry.intent_id} truncate />
                      <DetailRow label="Action" value={entry.action} />
                      <DetailRow
                        label="Decision"
                        value={entry.decision}
                        valueColor={
                          entry.decision === "approved" ? "#22c55e" : "#ef4444"
                        }
                      />
                      <DetailRow
                        label="Receipt Hash"
                        value={entry.receipt_hash}
                        truncate
                      />
                      <DetailRow
                        label="Chain Hash"
                        value={entry.current_hash}
                        truncate
                      />
                      <DetailRow
                        label="Previous"
                        value={entry.previous_hash || "GENESIS"}
                        truncate
                      />
                      {entry.ledger_signature && (
                        <DetailRow
                          label="Signature"
                          value={entry.ledger_signature}
                          truncate
                        />
                      )}
                      <DetailRow label="Protocol" value={entry.protocol_version} />
                      <DetailRow label="Recorded By" value={entry.recorded_by} />
                      <DetailRow
                        label="Timestamp"
                        value={new Date(entry.timestamp).toLocaleString()}
                      />
                    </div>

                    {/* Verify button */}
                    <div className="mt-3">
                      {isVerifying && verifyResult ? (
                        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 space-y-1.5">
                          {Object.entries(verifyResult).map(([label, passed]) => (
                            <div
                              key={label}
                              className="flex items-center gap-2 text-xs"
                            >
                              {passed ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 text-red-500" />
                              )}
                              <span
                                className={
                                  passed ? "text-green-500" : "text-red-500"
                                }
                              >
                                {label}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => handleVerify(entry.receipt_hash)}
                          disabled={verifyReceipt.isPending}
                        >
                          {verifyReceipt.isPending && isVerifying ? (
                            <Loader2 className="w-3 h-3 animate-spin mr-2" />
                          ) : (
                            <Eye className="w-3 h-3 mr-2" />
                          )}
                          Verify Receipt
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Ledger Screen ────────────────────────────────────────────────────────

function LedgerScreen() {
  const { data, isLoading, refetch } = trpc.rio.ledgerChain.useQuery({ limit: 200 });
  const [filter, setFilter] = useState<"all" | "approved" | "denied">("all");

  const entries: LedgerEntryData[] = useMemo(() => {
    if (!data?.entries) return [];
    const all = ([...data.entries] as LedgerEntryData[]).reverse();
    if (filter === "all") return all;
    return all.filter((e) => e.decision === filter);
  }, [data, filter]);

  const stats = useMemo(() => {
    if (!data?.entries) return { total: 0, approved: 0, denied: 0 };
    const all = data.entries as LedgerEntryData[];
    return {
      total: all.length,
      approved: all.filter((e) => e.decision === "approved").length,
      denied: all.filter((e) => e.decision === "denied").length,
    };
  }, [data]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Ledger</h2>
          <p className="text-xs text-muted-foreground">
            Tamper-evident chain
            {data?.chainValid !== undefined && (
              <span className={data.chainValid ? " \u00B7 Intact" : " \u00B7 Broken"}>
                {data.chainValid ? " \u2705" : " \u26A0\uFE0F"}
              </span>
            )}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()} className="shrink-0">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Stats bar */}
      <div className="px-4 pb-3 flex gap-2">
        <StatPill
          label="Total"
          value={stats.total}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <StatPill
          label="Approved"
          value={stats.approved}
          color="#22c55e"
          active={filter === "approved"}
          onClick={() => setFilter("approved")}
        />
        <StatPill
          label="Denied"
          value={stats.denied}
          color="#ef4444"
          active={filter === "denied"}
          onClick={() => setFilter("denied")}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-6">
          <BookOpen className="w-12 h-12 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground text-center">
            No ledger entries yet
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-4 space-y-1.5">
          {entries.map((entry, idx) => (
            <div
              key={entry.block_id}
              className="rounded-lg border border-border/30 p-3"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-mono text-muted-foreground">
                  #{entries.length - idx}
                </span>
                <span className="text-sm">
                  {ACTION_ICONS[entry.action] || "\u26A1"}
                </span>
                <span className="text-xs font-medium text-white flex-1 truncate">
                  {ACTION_LABELS[entry.action] || entry.action}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] px-1.5 py-0",
                    entry.decision === "approved"
                      ? "text-green-500 border-green-500/30"
                      : "text-red-500 border-red-500/30"
                  )}
                >
                  {entry.decision}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <Clock className="w-3 h-3 shrink-0" />
                <span>{new Date(entry.timestamp).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                <Hash className="w-3 h-3 shrink-0" />
                <span className="font-mono truncate">
                  {entry.current_hash?.slice(0, 24)}...
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatPill({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
        active
          ? "bg-white/10 text-white"
          : "bg-transparent text-muted-foreground hover:bg-white/5"
      )}
    >
      {color && (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
      )}
      <span>{label}</span>
      <span className="font-bold">{value}</span>
    </button>
  );
}

// ── Settings Screen ──────────────────────────────────────────────────────

function SettingsScreen({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  const { isSupported, permission, requestPermission, loading: pushLoading } =
    usePushNotifications();

  // Connection status queries
  const googleStatus = trpc.connections.googleStatus.useQuery(undefined, {
    retry: false,
  });
  const githubStatus = trpc.connections.githubStatus.useQuery(undefined, {
    retry: false,
  });
  const slackStatus = trpc.connections.slackStatus.useQuery(undefined, {
    retry: false,
  });

  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true);

  return (
    <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-6 pb-8">
      {/* Profile */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Account
        </h3>
        <div className="rounded-xl border border-border/50 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rio-gold/20 flex items-center justify-center">
              <span className="text-rio-gold font-bold text-sm">
                {(user?.name || user?.email || "U")[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {user?.name || "User"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email || ""}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Connected Apps */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Connected Apps
        </h3>
        <div className="rounded-xl border border-border/50 divide-y divide-border/30">
          <ConnectionRow
            name="Google"
            icon="\uD83C\uDF10"
            connected={googleStatus.data?.connected ?? false}
            detail={googleStatus.data?.email || undefined}
            loading={googleStatus.isLoading}
          />
          <ConnectionRow
            name="GitHub"
            icon="\uD83D\uDC19"
            connected={githubStatus.data?.connected ?? false}
            detail={githubStatus.data?.username || undefined}
            loading={githubStatus.isLoading}
          />
          <ConnectionRow
            name="Slack"
            icon="\uD83D\uDCAC"
            connected={slackStatus.data?.connected ?? false}
            detail={slackStatus.data?.channelName || undefined}
            loading={slackStatus.isLoading}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 text-xs text-muted-foreground w-full"
          onClick={() => window.open("/one/connections", "_blank")}
        >
          <Link2 className="w-3 h-3 mr-1.5" />
          Manage in ONE App
        </Button>
      </section>

      {/* Notifications */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Notifications
        </h3>
        <div className="rounded-xl border border-border/50 p-4">
          {!isSupported ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <BellOff className="w-5 h-5 shrink-0" />
              <span>Push notifications are not supported in this browser</span>
            </div>
          ) : permission === "granted" ? (
            <div className="flex items-center gap-3 text-sm text-green-500">
              <Bell className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-medium">Notifications enabled</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  You will receive alerts when actions need approval
                </p>
              </div>
            </div>
          ) : permission === "denied" ? (
            <div className="flex items-center gap-3 text-sm text-red-500">
              <BellOff className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-medium">Notifications blocked</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enable in your browser settings to receive approval alerts
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">
                  Enable push notifications
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Get alerts when actions need your approval
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={requestPermission}
                disabled={pushLoading}
                className="shrink-0 text-xs"
              >
                {pushLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  "Enable"
                )}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* App Info */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          About
        </h3>
        <div className="rounded-xl border border-border/50 p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">App Mode</span>
            <div className="flex items-center gap-1.5">
              {isStandalone ? (
                <>
                  <Smartphone className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-green-500 text-xs">Installed</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Browser</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Protocol</span>
            <span className="text-xs text-white">RIO v2</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Cryptography</span>
            <span className="text-xs text-white">Ed25519 + SHA-256</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Ledger</span>
            <span className="text-xs text-white">Hash-chained, append-only</span>
          </div>
        </div>
      </section>

      {/* Sign Out */}
      <Button
        variant="outline"
        className="w-full text-red-500 border-red-500/30 hover:bg-red-500/10"
        onClick={onLogout}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Sign Out
      </Button>

      {/* Footer */}
      <p className="text-[10px] text-muted-foreground/50 text-center pb-4">
        &copy; 2025&ndash;2026 RIO Protocol. All rights reserved.
      </p>
    </div>
  );
}

function ConnectionRow({
  name,
  icon,
  connected,
  detail,
  loading,
}: {
  name: string;
  icon: string;
  connected: boolean;
  detail?: string;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-3">
      <span className="text-lg shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{name}</p>
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground mt-0.5" />
        ) : detail ? (
          <p className="text-[10px] text-muted-foreground truncate">{detail}</p>
        ) : null}
      </div>
      {!loading && (
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            connected
              ? "text-green-500 border-green-500/30"
              : "text-muted-foreground border-border/50"
          )}
        >
          {connected ? "Connected" : "Not connected"}
        </Badge>
      )}
    </div>
  );
}
