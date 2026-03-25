import NavBar from "@/components/NavBar";
import {
  Inbox,
  Tags,
  FileText,
  ShieldCheck,
  KeyRound,
  DoorOpen,
  Receipt,
  BookOpen,
  ArrowDown,
} from "lucide-react";

const stages = [
  {
    num: 1,
    title: "Intake",
    icon: Inbox,
    description:
      "The AI agent or automated system submits a raw action request. The system assigns a unique request ID, records the timestamp, and verifies the requester's identity against the IAM registry. Unknown or inactive users are rejected immediately.",
    input: "Raw request with user_id, action, parameters",
    output: "Validated Request object with unique ID and resolved role",
  },
  {
    num: 2,
    title: "Classification",
    icon: Tags,
    description:
      "The system identifies the action type (e.g., transfer_funds, send_email, delete_data) and assigns an initial risk category — LOW, MEDIUM, HIGH, or CRITICAL — based on the action and the requester's role. Classification does not make policy decisions; it provides inputs for the engines that do.",
    input: "Validated Request object",
    output: "Action type classification and initial risk category",
  },
  {
    num: 3,
    title: "Structured Intent",
    icon: FileText,
    description:
      "The request is converted into a machine-readable canonical intent. Required fields are validated against the action schema. A SHA-256 intent hash is computed, binding the exact parameters to a unique fingerprint. This hash follows the intent through every subsequent stage.",
    input: "Classified request",
    output: "Canonical intent object with intent_id and intent_hash",
  },
  {
    num: 4,
    title: "Policy & Risk Evaluation",
    icon: ShieldCheck,
    description:
      "The Policy Engine evaluates the intent against active rules, returning ALLOW, BLOCK, or REQUIRE_APPROVAL. The Risk Engine computes a numeric score from four components: base risk (action type), role modifier (requester's role), amount modifier (financial or data volume), and target modifier (sensitivity of the target system).",
    input: "Canonical intent",
    output: "Policy decision + risk score + risk breakdown",
  },
  {
    num: 5,
    title: "Authorization",
    icon: KeyRound,
    description:
      "If the policy decision is ALLOW and risk is below threshold, an authorization token is issued automatically. If REQUIRE_APPROVAL, the request is escalated to a human approver. The approver sees the full context: who requested it, what action, what risk score, why it was escalated. Upon approval, a time-bound, single-use, nonce-protected Execution Token is generated.",
    input: "Policy decision + risk assessment",
    output: "Authorization token (or pending approval / denial)",
  },
  {
    num: 6,
    title: "Execution Gate",
    icon: DoorOpen,
    description:
      "The hard enforcement boundary. The gate verifies the authorization token's signature, checks that the nonce has not been consumed, confirms the token has not expired, and checks the kill switch. Only if all conditions pass does the gate open and dispatch the action to the appropriate adapter (email, file, HTTP, etc.).",
    input: "Action + Execution Token",
    output: "Execution result (or BLOCKED)",
  },
  {
    num: 7,
    title: "Receipt Generation",
    icon: Receipt,
    description:
      "A cryptographic receipt is generated for every outcome — approved, denied, or blocked. The receipt contains the intent hash, decision hash, execution hash, timestamp, and an Ed25519 digital signature. This receipt is independently verifiable: anyone with the public key can confirm the receipt was issued by RIO and has not been tampered with.",
    input: "Execution result + intent context",
    output: "Signed receipt with receipt_hash and signature",
  },
  {
    num: 8,
    title: "Ledger Entry",
    icon: BookOpen,
    description:
      "The final stage appends a hash-linked entry to the tamper-evident audit ledger. Each entry contains the current hash (computed from the entry data plus the previous entry's hash), forming an unbreakable chain. Any modification to any entry invalidates all subsequent hashes, making tampering immediately detectable.",
    input: "Receipt + previous ledger hash",
    output: "Ledger entry with block_id, current_hash, previous_hash",
  },
];

