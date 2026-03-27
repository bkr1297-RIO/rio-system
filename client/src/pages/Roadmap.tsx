import NavBar from "@/components/NavBar";
import { CheckCircle2, Circle, Clock } from "lucide-react";

interface Milestone {
  phase: string;
  title: string;
  status: "complete" | "in-progress" | "planned";
  items: string[];
}

const milestones: Milestone[] = [
  {
    phase: "Phase 1",
    title: "Protocol Foundation",
    status: "complete",
    items: [
      "8-stage execution pipeline specification (WS1–WS8)",
      "Cryptographic receipt format with Ed25519 and ECDSA signing",
      "HMAC-SHA256 hash-chained tamper-evident ledger",
      "Fail-closed execution gate with nonce-based replay protection",
      "Independent verifier with 7-check receipt validation",
      "57 core tests, 23 conformance tests — all passing",
    ],
  },
  {
    phase: "Phase 2",
    title: "Reference Implementation",
    status: "complete",
    items: [
      "Merkaba Sovereign Engine v3.0.0 — live gateway on Replit",
      "26 API endpoints including full governance pipeline",
      "Policy engine with risk scoring and approval routing",
      "Real-time ledger with chain integrity verification",
      "5-test diagnostic pipeline (debug-test-full-flow)",
      "Gateway conformance: 7/7 tests passing",
    ],
  },
  {
    phase: "Phase 3",
    title: "Developer Ecosystem",
    status: "complete",
    items: [
      "Python SDK v0.1.0 — RIOClient, IntentBuilder, ReceiptVerifier",
      "Protocol simulator with 4 generation modes",
      "Full-cycle reference examples from live gateway captures",
      "Position paper: EGI category definition and regulatory mapping",
      "Repository restructured into 3 repos (protocol, impl, tools)",
      "Open-source readiness audit completed",
    ],
  },
  {
    phase: "Phase 4",
    title: "Standards and Certification",
    status: "in-progress",
    items: [
      "Governance framework with CERTIFICATION.md and submission checklist",
      "Compliance levels defined: L0 (Structural) through L3 (Sovereign)",
      "Release process with semantic versioning and stability guarantees",
      "Conformance test suite for third-party implementations",
      "Certification program for independent gateway operators",
      "EU AI Act Article 12 / Article 14 alignment documentation",
    ],
  },
  {
    phase: "Phase 5",
    title: "Production Hardening",
    status: "planned",
    items: [
      "HSM (Hardware Security Module) integration for key management",
      "Distributed ledger backend option for multi-party deployments",
      "Rate limiting, circuit breakers, and production observability",
      "Multi-language SDK support (TypeScript, Go, Rust)",
      "Docker and Kubernetes deployment templates",
      "Performance benchmarks and load testing suite",
    ],
  },
  {
    phase: "Phase 6",
    title: "Ecosystem Growth",
    status: "planned",
    items: [
      "Protocol v1.0 stable release with backwards compatibility guarantees",
      "Third-party gateway implementations and interoperability testing",
      "Integration guides for major AI platforms (OpenAI, Anthropic, etc.)",
      "Ledger explorer web application for audit visualization",
      "Community governance model for protocol evolution",
      "Industry working group for execution governance standards",
    ],
  },
];

function StatusIcon({ status }: { status: Milestone["status"] }) {
  if (status === "complete") {
    return <CheckCircle2 className="w-5 h-5" style={{ color: "#22c55e" }} />;
  }
  if (status === "in-progress") {
    return <Clock className="w-5 h-5" style={{ color: "#b8963e" }} />;
  }
  return <Circle className="w-5 h-5" style={{ color: "#4b5563" }} />;
}

function StatusBadge({ status }: { status: Milestone["status"] }) {
  const config = {
    complete: { label: "Complete", bg: "rgba(34,197,94,0.12)", color: "#22c55e" },
    "in-progress": { label: "In Progress", bg: "rgba(184,150,62,0.12)", color: "#b8963e" },
    planned: { label: "Planned", bg: "rgba(107,114,128,0.12)", color: "#6b7280" },
  };
  const c = config[status];
  return (
    <span
      className="text-xs font-medium px-2.5 py-1 rounded-full"
      style={{ backgroundColor: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  );
}

export default function Roadmap() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: "#0a1628",
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      <NavBar />

      <main className="flex-1 px-6 py-20">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h1
            className="text-4xl sm:text-5xl font-bold tracking-wide mb-4"
            style={{ color: "#b8963e" }}
          >
            Roadmap
          </h1>
          <p className="text-lg" style={{ color: "#9ca3af" }}>
            Protocol milestones — from foundation to ecosystem.
          </p>
        </div>

        {/* Timeline */}
        <div className="max-w-3xl mx-auto relative">
          {/* Vertical line */}
          <div
            className="absolute left-[19px] top-0 bottom-0 w-px"
            style={{ backgroundColor: "oklch(0.72 0.1 85 / 15%)" }}
          />

          <div className="space-y-8">
            {milestones.map((m, idx) => (
              <div key={idx} className="relative pl-12">
                {/* Timeline dot */}
                <div className="absolute left-[7px] top-1">
                  <StatusIcon status={m.status} />
                </div>

                <div
                  className="rounded-lg border p-6"
                  style={{
                    backgroundColor:
                      m.status === "in-progress"
                        ? "oklch(0.18 0.03 260)"
                        : "oklch(0.16 0.02 260)",
                    borderColor:
                      m.status === "in-progress"
                        ? "oklch(0.72 0.1 85 / 25%)"
                        : "oklch(0.72 0.1 85 / 12%)",
                  }}
                >
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div>
                      <span
                        className="text-xs font-medium tracking-wider uppercase"
                        style={{ color: "#6b7280" }}
                      >
                        {m.phase}
                      </span>
                      <h3
                        className="text-lg font-semibold"
                        style={{ color: "#ffffff" }}
                      >
                        {m.title}
                      </h3>
                    </div>
                    <StatusBadge status={m.status} />
                  </div>

                  <div className="space-y-2">
                    {m.items.map((item, j) => (
                      <div key={j} className="flex items-start gap-2.5">
                        <div
                          className="w-1 h-1 rounded-full mt-2 flex-shrink-0"
                          style={{
                            backgroundColor:
                              m.status === "complete"
                                ? "#22c55e"
                                : m.status === "in-progress"
                                ? "#b8963e"
                                : "#4b5563",
                          }}
                        />
                        <span
                          className="text-sm"
                          style={{
                            color:
                              m.status === "planned" ? "#6b7280" : "#d1d5db",
                          }}
                        >
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom note */}
        <div className="max-w-3xl mx-auto mt-12 text-center">
          <p className="text-sm" style={{ color: "#6b7280" }}>
            This roadmap reflects the current state of the protocol and planned
            directions. Timelines and priorities may shift as the project evolves
            and community feedback is incorporated.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer
        className="border-t py-8 text-center"
        style={{
          borderColor: "oklch(0.72 0.1 85 / 10%)",
        }}
      >
        <p className="text-xs" style={{ color: "#6b7280" }}>
          &copy; 2025–2026 RIO Protocol Authors. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
