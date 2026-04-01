import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ChevronDown } from "lucide-react";

interface NavChild {
  label: string;
  href: string;
}

interface NavLink {
  label: string;
  href: string;
  children?: NavChild[];
  highlight?: boolean;
}

const RIO_LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio-rings-clean_ac8891e1.png";

const navLinks: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Architecture", href: "/architecture" },
  { label: "Use Cases", href: "/use-cases" },
  { label: "Get Started", href: "/get-started" },
  {
    label: "Governance",
    href: "#",
    children: [
      { label: "Try RIO", href: "/go" },
      { label: "Dashboard", href: "/dashboard" },
      { label: "Learning Loop", href: "/learning" },
      { label: "Connect Apps", href: "/connect" },
      { label: "System Status", href: "/status" },
    ],
  },
  { label: "See What RIO Makes Possible for You", href: "/demo", highlight: true },
  {
    label: "Demos",
    href: "#",
    children: [
      { label: "Demo 1 — Human Approval", href: "/demo1" },
      { label: "Demo 2 — Enforcement", href: "/demo2" },
      { label: "Demo 3 — Audit & Proof", href: "/demo3" },
      { label: "Demo 4 — Full Pipeline", href: "/demo4" },
      { label: "Verify Receipt", href: "/verify" },
      { label: "Ledger Explorer", href: "/ledger" },
      { label: "Receipt Chain", href: "/chain" },
      { label: "Tamper Demo", href: "/tamper" },
      { label: "Demo 5 — Learning Loop", href: "/demo5" },
      { label: "Try It Live", href: "/try-it-live" },
    ],
  },
  {
    label: "Resources",
    href: "#",
    children: [
      { label: "Documentation", href: "/docs" },
      { label: "Whitepaper", href: "/whitepaper" },
      { label: "Position Paper", href: "/position-paper" },
      { label: "FAQ", href: "/faq" },
      { label: "Updates", href: "/blog" },
      { label: "Roadmap", href: "/roadmap" },
    ],
  },
];

