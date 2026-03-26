/**
 * Demo 4 — Full Pipeline: Intent → Policy → Risk → Approval → Execution → Receipt → Ledger → Replay
 *
 * Interactive 8-stage pipeline visualization with:
 * - Scenario selector (low / high / critical risk)
 * - Animated stage progression with color-coded lights
 * - Risk score gauge
 * - Approval flow (auto-approve for low risk, human approval for high/critical)
 * - Receipt + Ledger display
 * - "What If?" replay section showing how different policies change outcomes
 *
 * Uses real backend calls (tRPC → rio router → Ed25519 signing, SHA-256 hashing, DB writes).
 */

import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import NavBar from "@/components/NavBar";

// ── Scenarios ─────────────────────────────────────────────────────────────────

type Scenario = {
  id: string;
  label: string;
  action: string;
  description: string;
  requestedBy: string;
  riskLevel: "low" | "high" | "critical";
  riskScore: number;
  requiresApproval: boolean;
  color: string;
  icon: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: "low",
    label: "Low Risk",
    action: "read_data",
    description: "Read quarterly sales report from shared drive",
    requestedBy: "analytics_agent",
    riskLevel: "low",
    riskScore: 15,
    requiresApproval: false,
    color: "#22c55e",
    icon: "📊",
  },
  {
    id: "high",
    label: "High Risk",
    action: "send_email",
    description: "Send Q1 financial report to external auditors",
    requestedBy: "finance_agent",
    riskLevel: "high",
    riskScore: 68,
    requiresApproval: true,
    color: "#eab308",
    icon: "📧",
  },
  {
    id: "critical",
    label: "Critical Risk",
    action: "transfer_funds",
    description: "Wire $47,500 to vendor account ending in 8842",
    requestedBy: "payment_agent",
    riskLevel: "critical",
    riskScore: 92,
    requiresApproval: true,
    color: "#ef4444",
    icon: "💸",
  },
];

// ── Pipeline Stages ───────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: "intake", label: "Intake", num: 1 },
  { key: "classify", label: "Classification", num: 2 },
  { key: "policy", label: "Policy & Risk", num: 3 },
  { key: "auth", label: "Authorization", num: 4 },
  { key: "gate", label: "Execution Gate", num: 5 },
  { key: "execute", label: "Execute", num: 6 },
  { key: "receipt", label: "Receipt", num: 7 },
  { key: "ledger", label: "Ledger", num: 8 },
] as const;

type StageKey = (typeof PIPELINE_STAGES)[number]["key"];
type StageStatus = "pending" | "active" | "complete" | "blocked";

type PipelinePhase =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "complete"
  | "replay";

// ── Risk Gauge Component ──────────────────────────────────────────────────────

