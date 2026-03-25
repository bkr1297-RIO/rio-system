/**
 * Whitepaper Page — RIO Protocol Technical Whitepaper
 *
 * Renders the key sections of the whitepaper inline with a PDF download button.
 * Author: Brian K. Rasmussen
 */

import NavBar from "@/components/NavBar";
import { FileDown, ExternalLink, Shield, Zap, Lock, Eye, BookOpen, Users, Brain, Building2, AlertTriangle, GitBranch } from "lucide-react";

const PDF_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio_whitepaper_v2_8021e404.pdf";
const REPO_URL = "https://github.com/bkr1297-RIO/rio-protocol";

// ── Section Data ──────────────────────────────────────────────────────────────

type Section = {
  id: string;
  num: string;
  title: string;
  icon: React.ReactNode;
  content: string[];
};

const SECTIONS: Section[] = [
  {
    id: "abstract",
    num: "1",
    title: "Abstract",
    icon: <BookOpen size={18} />,
    content: [
      "Runtime Intelligence Orchestration (RIO) is a fail-closed authorization and audit protocol designed to govern autonomous AI agents. As AI systems transition from passive advisors to active participants in digital environments — capable of moving funds, managing infrastructure, and accessing sensitive data — the risk of unaligned or malicious execution increases.",
      "RIO addresses this by decoupling the \"intelligence\" of the agent from the \"authority\" to execute. By enforcing a cryptographic control plane between the AI and the execution target, RIO ensures that no high-impact action can occur without explicit, verifiable human approval. The system provides a tamper-evident audit trail through a hash-chained ledger and generates cryptographic receipts for every execution.",
    ],
  },
  {
    id: "introduction",
    num: "2",
    title: "Introduction",
    icon: <Zap size={18} />,
    content: [
      "The rapid advancement of Large Language Models (LLMs) has birthed a new era of autonomous agents. These agents are no longer confined to chat interfaces; they are integrated into business workflows via APIs, database connectors, and cloud infrastructure. However, this integration introduces a critical \"speed asymmetry\": AI can propose and attempt actions at machine speed, while human oversight remains at human speed.",
      "Traditional security models — such as prompt engineering, system instructions, or model alignment — are advisory. They rely on the AI's \"willingness\" to follow rules. In a production environment, this is insufficient. A single hallucination or prompt injection can lead to irreversible consequences, such as unauthorized financial transfers or data breaches.",
      "RIO shifts the paradigm from advisory to structural governance. It treats AI as an untrusted requester and places a hard execution gate in front of every sensitive action. By requiring a cryptographic \"proof of approval\" at the moment of execution, RIO ensures that the human remains the ultimate authority, without sacrificing the efficiency of AI-driven orchestration.",
    ],
  },
  {
    id: "overview",
    num: "3",
    title: "System Overview",
    icon: <Eye size={18} />,
    content: [
      "RIO is built on the principle that AI proposes, but the system executes. It operates across two distinct planes:",
      "The Control Plane governs the flow of intent. It captures the AI's request, evaluates it against organizational policies, determines the required risk level, and manages the human approval workflow. It is responsible for generating the cryptographic \"Execution Token\" that unlocks the gate.",
      "The Audit Plane provides the \"memory\" of the system. It records every intent, approval, denial, and execution event in a tamper-evident, hash-chained ledger. It generates \"Cryptographic Receipts\" that allow any party to independently verify that an action was authorized and executed correctly.",
      "The system is fail-closed by design. If the control plane is unavailable, if a signature is invalid, or if the ledger cannot be written, the execution gate remains locked. This ensures that no action is ever taken in an unrecorded or unauthorized state.",
    ],
  },
  {
    id: "pipeline",
    num: "5",
    title: "The Governed Execution Pipeline",
    icon: <GitBranch size={18} />,
    content: [
      "RIO enforces governance through a rigorous 8-stage pipeline. Each stage produces a specific data structure that is passed to the next, ensuring a continuous chain of custody:",
      "1. Intake — The AI agent submits a raw intent.\n2. Classification — The system identifies the action type and extracts parameters.\n3. Structured Intent — The intent is converted into a machine-readable format with a unique intent_id.\n4. Policy & Risk Evaluation — The Policy Engine checks the intent against active rules. A risk score is calculated.\n5. Authorization — If the risk exceeds the threshold, a human approver is notified. Upon approval, the Signature Service generates an ECDSA signature.\n6. Execution Gate — The gate verifies the signature, timestamp, and nonce.\n7. Receipt Generation — An HMAC-signed receipt is generated, capturing the result.\n8. Ledger Entry — The event is recorded in the hash-chained ledger.",
    ],
  },
  {
    id: "invariants",
    num: "6",
    title: "System Invariants",
    icon: <Shield size={18} />,
    content: [
      "The RIO protocol is governed by ten core invariants that must be maintained at all times:",
      "No Execution Without Authorization — No action can be performed unless a valid, unconsumed Execution Token is presented. No Authorization Without Policy Check — An Execution Token can only be generated after the Policy Engine has evaluated the intent. Fail-Closed Enforcement — Any failure in a dependency must result in a blocked action. Single-Use Approvals — Every Execution Token and its associated signature are single-use. Cryptographic Binding — The signature must be bound to the exact payload presented for approval.",
      "Timestamp Freshness — Execution Tokens have a maximum lifespan (default 300s). Every Action Produces a Receipt — Every execution attempt, whether successful or blocked, must generate a cryptographic receipt. Tamper-Evident Audit Trail — All receipts must be recorded in a hash-chained ledger. Identity Attribution — Every action must be attributed to both the requesting agent and the authorizing human. Immutable History — Ledger entries cannot be modified or deleted.",
    ],
  },
  {
    id: "crypto",
    num: "7",
    title: "Cryptographic Audit Model",
    icon: <Lock size={18} />,
    content: [
      "RIO uses a multi-layered cryptographic model to ensure that the audit trail is both authentic and tamper-evident.",
      "A RIO receipt is a JSON object containing the full context of the execution, signed using HMAC-SHA256 with a key known only to the RIO Control Plane. The receipt includes the intent_id, action, timestamps, approver identity, agent identity, policy result, parameter hashes, result hashes, and the current ledger hash.",
      "The ledger is a hash chain where each entry E_n contains a hash H_n calculated as: H_n = SHA256(E_n.data + H_(n-1)). This structure ensures that any modification to entry E_i will invalidate all subsequent hashes, making tampering immediately detectable.",
    ],
  },
  {
    id: "threats",
    num: "8",
    title: "Threat Model",
    icon: <AlertTriangle size={18} />,
    content: [
      "RIO is designed to mitigate critical threats in autonomous AI environments: Unauthorized Execution (mitigated by service boundary + service-to-service auth), Ledger Tampering (mitigated by hash-chained ledger entries), Token Reuse (mitigated by single-use nonce/signature registry), Privilege Escalation (mitigated by independent ECDSA signature verification), Kill Switch Bypass (mitigated by fail-closed design), and Missing Audit Trail (mitigated by ledger write as a prerequisite for execution).",
    ],
  },
  {
    id: "governance",
    num: "9",
    title: "Governance Model",
    icon: <Users size={18} />,
    content: [
      "Policies are defined as a set of rules that map actions and parameters to risk levels. The engine evaluates intents in real-time, returning a verdict of ALLOW, BLOCK, or REQUIRE_APPROVAL.",
      "Risk is calculated using a 4-component scoring model: Base Risk (inherent risk of the action type), Role Modifier (adjusts based on the agent's role), Amount Modifier (scales based on financial or data volume), and Target Modifier (adjusts based on target system sensitivity).",
      "Policies follow a strict versioning lifecycle: PROPOSED → APPROVED → ACTIVATED → INACTIVE (or ROLLED_BACK). Only one policy version can be ACTIVATED at any time, ensuring deterministic evaluation.",
    ],
  },
  {
    id: "learning",
    num: "11",
    title: "Learning and Simulation",
    icon: <Brain size={18} />,
    content: [
      "RIO includes a \"Governed Corpus\" that records all system interactions, providing a rich dataset for learning and policy refinement.",
      "The Replay Engine can replay historical intents through the pipeline in three modes: Exact Replay (verifies the system produces the same result), Modified Policy (simulates how a new policy would have handled past intents), and Modified Role (tests how different role assignments would change outcomes).",
      "The Policy Improvement Loop follows four steps: Record (capture intents and outcomes), Analyze (identify patterns of friction or risk), Simulate (test new rules against the corpus), and Deploy (activate refined policies with confidence).",
    ],
  },
  {
    id: "enterprise",
    num: "13",
    title: "Enterprise Use Cases",
    icon: <Building2 size={18} />,
    content: [
      "Invoice Payment Approval — A finance agent identifies an outstanding invoice. RIO intercepts the payment request, requiring a Manager's approval for any amount over $1,000.",
      "GDPR Data Deletion — An agent tasked with data privacy receives a deletion request. RIO ensures the deletion is logged and verified against the correct user ID before execution.",
      "Production Deployment — A DevOps agent proposes a code deployment. RIO requires a Director-level signature, ensuring that no code reaches production without a human \"go\" decision.",
      "Access Provisioning — An HR agent requests system access for a new hire. RIO validates the request against the employee's role and requires Admin approval for privileged access.",
      "Agent-to-Agent Delegation — A personal assistant agent asks a travel agent to book a flight. RIO gates the final payment, ensuring the user approves the cost and itinerary.",
    ],
  },
];

