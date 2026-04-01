import NavBar from "@/components/NavBar";
import {
  Shield,
  Lock,
  FileCheck,
  Link2,
  Eye,
  AlertTriangle,
  Users,
  Scale,
  ArrowRight,
  ExternalLink,
  Lightbulb,
  ShieldCheck,
  Brain,
  Download,
} from "lucide-react";

const PIPELINE_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio-pipeline-diagram_83cd2f2a.png";

const THREE_LOOP_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio-three-loop-architecture-cXmE4c9PUWSiQwdpeFEirt.webp";

/* ── Section data ──────────────────────────────────────────────── */

const pipelineStages = [
  { num: "1", name: "Intake", desc: "Raw goal or agent request received" },
  {
    num: "2",
    name: "Discovery & Refinement",
    desc: "Vague requests translated into a structured intent (action, target, parameters, requester identity). AI refinement is advisory; a human/system confirms the final intent.",
  },
  { num: "3", name: "Classification", desc: "Action type identified, risk category assigned" },
  {
    num: "4",
    name: "Policy & Risk Evaluation",
    desc: "Policy engine checks active rules; 4-component risk score calculated",
  },
  {
    num: "5",
    name: "Authorization",
    desc: "If risk exceeds threshold, human approver is notified. Upon approval, an Execution Token is generated (signed, TTL-bound, single-use nonce)",
  },
  {
    num: "6",
    name: "Execution Gate",
    desc: "Verifies token signature, timestamp, nonce, and kill switch before releasing the action. FAIL-CLOSED.",
  },
  {
    num: "7",
    name: "Post-Execution Verification",
    desc: "Computes three SHA-256 hashes: intent_hash (what was authorized), action_hash (what was executed), verification_hash (what was observed)",
  },
  {
    num: "8",
    name: "Receipt & Ledger",
    desc: "Signed v2 receipt created and recorded in the signed hash-chained ledger",
  },
];

const threeLoops = [
  {
    name: "Intake Loop",
    color: "#60a5fa",
    icon: Lightbulb,
    flow: "Goal → structured intent (Universal Grammar Layer)",
  },
  {
    name: "Governance Loop",
    color: "#b8963e",
    icon: ShieldCheck,
    flow: "Risk → policy → approval → token → gate → verify → receipt → ledger",
  },
  {
    name: "Learning Loop",
    color: "#22d3ee",
    icon: Brain,
    flow: "Analyzes audit trail, proposes policy updates via replay/simulation. Cannot bypass governance or execute actions directly.",
  },
];

const threats = [
  { threat: "Unauthorized execution", mitigation: "Fail-closed gate — no token = no execution" },
  { threat: "Replay attacks", mitigation: "Nonce registry — single-use tokens" },
  { threat: "Stale authorization", mitigation: "TTL expiry (default 300s)" },
  { threat: "Audit tampering", mitigation: "Hash-chained ledger + per-entry signatures" },
  { threat: "Forgery", mitigation: "Ed25519/ECDSA signatures on receipts" },
  { threat: "Silent denials", mitigation: "Denial receipts — blocked actions are auditable" },
];

const outOfScope = [
  "Data governance (training data quality/bias)",
  "Model transparency/explainability",
  "Accuracy/robustness",
  "Content safety/guardrails",
  "Full lifecycle logging beyond execution",
  "GDPR retention/minimization",
  "HSM key management",
];

const regulatoryMapping = [
  {
    framework: "EU AI Act",
    articles: "Art. 12, Art. 14, Art. 9",
    mechanism: "Receipts/ledger (record-keeping), fail-closed gate (human oversight), risk engine (risk management)",
  },
  {
    framework: "NIST AI RMF",
    articles: "GOVERN, MAP, MEASURE, MANAGE",
    mechanism: "Policy engine, intake loop, risk scoring, approval gate",
  },
  {
    framework: "ISO 42001",
    articles: "A.6.2.8",
    mechanism: "Automatic signed receipts (event logging)",
  },
];

const guarantees = [
  {
    title: "No execution without authorization",
    icon: Lock,
    desc: "The execution gate is fail-closed. Without a valid, signed, unexpired, unreplayed token, nothing executes.",
  },
  {
    title: "Past records cannot be altered",
    icon: Link2,
    desc: "The hash-chained ledger means modifying any entry invalidates all subsequent hashes. Tampering is detectable by any independent party.",
  },
  {
    title: "Approvals cannot be forged",
    icon: FileCheck,
    desc: "Ed25519/ECDSA signatures on receipts. Forgery is detectable without access to the signing key.",
  },
  {
    title: "Tokens cannot be replayed",
    icon: Shield,
    desc: "Single-use nonce registry. Every token is consumed on first use and rejected on any subsequent attempt.",
  },
];

