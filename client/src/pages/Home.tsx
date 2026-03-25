/*
 * RIO Demo Site — Landing Page
 * Two-column layout: Left = The Problem, Our Approach, With RIO What Changes
 * Right = Three demo buttons
 * Gold divider line between columns on desktop
 */

export default function Home() {
  return (
    <div
      className="min-h-screen flex flex-col px-6 py-12"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      {/* Top-left GitHub link */}
      <div className="mb-6">
        <a
          href="https://github.com/bkr1297-RIO/rio-protocol"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm transition-colors duration-200 hover:opacity-80"
          style={{ color: "#9ca3af" }}
        >
          <svg
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              clipRule="evenodd"
            />
          </svg>
          <span style={{ color: "#b8963e" }} className="font-medium">RIO</span>
          <span>— A runtime control and audit protocol for AI and automated systems</span>
          <span className="text-xs" style={{ color: "#6b7280" }}>View on GitHub →</span>
        </a>
      </div>

      {/* Top section: Logo + Title + Subtitle centered */}
      <div className="flex flex-col items-center mb-16">
        <img
          src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio-logo-new_8049c497.png"
          alt="RIO Logo"
          className="w-36 h-36 mb-6"
        />
        <h1
          className="text-7xl font-black tracking-[0.15em] mb-4"
          style={{ color: "#b8963e" }}
        >
          RIO
        </h1>
        <p
          className="text-xl font-bold tracking-[0.08em]"
          style={{ color: "#9ca3af" }}
        >
          Runtime Intelligence Orchestration
        </p>
      </div>

      {/* Two-column layout with CSS grid for true side-by-side */}
      <div
        className="max-w-6xl mx-auto w-full"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: "0",
        }}
      >
        {/* LEFT COLUMN — The Problem, Our Approach, With RIO What Changes */}
        <div className="flex flex-col gap-10 pr-10">

          {/* The Problem */}
          <div>
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "#b8963e" }}
            >
              The Problem
            </h2>
            <p
              className="text-base leading-relaxed"
              style={{ color: "#d1d5db" }}
            >
              AI models and agents are powerful and helpful tools but when we allow them to interpret and assume what "helpful" means, irreversible consequences can occur. Most AI governance systems rely on prompts, alignment, or policies to guide AI behavior which largely results in the system governing itself. We're essentially asking it to play the game, coach the game, and referee the game. It shouldn't be surprising that important files are then deleted, untimely emails are sent, and money is sent without approval.
            </p>
          </div>

          {/* Our Approach */}
          <div>
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "#b8963e" }}
            >
              Our Approach
            </h2>
            <p
              className="text-base leading-relaxed"
              style={{ color: "#d1d5db" }}
            >
              RIO is a runtime control and audit protocol for AI and automated systems that requires explicit human approval for real-world actions and produces verifiable decision receipts recorded in a tamper-evident ledger. This includes sending emails, deleting files, sending money, and more. The system itself, not the AI or agent, enforces this boundary.
            </p>
          </div>

          {/* With RIO, What Changes */}
          <div>
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "#b8963e" }}
            >
              With RIO, What Changes
            </h2>
            <p
              className="text-base leading-relaxed"
              style={{ color: "#d1d5db" }}
            >
              The human retains authority and every action is traceable, visible, time stamped, and stored. With RIO, AI goes from being a powerful but sometimes unpredictable tool, to a capable, trusted, collaborating partner. It allows the human to be in the loop, understand what is going on in the loop, and control the loop.
            </p>
          </div>
        </div>

        {/* GOLD DIVIDER LINE */}
        <div
          className="hidden lg:block"
          style={{
            width: "1px",
            backgroundColor: "#b8963e",
            opacity: 0.4,
            margin: "0 1.5rem",
          }}
        />

        {/* RIGHT COLUMN — Intro text + Three demo buttons */}
        <div className="flex flex-col items-center justify-start gap-14 pl-10">
          <p
            className="text-sm leading-relaxed text-center max-w-md"
            style={{ color: "#d1d5db" }}
          >
            Below are 3 super quick "proof of concept" demos showing what RIO does, how it enforces rules, and showing the audit trail.
          </p>
          <a
            href="/demo1"
            className="w-full max-w-md py-4 px-6 text-base font-medium tracking-wide uppercase text-white border rounded transition-colors duration-200 hover:bg-white/5 text-center block"
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
            className="w-full max-w-md py-4 px-6 text-base font-medium tracking-wide uppercase text-white border rounded transition-colors duration-200 hover:bg-white/5 text-center block"
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
            className="w-full max-w-md py-4 px-6 text-base font-medium tracking-wide uppercase text-white border rounded transition-colors duration-200 hover:bg-white/5 text-center block"
            style={{
              backgroundColor: "transparent",
              borderColor: "#b8963e",
              borderWidth: "1.5px",
            }}
          >
            Demo 3 — Audit & Runtime Log
          </a>
        </div>
      </div>

      {/* Mobile: stack columns vertically */}
      <style>{`
        @media (max-width: 1023px) {
          div[style*="grid-template-columns"] {
            display: flex !important;
            flex-direction: column !important;
            gap: 3rem !important;
          }
          div[style*="grid-template-columns"] > div:first-child {
            padding-right: 0 !important;
          }
          div[style*="grid-template-columns"] > div:last-child {
            padding-left: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
