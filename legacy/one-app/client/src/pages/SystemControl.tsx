import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { KillSwitch } from "@/components/KillSwitch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Loader2, Settings, Shield, Key, BookOpen, Users, Brain,
  ChevronRight, LogOut, AlertTriangle, CheckCircle2,
  Download, Power, Activity, Fingerprint, Database, Eye
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

/* ─── Status Item ─────────────────────────────────────────── */

function StatusItem({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2.5 p-3 rounded-lg bg-secondary/30">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-xs font-semibold">{value}</span>
    </div>
  );
}

/* ─── Nav Link ────────────────────────────────────────────── */

function SystemLink({ href, icon: Icon, label, description, color }: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  color?: string;
}) {
  return (
    <Link href={href}>
      <div className="flex items-center gap-4 p-4 rounded-xl border border-border/30 bg-card/50 hover:bg-card transition-colors cursor-pointer group">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", color ?? "bg-muted")}>
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

/* ─── Main System Page ────────────────────────────────────── */

export default function SystemControl() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/"; },
  });

  const statusQuery = trpc.proxy.status.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const myPrincipal = trpc.principals.me.useQuery(undefined, {
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
  const principalRoles = myPrincipal.data?.roles ?? [];
  const isMeta = Array.isArray(principalRoles) && principalRoles.includes("meta");

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">System</h1>
          <p className="text-sm text-muted-foreground">Control, monitor, and manage ONE</p>
        </div>
      </div>

      {/* Profile card */}
      <div className="rounded-xl border border-border/40 bg-card p-5">
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
          <div className="flex flex-col items-end gap-1">
            {isOwner && (
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">Owner</Badge>
            )}
            {Array.isArray(principalRoles) && principalRoles.length > 0 && (
              <div className="flex flex-wrap gap-1 justify-end">
                {(principalRoles as string[]).map((r: string) => (
                  <Badge key={r} variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/20 text-muted-foreground capitalize">
                    {r}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* System Status */}
      {status && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            System Status
          </p>
          <div className="grid grid-cols-2 gap-2">
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

      {/* Emergency Kill Switch */}
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Power className="h-4 w-4 text-destructive" />
          <h2 className="text-sm font-semibold text-destructive">Emergency Kill Switch</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Immediately revoke all proxy access, cancel all pending actions, and record the kill event
          in the tamper-evident ledger. This cannot be undone.
        </p>
        <KillSwitch />
      </div>

      <Separator className="bg-border/30" />

      {/* System tools */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tools</p>
        <div className="space-y-2">
          <SystemLink
            href="/ledger"
            icon={BookOpen}
            label="Audit Ledger"
            description="View the tamper-evident record of all actions"
            color="bg-primary/10"
          />
          <SystemLink
            href="/recovery"
            icon={Key}
            label="Key Recovery"
            description="Backup or restore your signing keys"
            color="bg-amber-500/10"
          />
          <SystemLink
            href="/learning"
            icon={Brain}
            label="Learning Feed"
            description="See how Bondi is improving from your feedback"
            color="bg-violet-500/10"
          />
          {isOwner && (
            <SystemLink
              href="/signers"
              icon={Users}
              label="Signer Management"
              description="Manage authorized signers"
              color="bg-emerald-500/10"
            />
          )}
          {isMeta && (
            <SystemLink
              href="/principals"
              icon={Fingerprint}
              label="Principals"
              description="Manage system identities and role assignments"
              color="bg-red-500/10"
            />
          )}
        </div>
      </div>

      <Separator className="bg-border/30" />

      {/* Sign out */}
      <button
        onClick={() => logoutMutation.mutate()}
        disabled={logoutMutation.isPending}
        className="flex items-center gap-3 w-full p-4 rounded-xl text-left text-muted-foreground hover:text-foreground hover:bg-destructive/5 transition-colors border border-border/20"
      >
        <LogOut className="h-5 w-5" />
        <div className="flex-1">
          <span className="text-sm font-medium">Sign Out</span>
          <p className="text-xs text-muted-foreground/60">End your session</p>
        </div>
      </button>
    </div>
  );
}
