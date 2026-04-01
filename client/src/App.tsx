import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Link, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Onboard from "./pages/Onboard";
import CreateIntent from "./pages/CreateIntent";
import IntentDetail from "./pages/IntentDetail";
import Ledger from "./pages/Ledger";
import Activity from "./pages/Activity";
import Receipt from "./pages/Receipt";
import KeyRecovery from "./pages/KeyRecovery";
import Bondi from "./pages/Bondi";
import LearningFeed from "./pages/LearningFeed";
import SignerManagement from "./pages/SignerManagement";
import Settings from "./pages/Settings";
import { useAuth } from "@/_core/hooks/useAuth";
import { MessageCircle, Activity as ActivityIcon, Settings as SettingsIcon, Bell } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useMemo } from "react";

/* ─── Bottom Tab Bar (mobile) + Top Bar (desktop) ────────────── */

function TabIcon({ href, icon: Icon, label, badge }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string; badge?: number }) {
  const [location] = useLocation();
  const active = location === href || (href === "/" && location === "/bondi");
  return (
    <Link href={href} className="flex flex-col items-center gap-0.5 relative py-1 px-3 min-w-[64px]">
      <div className="relative">
        <Icon className={`h-5 w-5 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`} />
        {(badge ?? 0) > 0 && (
          <span className="absolute -top-1.5 -right-2 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
            {badge}
          </span>
        )}
      </div>
      <span className={`text-[10px] font-medium transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
        {label}
      </span>
    </Link>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { data: status } = trpc.proxy.status.useQuery(undefined, { enabled: isAuthenticated });

  const pendingCount = useMemo(() => {
    if (!status?.recentIntents) return 0;
    return status.recentIntents.filter((i) => i.status === "PENDING_APPROVAL").length;
  }, [status?.recentIntents]);

  if (!isAuthenticated) return <>{children}</>;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Desktop top bar */}
      <header className="hidden md:flex items-center justify-between h-14 px-6 border-b border-border/60 bg-background/80 backdrop-blur-lg sticky top-0 z-50">
        <Link href="/" className="flex items-center gap-2.5">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/cqY2yMbuJygAXmi9W2e2t9/rio-logo_0b5ca2f5.png"
            alt="RIO"
            className="h-8 w-8 rounded-lg"
          />
          <span className="text-base font-semibold tracking-tight">RIO</span>
        </Link>
        <nav className="flex items-center gap-1">
          <DesktopNavLink href="/" label="Bondi" />
          <DesktopNavLink href="/activity" label="Activity" badge={pendingCount} />
          <DesktopNavLink href="/settings" label="Settings" />
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 pb-16 md:pb-0">{children}</main>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t border-border/60 flex items-center justify-around py-1 safe-area-pb">
        <TabIcon href="/" icon={MessageCircle} label="Bondi" />
        <TabIcon href="/activity" icon={ActivityIcon} label="Activity" badge={pendingCount} />
        <TabIcon href="/settings" icon={SettingsIcon} label="Settings" />
      </nav>
    </div>
  );
}

function DesktopNavLink({ href, label, badge }: { href: string; label: string; badge?: number }) {
  const [location] = useLocation();
  const active = location === href || (href === "/" && (location === "/bondi" || location === "/"));
  return (
    <Link
      href={href}
      className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
      }`}
    >
      {label}
      {(badge ?? 0) > 0 && (
        <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
          {badge}
        </span>
      )}
    </Link>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/onboard" component={Onboard} />
      <Route path="/activity" component={Activity} />
      <Route path="/intent/new" component={CreateIntent} />
      <Route path="/intent/:intentId" component={IntentDetail} />
      <Route path="/ledger" component={Ledger} />
      <Route path="/receipt/:executionId" component={Receipt} />
      <Route path="/bondi" component={Bondi} />
      <Route path="/learning" component={LearningFeed} />
      <Route path="/recovery" component={KeyRecovery} />
      <Route path="/signers" component={SignerManagement} />
      <Route path="/settings" component={Settings} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <AppShell>
            <Router />
          </AppShell>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
