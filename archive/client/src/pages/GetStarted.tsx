import NavBar from "@/components/NavBar";
import { useState } from "react";
import {
  Check,
  Copy,
  Zap,
  ArrowRight,
  FolderOpen,
  Shield,
  Eye,
  FileCheck,
  Brain,
  Search,
  Link2,
  AlertTriangle,
} from "lucide-react";

function CodeBlock({ commands, label }: { commands: string[]; label?: string }) {
  const [copied, setCopied] = useState(false);
  const text = commands.join("\n");

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-lg overflow-hidden mt-3">
      {label && (
        <div
          className="px-4 py-1.5 text-xs font-medium"
          style={{ backgroundColor: "rgba(184,150,62,0.15)", color: "#b8963e" }}
        >
          {label}
        </div>
      )}
      <div
        className="px-4 py-3 font-mono text-sm leading-relaxed overflow-x-auto"
        style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
      >
        {commands.map((cmd, i) => (
          <div key={i} className="flex items-start gap-2">
            <span style={{ color: "#b8963e" }}>$</span>
            <span style={{ color: "#e5e7eb" }}>{cmd}</span>
          </div>
        ))}
      </div>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded transition-colors cursor-pointer"
        style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "#9ca3af" }}
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5" style={{ color: "#b8963e" }} />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}

function StepCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg border p-5 sm:p-6"
      style={{
        borderColor: "rgba(55,65,81,0.5)",
        backgroundColor: "rgba(17,24,39,0.4)",
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ backgroundColor: "rgba(184,150,62,0.15)", color: "#b8963e" }}
        >
          {step}
        </span>
        <h3 className="text-base sm:text-lg font-semibold" style={{ color: "#e5e7eb" }}>
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

const demoWalkthrough = [
  {
    title: "Demo 1 — Human Approval Required",
    href: "/demo1",
    icon: Shield,
    color: "#b8963e",
    description:
      "Submit a high-risk action (e.g., transfer funds) and see how RIO requires human approval before execution. Approve or deny the request and watch the full pipeline execute with v2 cryptographic receipts.",
    youllSee: [
      "Intent creation with structured parameters",
      "Risk evaluation and policy check",
      "Human approval gate",
      "v2 receipt with intent_hash, action_hash, and verification_hash",
    ],
  },
  {
    title: "Demo 2 — How RIO Enforces Approval",
    href: "/demo2",
    icon: Eye,
    color: "#60a5fa",
    description:
      "Compare what happens when you approve vs. deny a request. See how RIO generates different receipts for each outcome and how denial receipts are cryptographically signed just like approvals.",
    youllSee: [
      "Side-by-side approve vs. deny flow",
      "Denial receipts with BLOCKED execution status",
      "Ledger entries for both outcomes",
      "Hash chain linking between entries",
    ],
  },
  {
    title: "Demo 3 — Audit & Runtime Log",
    href: "/demo3",
    icon: FileCheck,
    color: "#34d399",
    description:
      "Run multiple actions and explore the full audit trail. Each action produces a receipt and ledger entry. View the complete runtime log showing every pipeline stage.",
    youllSee: [
      "Full audit trail with timestamps",
      "Receipt details with v2 cryptographic fields",
      "Runtime log of all pipeline stages",
      "Export receipts as JSON or TXT",
    ],
  },
  {
    title: "Demo 4 — Full Pipeline Walkthrough",
    href: "/demo4",
    icon: Zap,
    color: "#f59e0b",
    description:
      "Watch the complete governed execution pipeline run step by step. See every stage from intent creation through verification, receipt generation, and ledger append.",
    youllSee: [
      "All 10 pipeline stages in sequence",
      "Post-execution verification step",
      "v2 receipt with RSA-PSS signature",
      "Hash-chain ledger entry",
    ],
  },
  {
    title: "Demo 5 — Learning Loop",
    href: "/demo5",
    icon: Brain,
    color: "#a78bfa",
    description:
      "See how execution outcomes feed back into policy refinement. RIO analyzes patterns across multiple executions and proposes policy updates to improve future governance.",
    youllSee: [
      "8 scenarios run through the pipeline",
      "Pattern analysis across executions",
      "Risk distribution and approval trends",
      "Automated policy improvement proposals",
    ],
  },
  {
    title: "Verify Receipt Tool",
    href: "/verify",
    icon: Search,
    color: "#22d3ee",
    description:
      "Paste any receipt JSON and independently verify its cryptographic integrity. Check hash validity, signature verification, and look up receipts by ID.",
    youllSee: [
      "Hash recomputation and comparison",
      "RSA-PSS signature verification",
      "Receipt lookup by ID",
      "Tamper detection on modified receipts",
    ],
  },
  {
    title: "Ledger Chain Explorer",
    href: "/ledger",
    icon: Link2,
    color: "#60a5fa",
    description:
      "Browse the full hash-chain ledger. See how each entry links to the previous one via previous_ledger_hash, creating a tamper-evident chain of custody.",
    youllSee: [
      "Visual hash chain with linked indicators",
      "Entry details with all v2 fields",
      "Chain integrity verification",
      "Chronological audit trail",
    ],
  },
  {
    title: "Tamper Demo",
    href: "/tamper",
    icon: AlertTriangle,
    color: "#ef4444",
    description:
      "See what happens when someone tries to tamper with a receipt. Choose from 5 attack types and watch RIO detect the modification through cryptographic verification failure.",
    youllSee: [
      "5 tamper attack options",
      "Before vs. after comparison",
      "Cryptographic verification failure",
      "Proof that receipts are tamper-evident",
    ],
  },
];

