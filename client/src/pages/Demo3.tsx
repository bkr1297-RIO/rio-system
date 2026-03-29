/**
 * Demo 3 — Audit & Proof (Traceability) (LIVE BACKEND)
 *
 * Runs a full intent→approve→execute cycle on load, then displays
 * real audit log, receipt, and ledger from the backend.
 * Includes live backend text above the audit log.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import NavBar from "@/components/NavBar";
import ReceiptExport from "@/components/ReceiptExport";

const WHAT_THIS_MEANS = [
  "Every request, decision, and action is recorded with timestamps and signatures.",
  "Receipts can be independently verified at any time.",
  "This creates a permanent, traceable history of system activity.",
  "The human can choose what the system records — from only high-impact actions to full interaction logging between agents and humans.",
  "The system enforces the rules, and the ledger preserves the history.",
];

const GROUNDING_STATEMENTS = [
  "This approach follows established patterns used in banking, software deployment, and safety-critical systems, where actions require authorization and all activity is logged and auditable.",
  "This is not inventing a new safety pattern — it applies proven authorization and audit patterns to AI systems.",
];

type AuditData = {
  intentId: string;
  intent: { action: string; requestedBy: string; status: string; createdAt: string } | null;
  approvals: { decision: string; decidedBy: string; decidedAt: string }[];
  executions: { status: string; detail: string; executedAt: string }[];
  receipts: {
    receipt_id: string;
    action: string;
    requested_by: string;
    approved_by: string | null;
    decision: string;
    timestamp_request: string;
    timestamp_approval: string;
    timestamp_execution: string;
    signature: string | null;
    receipt_hash: string;
    previous_hash: string | null;
    intent_hash: string | null;
    action_hash: string | null;
    verification_hash: string | null;
    verification_status: string | null;
    risk_score: number | null;
    risk_level: string | null;
    policy_decision: string | null;
    policy_rule_id: string | null;
    protocol_version: string | null;
  }[];
  ledger_entries: {
    block_id: string;
    receipt_hash: string | null;
    previous_hash: string | null;
    current_hash: string;
    ledger_signature: string | null;
    protocol_version: string | null;
    timestamp: string;
    recorded_by: string;
  }[];
  log: string[];
};

export default function Demo3() {
  const [loading, setLoading] = useState(false);
  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createIntentMut = trpc.rio.createIntent.useMutation();
  const approveMut = trpc.rio.approve.useMutation();
  const executeMut = trpc.rio.execute.useMutation();
  const auditLogQuery = trpc.rio.auditLog;

  // Run a full cycle and then fetch the audit log
  const handleRunAudit = async () => {
    setLoading(true);
    setError(null);
    setAuditData(null);

    try {
      // 1. Create intent
      const intent = await createIntentMut.mutateAsync({
        action: "send_email",
        description: "Send Q1 Quarterly Report Email to team",
        requestedBy: "AI_agent",
      });

      // 2. Approve
      await approveMut.mutateAsync({ intentId: intent.intentId, decidedBy: "human_user" });

      // 3. Execute
      await executeMut.mutateAsync({ intentId: intent.intentId });

      // 4. Fetch full audit log
      // Use a direct fetch since we need to query after mutations
      const response = await fetch(`/api/trpc/rio.auditLog?input=${encodeURIComponent(JSON.stringify({ json: { intentId: intent.intentId } }))}`);
      const json = await response.json();
      const result = json?.result?.data?.json;

      if (result) {
        setAuditData(result as AuditData);
      } else {
        setError("Failed to fetch audit log");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to run audit cycle");
    }
    setLoading(false);
  };

  const receipt = auditData?.receipts?.[0];
  const ledgerEntry = auditData?.ledger_entries?.[0];

  const actionSummary = auditData ? [
    { label: "Action", value: auditData.intent?.action ?? "—" },
    { label: "Requested By", value: auditData.intent?.requestedBy ?? "—" },
    { label: "Human Decision", value: auditData.approvals?.[0]?.decision === "approved" ? "Approved" : "—" },
    { label: "Execution", value: auditData.executions?.find(e => e.status === "success") ? "Completed" : "—" },
    { label: "Receipt ID", value: receipt?.receipt_id ?? "—" },
    { label: "Status", value: "Recorded" },
  ] : [];

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      <NavBar />
      <div className="flex flex-col items-center flex-1 px-4 sm:px-6 py-8 sm:py-10">
      {/* Top: Logo, Title, Subtitle */}
      <img
        src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio-rings-logo_d8ae3f78.png"
        alt="RIO Logo"
        className="w-24 h-24 mb-4"
      />
      <h1 className="text-3xl sm:text-4xl font-black tracking-[0.15em] mb-2" style={{ color: "#b8963e" }}>
        RIO
      </h1>
      <p className="text-sm font-light tracking-[0.08em] mb-2" style={{ color: "#9ca3af" }}>
        Runtime Intelligence Orchestration
      </p>
      <p className="text-sm sm:text-base font-medium mb-4 sm:mb-6" style={{ color: "#b8963e" }}>
        Demo 3 — Audit & Proof (Traceability)
      </p>

      {/* Scenario text */}
      <p className="text-sm sm:text-base text-center max-w-2xl mb-4 sm:mb-6 px-2" style={{ color: "#d1d5db" }}>
        This page shows the audit trail created by the system. Every request, decision, approval,
        and action is recorded and traceable. This also allows the user to understand their AI system better by looking "under the hood." No more black box.
      </p>

      {/* Generate Audit button */}
      {!auditData && (
        <div className="flex justify-center mb-10">
          <button
            onClick={handleRunAudit}
            disabled={loading}
            className="py-2.5 px-8 text-sm font-medium border rounded transition-colors duration-200 hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: "#b8963e", color: "#ffffff", backgroundColor: "transparent" }}
          >
            {loading ? "Running full cycle..." : "Generate Live Audit Trail"}
          </button>
        </div>
      )}

      {error && (
        <div className="w-full max-w-4xl mb-4 p-3 rounded border text-sm" style={{ borderColor: "#ef4444", backgroundColor: "rgba(239, 68, 68, 0.1)", color: "#ef4444" }}>
          {error}
        </div>
      )}

      {/* Three-panel layout — shown after audit data is loaded */}
      {auditData && (
        <>
          {/* Live backend text */}
          <div
            className="w-full max-w-6xl p-3 rounded border mb-5 text-center"
            style={{ borderColor: "rgba(34, 197, 94, 0.3)", backgroundColor: "rgba(34, 197, 94, 0.06)" }}
          >
            <p className="text-xs font-medium" style={{ color: "#22c55e" }}>
              All approvals, denials, and executions shown here are generated by the live backend. The blocked state is a real server-side rejection, not a UI animation.
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-5 w-full max-w-6xl mb-10">
            {/* Left: Action Summary */}
            <div
              className="w-full lg:flex-1 p-5 rounded border"
              style={{ borderColor: "rgba(184, 150, 62, 0.3)", backgroundColor: "rgba(255, 255, 255, 0.03)" }}
            >
              <p className="text-xs font-semibold mb-4" style={{ color: "#b8963e" }}>
                ACTION SUMMARY
              </p>
              <div className="space-y-2.5">
                {actionSummary.map((item, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span style={{ color: "#9ca3af" }}>{item.label}</span>
                    <span style={{ color: "#ffffff" }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Center: System Audit Log */}
            <div
              className="w-full lg:flex-1 p-5 rounded border overflow-x-auto"
              style={{ borderColor: "rgba(184, 150, 62, 0.3)", backgroundColor: "rgba(0, 0, 0, 0.25)", fontFamily: "monospace" }}
            >
              <p className="text-xs font-semibold mb-4" style={{ color: "#b8963e", fontFamily: "'Outfit', sans-serif" }}>
                SYSTEM AUDIT LOG (live)
              </p>
              <div className="space-y-1.5">
                {auditData.log.map((entry, index) => (
                  <p key={index} className="text-xs" style={{ color: entry.includes("BLOCKED") ? "#ef4444" : entry.includes("EXECUTED") || entry.includes("AUTHORIZED") ? "#22c55e" : "#d1d5db" }}>
                    {entry}
                  </p>
                ))}
              </div>
            </div>

            {/* Right: Receipt & Ledger Record */}
            <div
              className="w-full lg:flex-1 p-5 rounded border overflow-x-auto"
              style={{ borderColor: "rgba(184, 150, 62, 0.3)", backgroundColor: "rgba(184, 150, 62, 0.08)" }}
            >
              <p className="text-xs font-semibold mb-3" style={{ color: "#b8963e" }}>
                RECEIPT & LEDGER RECORD
              </p>

              {receipt && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium" style={{ color: "#b8963e" }}>CRYPTOGRAPHIC RECEIPT (v2)</p>
                    <span className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                      {receipt.verification_status === "verified" ? "VERIFIED" : String(receipt.verification_status ?? "—").toUpperCase()}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs font-mono mb-4" style={{ color: "#d1d5db" }}>
                    <div><span style={{ color: "#6b7280" }}>receipt_id: </span>{receipt.receipt_id}</div>
                    <div><span style={{ color: "#6b7280" }}>intent_hash: </span><span style={{ color: "#b8963e" }}>{String(receipt.intent_hash ?? "").slice(0, 20)}...</span></div>
                    <div><span style={{ color: "#6b7280" }}>action_hash: </span><span style={{ color: "#b8963e" }}>{String(receipt.action_hash ?? "").slice(0, 20)}...</span></div>
                    <div><span style={{ color: "#6b7280" }}>verification_hash: </span><span style={{ color: "#22c55e" }}>{String(receipt.verification_hash ?? "").slice(0, 20)}...</span></div>
                    <div><span style={{ color: "#6b7280" }}>receipt_hash: </span>{String(receipt.receipt_hash ?? "").slice(0, 20)}...</div>
                    <div className="pt-1 border-t" style={{ borderColor: "rgba(107,114,128,0.2)" }}>
                      <span style={{ color: "#6b7280" }}>decision: </span><span style={{ color: "#22c55e" }}>{receipt.decision}</span>
                    </div>
                    <div><span style={{ color: "#6b7280" }}>risk: </span><span style={{ color: "#eab308" }}>{receipt.risk_level} ({receipt.risk_score})</span></div>
                    <div><span style={{ color: "#6b7280" }}>policy: </span>{receipt.policy_decision} ({receipt.policy_rule_id})</div>
                    <div><span style={{ color: "#6b7280" }}>signature: </span>{String(receipt.signature ?? "").slice(0, 20)}...</div>
                    <div><span style={{ color: "#6b7280" }}>protocol: </span><span style={{ color: "#3b82f6" }}>{receipt.protocol_version ?? "v2"}</span></div>
                  </div>
                </>
              )}

              {ledgerEntry && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium" style={{ color: "#b8963e" }}>LEDGER ENTRY (v2 hash-chain)</p>
                    <span className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>v2</span>
                  </div>
                  <div className="space-y-1 text-xs font-mono" style={{ color: "#d1d5db" }}>
                    <div><span style={{ color: "#6b7280" }}>block_id: </span>{ledgerEntry.block_id}</div>
                    <div><span style={{ color: "#6b7280" }}>receipt_hash: </span><span style={{ color: "#b8963e" }}>{String(ledgerEntry.receipt_hash ?? "").slice(0, 20)}...</span></div>
                    <div><span style={{ color: "#6b7280" }}>previous_hash: </span>{String(ledgerEntry.previous_hash ?? "").slice(0, 20)}...</div>
                    <div><span style={{ color: "#6b7280" }}>current_hash: </span><span style={{ color: "#22c55e" }}>{String(ledgerEntry.current_hash ?? "").slice(0, 20)}...</span></div>
                    <div><span style={{ color: "#6b7280" }}>ledger_signature: </span>{String(ledgerEntry.ledger_signature ?? "").slice(0, 20)}...</div>
                    <div><span style={{ color: "#6b7280" }}>protocol: </span><span style={{ color: "#3b82f6" }}>{ledgerEntry.protocol_version ?? "v2"}</span></div>
                    <div><span style={{ color: "#6b7280" }}>timestamp: </span>{ledgerEntry.timestamp}</div>
                    <div><span style={{ color: "#6b7280" }}>recorded_by: </span>{ledgerEntry.recorded_by}</div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Copy Receipt JSON button */}
          {auditData && auditData.receipts.length > 0 && (
            <div className="flex flex-col items-center mb-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(auditData.receipts[0], null, 2)).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
                className="py-2 px-6 text-xs font-medium border rounded transition-colors duration-200 hover:bg-white/5"
                style={{ borderColor: "#b8963e", color: "#b8963e", backgroundColor: "transparent" }}
              >
                {copied ? "\u2713 Copied to Clipboard" : "Copy Receipt JSON"}
              </button>
              <p className="text-[10px] mt-2 mb-2 text-center" style={{ color: "#6b7280" }}>
                Paste into the <a href="/verify" className="underline" style={{ color: "#b8963e" }}>Verify Receipt</a> tool or any LLM to independently verify authenticity.
              </p>
              <ReceiptExport receipt={auditData.receipts[0] as Record<string, any>} />
            </div>
          )}

          {/* Run again button */}
          <div className="flex justify-center mb-10">
            <button
              onClick={handleRunAudit}
              disabled={loading}
              className="py-2 px-4 sm:px-6 text-xs sm:text-sm font-medium border rounded transition-colors duration-200 hover:bg-white/5 disabled:opacity-50"
              style={{ borderColor: "#9ca3af", color: "#9ca3af", backgroundColor: "transparent" }}
            >
              {loading ? "Running..." : "Generate New Audit Trail"}
            </button>
            <button
              onClick={() => { setAuditData(null); setError(null); }}
              className="py-2 px-4 sm:px-6 text-xs sm:text-sm font-medium border rounded transition-colors duration-200 hover:bg-white/5"
              style={{ borderColor: "#b8963e", color: "#b8963e", backgroundColor: "transparent" }}
            >
              Reset Demo
            </button>
          </div>
        </>
      )}

      {/* What this means */}
      <div
        className="w-full max-w-4xl p-4 sm:p-6 rounded border text-center mb-6"
        style={{ borderColor: "rgba(184, 150, 62, 0.3)", backgroundColor: "rgba(255, 255, 255, 0.03)" }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: "#b8963e" }}>
          What this means
        </h2>
        <div className="space-y-2">
          {WHAT_THIS_MEANS.map((item, index) => (
            <p key={index} className="text-sm leading-relaxed" style={{ color: "#d1d5db" }}>
              {item}
            </p>
          ))}
        </div>
      </div>

      {/* Grounding Statements */}
      <div
        className="w-full max-w-4xl p-4 sm:p-6 rounded border text-center"
        style={{ borderColor: "rgba(184, 150, 62, 0.2)", backgroundColor: "rgba(255, 255, 255, 0.02)" }}
      >
        <div className="space-y-3">
          {GROUNDING_STATEMENTS.map((statement, index) => (
            <p key={index} className="text-sm leading-relaxed italic" style={{ color: "#9ca3af" }}>
              {statement}
            </p>
          ))}
        </div>
      </div>

      {/* Back to landing */}
      <div className="flex flex-wrap gap-3 sm:gap-4 mt-6 sm:mt-10">
        <a href="/" className="text-sm font-light tracking-wide hover:underline flex items-center" style={{ color: "#9ca3af" }}>
          ← Back to Home
        </a>
      </div>
      </div>
    </div>
  );
}