export default function HowItWorks() {
  return (
    <div className="min-h-screen" style={{ fontFamily: "'Outfit', sans-serif" }}>
      <NavBar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <h1
            className="text-3xl sm:text-4xl font-bold mb-4"
            style={{ color: "#b8963e" }}
          >
            How It Works
          </h1>
          <p
            className="text-base sm:text-lg leading-relaxed max-w-2xl mx-auto"
            style={{ color: "#d1d5db" }}
          >
            Every action request in RIO traverses a mandatory 8-stage pipeline.
            No stage can be skipped. No action can execute without authorization.
            Every decision produces a cryptographic receipt and a tamper-evident
            ledger entry.
          </p>
        </div>

        {/* Pipeline Flow Summary */}
        <div
          className="rounded-lg border p-4 sm:p-6 mb-12 sm:mb-16 overflow-x-auto"
          style={{
            backgroundColor: "oklch(0.18 0.03 260)",
            borderColor: "oklch(0.72 0.1 85 / 20%)",
          }}
        >
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs sm:text-sm font-medium">
            {[
              "Intent",
              "Policy",
              "Approval",
              "Execution",
              "Receipt",
              "Ledger",
              "Audit",
              "Learning",
            ].map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                <span
                  className="px-2.5 py-1 rounded"
                  style={{
                    backgroundColor: "oklch(0.72 0.1 85 / 15%)",
                    color: "#b8963e",
                  }}
                >
                  {step}
                </span>
                {i < 7 && (
                  <span style={{ color: "#6b7280" }}>→</span>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Stage Cards */}
        <div className="space-y-2">
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            return (
              <div key={stage.num}>
                <div
                  className="rounded-lg border p-5 sm:p-6"
                  style={{
                    backgroundColor: "oklch(0.18 0.03 260)",
                    borderColor: "oklch(0.72 0.1 85 / 15%)",
                  }}
                >
                  <div className="flex items-start gap-4">
                    {/* Stage Number + Icon */}
                    <div className="flex-shrink-0 flex flex-col items-center gap-1">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{
                          backgroundColor: "oklch(0.72 0.1 85 / 15%)",
                          color: "#b8963e",
                        }}
                      >
                        {stage.num}
                      </div>
                      <Icon
                        className="w-4 h-4"
                        style={{ color: "#b8963e" }}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <h3
                        className="text-lg sm:text-xl font-bold mb-2"
                        style={{ color: "#b8963e" }}
                      >
                        {stage.title}
                      </h3>
                      <p
                        className="text-sm sm:text-base leading-relaxed mb-4"
                        style={{ color: "#d1d5db" }}
                      >
                        {stage.description}
                      </p>

                      {/* Input/Output */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div
                          className="rounded px-3 py-2 text-xs sm:text-sm"
                          style={{
                            backgroundColor: "oklch(0.15 0.03 260)",
                            color: "#9ca3af",
                          }}
                        >
                          <span className="font-semibold" style={{ color: "#b8963e" }}>
                            Input:
                          </span>{" "}
                          {stage.input}
                        </div>
                        <div
                          className="rounded px-3 py-2 text-xs sm:text-sm"
                          style={{
                            backgroundColor: "oklch(0.15 0.03 260)",
                            color: "#9ca3af",
                          }}
                        >
                          <span className="font-semibold" style={{ color: "#b8963e" }}>
                            Output:
                          </span>{" "}
                          {stage.output}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Arrow between stages */}
                {index < stages.length - 1 && (
                  <div className="flex justify-center py-1">
                    <ArrowDown className="w-5 h-5" style={{ color: "#b8963e", opacity: 0.4 }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Three Outcomes */}
        <div className="mt-12 sm:mt-16">
          <h2
            className="text-2xl font-bold mb-6 text-center"
            style={{ color: "#b8963e" }}
          >
            Pipeline Outcomes
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                title: "Executed",
                color: "#22c55e",
                desc: "Policy allows, authorization valid, execution succeeds. Receipt + ledger entry + corpus record produced.",
              },
              {
                title: "Denied",
                color: "#ef4444",
                desc: "Policy denies or human approver denies. Denial receipt + ledger entry produced. No execution occurs.",
              },
              {
                title: "Blocked",
                color: "#f59e0b",
                desc: "Kill switch engaged or system failure. Blocked receipt + ledger entry produced. Fail-closed enforcement.",
              },
            ].map((outcome) => (
              <div
                key={outcome.title}
                className="rounded-lg border p-4 text-center"
                style={{
                  backgroundColor: "oklch(0.18 0.03 260)",
                  borderColor: "oklch(0.72 0.1 85 / 15%)",
                }}
              >
                <div
                  className="text-lg font-bold mb-2"
                  style={{ color: outcome.color }}
                >
                  {outcome.title}
                </div>
                <p className="text-xs sm:text-sm" style={{ color: "#9ca3af" }}>
                  {outcome.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 sm:mt-16 text-center">
          <p className="text-sm mb-4" style={{ color: "#9ca3af" }}>
            See the pipeline in action with real cryptographic enforcement.
          </p>
          <a
            href="/demo2"
            className="inline-block py-3 px-8 text-sm font-medium tracking-wide uppercase text-white border rounded transition-colors duration-200 hover:bg-white/5"
            style={{
              borderColor: "#b8963e",
              borderWidth: "1.5px",
            }}
          >
            Try Demo 2 — Enforcement
          </a>
        </div>
      </div>
    </div>
  );
}