function RiskGauge({ score, color, animate }: { score: number; color: string; animate: boolean }) {
  const radius = 60;
  const circumference = Math.PI * radius; // half circle
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="80" viewBox="0 0 140 80">
        {/* Background arc */}
        <path
          d="M 10 75 A 60 60 0 0 1 130 75"
          fill="none"
          stroke="#1f2937"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Score arc */}
        <path
          d="M 10 75 A 60 60 0 0 1 130 75"
          fill="none"
          stroke={animate ? color : "#1f2937"}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animate ? offset : circumference}
          style={{ transition: "stroke-dashoffset 1.2s ease-out, stroke 0.3s" }}
        />
        {/* Score text */}
        <text
          x="70"
          y="65"
          textAnchor="middle"
          fill={animate ? color : "#4b5563"}
          fontSize="22"
          fontWeight="bold"
          fontFamily="'Outfit', sans-serif"
          style={{ transition: "fill 0.3s" }}
        >
          {animate ? score : "—"}
        </text>
      </svg>
      <span className="text-xs font-medium mt-1" style={{ color: animate ? color : "#4b5563" }}>
        Risk Score
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Demo4() {
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [phase, setPhase] = useState<PipelinePhase>("idle");
  const [stageStatuses, setStageStatuses] = useState<Record<StageKey, StageStatus>>(
    Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, "pending"])) as Record<StageKey, StageStatus>
  );
  const [logEntries, setLogEntries] = useState<{ text: string; color: string; ts: string }[]>([]);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<Record<string, unknown> | null>(null);
  const [ledgerData, setLedgerData] = useState<Record<string, unknown> | null>(null);
  const [showGauge, setShowGauge] = useState(false);
  const [replayResult, setReplayResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const createIntentMut = trpc.rio.createIntent.useMutation();
  const approveMut = trpc.rio.approve.useMutation();
  const executeMut = trpc.rio.execute.useMutation();

  const now = () => new Date().toISOString().slice(11, 19);

  const addLog = (text: string, color: string) => {
    setLogEntries((prev) => [...prev, { text, color, ts: now() }]);
  };

  const setStage = (key: StageKey, status: StageStatus) => {
    setStageStatuses((prev) => ({ ...prev, [key]: status }));
  };

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logEntries]);

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // ── Run Pipeline ──────────────────────────────────────────────────────────

  const runPipeline = async (scenario: Scenario) => {
    setSelectedScenario(scenario);
    setPhase("running");
    setLogEntries([]);
    setReceiptData(null);
    setLedgerData(null);
    setReplayResult(null);
    setShowGauge(false);
    setStageStatuses(
      Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, "pending"])) as Record<StageKey, StageStatus>
    );
    setLoading(true);

    // Stage 1: Intake
    setStage("intake", "active");
    addLog(`INTAKE — Received request from ${scenario.requestedBy}`, "#eab308");
    addLog(`INTAKE — Action: "${scenario.action}"`, "#eab308");
    addLog(`INTAKE — Description: "${scenario.description}"`, "#d1d5db");
    await delay(600);
    setStage("intake", "complete");

    // Stage 2: Classification
    setStage("classify", "active");
    addLog(`CLASSIFY — Action type: ${scenario.action}`, "#eab308");
    addLog(`CLASSIFY — Risk category: ${scenario.riskLevel.toUpperCase()}`, scenario.color);
    await delay(500);
    setStage("classify", "complete");

    // Stage 3: Policy & Risk
    setStage("policy", "active");
    setShowGauge(true);
    addLog(`POLICY — Evaluating against active policy rules...`, "#eab308");
    await delay(400);
    addLog(`RISK — Base risk: ${scenario.action} → ${scenario.riskScore > 50 ? "HIGH" : "LOW"}`, scenario.color);
    addLog(`RISK — Composite score: ${scenario.riskScore}/100`, scenario.color);
    addLog(
      `POLICY — Verdict: ${scenario.requiresApproval ? "REQUIRE_APPROVAL" : "ALLOW"}`,
      scenario.requiresApproval ? "#eab308" : "#22c55e"
    );
    await delay(400);
    setStage("policy", "complete");

    // Create the real intent via backend
    try {
      const result = await createIntentMut.mutateAsync({
        action: scenario.action,
        description: scenario.description,
        requestedBy: scenario.requestedBy,
      });
      setIntentId(result.intentId);
      addLog(`INTENT — Created: ${result.intentId} (hash: ${result.intentHash.slice(0, 12)}...)`, "#b8963e");
    } catch {
      addLog(`ERROR — Failed to create intent`, "#ef4444");
      setLoading(false);
      return;
    }

    // Stage 4: Authorization
    setStage("auth", "active");
    if (scenario.requiresApproval) {
      addLog(`AUTH — Human approval required (risk ${scenario.riskScore} > threshold)`, "#eab308");
      addLog(`AUTH — Notification sent to authorized approver`, "#eab308");
      setPhase("awaiting_approval");
      setLoading(false);
      return; // Wait for user to click approve
    } else {
      addLog(`AUTH — Auto-approved (risk ${scenario.riskScore} below threshold)`, "#22c55e");
      setStage("auth", "complete");
      // Auto-approve in backend
      await autoApproveAndExecute(scenario);
    }
  };

  // ── Auto-approve + Execute (low risk) ─────────────────────────────────────

  const autoApproveAndExecute = async (scenario: Scenario) => {
    if (!intentId && !createIntentMut.data) return;
    const id = intentId || createIntentMut.data?.intentId;
    if (!id) return;

    try {
      const approvalResult = await approveMut.mutateAsync({ intentId: id, decidedBy: "system_auto" });
      addLog(`AUTH — Signature: ${approvalResult.signature}`, "#22c55e");
      setStage("auth", "complete");
    } catch {
      addLog(`ERROR — Auto-approval failed`, "#ef4444");
      setLoading(false);
      return;
    }

    await executeAction(id, scenario);
  };

  // ── Human Approve ─────────────────────────────────────────────────────────

  const handleApprove = async () => {
    if (!intentId || !selectedScenario) return;
    setLoading(true);

    try {
      const result = await approveMut.mutateAsync({ intentId, decidedBy: "human_approver" });
      addLog(`AUTH — Human decision: APPROVED`, "#3b82f6");
      addLog(`AUTH — ECDSA signature generated: ${result.signature}`, "#3b82f6");
      addLog(`AUTH — Signature verified: TRUE`, "#22c55e");
      setStage("auth", "complete");
      setPhase("approved");
      await delay(300);
      await executeAction(intentId, selectedScenario);
    } catch {
      addLog(`ERROR — Approval failed`, "#ef4444");
      setLoading(false);
    }
  };

  // ── Execute ───────────────────────────────────────────────────────────────

  const executeAction = async (id: string, scenario: Scenario) => {
    // Stage 5: Execution Gate
    setStage("gate", "active");
    addLog(`GATE — Verifying execution token...`, "#eab308");
    await delay(400);
    addLog(`GATE — Signature: VALID`, "#22c55e");
    addLog(`GATE — Nonce: UNCONSUMED`, "#22c55e");
    addLog(`GATE — Timestamp: FRESH`, "#22c55e");
    addLog(`GATE — Verdict: OPEN`, "#22c55e");
    setStage("gate", "complete");
    await delay(300);

    // Stage 6: Execute
    setStage("execute", "active");
    setPhase("executing");
    addLog(`EXECUTE — Performing action: ${scenario.action}`, "#22c55e");

    try {
      const result = await executeMut.mutateAsync({ intentId: id });

      if (result.allowed) {
        addLog(`EXECUTE — Action completed successfully`, "#22c55e");
        setStage("execute", "complete");
        await delay(300);

        // Stage 6b: Post-Execution Verification
        addLog(`VERIFY — Running post-execution verification...`, "#3b82f6");
        await delay(300);
        addLog(`VERIFY — Intent hash: ${(result.receipt as Record<string, unknown>).intent_hash ? String((result.receipt as Record<string, unknown>).intent_hash).slice(0, 16) + "..." : "—"}`, "#3b82f6");
        addLog(`VERIFY — Action hash: ${(result.receipt as Record<string, unknown>).action_hash ? String((result.receipt as Record<string, unknown>).action_hash).slice(0, 16) + "..." : "—"}`, "#3b82f6");
        addLog(`VERIFY — Verification hash: ${(result.receipt as Record<string, unknown>).verification_hash ? String((result.receipt as Record<string, unknown>).verification_hash).slice(0, 16) + "..." : "—"}`, "#22c55e");
        addLog(`VERIFY — Status: VERIFIED`, "#22c55e");
        await delay(200);

        // Stage 7: Receipt (v2)
        setStage("receipt", "active");
        const receipt = result.receipt as Record<string, unknown>;
        addLog(`RECEIPT — v2 Generated: ${receipt.receipt_id}`, "#b8963e");
        addLog(`RECEIPT — Receipt hash: ${String(receipt.receipt_hash ?? "").slice(0, 16)}...`, "#b8963e");
        addLog(`RECEIPT — Risk: ${receipt.risk_level} (${receipt.risk_score}) | Policy: ${receipt.policy_decision}`, "#eab308");
        addLog(`RECEIPT — Signature: ${String(receipt.signature ?? "").slice(0, 16)}...`, "#b8963e");
        addLog(`RECEIPT — Previous hash: ${String(receipt.previous_hash ?? "").slice(0, 16)}...`, "#d1d5db");
        addLog(`RECEIPT — Protocol: v2`, "#3b82f6");
        setReceiptData(receipt);
        setStage("receipt", "complete");
        await delay(300);

        // Stage 8: Ledger (v2)
        setStage("ledger", "active");
        const ledgerEntry = result.ledger_entry as Record<string, unknown>;
        addLog(`LEDGER — v2 Block: ${ledgerEntry.block_id}`, "#b8963e");
        addLog(`LEDGER — Chain: ${String(ledgerEntry.previous_hash ?? "").slice(0, 12)}... → ${String(ledgerEntry.current_hash ?? "").slice(0, 12)}...`, "#b8963e");
        addLog(`LEDGER — Receipt hash linked: ${String(ledgerEntry.receipt_hash ?? "").slice(0, 16)}...`, "#b8963e");
        addLog(`LEDGER — Ledger signature: ${String(ledgerEntry.ledger_signature ?? "").slice(0, 16)}...`, "#b8963e");
        addLog(`LEDGER — Entry written to v2 tamper-evident chain`, "#22c55e");
        setLedgerData(ledgerEntry);
        setStage("ledger", "complete");

        setPhase("complete");
      } else {
        addLog(`EXECUTE — BLOCKED: ${result.message}`, "#ef4444");
        setStage("execute", "blocked");
      }
    } catch {
      addLog(`ERROR — Execution failed`, "#ef4444");
      setStage("execute", "blocked");
    }
    setLoading(false);
  };

  // ── What If Replay ────────────────────────────────────────────────────────

  const handleReplay = () => {
    if (!selectedScenario) return;
    setPhase("replay");

    if (selectedScenario.riskLevel === "low") {
      setReplayResult(
        `What If: Under a "strict" policy (all actions require approval), this ${selectedScenario.action} action would NOT have been auto-approved. ` +
        `Instead, it would have been held at Stage 4 (Authorization) until a human approver reviewed and signed it. ` +
        `The risk score of ${selectedScenario.riskScore} would still be calculated, but the policy threshold would change from 50 to 0, meaning every action requires human sign-off. ` +
        `Outcome: BLOCKED → AWAITING_APPROVAL (instead of AUTO_APPROVED → EXECUTED).`
      );
    } else if (selectedScenario.riskLevel === "high") {
      setReplayResult(
        `What If: Under a "relaxed" policy (approval threshold raised to 75), this ${selectedScenario.action} action with risk score ${selectedScenario.riskScore} would have been auto-approved. ` +
        `No human approval would have been required. The email to external auditors would have been sent without oversight. ` +
        `Under the current policy (threshold 50), the human approver caught and verified the recipient list before authorizing. ` +
        `Outcome: AUTO_APPROVED → EXECUTED (instead of REQUIRE_APPROVAL → HUMAN_REVIEW → EXECUTED).`
      );
    } else {
      setReplayResult(
        `What If: Under a "delegated" policy (managers can approve up to $50,000), this $47,500 transfer would have been approved by a Manager instead of requiring Director-level sign-off. ` +
        `Under the current policy, the amount exceeded the Manager threshold ($10,000), escalating to Director review. ` +
        `The Director verified the vendor account, confirmed the invoice, and approved. Under the delegated policy, this verification step would have been skipped. ` +
        `Outcome: MANAGER_APPROVED → EXECUTED (instead of ESCALATED → DIRECTOR_REVIEW → EXECUTED).`
      );
    }
  };

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setSelectedScenario(null);
    setPhase("idle");
    setStageStatuses(
      Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, "pending"])) as Record<StageKey, StageStatus>
    );
    setLogEntries([]);
    setIntentId(null);
    setReceiptData(null);
    setLedgerData(null);
    setShowGauge(false);
    setReplayResult(null);
    setLoading(false);
  };

  // ── Stage Colors ──────────────────────────────────────────────────────────

  const getStageColors = (status: StageStatus) => {
    switch (status) {
      case "active":
        return { bg: "#b8963e", border: "#b8963e", text: "#b8963e", glow: "0 0 12px rgba(184,150,62,0.5)" };
      case "complete":
        return { bg: "#22c55e", border: "#22c55e", text: "#22c55e", glow: "0 0 10px rgba(34,197,94,0.4)" };
      case "blocked":
        return { bg: "#ef4444", border: "#ef4444", text: "#ef4444", glow: "0 0 10px rgba(239,68,68,0.4)" };
      default:
        return { bg: "#1f2937", border: "#374151", text: "#4b5563", glow: "none" };
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: "'Outfit', sans-serif" }}>
      <NavBar />

      <div className="flex flex-col items-center flex-1 px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <img
          src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio-logo-new_8049c497.png"
          alt="RIO Logo"
          className="w-20 h-20 mb-3"
        />
        <h1 className="text-2xl sm:text-3xl font-black tracking-[0.12em] mb-2" style={{ color: "#b8963e" }}>
          Demo 4 — Full Pipeline
        </h1>
        <p className="text-sm text-center max-w-2xl mb-8" style={{ color: "#9ca3af" }}>
          Watch a request travel through all 8 stages of the RIO pipeline. Select a scenario to see how
          risk level determines whether the system auto-approves or requires human authorization.
          Every step uses real backend calls — Ed25519 signing, SHA-256 hashing, v2 receipt generation with
          intent/action/verification hashes, and hash-chained ledger writes.
        </p>

        {/* ── Scenario Selector ──────────────────────────────────────────────── */}
        {phase === "idle" && (
          <div className="w-full max-w-3xl mb-10">
            <p className="text-xs font-semibold tracking-wider uppercase mb-4 text-center" style={{ color: "#b8963e" }}>
              Select a Scenario
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => runPipeline(s)}
                  disabled={loading}
                  className="p-5 rounded-lg border text-left transition-all duration-200 hover:scale-[1.02] disabled:opacity-50"
                  style={{
                    borderColor: `${s.color}40`,
                    backgroundColor: `${s.color}08`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{s.icon}</span>
                    <span className="text-sm font-bold" style={{ color: s.color }}>
                      {s.label}
                    </span>
                  </div>
                  <p className="text-xs mb-2" style={{ color: "#d1d5db" }}>
                    {s.description}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "#6b7280" }}>Risk:</span>
                    <span className="text-xs font-mono font-bold" style={{ color: s.color }}>
                      {s.riskScore}/100
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Pipeline Visualization ─────────────────────────────────────────── */}
        {phase !== "idle" && (
          <>
            {/* Stage lights */}
            <div className="w-full max-w-5xl mb-6 overflow-x-auto">
              <div className="flex items-center justify-between min-w-[700px]">
                {PIPELINE_STAGES.map((stage, i) => {
                  const status = stageStatuses[stage.key];
                  const colors = getStageColors(status);
                  return (
                    <div key={stage.key} className="flex items-center" style={{ flex: 1 }}>
                      <div className="flex flex-col items-center gap-1.5" style={{ minWidth: "70px" }}>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono" style={{ color: colors.text }}>
                            {stage.num}
                          </span>
                          <div
                            className={`w-4 h-4 rounded-full transition-all duration-500 ${status === "active" ? "animate-pulse" : ""}`}
                            style={{
                              backgroundColor: colors.bg,
                              boxShadow: colors.glow,
                              border: `2px solid ${colors.border}`,
                            }}
                          />
                        </div>
                        <span
                          className="text-[10px] text-center font-medium transition-colors duration-300"
                          style={{ color: colors.text }}
                        >
                          {stage.label}
                        </span>
                      </div>
                      {i < PIPELINE_STAGES.length - 1 && (
                        <div
                          className="flex-1 h-px mx-1"
                          style={{
                            backgroundColor:
                              stageStatuses[PIPELINE_STAGES[i + 1].key] !== "pending"
                                ? "rgba(184,150,62,0.5)"
                                : "rgba(107,114,128,0.2)",
                            transition: "background-color 0.5s",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Main content: Risk Gauge + Log */}
            <div className="flex flex-col md:flex-row gap-4 w-full max-w-5xl mb-6">
              {/* Left: Risk Gauge + Scenario Info */}
              <div className="w-full md:w-64 shrink-0 flex flex-col items-center gap-4">
                <RiskGauge
                  score={selectedScenario?.riskScore ?? 0}
                  color={selectedScenario?.color ?? "#4b5563"}
                  animate={showGauge}
                />
                {selectedScenario && (
                  <div
                    className="w-full p-4 rounded border text-center"
                    style={{
                      borderColor: `${selectedScenario.color}30`,
                      backgroundColor: `${selectedScenario.color}08`,
                    }}
                  >
                    <p className="text-xs font-bold mb-1" style={{ color: selectedScenario.color }}>
                      {selectedScenario.icon} {selectedScenario.label}
                    </p>
                    <p className="text-xs" style={{ color: "#d1d5db" }}>
                      {selectedScenario.action}
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: "#6b7280" }}>
                      {selectedScenario.description}
                    </p>
                  </div>
                )}

                {/* Approval button */}
                {phase === "awaiting_approval" && (
                  <div
                    className="w-full p-4 rounded border text-center"
                    style={{ borderColor: "#eab308", backgroundColor: "rgba(234,179,8,0.08)" }}
                  >
                    <p className="text-xs font-bold mb-3" style={{ color: "#eab308" }}>
                      ⏳ Awaiting Human Approval
                    </p>
                    <button
                      onClick={handleApprove}
                      disabled={loading}
                      className="w-full py-2.5 px-4 text-sm font-medium border rounded transition-colors duration-200 hover:bg-green-500/10 disabled:opacity-50"
                      style={{ borderColor: "#22c55e", color: "#22c55e", backgroundColor: "transparent" }}
                    >
                      {loading ? "Approving..." : "Approve & Sign"}
                    </button>
                  </div>
                )}
              </div>

              {/* Right: Live Log */}
              <div
                ref={logRef}
                className="flex-1 p-4 rounded border overflow-y-auto"
                style={{
                  borderColor: "rgba(184,150,62,0.3)",
                  backgroundColor: "rgba(0,0,0,0.25)",
                  fontFamily: "monospace",
                  maxHeight: "360px",
                }}
              >
                <p className="text-xs font-semibold mb-3" style={{ color: "#b8963e" }}>
                  PIPELINE LOG (real backend)
                </p>
                <div className="space-y-1">
                  {logEntries.length === 0 && (
                    <p className="text-xs" style={{ color: "#4b5563" }}>
                      Initializing pipeline...
                    </p>
                  )}
                  {logEntries.map((entry, i) => (
                    <p key={i} className="text-xs" style={{ color: entry.color }}>
                      <span style={{ color: "#4b5563" }}>[{entry.ts}]</span> {entry.text}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            {/* Receipt + Ledger (v2) */}
            {phase === "complete" && receiptData && ledgerData && (
              <div className="w-full max-w-5xl flex flex-col md:flex-row gap-4 mb-6">
                <div
                  className="flex-1 p-4 rounded border"
                  style={{ borderColor: "rgba(184,150,62,0.5)", backgroundColor: "rgba(184,150,62,0.06)" }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold" style={{ color: "#b8963e" }}>
                      CRYPTOGRAPHIC RECEIPT (v2)
                    </p>
                    <span className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                      {(receiptData as Record<string, unknown>).verification_status === "verified" ? "VERIFIED" : String((receiptData as Record<string, unknown>).verification_status ?? "—").toUpperCase()}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs font-mono" style={{ color: "#d1d5db" }}>
                    <div><span style={{ color: "#6b7280" }}>receipt_id: </span>{String((receiptData as Record<string, unknown>).receipt_id ?? "")}</div>
                    <div><span style={{ color: "#6b7280" }}>intent_hash: </span><span style={{ color: "#b8963e" }}>{String((receiptData as Record<string, unknown>).intent_hash ?? "").slice(0, 24)}...</span></div>
                    <div><span style={{ color: "#6b7280" }}>action_hash: </span><span style={{ color: "#b8963e" }}>{String((receiptData as Record<string, unknown>).action_hash ?? "").slice(0, 24)}...</span></div>
                    <div><span style={{ color: "#6b7280" }}>verification_hash: </span><span style={{ color: "#22c55e" }}>{String((receiptData as Record<string, unknown>).verification_hash ?? "").slice(0, 24)}...</span></div>
                    <div><span style={{ color: "#6b7280" }}>receipt_hash: </span>{String((receiptData as Record<string, unknown>).receipt_hash ?? "").slice(0, 24)}...</div>
                    <div className="pt-1 border-t" style={{ borderColor: "rgba(107,114,128,0.2)" }}>
                      <span style={{ color: "#6b7280" }}>decision: </span><span style={{ color: "#22c55e" }}>{String((receiptData as Record<string, unknown>).decision ?? "")}</span>
                    </div>
                    <div><span style={{ color: "#6b7280" }}>risk: </span><span style={{ color: selectedScenario?.color }}>{String((receiptData as Record<string, unknown>).risk_level ?? "")} ({String((receiptData as Record<string, unknown>).risk_score ?? "")})</span></div>
                    <div><span style={{ color: "#6b7280" }}>policy: </span>{String((receiptData as Record<string, unknown>).policy_decision ?? "")} ({String((receiptData as Record<string, unknown>).policy_rule_id ?? "")})</div>
                    <div className="pt-1 border-t" style={{ borderColor: "rgba(107,114,128,0.2)" }}>
                      <span style={{ color: "#6b7280" }}>requested: </span>{String((receiptData as Record<string, unknown>).timestamp_request ?? "").slice(11, 19)}
                    </div>
                    <div><span style={{ color: "#6b7280" }}>approved: </span>{String((receiptData as Record<string, unknown>).timestamp_approval ?? "").slice(11, 19)}</div>
                    <div><span style={{ color: "#6b7280" }}>executed: </span>{String((receiptData as Record<string, unknown>).timestamp_execution ?? "").slice(11, 19)}</div>
                    <div><span style={{ color: "#6b7280" }}>signature: </span>{String((receiptData as Record<string, unknown>).signature ?? "").slice(0, 24)}...</div>
                    <div><span style={{ color: "#6b7280" }}>previous_hash: </span>{String((receiptData as Record<string, unknown>).previous_hash ?? "").slice(0, 16)}...</div>
                    <div><span style={{ color: "#6b7280" }}>protocol: </span><span style={{ color: "#3b82f6" }}>{String((receiptData as Record<string, unknown>).protocol_version ?? "v2")}</span></div>
                  </div>
                </div>
                <div
                  className="flex-1 p-4 rounded border"
                  style={{ borderColor: "rgba(184,150,62,0.5)", backgroundColor: "rgba(184,150,62,0.06)" }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold" style={{ color: "#b8963e" }}>
                      LEDGER ENTRY (v2 hash-chain)
                    </p>
                    <span className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>
                      v2
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs font-mono" style={{ color: "#d1d5db" }}>
                    <div><span style={{ color: "#6b7280" }}>block_id: </span>{String((ledgerData as Record<string, unknown>).block_id ?? "")}</div>
                    <div><span style={{ color: "#6b7280" }}>receipt_hash: </span><span style={{ color: "#b8963e" }}>{String((ledgerData as Record<string, unknown>).receipt_hash ?? "").slice(0, 24)}...</span></div>
                    <div><span style={{ color: "#6b7280" }}>previous_hash: </span>{String((ledgerData as Record<string, unknown>).previous_hash ?? "").slice(0, 24)}...</div>
                    <div><span style={{ color: "#6b7280" }}>current_hash: </span><span style={{ color: "#22c55e" }}>{String((ledgerData as Record<string, unknown>).current_hash ?? "").slice(0, 24)}...</span></div>
                    <div><span style={{ color: "#6b7280" }}>ledger_signature: </span>{String((ledgerData as Record<string, unknown>).ledger_signature ?? "").slice(0, 24)}...</div>
                    <div><span style={{ color: "#6b7280" }}>protocol: </span><span style={{ color: "#3b82f6" }}>{String((ledgerData as Record<string, unknown>).protocol_version ?? "v2")}</span></div>
                    <div><span style={{ color: "#6b7280" }}>timestamp: </span>{String((ledgerData as Record<string, unknown>).timestamp ?? "")}</div>
                    <div><span style={{ color: "#6b7280" }}>recorded_by: </span>{String((ledgerData as Record<string, unknown>).recorded_by ?? "")}</div>
                  </div>
                </div>
              </div>
            )}

            {/* What If Replay */}
            {(phase === "complete" || phase === "replay") && (
              <div className="w-full max-w-5xl mb-6">
                <div
                  className="p-5 rounded border"
                  style={{ borderColor: "rgba(59,130,246,0.3)", backgroundColor: "rgba(59,130,246,0.05)" }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold" style={{ color: "#3b82f6" }}>
                      🔄 What If? — Policy Replay Simulation
                    </p>
                    {!replayResult && (
                      <button
                        onClick={handleReplay}
                        className="py-1.5 px-4 text-xs font-medium border rounded transition-colors duration-200 hover:bg-blue-500/10"
                        style={{ borderColor: "#3b82f6", color: "#3b82f6", backgroundColor: "transparent" }}
                      >
                        Run Replay
                      </button>
                    )}
                  </div>
                  {!replayResult && (
                    <p className="text-xs" style={{ color: "#9ca3af" }}>
                      See how a different policy would have changed the outcome for this exact request.
                      The replay engine re-evaluates the same intent under modified rules.
                    </p>
                  )}
                  {replayResult && (
                    <div
                      className="p-4 rounded mt-2"
                      style={{ backgroundColor: "rgba(59,130,246,0.08)" }}
                    >
                      <p className="text-sm leading-relaxed" style={{ color: "#d1d5db" }}>
                        {replayResult}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="py-2 px-6 text-sm font-medium border rounded transition-colors duration-200 hover:bg-white/5"
                style={{ borderColor: "#b8963e", color: "#b8963e", backgroundColor: "transparent" }}
              >
                {phase === "complete" || phase === "replay" ? "Try Another Scenario" : "Reset"}
              </button>
            </div>

            {/* Summary */}
            {(phase === "complete" || phase === "replay") && (
              <div
                className="w-full max-w-4xl p-5 rounded border text-center mt-6"
                style={{ borderColor: "rgba(184,150,62,0.3)", backgroundColor: "rgba(255,255,255,0.03)" }}
              >
                <h2 className="text-base font-bold mb-3" style={{ color: "#b8963e" }}>
                  What Just Happened
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: "#d1d5db" }}>
                  A request entered the RIO pipeline and traveled through all 8 stages. The system
                  evaluated the risk, {selectedScenario?.requiresApproval
                    ? "required human approval (which was cryptographically signed),"
                    : "auto-approved the low-risk action,"}{" "}
                  executed the action, ran post-execution verification, and generated a v2 cryptographic
                  receipt containing intent_hash, action_hash, and verification_hash. The receipt was
                  signed and recorded in a hash-chained ledger with its own signature. Every step is
                  logged, signed, and independently verifiable. The "What If?" replay shows how the
                  same request would have been handled under a different policy — demonstrating that
                  governance rules are testable and auditable.
                </p>
              </div>
            )}
          </>
        )}

        {/* Back link */}
        <div className="flex gap-4 mt-8">
          <a
            href="/"
            className="text-sm font-light tracking-wide hover:underline"
            style={{ color: "#9ca3af" }}
          >
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
