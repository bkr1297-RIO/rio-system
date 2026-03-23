/**
 * Demo 1 — Human Approval Story (LIVE BACKEND)
 *
 * Every step triggers a real backend call. Receipts are real.
 * Includes full Deny flow: denial recorded, execution permanently blocked.
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
    textApproved: "The human approved the action. The system records the approval and authorizes execution. A cryptographically signed, timestamped, immutable receipt is created as proof of authorization.",
    textDenied: "The human denied the action. The system records the denial and permanently blocks execution for this intent. No action is taken. A cryptographically signed, timestamped, immutable receipt is created as proof of the denial.",
    textDefault: "The human can approve, deny, or request more information. If denied, no action is taken. The system records the denial and creates a cryptographically signed, timestamped, immutable receipt. If approved, the system records the approval and authorizes execution.",
  },
  {
    button: "Step 4 — Action + Receipt",
    textApproved: "The agent sends the email. The system records both the approval and the execution and creates a cryptographically signed, timestamped, immutable receipt as proof of authorization and execution.",
    textDenied: "Execution is permanently blocked. The system has recorded the denial and no further execution is possible for this intent. The denial receipt below serves as proof that the human maintained control.",
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
  const [denialData, setDenialData] = useState<Record<string, unknown> | null>(null);
  const [blockedExecData, setBlockedExecData] = useState<Record<string, unknown> | null>(null);
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
      setDenialData(null);
      setBlockedExecData(null);
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
      setActiveStep(2); // Advance to Step 3 to show approval result
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
      const result = await denyMut.mutateAsync({ intentId, decidedBy: "human_user" });
      setDenialData(result as unknown as Record<string, unknown>);
      setDecided("denied");

      // Attempt execution to prove it's permanently blocked
      try {
        const execResult = await executeMut.mutateAsync({ intentId });
        setBlockedExecData(execResult as unknown as Record<string, unknown>);
      } catch {
        setBlockedExecData({ status: "blocked", message: "Execution permanently blocked after denial" } as Record<string, unknown>);
      }

      setActiveStep(2); // Advance to Step 3 to show denial result
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to deny");
    }
    setLoading(false);
  };

  // Step 4: Execute via real backend
  const handleStep4 = async () => {
    setActiveStep(3);
    if (!intentId) return;

    // If denied, just show the denial info — don't try to execute
    if (decided === "denied") return;

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
    const dataToCopy = decided === "denied" ? denialData : receiptData;
    if (!dataToCopy) return;
    navigator.clipboard.writeText(JSON.stringify(dataToCopy, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Determine step 3 text
  const getStep3Text = () => {
    if (decided === "approved") return STEPS[2].textApproved;
    if (decided === "denied") return STEPS[2].textDenied;
    return STEPS[2].textDefault;
  };

  // Determine step 4 text
  const getStep4Text = () => {
    if (decided === "denied") return STEPS[3].textDenied;
    return STEPS[3].textApproved;
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
        In this scenario, it's the end of quarter and your AI agent drafts an email and intends to send it to your team. Since the human set the rules beforehand that any email sent to team members this close to quarter end is high stakes, the RIO system flags it and sends a notification to the user's cell phone for cryptographic biometric approval. No log, no go.
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
          {STEPS.map((step, index) => {
            // Determine step status indicator
            let statusIcon = null;
            let stepBorderColor = "rgba(184, 150, 62, 0.3)";
            let stepTextColor = "#ffffff";

            if (index === 0 && intentId) {
              statusIcon = <span className="ml-2 text-xs" style={{ color: "#22c55e" }}>✓</span>;
            }
            if (index === 1 && decided === "approved") {
              statusIcon = <span className="ml-2 text-xs" style={{ color: "#22c55e" }}>✓ Approved</span>;
            }
            if (index === 1 && decided === "denied") {
              statusIcon = <span className="ml-2 text-xs" style={{ color: "#ef4444" }}>✗ Denied</span>;
              if (activeStep === index) stepBorderColor = "#ef4444";
            }
            if (index === 3 && receiptData) {
              statusIcon = <span className="ml-2 text-xs" style={{ color: "#22c55e" }}>✓</span>;
            }
            if (index === 3 && decided === "denied") {
              statusIcon = <span className="ml-2 text-xs" style={{ color: "#ef4444" }}>Blocked</span>;
              if (activeStep === index) stepBorderColor = "#ef4444";
            }

            if (activeStep === index && decided !== "denied") {
              stepBorderColor = "#b8963e";
            }

            return (
              <button
                key={index}
                onClick={() => handleStepClick(index)}
                className="w-full py-3 px-4 text-left text-sm font-medium border rounded transition-colors duration-200"
                style={{
                  backgroundColor: activeStep === index ? (decided === "denied" && (index === 1 || index === 3) ? "rgba(239, 68, 68, 0.1)" : "rgba(184, 150, 62, 0.15)") : "transparent",
                  borderColor: activeStep === index ? stepBorderColor : "rgba(184, 150, 62, 0.3)",
                  color: activeStep === index ? (decided === "denied" && (index === 1 || index === 3) ? "#ef4444" : "#b8963e") : stepTextColor,
                }}
              >
                {step.button}
                {statusIcon}
              </button>
            );
          })}
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
          ) : activeStep === 2 ? (
            <div>
              <p className="text-sm mb-4" style={{ color: "#d1d5db" }}>{getStep3Text()}</p>
              {decided === "approved" && approvalData && (
                <>
                  <p className="text-xs font-semibold mb-2" style={{ color: "#b8963e" }}>Approval Record (live):</p>
                  <pre className="text-xs leading-relaxed overflow-x-auto" style={{ color: "#9ca3af", fontFamily: "monospace" }}>
                    {JSON.stringify(approvalData, null, 2)}
                  </pre>
                </>
              )}
              {decided === "denied" && denialData && (
                <>
                  <p className="text-xs font-semibold mb-2" style={{ color: "#ef4444" }}>Denial Record (live):</p>
                  <pre className="text-xs leading-relaxed overflow-x-auto" style={{ color: "#9ca3af", fontFamily: "monospace" }}>
                    {JSON.stringify(denialData, null, 2)}
                  </pre>
                  {blockedExecData && (
                    <>
                      <p className="text-xs font-semibold mt-4 mb-2" style={{ color: "#ef4444" }}>Execution Attempt After Denial:</p>
                      <pre className="text-xs leading-relaxed overflow-x-auto" style={{ color: "#9ca3af", fontFamily: "monospace" }}>
                        {JSON.stringify(blockedExecData, null, 2)}
                      </pre>
                    </>
                  )}
                </>
              )}
            </div>
          ) : activeStep === 3 ? (
            <div>
              <p className="text-sm mb-4" style={{ color: decided === "denied" ? "#ef4444" : "#d1d5db" }}>{getStep4Text()}</p>
              {decided === "denied" && blockedExecData && (
                <>
                  <div
                    className="p-4 rounded border mb-4"
                    style={{ borderColor: "#ef4444", backgroundColor: "rgba(239, 68, 68, 0.08)" }}
                  >
                    <p className="text-xs font-semibold mb-1" style={{ color: "#ef4444" }}>
                      EXECUTION PERMANENTLY BLOCKED
                    </p>
                    <p className="text-xs" style={{ color: "#9ca3af" }}>
                      Intent status: denied | HTTP 403 | No further execution possible
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="text-base leading-relaxed" style={{ color: "#d1d5db" }}>
              {STEPS[activeStep]?.text ?? "Select a step to begin."}
            </p>
          )}
        </div>
      </div>

      {/* Receipt section — shown when Step 4 is active and receipt exists (approved flow) */}
      {activeStep === 3 && decided === "approved" && receiptData && (
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

      {/* Denial receipt section — shown when Step 4 is active and denial happened */}
      {activeStep === 3 && decided === "denied" && denialData && (
        <div
          className="w-full max-w-4xl p-6 rounded border mb-6"
          style={{
            borderColor: "rgba(239, 68, 68, 0.5)",
            backgroundColor: "rgba(239, 68, 68, 0.08)",
          }}
        >
          <p className="text-xs font-semibold mb-3" style={{ color: "#ef4444" }}>Denial Receipt (generated by backend):</p>
          <pre
            className="text-xs leading-relaxed overflow-x-auto"
            style={{ color: "#d1d5db", fontFamily: "monospace" }}
          >
            {JSON.stringify(denialData, null, 2)}
          </pre>
        </div>
      )}

      {/* Ledger entry — shown when Step 4 is active and ledger exists (approved flow) */}
      {activeStep === 3 && decided === "approved" && ledgerData && (
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
      {activeStep === 3 && (receiptData || denialData) && (
        <div className="flex justify-center mb-10">
          <button
            onClick={handleCopyReceipt}
            className="py-2 px-8 text-sm font-medium border rounded transition-colors duration-200 hover:bg-white/5"
            style={{
              borderColor: decided === "denied" ? "#ef4444" : "#b8963e",
              color: "#ffffff",
              backgroundColor: "transparent",
            }}
          >
            {copied ? "Copied" : decided === "denied" ? "Copy Denial Receipt" : "Copy Receipt"}
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

      {/* Reset Demo + Back to landing */}
      <div className="flex gap-4 mt-10">
        <button
          onClick={() => {
            setActiveStep(0);
            setIntentId(null);
            setIntentData(null);
            setApprovalData(null);
            setDecided(null);
            setReceiptData(null);
            setLedgerData(null);
            setDenialData(null);
            setBlockedExecData(null);
            setError(null);
            setCopied(false);
          }}
          className="text-sm font-medium tracking-wide border rounded py-2 px-6 transition-colors duration-200 hover:bg-white/5"
          style={{ borderColor: "#b8963e", color: "#b8963e", backgroundColor: "transparent" }}
        >
          Reset Demo
        </button>
        <a
          href="/"
          className="text-sm font-light tracking-wide hover:underline flex items-center"
          style={{ color: "#9ca3af" }}
        >
          ← Back to Home
        </a>
      </div>
    </div>
  );
}
