import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { OctagonX } from "lucide-react";
import { toast } from "sonner";

export function KillSwitch() {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const killMutation = trpc.proxy.kill.useMutation({
    onSuccess: () => {
      toast.error("PROXY KILLED — All access revoked.");
      utils.proxy.status.invalidate();
      setOpen(false);
      setReason("");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="destructive"
          size="sm"
          className="gap-1.5 font-mono text-xs uppercase tracking-wider shadow-lg shadow-destructive/20"
        >
          <OctagonX className="h-3.5 w-3.5" />
          Kill
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-card border-destructive/50">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive flex items-center gap-2 font-mono">
            <OctagonX className="h-5 w-5" />
            GLOBAL KILL SWITCH
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            This will immediately revoke all proxy access, cancel all pending intents, and record the kill event in the tamper-evident ledger. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2">
          <label className="text-xs font-mono text-muted-foreground mb-1 block">REASON (required)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you killing the proxy?"
            className="w-full rounded-md border border-destructive/30 bg-background p-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-destructive/50 resize-none"
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="font-mono text-xs">CANCEL</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!reason.trim()) {
                toast.error("Reason is required");
                return;
              }
              killMutation.mutate({ reason: reason.trim() });
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono text-xs uppercase"
            disabled={!reason.trim() || killMutation.isPending}
          >
            {killMutation.isPending ? "KILLING..." : "CONFIRM KILL"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
