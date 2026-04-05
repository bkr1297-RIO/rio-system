import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Streamdown } from "streamdown";
import {
  Send, Loader2, User, Sparkles, Clock,
  ChevronRight, MessageSquare, X, History,
  Mail, Search, FileText, Zap, Shield,
  CheckCircle2, XCircle, AlertTriangle, FileEdit,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import { ONE_LOGO_URL } from "@/lib/brand";

// ─── Types ─────────────────────────────────────────────────────

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  metadata?: {
    nodeUsed?: string;
    mode?: string;
    intentsProposed?: number;
    tokensUsed?: number;
  };
};

type ProposedIntent = {
  intentId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  riskTier: string;
  reasoning: string;
  breakAnalysis?: string;
  confidence: number;
  status: string;
};

// ─── Tool Labels ──────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  send_email: "Send Email",
  send_sms: "Send Text",
  search_web: "Search the Web",
  read_file: "Read a File",
  write_file: "Write a File",
  delete_file: "Delete a File",
  execute_code: "Run Code",
  transfer_funds: "Transfer Funds",
  draft_email: "Draft an Email",
  echo: "Test Action",
};

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  send_email: Mail,
  send_sms: MessageSquare,
  search_web: Search,
  read_file: FileText,
  write_file: FileEdit,
  delete_file: XCircle,
  execute_code: Zap,
  transfer_funds: Zap,
  draft_email: FileText,
  echo: Zap,
};

const RISK_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  LOW: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  MEDIUM: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  HIGH: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
};

// ─── Human-readable args ─────────────────────────────────────

function ArgsPreview({ toolName, args }: { toolName: string; args: Record<string, unknown> }) {
  if (toolName === "send_email" || toolName === "send_sms" || toolName === "draft_email") {
    return (
      <div className="space-y-1.5 text-sm">
        {args.to ? <div><span className="text-muted-foreground">To:</span> <span className="font-medium">{String(args.to)}</span></div> : null}
        {args.subject ? <div><span className="text-muted-foreground">Subject:</span> <span className="font-medium">{String(args.subject)}</span></div> : null}
        {(args.body || args.message) ? (
          <div className="mt-1 text-muted-foreground text-xs bg-secondary/50 rounded-lg p-2.5 whitespace-pre-wrap line-clamp-3">
            {String(args.body || args.message)}
          </div>
        ) : null}
      </div>
    );
  }
  if (toolName === "search_web") {
    return <div className="text-sm"><span className="text-muted-foreground">Searching:</span> <span className="font-medium">{String(args.query || args.q || "")}</span></div>;
  }
  const entries = Object.entries(args).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1 text-sm">
      {entries.slice(0, 3).map(([k, v]) => (
        <div key={k}><span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}:</span> <span className="font-medium">{String(v)}</span></div>
      ))}
      {entries.length > 3 && <div className="text-xs text-muted-foreground">+{entries.length - 3} more</div>}
    </div>
  );
}

// ─── Proposal Card (Chat = proposal, Approvals = authority) ──

