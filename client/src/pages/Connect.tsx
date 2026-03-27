/**
 * Connect Your Apps — Onboarding Page
 *
 * Shows all available connectors, their connection status,
 * capabilities, and how to connect them.
 *
 * This is the "Settings > Integrations" page for RIO.
 * Users see which systems RIO can govern and their live/simulated status.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
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
} from "lucide-react";

// ── Icon mapping ──
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  mail: Mail,
  calendar: Calendar,
  "hard-drive": HardDrive,
  github: Github,
};

// ── Platform colors ──
const PLATFORM_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  google: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400" },
  github: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400" },
  microsoft: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-400" },
  apple: { bg: "bg-gray-500/10", border: "border-gray-500/30", text: "text-gray-400" },
};

// ── Status badge ──
function StatusBadge({ status }: { status: string }) {
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
      Disconnected
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


  const { data: connectors, isLoading } = trpc.rio.listConnectors.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const { data: actions } = trpc.rio.listActions.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const handleRefresh = () => {

    window.location.reload();
  };

  const connectedCount = connectors?.filter((c) => c.status === "connected").length ?? 0;
  const totalCount = connectors?.length ?? 0;
  const totalActions = actions?.length ?? 0;

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
          <div className="inline-flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5" style={{ color: "#b8963e" }} />
            <span
              className="text-sm font-medium tracking-wider uppercase"
              style={{ color: "#b8963e" }}
            >
              RIO Connectors
            </span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">
            Connect Your Apps
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            RIO sits between AI and your systems. Every action — email, file,
            event, commit — goes through governance. Connect your apps to enable
            live execution with cryptographic receipts.
          </p>
        </div>

        {/* ── Stats Bar ── */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-white">{connectedCount}</div>
              <div className="text-xs text-gray-400 mt-1">Connected</div>
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
                      <StatusBadge status={connector.status} />
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
                    {connector.status === "connected" && (
                      <div className="flex items-center gap-2 text-xs text-emerald-400/70">
                        <CheckCircle2 className="w-3 h-3" />
                        Live execution enabled. All actions generate receipts and ledger entries.
                      </div>
                    )}
                    {connector.status === "simulated" && (
                      <div className="flex items-center gap-2 text-xs text-amber-400/70">
                        <Zap className="w-3 h-3" />
                        Running in simulated mode. Receipts are generated but no real actions are executed.
                        {connector.platform === "google" && connector.icon === "calendar" && (
                          <span className="ml-1">
                            Calendar API requires additional OAuth scopes.
                          </span>
                        )}
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
              { name: "Slack", icon: "💬", platform: "Slack" },
              { name: "OneDrive", icon: "☁️", platform: "Microsoft" },
              { name: "iCloud", icon: "🍎", platform: "Apple" },
              { name: "Notion", icon: "📝", platform: "Notion" },
              { name: "Jira", icon: "📋", platform: "Atlassian" },
              { name: "AWS", icon: "☁️", platform: "Amazon" },
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
              { step: "1", label: "AI Proposes", desc: "AI agent creates an intent" },
              { step: "2", label: "RIO Gates", desc: "Policy check + human approval" },
              { step: "3", label: "Receipt Written", desc: "Cryptographic proof generated" },
              { step: "4", label: "Connector Executes", desc: "Action sent to the real system" },
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
