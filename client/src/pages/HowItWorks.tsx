import NavBar from "@/components/NavBar";
import {
  Inbox,
  Tags,
  FileText,
  ShieldCheck,
  KeyRound,
  DoorOpen,
  ScanSearch,
  Receipt,
  BookOpen,
  ArrowDown,
  Lightbulb,
  Search,
  Sparkles,
  BarChart3,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

/* ── Three-Loop Architecture ─────────────────────────────────────── */
const loops = [
  {
    name: "Intake / Discovery Loop",
    color: "#60a5fa",
    icon: Lightbulb,
    purpose: "Translate vague goals into structured intents before governance.",
    steps: ["Goal", "Intake Validation", "Missing Information Detection", "AI-Assisted Intake Refinement", "Structured Intent Created"],
    aliases: ["Intake Translation Layer", "Universal Grammar Layer", "Goal-to-Intent Layer"],
  },
  {
    name: "Execution / Governance Loop",
    color: "#b8963e",
    icon: ShieldCheck,
    purpose: "Control and authorize all actions before execution.",
    steps: ["Structured Intent", "Policy & Risk Evaluation", "Authorization", "Execution Gate", "Execution", "Verification", "Receipt", "Ledger Entry"],
    aliases: [],
  },
  {
    name: "Learning Loop",
    color: "#22d3ee",
    icon: TrendingUp,
    purpose: "Improve future decisions and governance policies.",
    steps: ["Ledger", "Audit", "Pattern Analysis", "Policy Updates", "Model Updates", "Future Intake & Governance Decisions"],
    aliases: [],
  },
];

/* ── Execution/Governance Pipeline Stages ────────────────────────── */
const stages = [
  {
    num: 1,
    title: "Intake",
    icon: Inbox,
    loop: "intake",
    description:
      "The AI agent or automated system submits a raw action request — which may be a vague goal or a structured command. The system assigns a unique request ID, records the timestamp, and verifies the requester's identity against the IAM registry. Unknown or inactive users are rejected immediately.",
    input: "Raw request with user_id, action, parameters (or vague goal)",
    output: "Validated Request object with unique ID and resolved role",
  },
  {
    num: 2,
    title: "Discovery & Refinement",
    icon: Search,
    loop: "intake",
    description:
      "New in the Three-Loop Architecture. If the request is a vague goal rather than a structured action, the Intake Discovery Loop activates. The system detects missing information, uses AI-assisted refinement to clarify the intent, and iterates until a complete, machine-readable structured intent can be produced. This ensures governance always operates on well-defined intents, not ambiguous requests.",
    input: "Validated request (potentially vague or incomplete)",
    output: "Fully resolved structured intent ready for governance",
  },
  {
    num: 3,
    title: "Classification",
    icon: Tags,
    loop: "governance",
    description:
      "The system identifies the action type (e.g., transfer_funds, send_email, delete_data) and assigns an initial risk category — LOW, MEDIUM, HIGH, or CRITICAL — based on the action and the requester's role. Classification does not make policy decisions; it provides inputs for the engines that do.",
    input: "Structured intent",
    output: "Action type classification and initial risk category",
  },
  {
    num: 4,
    title: "Policy & Risk Evaluation",
    icon: ShieldCheck,
    loop: "governance",
    description:
      "The Policy Engine evaluates the intent against active rules, returning ALLOW, BLOCK, or REQUIRE_APPROVAL. The Risk Engine computes a numeric score from four components: base risk (action type), role modifier (requester's role), amount modifier (financial or data volume), and target modifier (sensitivity of the target system).",
    input: "Classified intent",
    output: "Policy decision + risk score + risk breakdown",
  },
  {
    num: 5,
    title: "Authorization",
    icon: KeyRound,
    loop: "governance",
    description:
      "If the policy decision is ALLOW and risk is below threshold, an authorization token is issued automatically. If REQUIRE_APPROVAL, the request is escalated to a human approver. The approver sees the full context: who requested it, what action, what risk score, why it was escalated. Upon approval, a time-bound, single-use, nonce-protected Execution Token is generated.",
    input: "Policy decision + risk assessment",
    output: "Authorization token (or pending approval / denial)",
  },
  {
    num: 6,
    title: "Execution Gate",
    icon: DoorOpen,
    loop: "governance",
    description:
      "The hard enforcement boundary. The gate verifies the authorization token's signature, checks that the nonce has not been consumed, confirms the token has not expired, and checks the kill switch. Only if all conditions pass does the gate open and dispatch the action to the appropriate adapter (email, file, HTTP, etc.).",
    input: "Action + Execution Token",
    output: "Execution result (or BLOCKED)",
  },
  {
    num: "6b",
    title: "Post-Execution Verification",
    icon: ScanSearch,
    loop: "governance",
    description:
      "New in v2. After execution completes, the verification stage computes three SHA-256 hashes: intent_hash (binding the intent ID, action, and requester to the request timestamp), action_hash (binding the action type and parameters), and verification_hash (binding intent_hash + action_hash + execution status). These three hashes cryptographically prove that the action executed matches the action that was authorized. The verification_status is set to \u2018verified\u2019 on success.",
    input: "Execution result + intent context + action parameters",
    output: "intent_hash, action_hash, verification_hash, verification_status",
  },
  {
    num: 7,
    title: "v2 Receipt Generation",
    icon: Receipt,
    loop: "governance",
    description:
      "A v2 cryptographic receipt is generated for every outcome \u2014 approved, denied, or blocked. The receipt contains intent_hash, action_hash, verification_hash, verification_status, risk score, risk level, policy decision, three ISO 8601 timestamps (request, approval, execution), and an Ed25519 signature over the receipt hash. Denial receipts are also generated for blocked actions, ensuring every decision is recorded.",
    input: "Verification hashes + execution result + risk assessment + policy decision",
    output: "Signed v2 receipt with receipt_hash, signature, and protocol_version",
  },
  {
    num: 8,
    title: "v2 Ledger Entry",
    icon: BookOpen,
    loop: "governance",
    description:
      "The final stage appends a hash-linked entry to the v2 tamper-evident audit ledger. Each entry contains the receipt_hash (linking it to the receipt), the previous_hash (linking to the prior ledger entry), the current_hash (computed from all entry data), and its own ledger_signature. Any modification to any entry invalidates all subsequent hashes, making tampering immediately detectable.",
    input: "v2 Receipt + previous ledger hash",
    output: "Ledger entry with block_id, receipt_hash, current_hash, previous_hash, ledger_signature",
  },
];

/* ── Learning Loop Steps ─────────────────────────────────────────── */
const learningSteps = [
  {
    icon: BarChart3,
    title: "Pattern Analysis",
    desc: "The Governed Corpus stores every pipeline decision as structured data. Patterns are extracted: which actions are most frequently denied, which policies trigger the most escalations, which risk scores cluster near thresholds.",
  },
  {
    icon: RefreshCw,
    title: "Policy & Model Updates",
    desc: "Insights feed back into policy refinement and risk model tuning. Policy updates themselves must go through governance before deployment \u2014 the Learning Loop cannot bypass the Execution/Governance Loop.",
  },
  {
    icon: Sparkles,
    title: "Replay & Simulation",
    desc: "The Replay Engine re-evaluates historical decisions under modified policies. The Simulation API enables what-if analysis without affecting live operations. Both tools validate proposed changes before they reach production.",
  },
];

function getLoopColor(loop: string) {
  if (loop === "intake") return "#60a5fa";
  if (loop === "governance") return "#b8963e";
  return "#22d3ee";
}

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
            className="text-base sm:text-lg leading-relaxed max-w-3xl mx-auto"
            style={{ color: "#d1d5db" }}
          >
            RIO is a governed execution system that sits between AI, humans, and real-world actions. It translates goals into structured intent, evaluates risk and policy, requires approval when necessary, controls execution, verifies outcomes, and generates cryptographically signed receipts recorded in a tamper-evident ledger. <strong style={{ color: "#b8963e" }}>The system enforces the rules, not the AI.</strong> Built on a three-loop architecture — <span style={{ color: "#60a5fa" }}>Intake</span> (goal &rarr; intent), <span style={{ color: "#b8963e" }}>Governance</span> (policy &rarr; approval &rarr; execution &rarr; verification), and <span style={{ color: "#22d3ee" }}>Learning</span> (ledger &rarr; policy improvement) — RIO creates a closed-loop system where every action is authorized, executed, verified, recorded, and used to improve future decisions.
          </p>
        </div>

        {/* ── Three-Loop Overview ──────────────────────────────────────── */}
        <div className="mb-12 sm:mb-16">
          <h2
            className="text-2xl font-bold mb-6 text-center"
            style={{ color: "#b8963e" }}
          >
            Three-Loop Architecture
          </h2>

          {/* Canonical Flow */}
          <div
            className="rounded-lg border p-4 sm:p-6 mb-8 overflow-x-auto"
            style={{
              backgroundColor: "oklch(0.12 0.03 260)",
              borderColor: "oklch(0.72 0.1 85 / 20%)",
            }}
          >
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs sm:text-sm font-medium">
              {[
                { label: "Goal", color: "#60a5fa" },
                { label: "Intake", color: "#60a5fa" },
                { label: "Intent", color: "#60a5fa" },
                { label: "Policy", color: "#b8963e" },
                { label: "Approve", color: "#b8963e" },
                { label: "Execute", color: "#b8963e" },
                { label: "Verify", color: "#3b82f6" },
                { label: "Receipt", color: "#b8963e" },
                { label: "Ledger", color: "#b8963e" },
                { label: "Learn", color: "#22d3ee" },
              ].map((step, i, arr) => (
                <span key={step.label} className="flex items-center gap-2">
                  <span
                    className="px-2.5 py-1 rounded"
                    style={{
                      backgroundColor: `${step.color}20`,
                      color: step.color,
                    }}
                  >
                    {step.label}
                  </span>
                  {i < arr.length - 1 && (
                    <span style={{ color: "#6b7280" }}>{"\u2192"}</span>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* Loop Cards */}
          <div className="grid grid-cols-1 gap-4">
            {loops.map((loop) => {
              const Icon = loop.icon;
              return (
                <div
                  key={loop.name}
                  className="rounded-lg border p-5 sm:p-6"
                  style={{
                    backgroundColor: "oklch(0.18 0.03 260)",
                    borderColor: `${loop.color}30`,
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${loop.color}20` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: loop.color }} />
                    </div>
                    <div className="flex-1">
                      <h3
                        className="text-lg sm:text-xl font-bold mb-1"
                        style={{ color: loop.color }}
                      >
                        {loop.name}
                      </h3>
                      <p
                        className="text-sm sm:text-base leading-relaxed mb-3"
                        style={{ color: "#d1d5db" }}
                      >
                        {loop.purpose}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {loop.steps.map((s) => (
                          <span
                            key={s}
                            className="px-2 py-0.5 rounded text-xs"
                            style={{
                              backgroundColor: `${loop.color}12`,
                              color: loop.color,
                              border: `1px solid ${loop.color}25`,
                            }}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                      {loop.aliases.length > 0 && (
                        <p className="text-xs mt-2" style={{ color: "#6b7280" }}>
                          Also known as: {loop.aliases.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Pipeline Stages (detailed) ──────────────────────────────── */}
        <h2
          className="text-2xl font-bold mb-6 text-center"
          style={{ color: "#b8963e" }}
        >
          Pipeline Stages
        </h2>

        <div className="space-y-2">
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            const loopColor = getLoopColor(stage.loop);
            return (
              <div key={String(stage.num)}>
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
                          backgroundColor: `${loopColor}20`,
                          color: loopColor,
                        }}
                      >
                        {stage.num}
                      </div>
                      <Icon
                        className="w-4 h-4"
                        style={{ color: loopColor }}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3
                          className="text-lg sm:text-xl font-bold"
                          style={{ color: "#b8963e" }}
                        >
                          {stage.title}
                        </h3>
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            backgroundColor: `${loopColor}15`,
                            color: loopColor,
                            border: `1px solid ${loopColor}30`,
                          }}
                        >
                          {stage.loop === "intake" ? "Intake Loop" : "Governance Loop"}
                        </span>
                      </div>
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

        {/* ── Learning Loop Detail ────────────────────────────────────── */}
        <div className="mt-12 sm:mt-16">
          <h2
            className="text-2xl font-bold mb-6 text-center"
            style={{ color: "#22d3ee" }}
          >
            Learning Loop
          </h2>
          <p
            className="text-sm sm:text-base text-center mb-6 max-w-2xl mx-auto"
            style={{ color: "#9ca3af" }}
          >
            After every pipeline execution, the Learning Loop analyzes outcomes to improve future governance. Learning cannot bypass governance, cannot execute actions, and policy updates must go through governance before deployment.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {learningSteps.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="rounded-lg border p-4"
                  style={{
                    backgroundColor: "oklch(0.18 0.03 260)",
                    borderColor: "#22d3ee30",
                  }}
                >
                  <Icon className="w-5 h-5 mb-2" style={{ color: "#22d3ee" }} />
                  <h4 className="text-sm font-bold mb-1.5" style={{ color: "#22d3ee" }}>
                    {step.title}
                  </h4>
                  <p className="text-xs sm:text-sm" style={{ color: "#9ca3af" }}>
                    {step.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Pipeline Outcomes ────────────────────────────────────────── */}
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
                title: "Executed + Verified",
                color: "#22c55e",
                desc: "Policy allows, authorization valid, execution succeeds, verification passes. v2 receipt (with intent_hash, action_hash, verification_hash) + signed ledger entry produced.",
              },
              {
                title: "Denied",
                color: "#ef4444",
                desc: "Policy denies or human approver denies. v2 denial receipt + signed ledger entry produced. No execution occurs. Full audit trail preserved.",
              },
              {
                title: "Blocked",
                color: "#f59e0b",
                desc: "Kill switch engaged, verification fails, or system failure. v2 blocked receipt + signed ledger entry produced. Fail-closed enforcement.",
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
            href="/demo4"
            className="inline-block py-3 px-8 text-sm font-medium tracking-wide uppercase text-white border rounded transition-colors duration-200 hover:bg-white/5"
            style={{
              borderColor: "#b8963e",
              borderWidth: "1.5px",
            }}
          >
            Try Demo 4 — Full Pipeline
          </a>
        </div>
      </div>
    </div>
  );
}
