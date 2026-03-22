/*
 * Demo 1 — Human Approval Story
 *
 * From user JSON spec:
 *   - Same navy background as landing page
 *   - Top: RIO logo, title, subtitle
 *   - Below subtitle: scenario text
 *   - Left side: Stepper navigation with 4 vertical step buttons
 *   - Right side: Text box that changes based on which step is clicked
 *   - Receipt section after Step 4
 *   - Bottom summary box: "What this means"
 *   - This is a story demo, not a technical dashboard
 */

import { useState } from "react";

const STEPS = [
  {
    button: "Step 1 — AI Drafts Email",
    text: "The AI agent drafts an email and, trying to be helpful, intends to send it. Because sending an email is a real-world action, execution is blocked pending human approval. The system records the action request.",
  },
  {
    button: "Step 2 — Human Notified",
    text: "The system sends a notification to the human informing them that an action has been requested. The action cannot proceed without human approval. The system records that the human was notified.",
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

const SUMMARY_ITEMS = [
  "AI can recommend, draft, and prepare actions.",
  "AI cannot execute real-world actions on its own.",
  "The system requires human approval before any real-world action.",
  "The system records every approval or denial as a cryptographically signed, immutable receipt.",
  "In this system, the AI acts as a trusted advisor, not an autonomous actor that can assume or interpret human intent.",
  "The human remains in control of all real-world actions, and the system enforces that control.",
];

export default function Demo1() {
  const [activeStep, setActiveStep] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleCopyReceipt = () => {
    const receiptText =
      "This receipt is cryptographically signed, timestamped, and recorded as an immutable record. It can be independently verified by another system or AI model.";
    navigator.clipboard.writeText(receiptText).then(() => {
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
        In this scenario, an AI drafts an email and intends to send it.
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
          <p className="text-base leading-relaxed" style={{ color: "#d1d5db" }}>
            {STEPS[activeStep].text}
          </p>
        </div>
      </div>

      {/* Receipt section — shown when Step 4 is active */}
      {activeStep === 3 && (
        <div
          className="w-full max-w-4xl p-6 rounded border mb-10"
          style={{
            borderColor: "rgba(184, 150, 62, 0.5)",
            backgroundColor: "rgba(184, 150, 62, 0.08)",
          }}
        >
          <p className="text-sm leading-relaxed mb-4" style={{ color: "#d1d5db" }}>
            This receipt is cryptographically signed, timestamped, and recorded as an immutable
            record. It can be independently verified by another system or AI model.
          </p>
          <button
            onClick={handleCopyReceipt}
            className="py-2 px-5 text-sm font-medium border rounded transition-colors duration-200 hover:bg-white/5"
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

      {/* Bottom summary box */}
      <div
        className="w-full max-w-4xl p-6 rounded border"
        style={{
          borderColor: "rgba(184, 150, 62, 0.3)",
          backgroundColor: "rgba(255, 255, 255, 0.03)",
        }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: "#b8963e" }}>
          What this means
        </h2>
        <ul className="space-y-2">
          {SUMMARY_ITEMS.map((item, index) => (
            <li key={index} className="text-sm leading-relaxed" style={{ color: "#d1d5db" }}>
              {item}
            </li>
          ))}
        </ul>
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
