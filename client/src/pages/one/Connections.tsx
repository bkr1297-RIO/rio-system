/**
 * ONE App — Connections
 *
 * Manage connected services (Google, GitHub, Microsoft, Slack).
 * View connection status, disconnect services, and manage identity.
 */

import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Link2,
  Unlink,
  ExternalLink,
  Shield,
  Key,
  User,
  Loader2,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

const CONNECTOR_META: Record<
  string,
  { name: string; icon: string; color: string; description: string }
> = {
  google: {
    name: "Google",
    icon: "G",
    color: "#4285f4",
    description: "Gmail, Calendar, Drive",
  },
  github: {
    name: "GitHub",
    icon: "GH",
    color: "#333",
    description: "Repositories, Issues, PRs",
  },
  microsoft: {
    name: "Microsoft",
    icon: "M",
    color: "#00a4ef",
    description: "Outlook, OneDrive, Teams",
  },
  slack: {
    name: "Slack",
    icon: "S",
    color: "#4a154b",
    description: "Channels, Messages, Workflows",
  },
};

export default function Connections() {
  const { user } = useAuth();
  const {
    data: connections,
    isLoading,
    refetch,
  } = trpc.connections.myConnections.useQuery();

  const handleDisconnect = async (provider: string) => {
    // Only Slack has a disconnect endpoint currently
    if (provider === "slack") {
      try {
        // Use disconnectSlack mutation
        toast.info("Disconnecting...");
        // For now, redirect to connection management
        window.location.href = `/connect`;
      } catch (err: any) {
        toast.error("Failed to disconnect", {
          description: err?.message || "Unknown error",
        });
      }
    } else {
      toast.info("Manage this connection from the Connections page", {
        action: {
          label: "Go",
          onClick: () => (window.location.href = "/connect"),
        },
      });
    }
  };

  const connectedProviders = new Set(
    (connections || []).map((c: any) => c.provider)
  );

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Services connected to RIO for governed execution
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-2"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Identity Card */}
      <Card className="mb-6" style={{ borderColor: "#b8963e30" }}>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div
              className="h-12 w-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "#b8963e20" }}
            >
              <User className="h-6 w-6" style={{ color: "#b8963e" }} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">{user?.name || "User"}</h3>
              <p className="text-sm text-muted-foreground">
                {user?.email || "—"}
              </p>
            </div>
            <div className="text-right">
              <Badge
                variant="outline"
                className="text-xs"
                style={{ borderColor: "#b8963e", color: "#b8963e" }}
              >
                <Key className="h-3 w-3 mr-1" />
                Ed25519 (scaffolded)
              </Badge>
              <p className="text-[10px] text-muted-foreground mt-1">
                Signing key for approvals
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* Connected Services */}
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Connected Services
          </h2>

          {(connections || []).length === 0 ? (
            <Card className="bg-card/30 border-dashed mb-6">
              <CardContent className="p-8 text-center">
                <Link2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No services connected yet. Connect a service to enable
                  governed execution.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2 mb-6">
              {(connections as any[])?.map((conn: any) => {
                const meta = CONNECTOR_META[conn.provider] || {
                  name: conn.provider,
                  icon: "?",
                  color: "#6b7280",
                  description: "",
                };
                return (
                  <Card key={conn.id} className="bg-card/50">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div
                          className="h-10 w-10 rounded-lg flex items-center justify-center font-bold text-white text-sm shrink-0"
                          style={{ backgroundColor: meta.color }}
                        >
                          {meta.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-semibold text-sm">
                              {meta.name}
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                              Connected
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {conn.accountEmail || conn.accountName || meta.description}
                          </p>
                          {conn.connectedAt && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Connected{" "}
                              {new Date(conn.connectedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0"
                          onClick={() => handleDisconnect(conn.provider)}
                        >
                          <Unlink className="h-3.5 w-3.5 mr-1.5" />
                          Disconnect
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Available Services */}
          {Object.entries(CONNECTOR_META).some(
            ([key]) => !connectedProviders.has(key)
          ) && (
            <>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Available Services
              </h2>
              <div className="space-y-2">
                {Object.entries(CONNECTOR_META)
                  .filter(([key]) => !connectedProviders.has(key))
                  .map(([key, meta]) => (
                    <Card key={key} className="bg-card/20 border-dashed">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <div
                            className="h-10 w-10 rounded-lg flex items-center justify-center font-bold text-white/60 text-sm shrink-0"
                            style={{
                              backgroundColor: `${meta.color}40`,
                            }}
                          >
                            {meta.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-sm text-muted-foreground">
                              {meta.name}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              {meta.description}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => {
                              window.location.href = `/api/rio/oauth/${key}`;
                            }}
                          >
                            <Link2 className="h-3.5 w-3.5 mr-1.5" />
                            Connect
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </>
          )}

          {/* Security Note */}
          <div
            className="mt-8 p-4 rounded-lg flex items-start gap-3"
            style={{
              backgroundColor: "#b8963e08",
              border: "1px solid #b8963e20",
            }}
          >
            <Shield
              className="h-5 w-5 shrink-0 mt-0.5"
              style={{ color: "#b8963e" }}
            />
            <div>
              <p className="text-sm font-medium" style={{ color: "#b8963e" }}>
                Governed Execution
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Connected services are accessed only through governed intents.
                Every action requires policy approval, generates a
                cryptographic receipt, and is recorded in the tamper-evident
                ledger. Disconnecting a service immediately revokes all access.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
