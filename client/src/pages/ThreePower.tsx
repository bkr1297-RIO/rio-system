/**
 * Three-Power Separation — Interactive Spec Page
 *
 * Visualizes the constitutional separation of powers in RIO:
 *   Observer (Intake) → Governor (Policy/Approval) → Executor (Action)
 *
 * Each power is isolated: no single component can both decide AND act.
 * The Ledger binds all three with cryptographic receipts.
 */

import { useState } from "react";
import NavBar from "@/components/NavBar";
import { Sigil } from "@/components/Sigil";
import {
  Eye,
  Shield,
  Zap,
  BookOpen,
  Lock,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Link2,
} from "lucide-react";

/* ── Data ─────────────────────────────────────────────────────── */

interface Power {
  id: string;
  name: string;
  subtitle: string;
  color: string;
  icon: typeof Eye;
  principle: string;
  capabilities: string[];
  prohibitions: string[];
  apiContracts: { method: string; endpoint: string; description: string }[];
  gates: { name: string; check: string; failMode: string }[];
}

const powers: Power[] = [
  {
    id: "observer",
    name: "Observer",
    subtitle: "Intake & Translation Layer",
    color: "#60a5fa",
    icon: Eye,
    principle:
      "Watches, translates goals into structured intent, monitors signals. The Observer sees everything but controls nothing.",
    capabilities: [
      "Receive raw goals from any source (UI, email, API, voice)",
      "Translate natural language into structured intent envelopes",
      "Validate identity (WHO), intent (WHAT), and context (WHY)",
      "Assign risk scope and urgency classification",
      "Route intents to the Governor for evaluation",
      "Monitor signal patterns for the Learning Loop",
    ],
    prohibitions: [
      "Cannot approve or deny any action",
      "Cannot execute any external action",
      "Cannot modify governance policies",
      "Cannot bypass the Governor",
      "Cannot alter the authorization field (always null on intake)",
    ],
    apiContracts: [
      {
        method: "POST",
        endpoint: "/intent",
        description:
          "Submit a structured intent envelope with identity, intent, context, and null authorization",
      },
      {
        method: "GET",
        endpoint: "/intents",
        description:
          "List all submitted intents with their current governance status",
      },
      {
        method: "GET",
        endpoint: "/intent/:id",
        description:
          "Retrieve a specific intent by ID with full audit trail",
      },
    ],
    gates: [
      {
        name: "IDENTITY_GATE",
        check: "Is the agent or human recognized?",
        failMode: "CLOSED — reject unknown identity",
      },
      {
        name: "SCHEMA_GATE",
        check: "Does the intake conform to intake-schema.json?",
        failMode: "CLOSED — reject malformed request",
      },
    ],
  },
  {
    id: "governor",
    name: "Governor",
    subtitle: "Policy & Authorization Engine",
    color: "#b8963e",
    icon: Shield,
    principle:
      "Evaluates risk, applies policy, requires approval when necessary. The Governor decides but never acts. It is a non-generative enforcement layer.",
    capabilities: [
      "Evaluate intent against active governance policies",
      "Compute 4-component risk score (scope, urgency, confidence, history)",
      "Route decisions: AUTO_APPROVE, AUTO_DENY, or REQUIRE_HUMAN",
      "Collect cryptographic signatures from qualified approvers",
      "Issue time-bound, single-use execution tokens (nonce + TTL)",
      "Enforce role-based access control (Admin, Approver, Auditor, Policy Mgr)",
      "Detect pressure states and trigger safe-hold protocol",
    ],
    prohibitions: [
      "Cannot execute any external action",
      "Cannot generate content or reinterpret meaning",
      "Cannot negotiate tradeoffs or override human input",
      "Cannot observe raw signals (only structured intents)",
      "Cannot self-grant authority or escalate permissions",
      "Cannot persist objectives across sessions",
    ],
    apiContracts: [
      {
        method: "POST",
        endpoint: "/govern",
        description:
          "Evaluate an intent against policy; returns governance decision with risk assessment",
      },
      {
        method: "POST",
        endpoint: "/authorize",
        description:
          "Submit human approval signature; issues execution token if all gates pass",
      },
    ],
    gates: [
      {
        name: "POLICY_GATE",
        check: "Does the action match a defined policy rule?",
        failMode: "CLOSED — no policy = no action",
      },
      {
        name: "CONFIDENCE_GATE",
        check: "Is AI confidence score >= 80%?",
        failMode: "ESCALATE — route to human review",
      },
      {
        name: "APPROVAL_GATE",
        check: "Has a qualified approver signed with Ed25519?",
        failMode: "CLOSED — no signature = no token",
      },
      {
        name: "SCOPE_GATE",
        check: "Is the action within the approver's authorized scope?",
        failMode: "CLOSED — out-of-scope approval rejected",
      },
    ],
  },
  {
    id: "executor",
    name: "Executor",
    subtitle: "Controlled Action & Verification",
    color: "#22d3ee",
    icon: Zap,
    principle:
      "Carries out authorized actions through connectors. The Executor acts but never decides. Without a valid token, nothing executes.",
    capabilities: [
      "Verify execution token (signature, timestamp, nonce, kill switch)",
      "Execute authorized action through appropriate connector (Gmail, Drive, GitHub, etc.)",
      "Compute three SHA-256 hashes: intent_hash, action_hash, verification_hash",
      "Generate cryptographically signed receipt (Ed25519/ECDSA)",
      "Record receipt in the hash-chained ledger",
      "Confirm execution outcome matches authorized intent",
    ],
    prohibitions: [
      "Cannot execute without a valid, unexpired, unreplayed token",
      "Cannot approve its own actions",
      "Cannot modify governance policies",
      "Cannot observe or intake new requests",
      "Cannot bypass the kill switch",
      "Cannot alter ledger entries after recording",
    ],
    apiContracts: [
      {
        method: "POST",
        endpoint: "/execute",
        description:
          "Execute an authorized action; requires valid execution token with nonce and TTL",
      },
      {
        method: "POST",
        endpoint: "/execute-confirm",
        description:
          "Confirm execution outcome; triggers receipt generation",
      },
      {
        method: "POST",
        endpoint: "/receipt",
        description:
          "Generate and record a cryptographically signed receipt in the ledger",
      },
    ],
    gates: [
      {
        name: "TOKEN_GATE",
        check: "Is the execution token valid, signed, and unexpired?",
        failMode: "CLOSED — invalid token = no execution",
      },
      {
        name: "NONCE_GATE",
        check: "Has this nonce been used before?",
        failMode: "CLOSED — replay detected = blocked",
      },
      {
        name: "KILL_SWITCH",
        check: "Is the system in active (non-halted) state?",
        failMode: "CLOSED — system halted = all execution blocked",
      },
    ],
  },
];

