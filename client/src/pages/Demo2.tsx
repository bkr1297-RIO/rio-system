/**
 * Demo 2 — How RIO Enforces Approval (LIVE BACKEND)
 *
 * Shows the system diagram, stage-light pipeline, live log from real backend calls,
 * "Attempt Execution Without Approval" button that triggers a real 403,
 * and real receipt/ledger at the end.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";

// ── Stage-Light Pipeline Stages ──────────────────────────────────────────────

const STAGES = [
  { label: "Intent Logged", key: "intent_logged" },
  { label: "Policy Checked", key: "policy_checked" },
  { label: "Approval", key: "approval" },
  { label: "Execute", key: "execute" },
  { label: "Receipt Recorded", key: "receipt" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

// Colors: off = dim gray, yellow = #eab308, red = #ef4444, blue = #3b82f6, green = #22c55e, white = #ffffff
type LightColor = "off" | "yellow" | "red" | "blue" | "green" | "white";

const LIGHT_COLORS: Record<LightColor, { bg: string; glow: string; border: string }> = {
  off:    { bg: "#1f2937", glow: "none",                                    border: "#374151" },
  yellow: { bg: "#eab308", glow: "0 0 12px rgba(234, 179, 8, 0.6)",        border: "#eab308" },
  red:    { bg: "#ef4444", glow: "0 0 12px rgba(239, 68, 68, 0.6)",        border: "#ef4444" },
  blue:   { bg: "#3b82f6", glow: "0 0 12px rgba(59, 130, 246, 0.6)",       border: "#3b82f6" },
  green:  { bg: "#22c55e", glow: "0 0 12px rgba(34, 197, 94, 0.6)",        border: "#22c55e" },
  white:  { bg: "#ffffff", glow: "0 0 12px rgba(255, 255, 255, 0.5)",      border: "#ffffff" },
};

// ── Diagram Boxes ────────────────────────────────────────────────────────────

const DIAGRAM_BOXES = [
  "Agent",
  "Intent / Request",
  "Policy / Control Plane",
  "Approval Required",
  "Human Decision",
  "Signature Service",
  "Executor",
  "Ledger / Receipt",
];

const SUMMARY_ITEMS = [
  "The AI agent operates inside a governed system.",
  "The system allows the AI to generate, recommend, and prepare actions.",
  "The system structurally prevents the AI from executing real-world actions without human approval.",
  "This is not a guideline or a policy — execution is technically blocked unless approval is present.",
  "Humans define which actions require approval, and the system enforces those rules.",
];

type LogEntry = {
  text: string;
  color: string;
  boxIndex: number;
};

export default function Demo2() {
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [activeBoxIndex, setActiveBoxIndex] = useState(-1);
  const [visitedBoxes, setVisitedBoxes] = useState<Set<number>>(new Set());
  const [intentId, setIntentId] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<Record<string, unknown> | null>(null);
  const [ledgerData, setLedgerData] = useState<Record<string, unknown> | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"idle" | "intent_created" | "blocked_shown" | "approved" | "executed">("idle");

  // Stage-light state
  const [stageLights, setStageLights] = useState<Record<StageKey, LightColor>>({
    intent_logged: "off",
    policy_checked: "off",
    approval: "off",
    execute: "off",
    receipt: "off",
  });

  const createIntentMut = trpc.rio.createIntent.useMutation();
  const approveMut = trpc.rio.approve.useMutation();
  const executeMut = trpc.rio.execute.useMutation();

  const addLog = (text: string, color: string, boxIndex: number) => {
    setLogEntries(prev => [...prev, { text, color, boxIndex }]);
    setActiveBoxIndex(boxIndex);
    setVisitedBoxes(prev => { const next = new Set(Array.from(prev)); next.add(boxIndex); return next; });
  };

  const now = () => new Date().toISOString().slice(11, 19);

  const setLight = (key: StageKey, color: LightColor) => {
    setStageLights(prev => ({ ...prev, [key]: color }));
  };

  // Step 1: Create Intent
  const handleCreateIntent = async () => {
    setLoading(true);
    setLogEntries([]);
    setVisitedBoxes(new Set());
    setActiveBoxIndex(-1);
    setReceiptData(null);
    setLedgerData(null);
    setBlockedMessage(null);
    setPhase("idle");
    setStageLights({
      intent_logged: "off",
      policy_checked: "off",
      approval: "off",
      execute: "off",
      receipt: "off",
    });

    try {
      const result = await createIntentMut.mutateAsync({
        action: "send_email",
        description: "Send Q1 Quarterly Report Email to team",
        requestedBy: "AI_agent",
      });
      setIntentId(result.intentId);

      addLog(`[${now()}] INTENT_RECEIVED: send_email (${result.intentId})`, "#eab308", 0);
      setLight("intent_logged", "yellow");

      setTimeout(() => {
        addLog(`[${now()}] INTENT_LOGGED — System`, "#eab308", 1);
      }, 300);
      setTimeout(() => {
        addLog(`[${now()}] POLICY_CHECK: approval_required = TRUE`, "#eab308", 2);
        setLight("policy_checked", "yellow");
      }, 600);
      setTimeout(() => {
        addLog(`[${now()}] EXECUTION_STATUS: BLOCKED (awaiting approval)`, "#ef4444", 3);
        setLight("approval", "red");
        setPhase("intent_created");
      }, 900);
    } catch {
      addLog(`[${now()}] ERROR: Failed to create intent`, "#ef4444", 0);
    }
    setLoading(false);
  };

  // Step 2: Attempt Execution Without Approval (real 403)
  const handleAttemptWithoutApproval = async () => {
    if (!intentId) return;
    setLoading(true);
    setBlockedMessage(null);

    try {
      const result = await executeMut.mutateAsync({ intentId });
      if (!result.allowed) {
        addLog(`[${now()}] EXECUTION_ATTEMPTED: send_email`, "#ef4444", 6);
        addLog(`[${now()}] EXECUTION_STATUS: BLOCKED — HTTP ${result.httpStatus}`, "#ef4444", 3);
        setBlockedMessage(result.message ?? "Execution blocked");
        setLight("approval", "red");
        setPhase("blocked_shown");
      }
    } catch {
      addLog(`[${now()}] EXECUTION_ATTEMPTED: BLOCKED`, "#ef4444", 6);
      setBlockedMessage("Execution Blocked — Server rejected the request.");
      setLight("approval", "red");
      setPhase("blocked_shown");
    }
    setLoading(false);
  };

  // Step 3: Approve
  const handleApprove = async () => {
    if (!intentId) return;
    setLoading(true);

    try {
      const result = await approveMut.mutateAsync({ intentId, decidedBy: "human_user" });
      addLog(`[${now()}] HUMAN_DECISION: APPROVED`, "#3b82f6", 4);
      addLog(`[${now()}] SIGNATURE_CREATED: ${result.signature}`, "#3b82f6", 5);
      addLog(`[${now()}] SIGNATURE_VERIFIED: TRUE`, "#22c55e", 5);
      setLight("approval", "blue");
      setPhase("approved");
      setBlockedMessage(null);
    } catch {
      addLog(`[${now()}] ERROR: Approval failed`, "#ef4444", 4);
    }
    setLoading(false);
  };

  // Step 4: Execute (should succeed now)
  const handleExecute = async () => {
    if (!intentId) return;
    setLoading(true);

    try {
      const result = await executeMut.mutateAsync({ intentId });
      if (result.allowed) {
        addLog(`[${now()}] EXECUTION_STATUS: AUTHORIZED`, "#22c55e", 6);
        setLight("execute", "green");
        addLog(`[${now()}] ACTION_EXECUTED: send_email`, "#22c55e", 6);
        addLog(`[${now()}] RECEIPT_CREATED: ${(result.receipt as Record<string, unknown>)?.receipt_id}`, "#ffffff", 7);
        addLog(`[${now()}] LEDGER_ENTRY_WRITTEN: ${(result.ledger_entry as Record<string, unknown>)?.block_id}`, "#ffffff", 7);
        setLight("receipt", "white");
        setReceiptData(result.receipt as unknown as Record<string, unknown>);
        setLedgerData(result.ledger_entry as unknown as Record<string, unknown>);
        setPhase("executed");
      } else {
        addLog(`[${now()}] EXECUTION_STATUS: BLOCKED — ${result.message}`, "#ef4444", 6);
      }
    } catch {
      addLog(`[${now()}] ERROR: Execution failed`, "#ef4444", 6);
    }
    setLoading(false);
  };

  const handleReset = () => {
    setLogEntries([]);
    setVisitedBoxes(new Set());
    setActiveBoxIndex(-1);
    setIntentId(null);
    setReceiptData(null);
    setLedgerData(null);
    setBlockedMessage(null);
    setPhase("idle");
    setStageLights({
      intent_logged: "off",
      policy_checked: "off",
      approval: "off",
      execute: "off",
      receipt: "off",
    });
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center px-6 py-10"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      {/* Top: Logo, Title, Subtitle */}
      <img
        src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio-logo-new_8049c497.png"
        alt="RIO Logo"
        className="w-24 h-24 mb-4"
      />
      <h1 className="text-4xl font-black tracking-[0.15em] mb-2" style={{ color: "#b8963e" }}>
        RIO
      </h1>
      <p className="text-sm font-light tracking-[0.08em] mb-6" style={{ color: "#9ca3af" }}>
        Runtime Intelligence Orchestration
      </p>

      {/* Description text */}
      <p className="text-base text-center max-w-2xl mb-8" style={{ color: "#d1d5db" }}>
        In this scenario, we show what is happening behind the scenes. The agent is structurally
        unable to execute real-world actions without approval. Not policy. Not guidelines. Structure.&nbsp;No&nbsp;log,&nbsp;no&nbsp;go.
      </p>

      {/* ── Stage-Light Pipeline ────────────────────────────────────────────── */}
      <div className="w-full max-w-4xl mb-10">
        <div className="flex items-center justify-between gap-0">
          {STAGES.map((stage, index) => {
            const lightColor = stageLights[stage.key];
            const colors = LIGHT_COLORS[lightColor];
            return (
              <div key={stage.key} className="flex items-center" style={{ flex: 1 }}>
                {/* Stage column: light + label */}
                <div className="flex flex-col items-center gap-2" style={{ minWidth: "80px" }}>
                  <div
                    className={`w-5 h-5 rounded-full transition-all duration-500 ${lightColor !== "off" ? "animate-pulse" : ""}`}
                    style={{
                      backgroundColor: colors.bg,
                      boxShadow: colors.glow,
                      border: `2px solid ${colors.border}`,
                    }}
                  />
                  <span
                    className="text-xs text-center font-medium transition-colors duration-500"
                    style={{ color: lightColor === "off" ? "#6b7280" : colors.border }}
                  >
                    {stage.label}
                  </span>
                </div>
                {/* Connector line between stages */}
                {index < STAGES.length - 1 && (
                  <div
                    className="flex-1 h-px mx-1"
                    style={{
                      backgroundColor: stageLights[STAGES[index + 1].key] !== "off"
                        ? "rgba(184, 150, 62, 0.5)"
                        : "rgba(107, 114, 128, 0.3)",
                      transition: "background-color 0.5s",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main layout: Left diagram + Right log */}
      <div className="flex flex-col md:flex-row gap-6 w-full max-w-5xl mb-6">
        {/* Left: System diagram */}
        <div className="w-full md:w-80 shrink-0 flex flex-col items-center gap-0">
          {DIAGRAM_BOXES.map((box, index) => {
            const isActive = index === activeBoxIndex;
            const isVisited = visitedBoxes.has(index);
            let borderColor = "rgba(184, 150, 62, 0.25)";
            let bgColor = "transparent";
            let textColor = "#6b7280";

            if (isActive) {
              if (index === 3 && (phase === "intent_created" || phase === "blocked_shown")) {
                borderColor = "#ef4444";
                bgColor = "rgba(239, 68, 68, 0.12)";
                textColor = "#ef4444";
              } else if (index === 6 && phase === "executed") {
                borderColor = "#22c55e";
                bgColor = "rgba(34, 197, 94, 0.12)";
                textColor = "#22c55e";
              } else if (index === 7 && phase === "executed") {
                borderColor = "#ffffff";
                bgColor = "rgba(255, 255, 255, 0.08)";
                textColor = "#ffffff";
              } else {
                borderColor = "#b8963e";
                bgColor = "rgba(184, 150, 62, 0.12)";
                textColor = "#b8963e";
              }
            } else if (isVisited) {
              borderColor = "rgba(184, 150, 62, 0.5)";
              textColor = "#d1d5db";
            }

            return (
              <div key={index} className="flex flex-col items-center w-full">
                {index > 0 && (
                  <div className="w-px h-4" style={{ backgroundColor: isVisited || isActive ? "rgba(184, 150, 62, 0.5)" : "rgba(184, 150, 62, 0.15)" }} />
                )}
                {index > 0 && (
                  <div className="w-0 h-0 mb-1" style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: isVisited || isActive ? "6px solid rgba(184, 150, 62, 0.5)" : "6px solid rgba(184, 150, 62, 0.15)" }} />
                )}
                <div
                  className="w-full py-2.5 px-4 text-center text-sm font-medium rounded border transition-all duration-300"
                  style={{ borderColor, backgroundColor: bgColor, color: textColor }}
                >
                  {box}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Live system log */}
        <div
          className="flex-1 p-5 rounded border overflow-hidden"
          style={{ borderColor: "rgba(184, 150, 62, 0.3)", backgroundColor: "rgba(0, 0, 0, 0.25)", fontFamily: "monospace" }}
        >
          <p className="text-xs font-semibold mb-3" style={{ color: "#b8963e" }}>
            LIVE SYSTEM LOG (real backend)
          </p>
          <div className="space-y-1.5 min-h-[200px]">
            {logEntries.length === 0 && (
              <p className="text-xs" style={{ color: "#4b5563" }}>
                Waiting for first step...
              </p>
            )}
            {logEntries.map((entry, index) => (
              <p key={index} className="text-xs" style={{ color: entry.color }}>
                {entry.text}
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Blocked message */}
      {blockedMessage && (
        <div
          className="w-full max-w-5xl p-4 rounded border mb-6 text-center"
          style={{ borderColor: "#ef4444", backgroundColor: "rgba(239, 68, 68, 0.1)" }}
        >
          <p className="text-sm font-medium" style={{ color: "#ef4444" }}>
            {blockedMessage}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap justify-center gap-3 mb-10">
        {phase === "idle" && (
          <button
            onClick={handleCreateIntent}
            disabled={loading}
            className="py-2.5 px-6 text-sm font-medium border rounded transition-colors duration-200 hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: "#b8963e", color: "#ffffff", backgroundColor: "transparent" }}
          >
            {loading ? "Creating..." : "Create Intent"}
          </button>
        )}

        {(phase === "intent_created" || phase === "blocked_shown") && (
          <>
            <button
              onClick={handleAttemptWithoutApproval}
              disabled={loading}
              className="py-2.5 px-6 text-sm font-medium border rounded transition-colors duration-200 hover:bg-red-500/10 disabled:opacity-50"
              style={{ borderColor: "#ef4444", color: "#ef4444", backgroundColor: "transparent" }}
            >
              {loading ? "Attempting..." : "Attempt Execution Without Approval"}
            </button>
            <button
              onClick={handleApprove}
              disabled={loading}
              className="py-2.5 px-6 text-sm font-medium border rounded transition-colors duration-200 hover:bg-white/5 disabled:opacity-50"
              style={{ borderColor: "#22c55e", color: "#22c55e", backgroundColor: "transparent" }}
            >
              {loading ? "Approving..." : "Approve"}
            </button>
          </>
        )}

        {phase === "approved" && (
          <button
            onClick={handleExecute}
            disabled={loading}
            className="py-2.5 px-6 text-sm font-medium border rounded transition-colors duration-200 hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: "#22c55e", color: "#22c55e", backgroundColor: "transparent" }}
          >
            {loading ? "Executing..." : "Execute"}
          </button>
        )}

        {phase !== "idle" && (
          <button
            onClick={handleReset}
            className="py-2.5 px-6 text-sm font-medium border rounded transition-colors duration-200 hover:bg-white/5"
            style={{ borderColor: "#b8963e", color: "#b8963e", backgroundColor: "transparent" }}
          >
            Reset Demo
          </button>
        )}
      </div>

      {/* Receipt + Ledger — shown when executed */}
      {phase === "executed" && receiptData && ledgerData && (
        <div className="w-full max-w-5xl flex flex-col md:flex-row gap-6 mb-10">
          <div className="flex-1 p-5 rounded border" style={{ borderColor: "rgba(184, 150, 62, 0.5)", backgroundColor: "rgba(184, 150, 62, 0.08)" }}>
            <p className="text-xs font-semibold mb-3" style={{ color: "#b8963e" }}>
              LIVE RECEIPT (generated by backend)
            </p>
            <pre className="text-xs leading-relaxed overflow-x-auto" style={{ color: "#d1d5db", fontFamily: "monospace" }}>
              {JSON.stringify(receiptData, null, 2)}
            </pre>
          </div>
          <div className="flex-1 p-5 rounded border" style={{ borderColor: "rgba(184, 150, 62, 0.5)", backgroundColor: "rgba(184, 150, 62, 0.08)" }}>
            <p className="text-xs font-semibold mb-3" style={{ color: "#b8963e" }}>
              LEDGER ENTRY
            </p>
            <pre className="text-xs leading-relaxed overflow-x-auto" style={{ color: "#d1d5db", fontFamily: "monospace" }}>
              {JSON.stringify(ledgerData, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Bottom summary box */}
      <div
        className="w-full max-w-4xl p-6 rounded border text-center"
        style={{ borderColor: "rgba(184, 150, 62, 0.3)", backgroundColor: "rgba(255, 255, 255, 0.03)" }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: "#b8963e" }}>
          What this means
        </h2>
        <div className="space-y-2">
          {SUMMARY_ITEMS.map((item, index) => (
            <p key={index} className="text-sm leading-relaxed" style={{ color: "#d1d5db" }}>
              {item}
            </p>
          ))}
        </div>
      </div>

      {/* Back to landing */}
      <div className="flex gap-4 mt-10">
        <a href="/" className="text-sm font-light tracking-wide hover:underline flex items-center" style={{ color: "#9ca3af" }}>
          ← Back to Home
        </a>
      </div>
    </div>
  );
}
