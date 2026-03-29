/**
 * Bondi — Your AI Chief of Staff
 *
 * MVP product experience. A unified workspace where a new user can:
 *   1. Sign up / log in
 *   2. See onboarding if no apps connected
 *   3. Connect Google (primary) or Slack (secondary)
 *   4. Try a governed action
 *   5. Approve or deny it
 *   6. See the receipt
 *   7. See the history / ledger
 *
 * Layout: Left sidebar (nav) | Main window (content) | Right panel (AI assistant)
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import ReceiptExport from "@/components/ReceiptExport";
import {
  Mail,
  Calendar,
  FolderOpen,
  Github,
  MessageSquare,
  Zap,
  Shield,
  BookOpen,
  ChevronLeft,
  Send,
  Sparkles,
  Loader2,
  RefreshCw,
  ArrowLeft,
  Reply,
  ExternalLink,
  Clock,
  FileText,
  User,
  Menu,
  X,
  Link2,
  CheckCircle2,
  AlertCircle,
  Home as HomeIcon,
  Play,
  ChevronRight,
  Hash,
  Eye,
  ArrowRight,
  XCircle,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Streamdown } from "streamdown";

// ── Types ────────────────────────────────────────────────────────────────

type Tab =
  | "home"
  | "inbox"
  | "calendar"
  | "drive"
  | "github"
  | "ask"
  | "actions"
  | "approvals"
  | "ledger";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

interface ReceiptData {
  receipt_id: string;
  intent_hash: string;
  action_hash: string;
  verification_hash: string;
  decision: string;
  decision_source?: string;
  execution_mode?: string;
  risk_score: number;
  risk_level: string;
  policy_decision: string;
  policy_rule_id?: string;
  signature: string;
  protocol_version: string;
  [key: string]: unknown;
}

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

interface ConnectorResult {
  success: boolean;
  connector: string;
  action: string;
  mode: string;
  executedAt: string;
  detail: string;
  externalId?: string;
  error?: string;
}

// ── Constants ────────────────────────────────────────────────────────────

const BONDI_LOGO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/bondi-logo_858ccd3b.png";

const NAV_ITEMS: { id: Tab; label: string; icon: typeof Mail; section?: string }[] = [
  { id: "home", label: "Home", icon: HomeIcon, section: "Overview" },
  { id: "inbox", label: "Inbox", icon: Mail, section: "Workspace" },
  { id: "calendar", label: "Calendar", icon: Calendar, section: "Workspace" },
  { id: "drive", label: "Drive", icon: FolderOpen, section: "Workspace" },
  { id: "github", label: "GitHub", icon: Github, section: "Workspace" },
  { id: "ask", label: "Chat", icon: MessageSquare, section: "AI" },
  { id: "actions", label: "Run Action", icon: Play, section: "Governance" },
  { id: "approvals", label: "Approvals", icon: Shield, section: "Governance" },
  { id: "ledger", label: "History", icon: BookOpen, section: "Governance" },
];

const ACTION_LABELS: Record<string, string> = {
  send_email: "Send Email",
  send_slack_message: "Send Slack Message",
  send_slack_alert: "Send Slack Alert",
  transfer_funds: "Transfer Funds",
  deploy_production: "Deploy Production",
  read_data: "Read Data",
  read_file: "Read File",
  write_file: "Write File",
  create_event: "Create Calendar Event",
  delete_database: "Delete Database",
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

// ── Scenarios for "Try a Governed Action" ────────────────────────────────

interface Scenario {
  id: string;
  label: string;
  icon: string;
  connector: string;
  connectorName: string;
  action: string;
  description: string;
  target: string;
  parameters: Record<string, string>;
  riskLevel: string;
  riskColor: string;
  requester: string;
  category: "google" | "microsoft" | "slack" | "other";
}

const SCENARIOS: Scenario[] = [
  {
    id: "gmail_send",
    label: "Send Email",
    icon: "\u2709\uFE0F",
    connector: "gmail",
    connectorName: "Gmail",
    action: "send_email",
    description: "Send a test email via Gmail",
    target: "test@example.com",
    parameters: { to: "test@example.com", subject: "Test from Bondi", body: "This email was sent through RIO governance." },
    riskLevel: "HIGH",
    riskColor: "#f97316",
    requester: "Bondi AI",
    category: "google",
  },
  {
    id: "calendar_event",
    label: "Create Event",
    icon: "\uD83D\uDCC5",
    connector: "gmail",
    connectorName: "Google Calendar",
    action: "create_event",
    description: "Create a calendar event",
    target: "Your Google Calendar",
    parameters: { title: "Team Standup", date: "Tomorrow 10:00 AM", duration: "30 minutes" },
    riskLevel: "LOW",
    riskColor: "#22c55e",
    requester: "Bondi AI",
    category: "google",
  },
  {
    id: "outlook_send",
    label: "Send Outlook Email",
    icon: "\u2709\uFE0F",
    connector: "outlook_mail",
    connectorName: "Outlook Mail",
    action: "send_email",
    description: "Send a test email via Outlook",
    target: "test@example.com",
    parameters: { to: "test@example.com", subject: "Test from Bondi", body: "This email was sent through RIO governance via Outlook." },
    riskLevel: "HIGH",
    riskColor: "#f97316",
    requester: "Bondi AI",
    category: "microsoft",
  },
  {
    id: "outlook_calendar_event",
    label: "Outlook Calendar Event",
    icon: "\uD83D\uDCC5",
    connector: "outlook_calendar",
    connectorName: "Outlook Calendar",
    action: "create_event",
    description: "Create a calendar event in Outlook",
    target: "Your Outlook Calendar",
    parameters: { title: "Team Standup", date: "Tomorrow 10:00 AM", duration: "30 minutes" },
    riskLevel: "LOW",
    riskColor: "#22c55e",
    requester: "Bondi AI",
    category: "microsoft",
  },
  {
    id: "onedrive_upload",
    label: "Upload to OneDrive",
    icon: "\u2601\uFE0F",
    connector: "onedrive",
    connectorName: "OneDrive",
    action: "upload_file",
    description: "Upload a file to OneDrive",
    target: "Your OneDrive",
    parameters: { filename: "bondi-report.pdf", folder: "Documents", size: "2.4 MB" },
    riskLevel: "MEDIUM",
    riskColor: "#f59e0b",
    requester: "Bondi AI",
    category: "microsoft",
  },
  {
    id: "slack_message",
    label: "Slack Message",
    icon: "\uD83D\uDCAC",
    connector: "slack",
    connectorName: "Slack",
    action: "send_slack_message",
    description: "Send a message to your Slack channel",
    target: "Connected Slack Channel",
    parameters: { channel: "general", message: "Hello from Bondi! This message was governed by RIO." },
    riskLevel: "MEDIUM",
    riskColor: "#f59e0b",
    requester: "Bondi AI",
    category: "slack",
  },
];

// ── Login Screen ─────────────────────────────────────────────────────────

function BondiLogin() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <img src={BONDI_LOGO} alt="Bondi" className="w-24 h-24 rounded-2xl mb-8" />
      <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
        Bondi
      </h1>
      <p className="text-muted-foreground text-center max-w-sm mb-8">
        Your AI Chief of Staff — secured by RIO
      </p>
      <Button
        size="lg"
        className="w-full max-w-xs"
        onClick={() => {
          window.location.href = getLoginUrl("/app");
        }}
      >
        Sign in to continue
      </Button>
      <p className="text-xs text-muted-foreground mt-6">
        All actions governed by{" "}
        <a href="/" className="underline hover:text-foreground">
          RIO Protocol
        </a>
      </p>
    </div>
  );
}

// ── Onboarding Screen ───────────────────────────────────────────────────

function OnboardingView({
  onConnectGoogle,
  onSkip,
}: {
  onConnectGoogle: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12">
      <div className="max-w-md w-full text-center">
        <img src={BONDI_LOGO} alt="Bondi" className="w-20 h-20 rounded-2xl mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Welcome to Bondi
        </h2>
        <p className="text-muted-foreground mb-8">
          Your AI Chief of Staff. Connect your apps and let Bondi manage your
          digital life — with every action governed, approved, and recorded.
        </p>

        {/* Steps */}
        <div className="space-y-4 mb-10 text-left">
          {[
            { step: 1, title: "Connect your apps", desc: "Start with Google (Gmail, Calendar, Drive)" },
            { step: 2, title: "Try a governed action", desc: "Send an email or create an event through RIO" },
            { step: 3, title: "See the proof", desc: "Every action gets a receipt and ledger entry" },
          ].map((s) => (
            <div key={s.step} className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-primary">{s.step}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Primary CTA */}
        <Button size="lg" className="w-full mb-3" onClick={onConnectGoogle}>
          <Mail className="w-4 h-4 mr-2" />
          Connect Google Account
        </Button>

        <button
          onClick={onSkip}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now — explore first
        </button>
      </div>
    </div>
  );
}

// ── Connect Prompt (inline) ─────────────────────────────────────────────

function ConnectPrompt({ service }: { service: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-6">
      <Link2 className="w-12 h-12 text-muted-foreground/30" />
      <div>
        <h3 className="text-lg font-semibold mb-2">Connect {service}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Connect your {service} account to see your data here.
        </p>
      </div>
      <Button
        variant="outline"
        onClick={() => {
          window.location.href = `/api/oauth/google/start?returnTo=/app&origin=${encodeURIComponent(window.location.origin)}`;
        }}
      >
        Connect Google Apps
      </Button>
    </div>
  );
}

// ── Dashboard Home ──────────────────────────────────────────────────────

function DashboardHome({
  googleConnected,
  slackConnected,
  googleEmail,
  slackChannel,
  onNavigate,
}: {
  googleConnected: boolean;
  slackConnected: boolean;
  googleEmail: string | null;
  slackChannel: string | null;
  onNavigate: (tab: Tab) => void;
}) {
  const { data: ledgerData } = trpc.rio.ledgerChain.useQuery({ limit: 50 });

  const recentEntries: LedgerEntryData[] = useMemo(() => {
    if (!ledgerData?.entries) return [];
    return ([...ledgerData.entries] as LedgerEntryData[]).reverse().slice(0, 5);
  }, [ledgerData]);

  const stats = useMemo(() => {
    const entries = (ledgerData?.entries ?? []) as LedgerEntryData[];
    const total = entries.length;
    const approved = entries.filter((e) => e.decision === "approved").length;
    const denied = entries.filter((e) => e.decision === "denied").length;
    return { total, approved, denied };
  }, [ledgerData]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b shrink-0">
        <h2 className="text-lg font-semibold">Dashboard</h2>
        <p className="text-xs text-muted-foreground">Your governance overview</p>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-6 space-y-6">
          {/* Connected Apps */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Connected Apps
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Google */}
              <div className={cn(
                "rounded-xl border p-4 transition-colors",
                googleConnected ? "border-green-500/30 bg-green-500/5" : "border-border"
              )}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Mail className="w-4 h-4 text-blue-500" />
                    </div>
                    <span className="text-sm font-medium">Google</span>
                  </div>
                  {googleConnected ? (
                    <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30">
                      Connected
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        window.location.href = `/api/oauth/google/start?returnTo=/app&origin=${encodeURIComponent(window.location.origin)}`;
                      }}
                    >
                      Connect
                    </Button>
                  )}
                </div>
                {googleConnected && googleEmail && (
                  <p className="text-xs text-muted-foreground truncate">{googleEmail}</p>
                )}
                {!googleConnected && (
                  <p className="text-xs text-muted-foreground">Gmail, Calendar, Drive</p>
                )}
              </div>

              {/* Slack */}
              <div className={cn(
                "rounded-xl border p-4 transition-colors",
                slackConnected ? "border-emerald-400/30 bg-emerald-400/5" : "border-border"
              )}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-purple-500" />
                    </div>
                    <span className="text-sm font-medium">Slack</span>
                  </div>
                  {slackConnected ? (
                    <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/30">
                      Connected
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => onNavigate("actions")}
                    >
                      Setup
                    </Button>
                  )}
                </div>
                {slackConnected && slackChannel && (
                  <p className="text-xs text-muted-foreground truncate">{slackChannel}</p>
                )}
                {!slackConnected && (
                  <p className="text-xs text-muted-foreground">Notifications & approvals</p>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          {stats.total > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Governance Stats
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Actions</p>
                </div>
                <div className="rounded-xl border p-4 text-center">
                  <p className="text-2xl font-bold text-green-500">{stats.approved}</p>
                  <p className="text-xs text-muted-foreground">Approved</p>
                </div>
                <div className="rounded-xl border p-4 text-center">
                  <p className="text-2xl font-bold text-red-500">{stats.denied}</p>
                  <p className="text-xs text-muted-foreground">Denied</p>
                </div>
              </div>
            </div>
          )}

          {/* Quick Action */}
          <div>
            <Button
              className="w-full"
              size="lg"
              onClick={() => onNavigate("actions")}
            >
              <Play className="w-4 h-4 mr-2" />
              Try a Governed Action
            </Button>
          </div>

          {/* Recent Actions */}
          {recentEntries.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Recent Actions
                </h3>
                <button
                  onClick={() => onNavigate("ledger")}
                  className="text-xs text-primary hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="space-y-2">
                {recentEntries.map((entry) => (
                  <div
                    key={entry.block_id}
                    className="rounded-lg border p-3 flex items-center gap-3 hover:bg-accent/30 transition-colors cursor-pointer"
                    onClick={() => onNavigate("ledger")}
                  >
                    <span className="text-lg">
                      {ACTION_ICONS[entry.action] || "\u26A1"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {ACTION_LABELS[entry.action] || entry.action}
                      </p>
                      <p className="text-xs text-muted-foreground">
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
            </div>
          )}

          {/* Empty state */}
          {stats.total === 0 && (
            <div className="text-center py-8">
              <Shield className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
              <p className="text-sm text-muted-foreground mb-2">
                No governed actions yet
              </p>
              <p className="text-xs text-muted-foreground">
                Try running your first governed action to see how RIO works.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Actions View (Try a Governed Action) ────────────────────────────────

function ActionsView({
  googleConnected,
  slackConnected,
  onNavigate,
}: {
  googleConnected: boolean;
  slackConnected: boolean;
  onNavigate: (tab: Tab) => void;
}) {
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [flowState, setFlowState] = useState<
    "idle" | "checking" | "reviewing" | "approved" | "denied" | "verified"
  >("idle");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [ledgerEntry, setLedgerEntry] = useState<LedgerEntryData | null>(null);
  const [verifyChecks, setVerifyChecks] = useState<Record<string, boolean> | null>(null);
  const [intentId, setIntentId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [connectorResult, setConnectorResult] = useState<ConnectorResult | null>(null);
  const [denialMessage, setDenialMessage] = useState("");

  const createIntent = trpc.rio.createIntent.useMutation();
  const approve = trpc.rio.approve.useMutation();
  const deny = trpc.rio.deny.useMutation();
  const execute = trpc.rio.execute.useMutation();
  const verifyReceipt = trpc.rio.verifyReceipt.useMutation();
  const connectorExecute = trpc.rio.connectorExecute.useMutation();
  const notifyPending = trpc.rio.notifyPendingApproval.useMutation();

  const availableScenarios = useMemo(() => {
    return SCENARIOS.filter((s) => {
      if (s.category === "google") return true; // always show, will simulate if not connected
      if (s.category === "microsoft") return true; // always show, will simulate if not connected
      if (s.category === "slack") return true;
      return true;
    });
  }, []);

  const handleSelectScenario = async (scenario: Scenario) => {
    setSelectedScenario(scenario);
    setFlowState("checking");
    setReceipt(null);
    setLedgerEntry(null);
    setVerifyChecks(null);
    setConnectorResult(null);
    setDenialMessage("");

    try {
      const result = await createIntent.mutateAsync({
        action: scenario.action,
        description: scenario.description,
        requestedBy: scenario.requester,
      });
      const data = result as Record<string, unknown>;
      const newIntentId = data.intentId as string;
      setIntentId(newIntentId);
      setFlowState("reviewing");

      // Notify via Slack if connected
      notifyPending.mutateAsync({
        intentId: newIntentId,
        action: scenario.action,
        requester: scenario.requester,
        description: scenario.description,
        origin: window.location.origin,
      }).catch(() => {});
    } catch {
      setFlowState("reviewing");
    }
  };

  const executeViaConnector = async (iId: string, receiptId: string, scenario: Scenario) => {
    try {
      const result = await connectorExecute.mutateAsync({
        intentId: iId,
        receiptId,
        action: scenario.action,
        parameters: scenario.parameters,
        mode: (scenario.category === "google" && googleConnected) || (scenario.category === "slack" && slackConnected)
          ? "live" : "simulated",
      });
      setConnectorResult(result as ConnectorResult);
    } catch {
      setConnectorResult({
        success: false,
        connector: scenario.connector,
        action: scenario.action,
        mode: "simulated",
        executedAt: new Date().toISOString(),
        detail: "Connector execution failed",
        error: "EXECUTION_ERROR",
      });
    }
  };

  const handleApprove = async () => {
    if (!intentId || !selectedScenario || processing) return;
    setProcessing(true);

    try {
      await approve.mutateAsync({ intentId, decidedBy: "You" });
      const execResult = await execute.mutateAsync({ intentId });
      const execData = execResult as Record<string, unknown>;

      let receiptId = "";
      if (execData.receipt) {
        const r = execData.receipt as ReceiptData;
        r.decision_source = "human";
        setReceipt(r);
        receiptId = r.receipt_id;
      }
      if (execData.ledger_entry) {
        setLedgerEntry(execData.ledger_entry as LedgerEntryData);
      }

      if (receiptId) {
        await executeViaConnector(intentId, receiptId, selectedScenario);
      }

      setFlowState("approved");
    } catch {
      // still show approved state
    }
    setProcessing(false);
  };

  const handleDeny = async () => {
    if (!intentId || !selectedScenario || processing) return;
    setProcessing(true);

    try {
      await deny.mutateAsync({ intentId, decidedBy: "You" });
      await execute.mutateAsync({ intentId });
      setDenialMessage("Execution blocked. The system requires human approval before any action is allowed.");
    } catch {
      setDenialMessage("Execution blocked. The system requires human approval before any action is allowed.");
    }
    setFlowState("denied");
    setProcessing(false);
  };

  const handleVerify = async () => {
    if (!receipt?.receipt_id) return;
    try {
      const result = await verifyReceipt.mutateAsync({ receiptId: receipt.receipt_id });
      const data = result as Record<string, unknown>;
      setVerifyChecks({
        "Signature Valid": !!(data.signatureValid),
        "Hash Format Valid": !!(data.hashValid),
        "Ledger Recorded": !!(data.ledgerRecorded),
        "Protocol Version": data.protocolVersion === "v2",
        "Verification Status": data.verificationStatus === "verified",
      });
      setFlowState("verified");
    } catch {
      // ignore
    }
  };

  const handleReset = () => {
    setSelectedScenario(null);
    setFlowState("idle");
    setReceipt(null);
    setLedgerEntry(null);
    setVerifyChecks(null);
    setIntentId("");
    setConnectorResult(null);
    setDenialMessage("");
  };

  // ── Scenario picker ──
  if (!selectedScenario) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Try a Governed Action</h2>
          <p className="text-xs text-muted-foreground">
            Pick an action below. RIO will intercept it, require your approval, then execute it.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-6 space-y-4">
            {/* Google actions */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Mail className="w-3.5 h-3.5" />
                Google Actions
                {!googleConnected && (
                  <Badge variant="outline" className="text-[10px] ml-1">Simulated</Badge>
                )}
              </h3>
              <div className="space-y-2">
                {availableScenarios.filter((s) => s.category === "google").map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectScenario(s)}
                    className="w-full rounded-xl border p-4 text-left hover:bg-accent/30 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{s.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium group-hover:text-primary transition-colors">
                          {s.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{s.description}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] shrink-0"
                        style={{ color: s.riskColor, borderColor: s.riskColor + "40" }}
                      >
                        {s.riskLevel}
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Slack actions */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5" />
                Slack Actions
                {!slackConnected && (
                  <Badge variant="outline" className="text-[10px] ml-1">Simulated</Badge>
                )}
              </h3>
              <div className="space-y-2">
                {availableScenarios.filter((s) => s.category === "slack").map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectScenario(s)}
                    className="w-full rounded-xl border p-4 text-left hover:bg-accent/30 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{s.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium group-hover:text-primary transition-colors">
                          {s.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{s.description}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] shrink-0"
                        style={{ color: s.riskColor, borderColor: s.riskColor + "40" }}
                      >
                        {s.riskLevel}
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center pt-4">
              Every action goes through RIO governance — intent, approval, execution, receipt, ledger.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Governance flow ──
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b flex items-center gap-3">
        <button onClick={handleReset} className="hover:text-primary transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-lg font-semibold">{selectedScenario.label}</h2>
          <p className="text-xs text-muted-foreground">RIO Governance Flow</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-6 space-y-4">
          {/* Intent Card */}
          <div className="rounded-xl border p-5">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">{selectedScenario.icon}</span>
              <div>
                <p className="text-sm font-medium">{selectedScenario.description}</p>
                <p className="text-xs text-muted-foreground">
                  Target: {selectedScenario.target} — {selectedScenario.connectorName}
                </p>
              </div>
            </div>

            {/* Parameters */}
            <div className="rounded-lg bg-muted/50 p-3 mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">PARAMETERS</p>
              <div className="space-y-1">
                {Object.entries(selectedScenario.parameters).map(([key, val]) => (
                  <div key={key} className="flex gap-2 text-xs font-mono">
                    <span className="text-muted-foreground">{key}:</span>
                    <span className="text-foreground">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-[10px]"
                style={{ color: selectedScenario.riskColor, borderColor: selectedScenario.riskColor + "40" }}
              >
                Risk: {selectedScenario.riskLevel}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                <Shield className="w-3 h-3 mr-1" />
                Approval Required
              </Badge>
            </div>
          </div>

          {/* Checking spinner */}
          {flowState === "checking" && (
            <div className="flex items-center justify-center gap-3 py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Creating intent and checking policies...</span>
            </div>
          )}

          {/* Approve / Deny */}
          {flowState === "reviewing" && (
            <div className="rounded-xl border border-primary/30 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold">Human Approval Required</p>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                RIO has intercepted this action. It will not execute until you approve it.
              </p>
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={handleApprove}
                  disabled={processing}
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleDeny}
                  disabled={processing}
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Deny
                </Button>
              </div>
            </div>
          )}

          {/* Denied */}
          {flowState === "denied" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <p className="text-sm font-semibold text-red-500">Execution Blocked</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {denialMessage}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  This is fail-closed enforcement. No approval means no execution.
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={handleReset}>
                Try Another Action
              </Button>
            </div>
          )}

          {/* Connector result */}
          {connectorResult && (flowState === "approved" || flowState === "verified") && (
            <div className={cn(
              "rounded-xl border p-4",
              connectorResult.success
                ? "border-green-500/30 bg-green-500/5"
                : "border-red-500/30 bg-red-500/5"
            )}>
              <div className="flex items-center gap-2 mb-1">
                {connectorResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm font-medium">
                  {connectorResult.mode === "live" ? "Live Execution" : "Simulated Execution"}
                </span>
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {connectorResult.connector}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{connectorResult.detail}</p>
              {connectorResult.externalId && (
                <p className="text-xs font-mono text-muted-foreground mt-1">
                  ID: {connectorResult.externalId}
                </p>
              )}
            </div>
          )}

          {/* Receipt */}
          {receipt && (flowState === "approved" || flowState === "verified") && (
            <div className="rounded-xl border border-green-500/30 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <p className="text-sm font-semibold text-green-500">Receipt Generated</p>
                </div>
                <ReceiptExport receipt={receipt} />
              </div>

              <p className="text-xs text-muted-foreground mb-4">
                This receipt is cryptographic proof that a human authorized this action.
              </p>

              {/* Three hashes */}
              <div className="space-y-2 mb-4">
                <HashRow label="Intent Hash" value={receipt.intent_hash} color="#3b82f6" />
                <HashRow label="Action Hash" value={receipt.action_hash} color="#8b5cf6" />
                <HashRow label="Verification Hash" value={receipt.verification_hash} color="#22c55e" />
              </div>

              {/* Receipt details */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 mb-4 text-xs">
                <DetailRow label="Receipt ID" value={receipt.receipt_id} />
                <DetailRow label="Decision" value={receipt.decision} valueColor="#22c55e" />
                <DetailRow label="Risk" value={receipt.risk_level} />
                <DetailRow label="Signature" value={receipt.signature} truncate />
                <DetailRow label="Protocol" value={receipt.protocol_version} />
              </div>

              {/* Ledger entry */}
              {ledgerEntry && (
                <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 mb-4 text-xs">
                  <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">Ledger Entry</p>
                  <DetailRow label="Block ID" value={ledgerEntry.block_id} />
                  <DetailRow label="Chain Hash" value={ledgerEntry.current_hash} truncate />
                  <DetailRow label="Previous" value={ledgerEntry.previous_hash || "GENESIS"} truncate />
                </div>
              )}

              {/* Verify button */}
              {flowState === "approved" && (
                <Button className="w-full" variant="outline" onClick={handleVerify}>
                  <Eye className="w-4 h-4 mr-2" />
                  Verify This Receipt
                </Button>
              )}

              {/* Verification results */}
              {flowState === "verified" && verifyChecks && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-2">
                  <p className="text-xs font-semibold text-green-500 mb-2">Independent Verification</p>
                  {Object.entries(verifyChecks).map(([label, passed]) => (
                    <div key={label} className="flex items-center gap-2 text-xs">
                      {passed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                      )}
                      <span className={passed ? "text-green-500" : "text-red-500"}>{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Post-flow actions */}
          {(flowState === "approved" || flowState === "verified") && (
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleReset}>
                Try Another Action
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => onNavigate("ledger")}>
                <BookOpen className="w-4 h-4 mr-2" />
                View History
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Hash Row helper ─────────────────────────────────────────────────────

function HashRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="text-xs font-mono truncate" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueColor,
  truncate: shouldTruncate,
}: {
  label: string;
  value: string;
  valueColor?: string;
  truncate?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span
        className={cn("font-mono", shouldTruncate && "truncate")}
        style={{ color: valueColor }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Approvals View ──────────────────────────────────────────────────────

function ApprovalsView({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  // For now, approvals happen inline in the Actions flow.
  // This view shows a helpful message and links to the actions tab.
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b">
        <h2 className="text-lg font-semibold">Approvals</h2>
        <p className="text-xs text-muted-foreground">
          Pending action approvals
        </p>
      </div>
      <div className="flex flex-col items-center justify-center flex-1 gap-6 px-6">
        <Shield className="w-16 h-16 text-muted-foreground/20" />
        <div className="text-center max-w-sm">
          <h3 className="text-base font-semibold mb-2">Approval happens inline</h3>
          <p className="text-sm text-muted-foreground mb-1">
            When you run a governed action, RIO will ask for your approval before executing.
            You can approve or deny directly in the action flow.
          </p>
          <p className="text-sm text-muted-foreground">
            If you have Slack connected, you can also approve from Slack using interactive buttons.
          </p>
        </div>
        <Button onClick={() => onNavigate("actions")}>
          <Play className="w-4 h-4 mr-2" />
          Run a Governed Action
        </Button>
      </div>
    </div>
  );
}

// ── History / Ledger View ───────────────────────────────────────────────

function HistoryView() {
  const { data, isLoading, refetch } = trpc.rio.ledgerChain.useQuery({ limit: 100 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, boolean> | null>(null);
  const verifyReceipt = trpc.rio.verifyReceipt.useMutation();

  const entries: LedgerEntryData[] = useMemo(() => {
    if (!data?.entries) return [];
    return ([...data.entries] as LedgerEntryData[]).reverse();
  }, [data]);

  const handleVerify = async (receiptHash: string) => {
    setVerifyingId(receiptHash);
    try {
      const result = await verifyReceipt.mutateAsync({ receiptId: receiptHash });
      const d = result as Record<string, unknown>;
      setVerifyResult({
        "Signature Valid": !!(d.signatureValid),
        "Hash Format Valid": !!(d.hashValid),
        "Ledger Recorded": !!(d.ledgerRecorded),
        "Protocol Version": d.protocolVersion === "v2",
        "Verified": d.verificationStatus === "verified",
      });
    } catch {
      setVerifyResult(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">History</h2>
          <p className="text-xs text-muted-foreground">
            All governed actions — tamper-evident ledger
            {data?.chainValid !== undefined && (
              <span className={data.chainValid ? " · Chain intact" : " · Chain broken"}>
                {data.chainValid ? " \u2705" : " \u26A0\uFE0F"}
              </span>
            )}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <BookOpen className="w-12 h-12 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">No governed actions yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 space-y-2">
            {entries.map((entry) => {
              const isExpanded = expandedId === entry.block_id;
              const isVerifying = verifyingId === entry.receipt_hash;
              return (
                <div
                  key={entry.block_id}
                  className="rounded-xl border overflow-hidden transition-colors"
                >
                  {/* Summary row */}
                  <button
                    className="w-full p-4 text-left hover:bg-accent/30 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : entry.block_id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">
                        {ACTION_ICONS[entry.action] || "\u26A1"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {ACTION_LABELS[entry.action] || entry.action}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(entry.timestamp).toLocaleString()}
                          {" · Block "}
                          {entry.block_id}
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
                      <ChevronRight
                        className={cn(
                          "w-4 h-4 text-muted-foreground transition-transform",
                          isExpanded && "rotate-90"
                        )}
                      />
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t">
                      <div className="rounded-lg bg-muted/50 p-3 mt-3 space-y-1.5 text-xs">
                        <DetailRow label="Intent ID" value={entry.intent_id} truncate />
                        <DetailRow label="Action" value={entry.action} />
                        <DetailRow
                          label="Decision"
                          value={entry.decision}
                          valueColor={entry.decision === "approved" ? "#22c55e" : "#ef4444"}
                        />
                        <DetailRow label="Receipt Hash" value={entry.receipt_hash} truncate />
                        <DetailRow label="Chain Hash" value={entry.current_hash} truncate />
                        <DetailRow label="Previous" value={entry.previous_hash || "GENESIS"} truncate />
                        {entry.ledger_signature && (
                          <DetailRow label="Signature" value={entry.ledger_signature} truncate />
                        )}
                        <DetailRow label="Protocol" value={entry.protocol_version} />
                        <DetailRow label="Recorded By" value={entry.recorded_by} />
                      </div>

                      {/* Verify button */}
                      <div className="mt-3">
                        {isVerifying && verifyResult ? (
                          <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 space-y-1.5">
                            {Object.entries(verifyResult).map(([label, passed]) => (
                              <div key={label} className="flex items-center gap-2 text-xs">
                                {passed ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                                )}
                                <span className={passed ? "text-green-500" : "text-red-500"}>{label}</span>
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
        </div>
      )}
    </div>
  );
}

// ── Inbox View ──────────────────────────────────────────────────────────

function InboxView({
  onSelectEmail,
  onAskAbout,
  googleConnected,
}: {
  onSelectEmail: (email: any) => void;
  onAskAbout: (context: string) => void;
  googleConnected: boolean;
}) {
  const { data, isLoading, error, refetch } =
    trpc.workspace.gmail.listInbox.useQuery(
      { maxResults: 20 },
      { retry: false, enabled: googleConnected }
    );

  if (!googleConnected) return <ConnectPrompt service="Google" />;
  if (error?.message?.includes("not connected")) return <ConnectPrompt service="Google" />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  const emails = data?.messages ?? [];

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Mail className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Your inbox is empty</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold">Inbox</h2>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="divide-y">
          {emails.map((email: any) => (
            <button
              key={email.id}
              className={cn(
                "w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors",
                email.isUnread && "bg-accent/20"
              )}
              onClick={() => onSelectEmail(email)}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-medium text-primary">
                    {(email.from || "?").charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("text-sm truncate", email.isUnread && "font-semibold")}>
                      {email.from || "Unknown"}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {email.date ? new Date(email.date).toLocaleDateString() : ""}
                    </span>
                  </div>
                  <p className="text-sm truncate">{email.subject || "(no subject)"}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {email.snippet || ""}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Email Detail View ───────────────────────────────────────────────────

function EmailDetailView({
  emailId,
  onBack,
  onAskAbout,
}: {
  emailId: string;
  onBack: () => void;
  onAskAbout: (context: string) => void;
}) {
  const { data: email, isLoading, error } =
    trpc.workspace.gmail.readEmail.useQuery(
      { messageId: emailId },
      { retry: false }
    );
  const draftReply = trpc.workspace.ai.draftReply.useMutation();
  const sendEmail = trpc.workspace.gmail.sendEmail.useMutation();
  const [replyInstruction, setReplyInstruction] = useState("");
  const [showReplyDraft, setShowReplyDraft] = useState(false);
  const [draftContent, setDraftContent] = useState("");

  const handleDraftReply = () => {
    if (!email) return;
    setShowReplyDraft(true);
    draftReply.mutate(
      {
        originalEmail: {
          from: email.from,
          subject: email.subject,
          body: email.body,
        },
        instruction: replyInstruction || undefined,
      },
      {
        onSuccess: (data) => {
          setDraftContent(data.draft);
        },
      }
    );
  };

  const handleSendReply = () => {
    if (!email || !draftContent.trim()) return;
    sendEmail.mutate({
      to: email.from,
      subject: `Re: ${email.subject}`,
      body: draftContent,
      replyToMessageId: email.id,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !email) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">
          {error?.message || "Email not found"}
        </p>
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onBack} className="hover:text-primary transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="font-semibold truncate flex-1">{email.subject}</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground ml-7">
          <span>{email.from}</span>
          <span>·</span>
          <span>{email.date ? new Date(email.date).toLocaleString() : ""}</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-4">
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{
              __html:
                email.bodyType === "html"
                  ? email.body
                  : `<pre style="white-space:pre-wrap;font-family:inherit">${email.body}</pre>`,
            }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="border-t px-4 py-3">
        {!showReplyDraft ? (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Reply instruction (optional)"
              className="flex-1 text-sm bg-muted rounded-md px-3 py-2 border-0 focus:outline-none focus:ring-1 focus:ring-ring"
              value={replyInstruction}
              onChange={(e) => setReplyInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleDraftReply(); }}
            />
            <Button size="sm" onClick={handleDraftReply} disabled={draftReply.isPending}>
              {draftReply.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Reply className="w-4 h-4 mr-1" />}
              Reply with AI
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAskAbout(`Email from ${email.from}\nSubject: ${email.subject}\n\n${email.body}`)}
            >
              <MessageSquare className="w-4 h-4 mr-1" />
              Ask Bondi
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">AI Draft Reply</span>
              <Badge variant="outline" className="text-xs">
                <Shield className="w-3 h-3 mr-1" />
                RIO approval required to send
              </Badge>
            </div>
            {draftReply.isPending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Bondi is drafting a reply...
              </div>
            ) : (
              <Textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                rows={6}
                className="text-sm"
              />
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setShowReplyDraft(false); setDraftContent(""); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSendReply} disabled={!draftContent.trim() || sendEmail.isPending}>
                {sendEmail.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                Approve & Send
              </Button>
            </div>
            {sendEmail.isSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-500">
                <CheckCircle2 className="w-4 h-4" />
                Email sent. Receipt generated.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Calendar View ───────────────────────────────────────────────────────

function CalendarView({ googleConnected }: { googleConnected: boolean }) {
  const { data, isLoading, error, refetch } =
    trpc.workspace.calendar.listEvents.useQuery(
      { maxResults: 20 },
      { retry: false, enabled: googleConnected }
    );

  if (!googleConnected) return <ConnectPrompt service="Google" />;
  if (error?.message?.includes("not connected")) return <ConnectPrompt service="Google" />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  const events = data?.events ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold">Calendar</h2>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Calendar className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No upcoming events</p>
          </div>
        ) : (
          <div className="divide-y">
            {events.map((event: any, i: number) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Calendar className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{event.summary || "(no title)"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {event.start?.dateTime
                        ? new Date(event.start.dateTime).toLocaleString()
                        : event.start?.date || "All day"}
                      {event.end?.dateTime && ` — ${new Date(event.end.dateTime).toLocaleTimeString()}`}
                    </p>
                    {event.location && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {event.location}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Drive View ──────────────────────────────────────────────────────────

function DriveView({ googleConnected }: { googleConnected: boolean }) {
  const { data, isLoading, error, refetch } =
    trpc.workspace.drive.listFiles.useQuery(
      { pageSize: 20 },
      { retry: false, enabled: googleConnected }
    );

  if (!googleConnected) return <ConnectPrompt service="Google" />;
  if (error?.message?.includes("not connected")) return <ConnectPrompt service="Google" />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  const files = data?.files ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold">Drive</h2>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <FolderOpen className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No files found</p>
          </div>
        ) : (
          <div className="divide-y">
            {files.map((file: any, i: number) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3 hover:bg-accent/50 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-green-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{file.name || "Untitled"}</p>
                  <p className="text-xs text-muted-foreground">
                    {file.mimeType?.split("/").pop() || "file"}
                    {file.modifiedTime && ` · ${new Date(file.modifiedTime).toLocaleDateString()}`}
                  </p>
                </div>
                {file.webViewLink && (
                  <a href={file.webViewLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── GitHub View ─────────────────────────────────────────────────────────

function GitHubView() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <Github className="w-12 h-12 text-muted-foreground/30" />
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">GitHub</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          GitHub integration is coming soon. You'll be able to manage repos,
          review PRs, and deploy — all governed by RIO.
        </p>
      </div>
    </div>
  );
}

// ── Ask Mode (AI Chat) ─────────────────────────────────────────────────

function AskView({ initialContext }: { initialContext?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const chatMutation = trpc.workspace.ai.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [...prev, data]);
    },
  });

  useEffect(() => {
    if (initialContext && messages.length === 0) {
      const userMsg: ChatMessage = {
        role: "user",
        content: `Help me understand this:\n\n${initialContext}`,
      };
      setMessages([userMsg]);
      chatMutation.mutate({ messages: [userMsg], context: initialContext });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement;
      if (viewport) {
        requestAnimationFrame(() => {
          viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
        });
      }
    }
  }, [messages, chatMutation.isPending]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending) return;
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    chatMutation.mutate({ messages: newMessages });
    textareaRef.current?.focus();
  };

  const displayMessages = messages.filter((m) => m.role !== "system");

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b">
        <h2 className="font-semibold">Chat with Bondi</h2>
        <p className="text-xs text-muted-foreground">
          Ask mode — think, plan, analyze. No approval needed.
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-hidden">
        {displayMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
            <Sparkles className="w-12 h-12 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground text-center">
              Ask Bondi anything — summarize emails, analyze documents, draft content, or just think through a problem together.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {["What does my schedule look like?", "Summarize my recent emails", "Help me draft a proposal"].map((prompt) => (
                <button
                  key={prompt}
                  className="rounded-lg border px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                  onClick={() => {
                    const userMsg: ChatMessage = { role: "user", content: prompt };
                    setMessages([userMsg]);
                    chatMutation.mutate({ messages: [userMsg] });
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <div className="flex flex-col space-y-4 p-4">
              {displayMessages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "justify-end items-start" : "justify-start items-start"
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[80%] rounded-lg px-4 py-2.5",
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  )}>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <Streamdown>{msg.content}</Streamdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 shrink-0 mt-1 rounded-full bg-secondary flex items-center justify-center">
                      <User className="w-4 h-4 text-secondary-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {chatMutation.isPending && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <div className="rounded-lg bg-muted px-4 py-2.5">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        className="flex gap-2 p-4 border-t items-end"
      >
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder="Ask Bondi anything..."
          className="flex-1 max-h-32 resize-none min-h-9"
          rows={1}
        />
        <Button type="submit" size="icon" disabled={!input.trim() || chatMutation.isPending} className="shrink-0 h-[38px] w-[38px]">
          {chatMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </form>
    </div>
  );
}

// ── Main App Component ──────────────────────────────────────────────────

export default function BondiApp() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [askContext, setAskContext] = useState<string | undefined>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  // Check Google connection status
  const googleStatus = trpc.connections.googleStatus.useQuery(undefined, {
    enabled: !!user,
    retry: false,
  });

  // Check Slack connection status
  const slackStatus = trpc.connections.slackStatus.useQuery(undefined, {
    enabled: !!user,
    retry: false,
  });

  // Group nav items by section
  const sections = useMemo(() => {
    const map = new Map<string, typeof NAV_ITEMS>();
    for (const item of NAV_ITEMS) {
      const section = item.section || "Other";
      if (!map.has(section)) map.set(section, []);
      map.get(section)!.push(item);
    }
    return map;
  }, []);

  const handleNavigate = useCallback((tab: Tab) => {
    setActiveTab(tab);
    setSelectedEmailId(null);
    if (tab !== "ask") setAskContext(undefined);
    setSidebarOpen(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <BondiLogin />;
  }

  // Show onboarding if no apps connected and not dismissed
  const hasAnyConnection = googleStatus.data?.connected || slackStatus.data?.connected;
  const showOnboarding = !hasAnyConnection && !onboardingDismissed && !googleStatus.isLoading;

  const handleSelectEmail = (email: any) => {
    setSelectedEmailId(email.id);
  };

  const handleAskAbout = (context: string) => {
    setAskContext(context);
    setActiveTab("ask");
    setRightPanelOpen(false);
  };

  const renderMainContent = () => {
    // Show onboarding overlay
    if (showOnboarding && activeTab === "home") {
      return (
        <OnboardingView
          onConnectGoogle={() => {
            window.location.href = `/api/oauth/google/start?returnTo=/app&origin=${encodeURIComponent(window.location.origin)}`;
          }}
          onSkip={() => setOnboardingDismissed(true)}
        />
      );
    }

    if (activeTab === "inbox" && selectedEmailId) {
      return (
        <EmailDetailView
          emailId={selectedEmailId}
          onBack={() => setSelectedEmailId(null)}
          onAskAbout={handleAskAbout}
        />
      );
    }

    switch (activeTab) {
      case "home":
        return (
          <DashboardHome
            googleConnected={!!googleStatus.data?.connected}
            slackConnected={!!slackStatus.data?.connected}
            googleEmail={googleStatus.data?.email || null}
            slackChannel={slackStatus.data?.channelName || null}
            onNavigate={handleNavigate}
          />
        );
      case "inbox":
        return (
          <InboxView
            onSelectEmail={handleSelectEmail}
            onAskAbout={handleAskAbout}
            googleConnected={!!googleStatus.data?.connected}
          />
        );
      case "calendar":
        return <CalendarView googleConnected={!!googleStatus.data?.connected} />;
      case "drive":
        return <DriveView googleConnected={!!googleStatus.data?.connected} />;
      case "github":
        return <GitHubView />;
      case "ask":
        return <AskView initialContext={askContext} />;
      case "actions":
        return (
          <ActionsView
            googleConnected={!!googleStatus.data?.connected}
            slackConnected={!!slackStatus.data?.connected}
            onNavigate={handleNavigate}
          />
        );
      case "approvals":
        return <ApprovalsView onNavigate={handleNavigate} />;
      case "ledger":
        return <HistoryView />;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top Bar */}
      <header className="h-14 border-b flex items-center justify-between px-4 shrink-0 bg-background/95 backdrop-blur z-50">
        <div className="flex items-center gap-3">
          <button
            className="lg:hidden p-1.5 rounded-lg hover:bg-accent transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <img src={BONDI_LOGO} alt="Bondi" className="w-8 h-8 rounded-lg" />
          <span className="font-semibold tracking-tight">Bondi</span>
          <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">
            Secured by RIO
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {googleStatus.data?.connected && (
            <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Google
            </Badge>
          )}
          {slackStatus.data?.connected && (
            <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/30">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Slack
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
          >
            <Sparkles className="w-4 h-4" />
          </Button>
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-xs font-medium text-primary">
              {user.name?.charAt(0).toUpperCase() || "U"}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside
          className={cn(
            "w-56 border-r bg-card shrink-0 flex flex-col overflow-y-auto transition-transform duration-200",
            "lg:translate-x-0 lg:static",
            sidebarOpen
              ? "translate-x-0 fixed inset-y-14 left-0 z-40"
              : "-translate-x-full fixed lg:translate-x-0"
          )}
        >
          <nav className="flex-1 py-2">
            {Array.from(sections).map(([section, items]) => (
              <div key={section} className="mb-2">
                <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section}
                </p>
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      )}
                      onClick={() => handleNavigate(item.id)}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Connection status */}
          <div className="border-t p-3 space-y-2">
            {googleStatus.data?.connected ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                <span className="truncate">{googleStatus.data.email}</span>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() =>
                  (window.location.href = `/api/oauth/google/start?returnTo=/app&origin=${encodeURIComponent(window.location.origin)}`)
                }
              >
                <Link2 className="w-3 h-3 mr-1" />
                Connect Google
              </Button>
            )}
            {slackStatus.data?.connected && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span className="truncate">Slack — {slackStatus.data.channelName}</span>
              </div>
            )}
          </div>
        </aside>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 min-h-0 overflow-hidden">{renderMainContent()}</main>

        {/* Right Panel — AI Assistant */}
        <aside
          className={cn(
            "w-80 border-l bg-card shrink-0 overflow-hidden transition-transform duration-200",
            "hidden lg:flex lg:flex-col",
            rightPanelOpen && "flex flex-col fixed inset-y-14 right-0 z-40 w-full sm:w-80"
          )}
        >
          <AskView key={askContext || "default"} initialContext={askContext} />
        </aside>

        {/* Mobile right panel overlay */}
        {rightPanelOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setRightPanelOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
