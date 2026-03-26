import NavBar from "@/components/NavBar";
import {
  BookOpen,
  FileText,
  Shield,
  Code,
  ExternalLink,
  Download,
} from "lucide-react";

const REPO = "https://github.com/bkr1297-RIO/rio-protocol";

const docSections = [
  {
    title: "System Documentation",
    icon: BookOpen,
    description:
      "Comprehensive documentation covering every aspect of the RIO system, from high-level overview to implementation details.",
    links: [
      { label: "System Overview", href: `${REPO}/blob/main/docs/SYSTEM_OVERVIEW.md`, desc: "What RIO is, the problem it solves, and why governance is needed" },
      { label: "Architecture", href: `${REPO}/blob/main/docs/ARCHITECTURE.md`, desc: "7-layer system architecture with component descriptions" },
      { label: "Execution Flow", href: `${REPO}/blob/main/docs/EXECUTION_FLOW.md`, desc: "Step-by-step 8-stage pipeline walkthrough" },
      { label: "Ledger & Receipts", href: `${REPO}/blob/main/docs/LEDGER_AND_RECEIPTS.md`, desc: "Cryptographic receipts, hash chain, and verification" },
      { label: "Policy & Risk", href: `${REPO}/blob/main/docs/POLICY_AND_RISK.md`, desc: "Policy engine, risk scoring, versioning, and thresholds" },
      { label: "Identity & Approvals", href: `${REPO}/blob/main/docs/IDENTITY_AND_APPROVALS.md`, desc: "Users, roles, permissions, and approval workflow" },
      { label: "Simulation & Learning", href: `${REPO}/blob/main/docs/SIMULATION_AND_LEARNING.md`, desc: "Governed corpus, replay engine, and policy improvement" },
      { label: "Threat Model Summary", href: `${REPO}/blob/main/docs/THREAT_MODEL_SUMMARY.md`, desc: "6 threat categories with mitigations" },
      { label: "Enterprise Use Cases", href: `${REPO}/blob/main/docs/ENTERPRISE_USE_CASES.md`, desc: "5 real-world governance scenarios" },
      { label: "Glossary", href: `${REPO}/blob/main/docs/GLOSSARY.md`, desc: "Definitions of all key terms" },
    ],
  },
  {
    title: "Protocol Specifications",
    icon: FileText,
    description:
      "15 formal protocol specifications defining the behavior of every pipeline stage. Implementation-independent — any language or platform can implement RIO by satisfying these specs.",
    links: [
      { label: "01 — Intake Protocol", href: `${REPO}/blob/main/spec/01_intake_protocol.md`, desc: "Request reception and validation" },
      { label: "02 — Classification Protocol", href: `${REPO}/blob/main/spec/02_classification_protocol.md`, desc: "Action type and risk categorization" },
      { label: "03 — Structured Intent Protocol", href: `${REPO}/blob/main/spec/03_structured_intent_protocol.md`, desc: "Canonical intent formation" },
      { label: "04 — Policy Evaluation Protocol", href: `${REPO}/blob/main/spec/04_policy_evaluation_protocol.md`, desc: "Organizational rule evaluation" },
      { label: "05 — Risk Evaluation Protocol", href: `${REPO}/blob/main/spec/05_risk_evaluation_protocol.md`, desc: "Numeric risk scoring" },
      { label: "06 — Authorization Protocol", href: `${REPO}/blob/main/spec/06_authorization_protocol.md`, desc: "Token issuance and approval escalation" },
      { label: "07 — Execution Gate Protocol", href: `${REPO}/blob/main/spec/07_execution_gate_protocol.md`, desc: "Hard enforcement boundary" },
      { label: "08 — Receipt Protocol", href: `${REPO}/blob/main/spec/08_receipt_protocol.md`, desc: "Cryptographic receipt generation" },
      { label: "09 — Ledger Protocol", href: `${REPO}/blob/main/spec/09_ledger_protocol.md`, desc: "Hash-linked audit entries" },
      { label: "10 — Governance Learning Protocol", href: `${REPO}/blob/main/spec/10_governance_learning_protocol.md`, desc: "Corpus analysis and policy improvement" },
      { label: "Protocol Invariants", href: `${REPO}/blob/main/spec/protocol_invariants.md`, desc: "8 invariants that must hold at all times" },
      { label: "System Invariants", href: `${REPO}/blob/main/spec/system_invariants.md`, desc: "21 system-wide invariants" },
      { label: "Threat Model", href: `${REPO}/blob/main/spec/threat_model.md`, desc: "10 identified threats with mitigations" },
      { label: "Verification Tests", href: `${REPO}/blob/main/spec/verification_tests.md`, desc: "47 tests across 12 suites" },
    ],
  },
  {
    title: "Security & Verification",
    icon: Shield,
    description:
      "Tools and documentation for independently verifying the integrity of the system, its ledger, and its receipts.",
    links: [
      { label: "Ledger Verification CLI", href: `${REPO}/blob/main/runtime/governance/verify_ledger.py`, desc: "Independently verify the tamper-evident hash chain" },
      { label: "Ledger Immutability Model", href: `${REPO}/blob/main/spec/ledger_immutability_model.md`, desc: "Formal model of ledger tamper detection" },
      { label: "JSON Schemas", href: `${REPO}/tree/main/schemas`, desc: "Validation schemas for all data structures" },
      { label: "System Manifest", href: `${REPO}/blob/main/manifest/rio_system_manifest.json`, desc: "Machine-readable system configuration" },
    ],
  },
  {
    title: "Source Code & Examples",
    icon: Code,
    description:
      "The full implementation, example integrations, and demo scripts.",
    links: [
      { label: "GitHub Repository", href: REPO, desc: "Full source code, specs, docs, and tests" },
      { label: "Governed Agent Example", href: `${REPO}/tree/main/examples/governed_agent`, desc: "Example AI agent using RIO for governed execution" },
      { label: "Demo Script", href: `${REPO}/blob/main/demo/demo_script.md`, desc: "7-minute narrated demo script" },
      { label: "Demo Walkthrough", href: `${REPO}/blob/main/demo/demo_walkthrough.md`, desc: "Technical walkthrough of a governed transfer" },
    ],
  },
];

