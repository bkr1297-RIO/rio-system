import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Loader2, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { ONE_LOGO_URL } from "@/lib/brand";

export default function Home() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const { data: status, isLoading: statusLoading } = trpc.proxy.status.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const shouldRedirectBondi = isAuthenticated && !statusLoading && status?.proxyUser;
  const shouldRedirectOnboard = isAuthenticated && !statusLoading && !status?.proxyUser;

  useEffect(() => {
    if (shouldRedirectBondi) {
      navigate("/bondi");
    } else if (shouldRedirectOnboard) {
      navigate("/onboard");
    }
  }, [shouldRedirectBondi, shouldRedirectOnboard, navigate]);

  if (authLoading || (isAuthenticated && statusLoading) || shouldRedirectBondi || shouldRedirectOnboard) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Unauthenticated landing
  return <LandingPage />;
}

function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Receipt Protocol Banner — top of page */}
      <div className="w-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-amber-500/20">
        <a
          href="https://rioprotocol-q9cry3ny.manus.space"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-3 px-4 py-3 group transition-all hover:bg-white/5"
        >
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-semibold uppercase tracking-wider">Open Source</span>
          <span className="text-sm text-slate-200 font-medium group-hover:text-white transition-colors">RIO Receipt Protocol</span>
          <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-amber-400 transition-colors" />
        </a>
      </div>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-lg w-full text-center space-y-8">
          {/* Logo + Name */}
          <div className="flex flex-col items-center gap-5">
            <img
              src={ONE_LOGO_URL}
              alt="RIO"
              className="h-28 w-28 object-contain drop-shadow-lg"
            />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">RIO</h1>
              <p className="text-muted-foreground text-sm mt-1">Your Digital Proxy</p>
            </div>
          </div>

          {/* Value prop */}
          <p className="text-muted-foreground text-base leading-relaxed max-w-sm mx-auto">
            Meet Bondi — your personal chief of staff. Tell Bondi what you need, 
            and it handles the rest. Every action is governed, every receipt is yours.
          </p>

          {/* Capabilities preview */}
          <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto text-left">
            {[
              { title: "Email & Messages", desc: "Draft, send, summarize" },
              { title: "Research & Search", desc: "Find answers, analyze data" },
              { title: "Documents", desc: "Create, edit, organize" },
              { title: "Always Governed", desc: "You approve every action" },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-border/60 bg-card p-3.5 shadow-sm">
                <div className="text-sm font-medium text-foreground">{item.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={() => { window.location.href = getLoginUrl(); }}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-primary text-primary-foreground font-medium text-sm shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-0.5"
          >
            Get Started
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-muted-foreground/60">
        Powered by RIO Digital Proxy — governed execution with cryptographic proof
      </footer>
    </div>
  );
}
