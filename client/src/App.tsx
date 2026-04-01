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
import Dashboard from "./pages/Dashboard";
import Receipt from "./pages/Receipt";
import KeyRecovery from "./pages/KeyRecovery";
import Jordan from "./pages/Jordan";
import LearningFeed from "./pages/LearningFeed";
import SignerManagement from "./pages/SignerManagement";
import { KillSwitch } from "./components/KillSwitch";
import { useAuth } from "@/_core/hooks/useAuth";
import { Shield, FileText, PlusCircle, LayoutDashboard, BookOpen, FileKey, Bot, Brain, Menu, X, Users } from "lucide-react";
import { useState, useEffect } from "react";

function NavLink({ href, children, icon: Icon, onClick }: { href: string; children: React.ReactNode; icon: React.ComponentType<{ className?: string }>; onClick?: () => void }) {
  const [location] = useLocation();
  const active = location === href;
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 md:py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors ${active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </Link>
  );
}

function AppNav() {
  const { isAuthenticated } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  if (!isAuthenticated) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex items-center justify-between h-12">
        {/* Logo + Desktop Nav */}
        <div className="flex items-center gap-1">
          <Link href="/" className="flex items-center gap-2 mr-4">
            <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/cqY2yMbuJygAXmi9W2e2t9/rio-logo_0b5ca2f5.png" alt="RIO" className="h-7 w-7 rounded-sm" />
            <span className="font-mono font-bold text-sm tracking-wider">RIO</span>
          </Link>
          {/* Desktop nav — hidden on mobile */}
          <nav className="hidden md:flex items-center gap-0.5">
            <NavLink href="/jordan" icon={Bot}>Jordan</NavLink>
            <NavLink href="/dashboard" icon={LayoutDashboard}>Status</NavLink>
            <NavLink href="/intent/new" icon={PlusCircle}>Intent</NavLink>
            <NavLink href="/ledger" icon={BookOpen}>Ledger</NavLink>
            <NavLink href="/learning" icon={Brain}>Learning</NavLink>
            <NavLink href="/recovery" icon={FileKey}>Recovery</NavLink>
            <NavLink href="/signers" icon={Users}>Signers</NavLink>
          </nav>
        </div>

        {/* Desktop kill switch + Mobile hamburger */}
        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <KillSwitch />
          </div>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl">
          <nav className="container py-2 flex flex-col gap-0.5">
            <NavLink href="/jordan" icon={Bot} onClick={() => setMobileOpen(false)}>Jordan</NavLink>
            <NavLink href="/dashboard" icon={LayoutDashboard} onClick={() => setMobileOpen(false)}>Status</NavLink>
            <NavLink href="/intent/new" icon={PlusCircle} onClick={() => setMobileOpen(false)}>Intent</NavLink>
            <NavLink href="/ledger" icon={BookOpen} onClick={() => setMobileOpen(false)}>Ledger</NavLink>
            <NavLink href="/learning" icon={Brain} onClick={() => setMobileOpen(false)}>Learning</NavLink>
            <NavLink href="/recovery" icon={FileKey} onClick={() => setMobileOpen(false)}>Recovery</NavLink>
            <NavLink href="/signers" icon={Users} onClick={() => setMobileOpen(false)}>Signers</NavLink>
            <div className="pt-2 border-t border-border/30 mt-1">
              <KillSwitch />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/onboard" component={Onboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/intent/new" component={CreateIntent} />
      <Route path="/intent/:intentId" component={IntentDetail} />
      <Route path="/ledger" component={Ledger} />
      <Route path="/receipt/:executionId" component={Receipt} />
      <Route path="/jordan" component={Jordan} />
      <Route path="/learning" component={LearningFeed} />
      <Route path="/recovery" component={KeyRecovery} />
      <Route path="/signers" component={SignerManagement} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <AppNav />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
