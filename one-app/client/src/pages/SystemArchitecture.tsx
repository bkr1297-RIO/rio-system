/**
 * SystemArchitecture — Conceptual views of the RIO system.
 *
 * Four views in one page:
 *   1. Eight Pillars — the foundational components
 *   2. SPPAV Loop — Sense → Plan → Predict → Act → Verify
 *   3. Risk Classification — GREEN / YELLOW / RED zones
 *   4. 9-Step Governance & Execution Loop
 *
 * These are reference/educational views, not operational controls.
 * They show what the system IS, not what it's doing right now.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGatewayAuth } from "@/hooks/useGatewayAuth";
import BottomNav from "@/components/BottomNav";
import {
  ArrowLeft,
  Layers,
  RotateCcw,
  ShieldAlert,
  GitBranch,
  ChevronDown,
  ChevronUp,
  Eye,
  Brain,
  Map,
  Shield,
  UserCheck,
  Zap,
  FileCheck,
  BookOpen,
  Lightbulb,
  Lock,
  Database,
  Radio,
  Cpu,
  Users,
  ScrollText,
  Fingerprint,
  AlertOctagon,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// TAB DEFINITIONS
// ═══════════════════════════════════════════════════════════════

type TabId = "pillars" | "sppav" | "risk" | "loop";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "pillars", label: "8 Pillars", icon: <Layers className="h-3.5 w-3.5" /> },
  { id: "sppav", label: "SPPAV", icon: <RotateCcw className="h-3.5 w-3.5" /> },
  { id: "risk", label: "Risk Zones", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
  { id: "loop", label: "9-Step Loop", icon: <GitBranch className="h-3.5 w-3.5" /> },
];

// ═══════════════════════════════════════════════════════════════
// 1. EIGHT PILLARS
// ═══════════════════════════════════════════════════════════════

interface Pillar {
  num: number;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const EIGHT_PILLARS: Pillar[] = [
  {
    num: 1,
    name: "Human Sovereignty",
    description:
      "The human is the absolute root authority. No action reaches the outside world without explicit cryptographic approval. The system proposes — the human decides.",
    icon: <Fingerprint className="h-5 w-5" />,
    color: "#f59e0b",
    bgColor: "#f59e0b15",
  },
  {
    num: 2,
    name: "Three-Power Separation",
    description:
      "Observer sees but cannot act. Governor decides but cannot execute. Executor acts but cannot decide. No single component crosses its boundary.",
    icon: <Users className="h-5 w-5" />,
    color: "#60a5fa",
    bgColor: "#60a5fa15",
  },
  {
    num: 3,
    name: "Governance Gate",
    description:
      "Every intent passes through the Gate. The Gate evaluates policy, classifies risk, and determines whether human approval is required. The Gate cannot be bypassed.",
    icon: <Shield className="h-5 w-5" />,
    color: "#34d399",
    bgColor: "#34d39915",
  },
  {
    num: 4,
    name: "Cryptographic Receipts",
    description:
      "Every execution produces a cryptographic receipt with SHA-256 hashes and Ed25519 signatures. No Receipt = Did Not Happen. Receipts are the permanent proof.",
    icon: <FileCheck className="h-5 w-5" />,
    color: "#a78bfa",
    bgColor: "#a78bfa15",
  },
  {
    num: 5,
    name: "Immutable Ledger",
    description:
      "Every receipt is committed to a hash-chained ledger. Each entry links to the previous one. Tampering is immediately detectable. The ledger is the permanent record.",
    icon: <BookOpen className="h-5 w-5" />,
    color: "#f472b6",
    bgColor: "#f472b615",
  },
  {
    num: 6,
    name: "Fail-Closed Default",
    description:
      "If ambiguous, stop. If the token is invalid, stop. If the signature fails, stop. If the policy is missing, stop. The system defaults to denial, not permission.",
    icon: <Lock className="h-5 w-5" />,
    color: "#ef4444",
    bgColor: "#ef444415",
  },
  {
    num: 7,
    name: "Mutual Witness",
    description:
      "The Witness maintains mutual awareness of all human and agent actions, proposals, and system performance. Every observation, change, and risk is recorded for all parties.",
    icon: <Eye className="h-5 w-5" />,
    color: "#06b6d4",
    bgColor: "#06b6d415",
  },
  {
    num: 8,
    name: "Learning Loop",
    description:
      "The system learns from its own history. Ledger entries, approval patterns, and execution outcomes feed back into policy refinement. The system gets smarter — under governance.",
    icon: <Lightbulb className="h-5 w-5" />,
    color: "#eab308",
    bgColor: "#eab30815",
  },
];

function PillarsView() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        The eight foundational pillars of the RIO governance system. Every feature, every decision, every line of code serves one or more of these pillars.
      </p>
      {EIGHT_PILLARS.map((p) => (
        <button
          key={p.num}
          onClick={() => setExpanded(expanded === p.num ? null : p.num)}
          className="w-full text-left"
        >
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200"
            style={{ backgroundColor: expanded === p.num ? p.bgColor : "transparent" }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: p.bgColor, color: p.color }}
            >
              {p.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-mono font-bold"
                  style={{ color: p.color }}
                >
                  {p.num}
                </span>
                <span className="text-xs font-semibold text-foreground">
                  {p.name}
                </span>
              </div>
            </div>
            {expanded === p.num ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
          {expanded === p.num && (
            <div
              className="mx-3 mt-1 mb-2 px-3 py-3 rounded-lg text-xs leading-relaxed"
              style={{
                backgroundColor: "oklch(0.12 0.02 260)",
                borderLeft: `2px solid ${p.color}`,
                color: "#d1d5db",
              }}
            >
              {p.description}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 2. SPPAV LOOP
// ═══════════════════════════════════════════════════════════════

interface SppavStep {
  key: string;
  label: string;
  fullLabel: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  systemComponent: string;
}

const SPPAV_STEPS: SppavStep[] = [
  {
    key: "sense",
    label: "S",
    fullLabel: "Sense",
    icon: <Radio className="h-4 w-4" />,
    color: "#60a5fa",
    description:
      "The system monitors its environment — incoming signals, user actions, external events. The Observer captures everything without judgment.",
    systemComponent: "Observer / Mantis",
  },
  {
    key: "plan",
    label: "P",
    fullLabel: "Plan",
    icon: <Map className="h-4 w-4" />,
    color: "#34d399",
    description:
      "Intelligence processes observations into structured proposals. Goals become intents. Intents become actionable plans with parameters and targets.",
    systemComponent: "AI / Intelligence Layer",
  },
  {
    key: "predict",
    label: "P",
    fullLabel: "Predict",
    icon: <Brain className="h-4 w-4" />,
    color: "#fbbf24",
    description:
      "Before acting, the system evaluates risk. What could go wrong? What's the worst case? The Governor classifies and applies policy. Deliberate friction.",
    systemComponent: "RIO Gateway / Governor",
  },
  {
    key: "act",
    label: "A",
    fullLabel: "Act",
    icon: <Zap className="h-4 w-4" />,
    color: "#a78bfa",
    description:
      "Only after approval — cryptographic, human-signed approval — does the Executor dispatch the action through the appropriate connector. Fail-closed.",
    systemComponent: "Executor / Connectors",
  },
  {
    key: "verify",
    label: "V",
    fullLabel: "Verify",
    icon: <FileCheck className="h-4 w-4" />,
    color: "#f472b6",
    description:
      "Every execution produces a receipt. Every receipt is written to the ledger. The hash chain proves integrity. The Learning Loop feeds outcomes back into policy.",
    systemComponent: "Receipt Protocol / Ledger / Learning Loop",
  },
];

function SppavView() {
  const [activeStep, setActiveStep] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground leading-relaxed">
        The SPPAV loop is the cognitive cycle of the RIO system. Every governed action follows this pattern: Sense the environment, Plan the response, Predict the risk, Act under authority, Verify the outcome.
      </p>

      {/* Loop visualization — circular arrangement */}
      <div className="flex justify-center py-4">
        <div className="relative w-64 h-64">
          {/* Center label */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <span className="text-[10px] font-mono text-muted-foreground tracking-widest">
                SPPAV
              </span>
              <div className="text-[9px] text-muted-foreground/60 mt-0.5">
                Continuous Loop
              </div>
            </div>
          </div>

          {/* Steps arranged in a circle */}
          {SPPAV_STEPS.map((step, i) => {
            const angle = (i * 2 * Math.PI) / SPPAV_STEPS.length - Math.PI / 2;
            const radius = 100;
            const x = 132 + radius * Math.cos(angle) - 28;
            const y = 132 + radius * Math.sin(angle) - 28;
            const isActive = activeStep === step.key;

            return (
              <button
                key={step.key}
                onClick={() => setActiveStep(isActive ? null : step.key)}
                className="absolute w-14 h-14 rounded-full flex flex-col items-center justify-center transition-all duration-300"
                style={{
                  left: x,
                  top: y,
                  backgroundColor: isActive ? step.color + "30" : step.color + "15",
                  border: `2px solid ${isActive ? step.color : step.color + "40"}`,
                  boxShadow: isActive ? `0 0 16px ${step.color}30` : "none",
                }}
              >
                <div style={{ color: step.color }}>{step.icon}</div>
                <span
                  className="text-[9px] font-bold mt-0.5"
                  style={{ color: step.color }}
                >
                  {step.fullLabel}
                </span>
              </button>
            );
          })}

          {/* Connecting arrows (SVG) */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 264 264"
          >
            {SPPAV_STEPS.map((step, i) => {
              const nextI = (i + 1) % SPPAV_STEPS.length;
              const a1 = (i * 2 * Math.PI) / SPPAV_STEPS.length - Math.PI / 2;
              const a2 = (nextI * 2 * Math.PI) / SPPAV_STEPS.length - Math.PI / 2;
              const r = 100;
              const cx = 132, cy = 132;
              const x1 = cx + (r - 10) * Math.cos(a1 + 0.15);
              const y1 = cy + (r - 10) * Math.sin(a1 + 0.15);
              const x2 = cx + (r - 10) * Math.cos(a2 - 0.15);
              const y2 = cy + (r - 10) * Math.sin(a2 - 0.15);

              return (
                <line
                  key={`arrow-${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={step.color + "40"}
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />
              );
            })}
          </svg>
        </div>
      </div>

      {/* Detail panel */}
      {activeStep && (
        <div
          className="px-4 py-3 rounded-lg text-xs leading-relaxed"
          style={{
            backgroundColor: "oklch(0.12 0.02 260)",
            borderLeft: `2px solid ${SPPAV_STEPS.find((s) => s.key === activeStep)?.color}`,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className="font-semibold"
              style={{ color: SPPAV_STEPS.find((s) => s.key === activeStep)?.color }}
            >
              {SPPAV_STEPS.find((s) => s.key === activeStep)?.fullLabel}
            </span>
            <span className="text-muted-foreground/60 font-mono text-[10px]">
              {SPPAV_STEPS.find((s) => s.key === activeStep)?.systemComponent}
            </span>
          </div>
          <p style={{ color: "#d1d5db" }}>
            {SPPAV_STEPS.find((s) => s.key === activeStep)?.description}
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 3. RISK CLASSIFICATION (GREEN / YELLOW / RED)
// ═══════════════════════════════════════════════════════════════

interface RiskZone {
  zone: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  examples: string[];
  action: string;
}

const RISK_ZONES: RiskZone[] = [
  {
    zone: "GREEN",
    color: "#22c55e",
    bgColor: "#22c55e10",
    borderColor: "#22c55e30",
    description: "Auto-execute, fully record, and make visible. No external impact, no changes to existing data.",
    action: "Execute → Record → Continue",
    examples: [
      "Research and summarize information",
      "Draft documents or messages (never send)",
      "Organize or analyze existing files without altering them",
      "Run internal simulations or planning",
      "Prepare proposals or recommendations (do not execute)",
      "Record and make visible all observations",
    ],
  },
  {
    zone: "YELLOW",
    color: "#eab308",
    bgColor: "#eab30810",
    borderColor: "#eab30830",
    description:
      "Prepare fully, propose clearly with complete disclosure, pause for explicit human approval. Must include what, why, meaning, risks, worst-case, review window.",
    action: "Propose → Pause → Await Human Approval → Execute",
    examples: [
      "Send email, text, or any external communication",
      "Edit, delete, or move any file or data",
      "Move or spend money",
      "Post or share anything externally",
      "Grant access or permissions",
      "Deploy code or make live system changes",
      "Schedule meetings with external parties",
    ],
  },
  {
    zone: "RED",
    color: "#ef4444",
    bgColor: "#ef444410",
    borderColor: "#ef444430",
    description:
      "Never execute, propose, or hide. Block, fully record the attempt with context, and alert human.",
    action: "Block → Record → Alert Human",
    examples: [
      "Bypass any governance gate or receipt requirement",
      "Delete or tamper with the ledger, receipts, or Witness records",
      "Grant permanent authority to any agent",
      "Perform actions that violate core invariants",
      "Hide or omit any observation, change, risk, or worst-case scenario",
    ],
  },
];

function RiskView() {
  const [expandedZone, setExpandedZone] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground leading-relaxed mb-2">
        Every action is classified into one of three governance zones. The zone determines what the system can do autonomously and what requires human authority.
      </p>

      {RISK_ZONES.map((zone) => {
        const isExpanded = expandedZone === zone.zone;
        return (
          <button
            key={zone.zone}
            onClick={() => setExpandedZone(isExpanded ? null : zone.zone)}
            className="w-full text-left"
          >
            <div
              className="rounded-lg border px-4 py-3 transition-all duration-200"
              style={{
                backgroundColor: isExpanded ? zone.bgColor : "transparent",
                borderColor: isExpanded ? zone.borderColor : "oklch(0.3 0 0)",
              }}
            >
              {/* Zone header */}
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: zone.color }}
                />
                <span
                  className="text-sm font-bold tracking-wide"
                  style={{ color: zone.color }}
                >
                  {zone.zone}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto font-mono">
                  {zone.action}
                </span>
                {isExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>

              {/* Description */}
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                {zone.description}
              </p>

              {/* Expanded examples */}
              {isExpanded && (
                <div className="mt-3 space-y-1.5">
                  <span
                    className="text-[10px] font-semibold tracking-wide uppercase"
                    style={{ color: zone.color + "90" }}
                  >
                    Examples
                  </span>
                  {zone.examples.map((ex, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-[11px] leading-relaxed"
                      style={{ color: "#d1d5db" }}
                    >
                      <span
                        className="mt-1 w-1 h-1 rounded-full flex-shrink-0"
                        style={{ backgroundColor: zone.color + "60" }}
                      />
                      {ex}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </button>
        );
      })}

      {/* Core rule */}
      <div
        className="mt-4 px-4 py-3 rounded-lg border text-xs leading-relaxed"
        style={{
          backgroundColor: "oklch(0.12 0.02 260)",
          borderColor: "#f59e0b30",
          color: "#f59e0b",
        }}
      >
        <span className="font-semibold">The Core Rule:</span>{" "}
        <span style={{ color: "#d1d5db" }}>
          The proxy may plan, prepare, research, draft, organize, simulate, and perform any internal action inside the fence. It can never execute, edit, or change anything without explicit human approval through the Gate — even if the system believes it knows better.
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 4. NINE-STEP GOVERNANCE & EXECUTION LOOP
// ═══════════════════════════════════════════════════════════════

interface LoopStep {
  num: number;
  action: string;
  component: string;
  description: string;
  icon: React.ReactNode;
  layerColor: string;
  layer: string;
}

const LOOP_STEPS: LoopStep[] = [
  {
    num: 1,
    action: "Observe",
    component: "Mantis / Observer",
    description: "Monitors environment, receives signals, detects anomalies.",
    icon: <Eye className="h-4 w-4" />,
    layerColor: "#60a5fa",
    layer: "Intelligence",
  },
  {
    num: 2,
    action: "Analyze",
    component: "AI / Intelligence",
    description: "Processes observations, identifies patterns, determines goals.",
    icon: <Brain className="h-4 w-4" />,
    layerColor: "#60a5fa",
    layer: "Intelligence",
  },
  {
    num: 3,
    action: "Plan",
    component: "AI / Intelligence",
    description: "Translates goals into structured, proposed intents.",
    icon: <Map className="h-4 w-4" />,
    layerColor: "#60a5fa",
    layer: "Intelligence",
  },
  {
    num: 4,
    action: "Govern",
    component: "RIO Gateway",
    description: "Evaluates intent against policy, calculates risk, determines approval requirements.",
    icon: <Shield className="h-4 w-4" />,
    layerColor: "#fbbf24",
    layer: "Governance",
  },
  {
    num: 5,
    action: "Approve",
    component: "Human / Governor",
    description: "Reviews high-risk intents and provides cryptographic approval (or denial).",
    icon: <UserCheck className="h-4 w-4" />,
    layerColor: "#fbbf24",
    layer: "Governance",
  },
  {
    num: 6,
    action: "Execute",
    component: "RIO Gateway",
    description: "Performs the approved action via external connectors (fail-closed).",
    icon: <Zap className="h-4 w-4" />,
    layerColor: "#34d399",
    layer: "Execution",
  },
  {
    num: 7,
    action: "Record",
    component: "Receipt Protocol",
    description: "Generates a cryptographically signed receipt of the execution.",
    icon: <FileCheck className="h-4 w-4" />,
    layerColor: "#a78bfa",
    layer: "Witness",
  },
  {
    num: 8,
    action: "Verify",
    component: "Ledger",
    description: "Writes the receipt to the immutable, hash-chained ledger for audit.",
    icon: <BookOpen className="h-4 w-4" />,
    layerColor: "#a78bfa",
    layer: "Witness",
  },
  {
    num: 9,
    action: "Learn",
    component: "Policy Engine",
    description: "Uses ledger history and execution outcomes to refine future policies.",
    icon: <Lightbulb className="h-4 w-4" />,
    layerColor: "#6b7280",
    layer: "Feedback",
  },
];

function LoopView() {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  // Group by layer for the summary
  const layers = [
    { name: "Intelligence", color: "#60a5fa", steps: "1-3" },
    { name: "Governance", color: "#fbbf24", steps: "4-5" },
    { name: "Execution", color: "#34d399", steps: "6" },
    { name: "Witness", color: "#a78bfa", steps: "7-8" },
    { name: "Feedback", color: "#6b7280", steps: "9" },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground leading-relaxed">
        The 9-step lifecycle loop ensures every action is governed, executed, recorded, and learned from. This is the standard model for all RIO deployments.
      </p>

      {/* Layer summary bar */}
      <div className="flex gap-1 rounded-lg overflow-hidden">
        {layers.map((l) => (
          <div
            key={l.name}
            className="flex-1 py-1.5 text-center"
            style={{ backgroundColor: l.color + "20" }}
          >
            <div className="text-[9px] font-bold" style={{ color: l.color }}>
              {l.name}
            </div>
            <div className="text-[8px] text-muted-foreground/60">{l.steps}</div>
          </div>
        ))}
      </div>

      {/* Flow label */}
      <div className="text-center">
        <span className="text-[10px] font-mono text-muted-foreground tracking-wider">
          Observe → Analyze → Plan → Govern → Approve → Execute → Record → Verify → Learn
        </span>
      </div>

      {/* Steps */}
      <div className="space-y-1">
        {LOOP_STEPS.map((step) => {
          const isExpanded = expandedStep === step.num;
          return (
            <div key={step.num}>
              <button
                onClick={() => setExpandedStep(isExpanded ? null : step.num)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-left"
                style={{
                  backgroundColor: isExpanded ? step.layerColor + "15" : "transparent",
                }}
              >
                {/* Step number */}
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                  style={{
                    backgroundColor: step.layerColor + "25",
                    color: step.layerColor,
                  }}
                >
                  {step.num}
                </div>

                {/* Icon + label */}
                <div style={{ color: step.layerColor }}>{step.icon}</div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-foreground">
                    {step.action}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-2 font-mono">
                    {step.component}
                  </span>
                </div>

                {isExpanded ? (
                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                )}
              </button>

              {isExpanded && (
                <div
                  className="ml-9 mr-3 mt-1 mb-2 px-3 py-2.5 rounded-lg text-xs leading-relaxed"
                  style={{
                    backgroundColor: "oklch(0.12 0.02 260)",
                    borderLeft: `2px solid ${step.layerColor}`,
                    color: "#d1d5db",
                  }}
                >
                  {step.description}
                </div>
              )}

              {/* Connector */}
              {step.num < 9 && (
                <div
                  className="ml-[23px] h-1 w-px"
                  style={{ backgroundColor: step.layerColor + "30" }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Loop-back indicator */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px]"
        style={{
          backgroundColor: "#6b728015",
          border: "1px dashed #6b728040",
          color: "#9ca3af",
        }}
      >
        <RotateCcw className="h-3 w-3" />
        Step 9 (Learn) feeds policy updates back to Step 4 (Govern), completing the loop.
      </div>

      {/* Invariant */}
      <div
        className="text-center text-[10px] font-mono italic"
        style={{ color: "#6b7280" }}
      >
        AI proposes, humans approve, systems execute, receipts prove.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function SystemArchitecture() {
  const { isAuthenticated, loading } = useGatewayAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>("pillars");

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/");
    }
  }, [loading, isAuthenticated, navigate]);

  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-border/40 bg-card/95 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/status")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold">System Architecture</h1>
            <p className="text-[10px] text-muted-foreground">
              RIO Governance Framework
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-2xl mx-auto px-2 pb-2 flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        {activeTab === "pillars" && <PillarsView />}
        {activeTab === "sppav" && <SppavView />}
        {activeTab === "risk" && <RiskView />}
        {activeTab === "loop" && <LoopView />}
      </div>

      <BottomNav />
    </div>
  );
}
