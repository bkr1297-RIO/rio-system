/**
 * Login — Screen 1 of 3
 *
 * Primary: Gateway passphrase login (POST /login → JWT)
 * Secondary: Manus OAuth (for non-Gateway features)
 *
 * Decision 2: Interface Is Not Authority — ONE displays, Gateway enforces.
 * The Gateway has its own identity system. Passphrase login issues a JWT
 * that ONE stores in localStorage and sends as Authorization: Bearer <token>.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGatewayAuth } from "@/hooks/useGatewayAuth";
import { gatewayAuthStatus } from "@/lib/gateway";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { LogIn, Shield, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { isAuthenticated, loading: gwLoading, login, user } = useGatewayAuth();
  const [, navigate] = useLocation();

  // Gateway status
  const [gatewayStatus, setGatewayStatus] = useState<{
    reachable: boolean;
    version?: string;
    mode?: string;
    policyActive?: boolean;
  }>({ reachable: false });

  // Login fields
  const [userId, setUserId] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [passphraseLoading, setPassphraseLoading] = useState(false);

  // Check Gateway status on mount
  useEffect(() => {
    gatewayAuthStatus()
      .then((s) => {
        setGatewayStatus({
          reachable: true,
          version: s.version,
          mode: s.system_mode,
          policyActive: s.policy_active,
        });
      })
      .catch(() => {
        setGatewayStatus({ reachable: false });
      });
  }, []);

  // If already authenticated via Gateway JWT, redirect based on role
  useEffect(() => {
    if (!gwLoading && isAuthenticated && user) {
      // Approvers go to Approvals tab, proposers/root_authority go to New Action
      const role = user.role || "";
      if (role === "approver") {
        navigate("/approvals");
      } else {
        navigate("/intent/new");
      }
    }
  }, [gwLoading, isAuthenticated, user, navigate]);

  const handlePassphraseLogin = async () => {
    if (!userId.trim()) {
      toast.error("Enter your Principal ID (e.g. I-1)");
      return;
    }
    if (!passphrase.trim()) {
      toast.error("Enter the Gateway passphrase");
      return;
    }
    setPassphraseLoading(true);
    try {
      const result = await login(userId.trim(), passphrase);
      if (result.success) {
        toast.success("Gateway authenticated");
        // Route based on principal role
        // I-2 (approver) → Approvals, I-1 (root_authority/proposer) → New Action
        const isApprover = userId.trim().toUpperCase() === "I-2";
        navigate(isApprover ? "/approvals" : "/intent/new");
      } else {
        toast.error(result.error || "Passphrase rejected");
      }
    } catch {
      toast.error("Gateway unreachable");
    }
    setPassphraseLoading(false);
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
        <h1 className="text-3xl font-bold tracking-tight">ONE Command Center</h1>
        <p className="text-muted-foreground mt-2">
          Human control surface for the RIO system
        </p>
      </div>

      {/* Gateway Status */}
      <Card className="w-full max-w-sm mb-6 border-border/50">
        <CardContent className="py-3 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase text-muted-foreground">
              Gateway
            </span>
            {gatewayStatus.reachable ? (
              <span className="text-xs text-emerald-400">
                {gatewayStatus.policyActive ? "Policy active" : "Connected"}{" "}
                {gatewayStatus.mode && `| Mode: ${gatewayStatus.mode}`}
              </span>
            ) : (
              <span className="text-xs text-amber-400">Checking...</span>
            )}
          </div>
          {gatewayStatus.version && (
            <span className="text-xs font-mono text-emerald-400/70 border border-emerald-400/30 rounded px-2 py-0.5">
              v{gatewayStatus.version}
            </span>
          )}
        </CardContent>
      </Card>

      {/* Primary: Gateway Passphrase Login */}
      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-3">
          <Input
            type="text"
            placeholder="Principal ID (e.g. I-1)"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-12 font-mono"
            autoFocus
          />
          <Input
            type="password"
            placeholder="Gateway passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePassphraseLogin()}
            className="h-12"
          />
          <Button
            onClick={handlePassphraseLogin}
            disabled={passphraseLoading || !userId.trim() || !passphrase.trim()}
            className="w-full h-12 text-base font-medium"
            size="lg"
          >
            {passphraseLoading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Lock className="mr-2 h-5 w-5" />
            )}
            Authenticate
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Enter your Gateway passphrase to sign in
          </p>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-12 text-xs text-muted-foreground/40 text-center max-w-sm">
        Decision 2: Interface Is Not Authority — ONE displays, Gateway enforces.
      </p>
    </div>
  );
}