function ProposalCard({ intent, onStatusChange }: {
  intent: ProposedIntent;
  onStatusChange: () => void;
}) {
  const [, navigate] = useLocation();
  const toolLabel = TOOL_LABELS[intent.toolName] ?? intent.toolName;
  const ToolIcon = TOOL_ICONS[intent.toolName] ?? Zap;
  const risk = RISK_COLORS[intent.riskTier] ?? RISK_COLORS.LOW;
  const isPending = intent.status === "PENDING_APPROVAL";
  const isApproved = intent.status === "APPROVED";
  const isExecuted = intent.status === "EXECUTED";
  const isRejected = intent.status === "REJECTED";
  const isFailed = intent.status === "FAILED";

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden my-3 transition-all",
      isPending && "border-amber-500/30 bg-amber-500/5",
      isApproved && "border-blue-500/30 bg-blue-500/5",
      isExecuted && "border-emerald-500/30 bg-emerald-500/5",
      isRejected && "border-border/30 bg-secondary/20 opacity-60",
      isFailed && "border-red-500/30 bg-red-500/5",
    )}>
      {/* Header */}
      <div className="px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-3">
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", risk.bg)}>
            {isExecuted ? (
              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
            ) : isPending ? (
              <Clock className="h-4.5 w-4.5 text-amber-400" />
            ) : (
              <ToolIcon className="h-4.5 w-4.5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{toolLabel}</span>
              <Badge variant="outline" className={cn("text-[10px] px-1.5", risk.text, risk.border)}>
                {intent.riskTier}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isPending && "This action requires your approval"}
              {isApproved && "Approved — ready to execute"}
              {isExecuted && "Completed successfully"}
              {isRejected && "You denied this action"}
              {isFailed && "This action failed"}
            </p>
          </div>
        </div>
      </div>

      {/* What it will do */}
      <div className="px-4 pb-3">
        {intent.reasoning && (
          <p className="text-sm text-muted-foreground mb-2 italic">"{intent.reasoning}"</p>
        )}
        <ArgsPreview toolName={intent.toolName} args={intent.toolArgs} />
      </div>

      {/* Status-specific footer */}
      {isPending && (
        <div className="px-4 pb-3.5">
          <button
            onClick={() => navigate("/approvals")}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors text-sm font-medium"
          >
            <Shield className="h-4 w-4" />
            Review in Approvals
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {isApproved && (
        <div className="px-4 pb-3.5">
          <button
            onClick={() => navigate("/approvals")}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors text-sm font-medium"
          >
            <Zap className="h-4 w-4" />
            Execute in Approvals
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {isExecuted && (
        <div className="mx-4 mb-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-400">Done</span>
          </div>
          <Link href={`/intent/${intent.intentId}`}>
            <span className="text-xs text-primary hover:underline mt-1.5 inline-block">View receipt →</span>
          </Link>
        </div>
      )}

      {isFailed && (
        <div className="mx-4 mb-3 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-sm font-medium text-red-400">Failed</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            This action couldn't be completed. You can try again or ask Bondi for help.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Pending Approvals Banner ──────────────────────────────────

function PendingApprovalsBanner() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const statusQuery = trpc.proxy.status.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 10000,
  });

  const pendingCount = useMemo(() => {
    if (!statusQuery.data?.recentIntents) return 0;
    return statusQuery.data.recentIntents.filter(i => i.status === "PENDING_APPROVAL").length;
  }, [statusQuery.data?.recentIntents]);

  if (pendingCount === 0) return null;

  return (
    <button
      onClick={() => navigate("/approvals")}
      className="w-full max-w-md mx-auto flex items-center gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-colors group"
    >
      <div className="h-10 w-10 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
        <Shield className="h-5 w-5 text-amber-400" />
      </div>
      <div className="flex-1 text-left">
        <p className="text-sm font-medium text-amber-400">
          {pendingCount} action{pendingCount > 1 ? "s" : ""} need{pendingCount === 1 ? "s" : ""} your approval
        </p>
        <p className="text-xs text-muted-foreground">Tap to review in Approvals</p>
      </div>
      <ChevronRight className="h-5 w-5 text-amber-400/50 group-hover:text-amber-400 transition-colors shrink-0" />
    </button>
  );
}

// ─── Conversation History Drawer ──────────────────────────────

function ConversationDrawer({ conversations, activeId, onSelect, onNew, isOpen, onClose }: {
  conversations: Array<{ conversationId: string; title: string | null; mode: string; nodeId: string; createdAt: Date | null; status: string }>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed left-0 top-0 bottom-0 w-72 bg-card border-r border-border/40 shadow-xl z-50 flex flex-col animate-in slide-in-from-left duration-200">
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          <h2 className="font-semibold text-sm">Conversations</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-3">
          <Button onClick={() => { onNew(); onClose(); }} variant="outline" size="sm" className="w-full gap-1.5 text-xs">
            <MessageSquare className="h-3.5 w-3.5" />
            New Conversation
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="px-3 pb-3 space-y-1">
            {conversations.map(conv => (
              <button
                key={conv.conversationId}
                onClick={() => { onSelect(conv.conversationId); onClose(); }}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors",
                  conv.conversationId === activeId
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
              >
                <p className="truncate font-medium text-xs">{conv.title ?? "Untitled"}</p>
                {conv.createdAt && (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {new Date(conv.createdAt).toLocaleDateString()}
                  </p>
                )}
              </button>
            ))}
            {conversations.length === 0 && (
              <p className="text-xs text-muted-foreground/50 text-center py-8">
                No conversations yet
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}

// ─── Main Bondi Page ──────────────────────────────────────────

export default function Bondi() {
  const { user, isAuthenticated } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [selectedNodeId] = useState("gemini-flash");
  const [currentMode] = useState<"REFLECT" | "COMPUTE" | "DRAFT" | "VERIFY" | "EXECUTE" | "ROBOT">("REFLECT");
  const [pendingIntents, setPendingIntents] = useState<ProposedIntent[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Queries
  const conversationsQuery = trpc.bondi.listConversations.useQuery(undefined, { enabled: isAuthenticated });
  const statusQuery = trpc.proxy.status.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 10000,
  });

  // Chat mutation
  const chatMutation = trpc.bondi.chat.useMutation({
    onSuccess: (data) => {
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.message,
        timestamp: Date.now(),
        metadata: {
          nodeUsed: data.nodeUsed,
          mode: data.mode,
          intentsProposed: data.intents.length,
          tokensUsed: data.tokensUsed,
        },
      };
      setMessages(prev => [...prev, assistantMsg]);
      setActiveConversationId(data.conversationId);

      if (data.intents.length > 0) {
        setPendingIntents(prev => [...prev, ...data.intents]);
      }

      conversationsQuery.refetch();
      statusQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Something went wrong: ${error.message}`);
      setMessages(prev => prev.slice(0, -1));
    },
  });

  // Load conversation when selected
  const activeConvQuery = trpc.bondi.getConversation.useQuery(
    { conversationId: activeConversationId! },
    { enabled: !!activeConversationId },
  );

  useEffect(() => {
    if (activeConvQuery.data) {
      const convMessages = (activeConvQuery.data.messages as ChatMessage[]) ?? [];
      setMessages(convMessages.filter(m => m.role === "user" || m.role === "assistant"));
    }
  }, [activeConvQuery.data]);

  // Auto-scroll
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement;
    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
      });
    }
  }, [messages, chatMutation.isPending, pendingIntents]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");

    chatMutation.mutate({
      message: trimmed,
      conversationId: activeConversationId ?? undefined,
      nodeId: selectedNodeId,
      mode: currentMode,
    });

    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setPendingIntents([]);
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setPendingIntents([]);
  };

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const greeting = getGreeting();

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] gap-6">
        <img src={ONE_LOGO_URL} alt="ONE" className="h-20 w-20 object-contain drop-shadow-lg" />
        <button
          onClick={() => { window.location.href = getLoginUrl(); }}
          className="px-8 py-3 rounded-full bg-primary text-primary-foreground font-medium text-sm shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-0.5 cursor-pointer"
        >
          Sign in to ONE
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] md:h-[calc(100vh-3.5rem)]">
      {/* Conversation drawer */}
      <ConversationDrawer
        conversations={(conversationsQuery.data ?? []).map(c => ({
          conversationId: c.conversationId,
          title: c.title,
          mode: c.mode,
          nodeId: c.nodeId,
          createdAt: c.createdAt,
          status: c.status,
        }))}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Subtle top bar with history toggle */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30">
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-secondary/50"
        >
          <History className="h-4 w-4" />
          <span className="hidden sm:inline">History</span>
        </button>
        {activeConversationId && (
          <button
            onClick={handleNewConversation}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-secondary/50"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            New
          </button>
        )}
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-hidden">
        {messages.length === 0 ? (
          /* ─── Empty state: warm greeting + pending approvals ─── */
          <ScrollArea className="h-full">
            <div className="flex flex-col items-center gap-6 p-6 pt-8">
              {/* Pending approvals banner — right at the top */}
              <PendingApprovalsBanner />

              <div className="flex flex-col items-center gap-4 text-center max-w-md">
                <img
                  src={ONE_LOGO_URL}
                  alt="ONE"
                  className="h-20 w-20 object-contain drop-shadow-lg"
                />
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">
                    {greeting}, {firstName}
                  </h2>
                  <p className="text-muted-foreground text-sm mt-1.5 leading-relaxed">
                    I'm Bondi, your chief of staff. Tell me what you need
                    and I'll take care of it — with your approval every step of the way.
                  </p>
                </div>
              </div>

              {/* Capability suggestions */}
              <div className="grid grid-cols-2 gap-3 max-w-sm w-full">
                {[
                  { icon: Mail, label: "Send an email", prompt: "Help me send an email" },
                  { icon: MessageSquare, label: "Send a text", prompt: "Help me send a text message" },
                  { icon: Search, label: "Research something", prompt: "Search the web for" },
                  { icon: FileText, label: "Draft a document", prompt: "Help me draft a" },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(item.prompt);
                      textareaRef.current?.focus();
                    }}
                    className="flex items-center gap-3 p-3.5 rounded-xl border border-border/40 bg-card/50 hover:bg-card hover:border-border/60 transition-all text-left group"
                  >
                    <item.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{item.label}</span>
                  </button>
                ))}
              </div>

              <p className="text-[11px] text-muted-foreground/40 flex items-center gap-1.5">
                <Shield className="h-3 w-3" />
                Every action is governed and recorded
              </p>
            </div>
          </ScrollArea>
        ) : (
          /* ─── Chat messages with proposal cards ─── */
          <ScrollArea className="h-full">
            <div className="flex flex-col space-y-4 p-4 max-w-2xl mx-auto">
              {messages.map((msg, idx) => (
                <div key={idx}>
                  <div className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}>
                    {msg.role === "assistant" && (
                      <div className="h-8 w-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-3",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-secondary/60 text-foreground rounded-bl-md"
                    )}>
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm prose-invert max-w-none text-foreground">
                          <Streamdown>{msg.content}</Streamdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="h-8 w-8 shrink-0 mt-1 rounded-full bg-secondary flex items-center justify-center">
                        <User className="h-4 w-4 text-secondary-foreground" />
                      </div>
                    )}
                  </div>

                  {msg.role === "assistant" && (
                    <div className="ml-11 mt-1 flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground/40">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {/* Proposal cards — shows what Bondi wants to do, links to Approvals */}
              {pendingIntents.map((intent, idx) => (
                <ProposalCard
                  key={intent.intentId ?? idx}
                  intent={intent}
                  onStatusChange={() => statusQuery.refetch()}
                />
              ))}

              {/* Loading indicator */}
              {chatMutation.isPending && (
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="rounded-2xl rounded-bl-md bg-secondary/60 px-4 py-3 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border/30 bg-card/50 p-4">
        <div className="max-w-2xl mx-auto flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Bondi anything..."
            className="flex-1 max-h-32 resize-none min-h-10 rounded-xl bg-secondary/50 border-border/40 focus:border-primary/40 text-sm"
            rows={1}
          />
          <Button
            onClick={handleSend}
            size="icon"
            disabled={!input.trim() || chatMutation.isPending}
            className="shrink-0 h-10 w-10 rounded-xl"
          >
            {chatMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
