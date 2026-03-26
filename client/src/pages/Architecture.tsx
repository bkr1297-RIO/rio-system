import NavBar from "@/components/NavBar";
import {
  Monitor,
  Globe,
  Cpu,
  Plug,
  ShieldCheck,
  Users,
  Brain,
  FileText,
  Lightbulb,
  ArrowRight,
} from "lucide-react";

/* ── Three-Loop Architecture Overview ────────────────────────────── */
const threeLoops = [
  {
    name: "Intake / Discovery Loop",
    color: "#60a5fa",
    icon: Lightbulb,
    purpose: "Translate vague goals into structured intents before governance begins.",
    flow: "Goal \u2192 Intake Validation \u2192 Missing Info Detection \u2192 AI-Assisted Refinement \u2192 Structured Intent",
    constraints: [
      "Must produce a well-defined structured intent before governance starts",
      "AI refinement is advisory \u2014 the human or system confirms the final intent",
    ],
  },
  {
    name: "Execution / Governance Loop",
    color: "#b8963e",
    icon: ShieldCheck,
    purpose: "Control and authorize all actions before execution, then verify and record.",
    flow: "Structured Intent \u2192 Policy & Risk \u2192 Authorization \u2192 Execution Gate \u2192 Execution \u2192 Verification \u2192 Receipt \u2192 Ledger",
    constraints: [
      "No execution without authorization",
      "All actions must produce v2 receipts (including denials)",
      "All receipts must be recorded in the signed ledger",
    ],
  },
  {
    name: "Learning Loop",
    color: "#22d3ee",
    icon: Brain,
    purpose: "Improve future decisions and governance policies from historical data.",
    flow: "Ledger \u2192 Audit \u2192 Pattern Analysis \u2192 Policy Updates \u2192 Model Updates \u2192 Future Decisions",
    constraints: [
      "Learning cannot bypass governance",
      "Learning cannot execute actions directly",
      "Policy updates must go through governance before deployment",
    ],
  },
];

