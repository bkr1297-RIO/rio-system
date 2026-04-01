import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect } from "react";

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
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-lg w-full text-center space-y-8">
          {/* Logo + Name */}
          <div className="flex flex-col items-center gap-4">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center shadow-lg shadow-primary/5">
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/cqY2yMbuJygAXmi9W2e2t9/rio-logo_0b5ca2f5.png"
                alt="RIO"
                className="h-12 w-12 rounded-xl"
              />
            </div>
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
