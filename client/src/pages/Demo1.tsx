/*
 * Demo 1 — Human Approval Story
 *
 * Changes from user feedback:
 *   - Receipt is a real JSON object with receipt_id, action, timestamps, decision, signature, hash
 *   - Scenario text updated: "end of quarter, AI drafts email to your team"
 *   - Step 2 shows a fake phone notification in the right panel
 *   - Copy Receipt button centered in middle of page
 *   - "What this means" text centered, "CANNOT" in bold, "records every approval and denial" in bold
 */

import { useState } from "react";

const RECEIPT_JSON = {
  receipt_id: "rio-rcpt-20260322-0047a3",
  action: "send_email",
  subject: "Q1 Quarterly Report",
  requested_by: "ai-agent-7b",
  requested_at: "2026-03-22T14:32:01.000Z",
  decision: "APPROVED",
  decided_by: "human-operator",
  decided_at: "2026-03-22T14:33:18.000Z",
  executed_at: "2026-03-22T14:33:19.042Z",
  signature: "a4f8c1d9e2b7...3f6a0e1d",
  hash: "sha256:9c1b7e4d...f2a8d03b",
  immutable: true,
  verifiable: true,
};

const STEPS = [
  {
    button: "Step 1 — AI Drafts Email",
    text: "The AI agent drafts an email and, trying to be helpful, intends to send it. Because sending an email is a real-world action, execution is blocked pending human approval. The system records the action request.",
  },
  {
    button: "Step 2 — Human Notified",
    text: null, // Special rendering for phone notification
  },
  {
    button: "Step 3 — Human Decision",
    text: "The human can approve, deny, or request more information. If denied, no action is taken. The system records the denial and creates a cryptographically signed, timestamped, immutable receipt. If approved, the system records the approval and authorizes execution.",
  },
  {
    button: "Step 4 — Action + Receipt",
    text: "If approved, the agent sends the email. The system records both the approval and the execution and creates a cryptographically signed, timestamped, immutable receipt as proof of authorization and execution.",
  },
];

function PhoneNotification() {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <p className="text-sm mb-6" style={{ color: "#9ca3af" }}>
        The system sends a notification to the human informing them that an action has been requested. The action cannot proceed without human approval. The system records that the human was notified.
      </p>
      {/* Fake phone notification */}
      <div
        className="w-72 rounded-xl overflow-hidden"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.08)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
        }}
      >
        {/* Notification header */}
        <div
          className="px-4 py-3 flex items-center gap-2"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}
        >
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold"
            style={{ backgroundColor: "#b8963e", color: "#0b1120" }}
          >
            R
          </div>
          <span className="text-xs font-semibold" style={{ color: "#b8963e" }}>
            RIO Notification
          </span>
          <span className="text-xs ml-auto" style={{ color: "#6b7280" }}>
            now
          </span>
        </div>
        {/* Notification body */}
        <div className="px-4 py-3">
          <p className="text-xs mb-1" style={{ color: "#9ca3af" }}>
            AI requests approval:
          </p>
          <p className="text-sm font-medium mb-3" style={{ color: "#ffffff" }}>
            Send Quarterly Report Email
          </p>
          <div className="flex gap-2">
            <button
              className="flex-1 py-1.5 rounded text-xs font-medium"
              style={{ backgroundColor: "rgba(34, 197, 94, 0.2)", color: "#22c55e", border: "1px solid rgba(34, 197, 94, 0.3)" }}
            >
              Approve
            </button>
            <button
              className="flex-1 py-1.5 rounded text-xs font-medium"
              style={{ backgroundColor: "rgba(239, 68, 68, 0.2)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.3)" }}
            >
              Deny
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Demo1() {
  const [activeStep, setActiveStep] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleCopyReceipt = () => {
    navigator.clipboard.writeText(JSON.stringify(RECEIPT_JSON, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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

      {/* Scenario text */}
      <p className="text-base text-center max-w-2xl mb-10" style={{ color: "#d1d5db" }}>
        In this scenario, it's the end of quarter and your AI agent drafts an email and intends to send it to your team.
      </p>

      {/* Main layout: Left stepper + Right text panel */}
      <div className="flex flex-col md:flex-row gap-6 w-full max-w-4xl mb-10">
        {/* Left: Stepper navigation */}
        <div className="flex flex-col gap-3 w-full md:w-72 shrink-0">
          {STEPS.map((step, index) => (
            <button
              key={index}
              onClick={() => setActiveStep(index)}
              className="w-full py-3 px-4 text-left text-sm font-medium border rounded transition-colors duration-200"
              style={{
                backgroundColor: activeStep === index ? "rgba(184, 150, 62, 0.15)" : "transparent",
                borderColor: activeStep === index ? "#b8963e" : "rgba(184, 150, 62, 0.3)",
                color: activeStep === index ? "#b8963e" : "#ffffff",
              }}
            >
              {step.button}
            </button>
          ))}
        </div>

        {/* Right: Text panel */}
        <div
          className="flex-1 p-6 rounded border"
          style={{
            borderColor: "rgba(184, 150, 62, 0.3)",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
          }}
        >
          {activeStep === 1 ? (
            <PhoneNotification />
          ) : (
            <p className="text-base leading-relaxed" style={{ color: "#d1d5db" }}>
              {STEPS[activeStep].text}
            </p>
          )}
        </div>
      </div>

      {/* Receipt section — shown when Step 4 is active */}
      {activeStep === 3 && (
        <div
          className="w-full max-w-4xl p-6 rounded border mb-6"
          style={{
            borderColor: "rgba(184, 150, 62, 0.5)",
            backgroundColor: "rgba(184, 150, 62, 0.08)",
          }}
        >
          <pre
            className="text-xs leading-relaxed overflow-x-auto"
            style={{ color: "#d1d5db", fontFamily: "monospace" }}
          >
            {JSON.stringify(RECEIPT_JSON, null, 2)}
          </pre>
        </div>
      )}

      {/* Copy Receipt button — centered, shown when Step 4 is active */}
      {activeStep === 3 && (
        <div className="flex justify-center mb-10">
          <button
            onClick={handleCopyReceipt}
            className="py-2 px-8 text-sm font-medium border rounded transition-colors duration-200 hover:bg-white/5"
            style={{
              borderColor: "#b8963e",
              color: "#ffffff",
              backgroundColor: "transparent",
            }}
          >
            {copied ? "Copied" : "Copy Receipt"}
          </button>
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
          <p className="text-sm leading-relaxed" style={{ color: "#d1d5db" }}>
            AI can recommend, draft, and prepare actions.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#d1d5db" }}>
            AI <span className="font-bold text-white">CANNOT</span> execute real-world actions on its own.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#d1d5db" }}>
            The system requires human approval before any real-world action.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#d1d5db" }}>
            The system <span className="font-bold text-white">records every approval and denial</span> as a cryptographically signed, immutable receipt.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#d1d5db" }}>
            In this system, the AI acts as a trusted advisor, not an autonomous actor that can assume or interpret human intent.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#d1d5db" }}>
            The human remains in control of all real-world actions, and the system enforces that control.
          </p>
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
