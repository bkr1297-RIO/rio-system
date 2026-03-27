import NavBar from "@/components/NavBar";
import { Mail, Linkedin, Github, ExternalLink } from "lucide-react";

export default function Contact() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: "#0a1628",
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      <NavBar />

      <main className="flex-1 flex flex-col items-center px-6 py-20">
        {/* Header */}
        <div className="max-w-2xl w-full text-center mb-16">
          <h1
            className="text-4xl sm:text-5xl font-bold tracking-wide mb-4"
            style={{ color: "#b8963e" }}
          >
            Contact
          </h1>
          <p className="text-lg" style={{ color: "#9ca3af" }}>
            Interested in the RIO Protocol? Reach out directly.
          </p>
        </div>

        {/* Contact Cards */}
        <div className="max-w-2xl w-full space-y-6">
          {/* Author Card */}
          <div
            className="rounded-lg border p-8"
            style={{
              backgroundColor: "oklch(0.16 0.02 260)",
              borderColor: "oklch(0.72 0.1 85 / 15%)",
            }}
          >
            <h2
              className="text-xl font-semibold mb-1"
              style={{ color: "#ffffff" }}
            >
              Brian K. Rasmussen
            </h2>
            <p
              className="text-sm mb-6"
              style={{ color: "#9ca3af" }}
            >
              Author &amp; System Architect — RIO Protocol
            </p>

            <div className="space-y-4">
              {/* Email */}
              <a
                href="mailto:Riomethod5@gmail.com"
                className="flex items-center gap-4 p-4 rounded-md border transition-colors duration-200 no-underline hover:bg-white/5"
                style={{
                  borderColor: "oklch(0.72 0.1 85 / 20%)",
                  color: "#d1d5db",
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "oklch(0.72 0.1 85 / 10%)" }}
                >
                  <Mail className="w-5 h-5" style={{ color: "#b8963e" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: "#ffffff" }}>
                    Email
                  </div>
                  <div className="text-sm" style={{ color: "#9ca3af" }}>
                    Riomethod5@gmail.com
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 flex-shrink-0" style={{ color: "#6b7280" }} />
              </a>

              {/* LinkedIn */}
              <a
                href="https://www.linkedin.com/in/bkr-rio"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-4 rounded-md border transition-colors duration-200 no-underline hover:bg-white/5"
                style={{
                  borderColor: "oklch(0.72 0.1 85 / 20%)",
                  color: "#d1d5db",
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "oklch(0.72 0.1 85 / 10%)" }}
                >
                  <Linkedin className="w-5 h-5" style={{ color: "#b8963e" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: "#ffffff" }}>
                    LinkedIn
                  </div>
                  <div className="text-sm" style={{ color: "#9ca3af" }}>
                    linkedin.com/in/bkr-rio
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 flex-shrink-0" style={{ color: "#6b7280" }} />
              </a>

              {/* GitHub */}
              <a
                href="https://github.com/bkr1297-RIO/rio-protocol"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-4 rounded-md border transition-colors duration-200 no-underline hover:bg-white/5"
                style={{
                  borderColor: "oklch(0.72 0.1 85 / 20%)",
                  color: "#d1d5db",
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "oklch(0.72 0.1 85 / 10%)" }}
                >
                  <Github className="w-5 h-5" style={{ color: "#b8963e" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: "#ffffff" }}>
                    GitHub — RIO Protocol
                  </div>
                  <div className="text-sm" style={{ color: "#9ca3af" }}>
                    github.com/bkr1297-RIO/rio-protocol
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 flex-shrink-0" style={{ color: "#6b7280" }} />
              </a>
            </div>
          </div>

          {/* Inquiry Types */}
          <div
            className="rounded-lg border p-8"
            style={{
              backgroundColor: "oklch(0.16 0.02 260)",
              borderColor: "oklch(0.72 0.1 85 / 15%)",
            }}
          >
            <h3
              className="text-lg font-semibold mb-4"
              style={{ color: "#ffffff" }}
            >
              What to Reach Out About
            </h3>
            <div className="space-y-3">
              {[
                "Protocol implementation questions or integration guidance",
                "Regulatory alignment and compliance discussions",
                "Partnership and collaboration opportunities",
                "Contributing to the open protocol specification",
                "Enterprise deployment and licensing inquiries",
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                    style={{ backgroundColor: "#b8963e" }}
                  />
                  <span className="text-sm" style={{ color: "#d1d5db" }}>
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>
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