/* ── System Layers ───────────────────────────────────────────────── */
const layers = [
  {
    name: "Dashboard Layer",
    icon: Monitor,
    color: "#b8963e",
    components: ["Audit Dashboard", "Policy Admin UI", "Risk Model Admin UI"],
    description:
      "The human interface for monitoring, managing, and auditing the system. Operators view real-time pipeline activity, manage policy versions, adjust risk thresholds, and review the full audit trail through a web-based dashboard.",
  },
  {
    name: "API Layer",
    icon: Globe,
    color: "#60a5fa",
    components: ["Governance API", "Approval API", "Simulation API", "Intake API", "FastAPI"],
    description:
      "RESTful endpoints that expose system capabilities to external consumers. AI agents, automated workflows, and enterprise systems submit action requests through the API. The Intake API handles goal-to-intent translation. The API layer handles authentication, request routing, and response formatting.",
  },
  {
    name: "Intake Translation Layer",
    icon: Lightbulb,
    color: "#60a5fa",
    components: [
      "Goal Parser",
      "Intake Validator",
      "Missing Info Detector",
      "AI-Assisted Refinement",
      "Intent Builder",
    ],
    description:
      "New in the Three-Loop Architecture. This layer translates vague goals into structured intents through validation and AI-assisted discovery before governance begins. It ensures that the Execution/Governance Loop always operates on well-defined, machine-readable intents rather than ambiguous requests. Also known as the Universal Grammar Layer or Goal-to-Intent Layer.",
  },
  {
    name: "Runtime Layer",
    icon: Cpu,
    color: "#34d399",
    components: [
      "Pipeline",
      "Policy Engine",
      "Risk Engine",
      "Authorization",
      "Execution Gate",
      "Post-Execution Verification",
      "Kill Switch",
      "Invariant Checks",
    ],
    description:
      "The core enforcement engine. Every action request passes through the pipeline. The Policy Engine evaluates organizational rules. The Risk Engine computes numeric risk scores. The Authorization module issues time-bound, single-use tokens. The Execution Gate is the hard boundary \u2014 nothing executes without a valid token. After execution, the Post-Execution Verification stage computes intent_hash, action_hash, and verification_hash (SHA-256) to cryptographically bind the intent to the action that was performed.",
  },
  {
    name: "Adapter Layer",
    icon: Plug,
    color: "#f472b6",
    components: [
      "Email Adapter",
      "File Adapter",
      "HTTP Adapter",
      "Calendar Adapter",
      "Connector Registry",
    ],
    description:
      "Adapters translate authorized intents into real-world actions. Each adapter handles a specific action type \u2014 sending emails, modifying files, calling external APIs, or managing calendar events. New adapters can be registered without modifying the core pipeline.",
  },
  {
    name: "Audit Layer",
    icon: ShieldCheck,
    color: "#a78bfa",
    components: [
      "v2 Receipt Generator",
      "Receipt Signer (Ed25519)",
      "Receipt Verifier",
      "v2 Ledger (hash chain)",
      "Ledger Verifier",
      "Verification CLI",
      "Nonce Registry",
    ],
    description:
      "Cryptographic proof of every decision. The v2 Receipt Generator produces receipts containing intent_hash, action_hash, verification_hash, risk scoring, and policy decisions \u2014 all signed with Ed25519. The v2 Ledger maintains a SHA-256 hash chain where each entry references the previous entry\u2019s hash and includes its own signature. Denial receipts are also generated for blocked actions, ensuring the audit trail covers every decision.",
  },
  {
    name: "Identity Layer",
    icon: Users,
    color: "#fb923c",
    components: [
      "Users",
      "Roles (5-level hierarchy)",
      "Permissions",
      "Sessions",
      "Approval Queue",
    ],
    description:
      "Identity and access management. Five roles (intern, employee, manager, admin, system) form a strict hierarchy. Each role carries specific permissions. The Approval Queue manages pending human approvals with constraints: no self-approval, role-level requirements, and time-bound expiration.",
  },
  {
    name: "Learning Layer",
    icon: Brain,
    color: "#22d3ee",
    components: [
      "Governed Corpus",
      "Replay Engine",
      "Simulation API",
    ],
    description:
      "Post-execution analysis and policy improvement. The Governed Corpus stores every pipeline decision as structured data. The Replay Engine re-evaluates historical decisions under modified policies. The Simulation API enables what-if analysis without affecting live operations. Learning cannot bypass governance or execute actions directly.",
  },
  {
    name: "Specification Layer",
    icon: FileText,
    color: "#94a3b8",
    components: [
      "15 Protocol Specs",
      "8 Invariants",
      "JSON Schemas",
      "Threat Model",
      "57 Verification Tests",
      "System Manifest",
    ],
    description:
      "The formal definition of what the system must do. 15 protocol specifications, 8 protocol invariants, 21 system invariants, JSON schemas for all data structures, a threat model with 10 identified threats, and 57 verification tests (47 core + 10 v2 receipt/ledger tests). The specification layer is implementation-independent.",
  },
];

