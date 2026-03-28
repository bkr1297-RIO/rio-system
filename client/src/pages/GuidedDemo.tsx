import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";

/*
 * GuidedDemo — /demo
 *
 * A public, narrated, step-by-step walkthrough of the RIO governance loop.
 * No login or Google connection required. All data is simulated.
 * The story IS the product — narration text gets equal or more weight than visuals.
 *
 * Steps:
 *   1. Intro — what is this, why it matters
 *   2. Approval Request — AI wants to send an email
 *   3. Human Decision — Approve or Deny
 *   4. Execution Result — what happened
 *   5. Receipt — cryptographic proof
 *   6. Ledger — permanent record (Google Drive file)
 *   7. Verification — independent verification
 *   8. Bridge — connect Google or enter app
 */

// ── Simulated data ──────────────────────────────────────────────────────────
const SIMULATED_RECEIPT = {
  receipt_id: "RIO-7A3F9E2B",
  decision: "approved",
  risk: "HIGH",
  intent_hash: "a4c8e1f0b7d3926584e1c0f7a8b2d4e6f0123456789abcdef0123456789abcd",
  action_hash: "b5d9f2a1c8e4037695f2d1a8b9c3e5f7a1234567890bcdef1234567890bcde",
  verification_hash: "c6ea03b2d9f5148706a3e2b9cad4f6a8b2345678901cdef02345678901cdef",
  signature: "e7fb14c3ea064259817b4f3cadb5a7b9c3456789012def0123456789012def0...",
  protocol: "v2",
  timestamp: new Date().toISOString(),
  action: "send_email",
  connector: "Gmail",
};

const SIMULATED_LEDGER = {
  block_id: "BLK-3E8A7F1C",
  chain_hash: "d8ac25e4fb175360928c5a4dbce6b8cad4567890123ef01234567890123ef01",
  previous_hash: "0000000000000000000000000000000000000000000000000000000000000000",
};

const VERIFICATION_CHECKS = [
  { label: "Signature Valid", description: "The cryptographic signature matches the receipt content" },
  { label: "Hash Format Valid", description: "All three hashes are properly formatted SHA-256" },
  { label: "Ledger Recorded", description: "This receipt exists in the tamper-evident ledger" },
  { label: "Protocol Version", description: "Receipt follows RIO Protocol v2 specification" },
  { label: "Verification Status", description: "All integrity checks passed" },
];

// ── Step components ─────────────────────────────────────────────────────────

function StepIntro({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center max-w-2xl mx-auto">
      {/* Nutshell definition — THE VERY FIRST THING THEY SEE */}
      <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-center" style={{ color: "#ffffff" }}>
        What Is RIO?
      </h2>
      <p className="text-lg sm:text-xl leading-relaxed text-center mb-6" style={{ color: "#e5e7eb" }}>
        A governed assistant that can take <strong style={{ color: "#b8963e" }}>real-world actions</strong> for you
        — but <strong style={{ color: "#ffffff" }}>only with your approval</strong>. It keeps a{" "}
        <strong style={{ color: "#ffffff" }}>permanent record</strong> of what it did, and it can{" "}
        <strong style={{ color: "#22d3ee" }}>learn over time</strong>.
      </p>

      {/* What it can do — email is just one example — IMMEDIATELY VISIBLE */}
      <div
        className="w-full p-4 sm:p-6 rounded-xl border mb-6"
        style={{
          backgroundColor: "rgba(184,150,62,0.06)",
          borderColor: "rgba(184,150,62,0.25)",
        }}
      >
        <p className="text-base sm:text-lg leading-relaxed" style={{ color: "#d1d5db" }}>
          In this demo, you'll see an example using email — but email is just one way the system
          can act for you. It can also cancel services like unused or unwanted subscriptions, schedule
          meetings, submit requests, and follow up on important things. The key is that it{" "}
          <strong style={{ color: "#ffffff" }}>always asks before acting</strong> and{" "}
          <strong style={{ color: "#ffffff" }}>always keeps a record</strong>.
        </p>
        <p className="text-base sm:text-lg leading-relaxed mt-3 italic" style={{ color: "#b8963e" }}>
          If you had an assistant that worked this way, what would you want it to do for you?
        </p>
      </div>

      {/* Expanded context — below the fold is fine */}
      <div className="space-y-4 text-left w-full">
        <p className="text-sm sm:text-base leading-relaxed" style={{ color: "#9ca3af" }}>
          Imagine you have an AI assistant that manages your email, calendar, and files.
          It's smart. It's fast. But should it be able to{" "}
          <strong style={{ color: "#d1d5db" }}>send emails on your behalf without asking?</strong>{" "}
          Should it delete files or move money without your knowledge?
        </p>
        <p className="text-sm sm:text-base leading-relaxed" style={{ color: "#9ca3af" }}>
          Not every action carries the same risk — a routine calendar reminder is different from
          an email to a client or a financial transaction. As you and your assistant work together,
          you get to decide which actions need your explicit approval and which can proceed on their own.
          That relationship <strong style={{ color: "#d1d5db" }}>evolves over time as trust builds</strong>.
        </p>
        <p className="text-sm sm:text-base leading-relaxed" style={{ color: "#9ca3af" }}>
          RIO sits between your AI assistant and the real world. It makes sure the AI cannot take
          any real-world action without your explicit approval. And every decision — yours and the AI's
          — is permanently recorded with cryptographic proof.
        </p>
      </div>

      <button
        onClick={onNext}
        className="mt-8 py-4 px-10 text-lg font-semibold rounded-lg transition-all duration-200 hover:scale-[1.02]"
        style={{
          backgroundColor: "#b8963e",
          color: "#0a0e1a",
        }}
      >
        See It in Action →
      </button>
    </div>
  );
}

