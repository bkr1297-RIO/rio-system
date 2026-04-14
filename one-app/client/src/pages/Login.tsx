/**
 * Login — Single-User Product Mode
 *
 * One passphrase, one session. The server handles I-1/I-2 internally.
 * No principal selector. No dev ceremony.
 *
 * Decision 2: Interface Is Not Authority — ONE displays, Gateway enforces.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGatewayAuth } from "@/hooks/useGatewayAuth";
import { gatewayAuthStatus } from "@/lib/gateway";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Loader2, Lock, MessageCircleQuestion, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function Login() {
  const { isAuthenticated, loading: gwLoading, login, user } = useGatewayAuth();
  const [, navigate] = useLocation();

  // Gateway status
  const [gatewayStatus, setGatewayStatus] = useState<{
    reachable: boolean;
    version?: string;
  }>({ reachable: false });

  // Login fields
  const [passphrase, setPassphrase] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Check Gateway status on mount
  useEffect(() => {
    gatewayAuthStatus()
      .then((s) => {
        setGatewayStatus({ reachable: true, version: s.version });
      })
      .catch(() => {
        setGatewayStatus({ reachable: false });
      });
  }, []);

  // If already authenticated, go to approvals (the main screen)
  useEffect(() => {
    if (!gwLoading && isAuthenticated && user) {
      navigate("/authorize");
    }
  }, [gwLoading, isAuthenticated, user, navigate]);

  const handleLogin = async () => {
    if (!passphrase.trim()) {
      toast.error("Enter the Gateway passphrase");
      return;
    }
    setIsLoggingIn(true);
    try {
      // Login as I-1 (proposer) — the server handles I-2 internally for approvals
      const result = await login("I-1", passphrase);
      if (result.success) {
        toast.success("Authenticated");
        navigate("/authorize");
      } else {
        toast.error(result.error || "Passphrase rejected");
      }
    } catch {
      toast.error("Gateway unreachable");
    }
    setIsLoggingIn(false);
  };

  if (gwLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4">
      {/* Logo & Title */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-primary/10 flex items-center justify-center">
          <Shield className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">ONE</h1>
        <p className="text-muted-foreground mt-2">
          Command Center
        </p>
      </div>

      {/* Gateway Connected Badge */}
      <div className="w-full max-w-sm mb-8">
        <div className="flex items-center justify-center gap-2 py-2">
          {gatewayStatus.reachable ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-sm font-medium text-emerald-400">
                Gateway Connected
              </span>
              {gatewayStatus.version && (
                <span className="text-xs font-mono text-emerald-400/70 border border-emerald-400/30 rounded px-2 py-0.5 ml-1">
                  v{gatewayStatus.version}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              </span>
              <span className="text-sm font-medium text-amber-400">
                Connecting to Gateway...
              </span>
            </>
          )}
        </div>
      </div>

      {/* Passphrase Input + Login Button */}
      <div className="w-full max-w-sm space-y-4">
        <div>
          <Input
            type="password"
            placeholder="Enter passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="h-12 text-center text-lg tracking-wider"
            autoFocus
          />
        </div>
        <Button
          onClick={handleLogin}
          disabled={isLoggingIn || !passphrase.trim()}
          className="w-full h-12 text-base font-medium"
          size="lg"
        >
          {isLoggingIn ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Lock className="mr-2 h-5 w-5" />
          )}
          Authenticate
        </Button>
      </div>

      {/* Public tools — no login required */}
      <div className="mt-12 w-full max-w-sm space-y-3">
        <Link href="/email-firewall">
          <button className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/50 transition-all text-amber-400 hover:text-amber-300">
            <ShieldAlert className="h-5 w-5" />
            <span className="text-sm font-medium">Email Firewall</span>
          </button>
        </Link>
        <Link href="/ask-bondi">
          <button className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-500/50 transition-all text-blue-400 hover:text-blue-300">
            <MessageCircleQuestion className="h-5 w-5" />
            <span className="text-sm font-medium">Ask Bondi</span>
          </button>
        </Link>
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-muted-foreground/40 text-center max-w-sm">
        Interface Is Not Authority — ONE displays, Gateway enforces.
      </p>
    </div>
  );
}