const whitepapers = [
  {
    title: "RIO Protocol Whitepaper v2",
    author: "Brian K. Rasmussen",
    desc: "Complete technical whitepaper covering the governed execution model, protocol design, threat model, and enterprise applications.",
    href: `${REPO}/blob/main/whitepaper/rio_protocol_whitepaper_v2.md`,
    pdfHref: `${REPO}/blob/main/whitepaper/rio_protocol_whitepaper_v2.pdf`,
  },
  {
    title: "RIO Protocol Whitepaper v1",
    author: "Brian K. Rasmussen",
    desc: "Original whitepaper establishing the foundational concepts of runtime intelligence orchestration.",
    href: `${REPO}/blob/main/whitepaper/rio_protocol_whitepaper.md`,
    pdfHref: null,
  },
];

export default function Docs() {
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
            Documentation
          </h1>
          <p
            className="text-base sm:text-lg leading-relaxed max-w-2xl mx-auto"
            style={{ color: "#d1d5db" }}
          >
            Everything you need to understand, evaluate, and implement the RIO
            Protocol. All documentation is open source and available on GitHub.
          </p>
        </div>

        {/* Whitepapers */}
        <div className="mb-12 sm:mb-16">
          <h2
            className="text-2xl font-bold mb-6"
            style={{ color: "#b8963e" }}
          >
            Whitepapers
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {whitepapers.map((wp) => (
              <div
                key={wp.title}
                className="rounded-lg border p-5"
                style={{
                  backgroundColor: "oklch(0.18 0.03 260)",
                  borderColor: "oklch(0.72 0.1 85 / 15%)",
                }}
              >
                <h3
                  className="text-base font-bold mb-1"
                  style={{ color: "#d1d5db" }}
                >
                  {wp.title}
                </h3>
                <p className="text-xs mb-2" style={{ color: "#6b7280" }}>
                  By {wp.author}
                </p>
                <p className="text-sm mb-3" style={{ color: "#9ca3af" }}>
                  {wp.desc}
                </p>
                <div className="flex gap-3">
                  <a
                    href={wp.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium no-underline transition-opacity hover:opacity-80"
                    style={{ color: "#b8963e" }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Read on GitHub
                  </a>
                  {wp.pdfHref && (
                    <a
                      href={wp.pdfHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium no-underline transition-opacity hover:opacity-80"
                      style={{ color: "#9ca3af" }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      PDF
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* v1 vs v2 Receipt Comparison */}
        <div className="mb-12 sm:mb-16">
          <h2
            className="text-2xl font-bold mb-4"
            style={{ color: "#b8963e" }}
          >
            v1 vs v2 Receipt Comparison
          </h2>
          <p
            className="text-sm leading-relaxed mb-6"
            style={{ color: "#d1d5db" }}
          >
            The v2 receipt system introduces cryptographic hashing, post-execution verification,
            risk scoring, and hash-chain ledger entries. Below is a side-by-side comparison of
            what changed between v1 and v2.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid oklch(0.72 0.1 85 / 25%)" }}>
                  <th className="text-left py-2.5 px-3 font-bold" style={{ color: "#b8963e" }}>Field / Feature</th>
                  <th className="text-left py-2.5 px-3 font-bold" style={{ color: "#9ca3af" }}>v1 Receipt</th>
                  <th className="text-left py-2.5 px-3 font-bold" style={{ color: "#22d3ee" }}>v2 Receipt</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Protocol Version", "Not specified", "protocol_version: \"v2\""],
                  ["Receipt ID", "receipt_id (UUID)", "receipt_id (UUID) \u2014 unchanged"],
                  ["Intent Hash", "Not present", "intent_hash (SHA-256 of intent payload)"],
                  ["Action Hash", "Not present", "action_hash (SHA-256 of action + params)"],
                  ["Verification Hash", "Not present", "verification_hash (SHA-256 of verification result)"],
                  ["Verification Status", "Not present", "verification_status: verified | failed | skipped"],
                  ["Risk Score", "Not present", "risk_score (0\u2013100 numeric)"],
                  ["Risk Category", "Not present", "risk_category: LOW | MEDIUM | HIGH"],
                  ["Timestamps", "requested_at, decided_at, executed_at", "Same fields \u2014 ISO 8601 format enforced"],
                  ["Signature", "hash (SHA-256 of payload)", "signature (RSA-PSS 2048-bit, base64)"],
                  ["Hash Field", "hash (receipt integrity)", "receipt_hash (SHA-256 of canonical payload)"],
                  ["Ledger Entry", "block_index, current_hash, previous_hash", "Same + previous_ledger_hash for chain verification"],
                  ["Denial Receipts", "Basic denial record", "Full v2 denial receipt with signature + ledger entry"],
                  ["Tamper Detection", "Hash comparison only", "RSA-PSS signature + hash chain + independent verification"],
                  ["Test Coverage", "47 tests across 12 suites", "57 tests across 14 suites (10 new v2 tests)"],
                ].map(([field, v1, v2], i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: "1px solid oklch(0.72 0.1 85 / 8%)" }}
                  >
                    <td className="py-2 px-3 font-medium" style={{ color: "#d1d5db" }}>{field}</td>
                    <td className="py-2 px-3" style={{ color: "#6b7280" }}>{v1}</td>
                    <td className="py-2 px-3" style={{ color: "#22d3ee" }}>{v2}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            className="mt-4 rounded border p-3"
            style={{
              backgroundColor: "oklch(0.18 0.03 260)",
              borderColor: "oklch(0.72 0.1 85 / 10%)",
            }}
          >
            <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
              <span className="font-bold" style={{ color: "#b8963e" }}>Upgrade path:</span>{" "}
              v2 is backward-compatible. During transition, the pipeline generates both v1 and v2
              receipts. Existing integrations continue to work with v1 fields while new consumers
              can use the enhanced v2 fields for stronger verification.
            </p>
          </div>
        </div>

        {/* Doc Sections */}
        <div className="space-y-10">
          {docSections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.title}>
                <div className="flex items-center gap-3 mb-3">
                  <Icon className="w-5 h-5" style={{ color: "#b8963e" }} />
                  <h2
                    className="text-xl sm:text-2xl font-bold"
                    style={{ color: "#b8963e" }}
                  >
                    {section.title}
                  </h2>
                </div>
                <p
                  className="text-sm sm:text-base leading-relaxed mb-4"
                  style={{ color: "#d1d5db" }}
                >
                  {section.description}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {section.links.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border p-3 no-underline transition-colors duration-150 hover:bg-white/[3%] group"
                      style={{
                        backgroundColor: "oklch(0.18 0.03 260)",
                        borderColor: "oklch(0.72 0.1 85 / 10%)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div
                            className="text-sm font-medium mb-0.5"
                            style={{ color: "#d1d5db" }}
                          >
                            {link.label}
                          </div>
                          <div className="text-xs" style={{ color: "#6b7280" }}>
                            {link.desc}
                          </div>
                        </div>
                        <ExternalLink
                          className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: "#b8963e" }}
                        />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Related Research */}
        <div className="mt-12 sm:mt-16">
          <h2
            className="text-xl sm:text-2xl font-bold mb-4"
            style={{ color: "#b8963e" }}
          >
            Related Research
          </h2>
          <a
            href="https://github.com/bkr1297-RIO/AI-Structural-Limitations-of-the-dyad"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border p-4 no-underline transition-colors duration-150 hover:bg-white/[3%] block"
            style={{
              backgroundColor: "oklch(0.18 0.03 260)",
              borderColor: "oklch(0.72 0.1 85 / 15%)",
            }}
          >
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 flex-shrink-0" style={{ color: "#b8963e" }} />
              <div>
                <div className="text-sm font-medium" style={{ color: "#d1d5db" }}>
                  Structural Limitations of the Dyad
                </div>
                <div className="text-xs" style={{ color: "#6b7280" }}>
                  Research on structural limitations of two-party human-AI systems — the foundational analysis that led to the RIO Protocol.
                </div>
              </div>
              <ExternalLink className="w-4 h-4 flex-shrink-0" style={{ color: "#b8963e" }} />
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
