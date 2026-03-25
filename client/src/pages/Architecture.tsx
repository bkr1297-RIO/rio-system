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
} from "lucide-react";

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
    components: ["Governance API", "Approval API", "Simulation API", "FastAPI"],
    description:
      "RESTful endpoints that expose system capabilities to external consumers. AI agents, automated workflows, and enterprise systems submit action requests through the API. The API layer handles authentication, request routing, and response formatting.",
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
      "Kill Switch",
      "Invariant Checks",
    ],
    description:
      "The core enforcement engine. Every action request passes through the 8-stage pipeline. The Policy Engine evaluates organizational rules. The Risk Engine computes numeric risk scores. The Authorization module issues time-bound, single-use tokens. The Execution Gate is the hard boundary — nothing executes without a valid token.",
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
      "Adapters translate authorized intents into real-world actions. Each adapter handles a specific action type — sending emails, modifying files, calling external APIs, or managing calendar events. New adapters can be registered without modifying the core pipeline.",
  },
  {
    name: "Audit Layer",
    icon: ShieldCheck,
    color: "#a78bfa",
    components: [
      "Receipt Generator",
      "Ledger (hash chain)",
      "Verification CLI",
      "Governance Ledger",
      "Nonce Registry",
    ],
    description:
      "Cryptographic proof of every decision. The Receipt Generator produces Ed25519-signed receipts. The Ledger maintains a SHA-256 hash chain where each entry references the previous entry's hash. The Verification CLI allows independent audit. The Nonce Registry prevents token reuse.",
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
      "Post-execution analysis and policy improvement. The Governed Corpus stores every pipeline decision as structured data. The Replay Engine re-evaluates historical decisions under modified policies. The Simulation API enables what-if analysis without affecting live operations.",
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
      "Verification Tests",
      "System Manifest",
    ],
    description:
      "The formal definition of what the system must do. 15 protocol specifications, 8 protocol invariants, 21 system invariants, JSON schemas for all data structures, a threat model with 10 identified threats, and 47 verification tests. The specification layer is implementation-independent.",
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
            className="text-base sm:text-lg leading-relaxed max-w-2xl mx-auto"
            style={{ color: "#d1d5db" }}
          >
            RIO is organized into eight layers, each with a distinct
            responsibility. The layers communicate through well-defined
            interfaces, and no layer may bypass another.
          </p>
        </div>

        {/* Architecture Diagram (ASCII-style) */}
        <div
          className="rounded-lg border p-4 sm:p-6 mb-12 sm:mb-16 overflow-x-auto"
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
│   Governance API  ·  Approval API  ·  Simulation API            │
├─────────────────────────────────────────────────────────────────┤
│                      RUNTIME LAYER                              │
│   Pipeline  ·  Policy Engine  ·  Risk Engine  ·  Authorization  │
│   Execution Gate  ·  Kill Switch  ·  Invariant Checks           │
├─────────────────────────────────────────────────────────────────┤
│                      ADAPTER LAYER                              │
│   Email  ·  File  ·  HTTP  ·  Calendar  ·  Connector Registry   │
├─────────────────────────────────────────────────────────────────┤
│                       AUDIT LAYER                               │
│   Receipt Generator  ·  Ledger (hash chain)  ·  Verification    │
│   Governance Ledger  ·  Nonce Registry                          │
├─────────────────────────────────────────────────────────────────┤
│                     IDENTITY LAYER                              │
│   Users  ·  Roles  ·  Permissions  ·  Sessions  ·  Approvals   │
├─────────────────────────────────────────────────────────────────┤
│                     LEARNING LAYER                              │
│   Governed Corpus  ·  Replay Engine  ·  Simulation API          │
├─────────────────────────────────────────────────────────────────┤
│                   SPECIFICATION LAYER                           │
│   15 Specs  ·  8 Invariants  ·  Schemas  ·  Threat Model       │
│   Verification Tests  ·  System Manifest                        │
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
                desc: "No layer may be skipped. Every action traverses the full pipeline regardless of risk level or requester role.",
              },
              {
                title: "Separation of Concerns",
                desc: "Policy evaluation, risk scoring, authorization, and execution are handled by independent modules with defined interfaces.",
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
