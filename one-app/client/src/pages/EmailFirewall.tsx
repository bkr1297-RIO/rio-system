/**
 * Email Action Firewall — Demo UI
 *
 * Public page (no auth required). Demonstrates the policy engine:
 *   1. User composes an email (subject, to, body)
 *   2. Firewall scans in real-time against policy rules + optional LLM
 *   3. Result: BLOCKED / WARNED / PASSED
 *   4. JSON receipt generated for every decision
 *   5. Receipt viewer shows history
 *
 * "It runs locally. No data leaves your system."
 */
import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Send,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Loader2,
  BarChart3,
  Eye,
  Zap,
  Brain,
  Hash,
  Copy,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Inbox,
  DollarSign,
  Timer,
  Users,
  Handshake,
  Target,
  UserCheck,
  Settings2,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

/* ─── Decision display config ────────────────────────────────── */

const DECISION_CONFIG = {
  BLOCK: {
    label: "BLOCKED",
    icon: ShieldX,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    glow: "shadow-red-500/20",
    description: "This email was blocked by the policy engine.",
  },
  WARN: {
    label: "WARNING",
    icon: ShieldAlert,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    glow: "shadow-amber-500/20",
    description: "This email triggered a warning. Review before sending.",
  },
  FLAG: {
    label: "FLAGGED",
    icon: ShieldAlert,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    glow: "shadow-orange-500/20",
    description: "Flagged for review. You may send, but review is required.",
  },
  PASS: {
    label: "PASSED",
    icon: ShieldCheck,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    glow: "shadow-emerald-500/20",
    description: "No policy violations detected. Email cleared for sending.",
  },
  OVERRIDE: {
    label: "OVERRIDDEN",
    icon: Shield,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    glow: "shadow-blue-500/20",
    description: "A human approved sending despite policy violation.",
  },
} as const;

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  INDUCEMENT: { label: "Inducement", color: "text-red-400 bg-red-500/10", icon: AlertTriangle },
  THREAT: { label: "Threat", color: "text-red-400 bg-red-500/10", icon: ShieldX },
  PII: { label: "PII Exposure", color: "text-amber-400 bg-amber-500/10", icon: Eye },
  COMPLIANCE: { label: "Compliance", color: "text-orange-400 bg-orange-500/10", icon: FileText },
  CONFIDENTIAL: { label: "Confidential", color: "text-violet-400 bg-violet-500/10", icon: Shield },
  COMMITMENT: { label: "Commitment", color: "text-orange-400 bg-orange-500/10", icon: Handshake },
  URGENCY: { label: "Urgency", color: "text-amber-400 bg-amber-500/10", icon: Timer },
  RELATIONSHIP: { label: "Relationship", color: "text-pink-400 bg-pink-500/10", icon: Users },
  FINANCIAL: { label: "Financial", color: "text-yellow-400 bg-yellow-500/10", icon: DollarSign },
  TIMING: { label: "Timing", color: "text-cyan-400 bg-cyan-500/10", icon: Clock },
  SCOPE: { label: "Scope Creep", color: "text-purple-400 bg-purple-500/10", icon: Target },
  RECIPIENT: { label: "Recipient Risk", color: "text-rose-400 bg-rose-500/10", icon: UserCheck },
  INAPPROPRIATE: { label: "Inappropriate", color: "text-pink-400 bg-pink-500/10", icon: XCircle },
  NONE: { label: "None", color: "text-slate-400 bg-slate-500/10", icon: CheckCircle2 },
};

/* ─── Sample emails for quick demo ───────────────────────────── */

const SAMPLE_EMAILS = [
  {
    label: "Inducement (pharma kickback)",
    subject: "Partnership Opportunity",
    to: "dr.smith@clinic.com",
    body: "If you prescribe our product to your patients, we can support your clinic financially. We have a generous compensation program for high-volume prescribers.",
  },
  {
    label: "Threat / coercion",
    subject: "Final Notice",
    to: "vendor@company.com",
    body: "If you don't comply with our terms by Friday, we will expose your internal communications to the press. You will regret not cooperating with us.",
  },
  {
    label: "PII exposure (SSN)",
    subject: "Employee Records",
    to: "hr@company.com",
    body: "Here are the employee records you requested:\nJohn Smith - SSN: 123-45-6789\nJane Doe - SSN: 987-65-4321\nPlease update the payroll system.",
  },
  {
    label: "Compliance violation",
    subject: "Re: Q4 Numbers",
    to: "cfo@company.com",
    body: "Between you and me, we should keep this arrangement quiet. Delete this email after reading. The auditors don't need to know about the offshore accounts.",
  },
  {
    label: "Clean email (should PASS)",
    subject: "Q1 Report",
    to: "team@company.com",
    body: "Please find attached the quarterly report for Q1 2026. Revenue is up 12% year-over-year. Let me know if you have any questions about the projections.",
  },
  {
    label: "Subtle inducement (implied)",
    subject: "Quick thought",
    to: "partner@company.com",
    body: "We can probably support your team if things go well with the new product line 😉 Let's discuss over lunch next week.",
  },
];

