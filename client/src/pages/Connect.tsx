/**
 * Connect Your Apps — Onboarding Page
 *
 * Shows all available connectors, their connection status,
 * capabilities, and how to connect them.
 *
 * Supports real OAuth flow for:
 *   - Google (Gmail, Drive, Calendar)
 *   - GitHub (Issues, PRs, Commits)
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import {
  Mail,
  Calendar,
  HardDrive,
  Github,
  CheckCircle2,
  XCircle,
  Zap,
  Shield,
  ArrowRight,
  RefreshCw,
  LogIn,
  Link2,
  Unlink,
  AlertCircle,
  User,
  MessageSquare,
  Send,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// ── Icon mapping ──
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  mail: Mail,
  calendar: Calendar,
  "hard-drive": HardDrive,
  github: Github,
  "message-square": MessageSquare,
};

// ── Platform colors ──
const PLATFORM_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  google: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400" },
  github: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400" },
  microsoft: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-400" },
  apple: { bg: "bg-gray-500/10", border: "border-gray-500/30", text: "text-gray-400" },
  slack: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
};

// ── Google provider IDs ──
const GOOGLE_PROVIDERS = ["gmail", "google_drive", "google_calendar"];

// ── Status badge ──
function StatusBadge({ status, userConnected, userEmail }: { status: string; userConnected?: boolean; userEmail?: string | null }) {
  if (userConnected) {
    return (
      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Connected{userEmail ? ` as ${userEmail}` : ""}
      </Badge>
    );
  }
  if (status === "connected") {
    return (
      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Connected
      </Badge>
    );
  }
  if (status === "simulated") {
    return (
      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30">
        <Zap className="w-3 h-3 mr-1" />
        Simulated
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30">
      <XCircle className="w-3 h-3 mr-1" />
      Not Connected
    </Badge>
  );
}

// ── Risk level badge ──
function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    Low: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    Medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    High: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    Critical: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <Badge className={`${colors[level] || colors.Medium} text-xs`}>
      {level}
    </Badge>
  );
}

export default function Connect() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);
  const [disconnectingGithub, setDisconnectingGithub] = useState(false);
  const [disconnectingSlack, setDisconnectingSlack] = useState(false);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [slackChannelName, setSlackChannelName] = useState("");
  const [connectingSlack, setConnectingSlack] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Parse URL params for success/error messages from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "google") {
      setSuccessMessage("Google apps connected successfully! Gmail, Drive, and Calendar are now live.");
      window.history.replaceState({}, "", "/connect");
    }
    if (params.get("success") === "github") {
      setSuccessMessage("GitHub connected successfully! Issues, PRs, and commits are now live.");
      window.history.replaceState({}, "", "/connect");
    }
    if (params.get("error")) {
      const errorCode = params.get("error")!;
      const errorMap: Record<string, string> = {
        denied: "You denied the authorization request.",
        google_denied: "You denied the Google authorization request.",
        github_denied: "You denied the GitHub authorization request.",
        missing_params: "Missing parameters from callback.",
        google_missing_params: "Missing parameters from Google callback.",
        github_missing_params: "Missing parameters from GitHub callback.",
        invalid_state: "Invalid state parameter. Please try again.",
        google_invalid_state: "Invalid state from Google. Please try again.",
        github_invalid_state: "Invalid state from GitHub. Please try again.",
        expired_state: "Authorization request expired. Please try again.",
        google_expired_state: "Google authorization expired. Please try again.",
        github_expired_state: "GitHub authorization expired. Please try again.",
        callback_failed: "OAuth callback failed. Please try again.",
        google_callback_failed: "Google OAuth callback failed. Please try again.",
        github_callback_failed: "GitHub OAuth callback failed. Please try again.",
        db_unavailable: "Database unavailable. Please try again later.",
      };
      setErrorMessage(errorMap[errorCode] || "An error occurred during connection.");
      window.history.replaceState({}, "", "/connect");
    }
  }, []);

  // Fetch enriched connectors (includes user connection status)
  const { data: connectors, isLoading, refetch } = trpc.connections.enrichedConnectors.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const { data: actions } = trpc.rio.listActions.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // Google connection status
  const { data: googleStatus, refetch: refetchGoogleStatus } = trpc.connections.googleStatus.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: false,
  });

  // GitHub connection status
  const { data: githubStatus, refetch: refetchGithubStatus } = trpc.connections.githubStatus.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: false,
  });

  // Slack connection status
  const { data: slackStatus, refetch: refetchSlackStatus } = trpc.connections.slackStatus.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: false,
  });

  // Slack mutations
  const connectSlackMutation = trpc.connections.connectSlack.useMutation({
    onSuccess: () => {
      setSuccessMessage("Slack webhook connected! Messages and alerts will be sent to your channel.");
      setSlackWebhookUrl("");
      setSlackChannelName("");
      setConnectingSlack(false);
      refetch();
      refetchSlackStatus();
    },
    onError: (err) => {
      setErrorMessage(err.message || "Failed to connect Slack.");
      setConnectingSlack(false);
    },
  });

  const disconnectSlackMutation = trpc.connections.disconnectSlack.useMutation({
    onSuccess: () => {
      setSuccessMessage("Slack disconnected.");
      refetch();
      refetchSlackStatus();
      setDisconnectingSlack(false);
    },
    onError: () => {
      setErrorMessage("Failed to disconnect Slack.");
      setDisconnectingSlack(false);
    },
  });

  const testSlackMutation = trpc.connections.testSlack.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setSuccessMessage("Test message sent to Slack! Check your channel.");
      } else {
        setErrorMessage(data.error || "Slack test failed.");
      }
      setTestingSlack(false);
    },
    onError: (err) => {
      setErrorMessage(err.message || "Slack test failed.");
      setTestingSlack(false);
    },
  });

  const handleConnectGoogle = () => {
    window.location.href = `/api/oauth/google/start?origin=${encodeURIComponent(window.location.origin)}`;
  };

  const handleDisconnectGoogle = async () => {
    setDisconnectingGoogle(true);
    try {
      const response = await fetch("/api/oauth/google/disconnect", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      if (data.success) {
        setSuccessMessage("Google apps disconnected.");
        refetch();
        refetchGoogleStatus();
      } else {
        setErrorMessage("Failed to disconnect Google apps.");
      }
    } catch {
      setErrorMessage("Failed to disconnect Google apps.");
    } finally {
      setDisconnectingGoogle(false);
    }
  };

  const handleConnectGithub = () => {
    window.location.href = `/api/oauth/github/start?origin=${encodeURIComponent(window.location.origin)}`;
  };

  const handleDisconnectGithub = async () => {
    setDisconnectingGithub(true);
    try {
      const response = await fetch("/api/oauth/github/disconnect", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      if (data.success) {
        setSuccessMessage("GitHub disconnected.");
        refetch();
        refetchGithubStatus();
      } else {
        setErrorMessage("Failed to disconnect GitHub.");
      }
    } catch {
      setErrorMessage("Failed to disconnect GitHub.");
    } finally {
      setDisconnectingGithub(false);
    }
  };

  const handleConnectSlack = () => {
    if (!slackWebhookUrl.startsWith("https://hooks.slack.com/")) {
      setErrorMessage("Webhook URL must start with https://hooks.slack.com/");
      return;
    }
    setConnectingSlack(true);
    connectSlackMutation.mutate({
      webhookUrl: slackWebhookUrl,
      channelName: slackChannelName || undefined,
    });
  };

  const handleDisconnectSlack = () => {
    setDisconnectingSlack(true);
    disconnectSlackMutation.mutate();
  };

  const handleTestSlack = () => {
    setTestingSlack(true);
    testSlackMutation.mutate();
  };

  const handleRefresh = () => {
    refetch();
    refetchGoogleStatus();
    refetchGithubStatus();
    refetchSlackStatus();
  };

  const connectedCount = connectors?.filter((c) => c.userConnected).length ?? 0;
  const totalCount = connectors?.length ?? 0;
  const totalActions = actions?.length ?? 0;

  const isGoogleConnected = googleStatus?.connected ?? false;
  const isGithubConnected = githubStatus?.connected ?? false;
  const isSlackConnected = slackStatus?.connected ?? false;

  return (
    <div
      className="min-h-screen px-4 py-12"
      style={{
        background: "linear-gradient(180deg, #0a0e1a 0%, #111827 100%)",
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      <div className="max-w-4xl mx-auto">
        {/* ── Header ── */}
        <div className="text-center mb-12">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/bondi-logo_858ccd3b.png"
            alt="Bondi"
            className="w-20 h-20 mx-auto mb-4"
          />
          <h1 className="text-4xl font-bold text-white mb-2">
            Connect Your Apps
          </h1>
          <p className="text-xs tracking-widest uppercase mb-3" style={{ color: "#6b7280" }}>
            Bondi — Your Digital Chief of Staff — Secured by RIO
          </p>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Bondi uses your apps on your behalf — Gmail, Drive, Calendar, GitHub.
            Every action goes through RIO governance with cryptographic receipts.
            Connect your accounts to enable live execution.
          </p>
        </div>

        {/* ── Auth Notice ── */}
        {!authLoading && !isAuthenticated && (
          <div className="mb-8 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center gap-3">
              <LogIn className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div>
                <p className="text-amber-300 font-medium">Sign in to connect your apps</p>
                <p className="text-amber-400/70 text-sm mt-1">
                  You need to be signed in to connect your Google, GitHub, and other accounts.
                </p>
              </div>
              <a
                href={getLoginUrl()}
                className="ml-auto px-4 py-2 rounded-lg text-sm font-medium text-white border border-amber-500/50 hover:bg-amber-500/20 transition-colors flex-shrink-0"
              >
                Sign In
              </a>
            </div>
          </div>
        )}

        {/* ── Success/Error Messages ── */}
        {successMessage && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <p className="text-emerald-300">{successMessage}</p>
            <button
              onClick={() => setSuccessMessage(null)}
              className="ml-auto text-emerald-400/50 hover:text-emerald-400"
            >
              ×
            </button>
          </div>
        )}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-300">{errorMessage}</p>
            <button
              onClick={() => setErrorMessage(null)}
              className="ml-auto text-red-400/50 hover:text-red-400"
            >
              ×
            </button>
          </div>
        )}

        {/* ── OAuth Connection Cards ── */}
        {isAuthenticated && (
          <div className="mb-10 space-y-4">
            {/* Google Connection Card */}
            <Card className="border-blue-500/30 border" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-white text-lg font-semibold">Google Apps</h3>
                      {isGoogleConnected ? (
                        <div className="flex items-center gap-2 mt-1">
                          <User className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 text-sm">
                            Connected as {googleStatus?.email}
                          </span>
                        </div>
                      ) : (
                        <p className="text-gray-400 text-sm mt-1">
                          Connect Gmail, Google Drive, and Google Calendar
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    {isGoogleConnected ? (
                      <Button
                        variant="outline"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        onClick={handleDisconnectGoogle}
                        disabled={disconnectingGoogle}
                      >
                        <Unlink className="w-4 h-4 mr-2" />
                        {disconnectingGoogle ? "Disconnecting..." : "Disconnect"}
                      </Button>
                    ) : (
                      <Button
                        className="text-white font-medium"
                        style={{ backgroundColor: "#4285F4" }}
                        onClick={handleConnectGoogle}
                      >
                        <Link2 className="w-4 h-4 mr-2" />
                        Connect Google Apps
                      </Button>
                    )}
                  </div>
                </div>

                {/* Show which Google services are connected */}
                {isGoogleConnected && googleStatus?.providers && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex gap-3 flex-wrap">
                      {googleStatus.providers.map((p) => (
                        <div
                          key={p.provider}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span className="text-sm text-emerald-300">
                            {p.provider === "gmail" ? "Gmail" :
                             p.provider === "google_drive" ? "Google Drive" :
                             p.provider === "google_calendar" ? "Google Calendar" : p.provider}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Slack Connection Card */}
            <Card className="border-emerald-500/30 border" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <MessageSquare className="w-7 h-7 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-white text-lg font-semibold">Slack</h3>
                      {isSlackConnected ? (
                        <div className="flex items-center gap-2 mt-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 text-sm">
                            Connected — {slackStatus?.channelName || "Webhook"}
                          </span>
                        </div>
                      ) : (
                        <p className="text-gray-400 text-sm mt-1">
                          Send messages and alerts via Incoming Webhooks
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSlackConnected && (
                      <>
                        <Button
                          variant="outline"
                          className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                          onClick={handleTestSlack}
                          disabled={testingSlack}
                        >
                          {testingSlack ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4 mr-2" />
                          )}
                          {testingSlack ? "Sending..." : "Test"}
                        </Button>
                        <Button
                          variant="outline"
                          className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          onClick={handleDisconnectSlack}
                          disabled={disconnectingSlack}
                        >
                          <Unlink className="w-4 h-4 mr-2" />
                          {disconnectingSlack ? "Disconnecting..." : "Disconnect"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Webhook URL input — only when not connected */}
                {!isSlackConnected && (
                  <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Slack Incoming Webhook URL</label>
                      <Input
                        placeholder="https://hooks.slack.com/services/T.../B.../..."
                        value={slackWebhookUrl}
                        onChange={(e) => setSlackWebhookUrl(e.target.value)}
                        className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Channel Name (optional)</label>
                      <Input
                        placeholder="#general"
                        value={slackChannelName}
                        onChange={(e) => setSlackChannelName(e.target.value)}
                        className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                      />
                    </div>
                    <Button
                      className="text-white font-medium w-full"
                      style={{ backgroundColor: "#4A154B" }}
                      onClick={handleConnectSlack}
                      disabled={connectingSlack || !slackWebhookUrl}
                    >
                      {connectingSlack ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Link2 className="w-4 h-4 mr-2" />
                      )}
                      {connectingSlack ? "Connecting..." : "Connect Slack"}
                    </Button>
                    <p className="text-xs text-gray-500">
                      Create an Incoming Webhook in your Slack workspace settings at{" "}
                      <a
                        href="https://api.slack.com/messaging/webhooks"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:underline"
                      >
                        api.slack.com/messaging/webhooks
                      </a>
                    </p>
                  </div>
                )}

                {/* Connected details */}
                {isSlackConnected && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex gap-3 flex-wrap">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span className="text-sm text-emerald-300">Send Messages</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span className="text-sm text-emerald-300">Send Alerts</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* GitHub Connection Card */}
            <Card className="border-purple-500/30 border" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                      <Github className="w-7 h-7 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-white text-lg font-semibold">GitHub</h3>
                      {isGithubConnected ? (
                        <div className="flex items-center gap-2 mt-1">
                          <User className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 text-sm">
                            Connected as {githubStatus?.username || githubStatus?.email}
                          </span>
                        </div>
                      ) : (
                        <p className="text-gray-400 text-sm mt-1">
                          Connect your GitHub account for issues, PRs, and commits
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    {isGithubConnected ? (
                      <Button
                        variant="outline"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        onClick={handleDisconnectGithub}
                        disabled={disconnectingGithub}
                      >
                        <Unlink className="w-4 h-4 mr-2" />
                        {disconnectingGithub ? "Disconnecting..." : "Disconnect"}
                      </Button>
                    ) : (
                      <Button
                        className="text-white font-medium"
                        style={{ backgroundColor: "#6e40c9" }}
                        onClick={handleConnectGithub}
                      >
                        <Github className="w-4 h-4 mr-2" />
                        Connect GitHub
                      </Button>
                    )}
                  </div>
                </div>

                {/* Show GitHub connection details */}
                {isGithubConnected && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex gap-3 flex-wrap">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span className="text-sm text-emerald-300">Issues</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span className="text-sm text-emerald-300">Pull Requests</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span className="text-sm text-emerald-300">Commits</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Stats Bar ── */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-white">{connectedCount}</div>
              <div className="text-xs text-gray-400 mt-1">Your Connections</div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-white">{totalCount}</div>
              <div className="text-xs text-gray-400 mt-1">Total Connectors</div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-white">{totalActions}</div>
              <div className="text-xs text-gray-400 mt-1">Governed Actions</div>
            </CardContent>
          </Card>
        </div>

        {/* ── Connector Cards ── */}
        {isLoading ? (
          <div className="text-center text-gray-400 py-12">
            Loading connectors...
          </div>
        ) : (
          <div className="space-y-6">
            {connectors?.map((connector) => {
              const IconComponent = ICON_MAP[connector.icon] || Shield;
              const colors = PLATFORM_COLORS[connector.platform] || PLATFORM_COLORS.google;
              const connectorActions = actions?.filter(
                (a) => a.connector === connector.id
              ) ?? [];

              const isGoogleProvider = GOOGLE_PROVIDERS.includes(connector.id);
              const isGithubProvider = connector.id === "github";
              const isSlackProvider = connector.id === "slack";
              const effectiveConnected = isGoogleProvider
                ? isGoogleConnected
                : isGithubProvider
                  ? isGithubConnected
                  : isSlackProvider
                    ? isSlackConnected
                    : connector.userConnected;
              const effectiveEmail = isGoogleProvider
                ? googleStatus?.email
                : isGithubProvider
                  ? (githubStatus?.username || githubStatus?.email)
                  : isSlackProvider
                    ? slackStatus?.channelName
                    : connector.userEmail;

              return (
                <Card
                  key={connector.id}
                  className={`${colors.border} border`}
                  style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors.bg}`}
                        >
                          <IconComponent className={`w-5 h-5 ${colors.text}`} />
                        </div>
                        <div>
                          <CardTitle className="text-white text-lg">
                            {connector.name}
                          </CardTitle>
                          <p className="text-gray-400 text-sm mt-0.5">
                            {connector.description}
                          </p>
                        </div>
                      </div>
                      <StatusBadge
                        status={effectiveConnected ? "connected" : connector.status}
                        userConnected={effectiveConnected}
                        userEmail={effectiveEmail}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Capabilities */}
                    <div className="mb-4">
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                        Governed Actions
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {connectorActions.map((action) => (
                          <div
                            key={action.action}
                            className="flex items-center justify-between px-3 py-2 rounded-md bg-white/5"
                          >
                            <div className="flex items-center gap-2">
                              <ArrowRight className="w-3 h-3 text-gray-500" />
                              <span className="text-sm text-gray-300">
                                {action.label}
                              </span>
                            </div>
                            <RiskBadge level={action.riskLevel} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Connection info */}
                    {effectiveConnected && (
                      <div className="flex items-center gap-2 text-xs text-emerald-400/70">
                        <CheckCircle2 className="w-3 h-3" />
                        Live execution enabled via your OAuth connection. All actions generate receipts and ledger entries.
                      </div>
                    )}
                    {!effectiveConnected && connector.status === "simulated" && (
                      <div className="flex items-center gap-2 text-xs text-amber-400/70">
                        <Zap className="w-3 h-3" />
                        Running in simulated mode. Connect your account above to enable live execution.
                      </div>
                    )}
                    {!effectiveConnected && connector.status === "connected" && !isGoogleProvider && !isGithubProvider && (
                      <div className="flex items-center gap-2 text-xs text-blue-400/70">
                        <Link2 className="w-3 h-3" />
                        Connected via developer credentials. Connect your own account for production use.
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Coming Soon ── */}
        <div className="mt-12">
          <h2 className="text-xl font-semibold text-white mb-4">
            Coming Soon
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { name: "Outlook", icon: "📧", platform: "Microsoft" },

              { name: "OneDrive", icon: "☁️", platform: "Microsoft" },
              { name: "iCloud", icon: "🍎", platform: "Apple" },
              { name: "Notion", icon: "📝", platform: "Notion" },
              { name: "Jira", icon: "📋", platform: "Atlassian" },
              { name: "Custom API", icon: "🔌", platform: "Any" },
            ].map((item) => (
              <div
                key={item.name}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 opacity-50"
              >
                <span className="text-lg">{item.icon}</span>
                <div>
                  <div className="text-sm text-gray-300">{item.name}</div>
                  <div className="text-xs text-gray-500">{item.platform}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── How It Works ── */}
        <div className="mt-12 p-6 rounded-xl bg-white/5 border border-white/10">
          <h2 className="text-xl font-semibold text-white mb-4">
            How Connectors Work
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-center">
            {[
              { step: "1", label: "Connect", desc: "OAuth into your real accounts" },
              { step: "2", label: "AI Proposes", desc: "Agent creates a governed intent" },
              { step: "3", label: "RIO Gates", desc: "Policy check + human approval + receipt" },
              { step: "4", label: "Execute", desc: "Connector uses YOUR tokens to act" },
            ].map((item) => (
              <div key={item.step}>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-2 text-sm font-bold"
                  style={{ backgroundColor: "#b8963e", color: "#0a0e1a" }}
                >
                  {item.step}
                </div>
                <div className="text-sm font-medium text-white">{item.label}</div>
                <div className="text-xs text-gray-400 mt-1">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Refresh Button ── */}
        <div className="text-center mt-8">
          <Button
            variant="outline"
            className="border-white/20 text-gray-300 hover:bg-white/10"
            onClick={handleRefresh}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Connector Status
          </Button>
        </div>
      </div>
    </div>
  );
}