export default function NavBar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileDropdowns, setMobileDropdowns] = useState<Record<string, boolean>>({});
  const [location] = useLocation();
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = (href: string) => location === href;

  // Close dropdowns on route change
  useEffect(() => {
    setOpenDropdown(null);
    setMobileOpen(false);
  }, [location]);

  const handleMouseEnter = (label: string) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setOpenDropdown(label);
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 150);
  };

  const toggleMobileDropdown = (label: string) => {
    setMobileDropdowns((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  return (
    <nav
      className="w-full border-b sticky top-0 z-50"
      style={{
        backgroundColor: "oklch(0.13 0.03 260)",
        borderColor: "oklch(0.72 0.1 85 / 20%)",
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Left side: Logo + Brand + Contact button */}
          <div className="flex items-center gap-2.5">
            <Link href="/" className="flex items-center gap-2.5 no-underline">
              <img
                src={RIO_LOGO_URL}
                alt="RIO Logo"
                className="w-10 h-10"
              />
              <span
                className="text-lg font-black tracking-[0.2em]"
                style={{ color: "#b8963e" }}
              >
                RIO
              </span>
            </Link>

            {/* Contact button — standalone, right of logo */}
            <Link
              href="/contact"
              className="ml-3 px-3 py-1 text-xs font-medium rounded border transition-colors duration-200 no-underline hover:bg-white/5"
              style={{
                color: isActive("/contact") ? "#b8963e" : "#d1d5db",
                borderColor: isActive("/contact")
                  ? "rgba(184, 150, 62, 0.5)"
                  : "rgba(184, 150, 62, 0.3)",
                backgroundColor: isActive("/contact")
                  ? "rgba(184, 150, 62, 0.08)"
                  : "transparent",
              }}
            >
              Contact
            </Link>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) =>
              link.children ? (
                <div
                  key={link.label}
                  className="relative"
                  onMouseEnter={() => handleMouseEnter(link.label)}
                  onMouseLeave={handleMouseLeave}
                >
                  <button
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded transition-colors duration-150"
                    style={{
                      color:
                        openDropdown === link.label ||
                        link.children.some((c) => isActive(c.href))
                          ? "#b8963e"
                          : "#d1d5db",
                    }}
                  >
                    {link.label}
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        openDropdown === link.label ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <div
                    className="absolute top-full left-0 pt-1"
                    style={{
                      display: openDropdown === link.label ? "block" : "none",
                    }}
                  >
                    <div
                      className="rounded-md border py-1 min-w-[220px] shadow-lg"
                      style={{
                        backgroundColor: "oklch(0.18 0.03 260)",
                        borderColor: "oklch(0.72 0.1 85 / 20%)",
                      }}
                    >
                      {link.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className="block px-4 py-2 text-sm transition-colors duration-150 no-underline"
                          style={{
                            color: isActive(child.href) ? "#b8963e" : "#d1d5db",
                          }}
                        >
                          <span className="hover:opacity-80">{child.label}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ) : link.highlight ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-1.5 text-sm font-semibold rounded transition-all duration-200 no-underline"
                  style={{
                    color: "#b8963e",
                    border: "1px solid rgba(184, 150, 62, 0.4)",
                    background: "rgba(184, 150, 62, 0.08)",
                    textShadow: "0 0 8px rgba(184, 150, 62, 0.3)",
                  }}
                >
                  <span className="hover:opacity-90">{link.label}</span>
                </Link>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2 text-sm font-medium rounded transition-colors duration-150 no-underline"
                  style={{
                    color: isActive(link.href) ? "#b8963e" : "#d1d5db",
                  }}
                >
                  <span className="hover:opacity-80">{link.label}</span>
                </Link>
              )
            )}

            {/* Launch Bondi Button */}
            <Link
              href="/app"
              className="ml-2 px-4 py-1.5 text-xs font-semibold rounded transition-all duration-200 no-underline"
              style={{
                background: "linear-gradient(135deg, oklch(0.55 0.15 260), oklch(0.45 0.2 280))",
                color: "#ffffff",
                boxShadow: "0 0 12px oklch(0.55 0.15 260 / 30%)",
              }}
            >
              <span className="flex items-center gap-1.5">
                Launch Bondi
              </span>
            </Link>

            {/* GitHub Link */}
            <a
              href="https://github.com/bkr1297-RIO/rio-protocol"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 px-3 py-1.5 text-xs font-medium rounded border transition-colors duration-200 no-underline hover:bg-white/5"
              style={{
                color: "#d1d5db",
                borderColor: "oklch(0.72 0.1 85 / 30%)",
              }}
            >
              <span className="flex items-center gap-1.5">
                <svg
                  className="w-3.5 h-3.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
                GitHub
              </span>
            </a>
          </div>

          {/* Mobile Hamburger */}
          <button
            className="md:hidden p-2 rounded"
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{ color: "#d1d5db" }}
          >
            {mobileOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div
          className="md:hidden border-t px-4 py-3"
          style={{
            backgroundColor: "oklch(0.13 0.03 260)",
            borderColor: "oklch(0.72 0.1 85 / 20%)",
          }}
        >
          {navLinks.map((link) =>
            link.children ? (
              <div key={link.label}>
                <button
                  className="w-full flex items-center justify-between py-2.5 text-sm font-medium"
                  style={{
                    color: link.children.some((c) => isActive(c.href))
                      ? "#b8963e"
                      : "#d1d5db",
                  }}
                  onClick={() => toggleMobileDropdown(link.label)}
                >
                  {link.label}
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${
                      mobileDropdowns[link.label] ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {mobileDropdowns[link.label] && (
                  <div className="pl-4 pb-1">
                    {link.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="block py-2 text-sm no-underline"
                        style={{
                          color: isActive(child.href) ? "#b8963e" : "#9ca3af",
                        }}
                        onClick={() => setMobileOpen(false)}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : link.highlight ? (
              <Link
                key={link.href}
                href={link.href}
                className="block py-2.5 text-sm font-semibold no-underline"
                style={{
                  color: "#b8963e",
                  textShadow: "0 0 8px rgba(184, 150, 62, 0.3)",
                }}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="block py-2.5 text-sm font-medium no-underline"
                style={{
                  color: isActive(link.href) ? "#b8963e" : "#d1d5db",
                }}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            )
          )}
          {/* Mobile Contact link */}
          <Link
            href="/contact"
            className="block py-2.5 text-sm font-medium no-underline"
            style={{
              color: isActive("/contact") ? "#b8963e" : "#d1d5db",
            }}
            onClick={() => setMobileOpen(false)}
          >
            Contact
          </Link>
          <Link
            href="/app"
            className="block py-2.5 text-sm font-semibold no-underline"
            style={{ color: "#7c9aff" }}
            onClick={() => setMobileOpen(false)}
          >
            Launch Bondi
          </Link>
          <a
            href="https://github.com/bkr1297-RIO/rio-protocol"
            target="_blank"
            rel="noopener noreferrer"
            className="block py-2.5 text-sm font-medium no-underline"
            style={{ color: "#9ca3af" }}
            onClick={() => setMobileOpen(false)}
          >
            GitHub
          </a>
        </div>
      )}
    </nav>
  );
}
