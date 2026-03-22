/*
 * RIO Demo Site — Landing Page
 *
 * Design spec (from user JSON):
 *   Background: Deep navy blue
 *   Accent: Soft gold (muted/classy, not bright yellow)
 *   Text primary: White
 *   Text secondary: Light gray
 *   Buttons: Navy background with gold outline and white text
 *   Layout: Logo → RIO → Subtitle → Three demo buttons (stacked, centered)
 *   Style: Secure infrastructure / aerospace / banking — not playful
 */

export default function Home() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      {/* Logo */}
      <img
        src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio-logo-clean-v2-SiU5wPFa54dq7xdKJ7WP9y.webp"
        alt="RIO Logo"
        className="w-40 h-40 mb-8 rounded-full"
      />

      {/* Title: RIO — bold, block lettering, gold */}
      <h1
        className="text-7xl font-black tracking-[0.15em] mb-4"
        style={{ color: "#b8963e" }}
      >
        RIO
      </h1>

      {/* Subtitle: Runtime Intelligence Orchestration — lighter font, gray */}
      <p
        className="text-lg font-light tracking-[0.08em] mb-16"
        style={{ color: "#9ca3af" }}
      >
        Runtime Intelligence Orchestration
      </p>

      {/* Three demo buttons — large, centered, stacked vertically */}
      <div className="flex flex-col gap-5 w-full max-w-md">
        <a
          href="/demo1"
          className="w-full py-4 px-6 text-base font-medium tracking-wide uppercase text-white border rounded transition-colors duration-200 hover:bg-white/5 text-center block"
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
          className="w-full py-4 px-6 text-base font-medium tracking-wide uppercase text-white border rounded transition-colors duration-200 hover:bg-white/5 text-center block"
          style={{
            backgroundColor: "transparent",
            borderColor: "#b8963e",
            borderWidth: "1.5px",
          }}
        >
          Demo 2 — How RIO Enforces Approval
        </a>

        <button
          className="w-full py-4 px-6 text-base font-medium tracking-wide uppercase text-white border rounded transition-colors duration-200 hover:bg-white/5"
          style={{
            backgroundColor: "transparent",
            borderColor: "#b8963e",
            borderWidth: "1.5px",
          }}
        >
          Demo 3 — Audit & Runtime Log
        </button>
      </div>
    </div>
  );
}