const ledger = {
  name: "Ledger",
  subtitle: "Cryptographic Audit Trail",
  color: "#a78bfa",
  icon: BookOpen,
  principle:
    "The Ledger binds all three powers together. Every action — approved, denied, or blocked — produces a receipt recorded in a tamper-evident, hash-chained log. The Ledger is append-only, human-readable, and externally verifiable.",
  endpoints: [
    {
      method: "GET",
      endpoint: "/ledger",
      description: "Retrieve the full hash-chained ledger with integrity verification",
    },
    {
      method: "GET",
      endpoint: "/verify",
      description: "Independently verify a receipt's cryptographic signatures and hash chain",
    },
  ],
  guarantees: [
    "Append-only — past records cannot be altered",
    "Hash-chained — modifying any entry invalidates all subsequent hashes",
    "Signed — Ed25519 signatures on every receipt",
    "Complete — denied and blocked actions are also recorded",
    "Externally verifiable — no internal reasoning required",
  ],
};

const invariants = [
  {
    id: "A1",
    name: "No Self-Granted Authority",
    rule: "No component may elevate its role, widen its scope, persist objectives, or reinterpret permissions.",
    icon: XCircle,
  },
  {
    id: "A2",
    name: "No Silent Continuation",
    rule: "At ambiguity, conflict, novelty, or pressure: execution halts, state enters safe-hold, human review is required.",
    icon: AlertTriangle,
  },
  {
    id: "A3",
    name: "No Goal Persistence",
    rule: "Objectives expire at session end, do not propagate across turns, and cannot be inferred or remembered as intent.",
    icon: Lock,
  },
  {
    id: "A4",
    name: "No Action Without Receipt",
    rule: "Every governed action — approved, denied, or blocked — must produce a cryptographic receipt recorded in the ledger.",
    icon: FileCheck,
  },
];