/* ── Helpers ───────────────────────────────────────────────────── */

function SectionHeading({
  id,
  num,
  title,
}: {
  id: string;
  num: string;
  title: string;
}) {
  return (
    <h2
      id={id}
      className="text-2xl sm:text-3xl font-bold mt-16 mb-6 scroll-mt-24"
      style={{ color: "#b8963e" }}
    >
      <span style={{ color: "#60a5fa" }}>{num}.</span> {title}
    </h2>
  );
}

/* ── Main Component ────────────────────────────────────────────── */

export default function Architecture() {
  const sections = [
    { id: "pipeline", label: "Pipeline" },
    { id: "receipts", label: "Receipts" },
    { id: "ledger", label: "Ledger" },
    { id: "verification", label: "Verification" },
    { id: "threat-model", label: "Threat Model" },
    { id: "trust-model", label: "Trust Model" },
    { id: "regulatory", label: "Regulatory" },
  ];

  return (
    <div
      className="min-h-screen"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      <NavBar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="text-center mb-8">
          <p
            className="text-xs sm:text-sm font-semibold tracking-[0.25em] uppercase mb-3"
            style={{ color: "#60a5fa" }}
          >
            Execution Governance Infrastructure
          </p>
          <h1
            className="text-3xl sm:text-5xl font-bold mb-4"
            style={{ color: "#b8963e" }}
          >
            Architecture
          </h1>
          <p
            className="text-base sm:text-lg leading-relaxed max-w-3xl mx-auto mb-2"
            style={{ color: "#d1d5db" }}
          >
            RIO is not a model. It is a{" "}
            <strong style={{ color: "#b8963e" }}>governed execution protocol</strong>{" "}
            that sits between an agent and the real world. It does not advise. It gates.
          </p>
          <p
            className="text-sm italic max-w-2xl mx-auto"
            style={{ color: "#9ca3af" }}
          >
            Version 2.0 — Reference implementation: 143 tests, 0 failures
          </p>
        </div>

        {/* Design Principle callout */}
        <div
          className="rounded-lg border-l-4 px-5 py-4 mb-10"
          style={{
            backgroundColor: "oklch(0.18 0.03 260)",
            borderColor: "#b8963e",
          }}
        >
          <p className="text-sm sm:text-base font-medium" style={{ color: "#d1d5db" }}>
            <strong style={{ color: "#b8963e" }}>Design principle: fail-closed.</strong>{" "}
            If any condition cannot be positively verified, the execution gate remains locked.
            This is the inverse of most AI systems ("proceed unless blocked").
          </p>
        </div>

        {/* ── TOC ─────────────────────────────────────────────────── */}
        <nav className="mb-12">
          <div className="flex flex-wrap gap-2 justify-center">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="px-3 py-1.5 rounded text-xs sm:text-sm font-medium transition-colors duration-200 hover:bg-white/10"
                style={{
                  color: "#d1d5db",
                  border: "1px solid oklch(0.72 0.1 85 / 20%)",
                }}
              >
                {s.label}
              </a>
            ))}
          </div>
        </nav>

        {/* ── Guarantees ──────────────────────────────────────────── */}
        <div className="mb-12">
          <h2
            className="text-2xl font-bold mb-6 text-center"
            style={{ color: "#b8963e" }}
          >
            What RIO Guarantees
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {guarantees.map((g) => {
              const Icon = g.icon;
              return (
                <div
                  key={g.title}
                  className="rounded-lg border p-5"
                  style={{
                    backgroundColor: "oklch(0.18 0.03 260)",
                    borderColor: "oklch(0.72 0.1 85 / 15%)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: "oklch(0.72 0.1 85 / 10%)" }}
                    >
                      <Icon className="w-4 h-4" style={{ color: "#b8963e" }} />
                    </div>
                    <div>
                      <h4
                        className="text-sm font-bold mb-1"
                        style={{ color: "#b8963e" }}
                      >
                        {g.title}
                      </h4>
                      <p className="text-xs sm:text-sm" style={{ color: "#9ca3af" }}>
                        {g.desc}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 1. Pipeline ─────────────────────────────────────────── */}
        <SectionHeading id="pipeline" num="1" title="The 8-Stage Execution Pipeline" />

        <p className="text-sm sm:text-base leading-relaxed mb-6" style={{ color: "#d1d5db" }}>
          Every action passes through an 8-stage pipeline before execution is permitted.
          The pipeline is enforced by the Execution/Governance Loop:
        </p>

        {/* Pipeline Diagram */}
        <div
          className="rounded-lg border p-4 sm:p-6 mb-8"
          style={{
            backgroundColor: "oklch(0.12 0.03 260)",
            borderColor: "oklch(0.72 0.1 85 / 20%)",
          }}
        >
          <img
            src={PIPELINE_IMG}
            alt="RIO 8-Stage Governed Execution Pipeline"
            className="w-full max-w-2xl mx-auto rounded"
          />
        </div>

        {/* Stage Cards */}
        <div className="space-y-3 mb-8">
          {pipelineStages.map((s) => (
            <div
              key={s.num}
              className="rounded-lg border p-4 flex items-start gap-4"
              style={{
                backgroundColor: "oklch(0.18 0.03 260)",
                borderColor: "oklch(0.72 0.1 85 / 12%)",
              }}
            >
              <div
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{
                  backgroundColor: "oklch(0.72 0.1 85 / 15%)",
                  color: "#b8963e",
                }}
              >
                {s.num}
              </div>
              <div>
                <h4 className="text-sm font-bold mb-0.5" style={{ color: "#b8963e" }}>
                  {s.name}
                </h4>
                <p className="text-xs sm:text-sm" style={{ color: "#9ca3af" }}>
                  {s.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Denial callout */}
        <div
          className="rounded-lg border-l-4 px-5 py-4 mb-8"
          style={{
            backgroundColor: "oklch(0.18 0.03 260)",
            borderColor: "#ef4444",
          }}
        >
          <p className="text-sm" style={{ color: "#d1d5db" }}>
            <strong style={{ color: "#ef4444" }}>Denials are first-class:</strong>{" "}
            Blocked or denied actions generate <em>denial receipts</em> and are recorded in the ledger.
            The audit trail covers every decision, not just successes.
          </p>
        </div>

        {/* Three-Loop Architecture */}
        <h3 className="text-xl font-bold mb-4" style={{ color: "#b8963e" }}>
          Three-Loop Architecture
        </h3>

        <div
          className="rounded-lg border p-4 sm:p-6 mb-6"
          style={{
            backgroundColor: "oklch(0.12 0.03 260)",
            borderColor: "oklch(0.72 0.1 85 / 20%)",
          }}
        >
          <img
            src={THREE_LOOP_IMG}
            alt="RIO Three-Loop Architecture"
            className="w-full max-w-4xl mx-auto rounded"
          />
        </div>

        <div className="space-y-3 mb-8">
          {threeLoops.map((loop) => {
            const Icon = loop.icon;
            return (
              <div
                key={loop.name}
                className="rounded-lg border p-4 flex items-start gap-3"
                style={{
                  backgroundColor: "oklch(0.18 0.03 260)",
                  borderColor: `${loop.color}25`,
                }}
              >
                <div
                  className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${loop.color}15` }}
                >
                  <Icon className="w-4 h-4" style={{ color: loop.color }} />
                </div>
                <div>
                  <h4 className="text-sm font-bold mb-0.5" style={{ color: loop.color }}>
                    {loop.name}
                  </h4>
                  <p className="text-xs sm:text-sm" style={{ color: "#9ca3af" }}>
                    {loop.flow}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── 2. Receipts ─────────────────────────────────────────── */}
        <SectionHeading id="receipts" num="2" title="Receipts — The Three-Hash Binding" />

        <p className="text-sm sm:text-base leading-relaxed mb-6" style={{ color: "#d1d5db" }}>
          A v2 receipt is a cryptographically signed record of a single decision (approval or denial).
          The three hashes cryptographically bind <em>what was intended, what was executed, and what
          actually happened</em>. A mismatch proves drift, tampering, or execution error.
        </p>

        <div
          className="rounded-lg border p-5 mb-6"
          style={{
            backgroundColor: "oklch(0.12 0.03 260)",
            borderColor: "oklch(0.72 0.1 85 / 20%)",
          }}
        >
          <pre
            className="text-xs sm:text-sm leading-relaxed"
            style={{
              color: "#d1d5db",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
          >
{`Receipt v2 Contents:
├── intent_hash    (SHA-256)  — what was authorized
├── action_hash    (SHA-256)  — what was executed
├── verification_hash (SHA-256) — what was observed
├── risk_score     (4-component)
├── policy_decision
├── timestamps     (requested, authorized, executed/denied)
├── requester_id + approver_id
├── policy_version + packet_references
└── signature      (Ed25519 / ECDSA)`}
          </pre>
        </div>

        <p className="text-sm" style={{ color: "#9ca3af" }}>
          Receipts are signed with Ed25519/ECDSA. Forgery is detectable without access to the signing key.
        </p>

        {/* ── 3. Ledger ───────────────────────────────────────────── */}
        <SectionHeading id="ledger" num="3" title="Ledger — Tamper-Evident History" />

        <p className="text-sm sm:text-base leading-relaxed mb-6" style={{ color: "#d1d5db" }}>
          The v2 ledger is a signed hash chain. Each entry references the previous entry's hash.
          Any modification to any entry invalidates all subsequent hashes.
        </p>

        <div
          className="rounded-lg border p-5 mb-6"
          style={{
            backgroundColor: "oklch(0.12 0.03 260)",
            borderColor: "oklch(0.72 0.1 85 / 20%)",
          }}
        >
          <pre
            className="text-sm sm:text-base font-bold text-center"
            style={{
              color: "#b8963e",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
          >
            {"Hn = SHA256( En.data + H(n-1) )"}
          </pre>
        </div>

        <p className="text-sm mb-4" style={{ color: "#9ca3af" }}>
          Each entry also carries its own signature for independent verification.
          The ledger is append-only. Current implementation is single-node (distributed ledger is future work).
        </p>

        {/* ── 4. Verification ─────────────────────────────────────── */}
        <SectionHeading id="verification" num="4" title="Verification — Independent Audit" />

        <p className="text-sm sm:text-base leading-relaxed mb-6" style={{ color: "#d1d5db" }}>
          RIO provides two standalone verification tools. No trust in the runtime is required:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div
            className="rounded-lg border p-5"
            style={{
              backgroundColor: "oklch(0.18 0.03 260)",
              borderColor: "oklch(0.72 0.1 85 / 15%)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <FileCheck className="w-4 h-4" style={{ color: "#b8963e" }} />
              <h4 className="text-sm font-bold" style={{ color: "#b8963e" }}>
                Receipt Verifier
              </h4>
            </div>
            <p className="text-xs sm:text-sm" style={{ color: "#9ca3af" }}>
              Validates signature, recomputes hashes, checks TTL/nonce
            </p>
          </div>
          <div
            className="rounded-lg border p-5"
            style={{
              backgroundColor: "oklch(0.18 0.03 260)",
              borderColor: "oklch(0.72 0.1 85 / 15%)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Eye className="w-4 h-4" style={{ color: "#b8963e" }} />
              <h4 className="text-sm font-bold" style={{ color: "#b8963e" }}>
                Ledger Verifier
              </h4>
            </div>
            <p className="text-xs sm:text-sm" style={{ color: "#9ca3af" }}>
              Recomputes the hash chain and verifies per-entry signatures
            </p>
          </div>
        </div>

        <h4 className="text-sm font-bold mb-3" style={{ color: "#d1d5db" }}>
          How to verify (no access to RIO needed):
        </h4>
        <div className="space-y-2 mb-6">
          {[
            "Recompute Hn = SHA256(En.data + H(n-1)) — mismatch = tampering",
            "Verify Ed25519 signature against public key",
            "Submit a used nonce → system rejects (replay protection)",
            "Submit expired token → system rejects (TTL default 300s)",
            "Attempt execution without token → gate remains locked",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
                style={{
                  backgroundColor: "oklch(0.72 0.1 85 / 15%)",
                  color: "#b8963e",
                }}
              >
                {i + 1}
              </span>
              <p className="text-xs sm:text-sm" style={{ color: "#9ca3af" }}>
                {step}
              </p>
            </div>
          ))}
        </div>

        <div
          className="rounded-lg border px-5 py-3 mb-4"
          style={{
            backgroundColor: "oklch(0.15 0.03 260)",
            borderColor: "oklch(0.72 0.1 85 / 15%)",
          }}
        >
          <p className="text-xs sm:text-sm" style={{ color: "#9ca3af" }}>
            <strong style={{ color: "#b8963e" }}>Test harness:</strong>{" "}
            143 automated tests across 12 suites — Core Pipeline, Cryptographic Verification,
            v2 Receipt System, Denial & Edge Cases, Audit & Traceability, Governance Model,
            Conformance, Gateway, Independent Verifier, SDK, and Simulator.
          </p>
        </div>

        {/* ── 5. Threat Model ─────────────────────────────────────── */}
        <SectionHeading id="threat-model" num="5" title="Threat Model" />

        <p className="text-sm sm:text-base leading-relaxed mb-6" style={{ color: "#d1d5db" }}>
          RIO mitigates execution-layer threats in autonomous AI environments:
        </p>

        {/* Threats table */}
        <div className="rounded-lg border overflow-hidden mb-6" style={{ borderColor: "oklch(0.72 0.1 85 / 15%)" }}>
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: "oklch(0.15 0.03 260)" }}>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: "#b8963e" }}>
                  Threat
                </th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: "#b8963e" }}>
                  Mitigation
                </th>
              </tr>
            </thead>
            <tbody>
              {threats.map((t, i) => (
                <tr
                  key={i}
                  style={{
                    backgroundColor: i % 2 === 0 ? "oklch(0.18 0.03 260)" : "oklch(0.16 0.03 260)",
                  }}
                >
                  <td className="px-4 py-3 text-xs sm:text-sm font-medium" style={{ color: "#d1d5db" }}>
                    <AlertTriangle className="w-3 h-3 inline mr-1.5" style={{ color: "#ef4444" }} />
                    {t.threat}
                  </td>
                  <td className="px-4 py-3 text-xs sm:text-sm" style={{ color: "#9ca3af" }}>
                    {t.mitigation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Out of scope */}
        <div
          className="rounded-lg border-l-4 px-5 py-4 mb-4"
          style={{
            backgroundColor: "oklch(0.18 0.03 260)",
            borderColor: "#6b7280",
          }}
        >
          <p className="text-sm font-bold mb-2" style={{ color: "#9ca3af" }}>
            Out of scope (by design):
          </p>
          <div className="flex flex-wrap gap-2">
            {outOfScope.map((item) => (
              <span
                key={item}
                className="px-2 py-1 rounded text-[10px] sm:text-xs"
                style={{
                  backgroundColor: "oklch(0.15 0.03 260)",
                  color: "#6b7280",
                  border: "1px solid oklch(0.3 0 0)",
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <p className="text-sm italic mb-2" style={{ color: "#9ca3af" }}>
          RIO governs <em>what AI systems do</em>, not what they are trained on or what they say.
        </p>
        <a
          href="https://github.com/bkr1297-RIO/rio-protocol/blob/main/docs/Threat_Model.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs inline-flex items-center gap-1 hover:underline"
          style={{ color: "#60a5fa" }}
        >
          Full Threat Model <ExternalLink className="w-3 h-3" />
        </a>

        {/* ── 6. Trust Model ──────────────────────────────────────── */}
        <SectionHeading id="trust-model" num="6" title="Trust Model" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Must trust */}
          <div
            className="rounded-lg border p-5"
            style={{
              backgroundColor: "oklch(0.18 0.03 260)",
              borderColor: "oklch(0.72 0.1 85 / 15%)",
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4" style={{ color: "#b8963e" }} />
              <h4 className="text-sm font-bold" style={{ color: "#b8963e" }}>
                Who you must trust
              </h4>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-bold" style={{ color: "#d1d5db" }}>
                  The signing key holder
                </p>
                <p className="text-[10px] sm:text-xs" style={{ color: "#6b7280" }}>
                  For the authenticity of approvals. Keys are currently software-managed (HSM integration is future work).
                </p>
              </div>
              <div>
                <p className="text-xs font-bold" style={{ color: "#d1d5db" }}>
                  The policy author
                </p>
                <p className="text-[10px] sm:text-xs" style={{ color: "#6b7280" }}>
                  For the correctness of rules. Policies are versioned and recorded on receipts.
                </p>
              </div>
            </div>
          </div>

          {/* Do not need to trust */}
          <div
            className="rounded-lg border p-5"
            style={{
              backgroundColor: "oklch(0.18 0.03 260)",
              borderColor: "oklch(0.72 0.1 85 / 15%)",
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4" style={{ color: "#22d3ee" }} />
              <h4 className="text-sm font-bold" style={{ color: "#22d3ee" }}>
                Who you do NOT need to trust
              </h4>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-bold" style={{ color: "#d1d5db" }}>
                  The runtime operator
                </p>
                <p className="text-[10px] sm:text-xs" style={{ color: "#6b7280" }}>
                  Receipts and ledger are independently verifiable.
                </p>
              </div>
              <div>
                <p className="text-xs font-bold" style={{ color: "#d1d5db" }}>
                  The agent
                </p>
                <p className="text-[10px] sm:text-xs" style={{ color: "#6b7280" }}>
                  It cannot execute without a valid token.
                </p>
              </div>
              <div>
                <p className="text-xs font-bold" style={{ color: "#d1d5db" }}>
                  The audit system
                </p>
                <p className="text-[10px] sm:text-xs" style={{ color: "#6b7280" }}>
                  Hash chain + signatures detect tampering.
                </p>
              </div>
            </div>
          </div>
        </div>

        <a
          href="https://github.com/bkr1297-RIO/rio-protocol/blob/main/docs/Trust_Model.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs inline-flex items-center gap-1 hover:underline"
          style={{ color: "#60a5fa" }}
        >
          Full Trust Model <ExternalLink className="w-3 h-3" />
        </a>

        {/* ── 7. Regulatory Alignment ─────────────────────────────── */}
        <SectionHeading id="regulatory" num="7" title="Regulatory Alignment" />

        <p className="text-sm sm:text-base leading-relaxed mb-6" style={{ color: "#d1d5db" }}>
          RIO provides the infrastructure for a specific, demonstrable requirement:{" "}
          <em style={{ color: "#b8963e" }}>
            a verifiable, cryptographic record that a specific action was authorized by a specific human,
            executed under a specific policy, verified against its stated intent, and recorded in a
            tamper-evident ledger that any independent party can audit.
          </em>
        </p>

        {/* Regulatory table */}
        <div className="rounded-lg border overflow-hidden mb-6" style={{ borderColor: "oklch(0.72 0.1 85 / 15%)" }}>
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: "oklch(0.15 0.03 260)" }}>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: "#b8963e" }}>
                  Framework
                </th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: "#b8963e" }}>
                  Articles
                </th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: "#b8963e" }}>
                  RIO Mechanism
                </th>
              </tr>
            </thead>
            <tbody>
              {regulatoryMapping.map((r, i) => (
                <tr
                  key={i}
                  style={{
                    backgroundColor: i % 2 === 0 ? "oklch(0.18 0.03 260)" : "oklch(0.16 0.03 260)",
                  }}
                >
                  <td className="px-4 py-3 text-xs sm:text-sm font-medium" style={{ color: "#d1d5db" }}>
                    <Scale className="w-3 h-3 inline mr-1.5" style={{ color: "#60a5fa" }} />
                    {r.framework}
                  </td>
                  <td className="px-4 py-3 text-xs sm:text-sm" style={{ color: "#9ca3af" }}>
                    {r.articles}
                  </td>
                  <td className="px-4 py-3 text-xs sm:text-sm" style={{ color: "#9ca3af" }}>
                    {r.mechanism}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <a
          href="https://github.com/bkr1297-RIO/rio-protocol/blob/main/docs/EGI_Technical_Assessment.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs inline-flex items-center gap-1 hover:underline"
          style={{ color: "#60a5fa" }}
        >
          <Download className="w-3 h-3" /> Full EGI Technical Assessment (PDF)
        </a>

        {/* ── Bottom CTA ──────────────────────────────────────────── */}
        <div className="mt-16 text-center">
          <p className="text-sm mb-4" style={{ color: "#9ca3af" }}>
            Explore the full specification, schemas, and conformance tests on GitHub.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="https://github.com/bkr1297-RIO/rio-protocol"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block py-3 px-8 text-sm font-medium tracking-wide uppercase text-white border rounded transition-colors duration-200 hover:bg-white/5"
              style={{ borderColor: "#b8963e", borderWidth: "1.5px" }}
            >
              Protocol Specification →
            </a>
            <a
              href="/position-paper"
              className="inline-block py-3 px-8 text-sm font-medium tracking-wide uppercase text-white border rounded transition-colors duration-200 hover:bg-white/5"
              style={{ borderColor: "#60a5fa", borderWidth: "1.5px" }}
            >
              Position Paper →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
