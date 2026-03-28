/*
 * RIO Demo Site — Landing Page
 *
 * Reconfigured layout:
 *   1. NavBar (handles GitHub links, navigation)
 *   2. Hero: Logo + Title + "What is RIO?" summary above the fold
 *   3. Two-column: Left = The Problem, Our Approach, With RIO What Changes
 *                  Right = Four demo buttons + intro text
 */

import NavBar from "@/components/NavBar";

export default function Home() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      <NavBar />

      <div className="flex flex-col flex-1 px-4 sm:px-6 py-8 sm:py-12">

        {/* ── Hero: Logo + Title + What is RIO ──────────────────────────────── */}
        <div className="flex flex-col items-center mb-10 sm:mb-14">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio-logo-new_8049c497.png"
            alt="RIO Logo"
            className="w-24 h-24 sm:w-32 sm:h-32 mb-4 sm:mb-5"
          />
          <h1
            className="text-5xl sm:text-7xl font-black tracking-[0.15em] mb-3"
            style={{ color: "#b8963e" }}
          >
            RIO
          </h1>
          <p
            className="text-base sm:text-xl font-bold tracking-[0.08em] mb-2"
            style={{ color: "#9ca3af" }}
          >
            Runtime Intelligence Orchestration
          </p>
          <p
            className="text-xs sm:text-sm font-medium tracking-[0.12em] uppercase mb-6"
            style={{ color: "#60a5fa" }}
          >
            Runtime Governance and Execution Control Plane for AI Systems
          </p>

          {/* What is RIO — above the fold summary */}
          <div
            className="max-w-3xl w-full p-5 sm:p-6 rounded-lg border text-center"
            style={{
              borderColor: "rgba(184,150,62,0.25)",
              backgroundColor: "rgba(184,150,62,0.04)",
            }}
          >
            <h2 className="text-sm font-semibold tracking-[0.15em] uppercase mb-3" style={{ color: "#b8963e" }}>
              What is RIO?
            </h2>
            <p className="text-sm sm:text-base leading-relaxed mb-3" style={{ color: "#d1d5db" }}>
              RIO is a <strong style={{ color: "#ffffff" }}>governed execution system</strong> that sits between
              AI, humans, and real-world actions. It translates goals into structured intent, evaluates risk and
              policy, requires approval when necessary, controls execution, verifies outcomes, and generates
              cryptographically signed receipts recorded in a tamper-evident ledger.
              {" "}<strong style={{ color: "#b8963e" }}>The system enforces the rules, not the AI.</strong>
            </p>
            <p className="text-sm sm:text-base leading-relaxed" style={{ color: "#d1d5db" }}>
              Built on a three-loop architecture {"\u2014"}{" "}
              <strong style={{ color: "#60a5fa" }}>Intake</strong> (goal &rarr; intent),{" "}
              <strong style={{ color: "#b8963e" }}>Governance</strong> (policy &rarr; approval &rarr; execution &rarr; verification), and{" "}
              <strong style={{ color: "#22d3ee" }}>Learning</strong> (ledger &rarr; policy improvement)
              {" "}{"\u2014"} RIO creates a closed-loop system where every action is authorized, executed, verified,
              recorded, and used to improve future decisions.
            </p>
            {/* Primary CTA — See What RIO Makes Possible for You */}
            <div className="flex flex-col items-center gap-4 mt-6">
              <a
                href="/demo"
                className="inline-block py-3.5 px-10 text-base sm:text-lg font-bold rounded-lg transition-all duration-200 hover:scale-[1.02]"
                style={{
                  backgroundColor: "#b8963e",
                  color: "#0a0e1a",
                  boxShadow: "0 4px 20px rgba(184,150,62,0.3)",
                }}
              >
                See What RIO Makes Possible for You
              </a>
              <div className="flex flex-wrap justify-center gap-3">
                <a
                  href="/app"
                  className="text-xs font-medium py-1.5 px-4 border rounded transition-colors hover:bg-white/5"
                  style={{ borderColor: "#b8963e", color: "#b8963e" }}
                >
                  Launch Bondi App
                </a>
                <a
                  href="/whitepaper"
                  className="text-xs font-medium py-1.5 px-4 border rounded transition-colors hover:bg-white/5"
                  style={{ borderColor: "#374151", color: "#9ca3af" }}
                >
                  Read the Whitepaper
                </a>
                <a
                  href="https://github.com/bkr1297-RIO/rio-protocol"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium py-1.5 px-4 border rounded transition-colors hover:bg-white/5"
                  style={{ borderColor: "#374151", color: "#9ca3af" }}
                >
                  View on GitHub
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ── Two-column layout — stacks on mobile ─────────────────────────── */}
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-10 lg:gap-0">

          {/* LEFT COLUMN — The Problem, Our Approach, With RIO What Changes */}
          <div className="flex flex-col gap-8 sm:gap-10 lg:pr-10">

            {/* The Problem */}
            <div>
              <h2
                className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4"
                style={{ color: "#b8963e" }}
              >
                The Problem
              </h2>
              <p
                className="text-sm sm:text-base leading-relaxed"
                style={{ color: "#d1d5db" }}
              >
                AI models and agents are powerful and helpful tools but when we allow them to interpret and assume what "helpful" means, irreversible consequences can occur. Most AI governance systems rely on prompts, alignment, or policies to guide AI behavior which largely results in the system governing itself. We're essentially asking it to play the game, coach the game, and referee the game. It shouldn't be surprising that important files are then deleted, untimely emails are sent, and money is sent without approval.
              </p>
            </div>

            {/* Our Approach */}
            <div>
              <h2
                className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4"
                style={{ color: "#b8963e" }}
              >
                Our Approach
              </h2>
              <p
                className="text-sm sm:text-base leading-relaxed"
                style={{ color: "#d1d5db" }}
              >
                RIO is a governed execution system that sits between AI, humans, and real-world actions. It translates goals into structured intent, evaluates risk and policy, requires approval when necessary, controls execution, verifies outcomes, and generates cryptographically signed receipts recorded in a tamper-evident ledger. The system enforces the rules, not the AI. Built on a three-loop architecture — Intake (goal → intent), Governance (policy → approval → execution → verification), and Learning (ledger → policy improvement) — RIO creates a closed-loop system where every action is authorized, executed, verified, recorded, and used to improve future decisions.
              </p>
            </div>

            {/* With RIO, What Changes */}
            <div>
              <h2
                className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4"
                style={{ color: "#b8963e" }}
              >
                With RIO, What Changes
              </h2>
              <p
                className="text-sm sm:text-base leading-relaxed"
                style={{ color: "#d1d5db" }}
              >
                The human retains authority and every action is traceable, visible, time-stamped, and stored. Every action produces a v2 cryptographic receipt with intent, action, and verification hashes. Every receipt is recorded in a signed, tamper-evident ledger. With RIO, AI goes from being a powerful but sometimes unpredictable tool, to a capable, trusted, collaborating partner. It allows the human to be in the loop, understand what is going on in the loop, and control the loop.
              </p>
            </div>
          </div>

          {/* GOLD DIVIDER LINE — desktop only */}
          <div
            className="hidden lg:block"
            style={{
              width: "1px",
              backgroundColor: "#b8963e",
              opacity: 0.4,
              margin: "0 1.5rem",
            }}
          />

          {/* Mobile gold divider */}
          <div
            className="lg:hidden mx-auto"
            style={{
              width: "60%",
              height: "1px",
              backgroundColor: "#b8963e",
              opacity: 0.3,
            }}
          />

          {/* RIGHT COLUMN — Intro text + Four demo buttons */}
          <div className="flex flex-col items-center justify-start gap-6 sm:gap-10 lg:pl-10">
            <p
              className="text-xs sm:text-sm leading-relaxed text-center max-w-md"
              style={{ color: "#d1d5db" }}
            >
              These demos show what RIO does, how it enforces rules, the audit trail it produces, and the full governed execution pipeline in action.
            </p>
            <a
              href="/demo1"
              className="w-full max-w-md py-3 sm:py-4 px-4 sm:px-6 text-sm sm:text-base font-medium tracking-wide uppercase text-white border rounded transition-colors duration-200 hover:bg-white/5 text-center block"
              style={{
                backgroundColor: "transparent",
                borderColor: "#b8963e",
                borderWidth: "1.5px",
              }}
            >
              Demo 1 — Human Approval Required
            </a>

            <a
              href="/demo2"
              className="w-full max-w-md py-3 sm:py-4 px-4 sm:px-6 text-sm sm:text-base font-medium tracking-wide uppercase text-white border rounded transition-colors duration-200 hover:bg-white/5 text-center block"
              style={{
                backgroundColor: "transparent",
                borderColor: "#b8963e",
                borderWidth: "1.5px",
              }}
            >
              Demo 2 — How RIO Enforces Approval
            </a>

            <a
              href="/demo3"
              className="w-full max-w-md py-3 sm:py-4 px-4 sm:px-6 text-sm sm:text-base font-medium tracking-wide uppercase text-white border rounded transition-colors duration-200 hover:bg-white/5 text-center block"
              style={{
                backgroundColor: "transparent",
                borderColor: "#b8963e",
                borderWidth: "1.5px",
              }}
            >
              Demo 3 — Audit & Runtime Log
            </a>

            <a
              href="/demo4"
              className="w-full max-w-md py-3 sm:py-4 px-4 sm:px-6 text-sm sm:text-base font-medium tracking-wide uppercase text-white border rounded transition-colors duration-200 hover:bg-white/5 text-center block"
              style={{
                backgroundColor: "transparent",
                borderColor: "#22c55e",
                borderWidth: "1.5px",
                color: "#22c55e",
              }}
            >
              Demo 4 — Full Pipeline (New)
            </a>
          </div>
        </div>

        {/* ── Footer attribution ───────────────────────────────────────────── */}
        <div className="mt-12 sm:mt-16 text-center">
          <p className="text-xs" style={{ color: "#4b5563" }}>
            Brian K. Rasmussen — Author / Architect
          </p>
        </div>
      </div>
    </div>
  );
}