// ── Pipeline Diagram ──────────────────────────────────────────────────────────

const PIPELINE_STEPS = [
  { label: "AI Agent", color: "#6b7280" },
  { label: "Intake", color: "#b8963e" },
  { label: "Classify", color: "#b8963e" },
  { label: "Policy & Risk", color: "#eab308" },
  { label: "Authorization", color: "#3b82f6" },
  { label: "Execution Gate", color: "#ef4444" },
  { label: "Execute", color: "#22c55e" },
  { label: "Receipt", color: "#b8963e" },
  { label: "Ledger", color: "#b8963e" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function Whitepaper() {
  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: "'Outfit', sans-serif" }}>
      <NavBar />

      <div className="flex flex-col items-center flex-1 px-4 sm:px-6 py-10 sm:py-16">
        {/* Header */}
        <div className="w-full max-w-3xl text-center mb-10">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-3" style={{ color: "#b8963e" }}>
            Technical Whitepaper
          </p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-wide mb-3" style={{ color: "#ffffff" }}>
            RIO: Runtime Intelligence Orchestration
          </h1>
          <p className="text-base sm:text-lg mb-2" style={{ color: "#9ca3af" }}>
            A Cryptographic Protocol for Governed AI Execution
          </p>
          <div className="flex flex-col items-center gap-1 mb-6">
            <p className="text-sm" style={{ color: "#d1d5db" }}>
              <span className="font-semibold">Author / Architect:</span> Brian K. Rasmussen
            </p>
            <p className="text-xs" style={{ color: "#6b7280" }}>
              Version 2.0.0 — March 2026
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={PDF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 py-2.5 px-5 text-sm font-medium border rounded transition-colors duration-200 hover:bg-amber-500/10"
              style={{ borderColor: "#b8963e", color: "#b8963e" }}
            >
              <FileDown size={16} />
              Download PDF
            </a>
            <a
              href={`${REPO_URL}/blob/main/whitepaper/rio_protocol_whitepaper_v2.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 py-2.5 px-5 text-sm font-medium border rounded transition-colors duration-200 hover:bg-white/5"
              style={{ borderColor: "#374151", color: "#9ca3af" }}
            >
              <ExternalLink size={16} />
              View on GitHub
            </a>
          </div>
        </div>

        {/* Pipeline Diagram */}
        <div className="w-full max-w-3xl mb-12">
          <div
            className="p-5 rounded-lg border overflow-x-auto"
            style={{ borderColor: "rgba(184,150,62,0.3)", backgroundColor: "rgba(184,150,62,0.04)" }}
          >
            <p className="text-xs font-semibold tracking-wider uppercase mb-4 text-center" style={{ color: "#b8963e" }}>
              Governed Execution Pipeline
            </p>
            <div className="flex items-center justify-between min-w-[600px]">
              {PIPELINE_STEPS.map((step, i) => (
                <div key={step.label} className="flex items-center" style={{ flex: 1 }}>
                  <div className="flex flex-col items-center gap-1" style={{ minWidth: "60px" }}>
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: step.color, boxShadow: `0 0 8px ${step.color}40` }}
                    />
                    <span className="text-[10px] text-center font-medium" style={{ color: step.color }}>
                      {step.label}
                    </span>
                  </div>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <div className="flex-1 h-px mx-1" style={{ backgroundColor: "rgba(184,150,62,0.3)" }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Table of Contents */}
        <div className="w-full max-w-3xl mb-10">
          <div
            className="p-5 rounded-lg border"
            style={{ borderColor: "rgba(107,114,128,0.2)", backgroundColor: "rgba(255,255,255,0.02)" }}
          >
            <p className="text-xs font-semibold tracking-wider uppercase mb-3" style={{ color: "#b8963e" }}>
              Contents
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="text-sm py-1 hover:underline transition-colors"
                  style={{ color: "#9ca3af" }}
                >
                  <span style={{ color: "#4b5563" }}>{s.num}.</span> {s.title}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="w-full max-w-3xl space-y-10">
          {SECTIONS.map((section) => (
            <div key={section.id} id={section.id}>
              <div className="flex items-center gap-2 mb-4">
                <span style={{ color: "#b8963e" }}>{section.icon}</span>
                <h2 className="text-lg sm:text-xl font-bold" style={{ color: "#ffffff" }}>
                  <span style={{ color: "#4b5563" }}>{section.num}.</span> {section.title}
                </h2>
              </div>
              <div className="space-y-4">
                {section.content.map((para, i) => (
                  <p
                    key={i}
                    className="text-sm leading-relaxed whitespace-pre-line"
                    style={{ color: "#d1d5db" }}
                  >
                    {para}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Conclusion */}
        <div
          className="w-full max-w-3xl mt-12 p-6 rounded-lg border text-center"
          style={{ borderColor: "rgba(184,150,62,0.3)", backgroundColor: "rgba(184,150,62,0.04)" }}
        >
          <h2 className="text-lg font-bold mb-3" style={{ color: "#b8963e" }}>
            Conclusion
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#d1d5db" }}>
            RIO provides the missing link in AI safety: a structural enforcement layer that operates at the
            speed of machine intelligence while maintaining the absolute authority of human decision-makers.
            By decoupling intent from execution and anchoring every action in a cryptographic audit trail,
            RIO enables organizations to deploy autonomous agents with confidence. Governance does not have
            to be a bottleneck — it can be a verifiable, tamper-evident, and automated part of the execution itself.
          </p>
        </div>

        {/* Download CTA */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href={PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 py-2.5 px-5 text-sm font-medium border rounded transition-colors duration-200 hover:bg-amber-500/10"
            style={{ borderColor: "#b8963e", color: "#b8963e" }}
          >
            <FileDown size={16} />
            Download Full PDF
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 py-2.5 px-5 text-sm font-medium border rounded transition-colors duration-200 hover:bg-white/5"
            style={{ borderColor: "#374151", color: "#9ca3af" }}
          >
            <ExternalLink size={16} />
            View Repository
          </a>
        </div>

        {/* Back link */}
        <div className="flex gap-4 mt-8">
          <a
            href="/"
            className="text-sm font-light tracking-wide hover:underline"
            style={{ color: "#9ca3af" }}
          >
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
