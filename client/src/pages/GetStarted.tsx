import NavBar from "@/components/NavBar";
import { useState } from "react";
import { Check, Copy, Zap, ArrowRight, FolderOpen } from "lucide-react";

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

const folderData: { path: string; desc: string }[] = [
  { path: "/spec", desc: "Protocol and architecture documentation" },
  { path: "/runtime", desc: "Execution pipeline code" },
  { path: "/ledger", desc: "Tamper-evident ledger" },
  { path: "/dashboard", desc: "Admin and audit dashboard" },
  { path: "/tests", desc: "Security and pipeline tests" },
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
            className="text-sm sm:text-base text-center mb-12 max-w-xl mx-auto leading-relaxed"
            style={{ color: "#9ca3af" }}
          >
            This guide shows how to install and run RIO locally so you can see the governed
            execution pipeline, receipts, and ledger in action.
          </p>

          {/* Steps */}
          <div className="space-y-6">
            {/* Step 1 */}
            <StepCard step={1} title="Clone the Repository">
              <CodeBlock
                commands={[
                  "git clone https://github.com/bkr1297-RIO/rio-protocol.git",
                  "cd rio-protocol",
                ]}
              />
            </StepCard>

            {/* Step 2 */}
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

            {/* Step 3 */}
            <StepCard step={3} title="Install Dependencies">
              <CodeBlock commands={["pip install -r requirements.txt"]} />
            </StepCard>

            {/* Step 4 */}
            <StepCard step={4} title="Run the RIO Pipeline (Command Line Demo)">
              <p className="text-sm mb-3" style={{ color: "#d1d5db" }}>
                This runs a sample governed request through the full pipeline.
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
                  <li>Intent created</li>
                  <li>Risk evaluated</li>
                  <li>Approval required or approved</li>
                  <li>Execution simulated</li>
                  <li>Receipt generated</li>
                  <li>Ledger entry written</li>
                </ul>
              </div>
            </StepCard>

            {/* Step 5 */}
            <StepCard step={5} title="Run the Dashboard (UI)">
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

            {/* Step 6 */}
            <StepCard step={6} title="What to Try First">
              <div className="space-y-2 mt-1">
                {[
                  "Run a low-risk action (auto-approved)",
                  "Run a high-risk action (requires approval)",
                  "View the receipt",
                  "View the ledger",
                  "Run the replay/simulation to see how policy changes affect past decisions",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <Zap
                      className="w-4 h-4 mt-0.5 flex-shrink-0"
                      style={{ color: "#b8963e" }}
                    />
                    <span className="text-sm" style={{ color: "#d1d5db" }}>
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </StepCard>

            {/* Step 7 */}
            <StepCard step={7} title="Basic Flow">
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm font-medium">
                {[
                  "Intent",
                  "Policy Check",
                  "Approval",
                  "Execution",
                  "Receipt",
                  "Ledger",
                ].map((stage, i, arr) => (
                  <span key={stage} className="flex items-center gap-2">
                    <span
                      className="px-3 py-1.5 rounded"
                      style={{
                        backgroundColor: "rgba(184,150,62,0.1)",
                        border: "1px solid rgba(184,150,62,0.3)",
                        color: "#e5e7eb",
                      }}
                    >
                      {stage}
                    </span>
                    {i < arr.length - 1 && (
                      <ArrowRight className="w-4 h-4" style={{ color: "#b8963e" }} />
                    )}
                  </span>
                ))}
              </div>
            </StepCard>
          </div>

          {/* Folder Overview */}
          <div className="mt-12">
            <h2
              className="text-xl font-bold mb-4 flex items-center gap-2"
              style={{ color: "#b8963e" }}
            >
              <FolderOpen className="w-5 h-5" />
              Folder Overview
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
                    className="font-mono font-medium flex-shrink-0 w-28"
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
          <div className="mt-12">
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
            className="mt-12 rounded-lg border p-6 text-center"
            style={{
              borderColor: "rgba(184,150,62,0.3)",
              backgroundColor: "rgba(184,150,62,0.04)",
            }}
          >
            <p
              className="text-sm sm:text-base leading-relaxed"
              style={{ color: "#d1d5db" }}
            >
              RIO is a control layer that sits between AI/automation and real-world systems
              and ensures actions follow rules, approvals happen when required, execution is
              controlled, receipts are generated, and everything is recorded.
            </p>
          </div>

          {/* Bottom CTA */}
          <div className="mt-10 text-center">
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="/how-it-works"
                className="text-xs font-medium py-2 px-5 border rounded transition-colors hover:bg-white/5"
                style={{ borderColor: "#b8963e", color: "#b8963e" }}
              >
                How It Works
              </a>
              <a
                href="/demo1"
                className="text-xs font-medium py-2 px-5 border rounded transition-colors hover:bg-white/5"
                style={{ borderColor: "#374151", color: "#9ca3af" }}
              >
                Try the Demos
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
