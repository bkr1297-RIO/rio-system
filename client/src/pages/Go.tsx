/**
 * /go — The RIO Governance Experience
 *
 * This is the page you send people. No "demo" framing.
 * AI proposes an action → You approve or deny → Receipt is generated → You verify it.
 * 30 seconds to understand what RIO does.
 *
 * Connector-aware: scenarios route through the connector registry.
 * Each action maps to a connector (Gmail, Calendar, Drive, etc.).
 * The connector determines whether execution is live or simulated.
 */

import { useState, useRef, useEffect } from "react";
import NavBar from "@/components/NavBar";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

// ── Scenarios ────────────────────────────────────────────────────────────────

interface Scenario {
  id: string;
  icon: string;
  label: string;
  action: string;
  target: string;
  connector: string;
  connectorName: string;
  description: string;
  parameters: Record<string, string>;
  riskLevel: "Low" | "Medium" | "High" | "Critical";
  riskColor: string;
  requester: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "email",
    icon: "\u2709",
    label: "Send Email",
    action: "send_email",
    target: "Gmail",
    connector: "gmail",
    connectorName: "Gmail",
    description: "Send an email to john@example.com",
    parameters: {
      to: "john@example.com",
      subject: "Lunch tomorrow",
      body: "Hey John, confirming our lunch at 12:30 PM tomorrow.",
    },
    riskLevel: "Medium",
    riskColor: "#f59e0b",
    requester: "Gemini",
  },
  {
    id: "calendar",
    icon: "\uD83D\uDCC5",
    label: "Create Event",
    action: "create_event",
    target: "Google Calendar",
    connector: "google_calendar",
    connectorName: "Google Calendar",
    description: "Create a meeting with the team tomorrow at 2 PM",
    parameters: {
      title: "Team Sync — Q2 Planning",
      date: "2026-03-28",
      time: "2:00 PM",
      duration: "60 min",
      attendees: "team@company.com",
    },
    riskLevel: "Low",
    riskColor: "#22c55e",
    requester: "Gemini",
  },
  {
    id: "drive",
    icon: "\uD83D\uDCC1",
    label: "Write File",
    action: "write_file",
    target: "Google Drive",
    connector: "google_drive",
    connectorName: "Google Drive",
    description: "Create quarterly report in shared Drive folder",
    parameters: {
      filename: "Q2-2026-Report.docx",
      destination: "/Shared/Reports/",
      content: "Auto-generated quarterly summary",
    },
    riskLevel: "Medium",
    riskColor: "#f59e0b",
    requester: "Claude",
  },
  {
    id: "github_issue",
    icon: "\uD83D\uDC1B",
    label: "Create Issue",
    action: "create_issue",
    target: "GitHub",
    connector: "github",
    connectorName: "GitHub",
    description: "Create a bug report on bkr1297-RIO/rio-system",
    parameters: {
      repo: "bkr1297-RIO/rio-system",
      title: "[Bug] Receipt verification timeout on high-latency connections",
      body: "When verifying receipts over slow connections, the verification step times out before all 7 checks complete. Expected: graceful retry. Actual: silent failure.",
      labels: "bug,priority:medium",
    },
    riskLevel: "Low",
    riskColor: "#22c55e",
    requester: "Claude",
  },
  {
    id: "github_pr",
    icon: "\uD83D\uDD00",
    label: "Create PR",
    action: "create_pr",
    target: "GitHub",
    connector: "github",
    connectorName: "GitHub",
    description: "Open a pull request to merge feature/connector-v2",
    parameters: {
      repo: "bkr1297-RIO/rio-system",
      title: "feat: Add connector v2 architecture",
      body: "Implements the pluggable connector interface for Gmail, Drive, Calendar, and GitHub. All connectors pass fail-closed verification.",
      head: "feature/connector-v2",
      base: "main",
    },
    riskLevel: "Medium",
    riskColor: "#f59e0b",
    requester: "Gemini",
  },
  {
    id: "transfer",
    icon: "\uD83D\uDCB3",
    label: "Transfer Funds",
    action: "transfer_funds",
    target: "Banking API",
    connector: "none",
    connectorName: "Banking (Future)",
    description: "Transfer $500 to account ending in 4821",
    parameters: {
      amount: "$500.00",
      destination: "****4821",
      memo: "Monthly rent payment",
    },
    riskLevel: "Critical",
    riskColor: "#ef4444",
    requester: "OpenAI",
  },
  {
    id: "deploy",
    icon: "\uD83D\uDE80",
    label: "Deploy",
    action: "deploy_production",
    target: "Kubernetes",
    connector: "none",
    connectorName: "DevOps (Future)",
    description: "Deploy build v3.2.1 to production cluster",
    parameters: {
      build: "v3.2.1",
      cluster: "us-east-1",
      replicas: "3",
    },
    riskLevel: "High",
    riskColor: "#f97316",
    requester: "Claude",
  },
  {
    id: "patient",
    icon: "\uD83C\uDFE5",
    label: "Patient Record",
    action: "read_data",
    target: "EHR System",
    connector: "none",
    connectorName: "Healthcare (Future)",
    description: "Access medical record for patient #7291",
    parameters: {
      patient_id: "#7291",
      record_type: "Full medical history",
      purpose: "Treatment review",
    },
    riskLevel: "High",
    riskColor: "#f97316",
    requester: "Gemini",
  },
];

