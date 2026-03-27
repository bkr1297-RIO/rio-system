import NavBar from "@/components/NavBar";
import { useState, useEffect, useRef } from "react";
import { Download, ExternalLink, ChevronRight, BookOpen } from "lucide-react";

const PDF_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/RIO_Infrastructure_Position_Paper_v2_276264cf.pdf";

interface Section {
  id: string;
  number: string;
  title: string;
}

const sections: Section[] = [
  { id: "abstract", number: "", title: "Abstract" },
  { id: "introduction", number: "1", title: "Introduction" },
  { id: "egi-definition", number: "2", title: "Defining Execution Governance Infrastructure" },
  { id: "rio-overview", number: "3", title: "RIO Protocol Overview" },
  { id: "guarantees", number: "4", title: "Technical Guarantees" },
  { id: "egi-assessment", number: "5", title: "EGI Assessment" },
  { id: "eu-ai-act", number: "6", title: "Mapping RIO to the EU AI Act" },
  { id: "nist", number: "7", title: "Mapping RIO to NIST AI RMF" },
  { id: "iso", number: "8", title: "Mapping RIO to ISO/IEC 42001" },
  { id: "limitations", number: "9", title: "What RIO Does Not Address" },
  { id: "landscape", number: "10", title: "Landscape Analysis" },
  { id: "implications", number: "11", title: "Practical Implications" },
  { id: "conclusion", number: "12", title: "Conclusion" },
  { id: "references", number: "", title: "References" },
];

function TableRow({ cells, header }: { cells: string[]; header?: boolean }) {
  const Tag = header ? "th" : "td";
  return (
    <tr className={header ? "border-b border-[#b8963e]/30" : "border-b border-white/5"}>
      {cells.map((cell, i) => (
        <Tag
          key={i}
          className={`px-3 py-2.5 text-left text-sm ${
            header
              ? "font-semibold text-[#b8963e] tracking-wide"
              : "text-[#d1d5db] leading-relaxed"
          } ${i === 0 ? "font-medium text-white/90" : ""}`}
        >
          {cell}
        </Tag>
      ))}
    </tr>
  );
}

function SectionHeading({
  id,
  number,
  title,
}: {
  id: string;
  number: string;
  title: string;
}) {
  return (
    <h2
      id={id}
      className="text-xl sm:text-2xl font-bold mt-12 mb-4 scroll-mt-20"
      style={{ color: "#b8963e" }}
    >
      {number ? `${number}. ` : ""}
      {title}
    </h2>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-base sm:text-lg font-semibold mt-8 mb-3 text-white/90">
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm sm:text-base leading-relaxed mb-4 text-[#d1d5db]">
      {children}
    </p>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="text-white font-semibold">{children}</strong>;
}

function Gold({ children }: { children: React.ReactNode }) {
  return <strong className="text-[#b8963e] font-semibold">{children}</strong>;
}

function Blue({ children }: { children: React.ReactNode }) {
  return <span className="text-[#60a5fa]">{children}</span>;
}

function BlockQuote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote
      className="border-l-2 pl-4 my-4 text-sm sm:text-base leading-relaxed italic"
      style={{ borderColor: "#b8963e", color: "#9ca3af" }}
    >
      {children}
    </blockquote>
  );
}

function Ref({ n }: { n: number }) {
  return (
    <sup className="text-[#60a5fa] text-xs ml-0.5 cursor-default">[{n}]</sup>
  );
}

