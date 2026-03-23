/**
 * Demo 1 — Human Approval Story (LIVE BACKEND)
 *
 * Every step triggers a real backend call. Receipts are real.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";

const STEPS = [
  {
    button: "Step 1 — AI Drafts Email",
    text: "The AI agent drafts an email and, trying to be helpful, intends to send it. Because sending an email is a real-world action, execution is blocked pending human approval. The system records the action request.",
  },
  {
    button: "Step 2 — Human Notified",
    text: null, // Phone notification
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

function PhoneNotification({ onApprove, onDeny, decided }: { onApprove: () => void; onDeny: () => void; decided: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <p className="text-sm mb-6" style={{ color: "#9ca3af" }}>
        The system sends a notification to the human informing them that an action has been requested. The action cannot proceed without human approval. The system records that the human was notified.
      </p>
      <div
        className="w-72 rounded-xl overflow-hidden"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.08)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
        }}
      >
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
        <div className="px-4 py-3">
          <p className="text-xs mb-1" style={{ color: "#9ca3af" }}>
            AI requests approval:
          </p>
          <p className="text-sm font-medium mb-3" style={{ color: "#ffffff" }}>
            Send Quarterly Report Email
          </p>
          {decided ? (
            <p className="text-xs font-medium text-center py-1.5" style={{ color: decided === "approved" ? "#22c55e" : "#ef4444" }}>
              {decided === "approved" ? "✓ Approved" : "✗ Denied"}
            </p>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={onApprove}
                className="flex-1 py-1.5 rounded text-xs font-medium cursor-pointer"
                style={{ backgroundColor: "rgba(34, 197, 94, 0.2)", color: "#22c55e", border: "1px solid rgba(34, 197, 94, 0.3)" }}
              >
                Approve
              </button>
              <button
                onClick={onDeny}
                className="flex-1 py-1.5 rounded text-xs font-medium cursor-pointer"
                style={{ backgroundColor: "rgba(239, 68, 68, 0.2)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.3)" }}
              >
                Deny
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Demo1() {
  const [activeStep, setActiveStep] = useState(0);
  const [copied, setCopied] = useState(false);

  // Live state
  const [intentId, setIntentId] = useState<string | null>(null);
  const [intentData, setIntentData] = useState<Record<string, unknown> | null>(null);
  const [approvalData, setApprovalData] = useState<Record<string, unknown> | null>(null);
  const [decided, setDecided] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<Record<string, unknown> | null>(null);
  const [ledgerData, setLedgerData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createIntentMut = trpc.rio.createIntent.useMutation();
  const approveMut = trpc.rio.approve.useMutation();
  const denyMut = trpc.rio.deny.useMutation();
  const executeMut = trpc.rio.execute.useMutation();

  // Step 1: Create intent via real backend
  const handleStep1 = async () => {
    setActiveStep(0);
    setLoading(true);
    setError(null);
    try {
      const result = await createIntentMut.mutateAsync({
        action: "send_email",
        description: "Send Q1 Quarterly Report Email to team",
        requestedBy: "AI_agent",
      });
      setIntentId(result.intentId);
      setIntentData(result as unknown as Record<string, unknown>);
      setDecided(null);
      setApprovalData(null);
      setReceiptData(null);
      setLedgerData(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create intent");
    }
    setLoading(false);
  };

  // Step 2 actions: Approve or Deny
  const handleApprove = async () => {
    if (!intentId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await approveMut.mutateAsync({ intentId, decidedBy: "human_user" });
      setApprovalData(result as unknown as Record<string, unknown>);
      setDecided("approved");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to approve");
    }
    setLoading(false);
  };

  const handleDeny = async () => {
    if (!intentId) return;
    setLoading(true);
    setError(null);
    try {
      await denyMut.mutateAsync({ intentId, decidedBy: "human_user" });
      setDecided("denied");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to deny");
    }
    setLoading(false);
  };

  // Step 4: Execute via real backend
  const handleStep4 = async () => {
    setActiveStep(3);
    if (!intentId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await executeMut.mutateAsync({ intentId });
      if (result.allowed) {
        setReceiptData(result.receipt as unknown as Record<string, unknown>);
        setLedgerData(result.ledger_entry as unknown as Record<string, unknown>);
      } else {
        setError(result.message ?? "Execution blocked");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Execution failed");
    }
    setLoading(false);
  };

  const handleStepClick = (index: number) => {
    if (index === 0) {
      handleStep1();
    } else if (index === 3) {
      handleStep4();
    } else {
      setActiveStep(index);
    }
  };

  const handleCopyReceipt = () => {
    if (!receiptData) return;
    navigator.clipboard.writeText(JSON.stringify(receiptData, null, 2)).then(() => {
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

      {/* Error display */}
      {error && (
        <div className="w-full max-w-4xl mb-4 p-3 rounded border text-sm" style={{ borderColor: "#ef4444", backgroundColor: "rgba(239, 68, 68, 0.1)", color: "#ef4444" }}>
          {error}
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="w-full max-w-4xl mb-4 text-center text-sm" style={{ color: "#b8963e" }}>
          Communicating with backend...
        </div>
      )}

      {/* Main layout: Left stepper + Right text panel */}
      <div className="flex flex-col md:flex-row gap-6 w-full max-w-4xl mb-10">
        {/* Left: Stepper navigation */}
        <div className="flex flex-col gap-3 w-full md:w-72 shrink-0">
          {STEPS.map((step, index) => (
            <button
              key={index}
              onClick={() => handleStepClick(index)}
              className="w-full py-3 px-4 text-left text-sm font-medium border rounded transition-colors duration-200"
              style={{
                backgroundColor: activeStep === index ? "rgba(184, 150, 62, 0.15)" : "transparent",
                borderColor: activeStep === index ? "#b8963e" : "rgba(184, 150, 62, 0.3)",
                color: activeStep === index ? "#b8963e" : "#ffffff",
              }}
            >
              {step.button}
              {/* Status indicators */}
              {index === 0 && intentId && <span className="ml-2 text-xs" style={{ color: "#22c55e" }}>✓</span>}
              {index === 1 && decided && <span className="ml-2 text-xs" style={{ color: decided === "approved" ? "#22c55e" : "#ef4444" }}>{decided === "approved" ? "✓" : "✗"}</span>}
              {index === 3 && receiptData && <span className="ml-2 text-xs" style={{ color: "#22c55e" }}>✓</span>}
            </button>
          ))}
        </div>

        {/* Right: Text panel */}
        <div
          className="flex-1 p-6 rounded border"
          style={{
            borderColor: "rgba(184, 150, 62, 0.3)",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            minHeight: "200px",
          }}
        >
          {activeStep === 1 ? (
            <PhoneNotification onApprove={handleApprove} onDeny={handleDeny} decided={decided} />
          ) : activeStep === 0 && intentData ? (
            <div>
              <p className="text-sm mb-4" style={{ color: "#d1d5db" }}>{STEPS[0].text}</p>
              <p className="text-xs font-semibold mb-2" style={{ color: "#b8963e" }}>Live Backend Response:</p>
              <pre className="text-xs leading-relaxed overflow-x-auto" style={{ color: "#9ca3af", fontFamily: "monospace" }}>
                {JSON.stringify(intentData, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="text-base leading-relaxed" style={{ color: "#d1d5db" }}>
              {STEPS[activeStep].text}
            </p>
          )}
        </div>
      </div>

      {/* Receipt section — shown when Step 4 is active and receipt exists */}
      {activeStep === 3 && receiptData && (
        <div
          className="w-full max-w-4xl p-6 rounded border mb-6"
          style={{
            borderColor: "rgba(184, 150, 62, 0.5)",
            backgroundColor: "rgba(184, 150, 62, 0.08)",
          }}
        >
          <p className="text-xs font-semibold mb-3" style={{ color: "#b8963e" }}>Live Receipt (generated by backend):</p>
          <pre
            className="text-xs leading-relaxed overflow-x-auto"
            style={{ color: "#d1d5db", fontFamily: "monospace" }}
          >
            {JSON.stringify(receiptData, null, 2)}
          </pre>
        </div>
      )}

      {/* Ledger entry — shown when Step 4 is active and ledger exists */}
      {activeStep === 3 && ledgerData && (
        <div
          className="w-full max-w-4xl p-6 rounded border mb-6"
          style={{
            borderColor: "rgba(255, 255, 255, 0.2)",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
          }}
        >
          <p className="text-xs font-semibold mb-3" style={{ color: "#ffffff" }}>Ledger Entry:</p>
          <pre
            className="text-xs leading-relaxed overflow-x-auto"
            style={{ color: "#9ca3af", fontFamily: "monospace" }}
          >
            {JSON.stringify(ledgerData, null, 2)}
          </pre>
        </div>
      )}

      {/* Copy Receipt button — centered */}
      {activeStep === 3 && receiptData && (
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