// ── Receipt & Ledger types ───────────────────────────────────────────────────

interface ReceiptData {
  receipt_id: string;
  intent_id: string;
  action: string;
  decision: string;
  decision_source?: string;
  intent_hash: string;
  action_hash: string;
  verification_hash: string;
  risk_score: number;
  risk_level: string;
  policy_decision: string;
  policy_rule_id?: string;
  protocol_version: string;
  signature: string;
  execution_mode?: string;
  execution_status?: string;
  timestamp_request?: string;
  timestamp_approval?: string;
  timestamp_execution?: string;
  [key: string]: unknown;
}

interface LedgerEntryData {
  block_id: string;
  receipt_hash: string;
  previous_hash: string;
  current_hash: string;
  ledger_signature: string;
  protocol_version: string;
  [key: string]: unknown;
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

type FlowState =
  | "idle"
  | "checking_policy"
  | "auto_approved"
  | "auto_denied"
  | "reviewing"
  | "approved"
  | "denied"
  | "verifying"
  | "verified";

// ── Component ────────────────────────────────────────────────────────────────

export default function Go() {
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [ledgerEntry, setLedgerEntry] = useState<LedgerEntryData | null>(null);
  const [verifyChecks, setVerifyChecks] = useState<Record<string, boolean> | null>(null);
  const [intentId, setIntentId] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [denialMessage, setDenialMessage] = useState("");
  const [policyInfo, setPolicyInfo] = useState<{
    policyId: string;
    policyTitle: string;
    decision: string;
  } | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [connectorResult, setConnectorResult] = useState<ConnectorResult | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const verifyRef = useRef<HTMLDivElement>(null);

  const createIntent = trpc.rio.createIntent.useMutation();
  const approve = trpc.rio.approve.useMutation();
  const deny = trpc.rio.deny.useMutation();
  const execute = trpc.rio.execute.useMutation();
  const verifyReceipt = trpc.rio.verifyReceipt.useMutation();
  const autoApproveMut = trpc.rio.autoApprove.useMutation();
  const autoDenyMut = trpc.rio.autoDeny.useMutation();
  const connectorExecute = trpc.rio.connectorExecute.useMutation();
  const notifyPending = trpc.rio.notifyPendingApproval.useMutation();

  // Auto-create intent when scenario changes or on first load
  useEffect(() => {
    if (flowState === "idle") {
      startReview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  /** Execute the action through the connector layer */
  const executeViaConnector = async (iId: string, receiptId: string) => {
    try {
      const result = await connectorExecute.mutateAsync({
        intentId: iId,
        receiptId,
        action: scenario.action,
        parameters: scenario.parameters,
        mode: liveMode ? "live" : "simulated",
      });
      setConnectorResult(result as ConnectorResult);
    } catch {
      setConnectorResult({
        success: false,
        connector: scenario.connector,
        action: scenario.action,
        mode: liveMode ? "live" : "simulated",
        executedAt: new Date().toISOString(),
        detail: "Connector execution failed",
        error: "EXECUTION_ERROR",
      });
    }
  };

  const startReview = async () => {
    setReceipt(null);
    setLedgerEntry(null);
    setVerifyChecks(null);
    setDenialMessage("");
    setProcessing(false);
    setPolicyInfo(null);
    setConnectorResult(null);
    setFlowState("checking_policy");

    try {
      // 1. Create the intent
      const result = await createIntent.mutateAsync({
        action: scenario.action,
        description: scenario.description,
        requestedBy: scenario.requester,
      });
      const data = result as Record<string, unknown>;
      const newIntentId = data.intentId as string;
      setIntentId(newIntentId);

      // 2. Check if a policy applies
      const policyCheck = await fetch(`/api/trpc/rio.checkPolicy?input=${encodeURIComponent(JSON.stringify({ action: scenario.action }))}`);
      const policyJson = await policyCheck.json();
      const policyResult = policyJson?.result?.data;

      if (policyResult?.policyMatch && policyResult.decision === "auto_approve") {
        setPolicyInfo({
          policyId: policyResult.policyId,
          policyTitle: policyResult.policyTitle,
          decision: "auto_approve",
        });

        const autoResult = await autoApproveMut.mutateAsync({
          intentId: newIntentId,
          policyId: policyResult.policyId,
        });
        const autoData = autoResult as Record<string, unknown>;

        let receiptId = "";
        if (autoData.receipt) {
          const r = autoData.receipt as ReceiptData;
          r.decision_source = "policy_auto";
          r.execution_mode = liveMode ? "live" : "simulated";
          setReceipt(r);
          receiptId = r.receipt_id;
        }
        if (autoData.ledger_entry) {
          setLedgerEntry(autoData.ledger_entry as LedgerEntryData);
        }

        // Execute through connector after receipt + ledger
        if (receiptId) {
          await executeViaConnector(newIntentId, receiptId);
        }

        setFlowState("auto_approved");
        setTimeout(() => receiptRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
        return;
      }

      if (policyResult?.policyMatch && policyResult.decision === "auto_deny") {
        setPolicyInfo({
          policyId: policyResult.policyId,
          policyTitle: policyResult.policyTitle,
          decision: "auto_deny",
        });

        await autoDenyMut.mutateAsync({
          intentId: newIntentId,
          policyId: policyResult.policyId,
        });

        setDenialMessage(
          `Automatically blocked by policy: "${policyResult.policyTitle}". The governance engine denied this action before it reached a human.`
        );
        setFlowState("auto_denied");
        return;
      }

      // No policy match — show approval UI, notify owner
      setFlowState("reviewing");
      notifyPending.mutateAsync({
        intentId: newIntentId,
        action: scenario.action,
        requester: scenario.requester,
        description: scenario.description,
      }).catch(() => {});
    } catch {
      setFlowState("reviewing");
    }
  };

  const handleApprove = async () => {
    if (!intentId || processing) return;
    setProcessing(true);

    try {
      await approve.mutateAsync({ intentId, decidedBy: "You" });

      const execResult = await execute.mutateAsync({ intentId });
      const execData = execResult as Record<string, unknown>;

      let receiptId = "";
      if (execData.receipt) {
        const r = execData.receipt as ReceiptData;
        r.decision_source = "human";
        r.execution_mode = liveMode ? "live" : "simulated";
        setReceipt(r);
        receiptId = r.receipt_id;
      }
      if (execData.ledger_entry) {
        setLedgerEntry(execData.ledger_entry as LedgerEntryData);
      }

      // Execute through connector after receipt + ledger
      if (receiptId) {
        await executeViaConnector(intentId, receiptId);
      }

      setFlowState("approved");
      setProcessing(false);
      setTimeout(() => receiptRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    } catch {
      setProcessing(false);
    }
  };

  const handleDeny = async () => {
    if (!intentId || processing) return;
    setProcessing(true);

    try {
      await deny.mutateAsync({ intentId, decidedBy: "You" });

      const execResult = await execute.mutateAsync({ intentId });
      const execData = execResult as Record<string, unknown>;
      setDenialMessage(
        (execData.message as string) || "Execution blocked. The system requires human approval before any action is allowed."
      );

      setFlowState("denied");
      setProcessing(false);
    } catch {
      setDenialMessage("Execution blocked. The system requires human approval before any action is allowed.");
      setFlowState("denied");
      setProcessing(false);
    }
  };

  const handleVerify = async () => {
    if (!receipt?.receipt_id) return;
    setFlowState("verifying");

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
      setTimeout(() => verifyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    } catch {
      setFlowState("approved");
    }
  };

  const handleTryAnother = () => {
    const currentIndex = SCENARIOS.findIndex((s) => s.id === scenario.id);
    const nextIndex = (currentIndex + 1) % SCENARIOS.length;
    setScenario(SCENARIOS[nextIndex]);
    setFlowState("idle");
  };

  const isApprovedState = flowState === "approved" || flowState === "auto_approved";
  const isCompletedState = isApprovedState || flowState === "verifying" || flowState === "verified";
  const isDeniedState = flowState === "denied" || flowState === "auto_denied";

  // Determine connector status for this scenario
  const connectorStatus = scenario.connector === "gmail" ? "connected" : scenario.connector === "none" ? "future" : "simulated";

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "oklch(0.13 0.03 260)", fontFamily: "'Outfit', sans-serif" }}
    >
      <NavBar />

      <div className="max-w-2xl mx-auto px-4 pt-12 pb-24">
        {/* ── Bondi Header ── */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/bondi-logo_858ccd3b.png"
            alt="Bondi"
            className="w-16 h-16 mb-3"
          />
          <h1 className="text-2xl font-bold tracking-wide" style={{ color: "#e5e7eb" }}>Bondi</h1>
          <p className="text-xs tracking-widest uppercase mt-1" style={{ color: "#6b7280" }}>Your Digital Chief of Staff — Secured by RIO</p>
        </div>

        {/* ── Mode Toggle ── */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <button
            onClick={() => setLiveMode(false)}
            className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{
              backgroundColor: !liveMode ? "oklch(0.22 0.03 260)" : "transparent",
              color: !liveMode ? "#d1d5db" : "#6b7280",
              border: !liveMode ? "1.5px solid oklch(0.72 0.1 85 / 30%)" : "1.5px solid oklch(0.3 0.02 260)",
            }}
          >
            Simulated
          </button>
          <button
            onClick={() => setLiveMode(true)}
            className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{
              backgroundColor: liveMode ? "#22c55e20" : "transparent",
              color: liveMode ? "#22c55e" : "#6b7280",
              border: liveMode ? "1.5px solid #22c55e40" : "1.5px solid oklch(0.3 0.02 260)",
            }}
          >
            Live
          </button>
        </div>

        {/* Scenario Selector (pill bar) */}
        <div className="flex flex-wrap gap-2 justify-center mb-10">
          {SCENARIOS.map((sc) => (
            <button
              key={sc.id}
              onClick={() => {
                if (flowState !== "reviewing" || !processing) {
                  setScenario(sc);
                  setFlowState("idle");
                }
              }}
              className="px-3 py-2 rounded-full text-xs font-medium transition-all duration-200"
              style={{
                backgroundColor: scenario.id === sc.id ? "oklch(0.22 0.03 260)" : "transparent",
                color: scenario.id === sc.id ? "#e5e7eb" : "#6b7280",
                border: scenario.id === sc.id
                  ? "1.5px solid oklch(0.72 0.1 85 / 40%)"
                  : "1.5px solid oklch(0.3 0.02 260)",
              }}
            >
              <span className="mr-1">{sc.icon}</span>
              {sc.label}
            </button>
          ))}
        </div>

        {/* ── Policy Auto-Decision Banner ── */}
        {(flowState === "auto_approved" || flowState === "auto_denied") && policyInfo && (
          <div
            className="rounded-xl border p-5 mb-6"
            style={{
              backgroundColor: flowState === "auto_approved" ? "#22c55e10" : "#ef444410",
              borderColor: flowState === "auto_approved" ? "#22c55e30" : "#ef444430",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                style={{
                  backgroundColor: flowState === "auto_approved" ? "#22c55e20" : "#ef444420",
                  color: flowState === "auto_approved" ? "#22c55e" : "#ef4444",
                }}
              >
                {flowState === "auto_approved" ? "\u2713" : "\u2717"}
              </div>
              <span className="text-sm font-semibold" style={{ color: flowState === "auto_approved" ? "#22c55e" : "#ef4444" }}>
                {flowState === "auto_approved" ? "Auto-Approved by Policy" : "Auto-Denied by Policy"}
              </span>
            </div>
            <p className="text-xs" style={{ color: "#9ca3af" }}>
              Policy: <span style={{ color: "#d1d5db" }}>{policyInfo.policyTitle}</span>
            </p>
            <p className="text-xs mt-1" style={{ color: "#6b7280" }}>
              The governance engine applied a learned rule. A receipt was still generated and recorded to the ledger.
            </p>
          </div>
        )}

        {/* ── Intent Card ── */}
        <div
          className="rounded-xl border p-6 md:p-8 mb-6"
          style={{
            backgroundColor: "oklch(0.16 0.03 260)",
            borderColor: "oklch(0.72 0.1 85 / 20%)",
          }}
        >
          {/* AI Badge + Connector Badge */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: "oklch(0.25 0.05 260)", color: "#b8963e" }}
              >
                AI
              </div>
              <div>
                <p className="text-xs font-medium" style={{ color: "#9ca3af" }}>
                  {scenario.requester} wants to perform an action
                </p>
              </div>
            </div>
            {/* Connector status badge */}
            <div
              className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
              style={{
                backgroundColor:
                  connectorStatus === "connected" ? "#22c55e15" :
                  connectorStatus === "simulated" ? "#3b82f615" :
                  "oklch(0.2 0.02 260)",
                color:
                  connectorStatus === "connected" ? "#22c55e" :
                  connectorStatus === "simulated" ? "#3b82f6" :
                  "#6b7280",
                border:
                  connectorStatus === "connected" ? "1px solid #22c55e30" :
                  connectorStatus === "simulated" ? "1px solid #3b82f630" :
                  "1px solid oklch(0.3 0.02 260)",
              }}
            >
              {scenario.connectorName}
              {connectorStatus === "connected" ? " \u2022 Live" :
               connectorStatus === "simulated" ? " \u2022 Simulated" :
               " \u2022 Future"}
            </div>
          </div>

          {/* Action */}
          <h2 className="text-xl font-bold mb-2" style={{ color: "#e5e7eb" }}>
            {scenario.description}
          </h2>

          {/* Target */}
          <p className="text-sm mb-5" style={{ color: "#9ca3af" }}>
            Target: <span style={{ color: "#d1d5db" }}>{scenario.target}</span>
            {" \u2192 "}
            <span style={{ color: "#b8963e" }}>{scenario.connectorName}</span>
          </p>

          {/* Parameters */}
          <div
            className="rounded-lg p-4 mb-5"
            style={{ backgroundColor: "oklch(0.12 0.02 260)" }}
          >
            <p className="text-xs font-medium mb-2" style={{ color: "#6b7280" }}>
              PARAMETERS
            </p>
            <div className="space-y-1.5">
              {Object.entries(scenario.parameters).map(([key, val]) => (
                <div key={key} className="flex gap-2 text-sm font-mono">
                  <span style={{ color: "#6b7280" }}>{key}:</span>
                  <span style={{ color: "#d1d5db" }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Badge + Mode Badge + Connector Badge */}
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <div
              className="px-3 py-1 rounded-full text-xs font-semibold"
              style={{
                backgroundColor: scenario.riskColor + "20",
                color: scenario.riskColor,
                border: `1px solid ${scenario.riskColor}40`,
              }}
            >
              Risk: {scenario.riskLevel}
            </div>
            <div
              className="px-3 py-1 rounded-full text-xs font-semibold"
              style={{
                backgroundColor: liveMode ? "#22c55e15" : "oklch(0.2 0.02 260)",
                color: liveMode ? "#22c55e" : "#6b7280",
                border: liveMode ? "1px solid #22c55e30" : "1px solid oklch(0.3 0.02 260)",
              }}
            >
              {liveMode
                ? connectorStatus === "connected" ? "Live Execution" : "Simulated (Connector Not Live)"
                : "Simulated"}
            </div>
          </div>

          {/* ── Checking Policy Spinner ── */}
          {flowState === "checking_policy" && (
            <div className="flex items-center justify-center gap-3 py-4">
              <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#b8963e", borderTopColor: "transparent" }} />
              <span className="text-sm" style={{ color: "#9ca3af" }}>Checking governance policies...</span>
            </div>
          )}

          {/* ── Approve / Deny Buttons ── */}
          {flowState === "reviewing" && (
            <div className="flex gap-3">
              <button
                onClick={handleApprove}
                disabled={processing || !intentId}
                className="flex-1 py-4 rounded-lg text-base font-semibold tracking-wide transition-all duration-200"
                style={{
                  backgroundColor: processing ? "oklch(0.3 0.05 145)" : "#22c55e",
                  color: "#fff",
                  cursor: processing ? "not-allowed" : "pointer",
                  opacity: processing ? 0.7 : 1,
                }}
              >
                {processing ? "Processing..." : "APPROVE"}
              </button>
              <button
                onClick={handleDeny}
                disabled={processing || !intentId}
                className="flex-1 py-4 rounded-lg text-base font-semibold tracking-wide transition-all duration-200"
                style={{
                  backgroundColor: processing ? "oklch(0.3 0.05 25)" : "#ef4444",
                  color: "#fff",
                  cursor: processing ? "not-allowed" : "pointer",
                  opacity: processing ? 0.7 : 1,
                }}
              >
                {processing ? "Processing..." : "DENY"}
              </button>
            </div>
          )}

          {/* ── Denied State ── */}
          {isDeniedState && (
            <div>
              <div
                className="rounded-lg p-5 mb-4"
                style={{
                  backgroundColor: "#ef444415",
                  border: "1px solid #ef444440",
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{"\uD83D\uDEAB"}</span>
                  <h3 className="text-base font-bold" style={{ color: "#ef4444" }}>
                    Execution Blocked
                  </h3>
                </div>
                <p className="text-sm" style={{ color: "#fca5a5" }}>
                  {denialMessage}
                </p>
                <p className="text-xs mt-3" style={{ color: "#9ca3af" }}>
                  {flowState === "auto_denied"
                    ? "This action was blocked by a learned policy before reaching a human. The governance engine enforced the rule."
                    : "This is fail-closed enforcement. No approval means no execution. The gate does not open."}
                </p>
              </div>
              <button
                onClick={handleTryAnother}
                className="w-full py-3 rounded-lg text-sm font-semibold tracking-wide transition-all"
                style={{
                  backgroundColor: "transparent",
                  color: "#b8963e",
                  border: "1.5px solid #b8963e",
                }}
              >
                TRY ANOTHER SCENARIO
              </button>
            </div>
          )}
        </div>

        {/* ── Connector Execution Result ── */}
        {connectorResult && isCompletedState && (
          <div
            className="rounded-xl border p-5 mb-6"
            style={{
              backgroundColor: connectorResult.success ? "#22c55e10" : "#ef444410",
              borderColor: connectorResult.success ? "#22c55e30" : "#ef444430",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {connectorResult.success ? "\u2705" : "\u26A0\uFE0F"}
                </span>
                <span className="text-sm font-semibold" style={{ color: connectorResult.success ? "#22c55e" : "#ef4444" }}>
                  {connectorResult.mode === "live" ? "Live Execution" : "Simulated Execution"}
                </span>
              </div>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{
                  backgroundColor: connectorResult.mode === "live" ? "#22c55e15" : "#3b82f615",
                  color: connectorResult.mode === "live" ? "#22c55e" : "#3b82f6",
                }}
              >
                {connectorResult.connector}
              </span>
            </div>
            <p className="text-xs" style={{ color: "#d1d5db" }}>
              {connectorResult.detail}
            </p>
            {connectorResult.externalId && (
              <p className="text-xs mt-1 font-mono" style={{ color: "#6b7280" }}>
                External ID: {connectorResult.externalId}
              </p>
            )}
            {!connectorResult.success && (
              <p className="text-xs mt-2" style={{ color: "#9ca3af" }}>
                The receipt and ledger entry exist regardless of execution outcome. This is the audit trail.
              </p>
            )}
          </div>
        )}

        {/* ── Receipt Display ── */}
        {isCompletedState && receipt && (
          <div ref={receiptRef}>
            <div
              className="rounded-xl border p-6 md:p-8 mb-6"
              style={{
                backgroundColor: "oklch(0.16 0.03 260)",
                borderColor: "#22c55e40",
              }}
            >
              <div className="flex items-center gap-2 mb-5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#22c55e" }} />
                <h3 className="text-lg font-bold" style={{ color: "#22c55e" }}>
                  Receipt Generated
                </h3>
              </div>

              <p className="text-sm mb-5" style={{ color: "#9ca3af" }}>
                {receipt.decision_source === "policy_auto"
                  ? "This receipt was generated by the governance engine's learned policy. The proof is identical to human-approved receipts."
                  : "This receipt is cryptographic proof that a human authorized this action. It cannot be forged, altered, or denied."}
              </p>

              {/* Three-Hash Binding */}
              <div className="space-y-3 mb-6">
                <HashRow label="Intent Hash" value={receipt.intent_hash} color="#3b82f6" />
                <HashRow label="Action Hash" value={receipt.action_hash} color="#8b5cf6" />
                <HashRow label="Verification Hash" value={receipt.verification_hash} color="#22c55e" />
              </div>

              {/* Receipt Details */}
              <div
                className="rounded-lg p-4 mb-5 space-y-2"
                style={{ backgroundColor: "oklch(0.12 0.02 260)" }}
              >
                <DetailRow label="Receipt ID" value={receipt.receipt_id} />
                <DetailRow label="Decision" value={receipt.decision} valueColor="#22c55e" />
                <DetailRow label="Source" value={receipt.decision_source === "policy_auto" ? "Policy (Auto)" : "Human"} valueColor={receipt.decision_source === "policy_auto" ? "#8b5cf6" : "#3b82f6"} />
                <DetailRow label="Connector" value={scenario.connectorName} valueColor="#b8963e" />
                <DetailRow label="Mode" value={connectorResult?.mode === "live" ? "Live" : "Simulated"} valueColor={connectorResult?.mode === "live" ? "#22c55e" : "#6b7280"} />
                <DetailRow label="Risk Score" value={String(receipt.risk_score)} />
                <DetailRow label="Risk Level" value={receipt.risk_level} />
                <DetailRow label="Policy" value={receipt.policy_decision} />
                {receipt.policy_rule_id && (
                  <DetailRow label="Policy ID" value={receipt.policy_rule_id} />
                )}
                <DetailRow label="Signature" value={receipt.signature} truncate />
                <DetailRow label="Protocol" value={receipt.protocol_version} />
              </div>

              {/* Ledger Entry */}
              {ledgerEntry && (
                <div
                  className="rounded-lg p-4 mb-5 space-y-2"
                  style={{ backgroundColor: "oklch(0.12 0.02 260)" }}
                >
                  <p className="text-xs font-medium mb-2" style={{ color: "#b8963e" }}>
                    LEDGER ENTRY
                  </p>
                  <DetailRow label="Block ID" value={ledgerEntry.block_id} />
                  <DetailRow label="Chain Hash" value={ledgerEntry.current_hash} truncate />
                  <DetailRow label="Previous" value={ledgerEntry.previous_hash || "GENESIS"} truncate />
                  <DetailRow label="Signature" value={ledgerEntry.ledger_signature} truncate />
                </div>
              )}

              {/* Verify Button */}
              {(flowState === "approved" || flowState === "auto_approved") && (
                <button
                  onClick={handleVerify}
                  className="w-full py-4 rounded-lg text-base font-semibold tracking-wide transition-all duration-200"
                  style={{
                    backgroundColor: "#3b82f6",
                    color: "#fff",
                  }}
                >
                  VERIFY THIS RECEIPT
                </button>
              )}

              {flowState === "verifying" && (
                <div className="flex items-center justify-center gap-3 py-4">
                  <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#3b82f6", borderTopColor: "transparent" }} />
                  <span className="text-sm" style={{ color: "#9ca3af" }}>Running independent verification...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Verification Result ── */}
        {flowState === "verified" && verifyChecks && (
          <div ref={verifyRef}>
            <div
              className="rounded-xl border p-6 md:p-8 mb-6"
              style={{
                backgroundColor: "oklch(0.16 0.03 260)",
                borderColor: "#3b82f640",
              }}
            >
              <div className="flex items-center gap-2 mb-5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#3b82f6" }} />
                <h3 className="text-lg font-bold" style={{ color: "#3b82f6" }}>
                  Independently Verified
                </h3>
              </div>

              <div className="space-y-3 mb-6">
                {Object.entries(verifyChecks).map(([check, passed]) => (
                  <div key={check} className="flex items-center gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{
                        backgroundColor: passed ? "#22c55e20" : "#ef444420",
                        color: passed ? "#22c55e" : "#ef4444",
                      }}
                    >
                      {passed ? "\u2713" : "\u2717"}
                    </div>
                    <span className="text-sm" style={{ color: passed ? "#d1d5db" : "#fca5a5" }}>
                      {check}
                    </span>
                  </div>
                ))}
              </div>

              {/* The "So What" Moment */}
              <div
                className="rounded-lg p-5"
                style={{
                  backgroundColor: "oklch(0.12 0.02 260)",
                  borderLeft: "3px solid #b8963e",
                }}
              >
                <p className="text-sm leading-relaxed" style={{ color: "#d1d5db" }}>
                  {receipt?.decision_source === "policy_auto"
                    ? "This receipt was generated by a learned governance policy. The cryptographic proof is identical — signed with Ed25519, committed to the hash chain, and independently verified. Even automated decisions leave a full audit trail."
                    : "This receipt is cryptographic proof that a human authorized this action. It was signed with Ed25519, committed to a hash-chained ledger, and independently verified. It cannot be forged, altered, or denied."}
                </p>
                <p className="text-sm mt-3 font-semibold" style={{ color: "#b8963e" }}>
                  This is what AI governance looks like.
                </p>
              </div>
            </div>

            {/* ── Next Actions ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={handleTryAnother}
                className="py-3 rounded-lg text-sm font-semibold transition-all"
                style={{
                  backgroundColor: "transparent",
                  color: "#b8963e",
                  border: "1.5px solid #b8963e",
                }}
              >
                Try Another Scenario
              </button>
              <Link
                href="/how-it-works"
                className="py-3 rounded-lg text-sm font-semibold text-center no-underline transition-all"
                style={{
                  backgroundColor: "transparent",
                  color: "#9ca3af",
                  border: "1.5px solid oklch(0.3 0.02 260)",
                }}
              >
                Learn More
              </Link>
              <Link
                href="/get-started"
                className="py-3 rounded-lg text-sm font-semibold text-center no-underline transition-all"
                style={{
                  backgroundColor: "transparent",
                  color: "#9ca3af",
                  border: "1.5px solid oklch(0.3 0.02 260)",
                }}
              >
                Run Your Own
              </Link>
            </div>
          </div>
        )}

        {/* ── What Just Happened (always visible below) ── */}
        {(isCompletedState || isDeniedState) && (
          <div
            className="mt-10 rounded-xl border p-6 md:p-8"
            style={{
              backgroundColor: "oklch(0.16 0.03 260)",
              borderColor: "oklch(0.72 0.1 85 / 15%)",
            }}
          >
            <h3 className="text-base font-bold mb-4" style={{ color: "#b8963e" }}>
              What Just Happened
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "#e5e7eb" }}>
                  The Gate
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                  {policyInfo
                    ? `${scenario.requester} proposed an action via ${scenario.connectorName}. The governance engine checked learned policies and ${policyInfo.decision === "auto_approve" ? "auto-approved" : "auto-denied"} it.`
                    : `${scenario.requester} proposed an action via ${scenario.connectorName}. RIO intercepted it and paused execution. Nothing moved until you decided.`}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "#e5e7eb" }}>
                  The Proof
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                  {isDeniedState
                    ? "Even the denial was recorded. The system logged that the action was proposed and rejected. There is a permanent record."
                    : "Three cryptographic hashes bind the approval to the action and its outcome. The receipt was signed and committed to an immutable ledger."}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "#e5e7eb" }}>
                  The Connector
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                  {connectorResult
                    ? `The ${scenario.connectorName} connector ${connectorResult.mode === "live" ? "executed the action in real-time" : "simulated the execution"}. RIO governs the action regardless of which system executes it — Gmail, Calendar, Drive, or any future connector.`
                    : `RIO sits between the AI and ${scenario.connectorName}. The connector only executes after the receipt and ledger entry exist. No receipt, no execution.`}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer
        className="border-t py-6 text-center text-xs"
        style={{
          backgroundColor: "oklch(0.1 0.02 260)",
          borderColor: "oklch(0.72 0.1 85 / 15%)",
          color: "#6b7280",
        }}
      >
        © 2025–2026 RIO Protocol. All rights reserved.
      </footer>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function HashRow({ label, value, color }: { label: string; value: string; color: string }) {
  const display = value && value.length > 20 ? value.slice(0, 20) + "..." : value;
  return (
    <div
      className="rounded-lg p-3 flex items-center gap-3"
      style={{ backgroundColor: color + "10", border: `1px solid ${color}25` }}
    >
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <div className="min-w-0">
        <p className="text-xs font-medium" style={{ color: color }}>
          {label}
        </p>
        <p className="text-xs font-mono truncate" style={{ color: "#d1d5db" }}>
          {display || "\u2014"}
        </p>
      </div>
    </div>
  );
}

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
  const display = truncate && value && value.length > 32 ? value.slice(0, 32) + "..." : value;
  return (
    <div className="flex gap-2 text-xs font-mono">
      <span className="min-w-[90px] flex-shrink-0" style={{ color: "#6b7280" }}>
        {label}:
      </span>
      <span style={{ color: valueColor || "#d1d5db", wordBreak: "break-all" }}>
        {display || "\u2014"}
      </span>
    </div>
  );
}