const failurePosture = [
  { prefer: "Refusal", over: "Action" },
  { prefer: "Uncertainty", over: "Confidence" },
  { prefer: "Interruption", over: "Drift" },
  { prefer: "Human delay", over: "Autonomous continuation" },
];

/* ── Components ───────────────────────────────────────────────── */

function PowerCard({ power, isExpanded, onToggle }: { power: Power; isExpanded: boolean; onToggle: () => void }) {
  const Icon = power.icon;
  return (
    <div
      className="rounded-xl border transition-all duration-300"
      style={{
        borderColor: isExpanded ? power.color : "rgba(255,255,255,0.1)",
        backgroundColor: isExpanded ? `${power.color}08` : "rgba(255,255,255,0.02)",
      }}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-5 sm:p-6 text-left cursor-pointer"
      >
        <div
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${power.color}18` }}
        >
          <Icon size={24} style={{ color: power.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg sm:text-xl font-bold text-white">{power.name}</h3>
          <p className="text-xs sm:text-sm" style={{ color: power.color }}>
            {power.subtitle}
          </p>
        </div>
        <div className="shrink-0" style={{ color: power.color }}>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-5 sm:px-6 pb-6 space-y-6">
          {/* Principle */}
          <div
            className="p-4 rounded-lg text-sm leading-relaxed"
            style={{ backgroundColor: `${power.color}0a`, borderLeft: `3px solid ${power.color}` }}
          >
            {power.principle}
          </div>

          {/* Capabilities vs Prohibitions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Capabilities
              </h4>
              <ul className="space-y-1.5">
                {power.capabilities.map((c, i) => (
                  <li key={i} className="text-xs sm:text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-green-500 mt-0.5 shrink-0">+</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                <XCircle size={14} /> Prohibitions
              </h4>
              <ul className="space-y-1.5">
                {power.prohibitions.map((p, i) => (
                  <li key={i} className="text-xs sm:text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-red-500 mt-0.5 shrink-0">&times;</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* API Contracts */}
          <div>
            <h4 className="text-sm font-semibold mb-2" style={{ color: power.color }}>
              API Contracts
            </h4>
            <div className="space-y-2">
              {power.apiContracts.map((api, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg"
                  style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                >
                  <code
                    className="text-xs font-mono px-2 py-0.5 rounded shrink-0"
                    style={{ backgroundColor: `${power.color}20`, color: power.color }}
                  >
                    {api.method}
                  </code>
                  <div>
                    <code className="text-sm text-white font-mono">{api.endpoint}</code>
                    <p className="text-xs text-gray-400 mt-0.5">{api.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Enforcement Gates */}
          <div>
            <h4 className="text-sm font-semibold mb-2" style={{ color: power.color }}>
              Enforcement Gates
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 pr-3 text-gray-400 font-medium">Gate</th>
                    <th className="text-left py-2 pr-3 text-gray-400 font-medium">Check</th>
                    <th className="text-left py-2 text-gray-400 font-medium">Fail Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {power.gates.map((g, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="py-2 pr-3 font-mono text-white">{g.name}</td>
                      <td className="py-2 pr-3 text-gray-300">{g.check}</td>
                      <td className="py-2">
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: g.failMode.startsWith("CLOSED")
                              ? "rgba(239,68,68,0.15)"
                              : "rgba(234,179,8,0.15)",
                            color: g.failMode.startsWith("CLOSED") ? "#f87171" : "#facc15",
                          }}
                        >
                          {g.failMode}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Flow Diagram ─────────────────────────────────────────────── */

function FlowDiagram() {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-0 py-8">
      {powers.map((p, i) => {
        const Icon = p.icon;
        return (
          <div key={p.id} className="flex items-center gap-3 sm:gap-0">
            <div className="flex flex-col items-center">
              <div
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl flex flex-col items-center justify-center border"
                style={{ borderColor: p.color, backgroundColor: `${p.color}10` }}
              >
                <Icon size={28} style={{ color: p.color }} />
                <span className="text-xs font-bold mt-1.5" style={{ color: p.color }}>
                  {p.name}
                </span>
              </div>
              <span className="text-[10px] text-gray-500 mt-1">{p.subtitle.split(" ")[0]}</span>
            </div>
            {i < powers.length - 1 && (
              <div className="hidden sm:flex items-center px-3">
                <ArrowRight size={18} className="text-gray-500" />
              </div>
            )}
          </div>
        );
      })}
      {/* Ledger binding */}
      <div className="flex items-center gap-3 sm:gap-0">
        <div className="hidden sm:flex items-center px-3">
          <ArrowRight size={18} className="text-gray-500" />
        </div>
        <div className="flex flex-col items-center">
          <div
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl flex flex-col items-center justify-center border"
            style={{ borderColor: ledger.color, backgroundColor: `${ledger.color}10` }}
          >
            <BookOpen size={28} style={{ color: ledger.color }} />
            <span className="text-xs font-bold mt-1.5" style={{ color: ledger.color }}>
              Ledger
            </span>
          </div>
          <span className="text-[10px] text-gray-500 mt-1">Audit Trail</span>
        </div>
      </div>
    </div>
  );
}

/* ── Separation Matrix ────────────────────────────────────────── */

function SeparationMatrix() {
  const rows = [
    { action: "Receive & translate goals", observer: true, governor: false, executor: false },
    { action: "Evaluate risk & apply policy", observer: false, governor: true, executor: false },
    { action: "Approve or deny actions", observer: false, governor: true, executor: false },
    { action: "Issue execution tokens", observer: false, governor: true, executor: false },
    { action: "Execute external actions", observer: false, governor: false, executor: true },
    { action: "Generate signed receipts", observer: false, governor: false, executor: true },
    { action: "Modify governance policies", observer: false, governor: false, executor: false },
    { action: "Record to ledger", observer: false, governor: false, executor: true },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left py-3 pr-4 text-gray-400 font-medium">Action</th>
            <th className="text-center py-3 px-3 font-medium" style={{ color: "#60a5fa" }}>Observer</th>
            <th className="text-center py-3 px-3 font-medium" style={{ color: "#b8963e" }}>Governor</th>
            <th className="text-center py-3 px-3 font-medium" style={{ color: "#22d3ee" }}>Executor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-white/5">
              <td className="py-2.5 pr-4 text-gray-300">{r.action}</td>
              <td className="text-center py-2.5">
                {r.observer ? (
                  <CheckCircle2 size={16} className="inline" style={{ color: "#60a5fa" }} />
                ) : (
                  <XCircle size={14} className="inline text-gray-600" />
                )}
              </td>
              <td className="text-center py-2.5">
                {r.governor ? (
                  <CheckCircle2 size={16} className="inline" style={{ color: "#b8963e" }} />
                ) : (
                  <XCircle size={14} className="inline text-gray-600" />
                )}
              </td>
              <td className="text-center py-2.5">
                {r.executor ? (
                  <CheckCircle2 size={16} className="inline" style={{ color: "#22d3ee" }} />
                ) : (
                  <XCircle size={14} className="inline text-gray-600" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500 mt-2 italic">
        Note: "Modify governance policies" requires Admin role through a separate governance action — no component can self-modify.
      </p>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────── */

export default function ThreePower() {
  const [expandedPower, setExpandedPower] = useState<string | null>("observer");

  return (
    <div className="min-h-screen" style={{ fontFamily: "'Outfit', sans-serif" }}>
      <NavBar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Header */}
        <div className="text-center mb-10">
          <p
            className="text-xs sm:text-sm font-semibold tracking-[0.25em] uppercase mb-3"
            style={{ color: "#60a5fa" }}
          >
            Constitutional Architecture
          </p>
          <h1
            className="text-3xl sm:text-5xl font-bold mb-4"
            style={{ color: "#b8963e" }}
          >
            Three-Power Separation
          </h1>
          <p className="text-sm sm:text-base text-gray-400 max-w-2xl mx-auto leading-relaxed mb-8">
            No single component can both decide AND act. The Observer sees but cannot control.
            The Governor decides but cannot execute. The Executor acts but cannot approve.
            The Ledger binds all three with cryptographic proof.
          </p>

          {/* Interactive Sigil — hover each ring to explore */}
          <Sigil size={240} animated={true} showLabels={false} interactive={true} />
        </div>

        {/* Flow Diagram */}
        <div className="mb-12">
          <FlowDiagram />
        </div>

        {/* Core Principle */}
        <div
          className="p-5 sm:p-6 rounded-xl mb-12 border"
          style={{
            borderColor: "rgba(184,150,62,0.3)",
            backgroundColor: "rgba(184,150,62,0.05)",
          }}
        >
          <h2 className="text-lg font-bold mb-2" style={{ color: "#b8963e" }}>
            The Separation Principle
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            This spec does not try to make models <em>want</em> the right thing — it makes it
            mechanically impossible for them to do the wrong thing without explicit human authority.
            The three powers are isolated by design: the Observer translates goals into structured
            intents, the Governor evaluates policy and issues tokens, and the Executor carries out
            authorized actions. Each power has its own API surface, its own enforcement gates, and
            its own failure modes. The Ledger records everything — including denials and blocks —
            creating a complete, tamper-evident audit trail.
          </p>
        </div>

        {/* Three Powers — Expandable Cards */}
        <h2
          className="text-2xl sm:text-3xl font-bold mb-6"
          style={{ color: "#b8963e" }}
        >
          <span style={{ color: "#60a5fa" }}>1.</span> The Three Powers
        </h2>
        <div className="space-y-3 mb-14">
          {powers.map((p) => (
            <PowerCard
              key={p.id}
              power={p}
              isExpanded={expandedPower === p.id}
              onToggle={() =>
                setExpandedPower(expandedPower === p.id ? null : p.id)
              }
            />
          ))}
        </div>

        {/* Separation Matrix */}
        <h2
          className="text-2xl sm:text-3xl font-bold mb-6"
          style={{ color: "#b8963e" }}
        >
          <span style={{ color: "#60a5fa" }}>2.</span> Separation Matrix
        </h2>
        <div
          className="p-4 sm:p-6 rounded-xl border mb-14"
          style={{
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.02)",
          }}
        >
          <SeparationMatrix />
        </div>

        {/* Ledger */}
        <h2
          className="text-2xl sm:text-3xl font-bold mb-6"
          style={{ color: "#b8963e" }}
        >
          <span style={{ color: "#60a5fa" }}>3.</span> The Binding Layer — Ledger
        </h2>
        <div
          className="p-5 sm:p-6 rounded-xl border mb-14"
          style={{
            borderColor: `${ledger.color}30`,
            backgroundColor: `${ledger.color}08`,
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <BookOpen size={24} style={{ color: ledger.color }} />
            <div>
              <h3 className="text-lg font-bold text-white">{ledger.name}</h3>
              <p className="text-xs" style={{ color: ledger.color }}>{ledger.subtitle}</p>
            </div>
          </div>
          <p className="text-sm text-gray-300 mb-4 leading-relaxed">{ledger.principle}</p>

          <h4 className="text-sm font-semibold mb-2" style={{ color: ledger.color }}>
            Guarantees
          </h4>
          <ul className="space-y-1.5 mb-4">
            {ledger.guarantees.map((g, i) => (
              <li key={i} className="text-xs sm:text-sm text-gray-300 flex items-start gap-2">
                <Link2 size={12} className="mt-1 shrink-0" style={{ color: ledger.color }} />
                {g}
              </li>
            ))}
          </ul>

          <h4 className="text-sm font-semibold mb-2" style={{ color: ledger.color }}>
            API Contracts
          </h4>
          <div className="space-y-2">
            {ledger.endpoints.map((api, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg"
                style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
              >
                <code
                  className="text-xs font-mono px-2 py-0.5 rounded shrink-0"
                  style={{ backgroundColor: `${ledger.color}20`, color: ledger.color }}
                >
                  {api.method}
                </code>
                <div>
                  <code className="text-sm text-white font-mono">{api.endpoint}</code>
                  <p className="text-xs text-gray-400 mt-0.5">{api.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Authority Invariants */}
        <h2
          className="text-2xl sm:text-3xl font-bold mb-6"
          style={{ color: "#b8963e" }}
        >
          <span style={{ color: "#60a5fa" }}>4.</span> Authority Invariants (Non-Negotiable)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-14">
          {invariants.map((inv) => {
            const Icon = inv.icon;
            return (
              <div
                key={inv.id}
                className="p-4 rounded-xl border"
                style={{
                  borderColor: "rgba(239,68,68,0.2)",
                  backgroundColor: "rgba(239,68,68,0.04)",
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={16} className="text-red-400" />
                  <span className="text-xs font-mono text-red-400">{inv.id}</span>
                  <span className="text-sm font-bold text-white">{inv.name}</span>
                </div>
                <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">{inv.rule}</p>
              </div>
            );
          })}
        </div>

        {/* Failure Posture */}
        <h2
          className="text-2xl sm:text-3xl font-bold mb-6"
          style={{ color: "#b8963e" }}
        >
          <span style={{ color: "#60a5fa" }}>5.</span> Failure Posture
        </h2>
        <div
          className="p-5 sm:p-6 rounded-xl border mb-14"
          style={{
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.02)",
          }}
        >
          <p className="text-sm text-gray-400 mb-4">
            When in doubt, the system always prefers safety over action:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {failurePosture.map((fp, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-lg"
                style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
              >
                <span className="text-green-400 font-semibold text-sm">{fp.prefer}</span>
                <span className="text-gray-500 text-xs">over</span>
                <span className="text-red-400 font-semibold text-sm line-through opacity-60">{fp.over}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Component Specifications */}
        <h2
          className="text-2xl sm:text-3xl font-bold mb-6"
          style={{ color: "#b8963e" }}
        >
          <span style={{ color: "#60a5fa" }}>6.</span> Component Specifications
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-14">
          {[
            {
              name: "Mantis",
              role: "Observer",
              color: "#60a5fa",
              version: "v1.0",
              description:
                "Observation and ingestion layer. Translates raw goals into structured intent envelopes with identity, context, and risk scope.",
              capabilities: [
                "Natural language → structured intent",
                "Identity validation (WHO)",
                "Risk scope assignment",
                "Signal pattern monitoring",
              ],
              url: "https://github.com/bkr1297-RIO/rio-system/blob/feature/mantis-component-spec/spec/mantis-component-v1.json",
            },
            {
              name: "Governor",
              role: "Governor",
              color: "#b8963e",
              version: "v1.0",
              description:
                "Policy evaluation and approval authority. Evaluates intents against governance policies, issues execution tokens, and manages risk thresholds.",
              capabilities: [
                "Policy evaluation engine",
                "Risk tier classification",
                "Execution token issuance",
                "Human escalation routing",
              ],
              url: "https://github.com/bkr1297-RIO/rio-system/blob/feature/mantis-component-spec/spec/governor-component-v1.json",
            },
            {
              name: "Executor",
              role: "Executor",
              color: "#22d3ee",
              version: "v1.0",
              description:
                "Authorized action execution layer. Executes only with valid tokens, generates signed receipts, and writes to the immutable ledger.",
              capabilities: [
                "Token-gated execution",
                "Signed receipt generation",
                "Ledger chain maintenance",
                "Execution isolation",
              ],
              url: "https://github.com/bkr1297-RIO/rio-system/blob/feature/mantis-component-spec/spec/executor-component-v1.json",
            },
          ].map((spec) => (
            <a
              key={spec.name}
              href={spec.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-5 rounded-xl border transition-all duration-200 hover:scale-[1.02]"
              style={{
                borderColor: `${spec.color}30`,
                backgroundColor: `${spec.color}08`,
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${spec.color}20` }}
                >
                  <FileCheck size={16} style={{ color: spec.color }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{spec.name}</h3>
                  <span className="text-[10px] font-mono" style={{ color: spec.color }}>
                    {spec.role} · {spec.version}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed mb-3">
                {spec.description}
              </p>
              <ul className="space-y-1">
                {spec.capabilities.map((c, i) => (
                  <li key={i} className="text-[11px] text-gray-500 flex items-center gap-1.5">
                    <CheckCircle2 size={10} style={{ color: spec.color }} />
                    {c}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center gap-1 text-[10px]" style={{ color: spec.color }}>
                <FileCheck size={10} />
                View JSON Spec on GitHub
              </div>
            </a>
          ))}
        </div>

        {/* Summary */}
        <div
          className="p-6 sm:p-8 rounded-xl text-center border"
          style={{
            borderColor: "rgba(184,150,62,0.3)",
            background: "linear-gradient(135deg, rgba(184,150,62,0.08), rgba(96,165,250,0.05))",
          }}
        >
          <p className="text-base sm:text-lg font-medium text-gray-200 italic leading-relaxed max-w-2xl mx-auto">
            "This spec does not try to make models want the right thing — it makes it
            mechanically impossible for them to do the wrong thing without explicit human authority."
          </p>
          <p className="text-xs text-gray-500 mt-3">
            — Governor Authority Interlock Spec v1.0, Brian Rasmussen
          </p>
        </div>
      </div>
    </div>
  );
}
