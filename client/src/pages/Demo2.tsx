/*
 * Demo 2 — How RIO Works (Enforcement View)
 *
 * From user JSON spec:
 *   - Same navy background
 *   - Top: RIO logo, title, subtitle
 *   - Description text about structural prevention
 *   - Left side: System diagram with boxes connected by arrows
 *   - Right side: Live system log that updates step-by-step
 *   - Navigation: "Next Step" button to move through the process
 *   - End of demo: structured JSON receipt + ledger block entry
 *   - Bottom summary box: "What this means"
 */

import { useState } from "react";

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

const LOG_ENTRIES = [
  "[14:32:10] INTENT_RECEIVED: send_email",
  "[14:32:10] POLICY_CHECK: approval_required = TRUE",
  "[14:32:10] EXECUTION_STATUS: BLOCKED",
  "[14:32:14] HUMAN_DECISION: APPROVED",
  "[14:32:14] SIGNATURE_CREATED",
  "[14:32:15] SIGNATURE_VERIFIED: TRUE",
  "[14:32:15] EXECUTION_STATUS: AUTHORIZED",
  "[14:32:16] ACTION_EXECUTED: send_email",
  "[14:32:16] LEDGER_ENTRY_CREATED",
];

const RECEIPT_JSON = {
  receipt_id: "rio-rcpt-20260322-00b7f2",
  action: "send_email",
  subject: "Q1 Quarterly Report",
  requested_by: "ai-agent-7b",
  requested_at: "2026-03-22T14:32:10.000Z",
  policy_check: "approval_required",
  decision: "APPROVED",
  decided_by: "human-operator",
  decided_at: "2026-03-22T14:32:14.000Z",
  signature_verified: true,
  executed_at: "2026-03-22T14:32:16.042Z",
  signature: "e7c2a1f8d4b6...9a3e0f2c",
  hash: "sha256:4b8e1c7f...d3a9f06e",
  immutable: true,
  verifiable: true,
};

const LEDGER_ENTRY = {
  block_index: 47,
  timestamp: "2026-03-22T14:32:16.042Z",
  turn_id: "turn-20260322-0047a3",
  action: "send_email",
  approval: "APPROVED",
  approved_by: "human-operator",
  execution: "COMPLETED",
  receipt_hash: "sha256:4b8e1c7f...d3a9f06e",
  previous_block_hash: "sha256:1a2b3c4d...e5f6a7b8",
  block_hash: "sha256:9f8e7d6c...b5a4c3d2",
};

const SUMMARY_ITEMS = [
  "The AI agent operates inside a governed system.",
  "The system allows the AI to generate, recommend, and prepare actions.",
  "The system structurally prevents the AI from executing real-world actions without human approval.",
  "This is not a guideline or a policy — execution is technically blocked unless approval is present.",
  "Humans define which actions require approval, and the system enforces those rules.",
];

// Map each log entry to which diagram box should be highlighted
const LOG_TO_BOX_INDEX = [0, 2, 3, 4, 5, 5, 6, 6, 7];

// Color for each log entry
function getLogColor(index: number): string {
  if (index === 2) return "#ef4444"; // BLOCKED = red
  if (index === 6) return "#22c55e"; // AUTHORIZED = green
  if (index === 7) return "#22c55e"; // EXECUTED = green
  return "#b8963e"; // gold for others
}