const folderData: { path: string; desc: string }[] = [
  { path: "/spec", desc: "Protocol and architecture documentation" },
  { path: "/runtime", desc: "Execution pipeline and v2 receipt system" },
  { path: "/runtime/receipts", desc: "v2 receipt generation, signing, verification" },
  { path: "/runtime/ledger_v2", desc: "Hash-chain ledger writer and verifier" },
  { path: "/dashboard", desc: "Admin and audit dashboard" },
  { path: "/tests", desc: "57 security and pipeline tests" },
  { path: "/security", desc: "Threat model and controls" },
  { path: "/audit", desc: "Verification and replay tools" },
];

const quickStartCommands = [
  "git clone https://github.com/bkr1297-RIO/rio-protocol.git",
  "cd rio-protocol",
  "pip install -r requirements.txt",
  "python -m runtime.pipeline",
  "python -m dashboard.app",
];

export default function GetStarted() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      <NavBar />

      <div className="flex-1 px-4 sm:px-6 py-10 sm:py-16">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <h1
            className="text-3xl sm:text-4xl font-bold mb-3 text-center"
            style={{ color: "#b8963e" }}
          >
            Get Started with RIO
          </h1>
          <p
            className="text-xs sm:text-sm font-semibold tracking-[0.25em] uppercase mb-4 text-center"
            style={{ color: "#60a5fa" }}
          >
            Runtime Governance and Execution Control Plane for AI Systems
          </p>
          <p
            className="text-sm sm:text-base text-center mb-12 max-w-xl mx-auto leading-relaxed"
            style={{ color: "#9ca3af" }}
          >
            Explore RIO through interactive demos, then install it locally. Each demo
            builds on the previous one, walking you through the complete Three-Loop
            Architecture.
          </p>

          {/* Three-Loop Flow */}
          <div className="mb-12">
            <h2
              className="text-xl font-bold mb-4 text-center"
              style={{ color: "#b8963e" }}
            >
              The Three-Loop Architecture
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-medium">
              {[
                { label: "Intake", color: "#60a5fa", sub: "Goal → Intent" },
                { label: "Governance", color: "#b8963e", sub: "Policy → Approval → Execution → Verification" },
                { label: "Learning", color: "#22d3ee", sub: "Ledger → Policy Improvement" },
              ].map((loop, i, arr) => (
                <span key={loop.label} className="flex items-center gap-2">
                  <span
                    className="px-3 py-2 rounded text-center"
                    style={{
                      backgroundColor: `${loop.color}15`,
                      border: `1px solid ${loop.color}40`,
                      color: loop.color,
                    }}
                  >
                    <span className="font-bold block">{loop.label}</span>
                    <span className="text-xs opacity-80 block">{loop.sub}</span>
                  </span>
                  {i < arr.length - 1 && (
                    <ArrowRight className="w-4 h-4" style={{ color: "#b8963e" }} />
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* Guided Demo Walkthrough */}
          <div className="mb-12">
            <h2
              className="text-xl font-bold mb-2"
              style={{ color: "#b8963e" }}
            >
              Guided Walkthrough
            </h2>
            <p className="text-sm mb-6" style={{ color: "#9ca3af" }}>
              Follow these demos in order to experience the full RIO protocol. Each one
              demonstrates a different aspect of governed execution.
            </p>

            <div className="space-y-4">
              {demoWalkthrough.map((demo, i) => {
                const Icon = demo.icon;
                return (
                  <a
                    key={i}
                    href={demo.href}
                    className="block rounded-lg border p-5 transition-all hover:border-opacity-80"
                    style={{
                      borderColor: `${demo.color}30`,
                      backgroundColor: "rgba(17,24,39,0.4)",
                    }}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: `${demo.color}15` }}
                      >
                        <Icon className="w-5 h-5" style={{ color: demo.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: `${demo.color}20`,
                              color: demo.color,
                            }}
                          >
                            {i + 1}
                          </span>
                          <h3
                            className="text-base font-semibold"
                            style={{ color: "#e5e7eb" }}
                          >
                            {demo.title}
                          </h3>
                        </div>
                        <p
                          className="text-sm leading-relaxed mb-2"
                          style={{ color: "#9ca3af" }}
                        >
                          {demo.description}
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {demo.youllSee.map((item, j) => (
                            <span
                              key={j}
                              className="text-xs flex items-center gap-1"
                              style={{ color: "#6b7280" }}
                            >
                              <Check className="w-3 h-3" style={{ color: demo.color }} />
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                      <ArrowRight
                        className="w-5 h-5 flex-shrink-0 mt-2"
                        style={{ color: `${demo.color}60` }}
                      />
                    </div>
                  </a>
                );
              })}
            </div>
          </div>

          {/* Install Locally */}
          <div className="mb-12">
            <h2
              className="text-xl font-bold mb-4"
              style={{ color: "#b8963e" }}
            >
              Install Locally
            </h2>

            <div className="space-y-6">
              <StepCard step={1} title="Clone the Repository">
                <CodeBlock
                  commands={[
                    "git clone https://github.com/bkr1297-RIO/rio-protocol.git",
                    "cd rio-protocol",
                  ]}
                />
              </StepCard>

              <StepCard step={2} title="Create a Virtual Environment">
                <CodeBlock
                  commands={["python -m venv venv", "source venv/bin/activate"]}
                  label="Mac / Linux"
                />
                <CodeBlock
                  commands={["python -m venv venv", "venv\\Scripts\\activate"]}
                  label="Windows"
                />
              </StepCard>

              <StepCard step={3} title="Install Dependencies">
                <CodeBlock commands={["pip install -r requirements.txt"]} />
              </StepCard>

              <StepCard step={4} title="Run the Pipeline">
                <p className="text-sm mb-3" style={{ color: "#d1d5db" }}>
                  Run a sample governed request through the full pipeline with v2
                  cryptographic receipts.
                </p>
                <CodeBlock commands={["python -m runtime.pipeline"]} />
                <div
                  className="mt-3 rounded-lg px-4 py-3 text-sm"
                  style={{
                    backgroundColor: "rgba(184,150,62,0.06)",
                    borderLeft: "3px solid #b8963e",
                  }}
                >
                  <p className="font-medium mb-2" style={{ color: "#b8963e" }}>
                    Expected Output
                  </p>
                  <ul className="space-y-1" style={{ color: "#d1d5db" }}>
                    <li>Intent created with structured parameters</li>
                    <li>Risk evaluated and policy checked</li>
                    <li>Approval required or auto-approved</li>
                    <li>Execution simulated</li>
                    <li>Post-execution verification</li>
                    <li>v2 receipt generated with cryptographic signature</li>
                    <li>Hash-chain ledger entry written</li>
                  </ul>
                </div>
              </StepCard>

              <StepCard step={5} title="Run the Test Suite">
                <CodeBlock commands={["python -m runtime.test_harness"]} />
                <p className="text-sm mt-3" style={{ color: "#d1d5db" }}>
                  Runs all 57 tests including 10 v2 receipt/ledger tests.
                </p>
              </StepCard>

              <StepCard step={6} title="Run the Dashboard">
                <CodeBlock commands={["python -m dashboard.app"]} />
                <p className="text-sm mt-3" style={{ color: "#d1d5db" }}>
                  Then open your browser to{" "}
                  <span
                    className="font-mono px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: "rgba(0,0,0,0.3)",
                      color: "#b8963e",
                    }}
                  >
                    http://localhost:8050
                  </span>
                </p>
              </StepCard>
            </div>
          </div>

          {/* Folder Overview */}
          <div className="mb-12">
            <h2
              className="text-xl font-bold mb-4 flex items-center gap-2"
              style={{ color: "#b8963e" }}
            >
              <FolderOpen className="w-5 h-5" />
              Repository Structure
            </h2>
            <div
              className="rounded-lg border overflow-hidden"
              style={{
                borderColor: "rgba(55,65,81,0.5)",
                backgroundColor: "rgba(17,24,39,0.4)",
              }}
            >
              {folderData.map((item, i) => (
                <div
                  key={item.path}
                  className="flex items-start gap-3 px-5 py-3 text-sm"
                  style={{
                    borderTop: i > 0 ? "1px solid rgba(55,65,81,0.3)" : "none",
                  }}
                >
                  <span
                    className="font-mono font-medium flex-shrink-0 w-36"
                    style={{ color: "#b8963e" }}
                  >
                    {item.path}
                  </span>
                  <span style={{ color: "#d1d5db" }}>{item.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Start */}
          <div className="mb-12">
            <h2
              className="text-xl font-bold mb-4"
              style={{ color: "#b8963e" }}
            >
              Quick Start (Copy & Paste)
            </h2>
            <CodeBlock commands={quickStartCommands} />
            <p className="text-sm mt-3" style={{ color: "#9ca3af" }}>
              Then open{" "}
              <span
                className="font-mono px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: "rgba(0,0,0,0.3)",
                  color: "#b8963e",
                }}
              >
                http://localhost:8050
              </span>
            </p>
          </div>

          {/* Summary */}
          <div
            className="rounded-lg border p-6 text-center mb-10"
            style={{
              borderColor: "rgba(184,150,62,0.3)",
              backgroundColor: "rgba(184,150,62,0.04)",
            }}
          >
            <p
              className="text-sm sm:text-base leading-relaxed"
              style={{ color: "#d1d5db" }}
            >
              RIO is a governed execution system that sits between AI, humans, and
              real-world actions. It translates goals into structured intent, evaluates
              risk and policy, requires approval when necessary, controls execution,
              verifies outcomes, and generates cryptographically signed receipts recorded
              in a tamper-evident ledger.{" "}
              <span className="font-bold" style={{ color: "#b8963e" }}>
                The system enforces the rules, not the AI.
              </span>
            </p>
          </div>

          {/* Bottom CTA */}
          <div className="text-center">
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="/how-it-works"
                className="text-xs font-medium py-2 px-5 border rounded transition-colors hover:bg-white/5"
                style={{ borderColor: "#b8963e", color: "#b8963e" }}
              >
                How It Works
              </a>
              <a
                href="/architecture"
                className="text-xs font-medium py-2 px-5 border rounded transition-colors hover:bg-white/5"
                style={{ borderColor: "#374151", color: "#9ca3af" }}
              >
                Architecture
              </a>
              <a
                href="/demo1"
                className="text-xs font-medium py-2 px-5 border rounded transition-colors hover:bg-white/5"
                style={{ borderColor: "#374151", color: "#9ca3af" }}
              >
                Start Demo 1
              </a>
              <a
                href="https://github.com/bkr1297-RIO/rio-protocol"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium py-2 px-5 border rounded transition-colors hover:bg-white/5"
                style={{ borderColor: "#374151", color: "#9ca3af" }}
              >
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
