/*
 * RIO Demo Site — Landing Page
 * Two-column layout: Left = The Challenge, Our Approach, With RIO What Changes
 * Right = Three demo buttons
 * Gold divider line between columns on desktop
 */

export default function Home() {
  return (
    <div
      className="min-h-screen flex flex-col px-6 py-12"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
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
        {/* LEFT COLUMN — The Challenge, Our Approach, With RIO What Changes */}
        <div className="flex flex-col gap-10 pr-10">

          {/* The Challenge */}
          <div>
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "#b8963e" }}
            >
              The Challenge
            </h2>
            <p
              className="text-base leading-relaxed"
              style={{ color: "#d1d5db" }}
            >
              AI models and agents are powerful and helpful tools, but what happens when we allow it to interpret and assume what helpful means? Irreversible consequences like deleting files, moving money, sending untimely emails, among other things. Most AI governance systems rely on prompts, alignment, or policies to guide AI behavior which largely results in the system governing itself. We're essentially asking it to play in the game, coach the game, and referee the game.
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
              RIO is a runtime control plane that allows AI to propose, analyze, prepare and draft actions, but never execute autonomously when there are real-world consequences without explicit human authorization. This includes sending emails, deleting files, sending money, etc. The system itself, not the AI or agent, enforces this boundary and logs and records every proposal and action in an immutable ledger. Every approval is cryptographically signed, time stamped, and stored. The human decides what actions need explicit approval and what does not based on real life impact. The RIO system simply enforces those decisions.
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
              The human retains authority and every action is traceable, visible, transparent and every action has proof. With RIO, AI goes from being a powerful generating and sometimes unpredictable tool, to a capable, trusted, collaborating partner. It allows the human to be in the loop, understand what is going on in the loop, and control the loop.
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

        {/* RIGHT COLUMN — Three demo buttons */}
        <div className="flex flex-col items-center justify-center gap-5 pl-10">
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
