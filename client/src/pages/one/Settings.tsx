/**
 * ONE App — Settings
 *
 * User preferences, notification settings, and system information.
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  User,
  Bell,
  Shield,
  Key,
  Smartphone,
  Info,
  ExternalLink,
  LogOut,
  Moon,
  Sun,
  Globe,
  Lock,
} from "lucide-react";

export default function Settings() {
  const { user, logout } = useAuth();

  const { data: healthData } = trpc.rio.governanceHealth.useQuery();

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Account, notifications, and system preferences
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
                <h3 className="font-semibold text-lg">{user?.name || "User"}</h3>
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

      {/* Security */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Security
        </h2>
        <div className="space-y-2">
          <Card className="bg-card/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#b8963e15" }}
              >
                <Key className="h-5 w-5" style={{ color: "#b8963e" }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Signing Key</p>
                <p className="text-xs text-muted-foreground">
                  Ed25519 key pair for cryptographic approval signatures
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                Scaffolded
              </Badge>
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
                <p className="text-sm font-medium">Session</p>
                <p className="text-xs text-muted-foreground">
                  Authenticated via Manus OAuth
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
