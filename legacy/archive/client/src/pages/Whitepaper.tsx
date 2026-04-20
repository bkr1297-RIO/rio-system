/**
 * Whitepaper Page — RIO Protocol Technical Whitepaper
 *
 * Renders the key sections of the whitepaper inline with a PDF download button.
 * Author: Brian K. Rasmussen
 */

import NavBar from "@/components/NavBar";
import { FileDown, ExternalLink, Shield, Zap, Lock, Eye, BookOpen, Users, Brain, Building2, AlertTriangle, GitBranch, Lightbulb } from "lucide-react";

const PDF_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio_whitepaper_v2_d2db5a32.pdf";
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
      "RIO addresses this by decoupling the \"intelligence\" of the agent from the \"authority\" to execute. Built on a Three-Loop Architecture (Intake/Discovery, Execution/Governance, Learning), RIO translates goals into structured intents, enforces policy and approvals before execution, controls and verifies actions, generates v2 cryptographic receipts with intent_hash, action_hash, and verification_hash, and maintains an immutable signed ledger. The Learning Loop feeds outcomes back into policy refinement without bypassing governance.",
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
    id: "three-loop",
    num: "3",
    title: "Three-Loop Architecture",
    icon: <Lightbulb size={18} />,
    content: [
      "RIO is built on a Three-Loop Architecture that governs the complete lifecycle of AI-driven actions:",
      "The Intake / Discovery Loop translates vague goals into structured intents before governance begins. It validates incoming requests, detects missing information, uses AI-assisted refinement to clarify ambiguous goals, and produces a well-defined structured intent. Also known as the Intake Translation Layer, Universal Grammar Layer, or Goal-to-Intent Layer.",
      "The Execution / Governance Loop controls and authorizes all actions before execution. It enforces policy evaluation, risk scoring, human approval workflows, execution gating, post-execution verification (computing intent_hash, action_hash, and verification_hash), v2 receipt generation, and signed ledger recording. No execution occurs without authorization. All actions produce receipts. All receipts are recorded in the ledger.",
      "The Learning Loop improves future decisions and governance policies. It analyzes patterns from the audit trail, proposes policy updates, and enables replay/simulation. Learning cannot bypass governance, cannot execute actions directly, and policy updates must go through governance before deployment.",
      "The system is fail-closed by design. If any component cannot positively verify a required condition, the execution gate remains locked. This ensures that no action is ever taken in an unrecorded or unauthorized state.",
    ],
  },
  {
    id: "pipeline",
    num: "5",
    title: "The Governed Execution Pipeline",
    icon: <GitBranch size={18} />,
    content: [
      "RIO enforces governance through the pipeline within the Execution/Governance Loop. Each stage produces a specific data structure that is passed to the next, ensuring a continuous chain of custody:",
      "1. Intake \u2014 The AI agent submits a raw intent (or vague goal, which is refined by the Intake/Discovery Loop).\n2. Discovery & Refinement \u2014 If the request is vague, AI-assisted refinement produces a structured intent.\n3. Classification \u2014 The system identifies the action type and assigns a risk category.\n4. Policy & Risk Evaluation \u2014 The Policy Engine checks the intent against active rules. A risk score is calculated.\n5. Authorization \u2014 If the risk exceeds the threshold, a human approver is notified. Upon approval, an Execution Token is generated.\n6. Execution Gate \u2014 The gate verifies the token signature, timestamp, nonce, and kill switch.\n6b. Post-Execution Verification \u2014 Computes intent_hash, action_hash, and verification_hash (SHA-256) to cryptographically bind intent to action.\n7. v2 Receipt Generation \u2014 A signed receipt is generated containing all hashes, risk data, policy decision, and three ISO 8601 timestamps.\n8. v2 Ledger Entry \u2014 The receipt is recorded in the signed hash-chained ledger with its own ledger_signature.",
      "Denial receipts are generated for blocked or denied actions, ensuring the audit trail covers every decision \u2014 not just successful executions.",
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
    title: "Cryptographic Audit Model (v2)",
    icon: <Lock size={18} />,
    content: [
      "RIO v2 uses a multi-layered cryptographic model to ensure that the audit trail is both authentic and tamper-evident.",
      "A v2 receipt is a JSON object containing: receipt_id, intent_id, action, requester, approver, decision, execution_status, risk_score, risk_level, policy_decision, intent_hash (SHA-256 of intent + action + requester + timestamp), action_hash (SHA-256 of action + parameters), verification_hash (SHA-256 of intent_hash + action_hash + execution_status), verification_status, three ISO 8601 timestamps (request, approval, execution), receipt_hash, signature (Ed25519), previous_hash, and protocol_version.",
      "The v2 ledger is a signed hash chain where each entry E_n contains: block_id, receipt_id, receipt_hash, previous_hash, current_hash (H_n = SHA256(E_n.data + H_(n-1))), and ledger_signature (Ed25519). This structure ensures that any modification to any entry invalidates all subsequent hashes, and the per-entry signature provides independent verification. The Receipt Verifier and Ledger Verifier enable independent audit of individual receipts and the full chain.",
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
    title: "Learning Loop",
    icon: <Brain size={18} />,
    content: [
      "The Learning Loop is the third loop in RIO\u2019s Three-Loop Architecture. It records all system interactions in a Governed Corpus, providing a rich dataset for learning and policy refinement.",
      "The Replay Engine can replay historical intents through the pipeline in three modes: Exact Replay (verifies the system produces the same result), Modified Policy (simulates how a new policy would have handled past intents), and Modified Role (tests how different role assignments would change outcomes).",
      "The Policy Improvement Loop follows four steps: Record (capture intents and outcomes), Analyze (identify patterns of friction or risk), Simulate (test new rules against the corpus), and Deploy (activate refined policies with confidence). Critically, the Learning Loop cannot bypass governance: all policy updates must go through the Execution/Governance Loop before deployment, and the Learning Loop cannot execute actions directly.",
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
  { label: "Goal", color: "#60a5fa" },
  { label: "Intake", color: "#60a5fa" },
  { label: "Classify", color: "#b8963e" },
  { label: "Policy", color: "#eab308" },
  { label: "Authorize", color: "#3b82f6" },
  { label: "Execute", color: "#22c55e" },
  { label: "Verify", color: "#3b82f6" },
  { label: "Receipt", color: "#b8963e" },
  { label: "Ledger", color: "#b8963e" },
  { label: "Learn", color: "#22d3ee" },
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
          <p
            className="text-xs sm:text-sm font-semibold tracking-[0.25em] uppercase mb-3"
            style={{ color: "#60a5fa" }}
          >
            Runtime Governance and Execution Control Plane for AI Systems
          </p>
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
            RIO provides the missing link in AI safety: a governed AI control plane built on a Three-Loop Architecture
            that translates goals into structured intents, enforces policy and approvals before execution, controls and
            verifies actions, generates v2 cryptographic receipts, maintains an immutable signed ledger, and learns from
            every decision over time. By decoupling intent from execution and anchoring every action in a cryptographic
            audit trail, RIO enables organizations to deploy autonomous agents with confidence. Governance does not have
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
