import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Shield, UserPlus, UserMinus, Ban, CheckCircle2,
  AlertTriangle, ChevronLeft, Fingerprint
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useState } from "react";

/* ─── Role Config ────────────────────────────────────────── */

const ROLE_CONFIG: Record<string, { label: string; color: string; description: string }> = {
  proposer: { label: "Proposer", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", description: "Can create intents" },
  approver: { label: "Approver", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", description: "Can approve/reject intents" },
  executor: { label: "Executor", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", description: "Can execute approved intents" },
  auditor: { label: "Chief of Staff", color: "bg-violet-500/10 text-violet-400 border-violet-500/20", description: "Audits the authority chain, verifies receipts, inspects the ledger, and ensures governance integrity" },
  meta: { label: "Meta", color: "bg-red-500/10 text-red-400 border-red-500/20", description: "Can manage roles and policies" },
};

const ALL_ROLES = ["proposer", "approver", "executor", "auditor", "meta"] as const;

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  active: { label: "Active", icon: CheckCircle2, color: "text-emerald-400" },
  suspended: { label: "Suspended", icon: AlertTriangle, color: "text-amber-400" },
  revoked: { label: "Revoked", icon: Ban, color: "text-red-400" },
};

/* ─── Principal Card ─────────────────────────────────────── */

function PrincipalCard({ principal, onRefresh }: {
  principal: {
    id: number;
    principalId: string;
    userId: number;
    displayName: string | null;
    roles: string[];
    status: string;
    createdAt: Date;
  };
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const roles = principal.roles as string[];
  const statusInfo = STATUS_CONFIG[principal.status] ?? STATUS_CONFIG.active;
  const StatusIcon = statusInfo.icon;

  const assignRole = trpc.principals.assignRole.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`Role "${vars.role}" assigned`);
      onRefresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeRole = trpc.principals.removeRole.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`Role "${vars.role}" removed`);
      onRefresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateStatus = trpc.principals.updateStatus.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`Status changed to "${vars.status}"`);
      onRefresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const isBusy = assignRole.isPending || removeRole.isPending || updateStatus.isPending;

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-accent/30 transition-colors"
      >
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-semibold text-primary">
            {(principal.displayName ?? "?").charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{principal.displayName ?? `User #${principal.userId}`}</p>
            <StatusIcon className={`h-3.5 w-3.5 ${statusInfo.color} shrink-0`} />
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {roles.map((r) => {
              const cfg = ROLE_CONFIG[r];
              return cfg ? (
                <Badge key={r} variant="outline" className={`text-[10px] px-1.5 py-0 ${cfg.color}`}>
                  {cfg.label}
                </Badge>
              ) : null;
            })}
          </div>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {principal.createdAt instanceof Date ? principal.createdAt.toLocaleDateString() : new Date(principal.createdAt).toLocaleDateString()}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border/30 p-4 space-y-4 bg-secondary/10">
          {/* Principal ID */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Fingerprint className="h-3.5 w-3.5" />
            <span className="font-mono">{principal.principalId}</span>
          </div>

          {/* Role Management */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Roles</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_ROLES.map((role) => {
                const cfg = ROLE_CONFIG[role];
                const hasRole = roles.includes(role);
                return (
                  <div key={role} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30">
                    <div>
                      <p className="text-xs font-medium">{cfg.label}</p>
                      <p className="text-[10px] text-muted-foreground">{cfg.description}</p>
                    </div>
                    {hasRole ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRole.mutate({ principalId: principal.principalId, role });
                        }}
                      >
                        <UserMinus className="h-3 w-3 mr-1" />
                        Remove
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          assignRole.mutate({ principalId: principal.principalId, role });
                        }}
                      >
                        <UserPlus className="h-3 w-3 mr-1" />
                        Assign
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status Management */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</p>
            <div className="flex gap-2">
              {(["active", "suspended", "revoked"] as const).map((s) => {
                const isActive = principal.status === s;
                return (
                  <Button
                    key={s}
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                    className="h-7 text-xs capitalize"
                    disabled={isActive || isBusy}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateStatus.mutate({ principalId: principal.principalId, status: s });
                    }}
                  >
                    {s}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────── */

export default function Principals() {
  const principalsQuery = trpc.principals.list.useQuery();
  const myPrincipal = trpc.principals.me.useQuery();

  const isMeta = (() => {
    if (!myPrincipal.data) return false;
    const roles = myPrincipal.data.roles;
    return Array.isArray(roles) && roles.includes("meta");
  })();

  if (principalsQuery.isLoading || myPrincipal.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isMeta) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/system">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Principals</h1>
        </div>
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
          <Shield className="h-8 w-8 text-destructive mx-auto mb-3" />
          <p className="text-sm font-medium text-destructive">Access Denied</p>
          <p className="text-xs text-muted-foreground mt-1">
            Meta role required to manage principals.
          </p>
        </div>
      </div>
    );
  }

  const principals = principalsQuery.data ?? [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/system">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Principals</h1>
            <p className="text-sm text-muted-foreground">
              Manage system identities and role assignments
            </p>
          </div>
        </div>
      </div>

      {/* Role Legend */}
      <div className="rounded-xl border border-border/30 bg-card/50 p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Role Definitions
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {ALL_ROLES.map((role) => {
            const cfg = ROLE_CONFIG[role];
            return (
              <div key={role} className="text-center p-2 rounded-lg bg-secondary/20">
                <Badge variant="outline" className={`text-[10px] ${cfg.color} mb-1`}>
                  {cfg.label}
                </Badge>
                <p className="text-[10px] text-muted-foreground">{cfg.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      <Separator className="bg-border/30" />

      {/* Principal Count */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {principals.length} Principal{principals.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Principal List */}
      <div className="space-y-2">
        {principals.map((p) => (
          <PrincipalCard
            key={p.id}
            principal={p}
            onRefresh={() => principalsQuery.refetch()}
          />
        ))}
        {principals.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No principals registered yet.</p>
            <p className="text-xs mt-1">Principals are created automatically when users first interact with the system.</p>
          </div>
        )}
      </div>
    </div>
  );
}