export default function Architecture() {
  return (
    <div className="min-h-screen" style={{ fontFamily: "'Outfit', sans-serif" }}>
      <NavBar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <h1
            className="text-3xl sm:text-4xl font-bold mb-4"
            style={{ color: "#b8963e" }}
          >
            System Architecture
          </h1>
          <p
            className="text-base sm:text-lg leading-relaxed max-w-3xl mx-auto"
            style={{ color: "#d1d5db" }}
          >
            RIO is a governed AI control plane built on a{" "}
            <strong style={{ color: "#b8963e" }}>Three-Loop Architecture</strong>
            {" "}that translates goals into structured intents, enforces policy and approvals before execution, controls and verifies actions, generates cryptographic receipts, maintains an immutable ledger, and learns from every decision over time.
          </p>
        </div>

        {/* ── Three-Loop Architecture ──────────────────────────────────── */}
        <div className="mb-12 sm:mb-16">
          <h2
            className="text-2xl font-bold mb-6 text-center"
            style={{ color: "#b8963e" }}
          >
            Three-Loop Architecture
          </h2>

          {/* Canonical Flow Diagram */}
          <div
            className="rounded-lg border p-4 sm:p-6 mb-8 overflow-x-auto"
            style={{
              backgroundColor: "oklch(0.12 0.03 260)",
              borderColor: "oklch(0.72 0.1 85 / 20%)",
            }}
          >
            <pre
              className="text-[10px] sm:text-xs leading-snug mx-auto"
              style={{
                color: "#d1d5db",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                maxWidth: "fit-content",
              }}
            >
{`                    ┌──────────────────────────────┐
                    │     INTAKE / DISCOVERY LOOP   │
                    │  Goal → Validate → Refine →   │
                    │       Structured Intent        │
                    └──────────────┬─────────────────┘
                                   │
                    ┌──────────────▼─────────────────┐
                    │  EXECUTION / GOVERNANCE LOOP   │
                    │  Intent → Policy → Authorize → │
                    │  Execute → Verify → Receipt →  │
                    │          Ledger                 │
                    └──────────────┬─────────────────┘
                                   │
                    ┌──────────────▼─────────────────┐
                    │        LEARNING LOOP           │
                    │  Audit → Patterns → Policy     │
                    │  Updates → Future Decisions     │
                    └────────────────────────────────┘`}
            </pre>
          </div>

          {/* Loop Cards */}
          <div className="space-y-4">
            {threeLoops.map((loop) => {
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
                      <div
                        className="rounded px-3 py-2 text-xs sm:text-sm mb-3"
                        style={{
                          backgroundColor: "oklch(0.15 0.03 260)",
                          color: "#9ca3af",
                        }}
                      >
                        <span className="font-semibold" style={{ color: loop.color }}>
                          Flow:
                        </span>{" "}
                        {loop.flow}
                      </div>
                      <div className="space-y-1">
                        {loop.constraints.map((c, i) => (
                          <p key={i} className="text-xs" style={{ color: "#6b7280" }}>
                            <ArrowRight className="w-3 h-3 inline mr-1" style={{ color: loop.color }} />
                            {c}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── System Layers ────────────────────────────────────────────── */}
        <h2
          className="text-2xl font-bold mb-6 text-center"
          style={{ color: "#b8963e" }}
        >
          System Layers
        </h2>

        {/* Architecture Diagram (ASCII-style) */}
        <div
          className="rounded-lg border p-4 sm:p-6 mb-8 overflow-x-auto"
          style={{
            backgroundColor: "oklch(0.12 0.03 260)",
            borderColor: "oklch(0.72 0.1 85 / 20%)",
          }}
        >
          <pre
            className="text-[10px] sm:text-xs leading-snug mx-auto"
            style={{
              color: "#d1d5db",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              maxWidth: "fit-content",
            }}
          >
{`┌─────────────────────────────────────────────────────────────────┐
│                      DASHBOARD LAYER                            │
│   Audit Dashboard  ·  Policy Admin  ·  Risk Model Admin         │
├─────────────────────────────────────────────────────────────────┤
│                        API LAYER                                │
│   Governance API  ·  Approval API  ·  Intake API  ·  Simulation │
├─────────────────────────────────────────────────────────────────┤
│                 INTAKE TRANSLATION LAYER                        │
│   Goal Parser  ·  Validator  ·  Missing Info  ·  AI Refinement  │
├─────────────────────────────────────────────────────────────────┤
│                      RUNTIME LAYER                              │
│   Pipeline  ·  Policy Engine  ·  Risk Engine  ·  Authorization  │
│   Execution Gate  ·  Verification  ·  Kill Switch  ·  Invariants│
├─────────────────────────────────────────────────────────────────┤
│                      ADAPTER LAYER                              │
│   Email  ·  File  ·  HTTP  ·  Calendar  ·  Connector Registry   │
├─────────────────────────────────────────────────────────────────┤
│                       AUDIT LAYER                               │
│   v2 Receipt Gen  ·  Signer  ·  Verifier  ·  v2 Ledger (chain) │
│   Ledger Verifier  ·  Nonce Registry                            │
├─────────────────────────────────────────────────────────────────┤
│                     IDENTITY LAYER                              │
│   Users  ·  Roles  ·  Permissions  ·  Sessions  ·  Approvals   │
├─────────────────────────────────────────────────────────────────┤
│                     LEARNING LAYER                              │
│   Governed Corpus  ·  Replay Engine  ·  Simulation API          │
├─────────────────────────────────────────────────────────────────┤
│                   SPECIFICATION LAYER                           │
│   15 Specs  ·  8 Invariants  ·  Schemas  ·  Threat Model       │
│   57 Verification Tests  ·  System Manifest                     │
└─────────────────────────────────────────────────────────────────┘`}
          </pre>
        </div>

        {/* Layer Cards */}
        <div className="space-y-6">
          {layers.map((layer) => {
            const Icon = layer.icon;
            return (
              <div
                key={layer.name}
                className="rounded-lg border p-5 sm:p-6"
                style={{
                  backgroundColor: "oklch(0.18 0.03 260)",
                  borderColor: "oklch(0.72 0.1 85 / 15%)",
                }}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${layer.color}20` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: layer.color }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <h3
                      className="text-lg sm:text-xl font-bold mb-2"
                      style={{ color: layer.color }}
                    >
                      {layer.name}
                    </h3>
                    <p
                      className="text-sm sm:text-base leading-relaxed mb-3"
                      style={{ color: "#d1d5db" }}
                    >
                      {layer.description}
                    </p>

                    {/* Components */}
                    <div className="flex flex-wrap gap-2">
                      {layer.components.map((comp) => (
                        <span
                          key={comp}
                          className="px-2.5 py-1 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${layer.color}15`,
                            color: layer.color,
                            border: `1px solid ${layer.color}30`,
                          }}
                        >
                          {comp}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Key Properties */}
        <div className="mt-12 sm:mt-16">
          <h2
            className="text-2xl font-bold mb-6 text-center"
            style={{ color: "#b8963e" }}
          >
            Design Properties
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                title: "Fail-Closed",
                desc: "When any component cannot positively verify a required condition, the system denies the action. There is no fail-open mode.",
              },
              {
                title: "No Bypass",
                desc: "No loop or layer may be skipped. Every action traverses the full pipeline regardless of risk level or requester role.",
              },
              {
                title: "Separation of Concerns",
                desc: "Intake translation, policy evaluation, risk scoring, authorization, execution, and learning are handled by independent modules with defined interfaces.",
              },
              {
                title: "Implementation Independent",
                desc: "The specification layer defines behavior without prescribing implementation. Any language or platform can implement RIO.",
              },
            ].map((prop) => (
              <div
                key={prop.title}
                className="rounded-lg border p-4"
                style={{
                  backgroundColor: "oklch(0.18 0.03 260)",
                  borderColor: "oklch(0.72 0.1 85 / 15%)",
                }}
              >
                <h4 className="text-sm font-bold mb-1.5" style={{ color: "#b8963e" }}>
                  {prop.title}
                </h4>
                <p className="text-xs sm:text-sm" style={{ color: "#9ca3af" }}>
                  {prop.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 sm:mt-16 text-center">
          <p className="text-sm mb-4" style={{ color: "#9ca3af" }}>
            Read the full technical documentation on GitHub.
          </p>
          <a
            href="https://github.com/bkr1297-RIO/rio-protocol/tree/main/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block py-3 px-8 text-sm font-medium tracking-wide uppercase text-white border rounded transition-colors duration-200 hover:bg-white/5"
            style={{
              borderColor: "#b8963e",
              borderWidth: "1.5px",
            }}
          >
            View Full Documentation →
          </a>
        </div>
      </div>
    </div>
  );
}