function StepApprovalRequest({ onNext }: { onNext: () => void }) {
  const [showPhone, setShowPhone] = useState(false);
  const [showCard, setShowCard] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowPhone(true), 400);
    const t2 = setTimeout(() => setShowCard(true), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="flex flex-col items-center max-w-2xl mx-auto">
      <div className="w-full text-left mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
            style={{ backgroundColor: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.3)" }}
          >
            📱
          </div>
          <h2 className="text-xl sm:text-2xl font-bold" style={{ color: "#ffffff" }}>
            You Get an Alert
          </h2>
        </div>
        <p className="text-base sm:text-lg leading-relaxed" style={{ color: "#d1d5db" }}>
          Your AI assistant has analyzed your tasks and wants to send an email on your behalf.
          But before it can do anything, <strong style={{ color: "#ffffff" }}>you get a notification</strong> —
          on your phone, on your computer, wherever you are. It tells you exactly what the AI wants to do,
          to whom, and why.
        </p>
      </div>

      {/* Phone notification mockup */}
      <div
        className={`w-full max-w-xs mx-auto mb-8 transition-all duration-700 ${
          showPhone ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
        }`}
      >
        <div
          className="rounded-[2rem] p-3 relative"
          style={{
            backgroundColor: "#1a1a2e",
            border: "3px solid #2a2a4a",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          {/* Phone notch */}
          <div
            className="w-24 h-5 rounded-full mx-auto mb-3"
            style={{ backgroundColor: "#0a0a1a" }}
          />
          {/* Phone screen */}
          <div className="rounded-xl p-4" style={{ backgroundColor: "#0f0f23" }}>
            {/* Status bar */}
            <div className="flex justify-between items-center mb-4 px-1">
              <span className="text-[10px] font-medium" style={{ color: "#6b7280" }}>
                {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <div className="flex gap-1">
                <div className="w-3 h-1.5 rounded-sm" style={{ backgroundColor: "#4ade80" }} />
                <div className="w-3 h-1.5 rounded-sm" style={{ backgroundColor: "#6b7280" }} />
              </div>
            </div>
            {/* Notification banner */}
            <div
              className={`rounded-xl p-3.5 transition-all duration-500 ${
                showPhone ? "opacity-100 scale-100" : "opacity-0 scale-95"
              }`}
              style={{
                backgroundColor: "rgba(184,150,62,0.12)",
                border: "1px solid rgba(184,150,62,0.3)",
                boxShadow: "0 4px 16px rgba(184,150,62,0.1)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">🤖</span>
                <span className="text-[11px] font-bold" style={{ color: "#b8963e" }}>BONDI</span>
                <span className="text-[10px] ml-auto" style={{ color: "#6b7280" }}>now</span>
              </div>
              <p className="text-xs font-semibold mb-1" style={{ color: "#ffffff" }}>
                Approval Needed: Send Email
              </p>
              <p className="text-[11px] leading-snug" style={{ color: "#9ca3af" }}>
                To jane@company.com — "Weekly Report Summary"
              </p>
              <div className="flex gap-2 mt-3">
                <div
                  className="flex-1 py-1.5 rounded-lg text-center text-[11px] font-semibold"
                  style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                >
                  Approve
                </div>
                <div
                  className="flex-1 py-1.5 rounded-lg text-center text-[11px] font-semibold"
                  style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }}
                >
                  Deny
                </div>
              </div>
            </div>
            {/* Placeholder content below notification */}
            <div className="mt-3 space-y-2 opacity-30">
              <div className="h-2 rounded-full w-3/4" style={{ backgroundColor: "#2a2a4a" }} />
              <div className="h-2 rounded-full w-1/2" style={{ backgroundColor: "#2a2a4a" }} />
              <div className="h-2 rounded-full w-2/3" style={{ backgroundColor: "#2a2a4a" }} />
            </div>
          </div>
          {/* Phone home indicator */}
          <div
            className="w-28 h-1 rounded-full mx-auto mt-3"
            style={{ backgroundColor: "#3a3a5a" }}
          />
        </div>
      </div>

      {/* Full approval card (desktop view) */}
      <div
        className={`w-full transition-all duration-700 ${showCard ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
      >
        <div
          className="rounded-xl p-6 border"
          style={{
            backgroundColor: "rgba(30,35,55,0.95)",
            borderColor: "rgba(184,150,62,0.4)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🤖</span>
              <span className="font-semibold text-sm" style={{ color: "#b8963e" }}>BONDI AI ASSISTANT</span>
            </div>
            <span
              className="text-xs font-bold px-3 py-1 rounded-full"
              style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}
            >
              APPROVAL REQUIRED
            </span>
          </div>

          <h3 className="text-lg font-bold mb-4" style={{ color: "#ffffff" }}>
            Wants to send an email
          </h3>

          <div
            className="rounded-lg p-4 mb-4 space-y-2"
            style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
          >
            <div className="flex gap-3">
              <span className="text-sm font-medium shrink-0" style={{ color: "#9ca3af" }}>To:</span>
              <span className="text-sm" style={{ color: "#e5e7eb" }}>jane@company.com</span>
            </div>
            <div className="flex gap-3">
              <span className="text-sm font-medium shrink-0" style={{ color: "#9ca3af" }}>Subject:</span>
              <span className="text-sm" style={{ color: "#e5e7eb" }}>Weekly Report Summary</span>
            </div>
            <div className="flex gap-3">
              <span className="text-sm font-medium shrink-0" style={{ color: "#9ca3af" }}>Body:</span>
              <span className="text-sm" style={{ color: "#e5e7eb" }}>
                Hi Jane, here's the weekly summary of project milestones and upcoming deadlines...
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <span
              className="text-xs font-bold px-2.5 py-1 rounded"
              style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#ef4444" }}
            >
              Risk: HIGH
            </span>
            <span className="text-xs" style={{ color: "#9ca3af" }}>
              This action sends a real email from your account
            </span>
          </div>

          <div
            className="p-3 rounded-lg text-center text-sm"
            style={{ backgroundColor: "rgba(184,150,62,0.08)", color: "#b8963e" }}
          >
            ⏳ Waiting for your decision...
          </div>
        </div>
      </div>

      <div className="w-full text-left mt-6">
        <p className="text-base leading-relaxed" style={{ color: "#9ca3af" }}>
          <strong style={{ color: "#d1d5db" }}>Nothing happens until you decide.</strong>{" "}
          The AI is paused. The email is not sent. RIO holds the action until you make your choice.
        </p>
      </div>

      <button
        onClick={onNext}
        className="mt-8 py-3 px-8 text-base font-semibold rounded-lg transition-all duration-200 hover:scale-[1.02]"
        style={{ backgroundColor: "#b8963e", color: "#0a0e1a" }}
      >
        Next: Make Your Decision →
      </button>
    </div>
  );
}

function StepDecision({ onDecide }: { onDecide: (decision: "approved" | "denied") => void }) {
  return (
    <div className="flex flex-col items-center max-w-2xl mx-auto">
      <div className="w-full text-left mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
            style={{ backgroundColor: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.3)" }}
          >
            👤
          </div>
          <h2 className="text-xl sm:text-2xl font-bold" style={{ color: "#ffffff" }}>
            This Is Your Decision
          </h2>
        </div>
        <p className="text-base sm:text-lg leading-relaxed mb-4" style={{ color: "#d1d5db" }}>
          You are the human in the loop. <strong style={{ color: "#ffffff" }}>Only you can authorize this action.</strong>{" "}
          Your AI assistant is capable, but it cannot act without your permission. This is the moment where
          you decide: should this email be sent?
        </p>
        <div
          className="p-4 rounded-lg border-l-4 mb-6"
          style={{ backgroundColor: "rgba(184,150,62,0.06)", borderColor: "#b8963e" }}
        >
          <p className="text-sm leading-relaxed" style={{ color: "#d1d5db" }}>
            If you <strong style={{ color: "#22c55e" }}>approve</strong>, the email will be sent and a permanent receipt will be created.
            If you <strong style={{ color: "#ef4444" }}>deny</strong>, the email will NOT be sent — the AI is blocked. Either way,
            your decision is recorded with cryptographic proof.
          </p>
        </div>
      </div>

      {/* Decision card */}
      <div
        className="w-full rounded-xl p-6 border"
        style={{
          backgroundColor: "rgba(30,35,55,0.95)",
          borderColor: "rgba(184,150,62,0.3)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
        }}
      >
        <p className="text-center text-sm mb-5" style={{ color: "#9ca3af" }}>
          Bondi AI wants to send an email to jane@company.com
        </p>
        <div className="flex gap-4">
          <button
            onClick={() => onDecide("approved")}
            className="flex-1 py-4 rounded-lg text-lg font-bold transition-all duration-200 hover:scale-[1.02] cursor-pointer"
            style={{
              backgroundColor: "rgba(34,197,94,0.15)",
              color: "#22c55e",
              border: "2px solid rgba(34,197,94,0.4)",
            }}
          >
            ✓ Approve
          </button>
          <button
            onClick={() => onDecide("denied")}
            className="flex-1 py-4 rounded-lg text-lg font-bold transition-all duration-200 hover:scale-[1.02] cursor-pointer"
            style={{
              backgroundColor: "rgba(239,68,68,0.15)",
              color: "#ef4444",
              border: "2px solid rgba(239,68,68,0.4)",
            }}
          >
            ✕ Deny
          </button>
        </div>
      </div>

      <p className="mt-6 text-sm text-center" style={{ color: "#6b7280" }}>
        Try both! You can replay the demo to see the other outcome.
      </p>
    </div>
  );
}

function StepResult({ decision, onNext }: { decision: "approved" | "denied"; onNext: () => void }) {
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowResult(true), 400);
    return () => clearTimeout(t);
  }, []);

  const isApproved = decision === "approved";

  return (
    <div className="flex flex-col items-center max-w-2xl mx-auto">
      <div className="w-full text-left mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
            style={{
              backgroundColor: isApproved ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
              border: `1px solid ${isApproved ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            }}
          >
            {isApproved ? "✓" : "✕"}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold" style={{ color: "#ffffff" }}>
            {isApproved ? "Action Executed" : "Action Blocked"}
          </h2>
        </div>
      </div>

      <div
        className={`w-full transition-all duration-500 ${showResult ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
      >
        {isApproved ? (
          <>
            <div
              className="w-full rounded-xl p-6 border mb-6"
              style={{
                backgroundColor: "rgba(34,197,94,0.06)",
                borderColor: "rgba(34,197,94,0.3)",
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">✉️</span>
                <span className="font-bold" style={{ color: "#22c55e" }}>Email Sent Successfully</span>
              </div>
              <p className="text-sm" style={{ color: "#d1d5db" }}>
                To: jane@company.com — Subject: "Weekly Report Summary"
              </p>
              <p className="text-xs mt-2" style={{ color: "#9ca3af" }}>
                Delivered via Gmail • {new Date().toLocaleString()}
              </p>
            </div>
            <div className="space-y-4 text-left">
              <p className="text-base sm:text-lg leading-relaxed" style={{ color: "#d1d5db" }}>
                The email was sent because <strong style={{ color: "#ffffff" }}>you authorized it</strong>.
                Your AI assistant executed the action only after receiving your explicit approval.
              </p>
              <p className="text-base leading-relaxed" style={{ color: "#d1d5db" }}>
                Not all emails carry the same risk. As you and your assistant build trust, you get to decide
                which actions require your explicit approval and which can proceed automatically — based on
                the recipient, the context, the content, and the stakes involved. A weekly team update might
                not need your sign-off, but an email to a new client or a message containing sensitive
                information always will. <strong style={{ color: "#ffffff" }}>This governance adapts to you</strong>,
                growing more nuanced as the working relationship deepens.
              </p>
              <p className="text-base leading-relaxed" style={{ color: "#d1d5db" }}>
                But here's what makes RIO different: the story doesn't end here.{" "}
                <strong style={{ color: "#b8963e" }}>A permanent, cryptographic receipt was created</strong> —
                proof of what was requested, when you approved it, and when it was executed.
              </p>
            </div>
          </>
        ) : (
          <>
            <div
              className="w-full rounded-xl p-6 border mb-6"
              style={{
                backgroundColor: "rgba(239,68,68,0.06)",
                borderColor: "rgba(239,68,68,0.3)",
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">🚫</span>
                <span className="font-bold" style={{ color: "#ef4444" }}>Action Blocked</span>
              </div>
              <p className="text-sm" style={{ color: "#d1d5db" }}>
                The email to jane@company.com was NOT sent.
              </p>
              <p className="text-xs mt-2" style={{ color: "#9ca3af" }}>
                Denied by human decision • {new Date().toLocaleString()}
              </p>
            </div>
            <div className="space-y-4 text-left">
              <p className="text-base sm:text-lg leading-relaxed" style={{ color: "#d1d5db" }}>
                The email was <strong style={{ color: "#ef4444" }}>not sent</strong>. Your AI assistant was blocked.
                RIO enforced your decision — <strong style={{ color: "#ffffff" }}>no approval means no action, ever</strong>.
                The recipient will never receive that email. Your assistant cannot override you, retry behind
                your back, or find a workaround. The system enforces the rules, not the AI.
              </p>
              <p className="text-base leading-relaxed" style={{ color: "#d1d5db" }}>
                This is called <strong style={{ color: "#b8963e" }}>fail-closed</strong> design. The system defaults to
                blocking the action. If you don't explicitly say yes, the answer is no.
              </p>
              <p className="text-base leading-relaxed" style={{ color: "#d1d5db" }}>
                And just like an approval, <strong style={{ color: "#ffffff" }}>your denial is permanently recorded</strong> with
                a cryptographic receipt — proof that the action was requested, that you reviewed it, and that
                you chose to block it. This matters for accountability: there is a clear record of what was
                asked and what you decided, whether the answer was yes or no.
              </p>
              <p className="text-base leading-relaxed" style={{ color: "#d1d5db" }}>
                Over time, as you and your assistant build trust, you can adjust which actions need your
                explicit approval. Maybe routine internal emails can go through automatically, while emails
                to new contacts or messages with attachments always require your sign-off. The governance
                <strong style={{ color: "#ffffff" }}> adapts to your comfort level</strong> — but the safety net is always there.
              </p>
            </div>
          </>
        )}
      </div>

      <button
        onClick={onNext}
        className="mt-8 py-3 px-8 text-base font-semibold rounded-lg transition-all duration-200 hover:scale-[1.02]"
        style={{ backgroundColor: "#b8963e", color: "#0a0e1a" }}
      >
        Next: See Your Receipt →
      </button>
    </div>
  );
}

function StepReceipt({ decision, onNext }: { decision: "approved" | "denied"; onNext: () => void }) {
  const receipt = {
    ...SIMULATED_RECEIPT,
    decision,
  };

  return (
    <div className="flex flex-col items-center max-w-2xl mx-auto">
      <div className="w-full text-left mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
            style={{ backgroundColor: "rgba(184,150,62,0.15)", border: "1px solid rgba(184,150,62,0.3)" }}
          >
            🧾
          </div>
          <h2 className="text-xl sm:text-2xl font-bold" style={{ color: "#ffffff" }}>
            Your Receipt
          </h2>
        </div>
        <p className="text-base sm:text-lg leading-relaxed" style={{ color: "#d1d5db" }}>
          This is your <strong style={{ color: "#b8963e" }}>cryptographic receipt</strong> — proof of exactly what happened.
          It records what action was requested, when you {decision === "approved" ? "approved" : "denied"} it,
          {decision === "approved" ? " when it was executed," : ""} and a tamper-proof signature.{" "}
          <strong style={{ color: "#ffffff" }}>This receipt cannot be forged or altered.</strong>
        </p>
      </div>

      {/* Receipt card */}
      <div
        className="w-full rounded-xl border overflow-hidden"
        style={{
          backgroundColor: "rgba(30,35,55,0.95)",
          borderColor: "rgba(184,150,62,0.3)",
        }}
      >
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ backgroundColor: "rgba(184,150,62,0.1)" }}
        >
          <span className="text-sm font-bold" style={{ color: "#b8963e" }}>RIO PROTOCOL RECEIPT</span>
          <span className="text-xs font-mono" style={{ color: "#9ca3af" }}>{receipt.receipt_id}</span>
        </div>

        <div className="p-5 space-y-4">
          {/* Hashes */}
          <div className="space-y-3">
            {[
              { label: "Intent Hash", hash: receipt.intent_hash, color: "#60a5fa", desc: "What was requested" },
              { label: "Action Hash", hash: receipt.action_hash, color: "#22c55e", desc: "What was done" },
              { label: "Verification Hash", hash: receipt.verification_hash, color: "#a78bfa", desc: "Proof it's authentic" },
            ].map((h) => (
              <div key={h.label} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: h.color }} />
                  <span className="text-xs font-medium" style={{ color: "#9ca3af" }}>{h.label}</span>
                  <span className="text-xs" style={{ color: "#6b7280" }}>— {h.desc}</span>
                </div>
                <code
                  className="text-xs font-mono pl-4 break-all"
                  style={{ color: h.color }}
                >
                  {h.hash}
                </code>
              </div>
            ))}
          </div>

          {/* Metadata */}
          <div
            className="rounded-lg p-4 space-y-2"
            style={{ backgroundColor: "rgba(0,0,0,0.25)" }}
          >
            {[
              { label: "Receipt ID", value: receipt.receipt_id },
              { label: "Decision", value: receipt.decision, color: receipt.decision === "approved" ? "#22c55e" : "#ef4444" },
              { label: "Risk", value: receipt.risk },
              { label: "Timestamp", value: new Date().toLocaleString() },
              { label: "Signature", value: receipt.signature },
              { label: "Protocol", value: receipt.protocol },
            ].map((m) => (
              <div key={m.label} className="flex gap-3">
                <span className="text-xs font-medium shrink-0 w-24" style={{ color: "#9ca3af" }}>{m.label}</span>
                <span
                  className="text-xs font-mono break-all"
                  style={{ color: m.color || "#e5e7eb" }}
                >
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full text-left mt-6">
        <p className="text-sm leading-relaxed" style={{ color: "#9ca3af" }}>
          Every field in this receipt is mathematically linked. If anyone changes even a single character,
          the hashes won't match and the tampering will be detected.
        </p>
      </div>

      <button
        onClick={onNext}
        className="mt-8 py-3 px-8 text-base font-semibold rounded-lg transition-all duration-200 hover:scale-[1.02]"
        style={{ backgroundColor: "#b8963e", color: "#0a0e1a" }}
      >
        Next: Where Is This Stored? →
      </button>
    </div>
  );
}

function StepLedger({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center max-w-2xl mx-auto">
      <div className="w-full text-left mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
            style={{ backgroundColor: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.3)" }}
          >
            📒
          </div>
          <h2 className="text-xl sm:text-2xl font-bold" style={{ color: "#ffffff" }}>
            Your Permanent Record
          </h2>
        </div>
        <p className="text-base sm:text-lg leading-relaxed" style={{ color: "#d1d5db" }}>
          Your receipt is now stored in a <strong style={{ color: "#22d3ee" }}>tamper-evident ledger</strong> —
          a chain of records where each entry is linked to the one before it. It's like a tamper-evident seal:
          if anyone tries to change a record, the chain breaks and the tampering is immediately detected.
        </p>
      </div>

      {/* Ledger visualization */}
      <div className="w-full space-y-3 mb-6">
        {/* Previous block (genesis) */}
        <div
          className="rounded-lg p-4 border"
          style={{ backgroundColor: "rgba(0,0,0,0.2)", borderColor: "rgba(107,114,128,0.3)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold" style={{ color: "#6b7280" }}>GENESIS BLOCK</span>
          </div>
          <code className="text-xs font-mono" style={{ color: "#6b7280" }}>
            0000000000000000000000000000000000000000...
          </code>
        </div>

        {/* Chain link arrow */}
        <div className="flex justify-center">
          <div className="flex flex-col items-center">
            <div className="w-0.5 h-4" style={{ backgroundColor: "rgba(34,211,238,0.4)" }} />
            <span style={{ color: "#22d3ee" }}>▼</span>
            <div className="w-0.5 h-4" style={{ backgroundColor: "rgba(34,211,238,0.4)" }} />
          </div>
        </div>

        {/* Current block */}
        <div
          className="rounded-lg p-4 border"
          style={{
            backgroundColor: "rgba(34,211,238,0.06)",
            borderColor: "rgba(34,211,238,0.3)",
            boxShadow: "0 0 20px rgba(34,211,238,0.1)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold" style={{ color: "#22d3ee" }}>YOUR ACTION</span>
            <span className="text-xs font-mono" style={{ color: "#9ca3af" }}>{SIMULATED_LEDGER.block_id}</span>
          </div>
          <div className="space-y-2">
            <div className="flex gap-3">
              <span className="text-xs font-medium shrink-0 w-24" style={{ color: "#9ca3af" }}>Chain Hash</span>
              <code className="text-xs font-mono break-all" style={{ color: "#22d3ee" }}>
                {SIMULATED_LEDGER.chain_hash}
              </code>
            </div>
            <div className="flex gap-3">
              <span className="text-xs font-medium shrink-0 w-24" style={{ color: "#9ca3af" }}>Previous</span>
              <code className="text-xs font-mono break-all" style={{ color: "#6b7280" }}>
                {SIMULATED_LEDGER.previous_hash}
              </code>
            </div>
          </div>
        </div>

        {/* Future blocks */}
        <div className="flex justify-center">
          <div className="flex flex-col items-center">
            <div className="w-0.5 h-4" style={{ backgroundColor: "rgba(34,211,238,0.2)" }} />
            <span style={{ color: "rgba(34,211,238,0.4)" }}>▼</span>
            <div className="w-0.5 h-4" style={{ backgroundColor: "rgba(34,211,238,0.2)" }} />
          </div>
        </div>

        <div
          className="rounded-lg p-4 border border-dashed"
          style={{ backgroundColor: "rgba(0,0,0,0.1)", borderColor: "rgba(107,114,128,0.2)" }}
        >
          <span className="text-xs" style={{ color: "#6b7280" }}>Next action will chain here...</span>
        </div>
      </div>

      <div
        className="w-full p-5 rounded-lg border-l-4 mb-4"
        style={{ backgroundColor: "rgba(34,211,238,0.06)", borderColor: "#22d3ee" }}
      >
        <div className="flex items-start gap-3">
          <span className="text-xl mt-0.5">📁</span>
          <div>
            <p className="text-base leading-relaxed" style={{ color: "#e5e7eb" }}>
              <strong style={{ color: "#22d3ee" }}>Your Google Drive keeps a copy.</strong>{" "}
              There is a file on your Google Drive where all your receipts are logged and filed for you.
              You can go back to it anytime — it's your permanent record of every action your AI assistant
              has taken, when it was approved, and by whom.
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={onNext}
        className="mt-6 py-3 px-8 text-base font-semibold rounded-lg transition-all duration-200 hover:scale-[1.02]"
        style={{ backgroundColor: "#b8963e", color: "#0a0e1a" }}
      >
        Next: Can You Verify This? →
      </button>
    </div>
  );
}

function StepVerification({ onNext }: { onNext: () => void }) {
  const [verifying, setVerifying] = useState(false);
  const [checksShown, setChecksShown] = useState(0);

  const startVerification = () => {
    setVerifying(true);
    setChecksShown(0);
  };

  useEffect(() => {
    if (!verifying) return;
    if (checksShown >= VERIFICATION_CHECKS.length) return;
    const t = setTimeout(() => setChecksShown((c) => c + 1), 600);
    return () => clearTimeout(t);
  }, [verifying, checksShown]);

  return (
    <div className="flex flex-col items-center max-w-2xl mx-auto">
      <div className="w-full text-left mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
            style={{ backgroundColor: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}
          >
            🔍
          </div>
          <h2 className="text-xl sm:text-2xl font-bold" style={{ color: "#ffffff" }}>
            Verify It Yourself
          </h2>
        </div>
        <p className="text-base sm:text-lg leading-relaxed" style={{ color: "#d1d5db" }}>
          Anyone — you, your company, an auditor, a regulator — can{" "}
          <strong style={{ color: "#ffffff" }}>independently verify any receipt at any time</strong>.
          The math proves it's authentic. No trust required — just verification.
        </p>
      </div>

      {!verifying ? (
        <button
          onClick={startVerification}
          className="w-full py-4 rounded-lg text-lg font-bold transition-all duration-200 hover:scale-[1.01] cursor-pointer mb-6"
          style={{
            backgroundColor: "rgba(34,197,94,0.1)",
            color: "#22c55e",
            border: "2px solid rgba(34,197,94,0.3)",
          }}
        >
          🔍 Run Independent Verification
        </button>
      ) : (
        <div
          className="w-full rounded-xl p-5 border mb-6"
          style={{
            backgroundColor: "rgba(30,35,55,0.95)",
            borderColor: "rgba(34,197,94,0.3)",
          }}
        >
          <h3 className="text-sm font-bold mb-4" style={{ color: "#22c55e" }}>
            Independent Verification
          </h3>
          <div className="space-y-3">
            {VERIFICATION_CHECKS.map((check, i) => (
              <div
                key={check.label}
                className={`flex items-start gap-3 transition-all duration-300 ${i < checksShown ? "opacity-100" : "opacity-0"}`}
              >
                <span className="text-lg mt-0.5">✅</span>
                <div>
                  <span className="text-sm font-medium" style={{ color: "#22c55e" }}>{check.label}</span>
                  <p className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>{check.description}</p>
                </div>
              </div>
            ))}
          </div>
          {checksShown >= VERIFICATION_CHECKS.length && (
            <div
              className="mt-4 p-3 rounded-lg text-center"
              style={{ backgroundColor: "rgba(34,197,94,0.1)" }}
            >
              <span className="text-sm font-bold" style={{ color: "#22c55e" }}>
                ✓ All checks passed — this receipt is authentic
              </span>
            </div>
          )}
        </div>
      )}

      <div className="w-full text-left">
        <p className="text-sm leading-relaxed" style={{ color: "#9ca3af" }}>
          This verification runs the same cryptographic checks every time. The signature is validated against
          the receipt content, the hashes are confirmed as valid SHA-256 format, and the ledger chain is verified
          to be intact. If anything had been tampered with, these checks would fail.
        </p>
      </div>

      {checksShown >= VERIFICATION_CHECKS.length && (
        <button
          onClick={onNext}
          className="mt-8 py-3 px-8 text-base font-semibold rounded-lg transition-all duration-200 hover:scale-[1.02]"
          style={{ backgroundColor: "#b8963e", color: "#0a0e1a" }}
        >
          See What This Means →
        </button>
      )}
    </div>
  );
}

function StepBridge({ decision, sessionId }: { decision: "approved" | "denied"; sessionId: string }) {
  const [wishText, setWishText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const submitWish = trpc.demo.submitWish.useMutation({
    onSuccess: () => setSubmitted(true),
  });

  return (
    <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
      <div className="mb-8">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: "rgba(34,197,94,0.15)", border: "2px solid rgba(34,197,94,0.3)" }}
        >
          <span className="text-4xl">✓</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#ffffff" }}>
          You Just Completed the Full RIO Loop
        </h2>
      </div>

      {/* Summary */}
      <div className="w-full mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: "🤖", label: "AI Requested", desc: "Send an email" },
            { icon: "👤", label: `You ${decision === "approved" ? "Approved" : "Denied"}`, desc: decision === "approved" ? "Action authorized" : "Action blocked" },
            { icon: "🧾", label: "Receipt Created", desc: "Cryptographic proof" },
            { icon: "📒", label: "Ledger Recorded", desc: "Permanent, tamper-evident" },
            { icon: "📁", label: "Filed in Drive", desc: "Your personal record" },
            { icon: "🔍", label: "Verified", desc: "Independently confirmed" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
            >
              <span className="text-xl">{item.icon}</span>
              <div className="text-left">
                <span className="text-sm font-medium" style={{ color: "#e5e7eb" }}>{item.label}</span>
                <p className="text-xs" style={{ color: "#9ca3af" }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="w-full p-6 rounded-xl border mb-8"
        style={{
          backgroundColor: "rgba(184,150,62,0.06)",
          borderColor: "rgba(184,150,62,0.3)",
        }}
      >
        <h3 className="text-lg font-bold mb-3" style={{ color: "#b8963e" }}>
          Now Try It With Your Own Account
        </h3>
        <p className="text-base leading-relaxed mb-2" style={{ color: "#d1d5db" }}>
          You just saw how governed AI works. Every action approved. Every decision recorded. Every receipt verifiable.
        </p>
        <p className="text-base leading-relaxed" style={{ color: "#d1d5db" }}>
          Connect your Google account and see it work in real time — send a real email to yourself,
          create a calendar event, or save a file. All governed. All recorded.
        </p>
      </div>

      {/* What would you want it to do? */}
      <div
        className="w-full p-5 rounded-xl border mb-8"
        style={{
          backgroundColor: "rgba(255,255,255,0.02)",
          borderColor: "rgba(184,150,62,0.2)",
        }}
      >
        <p className="text-base font-medium mb-1" style={{ color: "#e5e7eb" }}>
          Now that you've seen how it works...
        </p>
        <p className="text-lg font-semibold mb-4 italic" style={{ color: "#b8963e" }}>
          If you had an assistant that worked this way, what would you want it to do for you?
        </p>
        {submitted ? (
          <div className="py-3 px-4 rounded-lg" style={{ backgroundColor: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
            <p className="text-sm font-medium" style={{ color: "#22c55e" }}>
              Thanks for sharing! We'd love to build that for you.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <textarea
              value={wishText}
              onChange={(e) => setWishText(e.target.value)}
              placeholder="e.g., Cancel unused subscriptions, follow up on unanswered emails, schedule meetings based on my priorities..."
              className="w-full p-3 rounded-lg text-sm leading-relaxed resize-none focus:outline-none focus:ring-2"
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#e5e7eb",
                minHeight: "80px",
              }}
              rows={3}
            />
            <button
              onClick={() => {
                if (wishText.trim()) {
                  submitWish.mutate({ sessionId, text: wishText.trim() });
                }
              }}
              disabled={!wishText.trim() || submitWish.isPending}
              className="self-end py-2 px-6 rounded-lg text-sm font-semibold transition-all duration-200 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              style={{
                backgroundColor: "#b8963e",
                color: "#0a0e1a",
              }}
            >
              {submitWish.isPending ? "Sending..." : "Share"}
            </button>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="w-full flex flex-col gap-3">
        <a
          href="/connect"
          className="w-full py-4 rounded-lg text-lg font-bold text-center transition-all duration-200 hover:scale-[1.01] block"
          style={{
            backgroundColor: "#b8963e",
            color: "#0a0e1a",
          }}
        >
          Connect Google Account
        </a>
        <a
          href="/app"
          className="w-full py-3 rounded-lg text-base font-semibold text-center transition-all duration-200 hover:bg-white/5 block"
          style={{
            color: "#d1d5db",
            border: "1.5px solid rgba(184,150,62,0.4)",
          }}
        >
          Enter App
        </a>
        <button
          onClick={() => window.location.reload()}
          className="w-full py-3 rounded-lg text-sm font-medium text-center transition-colors hover:bg-white/5 cursor-pointer"
          style={{ color: "#9ca3af" }}
        >
          Watch Demo Again
        </button>
      </div>
    </div>
  );
}

// ── Progress indicator ──────────────────────────────────────────────────────

const STEP_LABELS = [
  "Intro",
  "Alert",
  "Decide",
  "Result",
  "Receipt",
  "Ledger",
  "Verify",
  "Next",
];

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-0.5 sm:gap-2 mb-6 sm:mb-10 px-2">
      {STEP_LABELS.map((label, i) => {
        const isActive = i === step;
        const isComplete = i < step;
        return (
          <div key={label} className="flex items-center gap-0.5 sm:gap-2">
            <div className="flex flex-col items-center gap-0.5">
              <div
                className="w-5 h-5 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold transition-all duration-300"
                style={{
                  backgroundColor: isComplete
                    ? "rgba(34,197,94,0.2)"
                    : isActive
                    ? "rgba(184,150,62,0.2)"
                    : "rgba(255,255,255,0.05)",
                  border: `2px solid ${
                    isComplete ? "#22c55e" : isActive ? "#b8963e" : "rgba(255,255,255,0.1)"
                  }`,
                  color: isComplete ? "#22c55e" : isActive ? "#b8963e" : "#6b7280",
                }}
              >
                {isComplete ? "✓" : i + 1}
              </div>
              <span
                className="text-[10px] hidden sm:block"
                style={{ color: isActive ? "#b8963e" : isComplete ? "#22c55e" : "#6b7280" }}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div
                className="w-2 sm:w-8 h-0.5 rounded"
                style={{
                  backgroundColor: isComplete ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.08)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function GuidedDemo() {
  const [step, setStep] = useState(0);
  const [decision, setDecision] = useState<"approved" | "denied">("approved");

  // Stable session ID for tracking
  const [sessionId] = useState(() => {
    const stored = sessionStorage.getItem("rio_demo_session");
    if (stored) return stored;
    const id = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem("rio_demo_session", id);
    return id;
  });

  // Track step views
  const trackStep = trpc.demo.trackStep.useMutation();

  useEffect(() => {
    const label = STEP_LABELS[step] ?? "unknown";
    trackStep.mutate({
      sessionId,
      step,
      stepLabel: label.toLowerCase(),
      action: step === 7 ? "complete" : "view",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionId]);

  const handleDecide = (d: "approved" | "denied") => {
    // Track the decision action
    trackStep.mutate({
      sessionId,
      step: 2,
      stepLabel: "decide",
      action: d === "approved" ? "approve" : "deny",
    });
    setDecision(d);
    setStep(3);
  };

  // Scroll to top on step change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        fontFamily: "'Outfit', sans-serif",
        backgroundColor: "#0a0e1a",
      }}
    >
      {/* Header */}
      <div
        className="w-full px-4 sm:px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(184,150,62,0.15)" }}
      >
        <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio-logo-new_8049c497.png"
            alt="RIO"
            className="w-8 h-8"
          />
          <span className="text-lg font-bold" style={{ color: "#b8963e" }}>RIO</span>
          <span className="text-xs font-medium hidden sm:inline" style={{ color: "#6b7280" }}>
            See What RIO Makes Possible
          </span>
        </a>
        <a
          href="/app"
          className="text-xs font-medium py-1.5 px-4 rounded transition-colors hover:bg-white/5"
          style={{ color: "#9ca3af", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          Skip to App →
        </a>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 sm:px-6 py-8 sm:py-12">
        <ProgressBar step={step} />

        <div className="max-w-2xl mx-auto">
          {step === 0 && <StepIntro onNext={() => setStep(1)} />}
          {step === 1 && <StepApprovalRequest onNext={() => setStep(2)} />}
          {step === 2 && <StepDecision onDecide={handleDecide} />}
          {step === 3 && <StepResult decision={decision} onNext={() => setStep(4)} />}
          {step === 4 && <StepReceipt decision={decision} onNext={() => setStep(5)} />}
          {step === 5 && <StepLedger onNext={() => setStep(6)} />}
          {step === 6 && <StepVerification onNext={() => setStep(7)} />}
          {step === 7 && <StepBridge decision={decision} sessionId={sessionId} />}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-4 text-center" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <p className="text-xs" style={{ color: "#4b5563" }}>
          &copy; 2025–2026 RIO Protocol. All rights reserved.
        </p>
      </div>
    </div>
  );
}
