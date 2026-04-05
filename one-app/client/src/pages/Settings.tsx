import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { KillSwitch } from "@/components/KillSwitch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Shield, Key, BookOpen, Users, Brain,
  ChevronRight, LogOut, AlertTriangle, CheckCircle2
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/"; },
  });

  const statusQuery = trpc.proxy.status.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const status = statusQuery.data;
  const isOwner = status?.isOwner ?? false;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your proxy and account</p>
      </div>

      {/* Profile card */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-lg font-semibold text-primary">
              {user?.name?.charAt(0)?.toUpperCase() ?? "?"}
            </span>
          </div>
          <div className="flex-1">
            <p className="font-medium">{user?.name ?? "Unknown"}</p>
            <p className="text-sm text-muted-foreground">{user?.email ?? ""}</p>
          </div>
          {isOwner && (
            <Badge variant="outline" className="text-xs border-primary/30 text-primary">Owner</Badge>
          )}
        </div>
      </div>

      {/* Status */}
      {status && (
        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Proxy Status
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <StatusItem
              label="System"
              value={status.proxyUser ? "Active" : "Not Set Up"}
              ok={!!status.proxyUser}
            />
            <StatusItem
              label="Ledger"
              value={status.systemHealth?.ledgerValid ? "Valid" : "Issue"}
              ok={status.systemHealth?.ledgerValid ?? false}
            />
            <StatusItem
              label="Entries"
              value={`${status.systemHealth?.ledgerEntries ?? 0}`}
              ok={true}
            />
            <StatusItem
              label="Pending"
              value={`${status.recentIntents?.filter(i => i.status === "PENDING_APPROVAL").length ?? 0}`}
              ok={true}
            />
          </div>
        </div>
      )}

      <Separator />

      {/* Navigation links */}
      <div className="space-y-1">
        <SettingsLink
          href="/recovery"
          icon={Key}
          label="Key Recovery"
          description="Backup or restore your signing keys"
        />
        <SettingsLink
          href="/ledger"
          icon={BookOpen}
          label="Audit Ledger"
          description="View the tamper-evident record of all actions"
        />
        <SettingsLink
          href="/learning"
          icon={Brain}
          label="Learning Feed"
          description="See how Bondi is improving from your feedback"
        />
        {isOwner && (
          <SettingsLink
            href="/signers"
            icon={Users}
            label="Signer Management"
            description="Manage authorized signers"
          />
        )}
      </div>

      <Separator />

      {/* Danger zone */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Emergency
        </h2>
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
          <p className="text-sm text-muted-foreground mb-3">
            Immediately revoke all proxy access and cancel all pending actions.
            This cannot be undone.
          </p>
          <KillSwitch />
        </div>
      </div>

      <Separator />

      {/* Sign out */}
      <button
        onClick={() => logoutMutation.mutate()}
        disabled={logoutMutation.isPending}
        className="flex items-center gap-3 w-full p-4 rounded-xl text-left text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <LogOut className="h-5 w-5" />
        <span className="text-sm font-medium">Sign Out</span>
      </button>
    </div>
  );
}

function StatusItem({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
      )}
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}

function SettingsLink({ href, icon: Icon, label, description }: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <div className="flex items-center gap-4 p-4 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer group">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
      </div>
    </Link>
  );
}