export default function PositionPaper() {
  const [activeSection, setActiveSection] = useState("abstract");
  const [tocOpen, setTocOpen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );

    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setTocOpen(false);
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      <NavBar />

      {/* Header */}
      <div className="w-full border-b" style={{ borderColor: "rgba(184,150,62,0.15)" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-[#b8963e]" />
            <span
              className="text-xs font-semibold tracking-[0.2em] uppercase"
              style={{ color: "#b8963e" }}
            >
              Position Paper
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4 text-white leading-tight max-w-4xl mx-auto">
            RIO Protocol as AI Governance Infrastructure
          </h1>
          <p className="text-sm sm:text-base mb-2" style={{ color: "#9ca3af" }}>
            A Technical Assessment Based on Implementation Evidence and
            Regulatory Alignment
          </p>
          <p className="text-xs mb-6" style={{ color: "#6b7280" }}>
            Brian K. Rasmussen — Author / Architect
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={PDF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded transition-colors hover:bg-white/5"
              style={{ borderColor: "#b8963e", color: "#b8963e" }}
            >
              <Download className="w-4 h-4" />
              Download PDF
            </a>
            <a
              href="https://github.com/bkr1297-RIO/rio-protocol"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded transition-colors hover:bg-white/5"
              style={{ borderColor: "#374151", color: "#9ca3af" }}
            >
              <ExternalLink className="w-4 h-4" />
              View Protocol Repository
            </a>
          </div>
        </div>
      </div>

      {/* Mobile TOC toggle */}
      <div className="lg:hidden sticky top-14 z-40 border-b" style={{ backgroundColor: "oklch(0.13 0.03 260)", borderColor: "rgba(184,150,62,0.15)" }}>
        <button
          className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium"
          style={{ color: "#b8963e" }}
          onClick={() => setTocOpen(!tocOpen)}
        >
          <span>Table of Contents</span>
          <ChevronRight className={`w-4 h-4 transition-transform ${tocOpen ? "rotate-90" : ""}`} />
        </button>
        {tocOpen && (
          <div className="px-4 pb-3 max-h-64 overflow-y-auto">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`block w-full text-left py-1.5 text-sm transition-colors ${
                  activeSection === s.id ? "text-[#b8963e] font-medium" : "text-[#9ca3af]"
                }`}
              >
                {s.number ? `${s.number}. ` : ""}
                {s.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main content with sidebar TOC */}
      <div className="max-w-7xl mx-auto w-full flex px-4 sm:px-6">
        {/* Desktop TOC sidebar */}
        <aside className="hidden lg:block w-64 shrink-0 pr-8">
          <div className="sticky top-20 pt-8">
            <p
              className="text-xs font-semibold tracking-[0.15em] uppercase mb-4"
              style={{ color: "#b8963e" }}
            >
              Contents
            </p>
            <nav className="flex flex-col gap-0.5">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`text-left py-1.5 text-sm transition-colors rounded px-2 ${
                    activeSection === s.id
                      ? "text-[#b8963e] font-medium bg-[#b8963e]/5"
                      : "text-[#6b7280] hover:text-[#9ca3af]"
                  }`}
                >
                  {s.number ? (
                    <span className="inline-block w-6 text-xs opacity-60">
                      {s.number}.
                    </span>
                  ) : null}
                  {s.title}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Paper content */}
        <article className="flex-1 max-w-3xl py-8 sm:py-12 min-w-0">
          {/* Abstract */}
          <SectionHeading id="abstract" number="" title="Abstract" />
          <P>
            This paper defines <Gold>Execution Governance Infrastructure (EGI)</Gold> as a
            class of systems that gate execution, produce cryptographically bound records,
            enforce policy before action, allow independent verification, and fail closed when
            conditions are not met. It then demonstrates, through implementation evidence, that
            the RIO Protocol satisfies each of these properties. The assessment maps RIO's
            capabilities against the EU AI Act (Articles 9, 12, 14), NIST AI RMF 1.0, and
            ISO/IEC 42001:2023, identifying specific regulatory requirements that the protocol
            addresses. The paper is grounded entirely in what exists in the public repository
            — 53 specification documents, 8 JSON schemas, a reference implementation passing
            143 tests with zero failures, and an independent verifier that validates receipts
            and ledger entries without access to signing keys.
          </P>

          {/* 1. Introduction */}
          <SectionHeading id="introduction" number="1" title="Introduction" />
          <P>
            AI systems are increasingly performing consequential actions — executing financial
            transactions, modifying infrastructure, communicating on behalf of organizations,
            and making decisions that affect people's lives. The regulatory response has been
            direct: the EU AI Act<Ref n={1} /> requires automatic logging, human oversight
            mechanisms, and risk management systems for high-risk AI. NIST AI RMF 1.0<Ref n={2} />{" "}
            establishes governance, measurement, and management functions. ISO/IEC 42001<Ref n={3} />{" "}
            defines controls for AI event logging, monitoring, and responsible practices.
          </P>
          <P>
            These frameworks share a common requirement: <Strong>a verifiable record that a
            specific action was authorized by a specific human, executed under a specific
            policy, verified against its stated intent, and recorded in a tamper-evident
            ledger that any independent party can audit.</Strong>
          </P>
          <P>
            No standard infrastructure exists for this. Content guardrails govern what AI
            says. Access control governs what AI can reach. Approval frameworks provide
            advisory checkpoints. Audit systems record what happened after the fact. None of
            these, individually or combined, provide a single, cryptographically bound record
            that spans the entire lifecycle of a consequential action — from intent through
            authorization through execution through verification.
          </P>
          <P>
            This paper examines the RIO Protocol as an implementation of what we define as{" "}
            <Gold>Execution Governance Infrastructure</Gold> — the missing layer between AI
            capability and AI accountability. Every claim in this paper maps to a specific
            module, test result, or artifact in the public repository.<Ref n={8} />
          </P>

          {/* 2. Defining EGI */}
          <SectionHeading
            id="egi-definition"
            number="2"
            title="Defining Execution Governance Infrastructure"
          />
          <P>
            Execution Governance Infrastructure (EGI) is a class of systems that satisfies
            the following five properties. Each property is stated as a falsifiable claim — it
            can be tested, and failure to satisfy it disqualifies a system from the category.
          </P>
          <div className="overflow-x-auto my-6 rounded-lg border" style={{ borderColor: "rgba(184,150,62,0.2)" }}>
            <table className="w-full text-left">
              <thead style={{ backgroundColor: "rgba(184,150,62,0.06)" }}>
                <TableRow header cells={["Property", "Requirement", "Test Criterion"]} />
              </thead>
              <tbody>
                <TableRow cells={["P1 — Execution Gating", "No action executes without positive authorization from the governance layer", "Submit an intent without approval; verify the action does not execute"]} />
                <TableRow cells={["P2 — Cryptographic Binding", "Every executed action produces a signed, hash-linked receipt that binds intent, authorization, execution, and verification into a single record", "Execute an action; verify the receipt contains all four components with valid signatures"]} />
                <TableRow cells={["P3 — Pre-Execution Policy Enforcement", "Policy evaluation occurs before execution, not after", "Submit an intent that violates policy; verify it is blocked before any action occurs"]} />
                <TableRow cells={["P4 — Independent Verifiability", "Any third party can verify the integrity of receipts and ledger entries without access to signing keys or internal state", "Run the independent verifier against a receipt; verify it produces PASS/FAIL without requiring the private key"]} />
                <TableRow cells={["P5 — Fail-Closed Default", "When any component fails, is unavailable, or returns an ambiguous result, the system blocks execution", "Disable the policy engine; verify that pending intents are blocked, not allowed"]} />
              </tbody>
            </table>
          </div>
          <P>
            A system that satisfies P1–P5 is an EGI implementation. A system that satisfies
            some but not all is a partial implementation and should be described as such. The
            category is defined by properties, not by any specific implementation.
          </P>

          {/* 3. RIO Protocol Overview */}
          <SectionHeading id="rio-overview" number="3" title="RIO Protocol Overview" />
          <P>
            The RIO Protocol is organized around a <Gold>Three-Loop Architecture</Gold>:
          </P>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
            {[
              {
                name: "Intake Loop",
                color: "#60a5fa",
                desc: "Translates goals into structured intents with risk classification. Defines what the AI wants to do in a machine-readable, human-auditable format.",
              },
              {
                name: "Governance Loop",
                color: "#b8963e",
                desc: "Evaluates policy, requires human approval when needed, gates execution, verifies outcomes, and produces cryptographic receipts recorded in a tamper-evident ledger.",
              },
              {
                name: "Learning Loop",
                color: "#22d3ee",
                desc: "Analyzes historical execution data from the ledger to identify patterns, simulate policy changes, and refine governance rules over time.",
              },
            ].map((loop) => (
              <div
                key={loop.name}
                className="p-4 rounded-lg border"
                style={{
                  borderColor: `${loop.color}30`,
                  backgroundColor: `${loop.color}08`,
                }}
              >
                <h4
                  className="text-sm font-bold mb-2 tracking-wide"
                  style={{ color: loop.color }}
                >
                  {loop.name}
                </h4>
                <p className="text-xs sm:text-sm leading-relaxed text-[#d1d5db]">
                  {loop.desc}
                </p>
              </div>
            ))}
          </div>
          <P>
            The Governance Loop implements an <Strong>8-stage pipeline</Strong>: (1) Intake
            and Translation, (2) Signature Verification, (3) Risk Classification, (4) Policy
            Evaluation, (5) Human Approval Gate, (6) Controlled Execution, (7) Outcome
            Verification, and (8) Receipt Generation and Ledger Recording. Each stage has
            defined inputs, outputs, and failure modes. The pipeline is fail-closed at every
            stage — if any stage fails, execution does not proceed.
          </P>
          <SubHeading>Implementation Evidence</SubHeading>
          <P>
            The protocol specification comprises <Strong>53 documents</Strong> and{" "}
            <Strong>8 JSON schemas</Strong> in the public repository.<Ref n={8} /> The
            reference implementation<Ref n={9} /> passes <Strong>57 core tests</Strong>. The
            independent verifier passes <Strong>32 tests with 13 subtests</Strong>. The
            conformance suite passes <Strong>23 tests</Strong>. The gateway passes{" "}
            <Strong>7 conformance tests</Strong> and <Strong>7 SDK tests</Strong>. The
            simulator produces cryptographically valid artifacts across{" "}
            <Strong>4 generation modes</Strong>. Total verified test count:{" "}
            <Gold>143 tests, 0 failures</Gold>.
          </P>

          {/* 4. Technical Guarantees */}
          <SectionHeading id="guarantees" number="4" title="Technical Guarantees" />
          <P>
            The following table translates RIO's technical mechanisms into the assurance
            properties they provide. Each guarantee is independently testable.
          </P>
          <div className="overflow-x-auto my-6 rounded-lg border" style={{ borderColor: "rgba(184,150,62,0.2)" }}>
            <table className="w-full text-left">
              <thead style={{ backgroundColor: "rgba(184,150,62,0.06)" }}>
                <TableRow header cells={["Guarantee", "Mechanism", "Verification"]} />
              </thead>
              <tbody>
                <TableRow cells={["Past records cannot be altered without detection", "Hash-chained ledger (SHA-256); each entry includes hash of previous entry", "Recompute chain from genesis; any mismatch identifies the tampered entry"]} />
                <TableRow cells={["Approvals cannot be forged", "Ed25519 / ECDSA digital signatures on every approval and receipt", "Verify signature against public key; forgery requires the private key"]} />
                <TableRow cells={["Tokens cannot be replayed", "Nonce registry with uniqueness enforcement", "Submit a used nonce; verify rejection"]} />
                <TableRow cells={["Authorization cannot be reused after expiration", "TTL (time-to-live) enforcement on execution tokens", "Submit an expired token; verify rejection"]} />
                <TableRow cells={["Actions cannot execute without positive authorization", "Fail-closed execution gate; default state is LOCKED", "Submit intent without approval; verify gate remains locked"]} />
                <TableRow cells={["Blocked actions are still auditable", "Denial receipts with same cryptographic rigor as approval receipts", "Deny an intent; verify a signed receipt is produced and ledgered"]} />
                <TableRow cells={["Audits do not require trusting the operator", "Independent verifier validates receipts using only public keys and hash algorithms", "Run verifier without access to signing keys; verify PASS/FAIL determination"]} />
              </tbody>
            </table>
          </div>

          {/* 5. EGI Assessment */}
          <SectionHeading id="egi-assessment" number="5" title="EGI Assessment" />
          <P>
            The following table maps each EGI property (from Section 2) to the specific RIO
            implementation that satisfies it, with the test evidence from the repository.
          </P>
          <div className="overflow-x-auto my-6 rounded-lg border" style={{ borderColor: "rgba(184,150,62,0.2)" }}>
            <table className="w-full text-left">
              <thead style={{ backgroundColor: "rgba(184,150,62,0.06)" }}>
                <TableRow header cells={["EGI Property", "RIO Implementation", "Test Evidence"]} />
              </thead>
              <tbody>
                <TableRow cells={["P1 — Execution Gating", "Execution gate defaults to LOCKED; requires explicit APPROVED status from human approval stage", "57 core tests include gating verification; gateway returns 403 on unapproved execution attempts"]} />
                <TableRow cells={["P2 — Cryptographic Binding", "v2 receipt contains intent_hash, action_hash, verification_hash, Ed25519 signature, and ledger entry with chain hash", "Independent verifier runs 7 checks per receipt (32 tests + 13 subtests); simulator generates and verifies complete receipt chains"]} />
                <TableRow cells={["P3 — Pre-Execution Policy", "4-component risk scoring (base, role, amount, target) feeds policy engine; evaluation occurs at Stage 4, before Stage 6 execution", "Conformance tests verify policy blocks high-risk intents before execution (23 tests)"]} />
                <TableRow cells={["P4 — Independent Verifiability", "Standalone verifier validates receipt signatures, hash chains, and ledger integrity using only public keys", "Verifier passes 32 tests + 13 subtests without access to signing keys"]} />
                <TableRow cells={["P5 — Fail-Closed Default", "Kill switch (V-005) halts all execution; missing approval defaults to LOCKED; policy engine failure blocks execution", "Security vector V-005 tested in core harness; gateway returns 403 on all blocked paths"]} />
              </tbody>
            </table>
          </div>
          <P>
            <Gold>Assessment: RIO satisfies all five EGI properties (P1–P5)</Gold> based on
            the implementation evidence in the public repository. Each property is verified by
            independent tests that can be reproduced by any party with access to the
            repository.
          </P>

          {/* 6. EU AI Act */}
          <SectionHeading id="eu-ai-act" number="6" title="Mapping RIO to the EU AI Act" />
          <SubHeading>Article 12: Record-Keeping</SubHeading>
          <BlockQuote>
            "High-risk AI systems shall technically allow for the automatic recording of
            events (logs) over the lifetime of the system." — EU AI Act, Article 12(1)
          </BlockQuote>
          <P>
            Article 12 requires that logs include: identification of persons involved in
            verification, timestamps, reference data for input, and data that allows
            traceability of results. The following table maps each Article 12 requirement to
            the specific RIO receipt field that covers it:
          </P>
          <div className="overflow-x-auto my-6 rounded-lg border" style={{ borderColor: "rgba(184,150,62,0.2)" }}>
            <table className="w-full text-left">
              <thead style={{ backgroundColor: "rgba(184,150,62,0.06)" }}>
                <TableRow header cells={["Article 12 / ISO A.6.2.8 Requirement", "RIO Receipt Field"]} />
              </thead>
              <tbody>
                <TableRow cells={["Actor identification", "requester_id, approver_id (with role attribution)"]} />
                <TableRow cells={["Timestamp of event", "created_at, executed_at, verified_at (ISO 8601 UTC)"]} />
                <TableRow cells={["Reference to input data", "intent_hash (SHA-256 of original intent)"]} />
                <TableRow cells={["Reference to AI model/version", "policy_version, risk_model_version"]} />
                <TableRow cells={["Traceability of results", "action_hash, verification_hash, verification_status"]} />
                <TableRow cells={["Tamper evidence", "signature (Ed25519/ECDSA), chain_hash (SHA-256 linked to previous entry)"]} />
                <TableRow cells={["Decision rationale", "risk_score, risk_category, policy_decision, denial_reason (when applicable)"]} />
              </tbody>
            </table>
          </div>
          <P>
            RIO's logging is <Strong>automatic</Strong> (every execution produces a receipt
            without developer intervention), <Strong>tamper-evident</Strong> (hash-chained
            ledger), and <Strong>attributable</Strong> (every receipt identifies the requester
            and, when applicable, the human approver). This is not a logging framework that
            developers configure — it is a structural byproduct of the execution pipeline.
          </P>

          <SubHeading>Article 14: Human Oversight</SubHeading>
          <BlockQuote>
            "High-risk AI systems shall be designed and developed in such a way [...] that
            they can be effectively overseen by natural persons during the period in which
            they are in use." — EU AI Act, Article 14(1)
          </BlockQuote>
          <P>
            Article 14(4) specifies concrete oversight capabilities: monitoring (14(4)(a)),
            override (14(4)(d)), and stop mechanisms (14(4)(e)).
          </P>
          <P>
            <Strong>Monitoring (14(4)(a)):</Strong> The structured intent format makes every
            AI request human-readable before execution. The risk score and policy decision are
            computed and recorded, providing real-time visibility. The audit ledger provides
            complete historical monitoring.
          </P>
          <P>
            <Strong>Override (14(4)(d)):</Strong> The human approval gate is the core
            mechanism. When the risk score exceeds the configured threshold, the execution
            gate locks until a human explicitly approves or denies. The human's decision is
            cryptographically signed, creating an unforgeable record. Denial produces a full
            receipt with the same cryptographic rigor as approval.
          </P>
          <P>
            <Strong>Stop mechanism (14(4)(e)):</Strong> The kill switch provides a global halt
            that blocks all execution regardless of authorization state. This is tested as
            security vector V-005 in the test harness.
          </P>
          <P>
            The distinction is between <Strong>advisory oversight</Strong> — telling the AI
            to ask for permission — and <Strong>structural oversight</Strong> — making it
            architecturally impossible to proceed without permission. RIO implements the
            latter. The execution gate cannot open without the required authorization. This is
            not a software configuration; it is a protocol property.
          </P>

          <SubHeading>Article 9: Risk Management System</SubHeading>
          <BlockQuote>
            "A risk management system [...] shall be established, implemented, documented, and
            maintained in relation to high-risk AI systems."
          </BlockQuote>
          <P>
            The 4-component risk scoring model (base risk, role modifier, amount modifier,
            target modifier) provides quantitative risk assessment for every intent. The
            policy engine maps risk levels to governance actions (ALLOW, BLOCK,
            REQUIRE_APPROVAL). The Learning Loop analyzes historical patterns from the ledger
            and enables simulation of policy changes against past data before deployment.
            Policy versioning (PROPOSED → APPROVED → ACTIVATED → INACTIVE) ensures that risk
            management measures are documented and traceable.
          </P>

          {/* 7. NIST */}
          <SectionHeading id="nist" number="7" title="Mapping RIO to NIST AI RMF 1.0" />
          <P>
            The NIST AI Risk Management Framework organizes AI governance into four core
            functions.<Ref n={2} /> RIO provides infrastructure for each:
          </P>
          <div className="overflow-x-auto my-6 rounded-lg border" style={{ borderColor: "rgba(184,150,62,0.2)" }}>
            <table className="w-full text-left">
              <thead style={{ backgroundColor: "rgba(184,150,62,0.06)" }}>
                <TableRow header cells={["NIST Function", "Description", "RIO Implementation"]} />
              </thead>
              <tbody>
                <TableRow cells={["GOVERN", "Establish policies, roles, and accountability structures", "Policy engine with versioned lifecycle; role-based access control; identity attribution on every receipt; 10 system invariants enforced by architecture"]} />
                <TableRow cells={["MAP", "Identify context, capabilities, and risks of AI systems", "Intake Loop translates goals into structured intents; risk classification assigns category and score; intent ontology defines action taxonomy"]} />
                <TableRow cells={["MEASURE", "Analyze, assess, and track AI risks", "4-component risk scoring on every intent; audit ledger provides historical risk data; Learning Loop enables pattern analysis across the corpus"]} />
                <TableRow cells={["MANAGE", "Prioritize and act on AI risks", "Policy engine enforces risk-based decisions (ALLOW/BLOCK/REQUIRE_APPROVAL); human approval gate for high-risk actions; kill switch for emergency halt; denial receipts ensure blocked actions are recorded"]} />
              </tbody>
            </table>
          </div>
          <P>
            NIST identifies <Strong>accountability</Strong> and{" "}
            <Strong>transparency</Strong> as foundational characteristics of trustworthy AI.
            RIO's receipt system provides both: every action is attributed to a specific
            requester and (when applicable) a specific human approver, and every decision is
            recorded with its full reasoning chain.<Ref n={2} />
          </P>

          {/* 8. ISO */}
          <SectionHeading
            id="iso"
            number="8"
            title="Mapping RIO to ISO/IEC 42001:2023"
          />
          <P>
            ISO 42001 defines 38 controls across 9 domains for AI management systems.
            <Ref n={3} /> The following controls have direct RIO implementations:
          </P>
          <div className="overflow-x-auto my-6 rounded-lg border" style={{ borderColor: "rgba(184,150,62,0.2)" }}>
            <table className="w-full text-left">
              <thead style={{ backgroundColor: "rgba(184,150,62,0.06)" }}>
                <TableRow header cells={["ISO 42001 Control", "RIO Implementation"]} />
              </thead>
              <tbody>
                <TableRow cells={["A.2 — AI Impact Assessment", "Risk scoring engine evaluates impact of every proposed action; policy engine maps impact to governance requirements"]} />
                <TableRow cells={["A.3 — AI System Lifecycle", "Three-Loop Architecture covers the full lifecycle: intake, governance, execution, verification, learning, and policy refinement"]} />
                <TableRow cells={["A.5 — AI System Documentation", "53 specification documents, 8 JSON schemas, protocol state machine, threat model, and verification test matrix — all in the public repository"]} />
                <TableRow cells={["A.6.2.8 — AI Event Logging", "Automatic, cryptographically signed, tamper-evident logging as a structural byproduct of the execution pipeline; receipt schema aligns with A.6.2.8 recommended fields"]} />
                <TableRow cells={["A.7 — AI System Monitoring", "Real-time monitoring through the audit ledger; every action produces a receipt that can be queried, analyzed, and audited"]} />
                <TableRow cells={["A.9 — Responsible AI Practices", "Fail-closed design ensures no action without authorization; denial receipts ensure accountability for blocked actions; human authority preserved by structural enforcement"]} />
              </tbody>
            </table>
          </div>

          {/* 9. Limitations */}
          <SectionHeading
            id="limitations"
            number="9"
            title="What RIO Does Not Address"
          />
          <P>
            An honest assessment requires identifying what RIO does not cover:
          </P>
          <P>
            <Strong>Data governance (EU AI Act Article 10):</Strong> RIO governs what AI
            systems <em>do</em>, not what data they are trained on. Training data quality,
            bias detection, and data representativeness are outside the protocol's scope.
          </P>
          <P>
            <Strong>Model transparency and explainability (Article 13, partial):</Strong> RIO
            provides transparency about <em>decisions and actions</em> — who requested, who
            approved, what happened, what the risk score was. It does not provide transparency
            about <em>why the AI model generated a particular recommendation</em>. That is a
            model-level concern, not an execution-level concern.
          </P>
          <P>
            <Strong>Accuracy and robustness (Article 15):</Strong> RIO does not assess
            whether an AI model's outputs are accurate. It governs whether those outputs are
            authorized to be acted upon.
          </P>
          <P>
            <Strong>Content safety and guardrails:</Strong> RIO does not filter or validate
            the content of AI outputs. It governs the execution of actions, not the generation
            of text.
          </P>
          <P>
            <Strong>Full AI lifecycle logging:</Strong> RIO currently covers the execution
            phase of the AI lifecycle. Design-time, training-time, deployment, and
            decommissioning logging are not yet in scope.
          </P>
          <P>
            <Strong>GDPR-tuned retention and minimization:</Strong> The current ledger is
            append-only with no retention policy. Data minimization and right-to-erasure
            considerations for logged personal data are identified as future work.
          </P>
          <P>
            <Strong>Distributed ledger:</Strong> The current ledger implementation is
            single-node. A distributed ledger for enhanced resilience is identified as future
            work.
          </P>
          <P>
            <Strong>HSM integration:</Strong> Signing keys are currently managed in software.
            HSM integration for production-grade key management is identified as future work.
          </P>
          <P>
            These gaps reflect RIO's deliberate scope. RIO is an execution governance layer,
            not a complete AI management system. It is designed to be composed with other
            tools that address content safety, model transparency, and data governance.
          </P>

          {/* 10. Landscape */}
          <SectionHeading id="landscape" number="10" title="Landscape Analysis" />
          <P>
            To position RIO precisely, it is useful to classify existing AI governance tools
            by the layer they operate on:
          </P>
          <div className="overflow-x-auto my-6 rounded-lg border" style={{ borderColor: "rgba(184,150,62,0.2)" }}>
            <table className="w-full text-left">
              <thead style={{ backgroundColor: "rgba(184,150,62,0.06)" }}>
                <TableRow
                  header
                  cells={[
                    "Layer",
                    "What It Governs",
                    "Execution Receipts",
                    "Gates Execution",
                    "Tamper-Evident Ledger",
                  ]}
                />
              </thead>
              <tbody>
                <TableRow cells={["Content", "What AI says", "No", "No", "No"]} />
                <TableRow cells={["Access", "What AI can reach", "No", "Partially", "No"]} />
                <TableRow cells={["Approval", "Whether a human agrees", "No", "Partially", "No"]} />
                <TableRow cells={["Audit", "What AI did (after the fact)", "Partially", "No", "Yes"]} />
                <TableRow cells={["Execution", "What AI is allowed to do", "Yes", "Yes (fail-closed)", "Yes"]} />
              </tbody>
            </table>
          </div>
          <P>
            Each layer addresses a legitimate concern. Content guardrails prevent harmful
            outputs. Access control prevents unauthorized data access. Approval frameworks
            provide human checkpoints. Audit systems provide after-the-fact accountability.
          </P>
          <P>
            The execution layer is distinct because it operates <em>before</em> the action
            occurs, <em>during</em> the authorization decision, and <em>after</em> the
            execution completes — producing a single, cryptographically bound record that
            spans the entire lifecycle of a consequential action. This is the layer that
            Articles 9, 12, and 14 of the EU AI Act collectively require.<Ref n={1} />
          </P>
          <P>
            RIO is an implementation of Execution Governance Infrastructure. The protocol is
            open and the conformance test suite is public. Other implementations of EGI are
            possible and, from a regulatory perspective, desirable — the category should not
            depend on a single implementation.
          </P>

          {/* 11. Implications */}
          <SectionHeading
            id="implications"
            number="11"
            title="Practical Implications"
          />
          <P>
            If Execution Governance Infrastructure were adopted as standard infrastructure for
            AI systems performing consequential actions, several practical consequences would
            follow:
          </P>
          <P>
            <Gold>Regulatory compliance becomes structural, not procedural.</Gold>{" "}
            Organizations would not need to build custom audit logging, approval workflows,
            and risk assessment systems for each AI deployment. The protocol provides these as
            standard capabilities, similar to how TLS provides encryption as standard
            infrastructure for web traffic.
          </P>
          <P>
            <Gold>Audit becomes verifiable, not trust-based.</Gold> Regulators could verify
            compliance by examining the cryptographic ledger, rather than relying on
            self-reported logs that may be incomplete or modified. The independent verifier
            demonstrates this — it validates receipts and ledger entries without access to the
            signing keys.
          </P>
          <P>
            <Gold>Human oversight becomes enforceable, not advisory.</Gold> The fail-closed
            execution gate ensures that human authority is preserved by architecture, not by
            the AI's willingness to follow instructions. This addresses the fundamental
            concern underlying Article 14: that AI systems operating at machine speed may
            bypass human oversight not through malice, but through the structural absence of a
            governance layer.
          </P>
          <P>
            <Gold>Cross-organizational accountability becomes possible.</Gold> When multiple
            organizations deploy AI agents that interact with each other, the receipt chain
            provides a shared, verifiable record of what each agent did and who authorized it.
            This is relevant for supply chain automation, financial services, and healthcare —
            domains where the EU AI Act's high-risk classification applies.
          </P>

          {/* 12. Conclusion */}
          <SectionHeading id="conclusion" number="12" title="Conclusion" />
          <P>
            This paper defined Execution Governance Infrastructure (EGI) as a class of
            systems that gate execution, produce cryptographically bound records, enforce
            policy before action, allow independent verification, and fail closed when
            conditions are not met. It then demonstrated, through implementation evidence,
            that the RIO Protocol satisfies each of these properties.
          </P>
          <P>
            The evidence is concrete. The protocol specification comprises 53 documents and 8
            JSON schemas. The reference implementation passes 57 core tests. The independent
            verifier passes 32 tests with 13 subtests. The conformance suite passes 23 tests.
            The gateway passes 7 conformance tests and 7 SDK tests. The simulator produces
            cryptographically valid artifacts across 4 generation modes. The total verified
            test count is <Gold>143 with zero failures</Gold>.
          </P>
          <P>
            The protocol provides the following technical guarantees: past records cannot be
            altered without detection (hash-chained ledger); approvals cannot be forged
            (Ed25519/ECDSA signatures); tokens cannot be replayed (nonce registry);
            authorization cannot be reused after expiration (TTL enforcement); actions cannot
            execute without positive authorization (fail-closed gate); blocked actions are
            still auditable (denial receipts); and audits do not require trusting the operator
            (independent verifier).
          </P>
          <P>
            The regulatory alignment is direct. The EU AI Act's Article 12 requires automatic,
            tamper-evident logging with actor attribution, model/policy references, timestamps,
            and before/after state — RIO's receipt schema covers each field. Article 14
            requires human oversight with structural intervention capability — RIO's execution
            gate is fail-closed and requires explicit human authorization for high-risk
            actions. Article 9 requires continuous risk management — RIO's risk scoring engine
            and policy lifecycle provide this. NIST AI RMF's four functions each have
            corresponding RIO implementations. ISO 42001's controls for event logging,
            monitoring, lifecycle management, and responsible AI practices are addressed by the
            protocol's core architecture.
          </P>
          <P>
            RIO does not claim to be a complete AI management system. It does not address data
            governance, model transparency, content safety, or training data quality. It is an
            execution governance layer — designed to be composed with other tools that address
            those concerns.
          </P>
          <P>
            What it provides is the infrastructure for a specific, demonstrable regulatory
            requirement: <Strong>a verifiable, cryptographic record that a specific action was
            authorized by a specific human, executed under a specific policy, verified against
            its stated intent, and recorded in a tamper-evident ledger that any independent
            party can audit.</Strong>
          </P>

          {/* References */}
          <SectionHeading id="references" number="" title="References" />
          <div className="flex flex-col gap-2 text-sm text-[#9ca3af]">
            {[
              {
                n: 1,
                text: 'European Parliament and Council of the European Union. "Regulation (EU) 2024/1689 — Artificial Intelligence Act." Official Journal of the European Union, June 13, 2024.',
                url: "https://artificialintelligenceact.eu/",
              },
              {
                n: 2,
                text: 'National Institute of Standards and Technology. "Artificial Intelligence Risk Management Framework (AI RMF 1.0)." NIST AI 100-1, January 2023.',
                url: "https://nvlpubs.nist.gov/nistpubs/ai/nist.ai.100-1.pdf",
              },
              {
                n: 3,
                text: 'International Organization for Standardization. "ISO/IEC 42001:2023 — Information technology — Artificial intelligence — Management system." 2023.',
                url: "https://www.iso.org/standard/81230.html",
              },
              {
                n: 4,
                text: 'ISMS.online. "ISO 42001 A.6.2.8 — AI Event Logging."',
                url: "https://www.isms.online/iso-42001/annex-a-controls/a-6-ai-system-life-cycle/a-6-2-8-ai-system-recording-of-event-logs/",
              },
              {
                n: 5,
                text: 'EU AI Act Service Desk. "Article 12: Record-keeping." European Commission.',
                url: "https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-12",
              },
              {
                n: 6,
                text: 'ISMS.online. "Is Your AI Logging Article 12-Ready? Avoid EU Compliance Gaps."',
                url: "https://www.isms.online/iso-42001/eu-ai-act/article-12/",
              },
              {
                n: 7,
                text: 'VDE. "EU AI Act: AI system logging."',
                url: "https://www.vde.com/topics-en/artificial-intelligence/blog/eu-ai-act--ai-system-logging",
              },
              {
                n: 8,
                text: "RIO Protocol Repository.",
                url: "https://github.com/bkr1297-RIO/rio-protocol",
              },
              {
                n: 9,
                text: "RIO Reference Implementation Repository.",
                url: "https://github.com/bkr1297-RIO/rio-reference-impl",
              },
              {
                n: 10,
                text: "RIO Tools Repository.",
                url: "https://github.com/bkr1297-RIO/rio-tools",
              },
            ].map((ref) => (
              <p key={ref.n} className="leading-relaxed">
                <span className="text-[#60a5fa]">[{ref.n}]</span>{" "}
                {ref.text}{" "}
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#60a5fa] hover:underline break-all"
                >
                  {ref.url}
                </a>
              </p>
            ))}
          </div>

          {/* Footer */}
          <div
            className="mt-16 pt-8 border-t text-center"
            style={{ borderColor: "rgba(184,150,62,0.15)" }}
          >
            <p className="text-xs" style={{ color: "#4b5563" }}>
              Brian K. Rasmussen — Author / Architect
            </p>
            <p className="text-xs mt-1" style={{ color: "#374151" }}>
              RIO Protocol — Runtime Intelligence Orchestration
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
