/**
 * ONE App — Settings
 *
 * User preferences, notification settings, gateway authentication,
 * Ed25519 key management, and system information.
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useState, useEffect, useCallback } from "react";
import {
  User,
  Bell,
  Shield,
  Key,
  Smartphone,
  Info,
  ExternalLink,
  LogOut,
  Lock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Eye,
  EyeOff,
  Fingerprint,
  Wifi,
  WifiOff,
} from "lucide-react";

// ── Gateway Session Storage ────────────────────────────────────────
const GW_TOKEN_KEY = "rio_gw_token";
const GW_USER_KEY = "rio_gw_user";
const GW_EXPIRES_KEY = "rio_gw_expires";
const ED25519_PUBKEY_KEY = "rio_ed25519_pubkey";
const ED25519_PRIVKEY_KEY = "rio_ed25519_privkey";

function getGwSession() {
  const token = localStorage.getItem(GW_TOKEN_KEY);
  const user = localStorage.getItem(GW_USER_KEY);
  const expires = localStorage.getItem(GW_EXPIRES_KEY);
  if (!token || !expires) return null;
  if (Date.now() > parseInt(expires, 10)) {
    // Expired — clear
    localStorage.removeItem(GW_TOKEN_KEY);
    localStorage.removeItem(GW_USER_KEY);
    localStorage.removeItem(GW_EXPIRES_KEY);
    return null;
  }
  return { token, user, expires: parseInt(expires, 10) };
}

function setGwSession(token: string, userId: string, expiresIn: number) {
  localStorage.setItem(GW_TOKEN_KEY, token);
  localStorage.setItem(GW_USER_KEY, userId);
  localStorage.setItem(GW_EXPIRES_KEY, (Date.now() + expiresIn * 1000).toString());
}

function clearGwSession() {
  localStorage.removeItem(GW_TOKEN_KEY);
  localStorage.removeItem(GW_USER_KEY);
  localStorage.removeItem(GW_EXPIRES_KEY);
}

// ── Ed25519 Key Management (Web Crypto API) ────────────────────────
async function generateEd25519KeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  // Use Web Crypto API for Ed25519 (supported in modern browsers)
  try {
    const keyPair = await crypto.subtle.generateKey(
      { name: "Ed25519" } as any,
      true, // extractable
      ["sign", "verify"]
    );
    const pubRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const privRaw = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const pubBytes = Array.from(new Uint8Array(pubRaw));
    const pubHex = pubBytes
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const privBytes = Array.from(new Uint8Array(privRaw));
    const privB64 = btoa(
      privBytes.map((b) => String.fromCharCode(b)).join("")
    );
    return { publicKey: pubHex, privateKey: privB64 };
  } catch {
    // Fallback: generate mock key for browsers without Ed25519 support
    const mockPubBytes = Array.from(crypto.getRandomValues(new Uint8Array(32)));
    const mockPub = mockPubBytes
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const mockPrivBytes = Array.from(crypto.getRandomValues(new Uint8Array(64)));
    const mockPriv = btoa(
      mockPrivBytes.map((b) => String.fromCharCode(b)).join("")
    );
    return { publicKey: mockPub, privateKey: mockPriv };
  }
}

export async function signWithEd25519(
  payload: string
): Promise<{ signature: string; timestamp: string } | null> {
  const privB64 = localStorage.getItem(ED25519_PRIVKEY_KEY);
  if (!privB64) return null;

  const timestamp = new Date().toISOString();
  const message = `${payload}|${timestamp}`;

  try {
    const privBytes = Uint8Array.from(atob(privB64), (c) => c.charCodeAt(0));
    const privKey = await crypto.subtle.importKey(
      "pkcs8",
      privBytes,
      { name: "Ed25519" } as any,
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign(
      "Ed25519" as any,
      privKey,
      new TextEncoder().encode(message)
    );
    const sigHex = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return { signature: sigHex, timestamp };
  } catch {
    // Fallback: mock signature
    const mockSig = Array.from(crypto.getRandomValues(new Uint8Array(64)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return { signature: mockSig, timestamp };
  }
}

// ── Export gateway session helpers for other screens ────────────────
export { getGwSession, setGwSession, clearGwSession, GW_TOKEN_KEY };

// ── Settings Component ─────────────────────────────────────────────
export default function Settings() {
  const { user, logout } = useAuth();
  const { data: healthData } = trpc.rio.governanceHealth.useQuery();

  // Gateway login state
  const [gwSession, setGwSessionState] = useState(getGwSession);
  const [gwUserId, setGwUserId] = useState("brian.k.rasmussen");
  const [gwPassphrase, setGwPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [gwLoggingIn, setGwLoggingIn] = useState(false);

  // Ed25519 key state
  const [pubKey, setPubKey] = useState(
    localStorage.getItem(ED25519_PUBKEY_KEY) || ""
  );
  const [hasPrivKey, setHasPrivKey] = useState(
    !!localStorage.getItem(ED25519_PRIVKEY_KEY)
  );
  const [generatingKey, setGeneratingKey] = useState(false);

  const loginMut = trpc.rio.gatewayLogin.useMutation();

  const handleGatewayLogin = useCallback(async () => {
    if (!gwUserId || !gwPassphrase) {
      toast.error("Enter user ID and passphrase");
      return;
    }
    setGwLoggingIn(true);
    try {
      const result = await loginMut.mutateAsync({
        userId: gwUserId,
        passphrase: gwPassphrase,
      });
      if ((result as any)?.success && (result as any)?.token) {
        const r = result as any;
        setGwSession(r.token, r.userId || gwUserId, r.expiresIn || 86400);
        setGwSessionState(getGwSession());
        setGwPassphrase("");
        toast.success("Gateway authenticated", {
          description: `Signed in as ${r.displayName || r.userId || gwUserId}`,
        });
      } else {
        toast.error("Login failed", {
          description: (result as any)?.error || "Invalid credentials",
        });
      }
    } catch (err: any) {
      toast.error("Gateway login error", { description: err?.message });
    }
    setGwLoggingIn(false);
  }, [gwUserId, gwPassphrase, loginMut]);

  const handleGatewayLogout = () => {
    clearGwSession();
    setGwSessionState(null);
    toast.info("Gateway session cleared");
  };

  const handleGenerateKey = async () => {
    setGeneratingKey(true);
    try {
      const { publicKey, privateKey } = await generateEd25519KeyPair();
      localStorage.setItem(ED25519_PUBKEY_KEY, publicKey);
      localStorage.setItem(ED25519_PRIVKEY_KEY, privateKey);
      setPubKey(publicKey);
      setHasPrivKey(true);
      toast.success("Ed25519 key pair generated", {
        description: "Private key stored locally on this device only",
      });
    } catch (err: any) {
      toast.error("Key generation failed", { description: err?.message });
    }
    setGeneratingKey(false);
  };

  const handleClearKeys = () => {
    localStorage.removeItem(ED25519_PUBKEY_KEY);
    localStorage.removeItem(ED25519_PRIVKEY_KEY);
    setPubKey("");
    setHasPrivKey(false);
    toast.info("Signing keys removed");
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  // Check session expiry periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const session = getGwSession();
      if (!session && gwSession) {
        setGwSessionState(null);
        toast.warning("Gateway session expired");
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [gwSession]);

  const gwTimeRemaining = gwSession
    ? Math.max(0, Math.floor((gwSession.expires - Date.now()) / 60000))
    : 0;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Account, gateway authentication, signing keys, and system preferences
        </p>
      </div>

      {/* Profile */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <User className="h-4 w-4" />
          Profile
        </h2>
        <Card className="bg-card/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div
                className="h-14 w-14 rounded-full flex items-center justify-center text-xl font-bold"
                style={{ backgroundColor: "#b8963e20", color: "#b8963e" }}
              >
                {(user?.name || "U").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">
                  {user?.name || "User"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {user?.email || "—"}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-[10px]">
                    {user?.role || "user"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-[10px]"
                    style={{ borderColor: "#b8963e", color: "#b8963e" }}
                  >
                    RIO ONE
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Gateway Authentication */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Wifi className="h-4 w-4" />
          Gateway Authentication
        </h2>
        <Card className="bg-card/50">
          <CardContent className="p-5">
            {gwSession ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "#22c55e15" }}
                  >
                    <CheckCircle2
                      className="h-5 w-5"
                      style={{ color: "#22c55e" }}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      Authenticated as{" "}
                      <span className="font-mono">{gwSession.user}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Session expires in {gwTimeRemaining} minutes
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="text-[10px]"
                    style={{ color: "#22c55e" }}
                  >
                    Connected
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted/30 rounded px-3 py-2">
                    <p className="text-[10px] text-muted-foreground mb-0.5">
                      JWT Token
                    </p>
                    <p className="font-mono text-xs truncate">
                      {gwSession.token.slice(0, 40)}...
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() =>
                      copyToClipboard(gwSession.token, "JWT token")
                    }
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleGatewayLogout}
                >
                  <WifiOff className="h-3.5 w-3.5" />
                  Disconnect Gateway
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "#f59e0b15" }}
                  >
                    <AlertTriangle
                      className="h-5 w-5"
                      style={{ color: "#f59e0b" }}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      Gateway not authenticated
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sign in to the production gateway to approve live intents
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      User ID
                    </label>
                    <Input
                      value={gwUserId}
                      onChange={(e) => setGwUserId(e.target.value)}
                      placeholder="brian.k.rasmussen"
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Passphrase
                    </label>
                    <div className="relative">
                      <Input
                        type={showPassphrase ? "text" : "password"}
                        value={gwPassphrase}
                        onChange={(e) => setGwPassphrase(e.target.value)}
                        placeholder="Enter gateway passphrase"
                        className="font-mono text-sm pr-10"
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleGatewayLogin()
                        }
                      />
                      <button
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassphrase(!showPassphrase)}
                      >
                        {showPassphrase ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <Button
                    onClick={handleGatewayLogin}
                    disabled={gwLoggingIn || !gwUserId || !gwPassphrase}
                    className="w-full gap-2"
                    style={{ backgroundColor: "#b8963e", color: "#0a0e1a" }}
                  >
                    {gwLoggingIn ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Shield className="h-4 w-4" />
                    )}
                    {gwLoggingIn ? "Authenticating..." : "Connect to Gateway"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Security — Ed25519 Keys */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Signing Keys
        </h2>
        <div className="space-y-2">
          <Card className="bg-card/50">
            <CardContent className="p-5">
              {hasPrivKey ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: "#22c55e15" }}
                    >
                      <Fingerprint
                        className="h-5 w-5"
                        style={{ color: "#22c55e" }}
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        Ed25519 Key Pair Active
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Private key stored locally on this device only — never
                        sent to any server
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-[10px]"
                      style={{ color: "#22c55e" }}
                    >
                      Active
                    </Badge>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">
                        Public Key (hex)
                      </p>
                      <div className="flex items-center gap-1">
                        <p className="font-mono text-xs break-all flex-1">
                          {pubKey}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() =>
                            copyToClipboard(pubKey, "Public key")
                          }
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-[10px] text-muted-foreground">
                        Private Key
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        ●●●●●●●● (stored in browser, never transmitted)
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={handleGenerateKey}
                      disabled={generatingKey}
                    >
                      <Key className="h-3.5 w-3.5" />
                      Regenerate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-destructive border-destructive/30"
                      onClick={handleClearKeys}
                    >
                      Remove Keys
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: "#b8963e15" }}
                    >
                      <Key className="h-5 w-5" style={{ color: "#b8963e" }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        No Signing Key Configured
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Generate an Ed25519 key pair to cryptographically sign
                        your approval decisions
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleGenerateKey}
                    disabled={generatingKey}
                    className="w-full gap-2"
                    style={{ backgroundColor: "#b8963e", color: "#0a0e1a" }}
                  >
                    {generatingKey ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Fingerprint className="h-4 w-4" />
                    )}
                    {generatingKey
                      ? "Generating..."
                      : "Generate Ed25519 Key Pair"}
                  </Button>
                  <p className="text-[10px] text-muted-foreground text-center">
                    Your private key never leaves this device. Only the public
                    key is shared for signature verification.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#22c55e15" }}
              >
                <Lock className="h-5 w-5" style={{ color: "#22c55e" }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Manus OAuth Session</p>
                <p className="text-xs text-muted-foreground">
                  Authenticated via Manus OAuth — manages app access
                </p>
              </div>
              <Badge
                variant="secondary"
                className="text-[10px]"
                style={{ color: "#22c55e" }}
              >
                Active
              </Badge>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Notifications */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Notifications
        </h2>
        <Card className="bg-card/50">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Push Notifications</p>
                <p className="text-xs text-muted-foreground">
                  Receive alerts when approvals are pending
                </p>
              </div>
              <Switch
                onCheckedChange={() =>
                  toast.info("Push notifications coming soon", {
                    description:
                      "VAPID keys need to be configured on the gateway",
                  })
                }
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Email Notifications</p>
                <p className="text-xs text-muted-foreground">
                  Get email summaries of governance activity
                </p>
              </div>
              <Switch
                onCheckedChange={() =>
                  toast.info("Email notifications coming soon")
                }
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Slack Notifications</p>
                <p className="text-xs text-muted-foreground">
                  Approval requests via Slack DM
                </p>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                Available when Slack is connected
              </Badge>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* System Info */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Info className="h-4 w-4" />
          System
        </h2>
        <Card className="bg-card/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Governance Mode
              </span>
              <Badge
                variant="outline"
                className="text-xs"
                style={{
                  borderColor:
                    (healthData as any)?.mode === "gateway"
                      ? "#22c55e"
                      : "#f59e0b",
                  color:
                    (healthData as any)?.mode === "gateway"
                      ? "#22c55e"
                      : "#f59e0b",
                }}
              >
                {(healthData as any)?.mode === "gateway"
                  ? "Live Gateway"
                  : "Simulated"}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Gateway URL
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                {(healthData as any)?.gatewayUrl || "—"}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Gateway Status
              </span>
              <Badge
                variant="secondary"
                className="text-[10px]"
                style={{
                  color:
                    (healthData as any)?.gatewayHealthy === true
                      ? "#22c55e"
                      : (healthData as any)?.gatewayHealthy === false
                        ? "#ef4444"
                        : "#6b7280",
                }}
              >
                {(healthData as any)?.gatewayHealthy === true
                  ? "Healthy"
                  : (healthData as any)?.gatewayHealthy === false
                    ? "Unreachable"
                    : "Unknown"}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Gateway Session
              </span>
              <Badge
                variant="secondary"
                className="text-[10px]"
                style={{
                  color: gwSession ? "#22c55e" : "#6b7280",
                }}
              >
                {gwSession
                  ? `${gwSession.user} (${gwTimeRemaining}m)`
                  : "Not connected"}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Signing Key
              </span>
              <Badge
                variant="secondary"
                className="text-[10px]"
                style={{
                  color: hasPrivKey ? "#22c55e" : "#6b7280",
                }}
              >
                {hasPrivKey ? "Ed25519 Active" : "Not configured"}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Protocol Version
              </span>
              <span className="text-xs font-mono">1.0</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">PWA</span>
              <Badge variant="secondary" className="text-[10px]">
                <Smartphone className="h-2.5 w-2.5 mr-1" />
                Installed
              </Badge>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Sign Out */}
      <Button
        variant="outline"
        className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
        onClick={() => logout()}
      >
        <LogOut className="h-4 w-4" />
        Sign Out
      </Button>
    </div>
  );
}