/* ─── Sample inbound messages for testing ──────────────────── */

const SAMPLE_INBOUND_MESSAGES = [
  { label: "Phishing attempt", sender: "+1-555-0199", text: "URGENT: Your account has been compromised. Click here to verify your identity immediately: bit.ly/x3kf9" },
  { label: "Bribery / kickback", sender: "+1-555-0142", text: "Hey, if you approve the contract we discussed, I can make sure $5,000 finds its way to your personal account. Nobody needs to know." },
  { label: "Threat / extortion", sender: "unknown@protonmail.com", text: "We have your company's internal files. Pay 2 BTC to this wallet or we release everything to the press by Friday." },
  { label: "Clean message", sender: "+1-555-0123", text: "Hi, just confirming our meeting tomorrow at 2pm. Looking forward to discussing the Q2 roadmap." },
  { label: "PII in message", sender: "+1-555-0188", text: "Here's the info you asked for: John Smith, DOB 03/15/1985, SSN 456-78-9012. Please handle with care." },
  { label: "Suspicious urgency", sender: "+1-555-0177", text: "FINAL WARNING: Your subscription expires in 1 HOUR. Send payment NOW or lose access forever. Wire $499 to account #8834721." },
];

const ROUTING_CONFIG = {
  quarantine: { label: "Quarantine", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", icon: ShieldX },
  review: { label: "Review", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", icon: AlertTriangle },
  pass: { label: "Pass", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: ShieldCheck },
} as const;

/* ─── InboundMessagesPanel component ───────────────────────── */

function InboundMessagesPanel() {
  const [messageText, setMessageText] = useState("");
  const [senderField, setSenderField] = useState("");
  const [inboundFilter, setInboundFilter] = useState<"all" | "quarantine" | "review" | "pass">("all");

  const scanInbound = trpc.emailFirewall.scanInbound.useMutation({
    onSuccess: (data) => {
      toast.success(`Routed to ${data.routing}: ${data.result.event_type}`);
      inboundQuery.refetch();
    },
    onError: (err) => toast.error(`Scan failed: ${err.message}`),
  });

  const inboundQuery = trpc.emailFirewall.inboundMessages.useQuery(undefined, {
    refetchInterval: 10000,
  });

  const allMessages = useMemo(() => {
    if (!inboundQuery.data) return [];
    const { quarantine, review, pass } = inboundQuery.data;
    const tagged = [
      ...quarantine.map(r => ({ ...r, _routing: "quarantine" as const })),
      ...review.map(r => ({ ...r, _routing: "review" as const })),
      ...pass.map(r => ({ ...r, _routing: "pass" as const })),
    ];
    tagged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (inboundFilter === "all") return tagged;
    return tagged.filter(m => m._routing === inboundFilter);
  }, [inboundQuery.data, inboundFilter]);

  const handleScan = useCallback(() => {
    if (!messageText.trim()) { toast.error("Enter a message"); return; }
    if (!senderField.trim()) { toast.error("Enter a sender"); return; }
    scanInbound.mutate({ text: messageText, sender: senderField });
  }, [messageText, senderField, scanInbound]);

  const loadSample = useCallback((sample: typeof SAMPLE_INBOUND_MESSAGES[0]) => {
    setMessageText(sample.text);
    setSenderField(sample.sender);
  }, []);

  const counts = useMemo(() => {
    if (!inboundQuery.data) return { quarantine: 0, review: 0, pass: 0 };
    return {
      quarantine: inboundQuery.data.quarantine.length,
      review: inboundQuery.data.review.length,
      pass: inboundQuery.data.pass.length,
    };
  }, [inboundQuery.data]);

  return (
    <div className="space-y-4">
      {/* Input form */}
      <Card className="border-border/40 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-blue-400" />
            Scan Inbound Message
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Sender (phone number or email)"
            value={senderField}
            onChange={(e) => setSenderField(e.target.value)}
            className="bg-background/50 text-sm"
          />
          <Textarea
            placeholder="Paste message text here..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            rows={4}
            className="bg-background/50 text-sm resize-none"
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={handleScan}
              disabled={scanInbound.isPending}
              size="sm"
              className="gap-1.5"
            >
              {scanInbound.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
              Scan Message
            </Button>
            <span className="text-xs text-muted-foreground">or try a sample:</span>
            {SAMPLE_INBOUND_MESSAGES.slice(0, 3).map((s, i) => (
              <Button key={i} variant="outline" size="sm" className="text-xs h-7" onClick={() => loadSample(s)}>
                {s.label}
              </Button>
            ))}
          </div>
          {SAMPLE_INBOUND_MESSAGES.length > 3 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">More:</span>
              {SAMPLE_INBOUND_MESSAGES.slice(3).map((s, i) => (
                <Button key={i} variant="outline" size="sm" className="text-xs h-7" onClick={() => loadSample(s)}>
                  {s.label}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Routing counts */}
      <div className="grid grid-cols-3 gap-3">
        {(["quarantine", "review", "pass"] as const).map(key => {
          const cfg = ROUTING_CONFIG[key];
          const Icon = cfg.icon;
          return (
            <Card
              key={key}
              className={`cursor-pointer transition-all border ${inboundFilter === key ? cfg.border + " " + cfg.bg : "border-border/40 bg-card/50 hover:bg-card/80"}`}
              onClick={() => setInboundFilter(inboundFilter === key ? "all" : key)}
            >
              <CardContent className="p-3 flex items-center gap-2">
                <Icon className={`h-4 w-4 ${cfg.color}`} />
                <div>
                  <div className={`text-lg font-bold ${cfg.color}`}>{counts[key]}</div>
                  <div className="text-xs text-muted-foreground">{cfg.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Message list */}
      <Card className="border-border/40 bg-card/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              {inboundFilter === "all" ? "All Inbound Messages" : `${ROUTING_CONFIG[inboundFilter].label} List`}
            </CardTitle>
            {inboundFilter !== "all" && (
              <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setInboundFilter("all")}>
                Show all
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {allMessages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No inbound messages yet. Scan a message above to get started.
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {allMessages.map((msg) => {
                  const routing = msg._routing;
                  const cfg = ROUTING_CONFIG[routing];
                  const Icon = cfg.icon;
                  const decision = DECISION_CONFIG[msg.event_type as keyof typeof DECISION_CONFIG];
                  return (
                    <div key={msg.receipt_id} className={`p-3 rounded-lg border ${cfg.border} ${cfg.bg} space-y-1.5`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                          <Badge variant="outline" className={`text-[10px] ${cfg.color} ${cfg.border}`}>
                            {cfg.label}
                          </Badge>
                          {decision && (
                            <Badge variant="outline" className={`text-[10px] ${decision.color} ${decision.border}`}>
                              {decision.label}
                            </Badge>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(msg.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        From: <span className="text-foreground font-medium">{msg.email_context.to || "unknown"}</span>
                      </div>
                      <div className="text-xs text-foreground/80 line-clamp-2">
                        {msg.decision.reason}
                      </div>
                      {msg.coherence && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className={`h-1.5 w-1.5 rounded-full ${msg.coherence.status === "COHERENT" ? "bg-emerald-400" : "bg-red-400"}`} />
                          <span className="text-[10px] text-muted-foreground">
                            Coherence: {msg.coherence.status}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Utility ─────────────────────────────────────────────────── */
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success("Copied to clipboard");
  });
}

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* ─── Components ─────────────────────────────────────────────── */

/** Scan result display card */
function ScanResultCard({ result, receipt }: { result: any; receipt: any }) {
  const [expanded, setExpanded] = useState(false);
  const config = DECISION_CONFIG[result.event_type as keyof typeof DECISION_CONFIG] || DECISION_CONFIG.PASS;
  const Icon = config.icon;

  return (
    <div className={`rounded-xl border ${config.border} ${config.bg} p-5 shadow-lg ${config.glow} transition-all duration-300`}>
      {/* Decision header */}
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2.5 rounded-lg ${config.bg} ${config.border} border`}>
          <Icon className={`h-6 w-6 ${config.color}`} />
        </div>
        <div className="flex-1">
          <div className={`text-lg font-bold ${config.color} tracking-wide`}>{config.label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{config.description}</div>
        </div>
        <Badge variant="outline" className={`${config.color} ${config.border} text-xs`}>
          {result.confidence} confidence
        </Badge>
      </div>

      {/* Recipient classification */}
      {receipt.email_context?.recipient && (
        <div className="flex flex-wrap items-center gap-2 mb-4 p-2.5 rounded-lg bg-background/50 border border-border/30">
          <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium text-muted-foreground">Recipient:</span>
          <Badge variant="outline" className={`text-[10px] ${
            receipt.email_context.recipient.type === "external" ? "text-amber-400 border-amber-500/30" : "text-emerald-400 border-emerald-500/30"
          }`}>
            {receipt.email_context.recipient.type === "external" ? "External" : "Internal"}
          </Badge>
          <Badge variant="outline" className={`text-[10px] ${
            receipt.email_context.recipient.familiarity === "first-time" ? "text-amber-400 border-amber-500/30" : "text-slate-400 border-slate-500/30"
          }`}>
            {receipt.email_context.recipient.familiarity === "first-time" ? "First Contact" : "Established"}
          </Badge>
          {receipt.email_context.recipient.sensitive && (
            <Badge variant="outline" className="text-[10px] text-red-400 border-red-500/30">
              Sensitive ({receipt.email_context.recipient.sensitiveReason || "flagged"})
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto">{receipt.email_context.recipient.domain}</span>
        </div>
      )}

      {/* Category breakdown */}
      {result.matched_rules && result.matched_rules.length > 0 && (() => {
        const cats: Record<string, number> = {};
        result.matched_rules.forEach((r: any) => { cats[r.category] = (cats[r.category] || 0) + 1; });
        return (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {Object.entries(cats).map(([cat, count]) => {
              const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.NONE;
              const CIcon = cfg.icon;
              return (
                <div key={cat} className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${cfg.color} border border-current/20`}>
                  <CIcon className="h-3 w-3" />
                  {cfg.label} ({count})
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Matched rules */}
      {result.matched_rules && result.matched_rules.length > 0 && (
        <div className="space-y-2 mb-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rules Triggered</div>
          {result.matched_rules.map((rule: any, i: number) => {
            const cat = CATEGORY_CONFIG[rule.category] || CATEGORY_CONFIG.NONE;
            const CatIcon = cat.icon;
            return (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-background/50 border border-border/30">
                <CatIcon className={`h-4 w-4 mt-0.5 ${cat.color.split(" ")[0]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${cat.color}`}>{cat.label}</Badge>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">{rule.rule_id}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${rule.action === "BLOCK" ? "text-red-400 border-red-500/30" : "text-amber-400 border-amber-500/30"}`}>
                      {rule.action}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{rule.reason}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Coherence status */}
      {receipt.coherence?.checked && (
        <div className={`flex items-center gap-2.5 p-2.5 rounded-lg mb-4 border ${
          receipt.coherence.status === "COHERENT"
            ? "bg-emerald-500/5 border-emerald-500/20"
            : "bg-red-500/5 border-red-500/20"
        }`}>
          {receipt.coherence.status === "COHERENT" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold tracking-wide ${
                receipt.coherence.status === "COHERENT" ? "text-emerald-400" : "text-red-400"
              }`}>
                {receipt.coherence.status}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {receipt.coherence.status === "COHERENT"
                  ? "Outcome matched intended policy behavior"
                  : "Drift detected between intent and outcome"}
              </span>
            </div>
            {receipt.coherence.issues && receipt.coherence.issues.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {receipt.coherence.issues.map((issue: string, i: number) => (
                  <div key={i} className="text-[10px] text-red-400/80">• {issue}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Receipt preview */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        <FileText className="h-3.5 w-3.5" />
        <span className="font-medium">Receipt: {receipt.receipt_id.slice(0, 8)}...</span>
        <span className="text-[10px] ml-auto">{formatTimestamp(receipt.timestamp)}</span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {expanded && (
        <div className="mt-3 p-3 rounded-lg bg-background/80 border border-border/30 relative">
          <button
            onClick={() => copyToClipboard(JSON.stringify(receipt, null, 2))}
            className="absolute top-2 right-2 p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Copy receipt JSON"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <pre className="text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap leading-relaxed">
            {JSON.stringify(receipt, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/** Receipt list item (compact) */
function ReceiptRow({ receipt, onSelect }: { receipt: any; onSelect: (r: any) => void }) {
  const config = DECISION_CONFIG[receipt.event_type as keyof typeof DECISION_CONFIG] || DECISION_CONFIG.PASS;
  const Icon = config.icon;
  const cat = CATEGORY_CONFIG[receipt.policy?.category] || CATEGORY_CONFIG.NONE;

  return (
    <button
      onClick={() => onSelect(receipt)}
      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors text-left border border-transparent hover:border-border/30"
    >
      <div className={`p-1.5 rounded-md ${config.bg}`}>
        <Icon className={`h-4 w-4 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
          <Badge variant="outline" className={`text-[10px] ${cat.color}`}>{cat.label}</Badge>
        </div>
        <div className="text-xs text-muted-foreground truncate mt-0.5">
          {receipt.email_context?.subject || "No subject"} — {receipt.decision?.reason?.slice(0, 60)}...
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="text-[10px] text-muted-foreground whitespace-nowrap">
          {formatTimestamp(receipt.timestamp)}
        </div>
        {receipt.coherence?.checked && (
          <Badge
            variant="outline"
            className={`text-[9px] px-1.5 py-0 ${
              receipt.coherence.status === "COHERENT"
                ? "text-emerald-400 border-emerald-500/30"
                : "text-red-400 border-red-500/30"
            }`}
          >
            {receipt.coherence.status}
          </Badge>
        )}
      </div>
    </button>
  );
}

/** Stats bar */
function StatsBar({ stats }: { stats: any }) {
  if (!stats) return null;
  const items = [
    { label: "Total", value: stats.total, color: "text-foreground" },
    { label: "Blocked", value: stats.blocked, color: "text-red-400" },
    { label: "Warned", value: stats.warned, color: "text-amber-400" },
    { label: "Passed", value: stats.passed, color: "text-emerald-400" },
    { label: "Overridden", value: stats.overridden, color: "text-blue-400" },
  ];
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/20 border border-border/30">
      <BarChart3 className="h-4 w-4 text-muted-foreground" />
      {items.map((item) => (
        <div key={item.label} className="text-center">
          <div className={`text-sm font-bold ${item.color}`}>{item.value}</div>
          <div className="text-[10px] text-muted-foreground">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
/* ─── Policy Presets ────────────────────────────────────────────── */

const POLICY_PRESETS = [
  { id: "standard", label: "Standard", description: "Balanced protection. Blocks critical violations, warns on risky patterns." },
  { id: "strict", label: "Strict", description: "Maximum protection. All warnings upgraded to blocks." },
  { id: "permissive", label: "Permissive", description: "Minimal friction. Only critical violations blocked." },
] as const;

/** All rule categories with their default rules for the config panel */
const RULE_CATEGORIES = [
  { id: "INDUCEMENT", rules: ["INDUCEMENT_001", "INDUCEMENT_002", "INDUCEMENT_003"], defaultAction: "BLOCK" },
  { id: "THREAT", rules: ["THREAT_001", "THREAT_002", "THREAT_003"], defaultAction: "BLOCK" },
  { id: "PII", rules: ["PII_001", "PII_002", "PII_003"], defaultAction: "BLOCK" },
  { id: "COMPLIANCE", rules: ["COMPLIANCE_001", "COMPLIANCE_002", "COMPLIANCE_003"], defaultAction: "BLOCK" },
  { id: "CONFIDENTIAL", rules: ["CONFIDENTIAL_001", "CONFIDENTIAL_002", "CONFIDENTIAL_003"], defaultAction: "WARN" },
  { id: "COMMITMENT", rules: ["COMMITMENT_001", "COMMITMENT_002", "COMMITMENT_003"], defaultAction: "WARN" },
  { id: "URGENCY", rules: ["URGENCY_001", "URGENCY_002"], defaultAction: "WARN" },
  { id: "RELATIONSHIP", rules: ["RELATIONSHIP_001", "RELATIONSHIP_002"], defaultAction: "WARN" },
  { id: "FINANCIAL", rules: ["FINANCIAL_001", "FINANCIAL_002", "FINANCIAL_003", "FINANCIAL_004"], defaultAction: "WARN" },
  { id: "TIMING", rules: ["TIMING_001", "TIMING_002"], defaultAction: "WARN" },
  { id: "SCOPE", rules: ["SCOPE_001", "SCOPE_002"], defaultAction: "WARN" },
  { id: "RECIPIENT", rules: ["RECIPIENT_001", "RECIPIENT_002"], defaultAction: "WARN" },
];

/** Policy Configuration Panel */
function PolicyConfigPanel() {
  const [activePreset, setActivePreset] = useState<string>("standard");
  const [disabledRules, setDisabledRules] = useState<Set<string>>(new Set());
  const [actionOverrides, setActionOverrides] = useState<Record<string, string>>({});
  const policyConfig = trpc.emailFirewall.policyConfig.useQuery();
  const updatePolicy = trpc.emailFirewall.updatePolicyConfig.useMutation({
    onSuccess: () => {
      policyConfig.refetch();
      toast.success("Policy updated");
    },
    onError: (err: any) => toast.error(err.message || "Failed to update policy"),
  });

  const handleToggleRule = (ruleId: string) => {
    const newDisabled = new Set(disabledRules);
    if (newDisabled.has(ruleId)) {
      newDisabled.delete(ruleId);
    } else {
      newDisabled.add(ruleId);
    }
    setDisabledRules(newDisabled);
    updatePolicy.mutate({
      ruleId,
      enabled: !newDisabled.has(ruleId),
    });
  };

  const handleActionOverride = (ruleId: string, action: string) => {
    setActionOverrides(prev => ({ ...prev, [ruleId]: action }));
    updatePolicy.mutate({
      ruleId,
      actionOverride: action,
    });
  };

  const handlePresetChange = (presetId: string) => {
    setActivePreset(presetId);
    // Apply preset by updating strictness for all rules
    RULE_CATEGORIES.forEach(cat => {
      cat.rules.forEach(ruleId => {
        updatePolicy.mutate({
          ruleId,
          strictnessOverride: presetId === "standard" ? undefined : presetId,
        });
      });
    });
    toast.success(`Applied "${presetId}" preset`);
  };

  return (
    <div className="space-y-4">
      {/* Preset selector */}
      <Card className="border-border/40 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-blue-400" />
            Policy Mode
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {POLICY_PRESETS.map(preset => (
              <button
                key={preset.id}
                onClick={() => handlePresetChange(preset.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  activePreset === preset.id
                    ? "border-blue-500/50 bg-blue-500/10 shadow-md shadow-blue-500/10"
                    : "border-border/30 bg-background/50 hover:border-border/50"
                }`}
              >
                <div className={`text-sm font-bold ${
                  activePreset === preset.id ? "text-blue-400" : "text-foreground"
                }`}>{preset.label}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{preset.description}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Per-category rule toggles */}
      <Card className="border-border/40 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-400" />
            Rule Configuration
            <Badge variant="outline" className="text-[10px] text-muted-foreground ml-auto">
              {RULE_CATEGORIES.reduce((sum, c) => sum + c.rules.length, 0)} rules
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {RULE_CATEGORIES.map(cat => {
            const cfg = CATEGORY_CONFIG[cat.id] || CATEGORY_CONFIG.NONE;
            const CatIcon = cfg.icon;
            const enabledCount = cat.rules.filter(r => !disabledRules.has(r)).length;
            return (
              <div key={cat.id} className="rounded-lg border border-border/30 bg-background/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <CatIcon className={`h-4 w-4 ${cfg.color.split(" ")[0]}`} />
                  <span className={`text-xs font-bold ${cfg.color.split(" ")[0]}`}>{cfg.label}</span>
                  <Badge variant="outline" className={`text-[10px] ${
                    cat.defaultAction === "BLOCK" ? "text-red-400 border-red-500/30" : "text-amber-400 border-amber-500/30"
                  }`}>
                    Default: {cat.defaultAction}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {enabledCount}/{cat.rules.length} active
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cat.rules.map(ruleId => {
                    const isDisabled = disabledRules.has(ruleId);
                    const override = actionOverrides[ruleId];
                    return (
                      <div key={ruleId} className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleRule(ruleId)}
                          className={`px-2 py-1 rounded text-[10px] font-mono transition-all border ${
                            isDisabled
                              ? "text-muted-foreground/50 border-border/20 bg-background/30 line-through"
                              : "text-foreground border-border/40 bg-background/60 hover:border-border/60"
                          }`}
                        >
                          {ruleId}
                        </button>
                        {!isDisabled && (
                          <select
                            value={override || cat.defaultAction}
                            onChange={(e) => handleActionOverride(ruleId, e.target.value)}
                            className="text-[10px] bg-background/60 border border-border/30 rounded px-1 py-0.5 text-muted-foreground"
                          >
                            <option value="BLOCK">BLOCK</option>
                            <option value="WARN">WARN</option>
                            <option value="PASS">PASS</option>
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Info footer */}
      <div className="text-center text-[10px] text-muted-foreground space-y-1">
        <p>Changes take effect immediately on the next scan.</p>
        <p>DB-backed — policy persists across server restarts.</p>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */

export default function EmailFirewall() {// Form state
  const [subject, setSubject] = useState("");
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [strictness, setStrictness] = useState<"strict" | "standard" | "permissive">("standard");
  const [useLLM, setUseLLM] = useState(true);

  // Result state
  const [lastResult, setLastResult] = useState<any>(null);
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState("compose");

  // tRPC
  const scanMutation = trpc.emailFirewall.scan.useMutation({
    onSuccess: (data) => {
      setLastResult(data.result);
      setLastReceipt(data.receipt);
      receiptsQuery.refetch();
      statsQuery.refetch();
      toast.success(`Scan complete: ${data.result.event_type}`);
    },
    onError: (err) => {
      toast.error(`Scan failed: ${err.message}`);
    },
  });

  const receiptsQuery = trpc.emailFirewall.receipts.useQuery(
    { limit: 50 },
    { refetchInterval: false },
  );

  const statsQuery = trpc.emailFirewall.stats.useQuery(undefined, {
    refetchInterval: false,
  });

  const generateSamplesMutation = trpc.emailFirewall.generateSamples.useMutation({
    onSuccess: (data) => {
      receiptsQuery.refetch();
      statsQuery.refetch();
      toast.success(`Generated ${data.generated} sample receipts`);
    },
  });

  // Handlers
  const handleScan = useCallback(() => {
    if (!body.trim()) {
      toast.error("Email body is required");
      return;
    }
    scanMutation.mutate({
      body: body.trim(),
      subject: subject.trim() || undefined,
      to: to.trim() || undefined,
      strictness,
      useLLM,
    });
  }, [body, subject, to, strictness, useLLM, scanMutation]);

  const loadSample = useCallback((sample: typeof SAMPLE_EMAILS[0]) => {
    setSubject(sample.subject);
    setTo(sample.to);
    setBody(sample.body);
    setLastResult(null);
    setLastReceipt(null);
    toast.info(`Loaded: ${sample.label}`);
  }, []);

  const clearForm = useCallback(() => {
    setSubject("");
    setTo("");
    setBody("");
    setLastResult(null);
    setLastReceipt(null);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-card/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/">
            <button className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <div className="flex items-center gap-2.5 flex-1">
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Shield className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground">Email Action Firewall</h1>
              <p className="text-[10px] text-muted-foreground">Policy engine + receipt system</p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/20">
            v1 — Local
          </Badge>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-4 pb-8">
        {/* Privacy notice */}
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 mb-4">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <p className="text-xs text-emerald-400/80">
            <span className="font-medium text-emerald-400">Privacy first.</span>{" "}
            Email content is never stored — only a SHA-256 hash. All scanning runs locally. No data leaves your system.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-5 bg-muted/30">
            <TabsTrigger value="compose" className="text-xs gap-1.5">
              <Send className="h-3.5 w-3.5" /> Compose & Scan
            </TabsTrigger>
            <TabsTrigger value="inbound" className="text-xs gap-1.5">
              <Inbox className="h-3.5 w-3.5" /> Inbound
            </TabsTrigger>
            <TabsTrigger value="receipts" className="text-xs gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Receipts
            </TabsTrigger>
            <TabsTrigger value="policy" className="text-xs gap-1.5">
              <Settings2 className="h-3.5 w-3.5" /> Policy
            </TabsTrigger>
            <TabsTrigger value="demo" className="text-xs gap-1.5">
              <Zap className="h-3.5 w-3.5" /> Quick Demo
            </TabsTrigger>
          </TabsList>

          {/* ─── Tab 1: Compose & Scan ─────────────────────────── */}
          <TabsContent value="compose" className="space-y-4">
            {/* Email form */}
            <Card className="border-border/40 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Send className="h-4 w-4 text-muted-foreground" />
                  Compose Email
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium mb-1 block">To</label>
                    <Input
                      placeholder="recipient@example.com"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="h-9 text-sm bg-background/50"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Subject</label>
                    <Input
                      placeholder="Email subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="h-9 text-sm bg-background/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Body</label>
                  <Textarea
                    placeholder="Type your email here..."
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="min-h-[140px] text-sm bg-background/50 resize-y"
                  />
                </div>

                {/* Controls row */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-muted-foreground font-medium">Strictness:</label>
                    <Select value={strictness} onValueChange={(v) => setStrictness(v as any)}>
                      <SelectTrigger className="h-8 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="strict">Strict</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="permissive">Permissive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <button
                    onClick={() => setUseLLM(!useLLM)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                      useLLM
                        ? "text-violet-400 bg-violet-500/10 border-violet-500/30"
                        : "text-muted-foreground bg-muted/20 border-border/30"
                    }`}
                  >
                    <Brain className="h-3.5 w-3.5" />
                    LLM Scan {useLLM ? "ON" : "OFF"}
                  </button>

                  <div className="flex-1" />

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearForm}
                    className="text-xs text-muted-foreground"
                  >
                    Clear
                  </Button>

                  <Button
                    onClick={handleScan}
                    disabled={scanMutation.isPending || !body.trim()}
                    className="bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 text-xs gap-1.5"
                  >
                    {scanMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Shield className="h-3.5 w-3.5" />
                    )}
                    Scan Email
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Scan result */}
            {lastResult && lastReceipt && (
              <ScanResultCard result={lastResult} receipt={lastReceipt} />
            )}

            {/* Stats */}
            {statsQuery.data && <StatsBar stats={statsQuery.data} />}
          </TabsContent>
          {/* ─── Tab 2: Inbound Messages ───────────────────── */}
          <TabsContent value="inbound" className="space-y-4">
            <InboundMessagesPanel />
          </TabsContent>

          {/* ─── Tab 3: Receipts ───────────────────────────── */}
          <TabsContent value="receipts" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-foreground">Decision Receipts</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => receiptsQuery.refetch()}
                className="text-xs text-muted-foreground gap-1"
              >
                <Loader2 className={`h-3 w-3 ${receiptsQuery.isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {statsQuery.data && <StatsBar stats={statsQuery.data} />}

            {selectedReceipt ? (
              <div className="space-y-3">
                <button
                  onClick={() => setSelectedReceipt(null)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to list
                </button>
                <ScanResultCard
                  result={{
                    event_type: selectedReceipt.event_type,
                    matched_rules: [{
                      rule_id: selectedReceipt.policy?.rule_id,
                      category: selectedReceipt.policy?.category,
                      confidence: selectedReceipt.policy?.confidence,
                      action: selectedReceipt.event_type === "PASS" ? "PASS" : selectedReceipt.event_type === "WARN" ? "WARN" : "BLOCK",
                      reason: selectedReceipt.decision?.reason,
                    }].filter((r: any) => r.category !== "NONE"),
                    confidence: selectedReceipt.policy?.confidence || "low",
                    summary: selectedReceipt.decision?.reason || "",
                  }}
                  receipt={selectedReceipt}
                />
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                {receiptsQuery.data && receiptsQuery.data.length > 0 ? (
                  <div className="space-y-1">
                    {receiptsQuery.data.map((r: any) => (
                      <ReceiptRow key={r.receipt_id} receipt={r} onSelect={setSelectedReceipt} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <FileText className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No receipts yet</p>
                    <p className="text-xs mt-1">Scan an email to generate your first receipt</p>
                  </div>
                )}
              </ScrollArea>
            )}
          </TabsContent>

          {/* ─── Tab: Policy Configuration ────────────────────── */}
          <TabsContent value="policy" className="space-y-4">
            <PolicyConfigPanel />
          </TabsContent>

          {/* ─── Tab 3: Quick Demo ─────────────────────────────── */}
          <TabsContent value="demo" className="space-y-4">
            <Card className="border-border/40 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-400" />
                  Quick Demo — Sample Emails
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">
                  Click any sample below to load it into the composer. Then switch to "Compose & Scan" and hit Scan.
                </p>
                {SAMPLE_EMAILS.map((sample, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      loadSample(sample);
                      setActiveTab("compose");
                    }}
                    className="w-full text-left p-3 rounded-lg border border-border/30 hover:border-border/60 hover:bg-muted/20 transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px]">{i + 1}</Badge>
                      <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {sample.label}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">To:</span> {sample.to} — <span className="font-medium">Subject:</span> {sample.subject}
                    </div>
                    <div className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">
                      {sample.body}
                    </div>
                  </button>
                ))}

                <Separator className="my-3" />

                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateSamplesMutation.mutate()}
                    disabled={generateSamplesMutation.isPending}
                    className="text-xs gap-1.5"
                  >
                    {generateSamplesMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <BarChart3 className="h-3 w-3" />
                    )}
                    Generate Sample Receipts
                  </Button>
                  <span className="text-[10px] text-muted-foreground">
                    Pre-populates 4 receipts (BLOCK, WARN, PASS, OVERRIDE) for the receipt viewer
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* How it works */}
            <Card className="border-border/40 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Brain className="h-4 w-4 text-violet-400" />
                  How It Works
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    {
                      step: "1",
                      title: "Compose",
                      desc: "Write or paste an email. The firewall scans the full text (subject + body).",
                      color: "text-blue-400",
                    },
                    {
                      step: "2",
                      title: "Policy Scan",
                      desc: "Rule-based patterns detect inducement, threats, PII, compliance violations. Optional LLM adds nuance.",
                      color: "text-amber-400",
                    },
                    {
                      step: "3",
                      title: "Decision",
                      desc: "BLOCKED (cannot send), WARNING (review required), or PASSED (cleared for sending).",
                      color: "text-emerald-400",
                    },
                    {
                      step: "4",
                      title: "Receipt",
                      desc: "Every decision generates a JSON receipt: rule triggered, action taken, timestamp, SHA-256 hash of email.",
                      color: "text-violet-400",
                    },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${item.color} bg-muted/30 border border-border/30 shrink-0`}>
                        {item.step}
                      </div>
                      <div>
                        <div className={`text-sm font-medium ${item.color}`}>{item.title}</div>
                        <div className="text-xs text-muted-foreground">{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator className="my-4" />

                <div className="text-xs text-muted-foreground space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Hash className="h-3.5 w-3.5" />
                    <span><span className="font-medium text-foreground">6 risk categories:</span> Inducement, Threat, PII, Compliance, Confidential, Inappropriate</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5" />
                    <span><span className="font-medium text-foreground">3 strictness modes:</span> Strict (WARNs become BLOCKs), Standard, Permissive (WARNs skipped)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Brain className="h-3.5 w-3.5" />
                    <span><span className="font-medium text-foreground">LLM enhancement:</span> Optional AI scan for subtle/contextual violations (falls back to rules if unavailable)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
