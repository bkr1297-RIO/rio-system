/**
 * SendAction — Self-Trigger Surface
 *
 * Simple form: pick action type, fill in details, submit.
 * Wires to rio.triggerAction → sendApprovalEmail → approve → execute → receipt → ledger.
 *
 * Mobile-first. No Sentinel changes. No approval logic changes.
 */
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Mail, MessageSquare, Send, Loader2, CheckCircle2,
  ArrowLeft, Shield
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import BottomNav from "@/components/BottomNav";

/* ─── Action type config ──────────────────────────────────── */

type ActionType = "send_email" | "send_sms";

const ACTION_CONFIG: Record<ActionType, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  recipientLabel: string;
  recipientPlaceholder: string;
  recipientType: "email" | "tel";
  hasSubject: boolean;
  bodyLabel: string;
  bodyPlaceholder: string;
}> = {
  send_email: {
    label: "Send Email",
    icon: Mail,
    recipientLabel: "To",
    recipientPlaceholder: "recipient@example.com",
    recipientType: "email",
    hasSubject: true,
    bodyLabel: "Message",
    bodyPlaceholder: "Write your email message here...",
  },
  send_sms: {
    label: "Send SMS",
    icon: MessageSquare,
    recipientLabel: "Phone Number",
    recipientPlaceholder: "+1 (555) 123-4567",
    recipientType: "tel",
    hasSubject: false,
    bodyLabel: "Message",
    bodyPlaceholder: "Write your text message here...",
  },
};

export default function SendAction() {
  const { user, isAuthenticated, loading: authLoading } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();

  // Form state
  const [actionType, setActionType] = useState<ActionType>("send_email");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [approverEmail, setApproverEmail] = useState("");
  const [showApprover, setShowApprover] = useState(false);

  // Result state
  const [result, setResult] = useState<{
    intent_id: string;
    approver_email: string;
    expires_at: string | null;
  } | null>(null);

  const triggerMutation = trpc.rio.triggerAction.useMutation({
    onSuccess: (data) => {
      setResult({
        intent_id: data.intent_id,
        approver_email: data.approver_email,
        expires_at: data.expires_at,
      });
      toast.success("Approval email sent!");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to trigger action");
    },
  });

  const config = ACTION_CONFIG[actionType];

  const handleSubmit = () => {
    if (!recipient.trim()) {
      toast.error("Recipient is required");
      return;
    }
    triggerMutation.mutate({
      action_type: actionType,
      recipient: recipient.trim(),
      subject: subject.trim() || undefined,
      body: body.trim() || undefined,
      approver_email: approverEmail.trim() || undefined,
      source: "RIO_UI",
    });
  };

  const handleReset = () => {
    setResult(null);
    setRecipient("");
    setSubject("");
    setBody("");
    setApproverEmail("");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-border/40 bg-card/95 backdrop-blur-sm">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate("/authorize")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Shield className="h-5 w-5 text-amber-500" />
          <h1 className="text-lg font-semibold">Send Governed Action</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Success state */}
        {result ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
              <div>
                <h2 className="text-xl font-semibold text-emerald-400">Approval Email Sent</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Waiting for <span className="text-foreground font-medium">{result.approver_email}</span> to approve.
                </p>
              </div>
              <div className="rounded-lg bg-card/50 border border-border/40 p-4 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Intent ID</span>
                  <span className="font-mono text-xs">{result.intent_id}</span>
                </div>
                {result.expires_at && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Expires</span>
                    <span>{new Date(result.expires_at).toLocaleTimeString()}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleReset}>
                Send Another
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => navigate("/authorize")}>
                Back to Home
              </Button>
            </div>
          </div>
        ) : (
          /* Form */
          <div className="space-y-6">
            {/* Action type selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Action Type</label>
              <div className="grid grid-cols-2 gap-3">
                {(Object.entries(ACTION_CONFIG) as [ActionType, typeof ACTION_CONFIG["send_email"]][]).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  const isActive = actionType === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setActionType(key)}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all ${
                        isActive
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                          : "border-border/40 bg-card/50 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-sm font-medium">{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recipient */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">{config.recipientLabel}</label>
              <Input
                type={config.recipientType}
                placeholder={config.recipientPlaceholder}
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="bg-card/50 border-border/40"
              />
            </div>

            {/* Subject (email only) */}
            {config.hasSubject && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Subject</label>
                <Input
                  type="text"
                  placeholder="Email subject line"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="bg-card/50 border-border/40"
                />
              </div>
            )}

            {/* Body */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">{config.bodyLabel}</label>
              <textarea
                placeholder={config.bodyPlaceholder}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-border/40 bg-card/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
              />
            </div>

            {/* Approver (optional, collapsible) */}
            <div className="space-y-2">
              <button
                onClick={() => setShowApprover(!showApprover)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showApprover ? "▾ Hide approver options" : "▸ Custom approver (optional)"}
              </button>
              {showApprover && (
                <div className="space-y-1.5">
                  <Input
                    type="email"
                    placeholder="approver@example.com (defaults to you)"
                    value={approverEmail}
                    onChange={(e) => setApproverEmail(e.target.value)}
                    className="bg-card/50 border-border/40"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Leave blank to send the approval email to yourself.
                  </p>
                </div>
              )}
            </div>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={triggerMutation.isPending || !recipient.trim()}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-xl"
              size="lg"
            >
              {triggerMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending approval request...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send for Approval
                </>
              )}
            </Button>

            {/* Info box */}
            <div className="rounded-lg border border-border/30 bg-card/30 p-3 space-y-1">
              <p className="text-xs text-muted-foreground">
                <span className="text-amber-400 font-medium">How it works:</span> This sends an approval email with Approve/Decline buttons. 
                The action only executes after approval. A receipt and ledger entry are generated for every decision.
              </p>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
