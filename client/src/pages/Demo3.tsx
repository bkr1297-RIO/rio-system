/*
 * Demo 3 — Audit & Proof (Traceability)
 *
 * From user JSON spec:
 *   - Same navy background
 *   - Top: RIO logo, title, subtitle "Demo 3 — Audit & Proof (Traceability)"
 *   - Scenario text about audit trail
 *   - Three-panel layout:
 *     Left: Action Summary (key-value list)
 *     Center: System Audit Log (timestamped entries)
 *     Right: Receipt JSON + Ledger Block
 *   - "What this means" section
 *   - Grounding Statements section
 */

const ACTION_SUMMARY = [
  { label: "Action", value: "Send Email" },
  { label: "Requested By", value: "AI Agent" },
  { label: "Human Decision", value: "Approved" },
  { label: "Execution", value: "Completed" },
  { label: "Receipt ID", value: "RIO-88421A" },
  { label: "Status", value: "Recorded" },
];

const AUDIT_LOG = [
  "[14:32:10] INTENT_CREATED — AI Agent",
  "[14:32:10] INTENT_LOGGED — System",
  "[14:32:12] HUMAN_NOTIFICATION_SENT — System",
  "[14:32:18] HUMAN_DECISION_RECEIVED — Approved",
  "[14:32:18] DECISION_LOGGED — System",
  "[14:32:19] SIGNATURE_CREATED — System",
  "[14:32:20] SIGNATURE_VERIFIED — System",
  "[14:32:21] EXECUTION_AUTHORIZED — System",
  "[14:32:22] ACTION_EXECUTED — System",
  "[14:32:22] RECEIPT_CREATED — System",
  "[14:32:22] LEDGER_ENTRY_WRITTEN — System",
];

const RECEIPT_JSON = {
  receipt_id: "RIO-88421A",
  action: "send_email",
  requested_by: "AI_agent",
  approved_by: "human_user",
  decision: "approved",
  timestamp_request: "2026-03-22T14:32:10Z",
  timestamp_approval: "2026-03-22T14:32:18Z",
  timestamp_execution: "2026-03-22T14:32:22Z",
  signature: "MEUCIQDf...",
  hash: "0000a84f9c2b...",
  previous_hash: "91af02c4...",
};

const LEDGER_BLOCK = {
  block_id: "88421A",
  previous_hash: "91af02c4...",
  current_hash: "0000a84f9c2b...",
  timestamp: "2026-03-22T14:32:22Z",
  recorded_by: "RIO System",
};

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

export default function Demo3() {
  return (
    <div
      className="min-h-screen flex flex-col items-center px-6 py-10"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      {/* Top: Logo, Title, Subtitle */}
      <img
        src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio-logo-clean-v2-SiU5wPFa54dq7xdKJ7WP9y.webp"
        alt="RIO Logo"
        className="w-24 h-24 mb-4 rounded-full"
      />
      <h1
        className="text-4xl font-black tracking-[0.15em] mb-2"
        style={{ color: "#b8963e" }}
      >
        RIO
      </h1>
      <p className="text-sm font-light tracking-[0.08em] mb-2" style={{ color: "#9ca3af" }}>
        Runtime Intelligence Orchestration
      </p>
      <p className="text-base font-medium mb-6" style={{ color: "#b8963e" }}>
        Demo 3 — Audit & Proof (Traceability)
      </p>

      {/* Scenario text */}
      <p className="text-base text-center max-w-2xl mb-10" style={{ color: "#d1d5db" }}>
        This page shows the audit trail created by the system. Every request, decision, approval,
        and action is recorded and traceable.
      </p>

      {/* Three-panel layout */}
      <div className="flex flex-col lg:flex-row gap-5 w-full max-w-6xl mb-10">
        {/* Left: Action Summary */}
        <div
          className="flex-1 p-5 rounded border"
          style={{
            borderColor: "rgba(184, 150, 62, 0.3)",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
          }}
        >
          <p className="text-xs font-semibold mb-4" style={{ color: "#b8963e" }}>
            ACTION SUMMARY
          </p>
          <div className="space-y-2.5">
            {ACTION_SUMMARY.map((item, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span style={{ color: "#9ca3af" }}>{item.label}</span>
                <span style={{ color: "#ffffff" }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Center: System Audit Log */}
        <div
          className="flex-1 p-5 rounded border"
          style={{
            borderColor: "rgba(184, 150, 62, 0.3)",
            backgroundColor: "rgba(0, 0, 0, 0.25)",
            fontFamily: "monospace",
          }}
        >
          <p
            className="text-xs font-semibold mb-4"
            style={{ color: "#b8963e", fontFamily: "'Outfit', sans-serif" }}
          >
            SYSTEM AUDIT LOG
          </p>
          <div className="space-y-1.5">
            {AUDIT_LOG.map((entry, index) => (
              <p key={index} className="text-xs" style={{ color: "#d1d5db" }}>
                {entry}
              </p>
            ))}
          </div>
        </div>

        {/* Right: Receipt & Ledger Record */}
        <div
          className="flex-1 p-5 rounded border"
          style={{
            borderColor: "rgba(184, 150, 62, 0.3)",
            backgroundColor: "rgba(184, 150, 62, 0.08)",
          }}
        >
          <p className="text-xs font-semibold mb-3" style={{ color: "#b8963e" }}>
            RECEIPT & LEDGER RECORD
          </p>

          {/* Receipt */}
          <p className="text-xs font-medium mb-1.5" style={{ color: "#9ca3af" }}>
            Receipt
          </p>
          <pre
            className="text-xs leading-relaxed overflow-x-auto mb-4"
            style={{ color: "#d1d5db", fontFamily: "monospace" }}
          >
            {JSON.stringify(RECEIPT_JSON, null, 2)}
          </pre>

          {/* Ledger Block */}
          <p className="text-xs font-medium mb-1.5" style={{ color: "#9ca3af" }}>
            Ledger Block
          </p>
          <pre
            className="text-xs leading-relaxed overflow-x-auto"
            style={{ color: "#d1d5db", fontFamily: "monospace" }}
          >
            {JSON.stringify(LEDGER_BLOCK, null, 2)}
          </pre>
        </div>
      </div>

      {/* What this means */}
      <div
        className="w-full max-w-4xl p-6 rounded border text-center mb-6"
        style={{
          borderColor: "rgba(184, 150, 62, 0.3)",
          backgroundColor: "rgba(255, 255, 255, 0.03)",
        }}
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
        className="w-full max-w-4xl p-6 rounded border text-center"
        style={{
          borderColor: "rgba(184, 150, 62, 0.2)",
          backgroundColor: "rgba(255, 255, 255, 0.02)",
        }}
      >
        <div className="space-y-3">
          {GROUNDING_STATEMENTS.map((statement, index) => (
            <p
              key={index}
              className="text-sm leading-relaxed italic"
              style={{ color: "#9ca3af" }}
            >
              {statement}
            </p>
          ))}
        </div>
      </div>

      {/* Back to landing */}
      <a
        href="/"
        className="mt-10 text-sm font-light tracking-wide hover:underline"
        style={{ color: "#9ca3af" }}
      >
        ← Back to Home
      </a>
    </div>
  );
}