export default function Demo2() {
  const [currentStep, setCurrentStep] = useState(-1);
  const demoFinished = currentStep >= LOG_ENTRIES.length - 1;

  const handleNextStep = () => {
    if (currentStep < LOG_ENTRIES.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleReset = () => {
    setCurrentStep(-1);
  };

  // Determine which diagram boxes are "active" (highlighted) based on current step
  const activeBoxIndex = currentStep >= 0 ? LOG_TO_BOX_INDEX[currentStep] : -1;
  // Track all boxes that have been visited
  const visitedBoxes = new Set<number>();
  for (let i = 0; i <= currentStep; i++) {
    if (i >= 0) visitedBoxes.add(LOG_TO_BOX_INDEX[i]);
  }

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
      <p className="text-sm font-light tracking-[0.08em] mb-6" style={{ color: "#9ca3af" }}>
        Runtime Intelligence Orchestration
      </p>

      {/* Description text */}
      <p className="text-base text-center max-w-2xl mb-10" style={{ color: "#d1d5db" }}>
        In this scenario, we show what is happening behind the scenes. The agent is structurally
        unable to execute real-world actions without approval. Not policy. Not guidelines. Structure.
      </p>

      {/* Main layout: Left diagram + Right log */}
      <div className="flex flex-col md:flex-row gap-6 w-full max-w-5xl mb-6">
        {/* Left: System diagram */}
        <div className="w-full md:w-80 shrink-0 flex flex-col items-center gap-0">
          {DIAGRAM_BOXES.map((box, index) => {
            const isActive = index === activeBoxIndex;
            const isVisited = visitedBoxes.has(index);
            // Determine box border/bg color
            let borderColor = "rgba(184, 150, 62, 0.25)";
            let bgColor = "transparent";
            let textColor = "#6b7280";

            if (isActive) {
              // Special colors for BLOCKED (index 3 when step is 2) and EXECUTED (index 6 when step >= 7)
              if (index === 3 && currentStep === 2) {
                borderColor = "#ef4444";
                bgColor = "rgba(239, 68, 68, 0.12)";
                textColor = "#ef4444";
              } else if (index === 6 && currentStep >= 7) {
                borderColor = "#22c55e";
                bgColor = "rgba(34, 197, 94, 0.12)";
                textColor = "#22c55e";
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
                {/* Arrow connector (except before first box) */}
                {index > 0 && (
                  <div
                    className="w-px h-4"
                    style={{
                      backgroundColor: isVisited || isActive
                        ? "rgba(184, 150, 62, 0.5)"
                        : "rgba(184, 150, 62, 0.15)",
                    }}
                  />
                )}
                {index > 0 && (
                  <div
                    className="w-0 h-0 mb-1"
                    style={{
                      borderLeft: "5px solid transparent",
                      borderRight: "5px solid transparent",
                      borderTop: isVisited || isActive
                        ? "6px solid rgba(184, 150, 62, 0.5)"
                        : "6px solid rgba(184, 150, 62, 0.15)",
                    }}
                  />
                )}
                {/* Box */}
                <div
                  className="w-full py-2.5 px-4 text-center text-sm font-medium rounded border transition-all duration-300"
                  style={{
                    borderColor,
                    backgroundColor: bgColor,
                    color: textColor,
                  }}
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
          style={{
            borderColor: "rgba(184, 150, 62, 0.3)",
            backgroundColor: "rgba(0, 0, 0, 0.25)",
            fontFamily: "monospace",
          }}
        >
          <p className="text-xs font-semibold mb-3" style={{ color: "#b8963e" }}>
            SYSTEM LOG
          </p>
          <div className="space-y-1.5 min-h-[200px]">
            {LOG_ENTRIES.map((entry, index) => {
              if (index > currentStep) return null;
              return (
                <p
                  key={index}
                  className="text-xs"
                  style={{ color: getLogColor(index) }}
                >
                  {entry}
                </p>
              );
            })}
            {currentStep < 0 && (
              <p className="text-xs" style={{ color: "#4b5563" }}>
                Waiting for first step...
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Next Step / Reset button */}
      <div className="flex justify-center mb-10">
        {!demoFinished ? (
          <button
            onClick={handleNextStep}
            className="py-2.5 px-8 text-sm font-medium border rounded transition-colors duration-200 hover:bg-white/5"
            style={{
              borderColor: "#b8963e",
              color: "#ffffff",
              backgroundColor: "transparent",
            }}
          >
            Next Step
          </button>
        ) : (
          <button
            onClick={handleReset}
            className="py-2.5 px-8 text-sm font-medium border rounded transition-colors duration-200 hover:bg-white/5"
            style={{
              borderColor: "#9ca3af",
              color: "#9ca3af",
              backgroundColor: "transparent",
            }}
          >
            Reset Demo
          </button>
        )}
      </div>

      {/* Receipt + Ledger — shown when demo is finished */}
      {demoFinished && (
        <div className="w-full max-w-5xl flex flex-col md:flex-row gap-6 mb-10">
          {/* Receipt */}
          <div
            className="flex-1 p-5 rounded border"
            style={{
              borderColor: "rgba(184, 150, 62, 0.5)",
              backgroundColor: "rgba(184, 150, 62, 0.08)",
            }}
          >
            <p className="text-xs font-semibold mb-3" style={{ color: "#b8963e" }}>
              RECEIPT
            </p>
            <pre
              className="text-xs leading-relaxed overflow-x-auto"
              style={{ color: "#d1d5db", fontFamily: "monospace" }}
            >
              {JSON.stringify(RECEIPT_JSON, null, 2)}
            </pre>
          </div>

          {/* Ledger Entry */}
          <div
            className="flex-1 p-5 rounded border"
            style={{
              borderColor: "rgba(184, 150, 62, 0.5)",
              backgroundColor: "rgba(184, 150, 62, 0.08)",
            }}
          >
            <p className="text-xs font-semibold mb-3" style={{ color: "#b8963e" }}>
              LEDGER ENTRY
            </p>
            <pre
              className="text-xs leading-relaxed overflow-x-auto"
              style={{ color: "#d1d5db", fontFamily: "monospace" }}
            >
              {JSON.stringify(LEDGER_ENTRY, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Bottom summary box — centered text */}
      <div
        className="w-full max-w-4xl p-6 rounded border text-center"
        style={{
          borderColor: "rgba(184, 150, 62, 0.3)",
          backgroundColor: "rgba(255, 255, 255, 0.03)",
        }}
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
