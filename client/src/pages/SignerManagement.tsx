import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useState } from "react";
import { Shield, ShieldOff, Key, Clock, FileText, AlertTriangle, ChevronRight, Users, Fingerprint, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

/* ---------- skeleton ---------- */
function SignerSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ---------- signer card ---------- */
function SignerCard({ signer, onViewDetail, onRevoke }: {
  signer: {
    userId: number;
    publicKey: string;
    status: "ACTIVE" | "KILLED" | "SUSPENDED";
    onboardedAt: Date;
    hasKeyBackup: boolean;
    recentIntentCount: number;
  };
  onViewDetail: () => void;
  onRevoke: () => void;
}) {
  const isActive = signer.status === "ACTIVE";
  const pk = signer.publicKey;
  const fingerprint = pk.length > 16
    ? pk.substring(0, 8) + "..." + pk.substring(pk.length - 8)
    : pk;

  return (
    <Card className={`bg-card/50 border transition-colors hover:border-primary/30 ${!isActive ? "opacity-60" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          {/* Status icon */}
          <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${isActive ? "bg-emerald-500/15 text-emerald-400" : "bg-destructive/15 text-destructive"}`}>
            {isActive ? <Shield className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-medium">
                Signer #{signer.userId}
              </span>
              <Badge variant={isActive ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">
                {signer.status}
              </Badge>
              {signer.hasKeyBackup && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-400">
                  BACKUP
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Fingerprint className="h-3 w-3 shrink-0" />
                <span className="font-mono">{fingerprint}</span>
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0" />
                {new Date(signer.onboardedAt).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3 shrink-0" />
                {signer.recentIntentCount} intents
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isActive && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30 hover:bg-destructive/10 text-xs h-7 px-2"
                onClick={(e) => { e.stopPropagation(); onRevoke(); }}
              >
                Revoke
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onViewDetail}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- detail dialog ---------- */
function SignerDetailDialog({ signerId, open, onClose }: {
  signerId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: detail, isLoading } = trpc.proxy.getSignerDetail.useQuery(
    { targetUserId: signerId! },
    { enabled: signerId !== null && open }
  );

  if (signerId === null) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Key className="h-4 w-4" />
            Signer Detail
          </DialogTitle>
          <DialogDescription className="text-xs">
            User ID: {signerId}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : detail ? (
          <div className="space-y-4 py-2">
            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
              <Badge variant={detail.signer.status === "ACTIVE" ? "default" : "destructive"}>
                {detail.signer.status}
              </Badge>
            </div>

            <Separator />

            {/* Key info */}
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Public Key</span>
              <div className="bg-secondary/50 rounded-md p-2">
                <code className="text-xs font-mono break-all text-foreground/80">
                  {detail.signer.publicKey || "No key registered"}
                </code>
              </div>
            </div>

            {detail.publicKeyFingerprint && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Fingerprint</span>
                <code className="text-xs font-mono text-foreground/80">{detail.publicKeyFingerprint}</code>
              </div>
            )}

            <Separator />

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-secondary/30 rounded-md p-3 text-center">
                <div className="text-lg font-bold">{detail.intents.length}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Intents</div>
              </div>
              <div className="bg-secondary/30 rounded-md p-3 text-center">
                <div className="text-lg font-bold">{detail.approvals.length}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Approvals</div>
              </div>
            </div>

            {/* Backup status */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Key Backup</span>
              <Badge variant={detail.hasKeyBackup ? "default" : "outline"} className={detail.hasKeyBackup ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : ""}>
                {detail.hasKeyBackup ? "Backed Up" : "No Backup"}
              </Badge>
            </div>

            {/* Onboarded date */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Onboarded</span>
              <span className="text-xs font-mono">{new Date(detail.signer.onboardedAt).toLocaleString()}</span>
            </div>

            {/* Recent intents */}
            {detail.intents.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Recent Intents</span>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {detail.intents.slice(0, 10).map((intent) => (
                      <div key={intent.intentId} className="flex items-center justify-between bg-secondary/20 rounded px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${intent.riskTier === "HIGH" ? "bg-red-400" : intent.riskTier === "MEDIUM" ? "bg-amber-400" : "bg-emerald-400"}`} />
                          <code className="text-[11px] font-mono">{intent.toolName}</code>
                        </div>
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                          {intent.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Signer not found
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- main page ---------- */
export default function SignerManagement() {
  const { user, loading: authLoading } = useAuth();
  const status = trpc.proxy.status.useQuery(undefined, { enabled: !!user });
  const signers = trpc.proxy.listSigners.useQuery(undefined, {
    enabled: !!user && !!status.data?.isOwner,
    retry: false,
  });
  const utils = trpc.useUtils();

  const revokeMutation = trpc.proxy.revokeSigner.useMutation({
    onSuccess: () => {
      toast.success("Signer revoked successfully");
      utils.proxy.listSigners.invalidate();
      setRevokeTarget(null);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const [detailTarget, setDetailTarget] = useState<number | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<number | null>(null);

  if (authLoading || status.isLoading || (!!user && !status.data)) {
    return (
      <div className="container max-w-2xl py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <SignerSkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container max-w-2xl py-16 text-center">
        <Shield className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-2">Authentication Required</h2>
        <p className="text-sm text-muted-foreground">Sign in to access signer management.</p>
      </div>
    );
  }

  if (!status.data?.isOwner) {
    return (
      <div className="container max-w-2xl py-16 text-center">
        <AlertTriangle className="h-12 w-12 mx-auto text-amber-400/50 mb-4" />
        <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
        <p className="text-sm text-muted-foreground mb-4">Only the system owner can manage signers.</p>
        <Link href="/settings">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Back to Settings
          </Button>
        </Link>
      </div>
    );
  }

  const signerList = signers.data ?? [];
  const activeCount = signerList.filter((s) => s.status === "ACTIVE").length;
  const suspendedCount = signerList.filter((s) => s.status !== "ACTIVE").length;

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Signer Management
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage registered signers, view key status, and revoke compromised identities.
          </p>
        </div>
        <Link href="/settings">
          <Button variant="outline" size="sm" className="text-xs">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Settings
          </Button>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold">{signerList.length}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-emerald-600">{activeCount}</div>
            <div className="text-[10px] text-emerald-400/70 uppercase tracking-wider">Active</div>
          </CardContent>
        </Card>
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-destructive">{suspendedCount}</div>
            <div className="text-[10px] text-destructive/70 uppercase tracking-wider">Suspended</div>
          </CardContent>
        </Card>
      </div>

      {/* Signer list */}
      {signers.isLoading ? (
        <SignerSkeleton />
      ) : signerList.length === 0 ? (
        <Card className="bg-card/30">
          <CardContent className="py-12 text-center">
            <Users className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">No signers registered yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Signers appear here after onboarding.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {signerList.map((signer) => (
            <SignerCard
              key={signer.userId}
              signer={signer}
              onViewDetail={() => setDetailTarget(signer.userId)}
              onRevoke={() => setRevokeTarget(signer.userId)}
            />
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <SignerDetailDialog
        signerId={detailTarget}
        open={detailTarget !== null}
        onClose={() => setDetailTarget(null)}
      />

      {/* Revoke confirmation dialog */}
      <Dialog open={revokeTarget !== null} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <DialogContent className="max-w-sm bg-card border-destructive/30">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Revoke Signer
            </DialogTitle>
            <DialogDescription>
              This will suspend the signer and prevent them from creating or approving intents.
              A REVOKE entry will be logged to the immutable ledger. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={revokeMutation.isPending}
              onClick={() => {
                if (revokeTarget !== null) {
                  revokeMutation.mutate({ targetUserId: revokeTarget, reason: "Revoked by system owner via Signer Management" });
                }
              }}
            >
              {revokeMutation.isPending ? "Revoking..." : "Confirm Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
